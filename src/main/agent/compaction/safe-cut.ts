import type { ChatMessage } from "../../../shared/chat-types";

/**
 * PairedSafeCut (配对安全切点计算器)
 *
 * 核心法则：大模型 API（OpenAI/DeepSeek/Anthropic）严格要求 assistant.toolCalls
 * 与其紧随的 role: "tool" 结果必须成对出现。
 *
 * SafeCut 确保压缩切分点绝不拆散任何 assistant.toolCalls 与其对应的 tool 结果。
 */
export class PairedSafeCut {
  /**
   * 计算配对安全的切分索引 (Cut Index)
   *
   * @param nonSystemMessages 不含 system prompt 的消息历史
   * @param retainCount 目标保留的近期活跃轮次条数
   * @returns 安全的切分索引（0 表示无需切分或全量保留）
   */
  static findCutIndex(nonSystemMessages: ChatMessage[], retainCount: number = 4): number {
    if (!nonSystemMessages || nonSystemMessages.length <= retainCount) {
      return 0;
    }

    let cut = nonSystemMessages.length - retainCount;

    while (cut > 0) {
      const current = nonSystemMessages[cut];

      // 规则 1：切点不能落在 tool 结果消息上（否则会把前面的 assistant tool_call 截掉，导致孤立 tool 结果）
      if (current.role === "tool") {
        cut--;
        continue;
      }

      // 规则 2：切点前一条不能是携带 toolCalls 的 assistant（否则会导致 toolCalls 在切点前被截掉，而 tool 结果在切点后孤立）
      const prev = nonSystemMessages[cut - 1];
      if (prev && prev.role === "assistant" && prev.toolCalls && prev.toolCalls.length > 0) {
        cut--;
        continue;
      }

      // 已到达干净安全的上下文消息边界（例如 user 提问前或普通 assistant 回复前）
      break;
    }

    return Math.max(0, cut);
  }

  /**
   * 校验消息列表的 Tool Pair 完整性 (用于单测与安全审计)
   */
  static validateIntegrity(messages: ChatMessage[]): { valid: boolean; reason?: string } {
    const pendingToolCallIds = new Set<string>();

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
        if (pendingToolCallIds.size > 0) {
          return {
            valid: false,
            reason: `Line ${i}: Encountered new assistant toolCalls before previous tool results were resolved.`,
          };
        }
        for (const tc of msg.toolCalls) {
          pendingToolCallIds.add(tc.id);
        }
      } else if (msg.role === "tool") {
        if (!msg.toolCallId) {
          return { valid: false, reason: `Line ${i}: Tool message missing toolCallId.` };
        }
        if (!pendingToolCallIds.has(msg.toolCallId)) {
          return {
            valid: false,
            reason: `Line ${i}: Orphan tool message "${msg.toolCallId}" without preceding assistant toolCalls.`,
          };
        }
        pendingToolCallIds.delete(msg.toolCallId);
      } else if (msg.role === "user" && pendingToolCallIds.size > 0) {
        return {
          valid: false,
          reason: `Line ${i}: User message interrupted unresolved tool call pairs.`,
        };
      }
    }

    if (pendingToolCallIds.size > 0) {
      return {
        valid: false,
        reason: `Dangling assistant toolCalls without corresponding tool results: ${Array.from(pendingToolCallIds).join(", ")}`,
      };
    }

    return { valid: true };
  }
}
