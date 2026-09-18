export interface ContextBudgetConfig {
  contextWindowTokens: number;
  reservedOutputTokens: number;
  safetyMarginTokens: number;
  compactionThreshold: number;
  systemBudgetRatio: number;
  memoryBudgetRatio: number;
  ragBudgetRatio: number;
  conversationBudgetRatio: number;
}

export const DEFAULT_CONTEXT_BUDGET_CONFIG: ContextBudgetConfig = {
  contextWindowTokens: 128_000,
  reservedOutputTokens: 8_192,
  safetyMarginTokens: 512,
  compactionThreshold: 0.75,
  systemBudgetRatio: 0.2,
  memoryBudgetRatio: 0.15,
  ragBudgetRatio: 0.25,
  conversationBudgetRatio: 0.4,
};

export interface ContextUsageSnapshot {
  contextWindow: number;
  usableInputBudget: number;
  systemTokens: number;
  characterStateTokens: number;
  memoryTokens: number;
  ragTokens: number;
  toolSchemaTokens: number;
  conversationTokens: number;
  /** Token estimate for the exact message array sent to the Provider. */
  outgoingMessageTokens: number;
  totalInputTokens: number;
  pressureRatio: number;
  needsCompaction: boolean;
}

export interface SlotTokenBreakdown {
  systemTokens?: number;
  characterStateTokens?: number;
  memoryTokens?: number;
  ragTokens?: number;
  toolSchemaTokens?: number;
  conversationTokens?: number;
  outgoingMessageTokens?: number;
}

export function computeContextBudget(
  breakdown: SlotTokenBreakdown,
  config: ContextBudgetConfig = DEFAULT_CONTEXT_BUDGET_CONFIG,
): ContextUsageSnapshot {
  const systemTokens = breakdown.systemTokens || 0;
  const characterStateTokens = breakdown.characterStateTokens || 0;
  const memoryTokens = breakdown.memoryTokens || 0;
  const ragTokens = breakdown.ragTokens || 0;
  const toolSchemaTokens = breakdown.toolSchemaTokens || 0;
  const conversationTokens = breakdown.conversationTokens || 0;
  const outgoingMessageTokens = breakdown.outgoingMessageTokens;

  const usableInputBudget =
    config.contextWindowTokens - config.reservedOutputTokens - config.safetyMarginTokens;

  const totalInputTokens =
    (outgoingMessageTokens ?? (
      systemTokens +
      characterStateTokens +
      memoryTokens +
      ragTokens +
      conversationTokens
    )) +
    toolSchemaTokens;

  const pressureRatio = usableInputBudget > 0 ? totalInputTokens / usableInputBudget : 1.0;
  const needsCompaction = pressureRatio >= config.compactionThreshold;

  return {
    contextWindow: config.contextWindowTokens,
    usableInputBudget,
    systemTokens,
    characterStateTokens,
    memoryTokens,
    ragTokens,
    toolSchemaTokens,
    conversationTokens,
    outgoingMessageTokens: outgoingMessageTokens ?? (
      systemTokens +
      characterStateTokens +
      memoryTokens +
      ragTokens +
      conversationTokens
    ),
    totalInputTokens,
    pressureRatio,
    needsCompaction,
  };
}
