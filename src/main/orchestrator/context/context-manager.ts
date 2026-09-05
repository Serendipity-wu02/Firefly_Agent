import type { ChatMessage } from "../../../shared/chat-types";
import { TokenMeter, type ITokenizer } from "./token-meter";
import {
  ContextProjector,
  type ContextProjectionOptions,
  type ProjectedContext,
} from "./context-projector";
import {
  DEFAULT_CONTEXT_BUDGET_CONFIG,
  type ContextBudgetConfig,
  type ContextUsageSnapshot,
} from "./context-budget";
import {
  type IContextSlot,
  SystemPromptSlot,
  CharacterStateSlot,
  MemorySlot,
  RagSlot,
} from "./context-slots";
import type { CompactorOptions } from "../compaction/compactor";

export interface ContextManagerOptions {
  tokenizer?: ITokenizer;
  budgetConfig?: Partial<ContextBudgetConfig>;
  compactorOptions?: Partial<CompactorOptions>;
  customSlots?: IContextSlot[];
}

/**
 * ContextManager (Context Layer 核心门面协调器)
 *
 * 统一管理上下文插槽、动态 Token 预算、Compaction 策略与上下文物化投影。
 * 统一承担 Harness 所需的上下文投影，避免执行循环自行构造上下文。
 */
export class ContextManager {
  private tokenMeter: TokenMeter;
  private projector: ContextProjector;
  private budgetConfig: ContextBudgetConfig;
  private compactorOptions?: Partial<CompactorOptions>;
  private readonly slots = new Map<string, IContextSlot>();

  constructor(options: ContextManagerOptions = {}) {
    this.tokenMeter = new TokenMeter({ tokenizer: options.tokenizer });
    this.projector = new ContextProjector(this.tokenMeter);
    this.budgetConfig = { ...DEFAULT_CONTEXT_BUDGET_CONFIG, ...(options.budgetConfig || {}) };
    this.compactorOptions = options.compactorOptions;

    // 注册内置标准插槽
    this.registerSlot(new SystemPromptSlot());
    this.registerSlot(new CharacterStateSlot());
    this.registerSlot(new MemorySlot());
    this.registerSlot(new RagSlot());

    // 注册用户自定义插槽
    if (options.customSlots) {
      for (const slot of options.customSlots) {
        this.registerSlot(slot);
      }
    }
  }

  registerSlot(slot: IContextSlot): void {
    this.slots.set(slot.id, slot);
  }

  unregisterSlot(id: string): boolean {
    return this.slots.delete(id);
  }

  getSlot(id: string): IContextSlot | undefined {
    return this.slots.get(id);
  }

  listSlots(): readonly IContextSlot[] {
    return Array.from(this.slots.values()).sort((a, b) => b.priority - a.priority);
  }

  getTokenMeter(): TokenMeter {
    return this.tokenMeter;
  }

  setTokenizer(tokenizer: ITokenizer): void {
    this.tokenMeter = new TokenMeter({ tokenizer });
    this.projector = new ContextProjector(this.tokenMeter);
  }

  getBudgetConfig(): ContextBudgetConfig {
    return { ...this.budgetConfig };
  }

  setBudgetConfig(config: Partial<ContextBudgetConfig>): void {
    this.budgetConfig = { ...this.budgetConfig, ...config };
  }

  getCompactorOptions(): Partial<CompactorOptions> | undefined {
    return this.compactorOptions;
  }

  setCompactorOptions(options: Partial<CompactorOptions>): void {
    this.compactorOptions = { ...this.compactorOptions, ...options };
  }

  /**
   * 物化生成用于 Agent 运行的初始消息列表 (与 V1 buildRoundMessages 行为完全等价)
   */
  buildInitialMessages(options: ContextProjectionOptions): ChatMessage[] {
    const projected = this.project(options);
    return projected.messages;
  }

  /**
   * 执行已注册的上下文插槽后，物化用于 Agent 运行的初始消息列表。
   * 异步插槽（Memory/RAG）只在生产 Chat 入口使用此方法；保留同步 facade
   * 以维持现有纯投影与单测调用的兼容性。
   */
  async buildInitialMessagesWithSlots(options: ContextProjectionOptions): Promise<ChatMessage[]> {
    const projected = await this.projectWithSlots(options);
    return projected.messages;
  }

  /**
   * 执行全部已启用 slot.render()，将 Memory/RAG/Plan 的结果注入标准投影。
   * System 与 Character slot 也会被执行，以保证注册表与实际运行一致；
   * 系统提示和角色状态仍由 ContextProjector 统一组装，避免重复拼接。
   */
  async projectWithSlots(options: ContextProjectionOptions): Promise<ProjectedContext> {
    const resolved = { ...options };
    const slotContext = { ...options, userPrompt: options.userPrompt };

    for (const slot of this.listSlots()) {
      if (!slot.enabled) continue;
      const rendered = await slot.render(slotContext);
      if (typeof rendered !== "string" || rendered.trim().length === 0) continue;

      if (slot.id === "memory" && !resolved.memoryContext) {
        resolved.memoryContext = rendered.trim();
      } else if (slot.id === "rag" && !resolved.ragContext) {
        resolved.ragContext = rendered.trim();
      } else if (slot.id === "plan" && !resolved.planContext) {
        resolved.planContext = rendered.trim();
      }
    }

    return this.project(resolved);
  }

  /**
   * 完整物化投影，包含 ChatMessage[]、上下文使用量快照与 Compaction 执行结果
   */
  project(options: ContextProjectionOptions): ProjectedContext {
    return this.projector.project({
      ...options,
      budgetConfig: options.budgetConfig || this.budgetConfig,
      compactorOptions: options.compactorOptions || this.compactorOptions,
    });
  }
}
