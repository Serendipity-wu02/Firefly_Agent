import type { AgentToolCallEvidence } from "../../../shared/agent-types";
import type { CompactionTaskFactsMessageIdentity } from "../compaction/task-facts";
import type {
  ProviderFailureBoundary,
} from "./provider-failure-boundary";

/** The only resume facts format implemented by the same-process R2 batch. */
export const RESUME_FACTS_VERSION = 1 as const;

/** A process-local monotonic clock identity; it is not portable across restarts. */
export const RESUME_MONOTONIC_CLOCK_ID =
  `firefly-process-${process.pid}-${Math.random().toString(36).slice(2)}`;

export interface ResumeBudgetSnapshot {
  readonly version: typeof RESUME_FACTS_VERSION;
  readonly originalMaxRounds: number;
  readonly originalMaxToolCalls: number;
  readonly originalDelegatedStepsLimit: 0;
  readonly consumedRounds: number;
  readonly consumedToolCalls: number;
  readonly consumedDelegatedSteps: 0;
  readonly consumedRecoveryAttempts: number;
  readonly monotonicClockId: string;
  readonly monotonicDeadline?: number;
}

/** Immutable execution facts captured only for a newly created R2 snapshot. */
export interface ResumeCheckpointFacts {
  readonly protocol: "r2";
  readonly version: typeof RESUME_FACTS_VERSION;
  /** Stable chain identity of the original user run. */
  readonly originRunId: string;
  /** The execution run that captured this particular checkpoint. */
  readonly executionRunId: string;
  readonly generation: number;
  readonly parentCheckpointId?: string;
  readonly userPrompt: string;
  readonly source: "user";
  readonly executionProfileKind: "MAIN";
  readonly toolBoundary: "none";
  readonly approvalBoundary: "none";
  readonly delegationBoundary: "none";
  /**
   * New R2 fact.  Required plans are intentionally not resumable until plan
   * facts are part of the restore contract; existing snapshots may omit this
   * optional marker and retain ordinary R2 semantics.
   */
  readonly planExecutionMode?: "assist" | "required";
  readonly taskFactsSequence: number;
  readonly taskFactsMessageIdentity: CompactionTaskFactsMessageIdentity;
  readonly completedToolEvidence: readonly AgentToolCallEvidence[];
  readonly budget: ResumeBudgetSnapshot;
  readonly pendingProviderFailure: ProviderFailureBoundary;
}

/** Internal-only one-shot control used by deterministic Harness tests. */
export interface RecoveryTestControl {
  requestStopForRun(runId: string): void;
  consumeStopForResume(
    runId: string,
    boundary: ProviderFailureBoundary,
  ): boolean;
  clearRun(runId: string): void;
}

export type ResumeClaimFailureCode = "resume_already_claimed" | "resume_chain_claimed";

export type ResumeClaimResult =
  | { readonly ok: true; readonly ownerRunId: string }
  | {
      readonly ok: false;
      readonly code: ResumeClaimFailureCode;
      readonly message: string;
    };
