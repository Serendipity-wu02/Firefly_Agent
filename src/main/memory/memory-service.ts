import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { MemoryItem } from "../../shared/memory-types";

export const MEMORY_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/(?:我叫|我的名字[叫是]|请叫我)([一-龥A-Za-z0-9]{1,12})/, "用户名字"],
  [/(?:我的生日是|我生日是)([0-9]{1,4}[月日号]?[0-9]{0,4}[月日号]?)/, "用户生日"],
  [/(?:我喜欢|我最喜欢|我超喜欢)([^，。！？!?,.、\s]{1,12})/, "用户喜好"],
  [/(?:我讨厌|我不喜欢)([^，。！？!?,.、\s]{1,12})/, "用户忌讳"],
];

export class FireflyMemoryService {
  private filePath: string;
  private readonly items = new Map<string, MemoryItem>();

  constructor(customPath?: string) {
    if (customPath) {
      this.filePath = customPath;
    } else {
      try {
        this.filePath = path.join(app.getAppPath(), "config", "memory.json");
      } catch {
        this.filePath = path.join(process.cwd(), "config", "memory.json");
      }
    }
    this.load();
  }

  load(): void {
    this.items.clear();
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        const json = JSON.parse(raw);
        if (Array.isArray(json)) {
          for (const item of json) {
            if (item && typeof item === "object" && typeof item.key === "string" && typeof item.value === "string") {
              const updatedAt = item.updatedAt || item.updated_at || new Date().toISOString();
              this.items.set(item.key.trim(), {
                key: item.key.trim(),
                value: item.value.trim(),
                updatedAt,
                source: item.source,
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn("[FireflyMemoryService] Failed to load memory.json:", err);
    }
  }

  save(): boolean {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const array = Array.from(this.items.values());
      fs.writeFileSync(this.filePath, JSON.stringify(array, null, 2), "utf-8");
      return true;
    } catch (err) {
      console.warn("[FireflyMemoryService] Failed to save memory.json:", err);
      return false;
    }
  }

  remember(key: string, value: string, source?: string): boolean {
    const k = key.trim();
    const v = value.trim();
    if (!k || !v) return false;

    this.items.set(k, {
      key: k,
      value: v,
      updatedAt: new Date().toISOString(),
      source,
    });
    return this.save();
  }

  forget(key: string): boolean {
    const deleted = this.items.delete(key.trim());
    if (deleted) {
      this.save();
    }
    return deleted;
  }

  get(key: string): MemoryItem | undefined {
    return this.items.get(key.trim());
  }

  list(): readonly MemoryItem[] {
    return Array.from(this.items.values());
  }

  clear(): void {
    this.items.clear();
    this.save();
  }

  extractFromText(text: string): Array<{ key: string; value: string }> {
    const found: Array<{ key: string; value: string }> = [];
    const seen = new Set<string>();

    for (const [pattern, key] of MEMORY_PATTERNS) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        const val = match[1].trim();
        if (val && !seen.has(val)) {
          seen.add(val);
          found.push({ key, value: val });
        }
      }
    }
    return found;
  }

  retrieve(_query?: string, limit: number = 20): readonly MemoryItem[] {
    const all = Array.from(this.items.values());
    return all.slice(0, limit);
  }

  buildMemoryContext(query?: string): string {
    const memories = this.retrieve(query);
    if (memories.length === 0) {
      return "";
    }

    const lines = memories.map((m) => `- ${m.key}：${m.value}`);
    return `【用户长期记忆】\n${lines.join("\n")}`;
  }
}
