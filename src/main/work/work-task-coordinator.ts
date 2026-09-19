import fs from "node:fs/promises";
import path from "node:path";
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
  WorkCreatePlanRequest,
  WorkFileReadMode,
  WorkMarkdownExportResult,
  WorkPlanGenerationResult,
  WorkStepSnapshot,
  WorkTaskOperationResult,
  WorkTaskPhase,
  WorkTaskSnapshot,
  WorkVerificationStatus,
} from "../../shared/work-types";
import { renderWorkMarkdown } from "../../shared/work-markdown";
import {
  WorkFileSelectionError,
  WorkFileSelectionStore,
} from "./work-file-selection-store";
import type {
  WorkFileReadRequirement,
  WorkFileSelectionBinding,
  WorkFileSelectionOperationResult,
  WorkFileSelectionSnapshot,
} from "../../shared/work-file-types";
import { createWorkFileReadRequirement } from "../../shared/work-file-types";
import type { WorkDiagnosticSink } from "./work-diagnostics";

export interface WorkAgentCore {
  getEventBus(): AgentEventBus;
  proposeRequiredPlan(
    userPrompt: string,
    signal?: AbortSignal,
    browserRequestTargets?: readonly string[],
    fileSelection?: WorkFileSelectionSnapshot,
    fileReadRequirement?: WorkFileReadRequirement,
  ): Promise<WorkPlanGenerationResult>;
  runRequiredPlan(request: unknown): Promise<MainPlanExecutionResult>;
  cancel(runId: string): boolean;
}

export interface WorkTaskCoordinatorOptions {
  readonly agentCore: WorkAgentCore;
  readonly onChanged?: (snapshot: WorkTaskSnapshot) => void;
  readonly onActivityChanged?: (active: boolean) => void;
  readonly fileSelectionStore?: WorkFileSelectionStore;
  readonly bindFileSelectionToSandbox?: (
    runId: string,
    selection: WorkFileSelectionSnapshot,
  ) => () => void;
  readonly diagnosticSink?: WorkDiagnosticSink;
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
  readonly fileReadMode: WorkFileReadMode;
  readonly fileSelection?: WorkFileSelectionSnapshot;
  readonly fileReadRequirement?: WorkFileReadRequirement;
  readonly createdAt: number;
  phase: WorkTaskPhase;
  proposalId?: string;
  runId?: string;
  planId?: string;
  steps: MutableWorkStep[];
  currentStepIndex?: number;
  cancelRequested: boolean;
  terminationReason?: AgentTerminationReason;
  finalText?: string;
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
    ...(task.fileSelection === undefined ? {} : { fileSelection: task.fileSelection }),
    fileReadMode: task.fileReadMode,
    ...(task.fileReadRequirement === undefined
      ? {}
      : {
          fileReadRequirement: {
            selectionId: task.fileReadRequirement.selectionId,
            fileSelectionId: task.fileReadRequirement.fileSelectionId,
            fileIds: [...task.fileReadRequirement.fileIds],
          },
        }),
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
    ...(task.finalText === undefined ? {} : { finalText: task.finalText }),
    ...(task.error === undefined ? {} : { error: task.error }),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function isTerminalPhase(phase: WorkTaskPhase): boolean {
  return phase === "completed" || phase === "failed" || phase === "cancelled";
}

function isWorkCreatePlanRequest(value: unknown): value is WorkCreatePlanRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.task === "string" && record.task.trim().length > 0 &&
    (record.fileReadMode === "optional" || record.fileReadMode === "required");
}

function hasRequiredFileReadEvidence(
  result: AgentRunResult,
  runId: string,
  requirement: WorkFileReadRequirement,
): boolean {
  const evidence = result.toolCallEvidence ?? [];
  return requirement.fileIds.every((fileId) => evidence.some((entry) => {
    if (entry.runId !== runId || entry.toolName !== "file_read" ||
        entry.outcome !== "success" || entry.isError) return false;
    if (entry.arguments.selectionId !== requirement.selectionId ||
        entry.arguments.fileId !== fileId) return false;
    let output: unknown;
    try {
      output = JSON.parse(entry.output);
    } catch {
      return false;
    }
    if (typeof output !== "object" || output === null || Array.isArray(output)) return false;
    const record = output as Record<string, unknown>;
    return record.ok === true &&
      record.selectionId === requirement.selectionId &&
      record.fileSelectionId === requirement.fileSelectionId &&
      record.fileId === fileId &&
      record.complete === true &&
      record.contentTruncated === false &&
      record.integrity === "verified" &&
      record.encoding === "utf-8" &&
      record.untrustedContent === true &&
      typeof record.body === "string";
  }));
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
  private readonly fileSelectionStore?: WorkFileSelectionStore;
  private readonly bindFileSelectionToSandbox?: WorkTaskCoordinatorOptions["bindFileSelectionToSandbox"];
  private readonly diagnosticSink?: WorkDiagnosticSink;
  private currentFileSelection?: WorkFileSelectionSnapshot;
  private fileScopeLease: (() => void) | undefined;

  constructor(options: WorkTaskCoordinatorOptions) {
    this.agentCore = options.agentCore;
    this.onChanged = options.onChanged ?? (() => undefined);
    this.onActivityChanged = options.onActivityChanged ?? (() => undefined);
    this.fileSelectionStore = options.fileSelectionStore;
    this.bindFileSelectionToSandbox = options.bindFileSelectionToSandbox;
    this.diagnosticSink = options.diagnosticSink;
    this.removeEventListener = this.agentCore.getEventBus().onAny((event) => {
      this.handleAgentEvent(event);
    });
  }

  getSnapshot(): WorkTaskSnapshot | null {
    return cloneSnapshot(this.currentTask);
  }

  getCurrentFileSelection(): WorkFileSelectionSnapshot | undefined {
    return this.currentFileSelection;
  }

  async exportMarkdown(targetPath: string): Promise<WorkMarkdownExportResult> {
    const task = this.currentTask;
    if (
      this.disposed ||
      task === null ||
      !isTerminalPhase(task.phase) ||
      typeof targetPath !== "string" ||
      targetPath.trim().length === 0
    ) {
      return {
        ok: false,
        code: "not_exportable",
        message: "只有已结束的 Work 任务可以导出 Markdown。",
      };
    }

    const snapshot = cloneSnapshot(task);
    if (snapshot === null) {
      return {
        ok: false,
        code: "not_exportable",
        message: "当前没有可导出的 Work 任务。",
      };
    }

    try {
      await fs.writeFile(targetPath, renderWorkMarkdown(snapshot), { encoding: "utf8" });
      return { ok: true, fileName: path.basename(targetPath) };
    } catch (error: unknown) {
      return {
        ok: false,
        code: "write_failed",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async selectFiles(filePaths: readonly string[]): Promise<WorkFileSelectionOperationResult> {
    if (this.disposed) {
      return { ok: false, code: "selection_failed", message: "Work is no longer available." };
    }
    if (this.fileSelectionStore === undefined) {
      return { ok: false, code: "selection_failed", message: "Work file selection is not configured." };
    }
    if (this.currentTask !== null && isActivePhase(this.currentTask.phase)) {
      return {
        ok: false,
        code: "selection_busy",
        message: "Files cannot be reselected while a Work proposal or run is active.",
        ...(this.currentFileSelection === undefined ? {} : { selection: this.currentFileSelection }),
      };
    }
    const previousSelection = this.currentFileSelection;
    try {
      const selection = await this.fileSelectionStore.createSelection(filePaths);
      if (previousSelection !== undefined) {
        this.fileSelectionStore.releaseSelection(previousSelection.selectionId);
      }
      this.currentFileSelection = selection;
      this.diagnosticSink?.record({
        type: "selection_created",
        selectionId: selection.selectionId,
        fileIds: selection.files.map((file) => file.fileId),
        fileCount: selection.files.length,
        totalBytes: selection.totalBytes,
      });
      return { ok: true, selection };
    } catch (error: unknown) {
      return {
        ok: false,
        code: "selection_failed",
        message: error instanceof WorkFileSelectionError
          ? error.message
          : error instanceof Error ? error.message : String(error),
        ...(this.currentFileSelection === undefined ? {} : { selection: this.currentFileSelection }),
      };
    }
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
    if (!isWorkCreatePlanRequest(input)) {
      return {
        ok: false,
        code: "invalid_request",
        message: "Work requires a task and an explicit fileReadMode.",
      };
    }

    const userPrompt = input.task;
    if (input.fileReadMode === "required" && this.currentFileSelection === undefined) {
      return {
        ok: false,
        code: "invalid_request",
        message: "fileReadMode=required needs a current file selection.",
      };
    }
    const fileReadRequirement = input.fileReadMode === "required" && this.currentFileSelection !== undefined
      ? createWorkFileReadRequirement(this.currentFileSelection)
      : undefined;
    const createdAt = Date.now();
    const task: MutableWorkTask = {
      taskId: createId("work-task"),
      userPrompt,
      browserRequestTargets: extractBrowserUserTargetUrls(userPrompt),
      phase: "planning",
      fileReadMode: input.fileReadMode,
      ...(input.fileReadMode !== "required" || this.currentFileSelection === undefined
        ? {}
        : { fileSelection: this.currentFileSelection }),
      ...(fileReadRequirement === undefined ? {} : { fileReadRequirement }),
      steps: [],
      cancelRequested: false,
      createdAt,
      updatedAt: createdAt,
      proposalConsumed: false,
    };
    this.currentTask = task;
    this.diagnosticSink?.record({
      type: "plan_started",
      taskId: task.taskId,
      selectionId: task.fileReadRequirement?.selectionId,
      fileIds: task.fileReadRequirement?.fileIds,
      fileReadMode: task.fileReadMode,
    });
    this.planningController = new AbortController();
    this.publish();

    const planningController = this.planningController;
    let generated: WorkPlanGenerationResult;
    try {
      generated = await this.agentCore.proposeRequiredPlan(
        userPrompt,
        planningController.signal,
        task.browserRequestTargets,
        task.fileSelection,
        task.fileReadRequirement,
      );
    } catch (error: unknown) {
      this.planningController = null;
      if (this.disposed || this.currentTask !== task) {
        if (task.fileSelection !== undefined) {
          this.releaseTaskFileSelection(task);
          this.fileSelectionStore?.releaseSelection(task.fileSelection.selectionId);
        }
        return { ok: false, code: "disposed", message: "Work was disposed before planning completed." };
      }
      if (task.phase !== "planning" || planningController.signal.aborted) {
        if (task.fileSelection !== undefined) {
          this.releaseTaskFileSelection(task);
          this.fileSelectionStore?.releaseSelection(task.fileSelection.selectionId);
        }
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
      if (task.fileSelection !== undefined) {
        this.releaseTaskFileSelection(task);
        this.fileSelectionStore?.releaseSelection(task.fileSelection.selectionId);
      }
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
      if (task.fileSelection !== undefined) {
        this.releaseTaskFileSelection(task);
        this.fileSelectionStore?.releaseSelection(task.fileSelection.selectionId);
      }
      return { ok: false, code: "disposed", message: "Work was disposed before planning completed." };
    }
    if (task.phase !== "planning") {
      if (task.fileSelection !== undefined) {
        this.releaseTaskFileSelection(task);
        this.fileSelectionStore?.releaseSelection(task.fileSelection.selectionId);
      }
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
      if (task.fileSelection !== undefined) {
        this.releaseTaskFileSelection(task);
        this.fileSelectionStore?.releaseSelection(task.fileSelection.selectionId);
      }
      this.publish();
      this.diagnosticSink?.record({
        type: "plan_finished",
        taskId: task.taskId,
        selectionId: task.fileReadRequirement?.selectionId,
        fileIds: task.fileReadRequirement?.fileIds,
        fileReadMode: task.fileReadMode,
        ok: false,
        errorCode: generated.code,
      });
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
      if (task.fileSelection !== undefined) {
        this.releaseTaskFileSelection(task);
        this.fileSelectionStore?.releaseSelection(task.fileSelection.selectionId);
      }
      this.publish();
      return {
        ok: false,
        code: "execution_failed",
        message: task.error,
        snapshot: cloneSnapshot(task) ?? undefined,
      };
    }

    const fileReadSteps = generated.steps.filter((step) => step.toolBinding?.toolName === "file_read");
    if (task.fileReadRequirement === undefined && fileReadSteps.length > 0) {
      task.phase = "failed";
      task.error = "A file_read step requires an explicit file-read requirement.";
      task.updatedAt = Date.now();
      this.publish();
      return {
        ok: false,
        code: "execution_failed",
        message: task.error,
        snapshot: cloneSnapshot(task) ?? undefined,
      };
    }
    if (task.fileReadRequirement !== undefined &&
        !task.fileReadRequirement.fileIds.every((fileId) => fileReadSteps.some((step) =>
          step.toolBinding?.arguments.fileId === fileId,
        ))) {
      task.phase = "failed";
      task.error = "The Work proposal did not include a file_read step for every required file.";
      task.updatedAt = Date.now();
      this.releaseTaskFileSelection(task);
      if (task.fileSelection !== undefined) {
        this.fileSelectionStore?.releaseSelection(task.fileSelection.selectionId);
      }
      this.publish();
      return {
        ok: false,
        code: "execution_failed",
        message: task.error,
        snapshot: cloneSnapshot(task) ?? undefined,
      };
    }

    task.proposalId = createId("work-proposal");
    if (task.fileSelection !== undefined &&
        (this.fileSelectionStore === undefined ||
          !this.fileSelectionStore.bindProposal(task.fileSelection.selectionId, task.proposalId))) {
      task.phase = "failed";
      task.error = "The selected file scope could not be bound to this proposal.";
      task.updatedAt = Date.now();
      this.releaseTaskFileSelection(task);
      this.fileSelectionStore?.releaseSelection(task.fileSelection.selectionId);
      this.publish();
      return {
        ok: false,
        code: "execution_failed",
        message: task.error,
        snapshot: cloneSnapshot(task) ?? undefined,
      };
    }
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
    this.diagnosticSink?.record({
      type: "plan_finished",
      taskId: task.taskId,
      selectionId: task.fileReadRequirement?.selectionId,
      fileIds: task.fileReadRequirement?.fileIds,
      fileReadMode: task.fileReadMode,
      toolNames: task.steps.flatMap((step) => step.toolBinding?.toolName ?? []),
      toolCallCount: task.steps.filter((step) => step.toolBinding !== undefined).length,
      ok: true,
    });
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
    this.diagnosticSink?.record({
      type: "run_started",
      taskId: task.taskId,
      runId: task.runId,
      selectionId: task.fileReadRequirement?.selectionId,
      fileIds: task.fileReadRequirement?.fileIds,
      fileReadMode: task.fileReadMode,
    });
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
      ...(task.fileSelection === undefined
        ? {}
        : {
            fileSelection: {
              selectionId: task.fileSelection.selectionId,
              fileSelectionId: task.fileSelection.fileSelectionId,
              fileIds: task.fileSelection.files.map((file) => file.fileId),
            } satisfies WorkFileSelectionBinding,
          }),
      ...(task.fileReadRequirement === undefined
        ? {}
        : {
            fileReadRequirement: {
              selectionId: task.fileReadRequirement.selectionId,
              fileSelectionId: task.fileReadRequirement.fileSelectionId,
              fileIds: [...task.fileReadRequirement.fileIds],
            },
          }),
    };
    if (task.fileSelection !== undefined &&
        (this.fileSelectionStore === undefined ||
          !this.fileSelectionStore.bindRun(
            task.fileSelection.selectionId,
            proposalId,
            task.runId,
          ))) {
      task.phase = "failed";
      task.error = "The selected file scope could not be bound to this execution run.";
      this.fileSelectionStore?.releaseProposal(task.fileSelection.selectionId, proposalId);
      this.fileSelectionStore?.releaseSelection(task.fileSelection.selectionId);
      this.releaseTaskFileSelection(task);
      task.updatedAt = Date.now();
      this.publish();
      return {
        ok: false,
        code: "execution_failed",
        message: task.error,
        snapshot: cloneSnapshot(task) ?? undefined,
      };
    }
    if (task.fileSelection !== undefined && this.bindFileSelectionToSandbox !== undefined) {
      try {
        this.fileScopeLease = this.bindFileSelectionToSandbox(task.runId, task.fileSelection);
      } catch (error: unknown) {
        this.fileSelectionStore?.releaseRun(task.runId);
        this.fileSelectionStore?.releaseSelection(task.fileSelection.selectionId);
        this.releaseTaskFileSelection(task);
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
    } finally {
      if (task.fileSelection !== undefined && task.runId !== undefined) {
        this.fileScopeLease?.();
        this.fileScopeLease = undefined;
        this.fileSelectionStore?.releaseRun(task.runId);
        if (this.currentFileSelection?.selectionId === task.fileSelection.selectionId) {
          this.currentFileSelection = undefined;
        }
      }
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
      this.releaseTaskFileSelection(task);
      if (task.fileSelection !== undefined) {
        this.fileSelectionStore?.releaseSelection(task.fileSelection.selectionId);
      }
      this.publish();
      return { ok: true, snapshot: cloneSnapshot(task)! };
    }
    if (task.phase === "awaiting_confirmation") {
      task.phase = "cancelled";
      task.cancelRequested = true;
      task.updatedAt = Date.now();
      if (task.fileSelection !== undefined && task.proposalId !== undefined) {
        this.fileSelectionStore?.releaseProposal(task.fileSelection.selectionId, task.proposalId);
      }
      this.releaseTaskFileSelection(task);
      if (task.fileSelection !== undefined) {
        this.fileSelectionStore?.releaseSelection(task.fileSelection.selectionId);
      }
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
    this.fileScopeLease?.();
    this.fileScopeLease = undefined;
    this.removeEventListener();
    this.fileSelectionStore?.dispose();
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

  private releaseTaskFileSelection(task: MutableWorkTask): void {
    if (task.fileSelection === undefined) return;
    if (this.currentFileSelection?.selectionId === task.fileSelection.selectionId) {
      this.currentFileSelection = undefined;
    }
  }

  private applyAgentResult(task: MutableWorkTask, result: AgentRunResult): void {
    task.terminationReason = result.terminationReason;
    task.finalText = result.finalText;
    task.error = result.error;
    if (result.status === "completed" && task.fileReadRequirement !== undefined &&
        task.runId !== undefined && !hasRequiredFileReadEvidence(result, task.runId, task.fileReadRequirement)) {
      task.phase = "failed";
      task.terminationReason = { kind: "error" };
      task.error = "required_file_read_evidence_missing: the run completed without successful evidence for every required file.";
    } else if (result.status === "completed") task.phase = "completed";
    else if (result.status === "cancelled") task.phase = "cancelled";
    else task.phase = "failed";
    task.updatedAt = Date.now();
    this.diagnosticSink?.record({
      type: "run_finished",
      taskId: task.taskId,
      runId: task.runId,
      selectionId: task.fileReadRequirement?.selectionId,
      fileIds: task.fileReadRequirement?.fileIds,
      fileReadMode: task.fileReadMode,
      status: task.phase,
      ok: task.phase === "completed",
    });
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
