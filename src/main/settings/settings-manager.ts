import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { BrowserProxyEndpoint } from "../../shared/browser-types";
import {
  normalizeBrowserOrigin,
  normalizeBrowserProxyEndpoint,
} from "../browser/browser-policy";
import { DEFAULT_LLM_CONFIG } from "../../shared/provider-types";
import type { LlmProviderConfig } from "../../shared/provider-types";
import type { UiPreferences } from "../../shared/ui-types";
import { DEFAULT_UI_PREFERENCES } from "../../shared/ui-types";
import type {
  BrowserSettings,
  BrowserSettingsSnapshot,
  FireflySettingsSnapshot,
  FireflySettingsUpdate,
} from "../../shared/settings-types";
import {
  isPermissionProfile,
  migratePersistedPermissionProfile,
  type PermissionProfile,
} from "../../shared/permission-profile-types";

export type FireflyAppSettings = FireflySettingsSnapshot;

type StoredFireflyAppSettings = Omit<FireflyAppSettings, "browser"> & {
  /** Raw value is retained so an invalid saved Browser section is not erased by an unrelated save. */
  browser?: unknown;
};

type BrowserSettingsParseResult =
  | { readonly valid: true; readonly settings: BrowserSettings }
  | { readonly valid: false; readonly reason: "invalid_saved_configuration" };

type BrowserSettingsUpdateResult =
  | { readonly valid: true; readonly settings: BrowserSettings }
  | { readonly valid: false };

type BrowserSettingsStatus = BrowserSettingsSnapshot["status"];

const DEFAULT_BROWSER_SETTINGS: BrowserSettings = Object.freeze({
  transportMode: "direct",
  allowedOrigins: Object.freeze([]),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function browserSettingsIdentity(settings: BrowserSettings): string {
  const origins = settings.allowedOrigins.join(",");
  if (settings.transportMode === "direct") return `direct|${origins}`;
  const hostname = settings.httpProxy.hostname.includes(":")
    ? `[${settings.httpProxy.hostname}]`
    : settings.httpProxy.hostname;
  return `http://${hostname}:${settings.httpProxy.port}|${origins}`;
}

function cloneBrowserSettings(settings: BrowserSettings): BrowserSettings {
  if (settings.transportMode === "direct") {
    return Object.freeze({
      transportMode: "direct",
      allowedOrigins: Object.freeze([...settings.allowedOrigins]),
    });
  }
  const httpProxy: BrowserProxyEndpoint = Object.freeze({ ...settings.httpProxy });
  return Object.freeze({
    transportMode: "http_proxy",
    allowedOrigins: Object.freeze([...settings.allowedOrigins]),
    httpProxy,
  });
}

function normalizeAllowedOrigins(value: unknown): readonly string[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;

  const normalized = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") return undefined;
    const result = normalizeBrowserOrigin(entry);
    if (!result.allowed) return undefined;
    normalized.add(result.origin);
  }
  return Object.freeze(Array.from(normalized).sort((left, right) => left.localeCompare(right)));
}

function invalidBrowserSettings(): BrowserSettingsParseResult {
  return { valid: false, reason: "invalid_saved_configuration" };
}

function parsePersistedBrowserSettings(value: unknown): BrowserSettingsParseResult {
  if (!isRecord(value) || !hasOnlyKeys(value, ["transportMode", "httpProxy", "allowedOrigins"])) {
    return invalidBrowserSettings();
  }

  const allowedOrigins = normalizeAllowedOrigins(value.allowedOrigins);
  if (allowedOrigins === undefined) return invalidBrowserSettings();

  if (value.transportMode === "direct") {
    if (hasOwn(value, "httpProxy")) return invalidBrowserSettings();
    return { valid: true, settings: { transportMode: "direct", allowedOrigins } };
  }

  if (value.transportMode !== "http_proxy" || !isRecord(value.httpProxy)) {
    return invalidBrowserSettings();
  }

  const endpoint = value.httpProxy;
  if (!hasOnlyKeys(endpoint, ["protocol", "hostname", "port"])) {
    return invalidBrowserSettings();
  }
  if (
    endpoint.protocol !== "http:"
    || typeof endpoint.hostname !== "string"
    || endpoint.hostname.length === 0
    || typeof endpoint.port !== "number"
    || !Number.isSafeInteger(endpoint.port)
  ) {
    return invalidBrowserSettings();
  }

  const hostForUrl = endpoint.hostname.includes(":")
    ? `[${endpoint.hostname}]`
    : endpoint.hostname;
  const normalized = normalizeBrowserProxyEndpoint(`http://${hostForUrl}:${endpoint.port}`);
  if (!normalized.allowed) return invalidBrowserSettings();

  return {
    valid: true,
    settings: {
      transportMode: "http_proxy",
      allowedOrigins,
      httpProxy: normalized.endpoint,
    },
  };
}

function normalizeBrowserSettingsUpdate(
  value: unknown,
  fallbackAllowedOrigins: readonly string[],
): BrowserSettingsUpdateResult {
  if (!isRecord(value) || !hasOnlyKeys(value, ["transportMode", "httpProxy", "allowedOrigins"])) {
    return { valid: false };
  }

  const allowedOrigins = hasOwn(value, "allowedOrigins")
    ? normalizeAllowedOrigins(value.allowedOrigins)
    : Object.freeze([...fallbackAllowedOrigins]);
  if (allowedOrigins === undefined) return { valid: false };

  if (value.transportMode === "direct") {
    if (hasOwn(value, "httpProxy")) return { valid: false };
    return { valid: true, settings: { transportMode: "direct", allowedOrigins } };
  }

  if (value.transportMode !== "http_proxy" || typeof value.httpProxy !== "string") {
    return { valid: false };
  }

  const normalized = normalizeBrowserProxyEndpoint(value.httpProxy);
  if (!normalized.allowed) return { valid: false };
  return {
    valid: true,
    settings: {
      transportMode: "http_proxy",
      allowedOrigins,
      httpProxy: normalized.endpoint,
    },
  };
}

export class SettingsManager {
  private configPath: string;
  private settings: StoredFireflyAppSettings = {};
  private persistedSettings: Record<string, unknown> = {};
  private browserSettings: BrowserSettings | undefined = DEFAULT_BROWSER_SETTINGS;
  private browserSettingsStatus: BrowserSettingsStatus = "default";
  private browserSettingsReason: "invalid_saved_configuration" | undefined;
  private browserSettingsRevision = 1;
  private browserSettingsIdentity = browserSettingsIdentity(DEFAULT_BROWSER_SETTINGS);
  private browserSettingsInitialized = false;

  constructor(customPath?: string) {
    if (customPath) {
      this.configPath = customPath;
    } else {
      try {
        this.configPath = path.join(app.getPath("userData"), "settings.json");
      } catch {
        this.configPath = path.join(process.cwd(), "settings.json");
      }
    }
    this.load();
  }

  private updateBrowserSettingsState(
    parsed: BrowserSettingsParseResult,
    status: "default" | "configured",
  ): void {
    const nextIdentity = parsed.valid ? browserSettingsIdentity(parsed.settings) : "unavailable";
    if (!this.browserSettingsInitialized) {
      this.browserSettingsRevision = 1;
      this.browserSettingsInitialized = true;
    } else if (this.browserSettingsIdentity !== nextIdentity) {
      this.browserSettingsRevision += 1;
    }
    this.browserSettingsIdentity = nextIdentity;

    if (parsed.valid) {
      this.browserSettings = parsed.settings;
      this.browserSettingsStatus = status;
      this.browserSettingsReason = undefined;
    } else {
      this.browserSettings = undefined;
      this.browserSettingsStatus = "unavailable";
      this.browserSettingsReason = parsed.reason;
    }
  }

  private loadBrowserSettingsFromRecord(record: Record<string, unknown>): void {
    if (!hasOwn(record, "browser")) {
      this.updateBrowserSettingsState({ valid: true, settings: DEFAULT_BROWSER_SETTINGS }, "default");
      return;
    }
    this.updateBrowserSettingsState(parsePersistedBrowserSettings(record.browser), "configured");
  }

  private resetAfterInvalidSettingsFile(): void {
    this.settings = {};
    this.persistedSettings = {};
    this.updateBrowserSettingsState(invalidBrowserSettings(), "configured");
  }

  load(): FireflyAppSettings {
    if (fs.existsSync(this.configPath)) {
      try {
        const raw = fs.readFileSync(this.configPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (!isRecord(parsed)) {
          this.resetAfterInvalidSettingsFile();
          return this.getSnapshot();
        }

        this.settings = parsed;
        this.persistedSettings = parsed;
        this.loadBrowserSettingsFromRecord(parsed);
        if (this.settings.tts && typeof this.settings.tts === "object") {
          const validEngines = new Set(["off", "gptsovits"]);
          if (!this.settings.tts.engine || !validEngines.has(this.settings.tts.engine)) {
            this.settings.tts.engine = "gptsovits";
            this.save({ tts: this.settings.tts });
          }
        }
        return this.getSnapshot();
      } catch (err) {
        console.warn("[SettingsManager] Failed to read settings.json:", err);
        this.resetAfterInvalidSettingsFile();
        return this.getSnapshot();
      }
    }

    try {
      const exampleCandidates = [
        path.join(__dirname, "settings.example.json"),
        path.join(process.cwd(), "src", "main", "settings", "settings.example.json"),
      ];
      for (const ex of exampleCandidates) {
        if (fs.existsSync(ex)) {
          const raw = fs.readFileSync(ex, "utf-8");
          const parsed = JSON.parse(raw);
          if (!isRecord(parsed)) break;
          this.settings = parsed;
          this.persistedSettings = parsed;
          this.loadBrowserSettingsFromRecord(parsed);
          return this.getSnapshot();
        }
      }
    } catch (err) {
      console.warn("[SettingsManager] Failed to read settings.example.json:", err);
      this.settings = {};
      this.persistedSettings = {};
    }

    this.updateBrowserSettingsState({ valid: true, settings: DEFAULT_BROWSER_SETTINGS }, "default");
    return this.getSnapshot();
  }

  save(newSettings: FireflySettingsUpdate): boolean {
    if (!isRecord(newSettings)) return false;
    if (
      hasOwn(newSettings, "permissionProfile")
      && !isPermissionProfile(newSettings.permissionProfile)
    ) {
      return false;
    }

    const browserUpdate = hasOwn(newSettings, "browser")
      ? normalizeBrowserSettingsUpdate(
          newSettings.browser,
          this.browserSettings?.allowedOrigins ?? [],
        )
      : undefined;
    if (browserUpdate && !browserUpdate.valid) return false;

    const persistedUpdate: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(newSettings)) {
      persistedUpdate[key] = value;
    }
    if (browserUpdate?.valid) persistedUpdate.browser = browserUpdate.settings;

    const nextPersistedSettings: Record<string, unknown> = {
      ...this.persistedSettings,
      ...persistedUpdate,
    };

    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(nextPersistedSettings, null, 2), "utf-8");
    } catch (err) {
      console.warn("[SettingsManager] Failed to write settings.json:", err);
      return false;
    }

    this.persistedSettings = nextPersistedSettings;
    this.settings = {
      ...this.settings,
      ...newSettings,
      ...(browserUpdate?.valid ? { browser: browserUpdate.settings } : {}),
    };
    if (browserUpdate?.valid) this.updateBrowserSettingsState(browserUpdate, "configured");
    return true;
  }

  getLlmConfig(): LlmProviderConfig {
    return { ...DEFAULT_LLM_CONFIG, ...(this.settings.llm || {}) };
  }

  saveLlmConfig(config: Partial<LlmProviderConfig>): boolean {
    const merged = { ...this.getLlmConfig(), ...config };
    return this.save({ llm: merged });
  }

  getUiPreferences(): UiPreferences {
    return { ...DEFAULT_UI_PREFERENCES, ...(this.settings.ui || {}) };
  }

  getPermissionProfile(): PermissionProfile {
    return migratePersistedPermissionProfile(this.settings.permissionProfile);
  }

  saveUiPreferences(preferences: Partial<UiPreferences>): boolean {
    const merged = { ...this.getUiPreferences(), ...preferences };
    return this.save({ ui: merged });
  }

  getBrowserSettingsSnapshot(): BrowserSettingsSnapshot {
    if (this.browserSettingsStatus === "unavailable") {
      return Object.freeze({
        status: "unavailable",
        revision: this.browserSettingsRevision,
        reason: this.browserSettingsReason ?? "invalid_saved_configuration",
      });
    }

    if (!this.browserSettings) {
      return Object.freeze({
        status: "unavailable",
        revision: this.browserSettingsRevision,
        reason: "invalid_saved_configuration",
      });
    }

    return Object.freeze({
      status: this.browserSettingsStatus,
      revision: this.browserSettingsRevision,
      settings: cloneBrowserSettings(this.browserSettings),
    });
  }

  getSnapshot(): FireflyAppSettings {
    return {
      ...this.settings,
      permissionProfile: this.getPermissionProfile(),
      llm: this.getLlmConfig(),
      ui: this.getUiPreferences(),
      browser: this.getBrowserSettingsSnapshot(),
    };
  }
}
