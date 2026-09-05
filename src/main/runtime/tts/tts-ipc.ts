import fs from "node:fs";
import path from "node:path";
import { app, ipcMain, BrowserWindow } from "electron";
import { IPC } from "../../../shared/ipc-channels";
import { DEFAULT_TTS_SETTINGS, type TtsSettings, type TtsEngine } from "../../../shared/tts-types";
import type { StartTtsRequest } from "../../../shared/tts-session";
import { TtsSessionService } from "./tts-session-service";
import { TtsPlaybackOwnership } from "./playback-owner";

export interface TtsIpcOptions {
  configPath: string;
  onSpeakingChanged?: (speaking: boolean, requestId: string | null) => void;
}

const VALID_TTS_ENGINES: ReadonlySet<string> = new Set(["off", "gptsovits"]);

export function registerTtsIpc(options: TtsIpcOptions): {
  sessionService: TtsSessionService;
  getSettings: () => TtsSettings;
} {
  const { configPath } = options;
  const sessionService = new TtsSessionService();
  const playbackOwnership = new TtsPlaybackOwnership();
  let speakingRequestId: string | null = null;

  const publishSpeaking = (speaking: boolean, requestId: string | null): void => {
    if (speaking) {
      speakingRequestId = requestId;
    } else if (requestId === null || speakingRequestId === requestId) {
      speakingRequestId = null;
    }
    options.onSpeakingChanged?.(speaking, requestId);
  };

  const findWindowById = (windowId: number): BrowserWindow | null => {
    const win = BrowserWindow.getAllWindows().find((item) => item.webContents.id === windowId);
    return win && !win.isDestroyed() ? win : null;
  };

  const releaseWindowOwnership = (windowId: number): void => {
    const released = playbackOwnership.releaseWindow(windowId);
    if (!released) return;
    if (speakingRequestId === released.requestId) {
      publishSpeaking(false, released.requestId);
    }
    console.log(
      `[TTS Playback] ownership-release windowId=${released.windowId} requestId=${released.requestId} reason=window-destroyed`,
    );
  };

  app.on("web-contents-created", (_event, contents) => {
    contents.once("destroyed", () => releaseWindowOwnership(contents.id));
  });

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

  ipcMain.handle(IPC.TTS_ACQUIRE_PLAYBACK, async (event, requestId: string) => {
    if (typeof requestId !== "string" || requestId.length === 0) return false;

    const result = playbackOwnership.acquire(event.sender.id, requestId);
    const previousOwner = result.previousOwner;
    if (previousOwner) {
      if (speakingRequestId === previousOwner.requestId) {
        publishSpeaking(false, previousOwner.requestId);
      }

      const previousWindow = findWindowById(previousOwner.windowId);
      if (previousWindow) {
        previousWindow.webContents.send(IPC.TTS_STOP_PLAYBACK, { requestId: previousOwner.requestId });
      }

      console.log(
        `[TTS Playback] ownership-transfer fromWindowId=${previousOwner.windowId} ` +
          `fromRequestId=${previousOwner.requestId} toWindowId=${event.sender.id} toRequestId=${requestId}`,
      );
    } else {
      console.log(`[TTS Playback] ownership-acquire windowId=${event.sender.id} requestId=${requestId}`);
    }

    return result.granted;
  });

  ipcMain.handle(IPC.TTS_RELEASE_PLAYBACK, async (event, requestId: string) => {
    if (typeof requestId !== "string" || requestId.length === 0) return false;
    const released = playbackOwnership.release(event.sender.id, requestId);
    if (!released) {
      console.log(
        `[TTS Playback] stale-release-ignored windowId=${event.sender.id} requestId=${requestId} ` +
          `ownerWindowId=${playbackOwnership.playbackOwnerWindowId ?? "none"} ` +
          `ownerRequestId=${playbackOwnership.playbackRequestId ?? "none"}`,
      );
      return false;
    }

    if (speakingRequestId === requestId) {
      publishSpeaking(false, requestId);
    }
    console.log(`[TTS Playback] ownership-release windowId=${event.sender.id} requestId=${requestId}`);
    return true;
  });

  ipcMain.on(
    IPC.PET_SPEAKING_CHANGED,
    (event, payload: { isSpeaking?: unknown; requestId?: unknown }) => {
      const owner = playbackOwnership.currentOwner;
      if (
        !owner ||
        owner.windowId !== event.sender.id ||
        payload?.requestId !== owner.requestId ||
        typeof payload?.isSpeaking !== "boolean"
      ) {
        return;
      }

      if (payload.isSpeaking) {
        publishSpeaking(true, owner.requestId);
      } else if (speakingRequestId === owner.requestId) {
        publishSpeaking(false, owner.requestId);
      }
    },
  );

  return {
    sessionService,
    getSettings: loadSettings,
  };
}
