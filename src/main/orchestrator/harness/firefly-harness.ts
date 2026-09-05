import type {
  AgentConfig,
  AgentRunInput,
  AgentRunResult,
  AgentRunStatus,
} from "../../../shared/agent-types";
import { DEFAULT_AGENT_CONFIG } from "../../../shared/agent-types";
import type { ChatMessage, ChatCompletionResponse } from "../../../shared/chat-types";
import type { IFireflyLlmProvider } from "../../../shared/provider-types";
import type { IAgentCore } from "../../../shared/agent-core";
import { LocalFireflyProvider } from "../../llm/providers/local-firefly-provider";
import { FireflyToolRegistry } from "../../tools/tool-registry";
import { ContextManager } from "../context/context-manager";
import { ToolExecutionEngine } from "../../runtime/execution/tool-execution-engine";
import type { ToolPolicyConfig } from "../../runtime/execution/tool-policy";
import { AgentSession } from "../agent-session";
import { AgentEventBus } from "../agent-events";
import { CheckpointManager } from "../recovery/checkpoint-manager";
import { RecoveryManager } from "../recovery/recovery-manager";
import { ResumeProtocol } from "../recovery/resume-protocol";
import type { RunExecutionState } from "../recovery/execution-state";
import { BoundedPlanner } from "../planning/bounded-planner";
import { formatPlanContext } from "../planning/plan-lifecycle";
import type { Plan, PlannerConfig } from "../planning/plan-types";
import { requestHarnessCompletion } from "./harness-llm";
import { executeToolRound } from "./tool-round";

export interface FireflyHarnessOptions {
  provider?: IFireflyLlmProvider;
  toolRegistry: FireflyToolRegistry;
  config?: Partial<AgentConfig>;
  eventBus?: AgentEventBus;
  contextManager?: ContextManager;
  toolPolicy?: Partial<ToolPolicyConfig>;
  executionEngine?: ToolExecutionEngine;
  checkpointManager?: CheckpointManager;
  recoveryManager?: RecoveryManager;
  planner?: BoundedPlanner;
  plannerConfig?: Partial<PlannerConfig>;
}

/**
 * FireflyHarness is the sole Agent execution loop.
 *
 * It coordinates the existing Session, Context, Planning, Recovery,
 * Checkpoint, Compaction, and ToolExecutionEngine owners without reimplementing
 * their policies or domain behavior.
 */
export class FireflyHarness implements IAgentCore {
  private provider: IFireflyLlmProvider;
  private readonly toolRegistry: FireflyToolRegistry;
  private readonly config: AgentConfig;
  private readonly eventBus: AgentEventBus;
  private readonly contextManager: ContextManager;
  private readonly executionEngine: ToolExecutionEngine;
  private readonly checkpointManager: CheckpointManager;
  private readonly recoveryManager: RecoveryManager;
  private readonly planner: BoundedPlanner;
  private readonly activeRuns = new Map<string, AbortController>();

  constructor(options: FireflyHarnessOptions) {
    this.provider = options.provider || new LocalFireflyProvider();
    this.toolRegistry = options.toolRegistry;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...(options.config || {}) };
    this.eventBus = options.eventBus || new AgentEventBus();
    this.contextManager = options.contextManager || new ContextManager();
    this.executionEngine =
      options.executionEngine ||
      new ToolExecutionEngine(this.toolRegistry, options.toolPolicy, this.eventBus);
    this.checkpointManager = options.checkpointManager || new CheckpointManager();
    this.recoveryManager = options.recoveryManager || new RecoveryManager();
    this.planner = options.planner || new BoundedPlanner(options.plannerConfig);
  }

  getContextManager(): ContextManager {
    return this.contextManager;
  }

  getExecutionEngine(): ToolExecutionEngine {
    return this.executionEngine;
  }

  getCheckpointManager(): CheckpointManager {
    return this.checkpointManager;
  }

  getRecoveryManager(): RecoveryManager {
    return this.recoveryManager;
  }

  getPlanner(): BoundedPlanner {
    return this.planner;
  }

  getEventBus(): AgentEventBus {
    return this.eventBus;
  }

  setProvider(provider: IFireflyLlmProvider): void {
    this.provider = provider;
  }

  getProvider(): IFireflyLlmProvider {
    return this.provider;
  }

  async resume(checkpointId: string, signal?: AbortSignal): Promise<AgentRunResult> {
    const checkpoint = await this.checkpointManager.restoreCheckpoint(checkpointId);
    if (!checkpoint) {
      throw new Error("Checkpoint " + checkpointId + " not found.");
    }

    const evaluation = ResumeProtocol.evaluate(checkpoint);
    if (!evaluation.canResume) {
      throw new Error("Cannot resume checkpoint " + checkpointId + ": " + evaluation.reason);
    }

    this.eventBus.emit({
      type: "run:resumed",
      runId: checkpoint.runId,
      fromCheckpointId: checkpointId,
      resumeStep: evaluation.resumeStep,
      timestamp: Date.now(),
    });

    return this.run({
      runId: checkpoint.runId,
      conversationId: checkpoint.sessionId,
      userPrompt: "",
      history: evaluation.sanitizedMessages,
      planMode: !!evaluation.restoredPlan,
      signal,
    });
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const startTime = Date.now();
    const runId =
      input.runId ||
      "run-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    const conversationId = input.conversationId;

    const runAbortController = new AbortController();
    if (input.signal) {
      if (input.signal.aborted) runAbortController.abort();
      else input.signal.addEventListener("abort", () => runAbortController.abort(), { once: true });
    }
    this.activeRuns.set(runId, runAbortController);

    let timedOut = false;
    let runTimeoutId: NodeJS.Timeout | null = null;
    if (this.config.totalTimeoutMs > 0) {
      runTimeoutId = setTimeout(() => {
        timedOut = true;
        runAbortController.abort();
      }, this.config.totalTimeoutMs);
    }

    const isPlanningMode = this.planner.shouldPlan(
      input.userPrompt,
      this.toolRegistry.getToolSchemas().length,
      input.planMode,
    );

    let plan: Plan | undefined;
    let planContextStr = "";

    if (isPlanningMode && input.userPrompt) {
      plan = this.planner.createPlan(runId, input.userPrompt, input.customSteps);
      planContextStr = formatPlanContext(plan);
      this.eventBus.emit({
        type: "plan:created",
        runId,
        planId: plan.planId,
        goal: plan.goal,
        stepsCount: plan.steps.length,
        timestamp: Date.now(),
      });
      this.eventBus.emit({
        type: "plan:started",
        runId,
        planId: plan.planId,
        timestamp: Date.now(),
      });
    }

    const initialMessages = await this.contextManager.buildInitialMessagesWithSlots({
      userPrompt: input.userPrompt,
      history: input.history,
      characterState: input.characterState,
      memoryContext: input.memoryContext,
      planContext: planContextStr,
      systemPromptOverride: input.systemPromptOverride,
      toolSchemas: this.toolRegistry.getToolSchemas(),
    });

    const session = new AgentSession({ initialMessages });
    const executionState: RunExecutionState = {
      runId,
      sessionId: conversationId || "session-" + runId,
      step: 0,
      runState: "initializing",
      stepState: "pending",
      activeToolCalls: [],
      recoveryAttempts: 0,
      startedAt: startTime,
      updatedAt: startTime,
      plan,
    };

    executionState.runState = "running";
    await this.checkpointManager.createCheckpoint(
      executionState,
      session.getMessages(),
      "run_initialized",
    );

    this.eventBus.emit({
      type: "agent:started",
      runId,
      prompt: input.userPrompt,
      timestamp: startTime,
    });

    let status: AgentRunStatus = "running";
    let stepCount = 0;
    let toolCallsCount = 0;
    let errorMsg: string | undefined;

    try {
      while (stepCount < this.config.maxRounds) {
        if (runAbortController.signal.aborted) {
          status = timedOut ? "timeout" : "cancelled";
          if (timedOut) {
            errorMsg = "Run timed out after " + this.config.totalTimeoutMs + "ms";
          }
          break;
        }

        stepCount++;
        executionState.step = stepCount;
        executionState.stepState = "waiting_llm";
        executionState.updatedAt = Date.now();

        if (plan && plan.status === "running") {
          const currentPlanStep = plan.steps[plan.currentStepIndex];
          if (currentPlanStep) {
            this.eventBus.emit({
              type: "plan:step-start",
              runId,
              planId: plan.planId,
              stepIndex: plan.currentStepIndex,
              description: currentPlanStep.description,
              timestamp: Date.now(),
            });
          }
        }

        await this.checkpointManager.createCheckpoint(
          executionState,
          session.getMessages(),
          "step_start",
        );

        this.eventBus.emit({
          type: "agent:step-start",
          runId,
          step: stepCount,
          timestamp: Date.now(),
        });

        const toolSchemas = this.toolRegistry.getToolSchemas();

        this.eventBus.emit({
          type: "agent:llm-request",
          runId,
          step: stepCount,
          messageCount: session.size(),
          timestamp: Date.now(),
        });

        let roundResponse: ChatCompletionResponse;
        while (true) {
          try {
            roundResponse = await requestHarnessCompletion(
              this.provider,
              {
                messages: session.getMessages(),
                tools: toolSchemas.length > 0 ? toolSchemas : undefined,
              },
              runAbortController.signal,
              (delta) => {
                this.eventBus.emit({
                  type: "agent:progress",
                  runId,
                  step: stepCount,
                  delta,
                  timestamp: Date.now(),
                });
              },
            );
            break;
          } catch (providerErr: unknown) {
            if (runAbortController.signal.aborted) {
              throw providerErr;
            }

            executionState.recoveryAttempts++;
            const decision = this.recoveryManager.evaluate(
              providerErr,
              executionState.recoveryAttempts,
            );

            this.eventBus.emit({
              type: "recovery:started",
              runId,
              step: stepCount,
              errorType: decision.classifiedError.type,
              attempt: executionState.recoveryAttempts,
              timestamp: Date.now(),
            });
            await this.checkpointManager.createCheckpoint(
              executionState,
              session.getMessages(),
              "recovery_started",
            );

            if (decision.action === "fail_run") {
              this.eventBus.emit({
                type: "recovery:failed",
                runId,
                step: stepCount,
                reason: decision.reason,
                timestamp: Date.now(),
              });
              throw providerErr;
            }

            if (decision.action === "retry_with_compaction") {
              executionState.runState = "compacting";
              const projected = this.contextManager.project({
                userPrompt: input.userPrompt,
                history: session.getMessages(),
                forceCompactionStrategy: "emergency",
              });
              session.clear();
              for (const message of projected.messages) {
                session.append(message);
              }
              executionState.runState = "running";
              await this.checkpointManager.createCheckpoint(
                executionState,
                session.getMessages(),
                "compaction_completed",
              );
              this.eventBus.emit({
                type: "recovery:completed",
                runId,
                step: stepCount,
                action: "retry_with_compaction",
                timestamp: Date.now(),
              });
              continue;
            }

            if (decision.action === "retry_with_backoff" || decision.action === "retry_immediate") {
              if (decision.delayMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, decision.delayMs));
              }
              this.eventBus.emit({
                type: "recovery:completed",
                runId,
                step: stepCount,
                action: decision.action,
                timestamp: Date.now(),
              });
              continue;
            }

            throw providerErr;
          }
        }

        if (runAbortController.signal.aborted) {
          status = timedOut ? "timeout" : "cancelled";
          if (timedOut) {
            errorMsg = "Run timed out after " + this.config.totalTimeoutMs + "ms";
          }
          break;
        }

        const asstMessage = roundResponse.message;
        await this.checkpointManager.createCheckpoint(
          executionState,
          session.getMessages(),
          "llm_completed",
        );

        let roundObservation = "";
        let roundHasError = false;

        if (asstMessage.toolCalls && asstMessage.toolCalls.length > 0) {
          executionState.stepState = "waiting_tool";
          const asstEntry: ChatMessage = {
            id: "asst-" + Date.now() + "-" + stepCount,
            role: "assistant",
            content: asstMessage.content || "",
            toolCalls: asstMessage.toolCalls,
            timestamp: Date.now(),
          };
          session.append(asstEntry);

          this.eventBus.emit({
            type: "agent:assistant-message",
            runId,
            step: stepCount,
            content: asstMessage.content || "",
            toolCalls: asstMessage.toolCalls,
            timestamp: Date.now(),
          });

          executionState.activeToolCalls = asstMessage.toolCalls.map((call) => ({
            toolCallId: call.id,
            name: call.name,
            arguments: call.arguments,
            status: "running" as const,
            sideEffectState: "started" as const,
          }));

          const toolCallsBeforeRound = toolCallsCount;
          const toolObservations = await executeToolRound(asstMessage.toolCalls, {
            executionEngine: this.executionEngine,
            runId,
            step: stepCount,
            userQuery: input.userPrompt,
            conversationId,
            signal: runAbortController.signal,
            toolCallsCount: toolCallsBeforeRound,
            maxToolCallsPerRun:
              this.executionEngine.getPolicyConfig().maxToolCallsPerRun || 25,
            onCallStart: (call) => {
              toolCallsCount++;
              this.eventBus.emit({
                type: "agent:tool-call",
                runId,
                step: stepCount,
                toolCallId: call.id,
                toolName: call.name,
                args: call.arguments,
                timestamp: Date.now(),
              });
            },
          });

          for (const observation of toolObservations) {
            const { call, result } = observation;
            roundObservation += "[" + call.name + "]: " + result.output + "\n";
            if (result.isError) roundHasError = true;

            const activeToolCall = executionState.activeToolCalls.find(
              (active) => active.toolCallId === call.id,
            );
            if (activeToolCall) {
              activeToolCall.status = result.isError ? "failed" : "succeeded";
              activeToolCall.sideEffectState = result.isError ? "failed" : "completed";
              activeToolCall.output = result.output;
            }

            this.eventBus.emit({
              type: "agent:tool-result",
              runId,
              step: stepCount,
              toolCallId: result.toolCallId,
              toolName: result.name,
              output: result.output,
              isError: !!result.isError,
              timestamp: Date.now(),
            });

            session.append({
              id: "tool-" + Date.now() + "-" + call.id,
              role: "tool",
              content: result.output,
              toolCallId: call.id,
              timestamp: Date.now(),
            });
          }

          await this.checkpointManager.createCheckpoint(
            executionState,
            session.getMessages(),
            "tool_round_completed",
          );

          if (plan && plan.status === "running") {
            const currentPlanStepIndex = plan.currentStepIndex;
            const advance = this.planner.advanceStep(plan, roundObservation, roundHasError);
            this.eventBus.emit({
              type: "plan:verification",
              runId,
              planId: plan.planId,
              stepIndex: currentPlanStepIndex,
              result: advance.verification.status,
              timestamp: Date.now(),
            });

            if (advance.action === "next" || advance.action === "complete") {
              this.eventBus.emit({
                type: "plan:step-completed",
                runId,
                planId: plan.planId,
                stepIndex: currentPlanStepIndex,
                observation: roundObservation,
                timestamp: Date.now(),
              });
            }
            if (advance.action === "complete") {
              this.eventBus.emit({
                type: "plan:completed",
                runId,
                planId: plan.planId,
                stepsCount: plan.steps.length,
                timestamp: Date.now(),
              });
            } else if (advance.action === "fail") {
              this.eventBus.emit({
                type: "plan:step-failed",
                runId,
                planId: plan.planId,
                stepIndex: currentPlanStepIndex,
                reason: advance.verification.reason || "Step failed",
                timestamp: Date.now(),
              });
              this.eventBus.emit({
                type: "plan:failed",
                runId,
                planId: plan.planId,
                reason: advance.verification.reason || "Step verification failure",
                timestamp: Date.now(),
              });
            }
          }
        } else {
          const finalContent = asstMessage.content || "";
          session.append({
            id: "asst-" + Date.now() + "-" + stepCount,
            role: "assistant",
            content: finalContent,
            timestamp: Date.now(),
          });

          if (plan && plan.status === "running") {
            const currentPlanStepIndex = plan.currentStepIndex;
            const advance = this.planner.advanceStep(plan, finalContent, false);
            this.eventBus.emit({
              type: "plan:verification",
              runId,
              planId: plan.planId,
              stepIndex: currentPlanStepIndex,
              result: advance.verification.status,
              timestamp: Date.now(),
            });
            this.eventBus.emit({
              type: "plan:step-completed",
              runId,
              planId: plan.planId,
              stepIndex: currentPlanStepIndex,
              observation: finalContent,
              timestamp: Date.now(),
            });
            this.eventBus.emit({
              type: "plan:completed",
              runId,
              planId: plan.planId,
              stepsCount: plan.steps.length,
              timestamp: Date.now(),
            });
          }

          this.eventBus.emit({
            type: "agent:assistant-message",
            runId,
            step: stepCount,
            content: finalContent,
            timestamp: Date.now(),
          });
          this.eventBus.emit({
            type: "agent:final-answer",
            runId,
            content: finalContent,
            timestamp: Date.now(),
          });
          executionState.stepState = "completed";
          status = "completed";
          break;
        }
      }

      if (stepCount >= this.config.maxRounds && status === "running") {
        status = "completed";
      }
    } catch (err: unknown) {
      if (runAbortController.signal.aborted) {
        status = timedOut ? "timeout" : "cancelled";
        if (timedOut) {
          errorMsg = "Run timed out after " + this.config.totalTimeoutMs + "ms";
        }
      } else {
        status = "error";
        const message = err instanceof Error ? err.message : String(err);
        errorMsg = message;
        this.eventBus.emit({
          type: "agent:error",
          runId,
          error: message,
          timestamp: Date.now(),
        });
      }
    } finally {
      if (runTimeoutId) clearTimeout(runTimeoutId);
      this.activeRuns.delete(runId);
    }

    if (status === "cancelled") {
      executionState.stepState = "cancelled";
      if (plan && (plan.status === "running" || plan.status === "draft" || plan.status === "ready")) {
        plan.status = "cancelled";
        this.eventBus.emit({
          type: "plan:cancelled",
          runId,
          planId: plan.planId,
          timestamp: Date.now(),
        });
      }
      this.eventBus.emit({
        type: "agent:cancelled",
        runId,
        timestamp: Date.now(),
      });
    } else if (status === "timeout" || status === "error") {
      executionState.stepState = "failed";
    }

    executionState.runState =
      status === "completed"
        ? "completed"
        : status === "cancelled"
          ? "cancelled"
          : status === "timeout"
            ? "timed_out"
            : "failed";
    await this.checkpointManager.createCheckpoint(
      executionState,
      session.getMessages(),
      "run_completed",
    );

    const lastAssistant = session
      .getMessages()
      .filter((message) => message.role === "assistant")
      .pop();
    const fallbackText =
      status === "cancelled"
        ? "（对话已被取消）"
        : status === "timeout"
          ? "（对话请求已超时）"
          : "";
    const finalText =
      status === "error"
        ? ""
        : lastAssistant && lastAssistant.content.length > 0
          ? lastAssistant.content
          : fallbackText;

    const durationMs = Date.now() - startTime;
    const result: AgentRunResult = {
      runId,
      conversationId,
      status,
      finalText,
      transcript: session.getMessages(),
      toolCallsCount,
      roundsCount: stepCount,
      error: errorMsg,
      durationMs,
    };

    this.eventBus.emit({
      type: "agent:finished",
      runId,
      status,
      durationMs,
      toolCallsCount,
      stepsCount: stepCount,
      timestamp: Date.now(),
    });

    return result;
  }

  cancel(runId: string): boolean {
    const controller = this.activeRuns.get(runId);
    if (controller) {
      controller.abort();
      this.activeRuns.delete(runId);
      return true;
    }
    return false;
  }

  cancelAll(): void {
    for (const controller of this.activeRuns.values()) {
      controller.abort();
    }
    this.activeRuns.clear();
  }
}
