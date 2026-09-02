import type { ChatMessage } from "../../../shared/chat-types";
import type {
  ActiveToolCallState,
  RunExecutionState,
  RunState,
  StepState,
} from "./execution-state";

export const CHECKPOINT_SCHEMA_VERSION = 1;

export type CheckpointTrigger =
  | "run_initialized"
  | "step_start"
  | "llm_completed"
  | "tool_round_completed"
  | "compaction_completed"
  | "recovery_started"
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
}

export interface ICheckpointPolicy {
  shouldCheckpoint(trigger: CheckpointTrigger, state: RunExecutionState): boolean;
}

export interface ICheckpointStore {
  save(checkpoint: Checkpoint): Promise<void> | void;
  get(checkpointId: string): Promise<Checkpoint | undefined> | Checkpoint | undefined;
  getByRunId(runId: string): Promise<Checkpoint[] | undefined> | Checkpoint[] | undefined;
  getLatestForRun(runId: string): Promise<Checkpoint | undefined> | Checkpoint | undefined;
  delete(checkpointId: string): Promise<boolean> | boolean;
  clear(): Promise<void> | void;
}
