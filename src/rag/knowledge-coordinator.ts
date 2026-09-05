import * as fs from "node:fs";
import * as path from "node:path";
import type { KnowledgeChunk } from "./rag-types";
import type { IEmbeddingProvider, IVectorStore } from "./vector-types";
import { FileVectorStore, InMemoryVectorStore } from "./vector-store";
import { DeterministicEmbeddingProvider } from "./embedding-provider";
import { HybridRetriever } from "./hybrid-retriever";
import { KnowledgeProjector, type KnowledgeProjectorConfig } from "./knowledge-projector";
import { RagSlot, type RagSlotOptions } from "../main/orchestrator/context/context-slots";

export interface KnowledgeCoordinatorOptions {
  knowledgeDataDir?: string;
  vectorStore?: IVectorStore;
  embeddingProvider?: IEmbeddingProvider;
  projectorConfig?: KnowledgeProjectorConfig;
}

/**
 * 知识库协调器 (KnowledgeCoordinator)
 *
 * 核心职责：
 * 1. 组合与管理 RAG 知识库检索流水线 (HybridRetriever + KnowledgeProjector)；
 * 2. 负责读取 src/rag/knowledge/ 中的离线语料与向量索引；
 * 3. 作为与 ContextManager 衔接的统一 Adapter 工厂 (createRagSlot)；
 * 4. 严格保持与 MemoryStore、Agent Core 及 resources/ 的单向解耦。
 */
export class KnowledgeCoordinator {
  private readonly knowledgeDataDir: string;
  private readonly vectorStore: IVectorStore;
  private readonly embeddingProvider: IEmbeddingProvider;
  private readonly hybridRetriever: HybridRetriever;
  private readonly projector: KnowledgeProjector;
  private readonly chunks: KnowledgeChunk[] = [];
  private isInitialized = false;

  constructor(options: KnowledgeCoordinatorOptions = {}) {
    this.knowledgeDataDir =
      options.knowledgeDataDir || path.join(process.cwd(), "src", "rag", "knowledge");

    this.vectorStore =
      options.vectorStore ||
      new FileVectorStore({
        filePath: path.join(this.knowledgeDataDir, "vector_index.json"),
      });

    this.embeddingProvider =
      options.embeddingProvider ||
      new DeterministicEmbeddingProvider({ dimension: 384 });

    this.hybridRetriever = new HybridRetriever({
      vectorStore: this.vectorStore,
      embeddingProvider: this.embeddingProvider,
      chunks: this.chunks,
    });

    this.projector = new KnowledgeProjector(options.projectorConfig);
  }

  /**
   * 初始化加载知识切片语料
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const chunksPath = path.join(this.knowledgeDataDir, "chunks.json");
    if (fs.existsSync(chunksPath)) {
      try {
        const raw = fs.readFileSync(chunksPath, "utf-8");
        const loadedChunks = JSON.parse(raw) as KnowledgeChunk[];
        if (Array.isArray(loadedChunks)) {
          this.chunks.length = 0;
          for (let i = 0; i < loadedChunks.length; i++) {
            this.chunks.push(loadedChunks[i]);
          }
          this.hybridRetriever.setChunks(this.chunks);
        }
      } catch (err) {
        console.warn("[KnowledgeCoordinator] Failed to load chunks.json:", err);
      }
    }

    await this.vectorStore.reload();
    this.isInitialized = true;
  }

  getRetriever(): HybridRetriever {
    return this.hybridRetriever;
  }

  getProjector(): KnowledgeProjector {
    return this.projector;
  }

  getChunks(): readonly KnowledgeChunk[] {
    return this.chunks;
  }

  /**
   * 创建挂载至 ContextManager 的标准化 RagSlot
   */
  createRagSlot(options: Partial<RagSlotOptions> = {}): RagSlot {
    return new RagSlot({
      retriever: {
        retrieve: async (query) => {
          return this.hybridRetriever.retrieve({
            queryText: query.queryText || "",
            entities: query.entities,
            topK: query.topK,
          });
        },
      },
      projector: {
        project: (items, config) => {
          return this.projector.project(items as any, config);
        },
      },
      maxTokens: options.maxTokens ?? 800,
      topK: options.topK ?? 5,
    });
  }
}
