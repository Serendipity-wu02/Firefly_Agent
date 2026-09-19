import type {
  AgentPlanStepCompletionRequirement,
  AgentTerminationReason,
} from "./agent-types";

export type WorkPlanStepRequirement = AgentPlanStepCompletionRequirement;

export interface WorkPlanStep {
  readonly description: string;
  readonly completionRequirement: WorkPlanStepRequirement;
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
  readonly phase: WorkTaskPhase;
  readonly proposalId?: string;
  readonly runId?: string;
  readonly planId?: string;
  readonly steps: readonly WorkStepSnapshot[];
  readonly currentStepIndex?: number;
  readonly cancelRequested: boolean;
  readonly terminationReason?: AgentTerminationReason;
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
