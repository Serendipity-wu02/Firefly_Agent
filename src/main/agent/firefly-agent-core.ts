import type {
  HarnessConfig,
  HarnessInput,
  HarnessResult,
  HarnessEvent,
  HarnessRunStatus,
} from "../../shared/harness-types";
import { DEFAULT_HARNESS_CONFIG } from "../../shared/harness-types";
import type { ChatMessage } from "../../shared/chat-types";
import type { IFireflyLlmProvider } from "../../shared/provider-types";
import type { IAgentCore } from "../../shared/agent-core";
import { LocalFireflyProvider } from "./providers/local-firefly-provider";
import { FireflyToolRegistry } from "../tools/tool-registry";
import { FireflyToolDispatcher } from "../tools/tool-dispatcher";
import { ContextManager } from "./context/context-manager";
import { ToolExecutionEngine } from "./execution/tool-execution-engine";
import type { ToolPolicyConfig } from "./execution/tool-policy";
import { AgentSession } from "./agent-session";
import { AgentEventBus } from "./agent-events";
import { CheckpointManager } from "./recovery/checkpoint-manager";
import { RecoveryManager } from "./recovery/recovery-manager";
import { ResumeProtocol } from "./recovery/resume-protocol";
import type { RunExecutionState } from "./recovery/execution-state";
import { BoundedPlanner } from "./planning/bounded-planner";
import { formatPlanContext } from "./planning/plan-lifecycle";
import type { Plan, PlannerConfig } from "./planning/plan-types";

export interface FireflyAgentCoreOptions {
  provider?: IFireflyLlmProvider;
  toolRegistry: FireflyToolRegistry;
  config?: Partial<HarnessConfig>;
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
 * FireflyAgentCore (v1 -> v2.1 Context, Execution Engine, Recovery & Bounded Planner Integrated)
 *
 * Implements IAgentCore with an independent Agent Loop decoupled from UI, TTS, and Live2D.
 * Connects directly to:
 * - IFireflyLlmProvider (model agnostic)
 * - FireflyToolRegistry & ToolExecutionEngine (Tool Policy, Authorization, Timeout & Concurrency)
 * - ContextManager (modular Context Layer, Token Meter & Projection)
 * - BoundedPlanner (Bounded planning skeleton, step lifecycle & verification)
 * - CheckpointManager (run-level durability & persistence)
 * - RecoveryManager (bounded LLM recovery & emergency compaction)
 * - AgentSession (stateful message transcript)
 * - AgentEventBus (typed event emitter)
 */
export class FireflyAgentCore implements IAgentCore {
  private provider: IFireflyLlmProvider;
  private readonly toolRegistry: FireflyToolRegistry;
  private readonly toolDispatcher: FireflyToolDispatcher;
  private readonly config: HarnessConfig;
  private readonly eventBus: AgentEventBus;
  private readonly contextManager: ContextManager;
  private readonly executionEngine: ToolExecutionEngine;
  private readonly checkpointManager: CheckpointManager;
  private readonly recoveryManager: RecoveryManager;
  private readonly planner: BoundedPlanner;
  private readonly activeRuns = new Map<string, AbortController>();

  constructor(options: FireflyAgentCoreOptions) {
    this.provider = options.provider || new LocalFireflyProvider();
    this.toolRegistry = options.toolRegistry;
    this.toolDispatcher = new FireflyToolDispatcher(this.toolRegistry);
    this.config = { ...DEFAULT_HARNESS_CONFIG, ...(options.config || {}) };
    this.eventBus = options.eventBus || new AgentEventBus();
    this.contextManager = options.contextManager || new ContextManager();
    this.executionEngine =
      options.executionEngine ||
      new ToolExecutionEngine(
        this.toolRegistry,
        options.toolPolicy,
        this.eventBus,
        this.toolDispatcher,
      );
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

  setProvider(provider: IFireflyLlmProvider): void {
    this.provider = provider;
  }

  getProvider(): IFireflyLlmProvider {
    return this.provider;
  }

  getEventBus(): AgentEventBus {
    return this.eventBus;
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
    for (const [id, controller] of this.activeRuns.entries()) {
      controller.abort();
    }
    this.activeRuns.clear();
  }

  /**
   * 从指定快照恢复执行现场并继续运行
   */
  async resume(checkpointId: string, signal?: AbortSignal): Promise<HarnessResult> {
    const checkpoint = await this.checkpointManager.restoreCheckpoint(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint "${checkpointId}" not found.`);
    }

    const evaluation = ResumeProtocol.evaluate(checkpoint);
    if (!evaluation.canResume) {
      throw new Error(`Cannot resume checkpoint "${checkpointId}": ${evaluation.reason}`);
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

  async run(
    input: HarnessInput,
    legacyEmitter?: (event: HarnessEvent) => void,
  ): Promise<HarnessResult> {
    const startTime = Date.now();
    const runId = input.runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const conversationId = input.conversationId;

    // 1. Setup AbortController for Cancellation & Timeout
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

    // 2. Build Context & Initialize AgentSession
    const memoryContext = input.memoryContext ?? "";

    // 4. Planning Mode Decision (Direct Mode vs Bounded Planning Mode)
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

    const initialMessages = this.contextManager.buildInitialMessages({
      userPrompt: input.userPrompt,
      history: input.history,
      characterState: input.characterState,
      memoryContext,
      planContext: planContextStr,
      systemPromptOverride: input.systemPromptOverride,
      toolSchemas: this.toolRegistry.getToolSchemas(),
    });

    const session = new AgentSession({ initialMessages });

    // 初始化执行状态与快照
    const executionState: RunExecutionState = {
      runId,
      sessionId: conversationId || `session-${runId}`,
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
    legacyEmitter?.({ type: "run_created", runId });

    let status: HarnessRunStatus = "running";
    let stepCount = 0;
    let toolCallsCount = 0;
    let errorMsg: string | undefined;

    // 5. Main Multi-Turn Agent Loop
    try {
      while (stepCount < this.config.maxRounds) {
        if (runAbortController.signal.aborted) {
          status = timedOut ? "timeout" : "cancelled";
          if (timedOut) errorMsg = `Run timed out after ${this.config.totalTimeoutMs}ms`;
          break;
        }

        stepCount++;
        const roundId = `${runId}:s${stepCount}`;
        executionState.step = stepCount;
        executionState.stepState = "running";
        executionState.updatedAt = Date.now();

        // If in planning mode, emit plan:step-start
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
        legacyEmitter?.({ type: "round_start", roundId, round: stepCount });

        const toolSchemas = this.toolRegistry.getToolSchemas();

        this.eventBus.emit({
          type: "agent:llm-request",
          runId,
          step: stepCount,
          messageCount: session.size(),
          timestamp: Date.now(),
        });

        // Call Provider with Recovery Manager
        let roundResponse: any;
        while (true) {
          try {
            roundResponse = await this.provider.generateCompletion(
              {
                messages: session.getMessages(),
                tools: toolSchemas.length > 0 ? toolSchemas : undefined,
              },
              runAbortController.signal,
              (delta) => {
                legacyEmitter?.({ type: "progress_text", delta });
              },
            );
            break;
          } catch (providerErr: any) {
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
              for (const m of projected.messages) {
                session.append(m);
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
                await new Promise((r) => setTimeout(r, decision.delayMs));
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
          if (timedOut) errorMsg = `Run timed out after ${this.config.totalTimeoutMs}ms`;
          legacyEmitter?.({ type: "round_end", roundId, round: stepCount });
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

        // Branch A: LLM requested tool calls
        if (asstMessage.toolCalls && asstMessage.toolCalls.length > 0) {
          const asstEntry: ChatMessage = {
            id: `asst-${Date.now()}-${stepCount}`,
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

          // 初始化活跃工具状态
          executionState.activeToolCalls = asstMessage.toolCalls.map((tc: any) => ({
            toolCallId: tc.id,
            name: tc.name,
            arguments: typeof tc.arguments === "string" ? JSON.parse(tc.arguments || "{}") : tc.arguments,
            status: "running" as const,
            sideEffectState: "started" as const,
          }));

          for (const tc of asstMessage.toolCalls) {
            toolCallsCount++;

            this.eventBus.emit({
              type: "agent:tool-call",
              runId,
              step: stepCount,
              toolCallId: tc.id,
              toolName: tc.name,
              args: typeof tc.arguments === "string" ? JSON.parse(tc.arguments || "{}") : tc.arguments,
              timestamp: Date.now(),
            });
            legacyEmitter?.({
              type: "tool_start",
              toolCallId: tc.id,
              toolName: tc.name,
              args: typeof tc.arguments === "string" ? JSON.parse(tc.arguments || "{}") : tc.arguments,
            });

            // Execute Tool via Tool Execution Engine (Policy, Timeout, Retry, Concurrency, Result Policy)
            const toolResult = await this.executionEngine.executeToolCall(tc, {
              runId,
              step: stepCount,
              conversationId,
              userQuery: input.userPrompt,
              signal: runAbortController.signal,
              toolCallsCount,
              maxToolCallsPerRun: this.executionEngine.getPolicyConfig().maxToolCallsPerRun || 25,
            });

            roundObservation += `[${tc.name}]: ${toolResult.output}\n`;
            if (toolResult.isError) roundHasError = true;

            // 更新状态
            const activeTc = executionState.activeToolCalls.find((a) => a.toolCallId === tc.id);
            if (activeTc) {
              activeTc.status = toolResult.isError ? "failed" : "succeeded";
              activeTc.sideEffectState = toolResult.isError ? "failed" : "completed";
              activeTc.output = toolResult.output;
            }

            this.eventBus.emit({
              type: "agent:tool-result",
              runId,
              step: stepCount,
              toolCallId: tc.id,
              toolName: tc.name,
              output: toolResult.output,
              isError: !!toolResult.isError,
              timestamp: Date.now(),
            });
            legacyEmitter?.({
              type: "tool_end",
              toolCallId: tc.id,
              outcome: toolResult.isError ? "failure" : "success",
              preview: toolResult.output.slice(0, 100),
            });

            const toolEntry: ChatMessage = {
              id: `tool-${Date.now()}-${tc.id}`,
              role: "tool",
              content: toolResult.output,
              toolCallId: tc.id,
              timestamp: Date.now(),
            };
            session.append(toolEntry);
          }

          await this.checkpointManager.createCheckpoint(
            executionState,
            session.getMessages(),
            "tool_round_completed",
          );

          // If in planning mode, evaluate step progress
          if (plan && plan.status === "running") {
            const currentPlanStepIdx = plan.currentStepIndex;
            const advance = this.planner.advanceStep(plan, roundObservation, roundHasError);

            this.eventBus.emit({
              type: "plan:verification",
              runId,
              planId: plan.planId,
              stepIndex: currentPlanStepIdx,
              result: advance.verification.status,
              timestamp: Date.now(),
            });

            if (advance.action === "next") {
              this.eventBus.emit({
                type: "plan:step-completed",
                runId,
                planId: plan.planId,
                stepIndex: currentPlanStepIdx,
                observation: roundObservation,
                timestamp: Date.now(),
              });
            } else if (advance.action === "complete") {
              this.eventBus.emit({
                type: "plan:step-completed",
                runId,
                planId: plan.planId,
                stepIndex: currentPlanStepIdx,
                observation: roundObservation,
                timestamp: Date.now(),
              });
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
                stepIndex: currentPlanStepIdx,
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

          legacyEmitter?.({ type: "round_end", roundId, round: stepCount });
          // Loop continues to next turn
        } else {
          // Branch B: Final Answer reached
          const asstEntry: ChatMessage = {
            id: `asst-${Date.now()}-${stepCount}`,
            role: "assistant",
            content: asstMessage.content || "",
            timestamp: Date.now(),
          };
          session.append(asstEntry);

          if (plan && plan.status === "running") {
            const currentPlanStepIdx = plan.currentStepIndex;
            const advance = this.planner.advanceStep(plan, asstMessage.content || "", false);
            this.eventBus.emit({
              type: "plan:verification",
              runId,
              planId: plan.planId,
              stepIndex: currentPlanStepIdx,
              result: advance.verification.status,
              timestamp: Date.now(),
            });
            this.eventBus.emit({
              type: "plan:step-completed",
              runId,
              planId: plan.planId,
              stepIndex: currentPlanStepIdx,
              observation: asstMessage.content,
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
            content: asstMessage.content || "",
            timestamp: Date.now(),
          });
          this.eventBus.emit({
            type: "agent:final-answer",
            runId,
            content: asstMessage.content || "",
            timestamp: Date.now(),
          });
          legacyEmitter?.({
            type: "final_answer",
            content: asstMessage.content || "",
          });
          legacyEmitter?.({ type: "round_end", roundId, round: stepCount });

          status = "completed";
          break;
        }
      }

      if (stepCount >= this.config.maxRounds && status === "running") {
        status = "completed";
      }
    } catch (err: any) {
      if (runAbortController.signal.aborted) {
        status = timedOut ? "timeout" : "cancelled";
        if (timedOut) errorMsg = `Run timed out after ${this.config.totalTimeoutMs}ms`;
      } else {
        status = "error";
        const msg = err?.message ? String(err.message) : String(err);
        errorMsg = msg;
        this.eventBus.emit({
          type: "agent:error",
          runId,
          error: msg,
          timestamp: Date.now(),
        });
        legacyEmitter?.({ type: "run_error", runId, error: msg });
      }
    } finally {
      if (runTimeoutId) clearTimeout(runTimeoutId);
      this.activeRuns.delete(runId);
    }

    if (status === "cancelled") {
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
    }

    executionState.runState = status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : "failed";
    await this.checkpointManager.createCheckpoint(
      executionState,
      session.getMessages(),
      "run_completed",
    );

    const lastAsst = session
      .getMessages()
      .filter((m) => m.role === "assistant")
      .pop();

    // Factual statuses only. A real execution error must NEVER be disguised
    // as a persona reply ("我在这里，开拓者。") — error runs produce empty
    // finalText so no downstream consumer can broadcast a fake response.
    const fallbackText =
      status === "cancelled"
        ? "（对话已被取消）"
        : status === "timeout"
          ? "（对话请求已超时）"
          : "";
    const finalText: string =
      status === "error"
        ? ""
        : lastAsst && typeof lastAsst.content === "string" && lastAsst.content.length > 0
          ? lastAsst.content
          : fallbackText;

    const durationMs = Date.now() - startTime;

    const result: HarnessResult = {
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
    legacyEmitter?.({ type: "run_completed", runId, result });

    return result;
  }
}
