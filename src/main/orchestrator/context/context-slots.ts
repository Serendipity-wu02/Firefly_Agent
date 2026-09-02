import type { CharacterStateData } from "../../../shared/firefly-state";
import { SystemPromptBuilder } from "./system-prompt-builder";
import type { TokenMeter } from "./token-meter";

export enum ContextSlotPriority {
  SYSTEM = 100,
  CHARACTER_STATE = 90,
  MEMORY = 80,
  RAG = 70,
  TOOL_SCHEMA = 60,
  CUSTOM = 50,
}

export interface SlotRenderContext {
  characterState?: CharacterStateData;
  memoryContext?: string;
  ragContext?: string;
  planContext?: string;
  userPrompt?: string;
  customData?: Record<string, unknown>;
}

/**
 * IContextSlot (上下文插槽标准接口)
 *
 * 为 V2.2 记忆系统 (Memory v2) 与 V2.3 RAG 知识库预留统一的扩展接入缝 (Extension Seam)
 */
export interface IContextSlot {
  readonly id: string;
  readonly priority: number;
  readonly enabled: boolean;
  render(ctx: SlotRenderContext): Promise<string> | string;
  estimateTokens(ctx: SlotRenderContext, meter: TokenMeter): number;
}

/**
 * 核心系统 Prompt 插槽
 */
export class SystemPromptSlot implements IContextSlot {
  readonly id = "system-prompt";
  readonly priority = ContextSlotPriority.SYSTEM;
  readonly enabled = true;

  render(ctx: SlotRenderContext): string {
    return SystemPromptBuilder.build({
      state: ctx.characterState,
      memoryContext: ctx.memoryContext,
      ragContext: ctx.ragContext,
    });
  }

  estimateTokens(ctx: SlotRenderContext, meter: TokenMeter): number {
    return meter.estimateTokens(this.render(ctx));
  }
}

/**
 * 角色状态插槽 (支持单独抽取与动态更新)
 */
export class CharacterStateSlot implements IContextSlot {
  readonly id = "character-state";
  readonly priority = ContextSlotPriority.CHARACTER_STATE;
  readonly enabled = true;

  render(ctx: SlotRenderContext): string {
    return SystemPromptBuilder.buildStateString(ctx.characterState);
  }

  estimateTokens(ctx: SlotRenderContext, meter: TokenMeter): number {
    return meter.estimateTokens(this.render(ctx));
  }
}

export interface IMemoryRetrieverAdapter {
  retrieve(query: { queryText?: string; entities?: string[]; topK?: number }): Promise<{
    items: readonly unknown[];
  }>;
}

export interface IMemoryProjectorAdapter {
  project(items: readonly unknown[], config?: { maxTokens?: number }): string;
}

export interface MemorySlotOptions {
  retriever?: IMemoryRetrieverAdapter;
  projector?: IMemoryProjectorAdapter;
  maxTokens?: number;
  topK?: number;
}

/**
 * 长期记忆插槽 (MemorySlot - Fully Integrated with Memory v2)
 */
export class MemorySlot implements IContextSlot {
  readonly id = "memory";
  readonly priority = ContextSlotPriority.MEMORY;
  readonly enabled = true;
  private readonly retriever?: IMemoryRetrieverAdapter;
  private readonly projector?: IMemoryProjectorAdapter;
  private readonly maxTokens: number;
  private readonly topK: number;

  constructor(options: MemorySlotOptions = {}) {
    this.retriever = options.retriever;
    this.projector = options.projector;
    this.maxTokens = options.maxTokens ?? 500;
    this.topK = options.topK ?? 5;
  }

  render(ctx: SlotRenderContext): Promise<string> | string {
    // 1. 若外部显式注入了 memoryContext，直接同步返回
    if (ctx.memoryContext && ctx.memoryContext.trim().length > 0) {
      return ctx.memoryContext.trim();
    }

    // 2. 若挂载了 Retriever，基于当前 userPrompt 进行检索与格式化投影
    if (this.retriever && ctx.userPrompt && ctx.userPrompt.trim().length > 0) {
      return this.retriever
        .retrieve({
          queryText: ctx.userPrompt.trim(),
          topK: this.topK,
        })
        .then((result) => {
          if (result && result.items && result.items.length > 0) {
            if (this.projector) {
              return this.projector.project(result.items, { maxTokens: this.maxTokens });
            }
          }
          return "";
        })
        .catch((err) => {
          console.warn("[MemorySlot] Retrieval failed gracefully:", err);
          return "";
        });
    }

    return "";
  }

  estimateTokens(ctx: SlotRenderContext, meter: TokenMeter): number {
    if (ctx.memoryContext && ctx.memoryContext.trim().length > 0) {
      return meter.estimateTokens(ctx.memoryContext.trim());
    }
    return this.maxTokens;
  }
}

export interface IKnowledgeRetrieverAdapter {
  retrieve(query: { queryText?: string; entities?: string[]; topK?: number }): Promise<{
    items: readonly unknown[];
  }>;
}

export interface IKnowledgeProjectorAdapter {
  project(items: readonly unknown[], config?: { maxTokens?: number }): string;
}

export interface RagSlotOptions {
  retriever?: IKnowledgeRetrieverAdapter;
  projector?: IKnowledgeProjectorAdapter;
  maxTokens?: number;
  topK?: number;
}

/**
 * RAG 知识库检索插槽 (RagSlot - Fully Integrated with Knowledge Corpus & Hybrid Retriever)
 */
export class RagSlot implements IContextSlot {
  readonly id = "rag";
  readonly priority = ContextSlotPriority.RAG;
  readonly enabled = true;
  private readonly retriever?: IKnowledgeRetrieverAdapter;
  private readonly projector?: IKnowledgeProjectorAdapter;
  private readonly maxTokens: number;
  private readonly topK: number;

  constructor(options: RagSlotOptions = {}) {
    this.retriever = options.retriever;
    this.projector = options.projector;
    this.maxTokens = options.maxTokens ?? 800;
    this.topK = options.topK ?? 5;
  }

  render(ctx: SlotRenderContext): Promise<string> | string {
    // 1. 若外部显式注入了 ragContext，格式化后直接返回
    if (ctx.ragContext && ctx.ragContext.trim().length > 0) {
      return ctx.ragContext.trim();
    }

    // 2. 若挂载了 Retriever，基于当前 userPrompt 进行检索与格式化投影
    if (this.retriever && ctx.userPrompt && ctx.userPrompt.trim().length > 0) {
      return this.retriever
        .retrieve({
          queryText: ctx.userPrompt.trim(),
          topK: this.topK,
        })
        .then((result) => {
          if (result && result.items && result.items.length > 0) {
            if (this.projector) {
              return this.projector.project(result.items, { maxTokens: this.maxTokens });
            }
          }
          return "";
        })
        .catch((err) => {
          console.warn("[RagSlot] Retrieval failed gracefully:", err);
          return "";
        });
    }

    return "";
  }

  estimateTokens(ctx: SlotRenderContext, meter: TokenMeter): number {
    if (ctx.ragContext && ctx.ragContext.trim().length > 0) {
      return meter.estimateTokens(ctx.ragContext.trim());
    }
    return this.maxTokens;
  }
}

/**
 * 结构化执行计划插槽 (为 Phase E Bounded Planning 服务)
 */
export class PlanSlot implements IContextSlot {
  readonly id = "plan";
  readonly priority = ContextSlotPriority.CUSTOM;
  readonly enabled = true;

  render(ctx: SlotRenderContext): string {
    if (!ctx.planContext || ctx.planContext.trim().length === 0) {
      return "";
    }
    return `【当前任务执行计划】\n${ctx.planContext.trim()}`;
  }

  estimateTokens(ctx: SlotRenderContext, meter: TokenMeter): number {
    const content = this.render(ctx);
    return content ? meter.estimateTokens(content) : 0;
  }
}
