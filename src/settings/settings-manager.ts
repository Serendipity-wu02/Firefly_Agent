import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { LlmProviderConfig } from "../shared/provider-types";
import { DEFAULT_LLM_CONFIG } from "../shared/provider-types";

export interface FireflyAppSettings {
  llm?: LlmProviderConfig;
  tts?: any;
  window?: {
    x?: number;
    y?: number;
    pet_scale?: number;
  };
  startup?: {
    openAtLogin?: boolean;
  };
}

export class SettingsManager {
  private configPath: string;
  private settings: FireflyAppSettings = {};

  constructor(customPath?: string) {
    if (customPath) {
      this.configPath = customPath;
    } else {
      try {
        this.configPath = path.join(app.getAppPath(), "config", "settings.json");
      } catch {
        this.configPath = path.join(process.cwd(), "config", "settings.json");
      }
    }
    this.load();
  }

  load(): FireflyAppSettings {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, "utf-8");
        this.settings = JSON.parse(raw);
      }
    } catch (err) {
      console.warn("[SettingsManager] Failed to read settings.json:", err);
      this.settings = {};
    }
    return this.settings;
  }

  save(newSettings: Partial<FireflyAppSettings>): boolean {
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
}
