import type { ChatMessage } from "../../../shared/chat-types";
import type { CharacterStateData } from "../../../shared/firefly-state";
import { SystemPromptBuilder } from "./system-prompt-builder";
import { TokenMeter } from "./token-meter";
import {
  computeContextBudget,
  DEFAULT_CONTEXT_BUDGET_CONFIG,
  type ContextBudgetConfig,
  type ContextUsageSnapshot,
} from "./context-budget";
import {
  ContextCompactor,
  type CompactionResult,
  type CompactionStrategy,
  type CompactorOptions,
} from "../compaction/compactor";

export interface ContextProjectionOptions {
  userPrompt: string;
  history?: ChatMessage[];
  characterState?: CharacterStateData;
  memoryContext?: string;
  ragContext?: string;
  planContext?: string;
  systemPromptOverride?: string;
  toolSchemas?: Array<{
    type?: string;
    function: { name: string; description: string; parameters?: unknown };
  }>;
  budgetConfig?: ContextBudgetConfig;
  compactorOptions?: Partial<CompactorOptions>;
  forceCompactionStrategy?: CompactionStrategy;
}

export interface ProjectedContext {
  messages: ChatMessage[];
  systemPrompt: string;
  usage: ContextUsageSnapshot;
  compactionResult: CompactionResult;
}

/**
 * ContextProjector (上下文物化投影器 - Integrated with Compaction)
 *
 * 负责将 System Prompt、插槽上下文与历史记录物化为大模型输入所需的 ChatMessage[] 数组，
 * 并在 Context Pressure 超过安全阈值时自动实施配对保护式压缩 (Compaction)。
 */
export class ContextProjector {
  constructor(private readonly tokenMeter: TokenMeter = new TokenMeter()) {}

  /**
   * 物化生成初始消息列表、Token 使用快照与压缩结果
   */
  project(options: ContextProjectionOptions): ProjectedContext {
    const budgetConfig = options.budgetConfig || DEFAULT_CONTEXT_BUDGET_CONFIG;

    // 1. 确定 System Prompt 内容 (优先使用显式 Override，否则使用 SystemPromptBuilder 组装)
    let systemPrompt =
      options.systemPromptOverride ||
      SystemPromptBuilder.build({
        state: options.characterState,
        memoryContext: options.memoryContext,
        ragContext: options.ragContext,
      });

    if (options.planContext && options.planContext.trim().length > 0) {
      systemPrompt += `\n\n【当前任务执行计划】\n${options.planContext.trim()}`;
    }

    const systemMessage: ChatMessage = {
      id: "system-1",
      role: "system",
      content: systemPrompt,
      timestamp: Date.now(),
    };

    // 2. 组装原始对话历史 (防御性拷贝，不污染传入数组)
    const history = options.history ? options.history.map((m) => ({ ...m })) : [];

    // 若历史末尾不是当前 userPrompt，安全追加当前用户输入
    const lastMsg = history[history.length - 1];
    if (!lastMsg || lastMsg.role !== "user" || lastMsg.content !== options.userPrompt) {
      history.push({
        id: `user-${Date.now()}`,
        role: "user",
        content: options.userPrompt,
        timestamp: Date.now(),
      });
    }

    const rawMessages = [systemMessage, ...history];

    // 3. 计算初始 Token 配额与上下文压力快照
    const systemTokens = this.tokenMeter.estimateTokens(systemPrompt);
    const characterStateTokens = this.tokenMeter.estimateTokens(
      SystemPromptBuilder.buildStateString(options.characterState),
    );
    const memoryTokens = options.memoryContext
      ? this.tokenMeter.estimateTokens(options.memoryContext)
      : 0;
    const ragTokens = options.ragContext ? this.tokenMeter.estimateTokens(options.ragContext) : 0;
    const toolSchemaTokens = options.toolSchemas
      ? this.tokenMeter.estimateSchemaTokens(options.toolSchemas)
      : 0;
    const conversationTokens = this.tokenMeter.estimateMessageTokens(history);

    let usage = computeContextBudget(
      {
        systemTokens,
        characterStateTokens,
        memoryTokens,
        ragTokens,
        toolSchemaTokens,
        conversationTokens,
      },
      budgetConfig,
    );

    // 4. 执行 Compaction 评估与压缩
    let compactionResult: CompactionResult;
    const force = options.forceCompactionStrategy;

    if (force === "emergency") {
      compactionResult = ContextCompactor.emergencyCompact(rawMessages, options.compactorOptions);
    } else if (force === "hard") {
      compactionResult = ContextCompactor.hardCompact(rawMessages, options.compactorOptions);
    } else if (force === "soft") {
      compactionResult = ContextCompactor.softCompact(rawMessages, options.compactorOptions);
    } else {
      compactionResult = ContextCompactor.compact(rawMessages, usage, options.compactorOptions);
    }

    const finalMessages = compactionResult.messages;

    // 5. 若发生压缩，在物化结果上重新计算最终 usage snapshot
    if (compactionResult.compacted) {
      const compactedNonSystem = finalMessages.filter((m) => m.role !== "system");
      const compactedConversationTokens = this.tokenMeter.estimateMessageTokens(compactedNonSystem);
      usage = computeContextBudget(
        {
          systemTokens,
          characterStateTokens,
          memoryTokens,
          ragTokens,
          toolSchemaTokens,
          conversationTokens: compactedConversationTokens,
        },
        budgetConfig,
      );
    }

    return {
      messages: finalMessages,
      systemPrompt,
      usage,
      compactionResult,
    };
  }
}
