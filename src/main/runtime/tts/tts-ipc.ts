import fs from "node:fs";
import path from "node:path";
import { app, ipcMain, BrowserWindow } from "electron";
import { IPC } from "../../../shared/ipc-channels";
import { DEFAULT_TTS_SETTINGS, type TtsSettings } from "../../../shared/tts-types";
import type { StartTtsRequest } from "../../../shared/tts-session";
import { TtsSessionService } from "./tts-session-service";

export interface TtsIpcOptions {
  configPath: string;
}

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
          return {
            ...DEFAULT_TTS_SETTINGS,
            ...json.tts,
            gptsovits: { ...DEFAULT_TTS_SETTINGS.gptsovits, ...(json.tts.gptsovits || {}) },
            customCloud: { ...DEFAULT_TTS_SETTINGS.customCloud, ...(json.tts.customCloud || {}) },
            minimax: { ...DEFAULT_TTS_SETTINGS.minimax, ...(json.tts.minimax || {}) },
          };
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
