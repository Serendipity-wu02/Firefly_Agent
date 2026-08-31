import crypto from "node:crypto";
import type { IEmbeddingProvider, EmbeddingModelInfo } from "./vector-types";

export interface DeterministicEmbeddingOptions {
  model?: string;
  dimension?: number;
  version?: string;
}

/**
 * 确定性测试与离线嵌入提供商 (DeterministicEmbeddingProvider)
 * 基于多项式字符哈希与 L2 归一化生成可复现的高维向量。
 * 具备语义相似性投射能力 (相同/重叠词汇具有更高的余弦相似度)，专用于离线/单元测试与无外部模型依赖场景。
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
    // 1. 生成 1-gram / 2-gram 字符特征投射
    for (let i = 0; i < cleanText.length; i++) {
      const charCode = cleanText.charCodeAt(i);
      const idx1 = (charCode * 31 + i * 17) % dim;
      vector[idx1] += 1.0;

      if (i + 1 < cleanText.length) {
        const nextCode = cleanText.charCodeAt(i + 1);
        const bigramHash = (charCode * 10007 + nextCode * 37 + i * 13) % dim;
        vector[bigramHash] += 1.5;
      }
    }

    // 2. MD5 整体散列补充分散性
    const md5Hex = crypto.createHash("md5").update(cleanText).digest("hex");
    for (let i = 0; i < md5Hex.length; i += 2) {
      const byteVal = parseInt(md5Hex.slice(i, i + 2), 16);
      const targetIdx = (byteVal * 19 + i * 7) % dim;
      vector[targetIdx] += (byteVal - 128) / 256;
    }

    // 3. L2 范数归一化 (Unit Normalization for Cosine Similarity)
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
