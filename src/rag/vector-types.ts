export interface EmbeddingModelInfo {
  model: string;                      // 模型名称 (例如 "bge-small-zh-v1.5", "text-embedding-3-small", "deterministic-test")
  dimension: number;                  // 向量维度 (例如 384, 512, 768, 1536)
  version?: string;                   // 模型版本号
}

/**
 * 嵌入提供商标准抽象接口 (IEmbeddingProvider)
 * 允许无缝插拔本地 ONNX 模型、OpenAI API 或离线确定性模型
 */
export interface IEmbeddingProvider {
  readonly modelInfo: Readonly<EmbeddingModelInfo>;
  embedText(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

/**
 * 向量存储记录 (VectorRecord)
 */
export interface VectorRecord {
  chunkId: string;                    // 关联的 KnowledgeChunk ID (确定性唯一键)
  documentId: string;                 // 所属文档 ID
  sourceUri: string;                  // 原始来源路径 (如 "knowledge/facts.yaml")
  embedding: number[];                // 浮点数向量
  text: string;                       // 切片原文 (便于只读溯源与无锁召回)
  canonicalPriority: number;          // 权威优先级 (0.50 ~ 1.00)
  chunkType?: string;                 // 切片类型
  modelInfo: EmbeddingModelInfo;      // 生成该向量的模型信息
  createdAt: number;                  // 首次索引时间戳
  updatedAt: number;                  // 最近更新时间戳
}

/**
 * 向量检索过滤条件 (VectorFilter)
 */
export interface VectorFilter {
  minPriority?: number;
  sourceUri?: string;
  documentId?: string;
  chunkType?: string;
}

/**
 * 向量检索单项结果 (VectorQueryResult)
 */
export interface VectorQueryResult {
  chunkId: string;
  documentId: string;
  sourceUri: string;
  similarity: number;                 // 余弦相似度 (0.0 ~ 1.0)
  record: VectorRecord;
}

/**
 * 向量存储标准抽象接口 (IVectorStore)
 */
export interface IVectorStore {
  upsert(records: VectorRecord[]): Promise<void>;
  delete(chunkIds: string[]): Promise<number>;
  deleteBySource(sourceUri: string): Promise<number>;
  get(chunkId: string): Promise<VectorRecord | null>;
  query(queryVector: number[], topK?: number, filter?: VectorFilter): Promise<VectorQueryResult[]>;
  count(): Promise<number>;
  list(): Promise<VectorRecord[]>;
  clear(): Promise<void>;
  flush(): Promise<boolean>;
  reload(): Promise<void>;
}

/**
 * 向量索引构建与增量更新报告 (VectorIndexReport)
 */
export interface VectorIndexReport {
  totalChunks: number;
  indexedChunks: number;
  skippedChunks: number;
  deletedChunks: number;
  dimension: number;
  model: string;
  durationMs: number;
}
