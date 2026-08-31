import type { KnowledgeChunk } from "./rag-types";
import type { IEmbeddingProvider, IVectorStore, VectorQueryResult } from "./vector-types";
import type { KnowledgeRetrievalQuery } from "./retrieval-types";

export interface VectorCandidate {
  chunk: KnowledgeChunk;
  vectorScore: number;
}

/**
 * 向量检索器 (VectorRetriever)
 * 封装 IEmbeddingProvider 与 IVectorStore 进行密集语义相似度检索。
 */
export class VectorRetriever {
  private readonly vectorStore: IVectorStore;
  private readonly embeddingProvider: IEmbeddingProvider;
  private readonly chunkMap: Map<string, KnowledgeChunk>;

  constructor(
    vectorStore: IVectorStore,
    embeddingProvider: IEmbeddingProvider,
    chunks: KnowledgeChunk[] = []
  ) {
    this.vectorStore = vectorStore;
    this.embeddingProvider = embeddingProvider;
    this.chunkMap = new Map(chunks.map((c) => [c.id, c]));
  }

  setChunks(chunks: KnowledgeChunk[]): void {
    this.chunkMap.clear();
    for (const c of chunks) {
      this.chunkMap.set(c.id, c);
    }
  }

  /**
   * 执行高维向量密集检索
   */
  async retrieve(
    query: KnowledgeRetrievalQuery,
    poolSize = 50
  ): Promise<VectorCandidate[]> {
    const queryText = (query.queryText || "").trim();
    if (!queryText) return [];

    // 1. 生成查询文本的嵌入向量
    const queryVector = await this.embeddingProvider.embedText(queryText);

    // 2. 在向量存储器中检索 Top-K 候选
    const rawResults = await this.vectorStore.query(queryVector, poolSize, {
      minPriority: query.minPriority,
    });

    const candidates: VectorCandidate[] = [];

    // 3. 将 VectorRecord 关联映射回完整的 KnowledgeChunk
    for (const res of rawResults) {
      let chunk = this.chunkMap.get(res.chunkId);
      if (!chunk) {
        // Fallback reconstructed chunk from VectorRecord
        chunk = {
          id: res.record.chunkId,
          documentId: res.record.documentId,
          sourceUri: res.record.sourceUri,
          chunkIndex: 0,
          chunkType: (res.record.chunkType as any) || "atomic_fact",
          text: res.record.text,
          tokenEstimate: Math.ceil(res.record.text.length / 2),
          entityNames: [],
          keywords: [],
          canonicalPriority: res.record.canonicalPriority,
          metadata: {
            perspective: "factual_assertion",
            sourceFile: res.record.sourceUri,
            characters: [],
            verified: true,
          },
        };
      }

      candidates.push({
        chunk,
        vectorScore: res.similarity,
      });
    }

    return candidates;
  }
}
