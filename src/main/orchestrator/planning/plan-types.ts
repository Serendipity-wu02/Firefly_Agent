export type PlanStatus =
  | "draft"
  | "ready"
  | "running"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

export type PlanStepStatus =
  | "pending"
  | "running"
  | "waiting_llm"
  | "waiting_tool"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export type StepVerificationStatus = "success" | "failure" | "uncertain";

export interface StepVerificationResult {
  status: StepVerificationStatus;
  reason?: string;
}

export interface PlanStep {
  stepId: string;
  index: number;
  description: string;
  status: PlanStepStatus;
  dependsOn?: number[];
  observation?: string;
  verification?: StepVerificationResult;
  startedAt?: number;
  completedAt?: number;
}

export interface Plan {
  planId: string;
  runId: string;
  goal: string;
  steps: PlanStep[];
  currentStepIndex: number;
  status: PlanStatus;
  createdAt: number;
  completedAt?: number;
}

export interface PlanResult {
  planId: string;
  status: PlanStatus;
  totalSteps: number;
  completedSteps: number;
  finalAnswer?: string;
  error?: string;
}

export interface PlannerConfig {
  maxSteps: number;
  maxPlanFailures: number;
  maxVerificationAttempts: number;
  enabled: boolean;
}

export const DEFAULT_PLANNER_CONFIG: PlannerConfig = {
  maxSteps: 5,
  maxPlanFailures: 2,
  maxVerificationAttempts: 2,
  enabled: true,
};
