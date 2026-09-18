import type { ChatMessage } from "../../../shared/chat-types";
import type { AgentResumeRejectionCode } from "../../../shared/agent-types";
import { CHECKPOINT_SCHEMA_VERSION, type Checkpoint } from "./checkpoint-types";

import type { Plan } from "../planning/plan-types";

export interface ResumeEvaluation {
  canResume: boolean;
  resumeStep: number;
  sanitizedMessages: ChatMessage[];
  restoredPlan?: Plan;
  reason?: string;
  rejectionCode?: AgentResumeRejectionCode;
}

/**
 * ResumeProtocol (快照安全恢复协议)
 *
 * Resume V1 is fail-closed. Schema V1 does not contain the immutable execution
 * binding required to re-enter the Harness, so it remains readable for
 * diagnostics but cannot start a new Provider or tool execution.
 */
export class ResumeProtocol {
  static evaluate(checkpoint: Checkpoint): ResumeEvaluation {
    if (checkpoint.version !== CHECKPOINT_SCHEMA_VERSION) {
      return {
        canResume: false,
        resumeStep: checkpoint.step,
        sanitizedMessages: [],
        rejectionCode: "checkpoint_unsupported_version",
        reason: `Checkpoint version mismatch (Expected: ${CHECKPOINT_SCHEMA_VERSION}, got: ${checkpoint.version}).`,
      };
    }

    if (checkpoint.runState === "completed") {
      return {
        canResume: false,
        resumeStep: checkpoint.step,
        sanitizedMessages: [],
        rejectionCode: "checkpoint_terminal",
        reason: "Run has already completed successfully.",
      };
    }

    if (checkpoint.runState === "cancelled") {
      return {
        canResume: false,
        resumeStep: checkpoint.step,
        sanitizedMessages: [],
        rejectionCode: "checkpoint_terminal",
        reason: "Run was manually cancelled by user and cannot be resumed.",
      };
    }

    if (checkpoint.runState === "failed" || checkpoint.runState === "timed_out") {
      return {
        canResume: false,
        resumeStep: checkpoint.step,
        sanitizedMessages: [],
        rejectionCode: "checkpoint_terminal",
        reason: `Run is in terminal state "${checkpoint.runState}" and cannot be resumed by Resume V1.`,
      };
    }

    return {
      canResume: false,
      resumeStep: checkpoint.step,
      sanitizedMessages: [],
      rejectionCode: "checkpoint_facts_missing",
      reason:
        "Checkpoint lacks the immutable execution facts required by Resume V1; the snapshot remains diagnostic-only.",
    };
  }
}
