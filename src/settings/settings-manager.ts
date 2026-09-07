import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { DEFAULT_LLM_CONFIG } from "../shared/provider-types";
import type { LlmProviderConfig } from "../shared/provider-types";
import type { UiPreferences } from "../shared/ui-types";
import { DEFAULT_UI_PREFERENCES } from "../shared/ui-types";
import type { FireflySettingsSnapshot, FireflySettingsUpdate } from "../shared/settings-types";
import {
  isPermissionProfile,
  migratePersistedPermissionProfile,
  type PermissionProfile,
} from "../shared/permission-profile-types";

export type FireflyAppSettings = FireflySettingsSnapshot;

export class SettingsManager {
  private configPath: string;
  private settings: FireflyAppSettings = {};

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

  load(): FireflyAppSettings {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, "utf-8");
        this.settings = JSON.parse(raw);
        if (this.settings.tts && typeof this.settings.tts === "object") {
          const validEngines = new Set(["off", "gptsovits"]);
          if (!this.settings.tts.engine || !validEngines.has(this.settings.tts.engine)) {
            this.settings.tts.engine = "gptsovits";
            this.save({ tts: this.settings.tts });
          }
        }
        return this.getSnapshot();
      }
      const exampleCandidates = [
        path.join(__dirname, "settings.example.json"),
        path.join(__dirname, "../src/settings/settings.example.json"),
        path.join(process.cwd(), "src", "settings", "settings.example.json"),
      ];
      for (const ex of exampleCandidates) {
        if (fs.existsSync(ex)) {
          const raw = fs.readFileSync(ex, "utf-8");
          this.settings = JSON.parse(raw);
          return this.getSnapshot();
        }
      }
    } catch (err) {
      console.warn("[SettingsManager] Failed to read settings.json:", err);
      this.settings = {};
    }
    return this.getSnapshot();
  }

  save(newSettings: FireflySettingsUpdate): boolean {
    if (
      Object.prototype.hasOwnProperty.call(newSettings, "permissionProfile") &&
      !isPermissionProfile(newSettings.permissionProfile)
    ) {
      return false;
    }
    this.settings = { ...this.settings, ...newSettings };
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.settings, null, 2), "utf-8");
      return true;
    } catch (err) {
      console.warn("[SettingsManager] Failed to write settings.json:", err);
      return false;
    }
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

  getSnapshot(): FireflyAppSettings {
    return {
      ...this.settings,
      permissionProfile: this.getPermissionProfile(),
      llm: this.getLlmConfig(),
      ui: this.getUiPreferences(),
    };
  }
}
