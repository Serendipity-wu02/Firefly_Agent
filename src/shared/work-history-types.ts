import type { AgentTerminationReason } from "./agent-types";
import type { WorkFileKind } from "./work-file-types";
import type {
  WorkFileReadMode,
  WorkPlanStepRequirement,
  WorkStepStatus,
  WorkTaskPhase,
  WorkVerificationStatus,
} from "./work-types";

/**
 * Main-owned retention contract.  Records live only in this application
 * process and are discarded when the process exits.
 */
export const WORK_HISTORY_LIMITS = Object.freeze({
  maxRecords: 20,
  maxTotalBytes: 512 * 1024,
} as const);

export type WorkHistoryTerminalPhase = Extract<
  WorkTaskPhase,
  "completed" | "failed" | "cancelled"
>;

export interface WorkHistoryFileSnapshot {
  readonly displayName: string;
  readonly fileKind: WorkFileKind;
  readonly byteLength: number;
  readonly symbolicLink: boolean;
}

export interface WorkHistoryFileSelectionSnapshot {
  readonly files: readonly WorkHistoryFileSnapshot[];
  readonly totalBytes: number;
}

export interface WorkHistoryStepSnapshot {
  readonly index: number;
  readonly description: string;
  readonly completionRequirement: WorkPlanStepRequirement;
  readonly toolName?: string;
  readonly plannedOperation?: string;
  readonly status: WorkStepStatus;
  readonly verificationStatus?: WorkVerificationStatus;
  readonly verificationReason?: string;
}

/**
 * Safe terminal projection for history display and export.  It deliberately
 * excludes proposal/run/plan identifiers, file identities, read requirements,
 * tool arguments, observations, permissions, handles and file bodies.
 */
export interface WorkHistoryRecord {
  readonly historyId: string;
  readonly taskId: string;
  readonly userPrompt: string;
  readonly fileReadMode: WorkFileReadMode;
  readonly fileSelection?: WorkHistoryFileSelectionSnapshot;
  readonly phase: WorkHistoryTerminalPhase;
  readonly steps: readonly WorkHistoryStepSnapshot[];
  readonly finalText?: string;
  readonly terminationReason?: AgentTerminationReason;
  readonly error?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface WorkHistorySnapshot {
  readonly records: readonly WorkHistoryRecord[];
  readonly totalBytes: number;
  readonly limits: typeof WORK_HISTORY_LIMITS;
}
