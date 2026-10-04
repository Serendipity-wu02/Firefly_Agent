import * as fs from "fs"
import * as path from "path"
import { app } from "electron"
import { MemoryStore } from "./memory-types"
import { AtomicJsonStore } from "../atomic-json-store"
import { isCurrentMemoryStore } from "./memory-store-defaults"

export function resolveMemoryPath(): string | null {
  // Electron 主进程外（如单测环境）app 可能不存在，直接放弃持久化
  try {
    return path.join(app.getPath("userData"), "memory.json")
  } catch {
    return null
  }
}

export function memoryFileExists(filePath: string): boolean {
  return fs.existsSync(filePath)
}

export function readMemoryFile(filePath: string): Partial<MemoryStore> {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<MemoryStore>
}

export function writeMemoryFile(filePath: string, store: MemoryStore): void {
  // Keep the PMRS schema and read-failure guard. The previous valid bytes are
  // retained in memory.json.bak; recovery is explicit and never replaces a
  // damaged source with defaults or a backup during load.
  new AtomicJsonStore<MemoryStore>(filePath, isCurrentMemoryStore).write(store)
}
