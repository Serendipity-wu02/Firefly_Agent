const LEGACY_EVENT_PREFIX = "cyrene.";
const CURRENT_EVENT_PREFIX = "firefly.";
const LEGACY_ENVIRONMENT = {
  FIREFLY_PERF_HARNESS: "CYRENE_PERF_HARNESS",
  FIREFLY_PERF_PROFILE: "CYRENE_PERF_PROFILE",
  FIREFLY_PERF_OUT_DIR: "CYRENE_PERF_OUT_DIR",
  FIREFLY_LOG_LEVEL: "CYRENE_LOG_LEVEL",
  FIREFLY_ELECTRON_BIN: "CYRENE_ELECTRON_BIN",
  FIREFLY_HOME: "CYRENE_HOME",
  FIREFLY_DEBUG_LOGS: "CYRENE_DEBUG_LOGS",
  FIREFLY_TRANSCRIPT_CONTEXT_SOURCE: "CYRENE_TRANSCRIPT_CONTEXT_SOURCE",
  FIREFLY_SKIP_FFPROBE: "CYRENE_SKIP_FFPROBE",
  FIREFLY_SCREENSHOT_HELPER_PATH: "CYRENE_SCREENSHOT_HELPER_PATH",
  FIREFLY_MODELS_DIR: "CYRENE_MODELS_DIR",
  FIREFLY_SRT: "CYRENE_SRT",
  FIREFLY_PROMPT_DUMP: "CYRENE_PROMPT_DUMP",
} as const;
export function fireflyEnvironment(env: Record<string, string | undefined>, key: keyof typeof LEGACY_ENVIRONMENT): string | undefined {
  return env[key] ?? env[LEGACY_ENVIRONMENT[key]];
}
export const LEGACY_INTERNAL_DIRECTORY = ".cyrene";
export const LEGACY_USER_DATA_DIRECTORY = ".cyrene-user-data";
export const LEGACY_HARNESS_PROMPT = "cyrene_harness.md";
export const LEGACY_LOCAL_ENDPOINT_AUTH_FALLBACK = "__CYRENE_LOCAL_NO_AUTH__";
export const LEGACY_LAST_MODE_STORAGE_KEY = "cyrene-react-last-mode";
export const LEGACY_PLACEHOLDER_PREFIX = "https://cyrene.invalid/__file-link__/";
export const LEGACY_CHANNEL_HEADER = "x-cyrene-channel-secret";
export const LEGACY_MARKET_METADATA = "cyrene-market.json";
const LEGACY_STORAGE_KEYS: Record<string, string> = {
  "firefly.rag.model": "cyrene.rag.model",
  "firefly.reranker.mode": "cyrene.reranker.mode",
};
export function readFireflyStorage(storage: { getItem(key: string): string | null; setItem(key: string, value: string): void }, key: string): string | null {
  const current = storage.getItem(key);
  if (current !== null) return current;
  const legacy = LEGACY_STORAGE_KEYS[key];
  const value = legacy ? storage.getItem(legacy) : null;
  if (value !== null) storage.setItem(key, value);
  return value;
}

export function normalizeFireflyEvent<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  const event = value as Record<string, unknown>;
  if (event.type !== "CUSTOM" || typeof event.name !== "string" || !event.name.startsWith(LEGACY_EVENT_PREFIX)) return value;
  return { ...event, name: CURRENT_EVENT_PREFIX + event.name.slice(LEGACY_EVENT_PREFIX.length) } as T;
}

export function normalizeFireflyFields<T extends object>(input: T): T {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_FIREFLY_FIELDS");
  const result = { ...input } as Record<string, unknown>;
  for (const [legacy, current] of [
    ["cyreneMomentsPostingEnabled", "fireflyMomentsPostingEnabled"],
    ["cyreneMomentsReactionsEnabled", "fireflyMomentsReactionsEnabled"],
    ["cyreneFeeling", "fireflyFeeling"],
  ]) {
    if (!Object.prototype.hasOwnProperty.call(result, current) && Object.prototype.hasOwnProperty.call(result, legacy)) result[current] = result[legacy];
    delete result[legacy];
  }
  return result as T;
}

export function normalizeMomentIdentity(value: string): string {
  return value === "cyrene" ? "firefly" : value;
}

export function normalizeStoredMoment<T extends object>(value: T): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_STORED_MOMENT");
  const record = { ...value } as Record<string, unknown>;
  if (typeof record.author === "string") record.author = normalizeMomentIdentity(record.author);
  if (typeof record.actor === "string") record.actor = normalizeMomentIdentity(record.actor);
  if (Array.isArray(record.mentions)) record.mentions = [...new Set(record.mentions.map((name) => typeof name === "string" ? normalizeMomentIdentity(name) : name))];
  return record as T;
}

export const LEGACY_COMPACTION_CHECKPOINT_OPEN = "<cyrene_compaction_checkpoint>";
export const LEGACY_CHANNEL_SECRET_SUFFIX = "cyrene-bot-secret";
export const LEGACY_PANEL_SCHEME = "cyrene-plugin";
export const LEGACY_PANEL_PROTOCOL = "cyrene-panel/1";
export const LEGACY_PANEL_RESOURCE_SEGMENT = ".cyrene";
export const LEGACY_PANEL_BRIDGE_ALIAS = "window.CyrenePanel = window.FireflyPanel;";
export const LEGACY_WINDOW_API_NAMES = {
  firefly: "cyrene",
  fireflyTheme: "cyreneTheme",
  fireflyWindowAppearance: "cyreneWindowAppearance",
  fireflyFont: "cyreneFont",
  fireflyAppearance: "cyreneAppearance",
  fireflyScheduler: "cyreneScheduler",
} as const;
