import type { IEmbeddingProvider, EmbeddingModelInfo } from "./vector-types";

export interface DeterministicEmbeddingOptions {
  model?: string;
  dimension?: number;
  version?: string;
}

/**
 * 确定性测试与离线嵌入提供商 (DeterministicEmbeddingProvider)
 * 基于字符 n-gram 哈希投射与 L2 范数归一化生成可复现的高维向量。
 * 具备基础的字符重叠相似度，专用于离线/单元测试与无外部模型依赖场景。
 * (注: 本实现为测试/基础设施 provider，非最终生产语义深度模型)
 */
export class DeterministicEmbeddingProvider implements IEmbeddingProvider {
  readonly modelInfo: Readonly<EmbeddingModelInfo>;

  constructor(options: DeterministicEmbeddingOptions = {}) {
    this.modelInfo = {
      model: options.model || "deterministic-bge-384",
      dimension: options.dimension || 384,
      version: options.version || "1.0.0",
    };
  }

  /**
   * 将单段文本转换为高维归一化向量
   */
  async embedText(text: string): Promise<number[]> {
    const dim = this.modelInfo.dimension;
    const vector = new Array<number>(dim).fill(0);

    if (!text || text.trim().length === 0) {
      return vector;
    }

    const cleanText = text.toLowerCase().trim();

    // 1. 1-gram / 2-gram 字符特征投射 (Character n-gram feature hashing)
    for (let i = 0; i < cleanText.length; i++) {
      const charCode = cleanText.charCodeAt(i);
      const unigramIdx = (charCode * 37) % dim;
      vector[unigramIdx] += 1.0;

      if (i + 1 < cleanText.length) {
        const nextCode = cleanText.charCodeAt(i + 1);
        const bigramIdx = ((charCode << 5) - charCode + nextCode) % dim;
        const safeIdx = ((bigramIdx % dim) + dim) % dim;
        vector[safeIdx] += 2.0;
      }
    }

    // 2. L2 范数归一化 (Unit Normalization for Cosine Similarity)
    let norm = 0;
    for (let i = 0; i < dim; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < dim; i++) {
        vector[i] = vector[i] / norm;
      }
    }

    return vector;
  }

  /**
   * 批量嵌入计算
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embedText(text));
    }
    return results;
  }
}

export interface CustomMockEmbeddingOptions {
  modelInfo?: EmbeddingModelInfo;
  onEmbed?: (text: string) => Promise<number[]> | number[];
}

/**
 * 可控测试用 Mock 提供商
 */
export class MockEmbeddingProvider implements IEmbeddingProvider {
  readonly modelInfo: Readonly<EmbeddingModelInfo>;
  private readonly onEmbed?: (text: string) => Promise<number[]> | number[];

  constructor(options: CustomMockEmbeddingOptions = {}) {
    this.modelInfo = options.modelInfo || {
      model: "mock-embedding-model",
      dimension: 64,
      version: "1.0.0",
    };
    this.onEmbed = options.onEmbed;
  }

  async embedText(text: string): Promise<number[]> {
    if (this.onEmbed) {
      return this.onEmbed(text);
    }
    const dim = this.modelInfo.dimension;
    return new Array<number>(dim).fill(0.1);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const res: number[][] = [];
    for (const t of texts) {
      res.push(await this.embedText(t));
    }
    return res;
  }
}
