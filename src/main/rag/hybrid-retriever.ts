import type { KnowledgeChunk } from "./rag-types";
import type { IEmbeddingProvider, IVectorStore } from "./vector-types";
import type {
  KnowledgeRetrievalQuery,
  KnowledgeRetrievalResult,
  HybridRetrievalPolicyConfig,
  ScoredKnowledgeChunk,
} from "./retrieval-types";
import { DEFAULT_HYBRID_RETRIEVAL_POLICY } from "./retrieval-types";
import { LexicalRetriever } from "./lexical-retriever";
import { VectorRetriever } from "./vector-retriever";
import { KnowledgeReranker } from "./knowledge-reranker";

export interface HybridRetrieverOptions {
  vectorStore?: IVectorStore;
  embeddingProvider?: IEmbeddingProvider;
  chunks?: KnowledgeChunk[];
  policyConfig?: Partial<HybridRetrievalPolicyConfig>;
}

/**
 * 混合知识检索器 (HybridRetriever / KnowledgeRetriever)
 * 统筹词法检索流、向量检索流与重排序器，提供端到端高精度知识检索能力。
 */
export class HybridRetriever {
  private readonly lexicalRetriever: LexicalRetriever;
  private readonly vectorRetriever?: VectorRetriever;
  private readonly reranker: KnowledgeReranker;
  private readonly policyConfig: HybridRetrievalPolicyConfig;

  constructor(options: HybridRetrieverOptions = {}) {
    this.policyConfig = {
      ...DEFAULT_HYBRID_RETRIEVAL_POLICY,
      ...(options.policyConfig || {}),
    };

    const chunks = options.chunks || [];
    this.lexicalRetriever = new LexicalRetriever(chunks);

    if (options.vectorStore && options.embeddingProvider) {
      this.vectorRetriever = new VectorRetriever(
        options.vectorStore,
        options.embeddingProvider,
        chunks
      );
    }

    this.reranker = new KnowledgeReranker(this.policyConfig);
  }

  setChunks(chunks: KnowledgeChunk[]): void {
    this.lexicalRetriever.setChunks(chunks);
    this.vectorRetriever?.setChunks(chunks);
  }

  getLexicalRetriever(): LexicalRetriever {
    return this.lexicalRetriever;
  }

  getVectorRetriever(): VectorRetriever | undefined {
    return this.vectorRetriever;
  }

  getReranker(): KnowledgeReranker {
    return this.reranker;
  }

  /**
   * 执行只读多路混合检索与重排序
   */
  async retrieve(query: KnowledgeRetrievalQuery): Promise<KnowledgeRetrievalResult> {
    const startTime = Date.now();
    const queryText = (query.queryText || "").trim();

    if (!queryText) {
      return {
        items: [],
        totalCandidates: 0,
        query,
        durationMs: Date.now() - startTime,
      };
    }

    const poolSize = this.policyConfig.candidatePoolSize;

    // 1. 词法检索分支
    const lexicalCandidates = this.lexicalRetriever.retrieve(query, poolSize);

    // 2. 向量检索分支 (若配置了 VectorRetriever)
    let vectorCandidates: any[] = [];
    if (this.vectorRetriever) {
      try {
        vectorCandidates = await this.vectorRetriever.retrieve(query, poolSize);
      } catch (err) {
        console.warn("[HybridRetriever] Vector retrieval failed gracefully, falling back to lexical:", err);
      }
    }

    // 3. 融合与重排序
    const totalCandidates = lexicalCandidates.length + vectorCandidates.length;
    const items: ScoredKnowledgeChunk[] = this.reranker.rerank(
      query,
      lexicalCandidates,
      vectorCandidates,
      query.topK
    );

    return {
      items,
      totalCandidates,
      query,
      durationMs: Date.now() - startTime,
    };
  }
}
