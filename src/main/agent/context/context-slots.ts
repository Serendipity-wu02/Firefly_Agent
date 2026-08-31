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

/**
 * 长期记忆插槽 (为 V2.2 Memory v2 预留)
 */
export class MemorySlot implements IContextSlot {
  readonly id = "memory";
  readonly priority = ContextSlotPriority.MEMORY;
  readonly enabled = true;

  render(ctx: SlotRenderContext): string {
    if (!ctx.memoryContext || ctx.memoryContext.trim().length === 0) {
      return "";
    }
    return ctx.memoryContext.trim();
  }

  estimateTokens(ctx: SlotRenderContext, meter: TokenMeter): number {
    const content = this.render(ctx);
    return content ? meter.estimateTokens(content) : 0;
  }
}

/**
 * RAG 知识库检索插槽 (为 V2.3 RAG 预留)
 */
export class RagSlot implements IContextSlot {
  readonly id = "rag";
  readonly priority = ContextSlotPriority.RAG;
  readonly enabled = true;

  render(ctx: SlotRenderContext): string {
    if (!ctx.ragContext || ctx.ragContext.trim().length === 0) {
      return "";
    }
    return `【相关背景知识】\n${ctx.ragContext.trim()}`;
  }

  estimateTokens(ctx: SlotRenderContext, meter: TokenMeter): number {
    const content = this.render(ctx);
    return content ? meter.estimateTokens(content) : 0;
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

