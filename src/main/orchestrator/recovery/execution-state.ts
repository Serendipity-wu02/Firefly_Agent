import type { ToolState } from "../../runtime/execution/tool-policy";

export type ToolExecutionState = ToolState;

export type RunState =
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

export type StepState =
  | "pending"
  | "running"
  | "waiting_tool"
  | "waiting_llm"
  | "completed"
  | "failed"
  | "cancelled";

export type ToolSideEffectState =
  | "not_started"
  | "started"
  | "completed"
  | "failed"
  | "unknown";

export interface ActiveToolCallState {
  toolCallId: string;
  name: string;
  arguments: Record<string, unknown>;
  status: ToolExecutionState;
  sideEffectState: ToolSideEffectState;
  output?: string;
  error?: string;
}

import type { Plan } from "../planning/plan-types";

export interface RunExecutionState {
  runId: string;
  sessionId: string;
  step: number;
  runState: RunState;
  stepState: StepState;
  activeToolCalls: ActiveToolCallState[];
  recoveryAttempts: number;
  startedAt: number;
  updatedAt: number;
  plan?: Plan;
}

const VALID_RUN_TRANSITIONS: Record<RunState, RunState[]> = {
  idle: ["initializing", "cancelled", "failed"],
  initializing: ["running", "cancelled", "failed"],
  running: [
    "compacting",
    "recovering",
    "cancelling",
    "timed_out",
    "completed",
    "failed",
    "resumable",
  ],
  compacting: ["running", "failed", "cancelled"],
  recovering: ["running", "failed", "cancelled", "timed_out"],
  cancelling: ["cancelled", "failed"],
  cancelled: [], // 终态，不允许自动转换
  timed_out: ["resumable"],
  completed: [], // 终态
  failed: ["resumable"],
  resumable: ["initializing", "running"],
};

export function validateRunStateTransition(from: RunState, to: RunState): boolean {
  if (from === to) return true;
  const allowed = VALID_RUN_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}
