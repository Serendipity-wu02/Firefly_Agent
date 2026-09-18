import type {
  AgentBudgetKind,
  AgentConfig,
  AgentResumeRejection,
  AgentResumeReadFailureCode,
  AgentResumeRejectionResult,
  AgentResumeResult,
  AgentRequiredToolExecution,
  AgentRequiredToolExecutionResult,
  AgentRunInput,
  AgentRunResult,
  AgentRunStatus,
  AgentToolCallEvidence,
  AgentTerminationReason,
} from "../../../shared/agent-types";
import { DEFAULT_AGENT_CONFIG } from "../../../shared/agent-types";
import type { ChatMessage, ChatCompletionResponse } from "../../../shared/chat-types";
import type { IFireflyLlmProvider } from "../../../shared/provider-types";
import type { IAgentCore } from "../../../shared/agent-core";
import { LocalFireflyProvider } from "../providers/local-firefly-provider";
import { FireflyToolRegistry } from "../tools/registry/tool-registry";
import { ContextManager } from "../context/context-manager";
import { ToolExecutionEngine } from "../tools/execution/tool-execution-engine";
import type { ToolPolicyConfig } from "../tools/execution/tool-policy";
import { AgentSession } from "../agent-session";
import { AgentEventBus } from "../agent-events";
import { CheckpointManager } from "../recovery/checkpoint-manager";
import type { Checkpoint } from "../recovery/checkpoint-types";
import { RecoveryManager } from "../recovery/recovery-manager";
import { ResumeProtocol } from "../recovery/resume-protocol";
import type { RunExecutionState } from "../recovery/execution-state";
import { BoundedPlanner } from "../planning/bounded-planner";
import { formatPlanContext } from "../planning/plan-lifecycle";
import type { Plan, PlannerConfig } from "../planning/plan-types";
import type { AgentExecutionProfile, WorkerExecutionProfile } from "../../../shared/subagent-types";
import type { MainAgentDelegationService } from "../subagents/main-agent-delegation";
import { requestHarnessCompletion } from "./harness-llm";
import type { HarnessAuthorizationAdapter } from "./harness-authorization-adapter";
import { executeToolRound, matchesRequiredToolExecution } from "./tool-round";
import { emitDiagnosticTrace } from "../../diagnostics/diagnostic-trace";
import { waitForCancellableDelay } from "../cancellable-delay";
import {
  createCompactionPlanFact,
  createCompactionTaskFacts,
  createCompactionTaskFactsMessageIdentity,
  createCompactionTaskFactsMessages,
  type CompactionTaskFactsMessageIdentity,
} from "../compaction/task-facts";
import {
  COMPACTION_TASK_FACTS_BUDGET_ERROR,
  COMPACTION_INPUT_BUDGET_ERROR,
  COMPACTION_STRUCTURED_RESULT_BUDGET_ERROR,
  type CompactionTaskFactsV1,
} from "../../../shared/compaction-task-facts";

export interface FireflyHarnessOptions {
  provider?: IFireflyLlmProvider;
  toolRegistry: FireflyToolRegistry;
  config?: Partial<AgentConfig>;
  eventBus?: AgentEventBus;
  contextManager?: ContextManager;
  toolPolicy?: Partial<ToolPolicyConfig>;
  executionEngine?: ToolExecutionEngine;
  authorizationAdapter?: HarnessAuthorizationAdapter;
  mainDelegationService?: MainAgentDelegationService;
  checkpointManager?: CheckpointManager;
  recoveryManager?: RecoveryManager;
  planner?: BoundedPlanner;
  plannerConfig?: Partial<PlannerConfig>;
}

function createResumeRejectionResult(
  checkpointId: string,
  rejection: AgentResumeRejection,
  startedAt: number,
  checkpoint?: Checkpoint,
): AgentResumeRejectionResult {
  const message = rejection.message;
  return {
    kind: "resume_rejected",
    checkpointId,
    rejection,
    runId: checkpoint?.runId,
    conversationId: checkpoint?.sessionId,
    status: "error",
    terminationReason: { kind: "error" },
    finalText: "",
    transcript: [],
    toolCallsCount: 0,
    roundsCount: 0,
    durationMs: Date.now() - startedAt,
    error: message,
  };
}

function isWorkerProfile(
  profile: AgentExecutionProfile | undefined,
): profile is WorkerExecutionProfile {
  return profile?.kind === "WORKER";
}

function buildWorkerSystemPrompt(profile: WorkerExecutionProfile): string {
  const contextLines = profile.contextProjection.map((item) =>
    `- ${item.key}: ${JSON.stringify(item.value)}`,
  );
  return [
    "You are a delegated functional worker inside an existing agent runtime.",
    "Complete the supplied objective and return a structured factual work product to the parent runtime.",
    "Do not roleplay, speak as a character, or produce user-facing presentation language.",
    `Objective: ${profile.objective}`,
    contextLines.length > 0
      ? `Explicit read-only task context:\n${contextLines.join("\n")}`
      : "Explicit read-only task context: none.",
  ].join("\n");
}

function cloneRequiredToolExecution(
  requirement: AgentRequiredToolExecution,
): AgentRequiredToolExecution {
  return {
    ...requirement,
    arguments: { ...requirement.arguments },
  };
}

function parseToolOutput(output: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(output);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function isUnknownExecutionOutput(output: Record<string, unknown> | undefined): boolean {
  if (output?.commandSubmission === "unknown") return true;
  const error = output?.error;
  return error === "tool_timeout" ||
    error === "tool_cancelled" ||
    error === "CANCELLED" ||
    error === "execution_exception" ||
    error === "engine_internal_error";
}

function budgetKindFromToolOutput(output: string): AgentBudgetKind | undefined {
  const parsed = parseToolOutput(output);
  if (parsed?.error === "budget_exceeded") return "tool_calls";
  if (parsed?.error === "delegation_budget_exhausted") return "delegation";
  return undefined;
}

function budgetExhaustionMessage(budget: AgentBudgetKind): string {
  switch (budget) {
    case "rounds":
      return "Agent run exhausted its round budget before an explicit final answer.";
    case "tool_calls":
      return "Agent run exhausted its tool-call budget before an explicit final answer.";
    case "delegation":
      return "Agent run exhausted its delegation budget before an explicit final answer.";
  }
}

function resolveRequiredToolExecutionResult(
  requirement: AgentRequiredToolExecution,
  evidence: readonly AgentToolCallEvidence[],
  correctionAttempts: number,
): AgentRequiredToolExecutionResult {
  const matchingEvidence = evidence.find((entry) =>
    matchesRequiredToolExecution(
      {
        id: entry.toolCallId,
        name: entry.toolName,
        arguments: { ...entry.arguments },
      },
      requirement,
    ) && entry.outcome !== "not_executed"
  );
  if (matchingEvidence === undefined) {
    return {
      requirement: cloneRequiredToolExecution(requirement),
      status: "not_called",
      correctionAttempts,
    };
  }

  const output = parseToolOutput(matchingEvidence.output);
  if (
    matchingEvidence.outcome === "success" &&
    !matchingEvidence.isError &&
    requirement.successContract === "json_ok_true" &&
    output?.ok === true
  ) {
    return {
      requirement: cloneRequiredToolExecution(requirement),
      status: "succeeded",
      correctionAttempts,
      evidence: matchingEvidence,
    };
  }

  return {
    requirement: cloneRequiredToolExecution(requirement),
    status: isUnknownExecutionOutput(output) || matchingEvidence.outcome === "unknown"
      ? "unknown"
      : "failed",
    correctionAttempts,
    evidence: matchingEvidence,
  };
}

function buildRequiredExecutionCorrection(requirement: AgentRequiredToolExecution): string {
  return [
    "【内部执行纠正】当前用户请求已由 Main 编排层确认为需要实际执行的工具操作。",
    `必须调用工具 ${requirement.toolName}，参数为 ${JSON.stringify(requirement.arguments)}。`,
    "不能把此前回复、审批或模型文字当作本次执行结果，也不能在没有工具结果时声称完成。",
  ].join("\n");
}

function buildRequiredExecutionFinalText(result: AgentRequiredToolExecutionResult): string {
  switch (result.status) {
    case "succeeded":
      return "指定工具已返回本次操作成功的结构化结果。";
    case "failed":
      return "指定工具返回失败，本次操作未完成。";
    case "unknown":
      return "指定工具的提交结果无法确认；为避免重复副作用，本次没有自动重试。";
    case "not_called":
      return "本次请求未调用所需工具，操作没有执行。";
  }
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
  private readonly authorizationAdapter?: HarnessAuthorizationAdapter;
  private readonly mainDelegationService?: MainAgentDelegationService;
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
    this.authorizationAdapter = options.authorizationAdapter;
    this.mainDelegationService = options.mainDelegationService;
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

  private getToolSchemasForProfile(
    profile: AgentExecutionProfile | undefined,
    restrictToolSurface: boolean = false,
  ) {
    if (restrictToolSurface || (profile?.kind === "MAIN" && profile.toolSurface === "none")) {
      return [];
    }

    const schemas = this.toolRegistry.getToolSchemas();
    if (isWorkerProfile(profile)) {
      const allowed = new Set(profile.allowedToolIds);
      return schemas.filter((schema) => allowed.has(schema.function.name));
    }
    if (profile?.allowSubAgentDelegation === true && this.mainDelegationService !== undefined) {
      return [...schemas, this.mainDelegationService.getToolSchema()];
    }
    return schemas;
  }

  setProvider(provider: IFireflyLlmProvider): void {
    this.provider = provider;
  }

  getProvider(): IFireflyLlmProvider {
    return this.provider;
  }

  async resume(_checkpointId: string, _signal?: AbortSignal): Promise<AgentResumeResult> {
    const startedAt = Date.now();
    const restored = await this.checkpointManager.restoreCheckpoint(_checkpointId);

    if (restored.kind !== "found") {
      let rejection: AgentResumeRejection;
      if (restored.kind === "not_found") {
        rejection = {
          code: "checkpoint_not_found",
          checkpointId: _checkpointId,
          message: `Checkpoint "${_checkpointId}" was not found; no run was created.`,
        };
      } else if (restored.kind === "read_error") {
        const readFailureCode: AgentResumeReadFailureCode = restored.errorCode;
        rejection = {
          code: "checkpoint_read_failed",
          checkpointId: _checkpointId,
          readFailureCode,
          message: `Checkpoint "${_checkpointId}" could not be read because of an I/O error; no run was created.`,
        };
      } else if (restored.kind === "invalid_format") {
        rejection = {
          code: "checkpoint_invalid_format",
          checkpointId: _checkpointId,
          message: `Checkpoint "${_checkpointId}" has an invalid format; no run was created.`,
        };
      } else {
        rejection = {
          code: "checkpoint_unsupported_version",
          checkpointId: _checkpointId,
          observedVersion:
            typeof restored.version === "number" ? restored.version : undefined,
          message: `Checkpoint "${_checkpointId}" uses an unsupported schema version; no run was created.`,
        };
      }
      return createResumeRejectionResult(_checkpointId, rejection, startedAt);
    }

    const checkpoint = restored.checkpoint;
    const evaluation = ResumeProtocol.evaluate(checkpoint);
    const rejection: AgentResumeRejection = {
      code: evaluation.rejectionCode ?? "checkpoint_facts_missing",
      checkpointId: _checkpointId,
      runId: checkpoint.runId,
      observedRunState: checkpoint.runState,
      observedVersion: checkpoint.version,
      message:
        evaluation.reason ??
        "Resume V1 rejected this checkpoint; the snapshot remains diagnostic-only.",
    };

    // Resume V1 is deliberately fail-closed. Even if a future protocol change
    // accidentally returns canResume=true, this method must not re-enter run().
    return createResumeRejectionResult(_checkpointId, rejection, startedAt, checkpoint);
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const startTime = Date.now();
    const runId =
      input.runId ||
      "run-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    const conversationId = input.conversationId;
    const executionProfile: AgentExecutionProfile =
      input.executionProfile ?? { kind: "MAIN" };
    const workerRun = isWorkerProfile(executionProfile);
    const restrictedProactiveSurface =
      input.source === "proactive" ||
      (executionProfile.kind === "MAIN" && executionProfile.toolSurface === "none");
    const mainDelegationService =
      !workerRun && !restrictedProactiveSurface && executionProfile.allowSubAgentDelegation === true
        ? this.mainDelegationService
        : undefined;
    const workerSystemPrompt = workerRun
      ? buildWorkerSystemPrompt(executionProfile)
      : undefined;
    const requiredToolExecution = input.requiredToolExecution === undefined
      ? undefined
      : cloneRequiredToolExecution(input.requiredToolExecution);
    const profileToolSchemas = this.getToolSchemasForProfile(
      executionProfile,
      restrictedProactiveSurface,
    );
    const toolSchemas = requiredToolExecution === undefined
      ? profileToolSchemas
      : profileToolSchemas.filter(
          (schema) => schema.function.name === requiredToolExecution.toolName,
        );
    const maxRounds = workerRun ? executionProfile.budget.maxSteps : this.config.maxRounds;
    const maxToolCallsPerRun = workerRun
      ? executionProfile.budget.maxToolCalls
      : this.executionEngine.getPolicyConfig().maxToolCallsPerRun || 25;
    const runTimeoutMs = workerRun
      ? executionProfile.budget.timeoutMs
      : this.config.totalTimeoutMs;
    const runDeadline = runTimeoutMs > 0 ? startTime + runTimeoutMs : undefined;

    const runAbortController = new AbortController();
    if (input.signal) {
      if (input.signal.aborted) runAbortController.abort();
      else input.signal.addEventListener("abort", () => runAbortController.abort(), { once: true });
    }
    this.activeRuns.set(runId, runAbortController);

    let timedOut = false;
    let runTimeoutId: NodeJS.Timeout | null = null;
    if (runTimeoutMs > 0) {
      runTimeoutId = setTimeout(() => {
        timedOut = true;
        runAbortController.abort();
      }, runTimeoutMs);
    }

    const isPlanningMode = this.planner.shouldPlan(
      input.userPrompt,
      toolSchemas.length,
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

    let taskFactsSequence = 0;
    const toolCallEvidence: AgentToolCallEvidence[] = [];
    let requiredToolCallObserved = false;
    let requiredCorrectionAttempts = 0;
    const taskFactsMessageIdentity: CompactionTaskFactsMessageIdentity | undefined = workerRun
      ? undefined
      : createCompactionTaskFactsMessageIdentity(runId, plan !== undefined);
    const getOutgoingToolSchemas = (): typeof toolSchemas =>
      requiredToolCallObserved ? [] : toolSchemas;

    const createTaskFacts = (state?: RunExecutionState): CompactionTaskFactsV1 => {
      const requiredToolStatus = requiredToolExecution === undefined
        ? undefined
        : resolveRequiredToolExecutionResult(
            requiredToolExecution,
            toolCallEvidence,
            requiredCorrectionAttempts,
          ).status;
      return createCompactionTaskFacts({
        runId,
        sequence: ++taskFactsSequence,
        source: input.source ?? "user",
        userPrompt: input.userPrompt,
        browserRequestTargets: input.browserRequestTargets,
        requiredToolExecution,
        requiredToolCallObserved,
        requiredToolStatus,
        requiredCorrectionAttempts,
        toolCallEvidence,
        activeToolCalls: state?.activeToolCalls.map((active) => ({
          toolCallId: active.toolCallId,
          name: active.name,
          arguments: { ...active.arguments },
          status: active.status,
          sideEffectState: active.sideEffectState,
        })),
        runState: state?.runState,
        stepState: state?.stepState,
        step: state?.step,
        recoveryAttempts: state?.recoveryAttempts,
        plan: plan === undefined ? undefined : createCompactionPlanFact(plan),
      });
    };

    const initialTaskFacts = workerRun ? undefined : createTaskFacts();
    const initialProjection = workerRun
      ? this.contextManager.project({
          source: input.source,
          userPrompt: input.userPrompt,
          history: [],
          systemPromptOverride: workerSystemPrompt,
          toolSchemas,
          suppressCharacterState: true,
        })
      : await this.contextManager.projectWithSlots({
          source: input.source,
          userPrompt: input.userPrompt,
          history: input.history,
          memoryContext: input.memoryContext,
          planContext: planContextStr,
          systemPromptOverride: input.systemPromptOverride,
          toolSchemas,
          taskFacts: initialTaskFacts,
          taskFactsMessageIdentity,
        });
    const initialMessages = initialProjection.messages;
    const taskFactsMessageIds = taskFactsMessageIdentity === undefined
      ? []
      : [
          taskFactsMessageIdentity.constraintsMessageId,
          ...(taskFactsMessageIdentity.planMessageId === undefined
            ? []
            : [taskFactsMessageIdentity.planMessageId]),
        ];
    let taskFactsExceededBudget = initialProjection.taskFactsStatus === "exceeded_budget";
    let compactionFailureDetected = initialProjection.compactionResult.compactionFailure !== undefined;

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

    const createCheckpoint = (trigger: Parameters<CheckpointManager["createCheckpoint"]>[2]) =>
      workerRun
        ? Promise.resolve(null)
        : this.checkpointManager.createCheckpoint(
            executionState,
            session.getMessages(),
            trigger,
          );

    const refreshTaskFacts = (): boolean => {
      if (workerRun) return true;
      const facts = createTaskFacts(executionState);
      const messageSet = createCompactionTaskFactsMessages(
        facts,
        taskFactsMessageIdentity,
      );
      if (!session.replaceMessagesById(
        taskFactsMessageIds,
        messageSet.messages,
        taskFactsMessageIdentity?.baseSystemMessageId,
      )) return false;
      const meter = this.contextManager.getTokenMeter();
      const systemMessage = session.find((entry) =>
        entry.id === taskFactsMessageIdentity?.baseSystemMessageId,
      );
      const currentUserMessage = [...session.getMessages()]
        .reverse()
        .find((entry) => entry.role === "user" && entry.content === input.userPrompt);
      const minimumMessages = [
        ...(systemMessage === undefined ? [] : [systemMessage]),
        ...messageSet.messages,
        ...(currentUserMessage === undefined ? [] : [currentUserMessage]),
      ];
      const minimumTaskFactsTokens = meter.estimateMessageTokens(minimumMessages) +
        meter.estimateSchemaTokens(getOutgoingToolSchemas());
      const usableInputBudget = initialProjection.usage.usableInputBudget;
      return minimumTaskFactsTokens <= usableInputBudget;
    };

    executionState.runState = "running";
    if (!refreshTaskFacts()) {
      taskFactsExceededBudget = true;
    }
    await createCheckpoint("run_initialized");

    this.eventBus.emit({
      type: "agent:started",
      runId,
      prompt: input.userPrompt,
      timestamp: startTime,
    });

    let status: AgentRunStatus = "running";
    let stepCount = 0;
    let toolCallsCount = 0;
    let forceRequiredToolChoice = false;
    let delegatedStepsReserved = 0;
    let budgetExhaustedKind: AgentBudgetKind | undefined;
    let terminationReason: AgentTerminationReason | undefined;
    let errorMsg: string | undefined;
    let taskFactsBudgetErrorEmitted = false;
    let compactionFailureErrorEmitted = false;
    let inputBudgetErrorEmitted = false;

    const terminateForTaskFactsBudget = (): void => {
      status = "error";
      terminationReason = { kind: "error" };
      errorMsg = COMPACTION_TASK_FACTS_BUDGET_ERROR;
      if (taskFactsBudgetErrorEmitted) return;
      taskFactsBudgetErrorEmitted = true;
      this.eventBus.emit({
        type: "agent:error",
        runId,
        error: errorMsg,
        timestamp: Date.now(),
      });
    };

    const terminateForCompactionFailure = (): void => {
      status = "error";
      terminationReason = { kind: "error" };
      errorMsg = COMPACTION_STRUCTURED_RESULT_BUDGET_ERROR;
      if (compactionFailureErrorEmitted) return;
      compactionFailureErrorEmitted = true;
      this.eventBus.emit({
        type: "agent:error",
        runId,
        error: errorMsg,
        timestamp: Date.now(),
      });
    };

    const terminateForInputBudget = (): void => {
      status = "error";
      terminationReason = { kind: "error" };
      errorMsg = COMPACTION_INPUT_BUDGET_ERROR;
      if (inputBudgetErrorEmitted) return;
      inputBudgetErrorEmitted = true;
      this.eventBus.emit({
        type: "agent:error",
        runId,
        error: errorMsg,
        timestamp: Date.now(),
      });
    };

    /**
     * Enforces the input budget immediately before a Provider request.
     * ContextProjector remains the compaction owner; this guard only measures
     * the exact message array and Schema set that the request would send.
     */
    const ensureProviderBudget = (): boolean => {
      if (status !== "running") return false;

      const meter = this.contextManager.getTokenMeter();
      const outgoingSchemas = getOutgoingToolSchemas();
      const usableInputBudget = initialProjection.usage.usableInputBudget;
      const actualInputTokens = meter.estimateMessageTokens(session.getMessages()) +
        meter.estimateSchemaTokens(outgoingSchemas);
      if (actualInputTokens <= usableInputBudget) return true;

      executionState.runState = "compacting";
      executionState.updatedAt = Date.now();
      const projected = this.contextManager.project({
        source: input.source,
        userPrompt: input.userPrompt,
        history: session.getMessages(),
        memoryContext: workerRun ? undefined : input.memoryContext,
        planContext: plan === undefined ? planContextStr : formatPlanContext(plan),
        systemPromptOverride: workerRun ? workerSystemPrompt : input.systemPromptOverride,
        toolSchemas: outgoingSchemas,
        taskFacts: workerRun ? undefined : createTaskFacts(executionState),
        taskFactsMessageIdentity,
        appendCurrentUser: false,
        forceCompactionStrategy: "emergency",
        ...(workerRun ? { suppressCharacterState: true } : {}),
      });

      if (projected.compactionResult.compactionFailure !== undefined) {
        compactionFailureDetected = true;
        terminateForCompactionFailure();
        return false;
      }
      if (projected.taskFactsStatus === "exceeded_budget") {
        terminateForTaskFactsBudget();
        return false;
      }
      if (runAbortController.signal.aborted) {
        status = timedOut ? "timeout" : "cancelled";
        if (timedOut) errorMsg = "Run timed out after " + runTimeoutMs + "ms";
        return false;
      }

      const projectedInputTokens = meter.estimateMessageTokens(projected.messages) +
        meter.estimateSchemaTokens(outgoingSchemas);
      if (projectedInputTokens > usableInputBudget) {
        // Task facts and ordinary input have separate gates. Reaching this
        // branch means the facts were retained, but the complete request still
        // cannot fit after the actual message projection.
        terminateForInputBudget();
        return false;
      }

      session.clear();
      for (const message of projected.messages) session.append(message);
      executionState.runState = "running";
      executionState.updatedAt = Date.now();
      return true;
    };

    if (taskFactsExceededBudget) {
      terminateForTaskFactsBudget();
    }
    if (compactionFailureDetected) {
      terminateForCompactionFailure();
    }

    try {
      while (status === "running" && stepCount < this.config.maxRounds) {
        if (workerRun && stepCount >= maxRounds) {
          break;
        }
        if (!workerRun && stepCount + delegatedStepsReserved >= maxRounds) {
          break;
        }
        if (runAbortController.signal.aborted) {
          status = timedOut ? "timeout" : "cancelled";
          if (timedOut) {
            errorMsg = "Run timed out after " + runTimeoutMs + "ms";
          }
          break;
        }

        stepCount++;
        executionState.step = stepCount;
        executionState.stepState = "waiting_llm";
        executionState.updatedAt = Date.now();
        if (!refreshTaskFacts()) {
          terminateForTaskFactsBudget();
          break;
        }
        if (!ensureProviderBudget()) break;

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

        await createCheckpoint("step_start");

        this.eventBus.emit({
          type: "agent:step-start",
          runId,
          step: stepCount,
          timestamp: Date.now(),
        });

        this.eventBus.emit({
          type: "agent:llm-request",
          runId,
          step: stepCount,
          messageCount: session.size(),
          timestamp: Date.now(),
        });

        let roundResponse: ChatCompletionResponse | undefined;
        while (true) {
          if (runAbortController.signal.aborted) {
            status = timedOut ? "timeout" : "cancelled";
            if (timedOut) {
              errorMsg = "Run timed out after " + runTimeoutMs + "ms";
            }
            break;
          }

          try {
            const forceToolChoiceForThisRound = forceRequiredToolChoice;
            forceRequiredToolChoice = false;
            const effectiveToolChoice = forceToolChoiceForThisRound && requiredToolExecution !== undefined
              ? {
                  type: "function" as const,
                  function: { name: requiredToolExecution.toolName },
                }
              : undefined;
            emitDiagnosticTrace(
              `[Harness Trace] llm.request runId=${runId} step=${stepCount} source=${input.source ?? "user"} ` +
              `profile=${executionProfile.kind} toolSurface=${executionProfile.kind === "MAIN" ? executionProfile.toolSurface ?? "default" : "worker"} ` +
              `restricted=${restrictedProactiveSurface} schemas=${toolSchemas.length} ` +
              `toolNames=${toolSchemas.map((schema) => schema.function.name).join(",") || "none"} ` +
              `requiredTool=${requiredToolExecution?.toolName ?? "none"} ` +
              `toolChoice=${effectiveToolChoice?.function.name ?? "auto"}`,
            );
            roundResponse = await requestHarnessCompletion(
              this.provider,
              {
                messages: session.getMessages(),
                tools:
                  !requiredToolCallObserved && toolSchemas.length > 0
                    ? toolSchemas
                    : undefined,
                ...(effectiveToolChoice === undefined ? {} : { toolChoice: effectiveToolChoice }),
              },
              runAbortController.signal,
              workerRun
                ? undefined
                : (delta) => {
                    this.eventBus.emit({
                      type: "agent:progress",
                      runId,
                      step: stepCount,
                      delta,
                      timestamp: Date.now(),
                    });
                  },
              );
            console.log(
              `[Harness Trace] llm.response runId=${runId} step=${stepCount} ` +
              `toolCalls=${roundResponse.message.toolCalls?.map((call) => call.name).join(",") || "none"} ` +
              `contentLength=${roundResponse.message.content.length}`,
            );
            break;
          } catch (providerErr: unknown) {
            if (runAbortController.signal.aborted) {
              throw providerErr;
            }

            const completedRecoveryAttempts = executionState.recoveryAttempts;
            const decision = this.recoveryManager.evaluate(
              providerErr,
              completedRecoveryAttempts,
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

            const recoveryAttempt = completedRecoveryAttempts + 1;
            this.eventBus.emit({
              type: "recovery:started",
              runId,
              step: stepCount,
              errorType: decision.classifiedError.type,
              attempt: recoveryAttempt,
              timestamp: Date.now(),
            });
            executionState.runState =
              decision.action === "retry_with_compaction" ? "compacting" : "recovering";
            executionState.updatedAt = Date.now();
            await createCheckpoint("recovery_started");

            if (decision.action === "retry_with_compaction") {
              const projected = this.contextManager.project({
                source: input.source,
                userPrompt: input.userPrompt,
                history: session.getMessages(),
                memoryContext: input.memoryContext,
                planContext: plan === undefined ? planContextStr : formatPlanContext(plan),
                systemPromptOverride: input.systemPromptOverride,
                toolSchemas: getOutgoingToolSchemas(),
                taskFacts: workerRun ? undefined : createTaskFacts(executionState),
                taskFactsMessageIdentity,
                appendCurrentUser: false,
                forceCompactionStrategy: "emergency",
                ...(workerRun
                  ? {
                      systemPromptOverride: workerSystemPrompt,
                      toolSchemas,
                      suppressCharacterState: true,
                    }
                  : {}),
              });
              if (projected.compactionResult.compactionFailure !== undefined) {
                compactionFailureDetected = true;
                terminateForCompactionFailure();
                break;
              }
              if (projected.taskFactsStatus === "exceeded_budget") {
                terminateForTaskFactsBudget();
                break;
              }
              if (runAbortController.signal.aborted) {
                status = timedOut ? "timeout" : "cancelled";
                if (timedOut) {
                  errorMsg = "Run timed out after " + runTimeoutMs + "ms";
                }
                break;
              }
              session.clear();
              for (const message of projected.messages) {
                session.append(message);
              }
              if (!ensureProviderBudget()) break;
              executionState.runState = "running";
              executionState.recoveryAttempts = recoveryAttempt;
              executionState.updatedAt = Date.now();
              await createCheckpoint("compaction_completed");
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
              const waitResult = await waitForCancellableDelay(
                decision.delayMs,
                runAbortController.signal,
              );
              if (waitResult === "cancelled") {
                status = timedOut ? "timeout" : "cancelled";
                if (timedOut) {
                  errorMsg = "Run timed out after " + runTimeoutMs + "ms";
                }
                break;
              }
              executionState.runState = "running";
              executionState.recoveryAttempts = recoveryAttempt;
              executionState.updatedAt = Date.now();
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

        if (status !== "running") {
          break;
        }
        if (runAbortController.signal.aborted) {
          status = timedOut ? "timeout" : "cancelled";
          if (timedOut) {
            errorMsg = "Run timed out after " + runTimeoutMs + "ms";
          }
          break;
        }
        if (roundResponse === undefined) {
          status = "error";
          errorMsg = "Provider recovery ended without a response.";
          break;
        }

        const asstMessage = roundResponse.message;
        await createCheckpoint("llm_completed");

        let roundObservation = "";
        let roundHasError = false;

        if (asstMessage.toolCalls && asstMessage.toolCalls.length > 0) {
          executionState.stepState = "waiting_tool";
          const assistantMessageId = "asst-" + Date.now() + "-" + stepCount;
          const asstEntry: ChatMessage = {
            id: assistantMessageId,
            role: "assistant",
            content: asstMessage.content || "",
            toolCalls: asstMessage.toolCalls,
            timestamp: Date.now(),
          };
          session.append(asstEntry);

          if (!workerRun) {
            this.eventBus.emit({
              type: "agent:assistant-message",
              runId,
              step: stepCount,
              content: asstMessage.content || "",
              toolCalls: asstMessage.toolCalls,
              timestamp: Date.now(),
            });
          }

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
            browserRequestTargets: input.browserRequestTargets,
            conversationId,
            signal: runAbortController.signal,
            toolCallsCount: toolCallsBeforeRound,
            maxToolCallsPerRun,
            authorizationAdapter: this.authorizationAdapter,
            allowedToolIds: workerRun ? new Set(executionProfile.allowedToolIds) : undefined,
            requireAuthorizationForAllTools: workerRun,
            rejectAllToolCalls: restrictedProactiveSurface,
            requiredToolExecution,
            requiredToolCallAlreadyObserved: requiredToolCallObserved,
            requester: workerRun ? executionProfile.requester : undefined,
            mainDelegationService,
            getMainDelegationBudget: mainDelegationService
              ? () => ({
                  availableWorkerSteps: Math.max(
                    0,
                    maxRounds - stepCount - delegatedStepsReserved - 1,
                  ),
                  availableWorkerToolCalls: Math.max(
                    0,
                    maxToolCallsPerRun - toolCallsCount,
                  ),
                  remainingTimeoutMs:
                    runDeadline === undefined
                      ? 30_000
                      : Math.max(0, runDeadline - Date.now()),
                })
              : undefined,
            onDelegationBudgetReserved: mainDelegationService
              ? (budget) => {
                  delegatedStepsReserved += budget.maxSteps;
                  toolCallsCount += budget.maxToolCalls;
                }
              : undefined,
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
            onPermissionWaiting: async (call, approvalRequest) => {
              console.log(
                `[Approval Trace] pending runId=${runId} tool=${call.name}`
                  + ` approvalRequestId=${approvalRequest.approvalRequestId}`,
              );
              executionState.stepState = "waiting_permission";
              executionState.updatedAt = Date.now();
              await createCheckpoint("waiting_permission");
            },
            onPermissionResolved: async (call, approvalRequest, outcome) => {
              console.log(
                `[Approval Trace] resolved runId=${runId} tool=${call.name}`
                  + ` approvalRequestId=${approvalRequest.approvalRequestId}`
                  + ` status=${outcome.status}`,
              );
              executionState.stepState = "waiting_tool";
              executionState.updatedAt = Date.now();
            },
          });

          if (runAbortController.signal.aborted) {
            status = timedOut ? "timeout" : "cancelled";
            if (timedOut) {
              errorMsg = "Run timed out after " + runTimeoutMs + "ms";
            }
            break;
          }

          for (const observation of toolObservations) {
            const { call, result, outcome } = observation;
            const toolMessageId = "tool-" + Date.now() + "-" + call.id;
            const observedBudget = budgetKindFromToolOutput(result.output);
            if (budgetExhaustedKind === undefined && observedBudget !== undefined) {
              budgetExhaustedKind = observedBudget;
            }
            toolCallEvidence.push({
              runId,
              step: stepCount,
              toolCallId: call.id,
              toolName: call.name,
              assistantMessageId,
              toolMessageId,
              arguments: { ...call.arguments },
              outcome,
              output: result.output,
              isError: result.isError === true,
            });
            if (
              requiredToolExecution !== undefined &&
              matchesRequiredToolExecution(call, requiredToolExecution) &&
              outcome !== "not_executed"
            ) {
              requiredToolCallObserved = true;
            }
            roundObservation += "[" + call.name + "]: " + result.output + "\n";
            if (result.isError) roundHasError = true;

            const activeToolCall = executionState.activeToolCalls.find(
              (active) => active.toolCallId === call.id,
            );
            if (activeToolCall) {
              if (outcome === "not_executed") {
                activeToolCall.status = "pending";
                activeToolCall.sideEffectState = "not_started";
              } else {
                activeToolCall.status = result.isError ? "failed" : "succeeded";
                activeToolCall.sideEffectState = result.isError ? "failed" : "completed";
              }
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
              id: toolMessageId,
              role: "tool",
              content: result.output,
              toolCallId: call.id,
              timestamp: Date.now(),
            });
          }

          await createCheckpoint("tool_round_completed");

          if (
            requiredToolExecution !== undefined &&
            !requiredToolCallObserved &&
            requiredCorrectionAttempts === 0 &&
            toolSchemas.length > 0
          ) {
            requiredCorrectionAttempts++;
            forceRequiredToolChoice = true;
            session.append({
              id: `required-tool-correction-${runId}`,
              role: "system",
              content: buildRequiredExecutionCorrection(requiredToolExecution),
              timestamp: Date.now(),
            });
          }

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

          if (!refreshTaskFacts()) {
            terminateForTaskFactsBudget();
            break;
          }
        } else {
          if (
            requiredToolExecution !== undefined &&
            !requiredToolCallObserved &&
            requiredCorrectionAttempts === 0 &&
            toolSchemas.length > 0
          ) {
            requiredCorrectionAttempts++;
            forceRequiredToolChoice = true;
            session.append({
              id: `required-tool-correction-${runId}`,
              role: "system",
              content: buildRequiredExecutionCorrection(requiredToolExecution),
              timestamp: Date.now(),
            });
            continue;
          }
          const requiredResult = requiredToolExecution === undefined
            ? undefined
            : resolveRequiredToolExecutionResult(
                requiredToolExecution,
                toolCallEvidence,
                requiredCorrectionAttempts,
              );
          const finalContent = requiredResult === undefined
            ? asstMessage.content || ""
            : requiredResult.status === "succeeded" && asstMessage.content?.trim()
              ? asstMessage.content
              : buildRequiredExecutionFinalText(requiredResult);
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

          if (!workerRun) {
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
          }
          executionState.stepState = "completed";
          status = "completed";
          break;
        }
      }

      if (status === "running" && runAbortController.signal.aborted) {
        status = timedOut ? "timeout" : "cancelled";
        if (timedOut) {
          errorMsg = "Run timed out after " + runTimeoutMs + "ms";
        }
      }

      if (status === "running") {
        const loopBudget: AgentBudgetKind | undefined = workerRun
          ? stepCount >= maxRounds
            ? "delegation"
            : undefined
          : delegatedStepsReserved > 0 && stepCount + delegatedStepsReserved >= maxRounds
            ? "delegation"
            : stepCount >= this.config.maxRounds
              ? "rounds"
              : undefined;
        const exhaustedBudget = budgetExhaustedKind ?? loopBudget;
        status = "error";
        if (exhaustedBudget !== undefined) {
          terminationReason = {
            kind: "budget_exhausted",
            budget: exhaustedBudget,
          };
          errorMsg = budgetExhaustionMessage(exhaustedBudget);
        } else {
          terminationReason = { kind: "error" };
          errorMsg = "Agent run ended without an explicit completion result.";
        }
        this.eventBus.emit({
          type: "agent:error",
          runId,
          error: errorMsg,
          timestamp: Date.now(),
        });
      }
    } catch (err: unknown) {
      if (runAbortController.signal.aborted) {
        status = timedOut ? "timeout" : "cancelled";
        if (timedOut) {
          errorMsg = "Run timed out after " + runTimeoutMs + "ms";
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

    const finalTerminationReason: AgentTerminationReason = terminationReason ?? (
      status === "completed"
        ? { kind: "completed" }
        : status === "cancelled"
          ? { kind: "cancelled" }
          : status === "timeout"
            ? { kind: "timeout" }
            : { kind: "error" }
    );
    executionState.terminationReason = finalTerminationReason;

    executionState.runState =
      status === "completed"
        ? "completed"
        : status === "cancelled"
          ? "cancelled"
          : status === "timeout"
            ? "timed_out"
            : "failed";
    await createCheckpoint("run_completed");

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
    const modelFinalText =
      status === "error"
        ? ""
        : lastAssistant && lastAssistant.content.length > 0
          ? lastAssistant.content
          : fallbackText;
    const requiredToolExecutionResult = requiredToolExecution === undefined
      ? undefined
      : resolveRequiredToolExecutionResult(
          requiredToolExecution,
          toolCallEvidence,
          requiredCorrectionAttempts,
        );
    const finalText = requiredToolExecutionResult === undefined || status !== "completed"
      ? modelFinalText
      : requiredToolExecutionResult.status === "succeeded"
        ? modelFinalText
        : buildRequiredExecutionFinalText(requiredToolExecutionResult);

    const durationMs = Date.now() - startTime;
    const result: AgentRunResult = {
      runId,
      conversationId,
      status,
      terminationReason: finalTerminationReason,
      finalText,
      transcript: session.getMessages(),
      toolCallsCount,
      toolCallEvidence: toolCallEvidence.map((entry) => ({
        ...entry,
        arguments: { ...entry.arguments },
      })),
      ...(requiredToolExecutionResult === undefined
        ? {}
        : { requiredToolExecution: requiredToolExecutionResult }),
      roundsCount: stepCount,
      error: errorMsg,
      durationMs,
    };

    this.eventBus.emit({
      type: "agent:finished",
      runId,
      status,
      terminationReason: finalTerminationReason,
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
