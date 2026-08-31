import type { KnowledgeChunk } from "./rag-types";
import type { KnowledgeRetrievalQuery } from "./retrieval-types";
import { extractEntities } from "./entity-extractor";

export interface LexicalCandidate {
  chunk: KnowledgeChunk;
  lexicalScore: number;
}

/**
 * 词法与倒排检索器 (LexicalRetriever)
 * 基于关键词分词、精准子串匹配、标题路径命中与倒排词频打分。
 */
export class LexicalRetriever {
  private readonly chunks: KnowledgeChunk[];

  constructor(chunks: KnowledgeChunk[] = []) {
    this.chunks = chunks;
  }

  setChunks(chunks: KnowledgeChunk[]): void {
    if (this.chunks === chunks) {
      return;
    }
    this.chunks.length = 0;
    for (let i = 0; i < chunks.length; i++) {
      this.chunks.push(chunks[i]);
    }
  }

  /**
   * 执行词法倒排检索
   */
  retrieve(
    query: KnowledgeRetrievalQuery,
    poolSize = 50
  ): LexicalCandidate[] {
    const queryText = (query.queryText || "").trim().toLowerCase();
    if (!queryText) return [];

    // 1. 提取 Query 中的实体与分词
    const queryEntities = query.entities && query.entities.length > 0
      ? query.entities
      : extractEntities(queryText);
    
    // 粗粒度切分词汇 (中英文与数字)
    const rawTokens = queryText
      .split(/[\s,，.。!！?？:：;；"“”'‘’()（）[\]【】]+/)
      .filter((t) => t.length > 0);

    const candidates: LexicalCandidate[] = [];

    for (const chunk of this.chunks) {
      if (query.minPriority !== undefined && chunk.canonicalPriority < query.minPriority) {
        continue;
      }
      if (query.sourceTypes && query.sourceTypes.length > 0) {
        // filter by source type if applicable
      }

      const chunkTextLower = chunk.text.toLowerCase();
      let matchScore = 0;
      let matchedTokensCount = 0;

      // 1. 精准全词/短语包含匹配 (Exact Phrase Match)
      if (queryText.length >= 2 && chunkTextLower.includes(queryText)) {
        matchScore += 0.50;
      }

      // 2. 词条匹配 (Token-level Match)
      for (const token of rawTokens) {
        if (token.length === 0) continue;
        if (chunkTextLower.includes(token)) {
          matchedTokensCount++;
          matchScore += Math.min(0.20, (token.length / queryText.length) * 0.4);
        }
      }

      // 3. 标题路径加权 (Heading Path Match)
      if (chunk.headingPath) {
        for (const h of chunk.headingPath) {
          const hLower = h.toLowerCase();
          if (queryText.includes(hLower) || hLower.includes(queryText)) {
            matchScore += 0.25;
            break;
          }
        }
      }

      // 4. 显式关键词标签加权 (Keywords Match)
      if (chunk.keywords) {
        for (const kw of chunk.keywords) {
          if (queryText.includes(kw.toLowerCase())) {
            matchScore += 0.15;
            break;
          }
        }
      }

      // 5. 实体命中加权 (Entity Match inside Chunk)
      if (chunk.entityNames) {
        for (const qe of queryEntities) {
          if (chunk.entityNames.includes(qe)) {
            matchScore += 0.20;
            break;
          }
        }
      }

      if (matchScore > 0) {
        // 归一化至 0.0 ~ 1.0
        const normalized = Math.max(0, Math.min(1.0, matchScore));
        candidates.push({
          chunk,
          lexicalScore: normalized,
        });
      }
    }

    // 排序并截断至候选池大小
    candidates.sort((a, b) => b.lexicalScore - a.lexicalScore);
    return candidates.slice(0, poolSize);
  }
}
