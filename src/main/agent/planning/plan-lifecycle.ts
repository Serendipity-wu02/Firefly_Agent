import type { Plan, PlanStatus, PlanStepStatus } from "./plan-types";

const VALID_PLAN_TRANSITIONS: Record<PlanStatus, PlanStatus[]> = {
  draft: ["ready", "cancelled", "failed"],
  ready: ["running", "cancelled", "failed"],
  running: ["blocked", "completed", "failed", "cancelled", "timed_out"],
  blocked: ["running", "failed", "cancelled"],
  completed: [], // 终态
  failed: [], // 终态
  cancelled: [], // 终态
  timed_out: [], // 终态
};

const VALID_STEP_TRANSITIONS: Record<PlanStepStatus, PlanStepStatus[]> = {
  pending: ["running", "cancelled", "failed"],
  running: ["waiting_llm", "waiting_tool", "verifying", "completed", "failed", "cancelled"],
  waiting_llm: ["running", "verifying", "failed", "cancelled"],
  waiting_tool: ["running", "verifying", "failed", "cancelled"],
  verifying: ["completed", "failed", "running", "cancelled"],
  completed: [],
  failed: ["pending", "running"], // 允许一次有限重新执行
  cancelled: [],
};

export function validatePlanStatusTransition(from: PlanStatus, to: PlanStatus): boolean {
  if (from === to) return true;
  const allowed = VALID_PLAN_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function validateStepStatusTransition(from: PlanStepStatus, to: PlanStepStatus): boolean {
  if (from === to) return true;
  const allowed = VALID_STEP_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * 将当前计划结构格式化为 LLM-visible Context Slot
 */
export function formatPlanContext(plan: Plan): string {
  const lines: string[] = [
    `目标 (Goal): ${plan.goal}`,
    `当前状态: ${plan.status.toUpperCase()} (当前第 ${plan.currentStepIndex + 1}/${plan.steps.length} 步)`,
    "执行步骤列表:",
  ];

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const isCurrent = i === plan.currentStepIndex;
    const marker =
      step.status === "completed"
        ? "[√ 完成]"
        : isCurrent
          ? "[► 进行中]"
          : step.status === "failed"
            ? "[× 失败]"
            : "[  待执行]";

    lines.push(`  ${i + 1}. ${marker} ${step.description}`);
    if (step.observation) {
      const shortObs =
        step.observation.length > 200
          ? `${step.observation.slice(0, 200)}...`
          : step.observation;
      lines.push(`     → 步骤产出/观察: ${shortObs}`);
    }
  }

  return lines.join("\n");
}
