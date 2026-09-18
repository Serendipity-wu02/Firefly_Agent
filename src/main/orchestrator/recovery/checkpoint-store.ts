import * as fs from "node:fs";
import * as path from "node:path";
import {
  CHECKPOINT_SCHEMA_VERSION,
  type Checkpoint,
  type CheckpointReadResult,
  type ICheckpointStore,
} from "./checkpoint-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidCheckpointVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

function isCheckpointRecord(value: unknown): value is Checkpoint {
  if (!isRecord(value)) return false;
  const record = value;
  return (
    typeof record.checkpointId === "string" &&
    typeof record.runId === "string" &&
    typeof record.sessionId === "string" &&
    typeof record.step === "number" &&
    typeof record.runState === "string" &&
    typeof record.stepState === "string" &&
    Array.isArray(record.messages) &&
    Array.isArray(record.activeToolCalls) &&
    typeof record.recoveryAttempts === "number" &&
    typeof record.createdAt === "number" &&
    isValidCheckpointVersion(record.version) &&
    typeof record.trigger === "string"
  );
}

type ParsedCheckpointReadResult = Extract<
  CheckpointReadResult,
  { readonly kind: "found" | "invalid_format" | "unsupported_version" }
>;

function classifyCheckpointValue(
  checkpointId: string,
  value: unknown,
): ParsedCheckpointReadResult {
  if (!isRecord(value) || !isValidCheckpointVersion(value.version)) {
    return { kind: "invalid_format", checkpointId };
  }

  if (value.version !== CHECKPOINT_SCHEMA_VERSION) {
    return { kind: "unsupported_version", checkpointId, version: value.version };
  }

  if (!isCheckpointRecord(value)) {
    return { kind: "invalid_format", checkpointId };
  }

  return { kind: "found", checkpoint: value };
}

function cloneCheckpoint(checkpoint: Checkpoint): Checkpoint {
  return JSON.parse(JSON.stringify(checkpoint)) as Checkpoint;
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

/**
 * InMemoryCheckpointStore (内存快照存储器 - 适合轻量测试与无盘环境)
 */
export class InMemoryCheckpointStore implements ICheckpointStore {
  private readonly checkpoints = new Map<string, unknown>();

  save(checkpoint: Checkpoint): void {
    const serialized = JSON.stringify(checkpoint);
    this.checkpoints.set(checkpoint.checkpointId, JSON.parse(serialized));
  }

  read(checkpointId: string): CheckpointReadResult {
    if (!this.checkpoints.has(checkpointId)) {
      return { kind: "not_found", checkpointId };
    }
    const result = classifyCheckpointValue(checkpointId, this.checkpoints.get(checkpointId));
    return result.kind === "found"
      ? { kind: "found", checkpoint: cloneCheckpoint(result.checkpoint) }
      : result;
  }

  get(checkpointId: string): Checkpoint | undefined {
    const result = this.read(checkpointId);
    return result.kind === "found" ? result.checkpoint : undefined;
  }

  getByRunId(runId: string): Checkpoint[] {
    const list: Checkpoint[] = [];
    for (const checkpointId of this.checkpoints.keys()) {
      const result = this.read(checkpointId);
      if (result.kind === "found" && result.checkpoint.runId === runId) {
        list.push(result.checkpoint);
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

  async read(checkpointId: string): Promise<CheckpointReadResult> {
    const filePath = this.getFilePath(checkpointId);

    try {
      const baseDirectory = await fs.promises.stat(this.baseDir);
      if (!baseDirectory.isDirectory()) {
        console.warn(`[FileCheckpointStore] Checkpoint store path is not a directory.`);
        return { kind: "read_error", checkpointId, errorCode: "io_error" };
      }
    } catch {
      console.warn(`[FileCheckpointStore] Checkpoint store directory could not be read.`);
      return { kind: "read_error", checkpointId, errorCode: "io_error" };
    }

    let raw: string;
    try {
      raw = await fs.promises.readFile(filePath, "utf-8");
    } catch (error) {
      if (isMissingFileError(error)) {
        return { kind: "not_found", checkpointId };
      }
      console.warn(`[FileCheckpointStore] Checkpoint read failed for "${checkpointId}".`);
      return { kind: "read_error", checkpointId, errorCode: "io_error" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn(`[FileCheckpointStore] Invalid checkpoint JSON: ${checkpointId}`);
      return { kind: "invalid_format", checkpointId };
    }

    const result = classifyCheckpointValue(checkpointId, parsed);
    if (result.kind === "invalid_format") {
      console.warn(`[FileCheckpointStore] Invalid checkpoint format: ${checkpointId}`);
    } else if (result.kind === "unsupported_version") {
      console.warn(`[FileCheckpointStore] Unsupported checkpoint version: ${checkpointId}`);
    }
    return result;
  }

  async get(checkpointId: string): Promise<Checkpoint | undefined> {
    const result = await this.read(checkpointId);
    return result.kind === "found" ? result.checkpoint : undefined;
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
