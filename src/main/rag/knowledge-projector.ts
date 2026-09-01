import type { ScoredKnowledgeChunk } from "./retrieval-types";
import { KnowledgePerspectiveEvaluator } from "../character/knowledge-perspective";

export interface KnowledgeProjectorConfig {
  maxTokens?: number;
  header?: string;
  showCanonicalPriority?: boolean;
  showSourceProvenance?: boolean;
  showPerspectiveTag?: boolean;
}

export const DEFAULT_KNOWLEDGE_PROJECTOR_CONFIG: Required<KnowledgeProjectorConfig> = {
  maxTokens: 800,
  header: "【相关背景知识】 (Canonical Knowledge)",
  showCanonicalPriority: true,
  showSourceProvenance: true,
  showPerspectiveTag: true,
};

/**
 * 知识投影器 (KnowledgeProjector)
 *
 * 负责将检索并重排序后的 ScoredKnowledgeChunk 列表，
 * 结合流萤的主观认知视角（亲历记忆、同伴关系、外部情报），
 * 格式化为整洁、紧凑、具备清晰权威来源并严格受控于 Token 预算的 LLM 上下文文本。
 */
export class KnowledgeProjector {
  private readonly config: Required<KnowledgeProjectorConfig>;

  constructor(config: KnowledgeProjectorConfig = {}) {
    this.config = {
      ...DEFAULT_KNOWLEDGE_PROJECTOR_CONFIG,
      ...config,
    };
  }

  /**
   * 粗略估算字符串 Token 数量 (中英通用)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 1.8);
  }

  /**
   * 将知识切片物化投影为 LLM 提示词文本
   */
  project(
    items: readonly ScoredKnowledgeChunk[],
    options: { maxTokens?: number } = {}
  ): string {
    if (!items || items.length === 0) {
      return "";
    }

    const maxBudget = options.maxTokens ?? this.config.maxTokens;
    const lines: string[] = [this.config.header];
    let currentTokens = this.estimateTokens(this.config.header);

    for (const item of items) {
      const chunk = item.chunk;
      const cleanText = chunk.text.trim().replace(/\s+/g, " ");

      // 构建来源与主观视角标签
      let prefix = "- ";
      if (this.config.showSourceProvenance) {
        const sourceName = chunk.sourceUri.split("/").pop() || chunk.sourceUri;
        prefix += `[${sourceName}] `;
      }

      if (this.config.showPerspectiveTag) {
        const evalRes = KnowledgePerspectiveEvaluator.evaluate(chunk);
        prefix += `[${evalRes.perspectiveLabel}] `;
      }

      let suffix = "";
      if (this.config.showCanonicalPriority && chunk.canonicalPriority !== undefined) {
        suffix = ` (权威度: ${chunk.canonicalPriority.toFixed(2)})`;
      }

      const formattedLine = `${prefix}${cleanText}${suffix}`;
      const lineTokens = this.estimateTokens(formattedLine);

      // 严格检查 Token 预算截断
      if (currentTokens + lineTokens > maxBudget && lines.length > 1) {
        break;
      }

      lines.push(formattedLine);
      currentTokens += lineTokens;
    }

    // 若只有标题行而没有内容行，返回空
    if (lines.length <= 1) {
      return "";
    }

    return lines.join("\n");
  }
}
