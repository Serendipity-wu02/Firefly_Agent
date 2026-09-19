import type { PlanStep, StepVerificationResult } from "./plan-types";
import type { AgentToolCallEvidence } from "../../../shared/agent-types";
import { matchesRequiredToolExecution } from "../harness/tool-round";

/**
 * Transient evidence for the step currently being advanced. It is derived
 * from the Harness-owned current tool round and is not persisted as a second
 * plan fact store.
 */
export interface StepVerificationContext {
  readonly currentToolEvidence: readonly AgentToolCallEvidence[];
  /** Main Harness identity for excluding evidence from another run. */
  readonly currentRunId?: string;
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

      const currentEvidence = context.currentToolEvidence.filter((evidence) =>
        context.currentRunId === undefined || evidence.runId === context.currentRunId,
      );
      if (currentEvidence.length === 0) {
        return {
          status: "uncertain",
          reason: "Tool evidence belongs to another run and cannot satisfy this step.",
        };
      }

      const binding = _step.toolBinding;
      if (binding === undefined) {
        return {
          status: "uncertain",
          reason: "Tool step has no pre-declared tool and parameter binding.",
        };
      }

      const matchingEvidence = currentEvidence.filter((evidence) =>
        matchesRequiredToolExecution(
          {
            id: evidence.toolCallId,
            name: evidence.toolName,
            arguments: { ...evidence.arguments },
          },
          binding,
        ),
      );
      if (matchingEvidence.length === 0) {
        return {
          status: "failure",
          reason: "Current tool evidence does not match the step's declared tool and parameters.",
        };
      }

      const matchingFailure = matchingEvidence.find((evidence) =>
        evidence.outcome === "failure" || evidence.isError,
      );
      if (matchingFailure !== undefined) {
          return {
            status: "failure",
            reason: `The declared tool execution failed (${matchingFailure.outcome}).`,
          };
      }

      const matchingUncertain = matchingEvidence.find((evidence) =>
        evidence.outcome !== "success" || evidence.isError,
      );
      if (matchingUncertain !== undefined) {
        return {
          status: "uncertain",
          reason: `The declared tool execution is not confirmed (${matchingUncertain.outcome}).`,
        };
      }

      const invalidSuccessContract = matchingEvidence.find((evidence) => {
        try {
          const output: unknown = JSON.parse(evidence.output);
          return typeof output !== "object" || output === null || Array.isArray(output) ||
            (output as Record<string, unknown>).ok !== true;
        } catch {
          return true;
        }
      });
      if (invalidSuccessContract !== undefined) {
        return {
          status: "failure",
          reason: "The declared tool evidence did not satisfy the json_ok_true success contract.",
        };
      }

      const submittedOnly = matchingEvidence.some((evidence) => {
        try {
          const output: unknown = JSON.parse(evidence.output);
          return typeof output === "object" && output !== null && !Array.isArray(output) &&
            (output as Record<string, unknown>).commandSubmission === "accepted" &&
            (output as Record<string, unknown>).playerStateObservation !== "changed";
        } catch {
          return false;
        }
      });

      return {
        status: "success",
        reason: submittedOnly
          ? "The declared tool confirms command submission only; external state change is not proven."
          : "Current tool execution evidence confirms the declared tool and parameters.",
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
