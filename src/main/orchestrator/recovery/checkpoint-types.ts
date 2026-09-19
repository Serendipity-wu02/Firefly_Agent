import type { ChatMessage } from "../../../shared/chat-types";
import type { AgentTerminationReason } from "../../../shared/agent-types";
import type {
  ActiveToolCallState,
  RunExecutionState,
  RunState,
  StepState,
} from "./execution-state";
import type { ResumeCheckpointFacts } from "./resume-types";

export const CHECKPOINT_SCHEMA_VERSION = 1;

export type CheckpointTrigger =
  | "run_initialized"
  | "step_start"
  | "llm_completed"
  | "waiting_permission"
  | "tool_round_completed"
  | "compaction_completed"
  | "recovery_started"
  | "resumable"
  | "run_completed"
  | "manual";

import type { Plan } from "../planning/plan-types";

export interface Checkpoint {
  checkpointId: string;
  runId: string;
  sessionId: string;
  step: number;
  runState: RunState;
  stepState: StepState;
  messages: ChatMessage[];
  activeToolCalls: ActiveToolCallState[];
  recoveryAttempts: number;
  createdAt: number;
  version: number;
  trigger: CheckpointTrigger;
  plan?: Plan;
  providerMetadata?: Record<string, unknown>;
  terminationReason?: AgentTerminationReason;
  /** Present only on a newly created, same-process R2 resumable snapshot. */
  resumeFacts?: ResumeCheckpointFacts;
}

export type CheckpointReadResult =
  | { readonly kind: "found"; readonly checkpoint: Checkpoint }
  | { readonly kind: "not_found"; readonly checkpointId: string }
  | {
      readonly kind: "read_error";
      readonly checkpointId: string;
      readonly errorCode: "io_error";
    }
  | { readonly kind: "invalid_format"; readonly checkpointId: string }
  | {
      readonly kind: "unsupported_version";
      readonly checkpointId: string;
      readonly version: unknown;
    };

export interface ICheckpointPolicy {
  shouldCheckpoint(trigger: CheckpointTrigger, state: RunExecutionState): boolean;
}

export interface ICheckpointStore {
  save(checkpoint: Checkpoint): Promise<void> | void;
  read(checkpointId: string): Promise<CheckpointReadResult> | CheckpointReadResult;
  get(checkpointId: string): Promise<Checkpoint | undefined> | Checkpoint | undefined;
  getByRunId(runId: string): Promise<Checkpoint[] | undefined> | Checkpoint[] | undefined;
  getLatestForRun(runId: string): Promise<Checkpoint | undefined> | Checkpoint | undefined;
  delete(checkpointId: string): Promise<boolean> | boolean;
  clear(): Promise<void> | void;
}
