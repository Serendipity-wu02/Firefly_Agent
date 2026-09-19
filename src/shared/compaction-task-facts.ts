import type {
  AgentRequiredToolExecution,
  AgentRequiredToolExecutionStatus,
  AgentRunSource,
  AgentToolCallEvidence,
  ToolCallOutcome,
} from "./agent-types";
import type {
  WorkFileReadRequirement,
  WorkFileSelectionBinding,
} from "./work-file-types";

export const COMPACTION_TASK_FACTS_SCHEMA_VERSION = 1 as const;
export const COMPACTION_TASK_FACTS_BUDGET_ERROR = "context_task_facts_exceed_budget" as const;
export const COMPACTION_INPUT_BUDGET_ERROR = "context_input_exceeds_budget" as const;
export const COMPACTION_STRUCTURED_RESULT_BUDGET_ERROR =
  "context_structured_result_exceed_budget" as const;

export type CompactionTaskFactsStatus = "retained" | "exceeded_budget";

export type CompactionRunState =
  | "idle"
  | "initializing"
  | "running"
  | "compacting"
  | "recovering"
  | "cancelling"
  | "cancelled"
  | "timed_out"
  | "completed"
  | "failed"
  | "resumable";

export type CompactionStepState =
  | "pending"
  | "running"
  | "waiting_tool"
  | "waiting_permission"
  | "waiting_llm"
  | "completed"
  | "failed"
  | "cancelled";

export type CompactionToolState =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "denied";

export type CompactionSideEffectState =
  | "not_started"
  | "started"
  | "completed"
  | "failed"
  | "unknown";

export type CompactionPlanStatus =
  | "draft"
  | "ready"
  | "running"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

export type CompactionPlanStepStatus =
  | "pending"
  | "running"
  | "waiting_llm"
  | "waiting_tool"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export type CompactionStepVerificationStatus = "success" | "failure" | "uncertain";

export interface CompactionStructuredObservation {
  readonly ok?: boolean;
  readonly error?: string | CompactionStructuredError;
  readonly status?: string;
  readonly reason?: string;
  readonly message?: string;
  readonly messageTruncated?: boolean;
  readonly outcome?: string;
  readonly commandSubmission?: string;
  readonly requestUrl?: string;
  readonly sourceUrl?: string;
  readonly finalUrl?: string;
  readonly httpStatus?: number;
  readonly contentType?: string;
  readonly title?: string;
  readonly titleTruncated?: boolean;
  readonly bodyPreview?: string;
  readonly bodyPreviewTruncated?: boolean;
  readonly bodyTruncated?: boolean;
  readonly selectionId?: string;
  readonly fileSelectionId?: string;
  readonly fileId?: string;
  readonly displayName?: string;
  readonly displayNameTruncated?: boolean;
  readonly fileKind?: "text" | "markdown";
  readonly byteLength?: number;
  readonly bytesRead?: number;
  readonly bodyCodePoints?: number;
  readonly complete?: boolean;
  readonly contentTruncated?: boolean;
  readonly integrity?: "verified" | "unverified" | "changed" | "failed";
  readonly encoding?: "utf-8";
  readonly untrustedContent?: true;
}

/**
 * Structured error information retained during context projection.  The
 * fields are deliberately data, not instructions; a nested error is never
 * replaced by a generic pruning marker.
 */
export interface CompactionStructuredError {
  readonly [key: string]: unknown;
  readonly code?: string;
  readonly type?: string;
  readonly name?: string;
  readonly message?: string;
  readonly details?: unknown;
  readonly detailsTruncated?: boolean;
}

export interface CompactionToolEvidence {
  readonly runId: string;
  readonly sequence: number;
  readonly step: number;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly assistantMessageId?: string;
  readonly toolMessageId?: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly outcome: ToolCallOutcome;
  readonly isError: boolean;
  readonly observation?: CompactionStructuredObservation;
}

export interface CompactionActiveToolFact {
  readonly toolCallId: string;
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly status: CompactionToolState;
  readonly sideEffectState: CompactionSideEffectState;
}

export interface CompactionRequiredToolFact {
  readonly requirement: AgentRequiredToolExecution;
  readonly status: AgentRequiredToolExecutionStatus;
  readonly correctionAttempts: number;
  readonly callObserved: boolean;
}

export interface CompactionPlanStepFact {
  readonly stepId: string;
  readonly index: number;
  readonly description: string;
  /** Main-owned immutable execution target copied into the assistant plan fact. */
  readonly toolBinding?: AgentRequiredToolExecution;
  readonly status: CompactionPlanStepStatus;
  readonly dependsOn?: readonly number[];
  readonly observation?: string;
  readonly observationTruncated?: boolean;
  readonly verification?: {
    readonly status: CompactionStepVerificationStatus;
    readonly reason?: string;
    readonly reasonTruncated?: boolean;
  };
}

export interface CompactionPlanFact {
  readonly planId: string;
  readonly runId: string;
  readonly goal: string;
  readonly status: CompactionPlanStatus;
  readonly currentStepIndex: number;
  readonly steps: readonly CompactionPlanStepFact[];
}

export interface CompactionTaskFactsV1 {
  readonly schemaVersion: typeof COMPACTION_TASK_FACTS_SCHEMA_VERSION;
  readonly runId: string;
  readonly sequence: number;
  readonly source: AgentRunSource;
  readonly authoritativeUser?: {
    readonly originalPrompt: string;
  };
  readonly internalTrigger?: {
    readonly prompt: string;
  };
  readonly trustedExecutionConstraints: {
    readonly browserRequestTargets: readonly string[];
    readonly requiredToolExecution?: AgentRequiredToolExecution;
    readonly fileSelection?: WorkFileSelectionBinding;
    readonly fileReadRequirement?: WorkFileReadRequirement;
  };
  readonly currentRunEvidence: readonly CompactionToolEvidence[];
  readonly unfinishedWork: {
    readonly runState?: CompactionRunState;
    readonly stepState?: CompactionStepState;
    readonly step?: number;
    readonly recoveryAttempts?: number;
    readonly activeToolCalls: readonly CompactionActiveToolFact[];
    readonly requiredTool?: CompactionRequiredToolFact;
  };
  readonly modelPlan?: CompactionPlanFact;
  readonly untrustedObservations: readonly {
    readonly sequence: number;
    readonly toolCallId: string;
    readonly source: "tool_result";
    readonly reason: "untrusted_external_content";
  }[];
}

export type CompactionTaskFactsInput = {
  readonly runId: string;
  readonly sequence: number;
  readonly source: AgentRunSource;
  readonly userPrompt: string;
  readonly browserRequestTargets?: readonly string[];
  readonly fileSelection?: WorkFileSelectionBinding;
  readonly fileReadRequirement?: WorkFileReadRequirement;
  readonly requiredToolExecution?: AgentRequiredToolExecution;
  readonly requiredToolCallObserved: boolean;
  readonly requiredToolStatus?: AgentRequiredToolExecutionStatus;
  readonly requiredCorrectionAttempts: number;
  readonly toolCallEvidence: readonly AgentToolCallEvidence[];
  readonly activeToolCalls?: readonly CompactionActiveToolFact[];
  readonly runState?: CompactionRunState;
  readonly stepState?: CompactionStepState;
  readonly step?: number;
  readonly recoveryAttempts?: number;
  readonly plan?: CompactionPlanFact;
};
