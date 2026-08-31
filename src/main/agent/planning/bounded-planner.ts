import {
  DEFAULT_PLANNER_CONFIG,
  type Plan,
  type PlanResult,
  type PlanStep,
  type PlannerConfig,
  type StepVerificationResult,
} from "./plan-types";
import { StepVerifier } from "./step-verifier";

export class BoundedPlanner {
  private readonly config: PlannerConfig;
  private readonly verifier: StepVerifier;

  constructor(config?: Partial<PlannerConfig>, verifier?: StepVerifier) {
    this.config = { ...DEFAULT_PLANNER_CONFIG, ...(config || {}) };
    this.verifier = verifier || new StepVerifier();
  }

  getConfig(): PlannerConfig {
    return { ...this.config };
  }

  getVerifier(): StepVerifier {
    return this.verifier;
  }

  /**
   * 判断当前请求是否需要启用规划模式 (Direct vs Planning)
   */
  shouldPlan(prompt?: string, toolCount: number = 0, explicitFlag?: boolean): boolean {
    if (!this.config.enabled) return false;
    if (explicitFlag === true) return true;
    if (explicitFlag === false) return false;
    if (!prompt || prompt.trim().length === 0) return false;

    const lower = prompt.toLowerCase();

    // 复合多步骤关键词判定
    const multiStepKeywords = [
      "第一步",
      "第二步",
      "先",
      "然后",
      "接着",
      "最后",
      "计划",
      "步骤",
      "分步",
      "依次",
      "规划",
      "multi-step",
      "step by step",
      "plan",
    ];

    const hasMultiStepKeyword = multiStepKeywords.some((kw) => prompt.includes(kw) || lower.includes(kw));

    // 如果工具数量多且包含多步骤指示，或者直接匹配分步指示
    if (hasMultiStepKeyword && (prompt.includes("然后") || prompt.includes("并且") || prompt.includes("接着") || toolCount > 0)) {
      return true;
    }

    return false;
  }

  /**
   * 创建有限有界执行计划 (Bounded Plan)
   */
  createPlan(runId: string, goal: string, customSteps?: string[]): Plan {
    const planId = `plan-${runId}-${Date.now()}`;
    const rawStepDescriptions: string[] = [];

    if (customSteps && customSteps.length > 0) {
      rawStepDescriptions.push(...customSteps);
    } else {
      // 简单启发式拆分多步骤意图
      const cleaned = goal.replace(/^(请|帮我|麻烦)/, "");
      const splits = cleaned
        .split(/(?:，然后|，再|，接着|，最后|；|\n|;)/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      if (splits.length > 1) {
        rawStepDescriptions.push(...splits);
      } else {
        // 单个复合意图的默认双步骨架
        rawStepDescriptions.push(`分析并执行前置操作: ${goal}`, `综合结果并生成最终回复`);
      }
    }

    // 严格限制最大步数 (Bounded Limit)
    const boundedDescriptions = rawStepDescriptions.slice(0, this.config.maxSteps);

    const steps: PlanStep[] = boundedDescriptions.map((desc, idx) => ({
      stepId: `step-${idx + 1}-${Date.now()}`,
      index: idx,
      description: desc,
      status: idx === 0 ? "running" : "pending",
      dependsOn: idx > 0 ? [idx - 1] : undefined,
      startedAt: idx === 0 ? Date.now() : undefined,
    }));

    return {
      planId,
      runId,
      goal,
      steps,
      currentStepIndex: 0,
      status: "running",
      createdAt: Date.now(),
    };
  }

  /**
   * 推进步骤状态与验证
   */
  advanceStep(
    plan: Plan,
    observation: string,
    isError: boolean,
  ): {
    plan: Plan;
    verification: StepVerificationResult;
    action: "next" | "complete" | "fail" | "retry";
  } {
    if (plan.status === "cancelled" || plan.status === "failed") {
      return {
        plan,
        verification: { status: "failure", reason: `Plan is in terminal state: ${plan.status}` },
        action: "fail",
      };
    }

    const currentStep = plan.steps[plan.currentStepIndex];
    if (!currentStep) {
      plan.status = "completed";
      return {
        plan,
        verification: { status: "success" },
        action: "complete",
      };
    }

    const verification = this.verifier.verifyStep(currentStep, observation, isError);
    currentStep.observation = observation;
    currentStep.verification = verification;

    if (verification.status === "success") {
      currentStep.status = "completed";
      currentStep.completedAt = Date.now();

      if (plan.currentStepIndex + 1 < plan.steps.length) {
        plan.currentStepIndex++;
        const nextStep = plan.steps[plan.currentStepIndex];
        nextStep.status = "running";
        nextStep.startedAt = Date.now();
        return { plan, verification, action: "next" };
      } else {
        plan.status = "completed";
        plan.completedAt = Date.now();
        return { plan, verification, action: "complete" };
      }
    }

    if (verification.status === "failure") {
      currentStep.status = "failed";
      currentStep.completedAt = Date.now();
      plan.status = "failed";
      return { plan, verification, action: "fail" };
    }

    // Uncertain: 触发单步重试
    return { plan, verification, action: "retry" };
  }

  summarizePlanResult(plan: Plan, finalAnswer?: string, error?: string): PlanResult {
    const completedSteps = plan.steps.filter((s) => s.status === "completed").length;
    return {
      planId: plan.planId,
      status: plan.status,
      totalSteps: plan.steps.length,
      completedSteps,
      finalAnswer,
      error,
    };
  }
}
