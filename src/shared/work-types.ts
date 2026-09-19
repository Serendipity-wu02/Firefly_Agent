import type {
  AgentPlanStepCompletionRequirement,
  AgentRequiredToolExecution,
  AgentTerminationReason,
} from "./agent-types";
import type {
  WorkFileReadRequirement,
  WorkFileSelectionSnapshot,
} from "./work-file-types";

export type WorkPlanStepRequirement = AgentPlanStepCompletionRequirement;

export type WorkFileReadMode = "optional" | "required";

/** Explicit Main-owned choice; no natural-language inference is allowed. */
export interface WorkCreatePlanRequest {
  readonly task: string;
  readonly fileReadMode: WorkFileReadMode;
}

export interface WorkPlanStep {
  readonly description: string;
  readonly completionRequirement: WorkPlanStepRequirement;
  /** V1 pre-confirmation tool/parameter binding; absent on analysis steps. */
  readonly toolBinding?: AgentRequiredToolExecution;
}

export type WorkPlanGenerationErrorCode =
  | "cancelled"
  | "timeout"
  | "provider_error"
  | "invalid_output";

export interface WorkPlanGenerationSuccess {
  readonly ok: true;
  readonly steps: readonly WorkPlanStep[];
}

export interface WorkPlanGenerationFailure {
  readonly ok: false;
  readonly code: WorkPlanGenerationErrorCode;
  readonly message: string;
}

export type WorkPlanGenerationResult =
  | WorkPlanGenerationSuccess
  | WorkPlanGenerationFailure;

export type WorkTaskPhase =
  | "planning"
  | "awaiting_confirmation"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type WorkStepStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type WorkVerificationStatus = "success" | "failure" | "uncertain";

export interface WorkStepSnapshot extends WorkPlanStep {
  readonly index: number;
  readonly status: WorkStepStatus;
  readonly verificationStatus?: WorkVerificationStatus;
  readonly verificationReason?: string;
  readonly observation?: string;
}

export interface WorkTaskSnapshot {
  readonly taskId: string;
  readonly userPrompt: string;
  readonly browserRequestTargets: readonly string[];
  readonly fileSelection?: WorkFileSelectionSnapshot;
  readonly fileReadMode: WorkFileReadMode;
  readonly fileReadRequirement?: WorkFileReadRequirement;
  readonly phase: WorkTaskPhase;
  readonly proposalId?: string;
  readonly runId?: string;
  readonly planId?: string;
  readonly steps: readonly WorkStepSnapshot[];
  readonly currentStepIndex?: number;
  readonly cancelRequested: boolean;
  readonly terminationReason?: AgentTerminationReason;
  readonly finalText?: string;
  readonly error?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type WorkTaskOperationCode =
  | "busy"
  | "invalid_request"
  | "not_confirmable"
  | "cancel_unavailable"
  | "disposed"
  | "execution_failed";

export interface WorkTaskOperationSuccess {
  readonly ok: true;
  readonly snapshot: WorkTaskSnapshot;
}

export interface WorkTaskOperationFailure {
  readonly ok: false;
  readonly code: WorkTaskOperationCode;
  readonly message: string;
  readonly snapshot?: WorkTaskSnapshot;
}

export type WorkTaskOperationResult =
  | WorkTaskOperationSuccess
  | WorkTaskOperationFailure;

export type WorkMarkdownExportResult =
  | { readonly ok: true; readonly fileName: string }
  | { readonly ok: true; readonly cancelled: true }
  | {
      readonly ok: false;
      readonly code: "not_exportable" | "write_failed";
      readonly message: string;
    };
