import type { CheckpointTrigger, ICheckpointPolicy } from "./checkpoint-types";
import type { RunExecutionState } from "./execution-state";

export interface CheckpointPolicyOptions {
  enabled?: boolean;
  triggers?: CheckpointTrigger[];
}

export const DEFAULT_CHECKPOINT_TRIGGERS: CheckpointTrigger[] = [
  "run_initialized",
  "step_start",
  "llm_completed",
  "tool_round_completed",
  "compaction_completed",
  "recovery_started",
  "run_completed",
];

export class DefaultCheckpointPolicy implements ICheckpointPolicy {
  private readonly enabled: boolean;
  private readonly triggers: Set<CheckpointTrigger>;

  constructor(options: CheckpointPolicyOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.triggers = new Set(options.triggers || DEFAULT_CHECKPOINT_TRIGGERS);
  }

  shouldCheckpoint(trigger: CheckpointTrigger, _state: RunExecutionState): boolean {
    if (!this.enabled) return false;
    return this.triggers.has(trigger);
  }
}
