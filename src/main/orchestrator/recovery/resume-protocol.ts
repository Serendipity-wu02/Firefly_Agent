import type { ChatMessage } from "../../../shared/chat-types";
import { CHECKPOINT_SCHEMA_VERSION, type Checkpoint } from "./checkpoint-types";

import type { Plan } from "../planning/plan-types";

export interface ResumeEvaluation {
  canResume: boolean;
  resumeStep: number;
  sanitizedMessages: ChatMessage[];
  restoredPlan?: Plan;
  reason?: string;
}

/**
 * ResumeProtocol (快照安全恢复协议)
 *
 * 核心法则：
 * 1. 已完成 (completed) 与主动取消 (cancelled) 的任务绝对禁止恢复；
 * 2. 状态未知 (unknown) 或中断中 (started) 的工具调用，在恢复时注入明确的中断标记，
 *    彻底防止因断电/崩溃重启引发重复的外部副作用 (Side Effect Safety)。
 */
export class ResumeProtocol {
  static evaluate(checkpoint: Checkpoint): ResumeEvaluation {
    // 1. 状态合法性校验
    if (checkpoint.runState === "completed") {
      return {
        canResume: false,
        resumeStep: checkpoint.step,
        sanitizedMessages: [],
        reason: "Run has already completed successfully.",
      };
    }

    if (checkpoint.runState === "cancelled") {
      return {
        canResume: false,
        resumeStep: checkpoint.step,
        sanitizedMessages: [],
        reason: "Run was manually cancelled by user and cannot be resumed.",
      };
    }

    if (checkpoint.version !== CHECKPOINT_SCHEMA_VERSION) {
      return {
        canResume: false,
        resumeStep: checkpoint.step,
        sanitizedMessages: [],
        reason: `Checkpoint version mismatch (Expected: ${CHECKPOINT_SCHEMA_VERSION}, got: ${checkpoint.version}).`,
      };
    }

    const messages = checkpoint.messages ? [...checkpoint.messages] : [];

    // 2. 副作用安全性审计与未决工具调用修补 (Side Effect Safety)
    const existingToolResultIds = new Set(
      messages.filter((m) => m.role === "tool" && m.toolCallId).map((m) => m.toolCallId!),
    );

    for (const activeTc of checkpoint.activeToolCalls || []) {
      if (!existingToolResultIds.has(activeTc.toolCallId)) {
        // 工具在崩溃前处于 started / unknown 状态，注入明确的中断错误，防止重启时盲目二次触发
        messages.push({
          id: `tool-interrupted-${activeTc.toolCallId}`,
          role: "tool",
          toolCallId: activeTc.toolCallId,
          content: JSON.stringify({
            ok: false,
            error: "interrupted_prior_to_completion",
            message: `Tool execution for "${activeTc.name}" was interrupted by system interruption before completion.`,
          }),
          timestamp: Date.now(),
        });
      }
    }

    return {
      canResume: true,
      resumeStep: checkpoint.step,
      sanitizedMessages: messages,
      restoredPlan: checkpoint.plan ? JSON.parse(JSON.stringify(checkpoint.plan)) : undefined,
    };
  }
}
