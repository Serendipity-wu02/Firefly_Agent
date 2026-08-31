import type { MemoryRecord, MemoryCategory } from "./memory-types";
import type { ScoredMemory } from "./retrieval-types";
import { TokenMeter } from "../agent/context/token-meter";

export interface MemoryProjectionConfig {
  maxTokens?: number;               // 最大允许 Token 预算 (默认 500)
  includeHeader?: boolean;          // 是否包含标题头 (默认 true)
  emptyFallback?: string;           // 记忆为空时的占位符 (默认 "")
}

export const DEFAULT_PROJECTION_CONFIG: MemoryProjectionConfig = {
  maxTokens: 500,
  includeHeader: true,
  emptyFallback: "",
};

/**
 * 记忆投影器 (MemoryProjector)
 * 将 MemoryRecord / ScoredMemory 列表格式化为对 LLM 友好、结构紧凑、高信息密度的 Prompt 注入文本。
 * 严格按照 memory-types.ts 分类组织，并受 Context Token Budget 约束。
 */
export class MemoryProjector {
  private readonly tokenMeter: TokenMeter;

  constructor(tokenMeter?: TokenMeter) {
    this.tokenMeter = tokenMeter || new TokenMeter();
  }

  /**
   * 将检索命中的记忆条目投影为紧凑格式文本
   */
  project(
    items: readonly ScoredMemory[] | readonly MemoryRecord[],
    config?: Partial<MemoryProjectionConfig>
  ): string {
    if (!items || items.length === 0) {
      return config?.emptyFallback ?? DEFAULT_PROJECTION_CONFIG.emptyFallback!;
    }

    const cfg: MemoryProjectionConfig = {
      ...DEFAULT_PROJECTION_CONFIG,
      ...(config || {}),
    };

    // 1. 提取底层 MemoryRecord 数组
    const records: MemoryRecord[] = items.map((item) =>
      "record" in item ? (item as ScoredMemory).record : (item as MemoryRecord)
    );

    // 2. 按 memory-types 分类归纳
    const profileItems: string[] = [];
    const preferenceItems: string[] = [];
    const relationItems: string[] = [];
    const eventItems: string[] = [];
    const entityItems: string[] = [];
    const stateItems: string[] = [];

    for (const r of records) {
      const line = `${r.key}: ${r.value}`;
      switch (r.category) {
        case "profile":
          profileItems.push(`• 基础画像: ${line}`);
          break;
        case "preference":
          preferenceItems.push(`• 偏好喜好: ${line}`);
          break;
        case "relation":
          relationItems.push(`• 关系纽带: ${line}`);
          break;
        case "event":
          eventItems.push(`• 共同经历: ${line}`);
          break;
        case "entity":
          entityItems.push(`• 关联实体: ${line}`);
          break;
        case "working_state":
          stateItems.push(`• 近期状态: ${line}`);
          break;
        default:
          profileItems.push(`• 记忆信息: ${line}`);
          break;
      }
    }

    // 3. 组装结构化段落
    const sections: string[] = [];
    if (profileItems.length > 0) sections.push(...profileItems);
    if (preferenceItems.length > 0) sections.push(...preferenceItems);
    if (relationItems.length > 0) sections.push(...relationItems);
    if (eventItems.length > 0) sections.push(...eventItems);
    if (entityItems.length > 0) sections.push(...entityItems);
    if (stateItems.length > 0) sections.push(...stateItems);

    if (sections.length === 0) {
      return cfg.emptyFallback ?? "";
    }

    let body = sections.join("\n");
    let result = cfg.includeHeader ? `【流萤对开拓者的长期记忆】\n${body}` : body;

    // 4. Token 预算安全截断 (Token Budget Enforcement)
    if (cfg.maxTokens && cfg.maxTokens > 0) {
      let currentTokens = this.tokenMeter.estimateTokens(result);
      while (currentTokens > cfg.maxTokens && sections.length > 1) {
        // 从低优先级/后置项开始剔除
        sections.pop();
        body = sections.join("\n");
        result = cfg.includeHeader ? `【流萤对开拓者的长期记忆】\n${body}` : body;
        currentTokens = this.tokenMeter.estimateTokens(result);
      }
    }

    return result.trim();
  }
}
