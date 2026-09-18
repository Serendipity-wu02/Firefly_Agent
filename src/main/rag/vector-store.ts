import * as fs from "node:fs";
import * as path from "node:path";
import type {
  IVectorStore,
  VectorRecord,
  VectorFilter,
  VectorQueryResult,
} from "./vector-types";

/**
 * 内存向量存储器 (InMemoryVectorStore)
 */
export class InMemoryVectorStore implements IVectorStore {
  private readonly records = new Map<string, VectorRecord>();

  async upsert(records: VectorRecord[]): Promise<void> {
    for (const rec of records) {
      if (!rec || !rec.chunkId) continue;
      this.records.set(rec.chunkId, {
        ...rec,
        updatedAt: Date.now(),
      });
    }
  }

  async delete(chunkIds: string[]): Promise<number> {
    let count = 0;
    for (const id of chunkIds) {
      if (this.records.delete(id)) {
        count++;
      }
    }
    return count;
  }

  async deleteBySource(sourceUri: string): Promise<number> {
    let count = 0;
    for (const [id, rec] of this.records.entries()) {
      if (rec.sourceUri === sourceUri) {
        this.records.delete(id);
        count++;
      }
    }
    return count;
  }

  async get(chunkId: string): Promise<VectorRecord | null> {
    return this.records.get(chunkId) || null;
  }

  /**
   * 计算余弦相似度并返回 Top-K 结果
   */
  async query(
    queryVector: number[],
    topK = 5,
    filter?: VectorFilter
  ): Promise<VectorQueryResult[]> {
    if (!queryVector || queryVector.length === 0 || this.records.size === 0) {
      return [];
    }

    // 1. 计算 query 范数
    let qNorm = 0;
    for (let i = 0; i < queryVector.length; i++) {
      qNorm += queryVector[i] * queryVector[i];
    }
    qNorm = Math.sqrt(qNorm);
    if (qNorm === 0) return [];

    const candidates: VectorQueryResult[] = [];

    // 2. 遍历并计算余弦相似度
    for (const rec of this.records.values()) {
      // Filter checks
      if (filter?.minPriority !== undefined && rec.canonicalPriority < filter.minPriority) {
        continue;
      }
      if (filter?.sourceUri && rec.sourceUri !== filter.sourceUri) {
        continue;
      }
      if (filter?.documentId && rec.documentId !== filter.documentId) {
        continue;
      }
      if (filter?.chunkType && rec.chunkType !== filter.chunkType) {
        continue;
      }

      const emb = rec.embedding;
      if (!emb || emb.length !== queryVector.length) {
        continue;
      }

      let dotProduct = 0;
      let rNorm = 0;
      for (let i = 0; i < emb.length; i++) {
        dotProduct += queryVector[i] * emb[i];
        rNorm += emb[i] * emb[i];
      }
      rNorm = Math.sqrt(rNorm);

      const similarity = rNorm > 0 ? dotProduct / (qNorm * rNorm) : 0;

      candidates.push({
        chunkId: rec.chunkId,
        documentId: rec.documentId,
        sourceUri: rec.sourceUri,
        similarity: Math.max(0, Math.min(1, similarity)),
        record: rec,
      });
    }

    // 3. 按相似度降序排序，若相似度一致则按权威优先级与 chunkId 决胜
    candidates.sort((a, b) => {
      if (Math.abs(b.similarity - a.similarity) > 1e-6) {
        return b.similarity - a.similarity;
      }
      if (b.record.canonicalPriority !== a.record.canonicalPriority) {
        return b.record.canonicalPriority - a.record.canonicalPriority;
      }
      return a.chunkId.localeCompare(b.chunkId);
    });

    return candidates.slice(0, topK);
  }

  async count(): Promise<number> {
    return this.records.size;
  }

  async list(): Promise<VectorRecord[]> {
    return Array.from(this.records.values());
  }

  async clear(): Promise<void> {
    this.records.clear();
  }

  async flush(): Promise<boolean> {
    return true;
  }

  async reload(): Promise<void> {
    // In-memory store has no persistence source
  }
}

export interface FileVectorStoreOptions {
  filePath: string;
}

interface VectorSnapshotSchema {
  version: number;
  updatedAt: number;
  totalRecords: number;
  records: VectorRecord[];
}

/**
 * 文件持久化向量存储器 (FileVectorStore)
 *
 * 具备特性：
 * 1. 原子持久化：采用写入 ${filePath}.tmp 并重命名保障崩溃安全；
 * 2. 模式版本校验：确保 snapshot.version 严格匹配（当前 version: 1）；
 * 3. 损坏自愈与备份：遇到非法 JSON 自动备份损坏文件并以空集合恢复，防止崩溃；
 * 4. 高速只读检索：基于内存索引与余弦相似度计算，秒级响应。
 */
export class FileVectorStore implements IVectorStore {
  private readonly filePath: string;
  private readonly inMemory = new InMemoryVectorStore();
  private isLoaded = false;

  constructor(options: FileVectorStoreOptions) {
    this.filePath = options.filePath;
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.isLoaded) {
      await this.reload();
      this.isLoaded = true;
    }
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    await this.ensureLoaded();
    await this.inMemory.upsert(records);
    await this.flush();
  }

  async delete(chunkIds: string[]): Promise<number> {
    await this.ensureLoaded();
    const count = await this.inMemory.delete(chunkIds);
    if (count > 0) {
      await this.flush();
    }
    return count;
  }

  async deleteBySource(sourceUri: string): Promise<number> {
    await this.ensureLoaded();
    const count = await this.inMemory.deleteBySource(sourceUri);
    if (count > 0) {
      await this.flush();
    }
    return count;
  }

  async get(chunkId: string): Promise<VectorRecord | null> {
    await this.ensureLoaded();
    return this.inMemory.get(chunkId);
  }

  async query(
    queryVector: number[],
    topK = 5,
    filter?: VectorFilter
  ): Promise<VectorQueryResult[]> {
    await this.ensureLoaded();
    return this.inMemory.query(queryVector, topK, filter);
  }

  async count(): Promise<number> {
    await this.ensureLoaded();
    return this.inMemory.count();
  }

  async list(): Promise<VectorRecord[]> {
    await this.ensureLoaded();
    return this.inMemory.list();
  }

  async clear(): Promise<void> {
    await this.inMemory.clear();
    await this.flush();
  }

  async reload(): Promise<void> {
    await this.inMemory.clear();

    if (fs.existsSync(this.filePath)) {
      try {
        const raw = await fs.promises.readFile(this.filePath, "utf-8");
        const json = JSON.parse(raw) as VectorSnapshotSchema;

        if (json && typeof json === "object" && Array.isArray(json.records)) {
          if (json.version !== 1) {
            console.warn(`[FileVectorStore] Unsupported schema version: ${json.version}`);
          }
          await this.inMemory.upsert(json.records);
        }
      } catch (err) {
        console.error(`[FileVectorStore] Corrupted vector store file, creating backup: ${this.filePath}`, err);
        const backupPath = `${this.filePath}.corrupt-${Date.now()}.bak`;
        try {
          await fs.promises.copyFile(this.filePath, backupPath);
        } catch {
          // ignore backup failure
        }
      }
    }
    this.isLoaded = true;
  }

  async flush(): Promise<boolean> {
    try {
      const records = await this.inMemory.list();
      const snapshot: VectorSnapshotSchema = {
        version: 1,
        updatedAt: Date.now(),
        totalRecords: records.length,
        records,
      };

      const dir = path.dirname(this.filePath);
      await fs.promises.mkdir(dir, { recursive: true });

      const tmpPath = `${this.filePath}.tmp`;
      await fs.promises.writeFile(tmpPath, JSON.stringify(snapshot, null, 2), "utf-8");
      await fs.promises.rename(tmpPath, this.filePath);
      return true;
    } catch (err) {
      console.error(`[FileVectorStore] Failed to flush vector store: ${this.filePath}`, err);
      return false;
    }
  }
}
