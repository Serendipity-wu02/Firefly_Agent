import type { ChatMessage } from "../../../shared/chat-types";
import type { ContextUsageSnapshot, HarnessConfig } from "../../../shared/harness-types";

export function estimateTokens(text: string): number {
  if (!text) return 0;
  // 简易 Token 估算：中文约 1.5 chars/token，英文约 4 chars/token -> 平均约 2 chars/token
  return Math.ceil(text.length / 2);
}

export function estimateMessageTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const m of messages) {
    total += estimateTokens(m.content || "");
    if (m.toolCalls) {
      total += estimateTokens(JSON.stringify(m.toolCalls));
    }
  }
  return total;
}

export function computeTokenBudget(
  systemPrompt: string,
  toolSchemas: Array<{ function: { name: string; description: string; parameters: object } }>,
  messages: ChatMessage[],
  config: HarnessConfig,
): ContextUsageSnapshot {
  const systemTokens = estimateTokens(systemPrompt);
  const schemaTokens = toolSchemas.reduce(
    (sum, s) =>
      sum +
      estimateTokens(
        s.function.name + s.function.description + JSON.stringify(s.function.parameters),
      ),
    0,
  );
  const messageTokens = estimateMessageTokens(messages);

  const usableInputBudget =
    config.contextWindowTokens - config.reservedOutputTokens - config.safetyMarginTokens;
  const estimatedInput = systemTokens + schemaTokens + messageTokens;

  return {
    usableInputBudget,
    estimatedInput,
    systemTokens,
    schemaTokens,
    messageTokens,
    needsCompaction: estimatedInput >= usableInputBudget * config.compactionThreshold,
  };
}

/**
 * 寻找配对安全切点（保证 assistant.toolCalls 与其 tool result 始终在同一段内）
 */
export function findPairedSafeCutIndex(
  messages: ChatMessage[],
  keepRecentCount: number = 4,
): number {
  if (messages.length <= keepRecentCount) return 0;

  let cut = messages.length - keepRecentCount;
  while (cut > 0) {
    const msg = messages[cut];
    // 如果当前切点落在 tool result 上，或者落在前一条是带 toolCalls 的 assistant 上，向前退
    if (msg.role === "tool") {
      cut--;
      continue;
    }
    const prev = messages[cut - 1];
    if (prev && prev.role === "assistant" && prev.toolCalls && prev.toolCalls.length > 0) {
      cut--;
      continue;
    }
    break;
  }
  return Math.max(0, cut);
}

export function compactMessagesIfNeeded(
  messages: ChatMessage[],
  systemPrompt: string,
  toolSchemas: Array<{ function: { name: string; description: string; parameters: object } }>,
  config: HarnessConfig,
): { messages: ChatMessage[]; compacted: boolean } {
  const budget = computeTokenBudget(systemPrompt, toolSchemas, messages, config);
  if (!budget.needsCompaction || messages.length <= config.compactionRetainCount + 2) {
    return { messages, compacted: false };
  }

  const system = messages.filter((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");

  const cutIndex = findPairedSafeCutIndex(nonSystem, config.compactionRetainCount);
  if (cutIndex <= 0) {
    return { messages, compacted: false };
  }

  const older = nonSystem.slice(0, cutIndex);
  const recent = nonSystem.slice(cutIndex);

  const summaryContent = `[前序对话历史摘要：开拓者与流萤进行了 ${older.length} 轮温馨交流与互动，关系融洽]`;
  const summaryMsg: ChatMessage = {
    id: `summary-${Date.now()}`,
    role: "system",
    content: summaryContent,
    timestamp: Date.now(),
  };

  return {
    messages: [...system, summaryMsg, ...recent],
    compacted: true,
  };
}
