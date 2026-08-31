import type {
  MemoryRecord,
  MemoryLayer,
  MemoryScope,
  MemoryCategory,
} from "./memory-types";

/**
 * 记忆检索请求参数 (MemoryQuery)
 */
export interface MemoryQuery {
  queryText?: string;
  entities?: string[];
  layer?: MemoryLayer | MemoryLayer[];
  scope?: MemoryScope | MemoryScope[];
  category?: MemoryCategory | MemoryCategory[];
  topK?: number;
  minScore?: number;
  currentTime?: number;
}

/**
 * 带有评分明细的记忆检索单项 (ScoredMemory)
 */
export interface ScoredMemory {
  record: MemoryRecord;
  score: number;
  breakdown: {
    entityScore: number;
    textScore: number;
    importanceScore: number;
    recencyScore: number;
    confidenceScore: number;
  };
}

/**
 * 记忆检索完整结果集 (RetrievalResult)
 */
export interface RetrievalResult {
  query: MemoryQuery;
  items: readonly ScoredMemory[];
  totalFound: number;
  durationMs: number;
}

/**
 * 检索与排序权重配置策略
 */
export interface RetrievalPolicyConfig {
  weights: {
    entity: number;       // 实体匹配权重 (默认 0.35)
    text: number;         // 文本关键词相关性权重 (默认 0.25)
    importance: number;   // 基础重要性得分权重 (默认 0.20)
    recency: number;      // 时间新鲜度权重 (默认 0.10)
    confidence: number;   // 置信度权重 (默认 0.10)
  };
  defaultTopK: number;                    // 默认召回上限 (默认 5)
  minScoreThreshold: number;             // 最低准入分数 (默认 0.0)
  emptyQueryFallback: "top_importance" | "none"; // 空查询兜底策略 (默认 top_importance)
  recencyHalfLifeDays: number;           // 新鲜度半衰期天数 (默认 7)
}

export const DEFAULT_RETRIEVAL_POLICY: RetrievalPolicyConfig = {
  weights: {
    entity: 0.35,
    text: 0.25,
    importance: 0.20,
    recency: 0.10,
    confidence: 0.10,
  },
  defaultTopK: 5,
  minScoreThreshold: 0.0,
  emptyQueryFallback: "top_importance",
  recencyHalfLifeDays: 7,
};
