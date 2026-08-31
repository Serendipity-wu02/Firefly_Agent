import type { MemoryRecord } from "./memory-types";
import type { MemoryQuery, ScoredMemory, RetrievalPolicyConfig } from "./retrieval-types";

export class MemoryRanker {
  private readonly config: RetrievalPolicyConfig;

  constructor(config: RetrievalPolicyConfig) {
    this.config = config;
  }

  scoreRecord(record: MemoryRecord, query: MemoryQuery): ScoredMemory {
    const currentTime = query.currentTime || Date.now();
    const queryText = (query.queryText || "").trim().toLowerCase();
    const entities = (query.entities || []).map((e) => e.trim().toLowerCase()).filter(Boolean);

    const isQueryEmpty = !queryText && entities.length === 0;

    const entityScore = this.calculateEntityScore(record, entities);
    const textScore = this.calculateTextScore(record, queryText);
    const importanceScore = Math.max(0, Math.min(1, record.importance ?? 0.5));
    const recencyScore = this.calculateRecencyScore(record, currentTime, this.config.recencyHalfLifeDays);
    const confidenceScore = Math.max(0, Math.min(1, record.confidence ?? 1.0));

    let finalScore = 0;

    if (isQueryEmpty) {
      if (this.config.emptyQueryFallback === "top_importance") {
        // 空查询时依据重要性 (60%)、新鲜度 (20%) 与置信度 (20%) 综合打分
        finalScore = 0.6 * importanceScore + 0.2 * recencyScore + 0.2 * confidenceScore;
      } else {
        finalScore = 0.0;
      }
    } else {
      const w = this.config.weights;
      finalScore =
        w.entity * entityScore +
        w.text * textScore +
        w.importance * importanceScore +
        w.recency * recencyScore +
        w.confidence * confidenceScore;
    }

    finalScore = Math.max(0, Math.min(1, finalScore));

    return {
      record: { ...record },
      score: Number(finalScore.toFixed(4)),
      breakdown: {
        entityScore: Number(entityScore.toFixed(4)),
        textScore: Number(textScore.toFixed(4)),
        importanceScore: Number(importanceScore.toFixed(4)),
        recencyScore: Number(recencyScore.toFixed(4)),
        confidenceScore: Number(confidenceScore.toFixed(4)),
      },
    };
  }

  private calculateEntityScore(record: MemoryRecord, targetEntities: string[]): number {
    if (targetEntities.length === 0) return 0;

    const recordKey = record.key.toLowerCase();
    const recordEntities = (record.entities || []).map((e) => e.toLowerCase());
    const recordValue = record.value.toLowerCase();

    let maxMatch = 0;

    for (const ent of targetEntities) {
      // 1. 完全匹配 key 或 entities 列表
      if (recordKey === ent || recordEntities.includes(ent)) {
        return 1.0;
      }
      // 2. 实体包含在 key 或 entities 中
      if (recordKey.includes(ent) || recordEntities.some((re) => re.includes(ent) || ent.includes(re))) {
        maxMatch = Math.max(maxMatch, 0.8);
      }
      // 3. 实体包含在 value 明文中
      else if (recordValue.includes(ent)) {
        maxMatch = Math.max(maxMatch, 0.5);
      }
    }

    return maxMatch;
  }

  private calculateTextScore(record: MemoryRecord, queryText: string): number {
    if (!queryText) return 0;

    const key = record.key.toLowerCase();
    const value = record.value.toLowerCase();
    const summary = (record.summary || "").toLowerCase();

    // 1. 完全全字匹配 key
    if (key === queryText) {
      return 1.0;
    }

    // 2. key 包含整个 query 或 query 包含 key
    if (key.includes(queryText) || queryText.includes(key)) {
      return 0.9;
    }

    // 3. value 或 summary 包含整个 query
    if (value.includes(queryText) || summary.includes(queryText)) {
      return 0.75;
    }

    // 4. 多词分词覆盖度计算
    const tokens = queryText
      .split(/[\s,，。！？!?.、_/\\]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (tokens.length === 0) return 0;

    let matchedCount = 0;
    for (const token of tokens) {
      if (key.includes(token) || value.includes(token) || summary.includes(token)) {
        matchedCount++;
      }
    }

    return matchedCount / tokens.length * 0.6;
  }

  private calculateRecencyScore(record: MemoryRecord, currentTime: number, halfLifeDays: number): number {
    if (record.pinned) {
      return 1.0; // 固化记忆无时间衰减损失
    }

    const elapsedMs = Math.max(0, currentTime - (record.updatedAt || record.createdAt || currentTime));
    const halfLifeMs = Math.max(1, halfLifeDays * 24 * 60 * 60 * 1000);

    // 指数衰减模型: e^(- (ln2 * t) / halfLife)
    return Math.exp((-Math.LN2 * elapsedMs) / halfLifeMs);
  }
}
