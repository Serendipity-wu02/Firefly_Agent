import * as fs from "node:fs";
import * as path from "node:path";
import {
  CHECKPOINT_SCHEMA_VERSION,
  type Checkpoint,
  type ICheckpointStore,
} from "./checkpoint-types";

/**
 * InMemoryCheckpointStore (内存快照存储器 - 适合轻量测试与无盘环境)
 */
export class InMemoryCheckpointStore implements ICheckpointStore {
  private readonly checkpoints = new Map<string, Checkpoint>();

  save(checkpoint: Checkpoint): void {
    const serialized = JSON.stringify(checkpoint);
    this.checkpoints.set(checkpoint.checkpointId, JSON.parse(serialized));
  }

  get(checkpointId: string): Checkpoint | undefined {
    const found = this.checkpoints.get(checkpointId);
    if (!found) return undefined;
    return JSON.parse(JSON.stringify(found));
  }

  getByRunId(runId: string): Checkpoint[] {
    const list: Checkpoint[] = [];
    for (const cp of this.checkpoints.values()) {
      if (cp.runId === runId) {
        list.push(JSON.parse(JSON.stringify(cp)));
      }
    }
    return list.sort((a, b) => a.createdAt - b.createdAt);
  }

  getLatestForRun(runId: string): Checkpoint | undefined {
    const list = this.getByRunId(runId);
    return list[list.length - 1];
  }

  delete(checkpointId: string): boolean {
    return this.checkpoints.delete(checkpointId);
  }

  clear(): void {
    this.checkpoints.clear();
  }
}

/**
 * FileCheckpointStore (基于文件的原子持久化快照存储器)
 *
 * 特性：
 * 1. 原子写入 (Atomic Write via .tmp + rename)
 * 2. 校验与版本检查 (Schema Version Validation)
 * 3. 损坏隔离 (Corruption Handling & Graceful Fallback)
 */
export class FileCheckpointStore implements ICheckpointStore {
  constructor(private readonly baseDir: string) {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private getFilePath(checkpointId: string): string {
    const safeId = checkpointId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.baseDir, `${safeId}.json`);
  }

  private getTempFilePath(checkpointId: string): string {
    const safeId = checkpointId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.baseDir, `${safeId}.tmp`);
  }

  async save(checkpoint: Checkpoint): Promise<void> {
    const filePath = this.getFilePath(checkpoint.checkpointId);
    const tempPath = this.getTempFilePath(checkpoint.checkpointId);

    const payload = JSON.stringify(checkpoint, null, 2);

    // 1. 写入临时文件
    await fs.promises.writeFile(tempPath, payload, "utf-8");

    // 2. 原子重命名覆盖
    await fs.promises.rename(tempPath, filePath);
  }

  async get(checkpointId: string): Promise<Checkpoint | undefined> {
    const filePath = this.getFilePath(checkpointId);
    if (!fs.existsSync(filePath)) {
      return undefined;
    }

    try {
      const raw = await fs.promises.readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);

      // 架构版本校验
      if (!parsed || parsed.version !== CHECKPOINT_SCHEMA_VERSION) {
        console.warn(
          `[FileCheckpointStore] Checkpoint version mismatch or corrupt: ${checkpointId}`,
        );
        return undefined;
      }

      return parsed as Checkpoint;
    } catch (err) {
      console.warn(`[FileCheckpointStore] Corrupt checkpoint file for "${checkpointId}":`, err);
      return undefined;
    }
  }

  async getByRunId(runId: string): Promise<Checkpoint[]> {
    if (!fs.existsSync(this.baseDir)) return [];

    const files = await fs.promises.readdir(this.baseDir);
    const checkpoints: Checkpoint[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const cpId = path.basename(file, ".json");
      const cp = await this.get(cpId);
      if (cp && cp.runId === runId) {
        checkpoints.push(cp);
      }
    }

    return checkpoints.sort((a, b) => a.createdAt - b.createdAt);
  }

  async getLatestForRun(runId: string): Promise<Checkpoint | undefined> {
    const list = await this.getByRunId(runId);
    return list[list.length - 1];
  }

  async delete(checkpointId: string): Promise<boolean> {
    const filePath = this.getFilePath(checkpointId);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }
    return false;
  }

  async clear(): Promise<void> {
    if (!fs.existsSync(this.baseDir)) return;
    const files = await fs.promises.readdir(this.baseDir);
    for (const file of files) {
      if (file.endsWith(".json") || file.endsWith(".tmp")) {
        await fs.promises.unlink(path.join(this.baseDir, file));
      }
    }
  }
}
