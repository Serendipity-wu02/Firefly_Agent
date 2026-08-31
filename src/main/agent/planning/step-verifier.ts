import type { PlanStep, StepVerificationResult } from "./plan-types";

export class StepVerifier {
  verifyStep(_step: PlanStep, observation: string, isError: boolean): StepVerificationResult {
    if (isError) {
      return {
        status: "failure",
        reason: "Execution returned an error status.",
      };
    }

    if (!observation || observation.trim().length === 0) {
      return {
        status: "uncertain",
        reason: "Observation is empty or inconclusive.",
      };
    }

    const trimmed = observation.trim();

    // 检查结构化错误标记
    if (
      trimmed.includes('"ok":false') ||
      trimmed.includes('"ok": false') ||
      trimmed.includes('"error"') ||
      trimmed.includes("interrupted_prior_to_completion")
    ) {
      return {
        status: "failure",
        reason: "Observation contains error indications.",
      };
    }

    return {
      status: "success",
    };
  }
}
