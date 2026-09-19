import type { PlanStep, StepVerificationResult } from "./plan-types";
import type { AgentToolCallEvidence } from "../../../shared/agent-types";

/**
 * Transient evidence for the step currently being advanced. It is derived
 * from the Harness-owned current tool round and is not persisted as a second
 * plan fact store.
 */
export interface StepVerificationContext {
  readonly currentToolEvidence: readonly AgentToolCallEvidence[];
}

export class StepVerifier {
  verifyStep(
    _step: PlanStep,
    observation: string,
    isError: boolean,
    context: StepVerificationContext,
  ): StepVerificationResult {
    if (isError) {
      return {
        status: "failure",
        reason: "Execution returned an error status.",
      };
    }

    const completionRequirement = _step.completionRequirement;
    if (completionRequirement === undefined) {
      return {
        status: "uncertain",
        reason: "Step completion requirement is unspecified.",
      };
    }

    if (completionRequirement !== "analysis" && completionRequirement !== "tool") {
      return {
        status: "uncertain",
        reason: "Step completion requirement is unsupported.",
      };
    }

    if (completionRequirement === "tool") {
      if (context.currentToolEvidence.length === 0) {
        return {
          status: "uncertain",
          reason: "No current tool execution evidence was recorded for this step.",
        };
      }

      const invalidEvidence = context.currentToolEvidence.find((evidence) =>
        evidence.outcome !== "success" || evidence.isError,
      );
      if (invalidEvidence !== undefined) {
        if (invalidEvidence.outcome === "failure" || invalidEvidence.isError) {
          return {
            status: "failure",
            reason: `Current tool execution failed (${invalidEvidence.outcome}).`,
          };
        }
        return {
          status: "uncertain",
          reason: `Current tool execution is not confirmed (${invalidEvidence.outcome}).`,
        };
      }

      return {
        status: "success",
        reason: "Current tool execution evidence confirms this step.",
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
