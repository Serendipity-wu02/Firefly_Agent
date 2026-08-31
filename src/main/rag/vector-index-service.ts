import type { KnowledgeChunk, KnowledgeManifest } from "./rag-types";
import type {
  IEmbeddingProvider,
  IVectorStore,
  VectorRecord,
  VectorIndexReport,
} from "./vector-types";

export interface VectorIndexOptions {
  batchSize?: number;
  forceReindex?: boolean;
}

/**
 * 向量索引构建与增量同步服务 (VectorIndexService)
 *
 * 核心职责：
 * 1. 消费 KnowledgeChunk 数组，通过 IEmbeddingProvider 生成高质量向量并存入 IVectorStore；
 * 2. 增量更新 (Incremental Indexing)：根据现有向量记录与模型元数据，仅重新计算新增或变更的切片；
 * 3. 孤立清理：配合 manifest 清理已删除源的旧向量，保持索引纯净；
 * 4. 绝对隔离：不直接扫描 resources/，不触碰 Memory v2。
 */
export class VectorIndexService {
  private readonly vectorStore: IVectorStore;
  private readonly embeddingProvider: IEmbeddingProvider;

  constructor(vectorStore: IVectorStore, embeddingProvider: IEmbeddingProvider) {
    this.vectorStore = vectorStore;
    this.embeddingProvider = embeddingProvider;
  }

  getStore(): IVectorStore {
    return this.vectorStore;
  }

  getProvider(): IEmbeddingProvider {
    return this.embeddingProvider;
  }

  /**
   * 针对给定的 KnowledgeChunk 列表执行增量或全量索引构建
   */
  async indexChunks(
    chunks: readonly KnowledgeChunk[],
    options: VectorIndexOptions = {}
  ): Promise<VectorIndexReport> {
    const startTime = Date.now();
    const batchSize = options.batchSize || 64;
    const forceReindex = options.forceReindex || false;
    const modelInfo = this.embeddingProvider.modelInfo;

    let indexedCount = 0;
    let skippedCount = 0;

    // 1. 提取现有记录以进行增量对比
    const existingRecords = await this.vectorStore.list();
    const existingMap = new Map(existingRecords.map((r) => [r.chunkId, r]));

    // 2. 筛选出待嵌入计算的 Chunks
    const chunksToEmbed: KnowledgeChunk[] = [];
    for (const chunk of chunks) {
      if (!chunk || !chunk.id) continue;

      const existing = existingMap.get(chunk.id);
      if (
        !forceReindex &&
        existing &&
        existing.modelInfo.model === modelInfo.model &&
        existing.modelInfo.dimension === modelInfo.dimension
      ) {
        skippedCount++;
        continue;
      }
      chunksToEmbed.push(chunk);
    }

    // 3. 分批执行嵌入生成与持久化
    for (let i = 0; i < chunksToEmbed.length; i += batchSize) {
      const batch = chunksToEmbed.slice(i, i + batchSize);
      const texts = batch.map((c) => c.text);
      const embeddings = await this.embeddingProvider.embedBatch(texts);

      const recordsToUpsert: VectorRecord[] = [];
      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const emb = embeddings[j];
        const now = Date.now();

        recordsToUpsert.push({
          chunkId: chunk.id,
          documentId: chunk.documentId,
          sourceUri: chunk.sourceUri,
          embedding: emb,
          text: chunk.text,
          canonicalPriority: chunk.canonicalPriority,
          chunkType: chunk.chunkType,
          modelInfo,
          createdAt: existingMap.get(chunk.id)?.createdAt || now,
          updatedAt: now,
        });
      }

      await this.vectorStore.upsert(recordsToUpsert);
      indexedCount += recordsToUpsert.length;
    }

    return {
      totalChunks: chunks.length,
      indexedChunks: indexedCount,
      skippedChunks: skippedCount,
      deletedChunks: 0,
      dimension: modelInfo.dimension,
      model: modelInfo.model,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * 基于 Manifest 清单清理已失效源的废弃向量
   */
  async syncWithManifest(
    manifest: KnowledgeManifest,
    allChunks: readonly KnowledgeChunk[]
  ): Promise<number> {
    const validChunkIds = new Set(allChunks.map((c) => c.id));
    const allRecords = await this.vectorStore.list();
    const staleChunkIds: string[] = [];

    for (const rec of allRecords) {
      if (!validChunkIds.has(rec.chunkId)) {
        staleChunkIds.push(rec.chunkId);
      }
    }

    if (staleChunkIds.length > 0) {
      return this.vectorStore.delete(staleChunkIds);
    }
    return 0;
  }
}
