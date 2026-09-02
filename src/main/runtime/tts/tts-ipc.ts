import fs from "node:fs";
import path from "node:path";
import { app, ipcMain, BrowserWindow } from "electron";
import { IPC } from "../../../shared/ipc-channels";
import { DEFAULT_TTS_SETTINGS, type TtsSettings, type TtsEngine } from "../../../shared/tts-types";
import type { StartTtsRequest } from "../../../shared/tts-session";
import { TtsSessionService } from "./tts-session-service";

export interface TtsIpcOptions {
  configPath: string;
}

const VALID_TTS_ENGINES: ReadonlySet<string> = new Set(["off", "gptsovits"]);

export function registerTtsIpc(options: TtsIpcOptions): {
  sessionService: TtsSessionService;
  getSettings: () => TtsSettings;
} {
  const { configPath } = options;
  const sessionService = new TtsSessionService();

  function loadSettings(): TtsSettings {
    try {
      if (fs.existsSync(configPath)) {
        const json = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        if (json.tts && typeof json.tts === "object") {
          let migrated = false;
          let engine: TtsEngine = json.tts.engine;

          // Migrate legacy / invalid engine configs (such as "edge", "custom-cloud", "minimax", etc.) to "gptsovits"
          if (!engine || !VALID_TTS_ENGINES.has(engine)) {
            console.log(`[TTS Migration] Detected invalid/legacy TTS engine "${engine}", migrating to "gptsovits"`);
            engine = "gptsovits";
            migrated = true;
          }

          const resolvedSettings: TtsSettings = {
            ...DEFAULT_TTS_SETTINGS,
            ...json.tts,
            engine,
            voiceProfile: "firefly-v2proplus",
            gptsovits: { ...DEFAULT_TTS_SETTINGS.gptsovits, ...(json.tts.gptsovits || {}) },
          };

          if (migrated) {
            saveSettings(resolvedSettings);
          }

          return resolvedSettings;
        }
      }
    } catch (err) {
      console.warn("[TtsIPC] Failed to load TTS settings:", err);
    }
    return { ...DEFAULT_TTS_SETTINGS };
  }

  function saveSettings(settings: TtsSettings): void {
    try {
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      let data: Record<string, any> = {};
      if (fs.existsSync(configPath)) {
        try {
          data = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        } catch {
          data = {};
        }
      }

      data.tts = settings;
      fs.writeFileSync(configPath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.warn("[TtsIPC] Failed to save TTS settings:", err);
    }
  }

  ipcMain.handle(IPC.TTS_GET_SETTINGS, async () => {
    return loadSettings();
  });

  ipcMain.handle(IPC.TTS_SAVE_SETTINGS, async (_event, settings: TtsSettings) => {
    saveSettings(settings);
    return true;
  });

  ipcMain.handle(IPC.TTS_SESSION_START, async (event, request: StartTtsRequest) => {
    const settings = loadSettings();
    return sessionService.start(request, settings, (sessionEvent) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC.TTS_SESSION_EVENT, sessionEvent);
      }
    });
  });

  ipcMain.handle(IPC.TTS_SESSION_CANCEL, async (_event, requestId: string) => {
    return sessionService.cancel(requestId);
  });

  return {
    sessionService,
    getSettings: loadSettings,
  };
}
