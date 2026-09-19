import type { AgentEventBus } from "../orchestrator/agent-events";
import type {
  AgentRunResult,
  AgentTerminationReason,
} from "../../shared/agent-types";
import type {
  MainPlanExecutionResult,
  MainRequiredPlanRequest,
} from "../orchestrator/planning/plan-execution-entry";
import { extractBrowserUserTargetUrls } from "../browser/browser-user-targets";
import type {
  WorkPlanGenerationResult,
  WorkStepSnapshot,
  WorkTaskOperationResult,
  WorkTaskPhase,
  WorkTaskSnapshot,
  WorkVerificationStatus,
} from "../../shared/work-types";

export interface WorkAgentCore {
  getEventBus(): AgentEventBus;
  proposeRequiredPlan(
    userPrompt: string,
    signal?: AbortSignal,
    browserRequestTargets?: readonly string[],
  ): Promise<WorkPlanGenerationResult>;
  runRequiredPlan(request: unknown): Promise<MainPlanExecutionResult>;
  cancel(runId: string): boolean;
}

export interface WorkTaskCoordinatorOptions {
  readonly agentCore: WorkAgentCore;
  readonly onChanged?: (snapshot: WorkTaskSnapshot) => void;
  readonly onActivityChanged?: (active: boolean) => void;
}

interface MutableWorkStep {
  readonly index: number;
  readonly description: string;
  readonly completionRequirement: WorkStepSnapshot["completionRequirement"];
  readonly toolBinding?: WorkStepSnapshot["toolBinding"];
  status: WorkStepSnapshot["status"];
  observation?: string;
  verificationStatus?: WorkVerificationStatus;
  verificationReason?: string;
}

interface MutableWorkTask {
  readonly taskId: string;
  readonly userPrompt: string;
  readonly browserRequestTargets: readonly string[];
  readonly createdAt: number;
  phase: WorkTaskPhase;
  proposalId?: string;
  runId?: string;
  planId?: string;
  steps: MutableWorkStep[];
  currentStepIndex?: number;
  cancelRequested: boolean;
  terminationReason?: AgentTerminationReason;
  error?: string;
  updatedAt: number;
  proposalConsumed: boolean;
}

function isActivePhase(phase: WorkTaskPhase): boolean {
  return phase === "planning" || phase === "awaiting_confirmation" || phase === "running";
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneSnapshot(task: MutableWorkTask | null): WorkTaskSnapshot | null {
  if (task === null) return null;
  return {
    taskId: task.taskId,
    userPrompt: task.userPrompt,
    browserRequestTargets: [...task.browserRequestTargets],
    phase: task.phase,
    ...(task.proposalId === undefined ? {} : { proposalId: task.proposalId }),
    ...(task.runId === undefined ? {} : { runId: task.runId }),
    ...(task.planId === undefined ? {} : { planId: task.planId }),
    steps: task.steps.map((step) => ({
      index: step.index,
      description: step.description,
      completionRequirement: step.completionRequirement,
      ...(step.toolBinding === undefined
        ? {}
        : {
            toolBinding: {
              ...step.toolBinding,
              arguments: { ...step.toolBinding.arguments },
            },
          }),
      status: step.status,
      ...(step.verificationStatus === undefined ? {} : { verificationStatus: step.verificationStatus }),
      ...(step.verificationReason === undefined ? {} : { verificationReason: step.verificationReason }),
      ...(step.observation === undefined ? {} : { observation: step.observation }),
    })),
    ...(task.currentStepIndex === undefined ? {} : { currentStepIndex: task.currentStepIndex }),
    cancelRequested: task.cancelRequested,
    ...(task.terminationReason === undefined ? {} : { terminationReason: task.terminationReason }),
    ...(task.error === undefined ? {} : { error: task.error }),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function isTerminalPhase(phase: WorkTaskPhase): boolean {
  return phase === "completed" || phase === "failed" || phase === "cancelled";
}

export class WorkTaskCoordinator {
  private readonly agentCore: WorkAgentCore;
  private readonly onChanged: (snapshot: WorkTaskSnapshot) => void;
  private readonly onActivityChanged: (active: boolean) => void;
  private readonly removeEventListener: () => void;
  private currentTask: MutableWorkTask | null = null;
  private planningController: AbortController | null = null;
  private disposed = false;
  private lastActivity = false;

  constructor(options: WorkTaskCoordinatorOptions) {
    this.agentCore = options.agentCore;
    this.onChanged = options.onChanged ?? (() => undefined);
    this.onActivityChanged = options.onActivityChanged ?? (() => undefined);
    this.removeEventListener = this.agentCore.getEventBus().onAny((event) => {
      this.handleAgentEvent(event);
    });
  }

  getSnapshot(): WorkTaskSnapshot | null {
    return cloneSnapshot(this.currentTask);
  }

  async createPlan(input: unknown): Promise<WorkTaskOperationResult> {
    if (this.disposed) {
      return { ok: false, code: "disposed", message: "Work is no longer available." };
    }
    if (this.currentTask !== null && isActivePhase(this.currentTask.phase)) {
      return {
        ok: false,
        code: "busy",
        message: "Another Work task is already planning or running.",
        snapshot: cloneSnapshot(this.currentTask) ?? undefined,
      };
    }
    if (typeof input !== "string" || input.trim().length === 0) {
      return { ok: false, code: "invalid_request", message: "Work requires a non-empty task." };
    }

    const userPrompt = input;
    const createdAt = Date.now();
    const task: MutableWorkTask = {
      taskId: createId("work-task"),
      userPrompt,
      browserRequestTargets: extractBrowserUserTargetUrls(userPrompt),
      phase: "planning",
      steps: [],
      cancelRequested: false,
      createdAt,
      updatedAt: createdAt,
      proposalConsumed: false,
    };
    this.currentTask = task;
    this.planningController = new AbortController();
    this.publish();

    const planningController = this.planningController;
    let generated: WorkPlanGenerationResult;
    try {
      generated = await this.agentCore.proposeRequiredPlan(
        userPrompt,
        planningController.signal,
        task.browserRequestTargets,
      );
    } catch (error: unknown) {
      this.planningController = null;
      if (this.disposed || this.currentTask !== task) {
        return { ok: false, code: "disposed", message: "Work was disposed before planning completed." };
      }
      if (task.phase !== "planning" || planningController.signal.aborted) {
        return {
          ok: false,
          code: "cancel_unavailable",
          message: "Work planning ended before a proposal could be confirmed.",
          snapshot: cloneSnapshot(task) ?? undefined,
        };
      }
      task.phase = "failed";
      task.error = error instanceof Error ? error.message : String(error);
      task.updatedAt = Date.now();
      this.publish();
      return {
        ok: false,
        code: "execution_failed",
        message: task.error,
        snapshot: cloneSnapshot(task) ?? undefined,
      };
    }
    this.planningController = null;

    if (this.disposed || this.currentTask !== task) {
      return { ok: false, code: "disposed", message: "Work was disposed before planning completed." };
    }
    if (task.phase !== "planning") {
      return {
        ok: false,
        code: "cancel_unavailable",
        message: "Work planning ended before a proposal could be confirmed.",
        snapshot: cloneSnapshot(task) ?? undefined,
      };
    }
    if (!generated.ok) {
      task.phase = generated.code === "cancelled" ? "cancelled" : "failed";
      task.error = generated.message;
      task.updatedAt = Date.now();
      this.publish();
      return {
        ok: false,
        code: generated.code === "cancelled" ? "cancel_unavailable" : "execution_failed",
        message: generated.message,
        snapshot: cloneSnapshot(task) ?? undefined,
      };
    }

    if (generated.steps.some((step) =>
      (step.completionRequirement === "tool" && step.toolBinding === undefined) ||
      (step.completionRequirement === "analysis" && step.toolBinding !== undefined),
    )) {
      task.phase = "failed";
      task.error = "The Work proposal contained an invalid tool binding.";
      task.updatedAt = Date.now();
      this.publish();
      return {
        ok: false,
        code: "execution_failed",
        message: task.error,
        snapshot: cloneSnapshot(task) ?? undefined,
      };
    }

    task.proposalId = createId("work-proposal");
    task.steps = generated.steps.map((step, index) => ({
      index,
      description: step.description,
      completionRequirement: step.completionRequirement,
      ...(step.toolBinding === undefined
        ? {}
        : {
            toolBinding: {
              ...step.toolBinding,
              arguments: { ...step.toolBinding.arguments },
            },
          }),
      status: "pending",
    }));
    task.currentStepIndex = 0;
    task.phase = "awaiting_confirmation";
    task.updatedAt = Date.now();
    this.publish();
    return { ok: true, snapshot: cloneSnapshot(task)! };
  }

  async confirmPlan(proposalId: unknown): Promise<WorkTaskOperationResult> {
    const task = this.currentTask;
    if (this.disposed) {
      return { ok: false, code: "disposed", message: "Work is no longer available." };
    }
    if (
      task === null ||
      task.phase !== "awaiting_confirmation" ||
      task.proposalConsumed ||
      typeof proposalId !== "string" ||
      proposalId !== task.proposalId
    ) {
      return {
        ok: false,
        code: "not_confirmable",
        message: "This Work proposal is not available for confirmation.",
        snapshot: cloneSnapshot(task) ?? undefined,
      };
    }

    task.proposalConsumed = true;
    task.phase = "running";
    task.runId = createId("work-run");
    task.updatedAt = Date.now();
    const request: MainRequiredPlanRequest = {
      planExecutionMode: "required",
      userPrompt: task.userPrompt,
      steps: task.steps.map((step) => ({
        description: step.description,
        completionRequirement: step.completionRequirement,
        ...(step.toolBinding === undefined
          ? {}
          : {
              toolBinding: {
                ...step.toolBinding,
                arguments: { ...step.toolBinding.arguments },
              },
            }),
      })),
      runId: task.runId,
      browserRequestTargets: [...task.browserRequestTargets],
    };
    this.publish();

    try {
      const execution = await this.agentCore.runRequiredPlan(request);
      if (this.currentTask !== task || this.disposed) {
        return { ok: false, code: "disposed", message: "Work was disposed while the task was running." };
      }
      this.applyExecutionResult(task, execution);
      this.publish();
      return { ok: true, snapshot: cloneSnapshot(task)! };
    } catch (error: unknown) {
      if (this.currentTask !== task || this.disposed) {
        return { ok: false, code: "disposed", message: "Work was disposed while the task was running." };
      }
      task.phase = "failed";
      task.error = error instanceof Error ? error.message : String(error);
      task.updatedAt = Date.now();
      this.publish();
      return {
        ok: false,
        code: "execution_failed",
        message: task.error,
        snapshot: cloneSnapshot(task) ?? undefined,
      };
    }
  }

  async cancel(): Promise<WorkTaskOperationResult> {
    const task = this.currentTask;
    if (this.disposed) {
      return { ok: false, code: "disposed", message: "Work is no longer available." };
    }
    if (task === null || isTerminalPhase(task.phase)) {
      return {
        ok: false,
        code: "cancel_unavailable",
        message: "There is no active Work task to cancel.",
        snapshot: cloneSnapshot(task) ?? undefined,
      };
    }
    if (task.phase === "planning") {
      this.planningController?.abort();
      task.phase = "cancelled";
      task.cancelRequested = true;
      task.updatedAt = Date.now();
      this.publish();
      return { ok: true, snapshot: cloneSnapshot(task)! };
    }
    if (task.phase === "awaiting_confirmation") {
      task.phase = "cancelled";
      task.cancelRequested = true;
      task.updatedAt = Date.now();
      this.publish();
      return { ok: true, snapshot: cloneSnapshot(task)! };
    }
    if (task.runId === undefined || !this.agentCore.cancel(task.runId)) {
      return {
        ok: false,
        code: "cancel_unavailable",
        message: "The Work run was not available for cancellation.",
        snapshot: cloneSnapshot(task) ?? undefined,
      };
    }
    task.cancelRequested = true;
    task.updatedAt = Date.now();
    this.publish();
    return { ok: true, snapshot: cloneSnapshot(task)! };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.planningController?.abort();
    if (this.currentTask?.phase === "running" && this.currentTask.runId !== undefined) {
      this.agentCore.cancel(this.currentTask.runId);
    }
    this.removeEventListener();
    this.onActivityChanged(false);
    this.lastActivity = false;
  }

  private applyExecutionResult(task: MutableWorkTask, execution: MainPlanExecutionResult): void {
    if (!execution.ok) {
      task.phase = "failed";
      task.error = `${execution.code}: ${execution.message}`;
      task.updatedAt = Date.now();
      return;
    }
    this.applyAgentResult(task, execution.result);
  }

  private applyAgentResult(task: MutableWorkTask, result: AgentRunResult): void {
    task.terminationReason = result.terminationReason;
    task.error = result.error;
    if (result.status === "completed") task.phase = "completed";
    else if (result.status === "cancelled") task.phase = "cancelled";
    else task.phase = "failed";
    task.updatedAt = Date.now();
  }

  private handleAgentEvent(event: Parameters<AgentEventBus["onAny"]>[0] extends (event: infer E) => void ? E : never): void {
    const task = this.currentTask;
    if (
      task === null ||
      task.runId === undefined ||
      !("runId" in event) ||
      event.runId !== task.runId
    ) return;

    if (event.type === "plan:created") {
      task.planId = event.planId;
    } else if (event.type === "plan:step-start") {
      task.planId = event.planId;
      task.currentStepIndex = event.stepIndex;
      const step = task.steps[event.stepIndex];
      if (step) step.status = "running";
    } else if (event.type === "plan:verification") {
      const step = task.steps[event.stepIndex];
      if (step) {
        const result = event.result;
        if (result === "success" || result === "failure" || result === "uncertain") {
          step.verificationStatus = result;
        }
        step.verificationReason = event.result;
      }
    } else if (event.type === "plan:step-completed") {
      const step = task.steps[event.stepIndex];
      if (step) {
        step.status = "completed";
        step.observation = event.observation;
      }
    } else if (event.type === "plan:step-failed") {
      const step = task.steps[event.stepIndex];
      if (step) {
        step.status = "failed";
        step.verificationStatus = "failure";
        step.verificationReason = event.reason;
      }
    } else if (event.type === "agent:finished") {
      if (event.status !== "running") {
        task.terminationReason = event.terminationReason;
      }
    }
    task.updatedAt = Date.now();
    this.publish();
  }

  private publish(): void {
    if (this.currentTask === null) return;
    const snapshot = cloneSnapshot(this.currentTask);
    if (snapshot === null) return;
    const active = isActivePhase(snapshot.phase);
    if (active !== this.lastActivity) {
      this.lastActivity = active;
      this.onActivityChanged(active);
    }
    this.onChanged(snapshot);
  }
}
