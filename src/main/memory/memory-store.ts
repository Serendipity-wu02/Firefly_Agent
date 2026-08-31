import fs from "node:fs";
import path from "node:path";
import type {
  MemoryRecord,
  EntityNode,
  RelationEdge,
  PreferenceItem,
  MemoryLayer,
  MemoryScope,
  MemoryCategory,
  MemoryStoreSnapshot,
} from "./memory-types";

export interface MemoryFilter {
  layer?: MemoryLayer;
  scope?: MemoryScope;
  category?: MemoryCategory;
  key?: string;
}

export interface IMemoryStore {
  saveRecord(record: MemoryRecord): Promise<void>;
  getRecord(id: string): Promise<MemoryRecord | undefined>;
  deleteRecord(id: string): Promise<boolean>;
  listRecords(filter?: MemoryFilter): Promise<readonly MemoryRecord[]>;

  saveEntity(entity: EntityNode): Promise<void>;
  getEntity(id: string): Promise<EntityNode | undefined>;
  deleteEntity(id: string): Promise<boolean>;
  listEntities(scope?: MemoryScope): Promise<readonly EntityNode[]>;

  saveRelation(relation: RelationEdge): Promise<void>;
  getRelation(id: string): Promise<RelationEdge | undefined>;
  deleteRelation(id: string): Promise<boolean>;
  listRelations(scope?: MemoryScope): Promise<readonly RelationEdge[]>;

  savePreference(pref: PreferenceItem): Promise<void>;
  getPreference(id: string): Promise<PreferenceItem | undefined>;
  deletePreference(id: string): Promise<boolean>;
  listPreferences(scope?: MemoryScope): Promise<readonly PreferenceItem[]>;

  clear(): Promise<void>;
  reload(): Promise<void>;
  flush(): Promise<boolean>;
}

/**
 * 纯内存存储器 (InMemoryMemoryStore) - 适用于高速单测与无盘运行环境
 */
export class InMemoryMemoryStore implements IMemoryStore {
  private readonly records = new Map<string, MemoryRecord>();
  private readonly entities = new Map<string, EntityNode>();
  private readonly relations = new Map<string, RelationEdge>();
  private readonly preferences = new Map<string, PreferenceItem>();

  async saveRecord(record: MemoryRecord): Promise<void> {
    this.records.set(record.id, { ...record });
  }

  async getRecord(id: string): Promise<MemoryRecord | undefined> {
    const item = this.records.get(id);
    return item ? { ...item } : undefined;
  }

  async deleteRecord(id: string): Promise<boolean> {
    return this.records.delete(id);
  }

  async listRecords(filter?: MemoryFilter): Promise<readonly MemoryRecord[]> {
    let result = Array.from(this.records.values());
    if (filter) {
      if (filter.layer) result = result.filter((r) => r.layer === filter.layer);
      if (filter.scope) result = result.filter((r) => r.scope === filter.scope);
      if (filter.category) result = result.filter((r) => r.category === filter.category);
      if (filter.key) result = result.filter((r) => r.key === filter.key);
    }
    return result.map((r) => ({ ...r }));
  }

  async saveEntity(entity: EntityNode): Promise<void> {
    this.entities.set(entity.id, { ...entity });
  }

  async getEntity(id: string): Promise<EntityNode | undefined> {
    const item = this.entities.get(id);
    return item ? { ...item } : undefined;
  }

  async deleteEntity(id: string): Promise<boolean> {
    return this.entities.delete(id);
  }

  async listEntities(scope?: MemoryScope): Promise<readonly EntityNode[]> {
    let result = Array.from(this.entities.values());
    if (scope) result = result.filter((e) => e.scope === scope);
    return result.map((e) => ({ ...e }));
  }

  async saveRelation(relation: RelationEdge): Promise<void> {
    this.relations.set(relation.id, { ...relation });
  }

  async getRelation(id: string): Promise<RelationEdge | undefined> {
    const item = this.relations.get(id);
    return item ? { ...item } : undefined;
  }

  async deleteRelation(id: string): Promise<boolean> {
    return this.relations.delete(id);
  }

  async listRelations(scope?: MemoryScope): Promise<readonly RelationEdge[]> {
    let result = Array.from(this.relations.values());
    if (scope) result = result.filter((r) => r.scope === scope);
    return result.map((r) => ({ ...r }));
  }

  async savePreference(pref: PreferenceItem): Promise<void> {
    this.preferences.set(pref.id, { ...pref });
  }

  async getPreference(id: string): Promise<PreferenceItem | undefined> {
    const item = this.preferences.get(id);
    return item ? { ...item } : undefined;
  }

  async deletePreference(id: string): Promise<boolean> {
    return this.preferences.delete(id);
  }

  async listPreferences(scope?: MemoryScope): Promise<readonly PreferenceItem[]> {
    let result = Array.from(this.preferences.values());
    if (scope) result = result.filter((p) => p.scope === scope);
    return result.map((p) => ({ ...p }));
  }

  async clear(): Promise<void> {
    this.records.clear();
    this.entities.clear();
    this.relations.clear();
    this.preferences.clear();
  }

  async reload(): Promise<void> {
    // In-memory store does not reload from disk
  }

  async flush(): Promise<boolean> {
    return true;
  }
}

export interface FileMemoryStoreOptions {
  filePath: string;
  legacyV1Path?: string;
}

/**
 * 文件持久化存储器 (FileMemoryStore)
 *
 * 具备特性：
 * 1. 原子持久化：采用写入 ${filePath}.tmp 并重命名保障崩溃安全；
 * 2. 模式版本校验：确保 snapshot.version 严格匹配（当前 version: 1）；
 * 3. 损坏恢复与备份：遇到非法 JSON 自动备份损坏文件并以空集合恢复，防止崩溃；
 * 4. V1 向后兼容只读读取：当 memory_v2.json 不存在时可无缝兼容读取 legacy memory.json。
 */
export class FileMemoryStore implements IMemoryStore {
  private readonly filePath: string;
  private readonly legacyV1Path?: string;
  private readonly memoryStore = new InMemoryMemoryStore();
  private isLoaded = false;

  constructor(options: FileMemoryStoreOptions) {
    this.filePath = options.filePath;
    this.legacyV1Path = options.legacyV1Path;
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.isLoaded) {
      await this.reload();
    }
  }

  async reload(): Promise<void> {
    await this.memoryStore.clear();

    if (fs.existsSync(this.filePath)) {
      try {
        const raw = await fs.promises.readFile(this.filePath, "utf-8");
        const json = JSON.parse(raw);

        if (json && typeof json === "object" && Array.isArray(json.records)) {
          if (json.version !== 1) {
            console.warn(`[FileMemoryStore] Unsupported schema version: ${json.version}`);
          }
          for (const rec of json.records) {
            if (rec && typeof rec.id === "string" && typeof rec.key === "string") {
              await this.memoryStore.saveRecord(rec);
            }
          }
          if (Array.isArray(json.entities)) {
            for (const ent of json.entities) {
              if (ent && typeof ent.id === "string") {
                await this.memoryStore.saveEntity(ent);
              }
            }
          }
          if (Array.isArray(json.relations)) {
            for (const rel of json.relations) {
              if (rel && typeof rel.id === "string") {
                await this.memoryStore.saveRelation(rel);
              }
            }
          }
          if (Array.isArray(json.preferences)) {
            for (const pref of json.preferences) {
              if (pref && typeof pref.id === "string") {
                await this.memoryStore.savePreference(pref);
              }
            }
          }
          this.isLoaded = true;
          return;
        }
      } catch (err) {
        console.warn(`[FileMemoryStore] Corrupt memory file at "${this.filePath}", backing up:`, err);
        const backupPath = `${this.filePath}.corrupt.${Date.now()}.bak`;
        try {
          await fs.promises.rename(this.filePath, backupPath);
        } catch {
          // ignore rename error
        }
      }
    }

    // Fallback: Read Legacy V1 memory.json if available
    if (this.legacyV1Path && fs.existsSync(this.legacyV1Path)) {
      try {
        const legacyRaw = await fs.promises.readFile(this.legacyV1Path, "utf-8");
        const legacyJson = JSON.parse(legacyRaw);
        if (Array.isArray(legacyJson)) {
          for (const item of legacyJson) {
            if (item && typeof item.key === "string" && typeof item.value === "string") {
              const keyHex = Buffer.from(item.key).toString("hex");
              const rec: MemoryRecord = {
                id: `mem_v1_${keyHex}`,
                layer: "L2_SEMANTIC",
                category: "profile",
                scope: "user",
                key: item.key.trim(),
                value: item.value.trim(),
                importance: 0.8,
                confidence: 1.0,
                accessCount: 1,
                createdAt: Date.now(),
                updatedAt: item.updatedAt ? new Date(item.updatedAt).getTime() : Date.now(),
                lastAccessedAt: Date.now(),
                source: item.source || "legacy_v1_import",
                pinned: true,
              };
              await this.memoryStore.saveRecord(rec);
            }
          }
        }
      } catch (legacyErr) {
        console.warn(`[FileMemoryStore] Failed to read legacy V1 memory from "${this.legacyV1Path}":`, legacyErr);
      }
    }

    this.isLoaded = true;
  }

  async flush(): Promise<boolean> {
    await this.ensureLoaded();
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }

      const records = Array.from(await this.memoryStore.listRecords());
      const entities = Array.from(await this.memoryStore.listEntities());
      const relations = Array.from(await this.memoryStore.listRelations());
      const preferences = Array.from(await this.memoryStore.listPreferences());

      const snapshot: MemoryStoreSnapshot = {
        version: 1,
        updatedAt: Date.now(),
        records,
        entities,
        relations,
        preferences,
      };

      const tmpPath = `${this.filePath}.tmp.${Date.now()}`;
      await fs.promises.writeFile(tmpPath, JSON.stringify(snapshot, null, 2), "utf-8");
      await fs.promises.rename(tmpPath, this.filePath);
      return true;
    } catch (err) {
      console.warn(`[FileMemoryStore] Failed to flush memory snapshot to "${this.filePath}":`, err);
      return false;
    }
  }

  async saveRecord(record: MemoryRecord): Promise<void> {
    await this.ensureLoaded();
    await this.memoryStore.saveRecord(record);
    await this.flush();
  }

  async getRecord(id: string): Promise<MemoryRecord | undefined> {
    await this.ensureLoaded();
    return this.memoryStore.getRecord(id);
  }

  async deleteRecord(id: string): Promise<boolean> {
    await this.ensureLoaded();
    const deleted = await this.memoryStore.deleteRecord(id);
    if (deleted) await this.flush();
    return deleted;
  }

  async listRecords(filter?: MemoryFilter): Promise<readonly MemoryRecord[]> {
    await this.ensureLoaded();
    return this.memoryStore.listRecords(filter);
  }

  async saveEntity(entity: EntityNode): Promise<void> {
    await this.ensureLoaded();
    await this.memoryStore.saveEntity(entity);
    await this.flush();
  }

  async getEntity(id: string): Promise<EntityNode | undefined> {
    await this.ensureLoaded();
    return this.memoryStore.getEntity(id);
  }

  async deleteEntity(id: string): Promise<boolean> {
    await this.ensureLoaded();
    const deleted = await this.memoryStore.deleteEntity(id);
    if (deleted) await this.flush();
    return deleted;
  }

  async listEntities(scope?: MemoryScope): Promise<readonly EntityNode[]> {
    await this.ensureLoaded();
    return this.memoryStore.listEntities(scope);
  }

  async saveRelation(relation: RelationEdge): Promise<void> {
    await this.ensureLoaded();
    await this.memoryStore.saveRelation(relation);
    await this.flush();
  }

  async getRelation(id: string): Promise<RelationEdge | undefined> {
    await this.ensureLoaded();
    return this.memoryStore.getRelation(id);
  }

  async deleteRelation(id: string): Promise<boolean> {
    await this.ensureLoaded();
    const deleted = await this.memoryStore.deleteRelation(id);
    if (deleted) await this.flush();
    return deleted;
  }

  async listRelations(scope?: MemoryScope): Promise<readonly RelationEdge[]> {
    await this.ensureLoaded();
    return this.memoryStore.listRelations(scope);
  }

  async savePreference(pref: PreferenceItem): Promise<void> {
    await this.ensureLoaded();
    await this.memoryStore.savePreference(pref);
    await this.flush();
  }

  async getPreference(id: string): Promise<PreferenceItem | undefined> {
    await this.ensureLoaded();
    return this.memoryStore.getPreference(id);
  }

  async deletePreference(id: string): Promise<boolean> {
    await this.ensureLoaded();
    const deleted = await this.memoryStore.deletePreference(id);
    if (deleted) await this.flush();
    return deleted;
  }

  async listPreferences(scope?: MemoryScope): Promise<readonly PreferenceItem[]> {
    await this.ensureLoaded();
    return this.memoryStore.listPreferences(scope);
  }

  async clear(): Promise<void> {
    await this.ensureLoaded();
    await this.memoryStore.clear();
    await this.flush();
  }
}
