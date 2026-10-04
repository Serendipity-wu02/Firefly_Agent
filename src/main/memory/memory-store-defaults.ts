import { L0Profile, L1Profile, MemoryStore } from "./memory-types"
import { getMemoryLanguage } from "../locale-context"

export const CURRENT_MEMORY_SCHEMA_VERSION = 2

export function isCurrentMemoryStore(value: unknown): value is MemoryStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const store = value as Partial<MemoryStore>
  if (store.schemaVersion !== CURRENT_MEMORY_SCHEMA_VERSION || typeof store.version !== "number") return false
  if (!store.l0 || typeof store.l0 !== "object" || Array.isArray(store.l0)) return false
  if (!store.l1 || typeof store.l1 !== "object" || Array.isArray(store.l1)) return false
  const { nickname, preferredName, occupation, longTermInterests, language, permanentNote, isPinned, updatedAt } = store.l0
  if ([nickname, preferredName, occupation, longTermInterests, language, permanentNote]
    .some((value) => typeof value !== "string")) return false
  if (typeof isPinned !== "boolean" || typeof updatedAt !== "number") return false
  const { recentGoals, recentPreferences, currentProject, generatedAt, roundCount } = store.l1
  if ([recentGoals, recentPreferences, currentProject]
    .some((value) => typeof value !== "string")) return false
  if (typeof generatedAt !== "number" || typeof roundCount !== "number") return false
  if (!Array.isArray(store.l2)) return false
  if (store.l2.some((memory) => !memory || typeof memory.id !== "string" || typeof memory.content !== "string")) return false
  return [store.evidence, store.reflectionLogs, store.conflictLogs, store.l2DmaeStates]
    .every((entries) => entries === undefined || Array.isArray(entries))
}


export function createDefaultL0(): L0Profile {
  return {
    nickname: "",
    preferredName: "",
    occupation: "",
    longTermInterests: "",
    language: getMemoryLanguage(),
    permanentNote: "",
    isPinned: false,
    updatedAt: 0,
  };
}

export const DEFAULT_L1: L1Profile = {
  recentGoals: "",
  recentPreferences: "",
  currentProject: "",
  generatedAt: 0,
  roundCount: 0,
}

const DEFAULT_STORE: MemoryStore = {
  schemaVersion: CURRENT_MEMORY_SCHEMA_VERSION,
  l0: { ...createDefaultL0() },
  l1: { ...DEFAULT_L1 },
  l2: [],
  evidence: [],
  reflectionLogs: [],
  conflictLogs: [],
  version: 1,
}

export function createDefaultMemoryStore(): MemoryStore {
  return {
    ...DEFAULT_STORE,
    l0: { ...createDefaultL0() },
    l1: { ...DEFAULT_L1 },
    l2: [],
    evidence: [],
    reflectionLogs: [],
    conflictLogs: [],
    l2DmaeStates: [],
  }
}

/** V5 DMAE：从 L2 content + 关键词文本提取命中检测关键词 */
export function extractMemoryKeywords(input: string, max = 12): string[] {
  if (!input) return []
  // 保留中文/日文/韩文字符、英文单词、数字
  const tokens: string[] = []
  for (const m of input.matchAll(/[\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff]/g)) {
    tokens.push(m[0])
  }
  for (const m of input.toLowerCase().matchAll(/[a-z0-9]+/g)) {
    tokens.push(m[0])
  }
  // 按频率取 top max
  const freq = new Map<string, number>()
  for (const t of tokens) {
    freq.set(t, (freq.get(t) ?? 0) + 1)
  }
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
  return sorted.slice(0, max)
}

export function boundMemorySnippet(text: string | undefined, maxLength: number): string | undefined {
  if (!text) return undefined
  return text.length > maxLength ? text.slice(0, maxLength) : text
}
