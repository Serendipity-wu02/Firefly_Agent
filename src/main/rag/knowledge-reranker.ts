import type { KnowledgeChunk } from "./rag-types";
import type {
  KnowledgeRetrievalQuery,
  ScoredKnowledgeChunk,
  ScoreBreakdown,
  HybridRetrievalPolicyConfig,
} from "./retrieval-types";
import { DEFAULT_HYBRID_RETRIEVAL_POLICY } from "./retrieval-types";
import type { LexicalCandidate } from "./lexical-retriever";
import type { VectorCandidate } from "./vector-retriever";
import { extractEntities } from "./entity-extractor";

/**
 * 知识重排序器 (KnowledgeReranker)
 * 负责融合词法、向量、实体、时间线与权威优先级 5 维特征进行重排。
 */
export class KnowledgeReranker {
  private readonly config: HybridRetrievalPolicyConfig;

  constructor(config?: Partial<HybridRetrievalPolicyConfig>) {
    this.config = {
      ...DEFAULT_HYBRID_RETRIEVAL_POLICY,
      ...(config || {}),
      weights: {
        ...DEFAULT_HYBRID_RETRIEVAL_POLICY.weights,
        ...(config?.weights || {}),
      },
    };
  }

  getConfig(): Readonly<HybridRetrievalPolicyConfig> {
    return this.config;
  }

  /**
   * 融合多路候选并重排序
   */
  rerank(
    query: KnowledgeRetrievalQuery,
    lexicalCandidates: readonly LexicalCandidate[],
    vectorCandidates: readonly VectorCandidate[],
    topK?: number
  ): ScoredKnowledgeChunk[] {
    const k = topK ?? query.topK ?? this.config.defaultTopK;
    const queryText = (query.queryText || "").trim();
    if (!queryText) return [];

    const queryEntities = query.entities && query.entities.length > 0
      ? query.entities
      : extractEntities(queryText);

    // 1. 合并去重候选集 (Candidate Deduplication Map)
    const candidateMap = new Map<
      string,
      {
        chunk: KnowledgeChunk;
        lexicalScore: number;
        vectorScore: number;
      }
    >();

    for (const lc of lexicalCandidates) {
      candidateMap.set(lc.chunk.id, {
        chunk: lc.chunk,
        lexicalScore: lc.lexicalScore,
        vectorScore: 0,
      });
    }

    for (const vc of vectorCandidates) {
      const existing = candidateMap.get(vc.chunk.id);
      if (existing) {
        existing.vectorScore = vc.vectorScore;
      } else {
        candidateMap.set(vc.chunk.id, {
          chunk: vc.chunk,
          lexicalScore: 0,
          vectorScore: vc.vectorScore,
        });
      }
    }

    const scoredItems: ScoredKnowledgeChunk[] = [];
    const weights = this.config.weights;

    // 2. 逐项计算 5 维打分明细
    for (const { chunk, lexicalScore, vectorScore } of candidateMap.values()) {
      // 2.1 实体匹配度 (Entity Match Score)
      let entityScore = 0;
      if (queryEntities.length > 0 && chunk.entityNames && chunk.entityNames.length > 0) {
        let matchedCount = 0;
        for (const qe of queryEntities) {
          if (chunk.entityNames.includes(qe)) {
            matchedCount++;
          }
        }
        entityScore = Math.min(1.0, matchedCount / queryEntities.length);
      }

      // 2.2 权威优先级分 (Canonical Priority Score, 0.50 ~ 1.00)
      const canonicalScore = chunk.canonicalPriority;

      // 2.3 时间线匹配分 (Timeline Match Score)
      let timelineScore = 0.5; // 默认中立分
      if (query.timelineEpoch) {
        if (chunk.metadata.timelineEpoch === query.timelineEpoch) {
          timelineScore = 1.0;
        } else if (chunk.metadata.timelineEpoch) {
          timelineScore = 0.2; // 明确不属于目标纪元
        }
      }

      // 2.4 对抗性安全门控 (Adversarial Relevance Gating)
      // 若词法、向量与实体匹配完全为 0 (完全不相关内容)，即便其权威优先级为 1.0 也不得作为正向命中
      const contentRelevance = lexicalScore * 0.5 + vectorScore * 0.3 + entityScore * 0.2;
      let finalScore = 0;

      if (contentRelevance < 0.05) {
        finalScore = 0;
      } else {
        finalScore =
          weights.entity * entityScore +
          weights.lexical * lexicalScore +
          weights.vector * vectorScore +
          weights.canonical * canonicalScore +
          weights.timeline * timelineScore;
      }

      if (finalScore >= this.config.minFinalScore) {
        const breakdown: ScoreBreakdown = {
          lexicalScore,
          vectorScore,
          entityScore,
          canonicalScore,
          timelineScore,
        };

        scoredItems.push({
          chunk,
          finalScore: Math.max(0, Math.min(1.0, finalScore)),
          breakdown,
        });
      }
    }

    // 3. 确定性排序决胜 (Tie-breaker)
    scoredItems.sort((a, b) => {
      // 1. 最终综合得分降序
      if (Math.abs(b.finalScore - a.finalScore) > 1e-5) {
        return b.finalScore - a.finalScore;
      }
      // 2. 权威优先级降序
      if (Math.abs(b.chunk.canonicalPriority - a.chunk.canonicalPriority) > 1e-5) {
        return b.chunk.canonicalPriority - a.chunk.canonicalPriority;
      }
      // 3. 向量得分降序
      if (Math.abs(b.breakdown.vectorScore - a.breakdown.vectorScore) > 1e-5) {
        return b.breakdown.vectorScore - a.breakdown.vectorScore;
      }
      // 4. 确定性 ID 升序
      return a.chunk.id.localeCompare(b.chunk.id);
    });

    return scoredItems.slice(0, k);
  }
}
