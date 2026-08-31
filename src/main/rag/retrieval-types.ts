import type { KnowledgeChunk, KnowledgeSourceType } from "./rag-types";

export interface KnowledgeRetrievalQuery {
  queryText: string;
  entities?: readonly string[];
  topK?: number;
  timelineEpoch?: "glamoth" | "stellaron_hunter" | "penacony" | "amphoreus" | "universal";
  minPriority?: number;
  sourceTypes?: readonly KnowledgeSourceType[];
}

export interface ScoreBreakdown {
  lexicalScore: number;               // 倒排与关键词词频分 (0.0 ~ 1.0)
  vectorScore: number;                // 向量余弦相似度分 (0.0 ~ 1.0)
  entityScore: number;                // 实体命中分 (0.0 ~ 1.0)
  canonicalScore: number;             // 权威优先级归一分 (0.5 ~ 1.0)
  timelineScore: number;              // 剧情时间线匹配分 (0.0 ~ 1.0)
}

/**
 * 最终打分排序后的知识切片条目
 */
export interface ScoredKnowledgeChunk {
  chunk: KnowledgeChunk;
  finalScore: number;                 // 综合加权最终得分 (0.0 ~ 1.0)
  breakdown: ScoreBreakdown;          // 各维度打分明细
}

/**
 * 检索结果封装
 */
export interface KnowledgeRetrievalResult {
  items: readonly ScoredKnowledgeChunk[];
  totalCandidates: number;
  query: KnowledgeRetrievalQuery;
  durationMs: number;
}

/**
 * 混合检索与重排序策略配置
 */
export interface HybridRetrievalPolicyConfig {
  weights: {
    entity: number;                   // 实体精准匹配权重 (默认 0.35)
    lexical: number;                  // 倒排词频匹配权重 (默认 0.25)
    vector: number;                   // 向量余弦相似度权重 (默认 0.20)
    canonical: number;                // 权威优先级权重 (默认 0.10)
    timeline: number;                 // 时间线匹配权重 (默认 0.10)
  };
  candidatePoolSize: number;          // 每路召回候选池大小 (默认 50)
  minFinalScore: number;              // 最终得分保底截断阈值 (默认 0.05)
  defaultTopK: number;                // 默认 Top-K 结果数 (默认 5)
}

export const DEFAULT_HYBRID_RETRIEVAL_POLICY: HybridRetrievalPolicyConfig = {
  weights: {
    entity: 0.35,
    lexical: 0.25,
    vector: 0.20,
    canonical: 0.10,
    timeline: 0.10,
  },
  candidatePoolSize: 50,
  minFinalScore: 0.05,
  defaultTopK: 5,
};
