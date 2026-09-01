import { contextBridge, ipcRenderer } from "electron";
import type { FireflyTarget } from "../shared/firefly-actions";
import type { CharacterStateData, CareActionType } from "../shared/firefly-state";
import type { StartTtsRequest, TtsStartResult, TtsSessionEvent } from "../shared/tts-session";
import type { TtsSettings } from "../shared/tts-types";
import type { ChatMessage } from "../shared/chat-types";

/**
 * Sandbox-safe channel table (mirror of src/shared/ipc-channels.ts).
 *
 * The preload must stay a single self-contained file: sandboxed renderers
 * (chat / summary / settings windows run with the default sandbox) can only
 * `require("electron")` — a relative require of "../shared/ipc-channels"
 * throws at preload startup and kills EVERY bridge. All imports above are
 * type-only and erased at compile time, so this literal table is the one
 * runtime channel source in the preload.
 *
 * KEEP IN SYNC with src/shared/ipc-channels.ts — enforced by
 * tools/test_v2_harness_presentation.mjs (preload channel sync check).
 */
const IPC = {
  // Window & System
  WINDOW_MINIMIZE: "window:minimize",
  WINDOW_HIDE: "window:hide",
  WINDOW_QUIT: "window:quit",
  PET_SET_INTERACTIVE: "pet:set-interactive",
  PET_MOVE_BY: "pet:move-by",
  PET_MOVE_TO: "pet:move-to",
  PET_SET_DRAGGING: "pet:set-dragging",
  PET_CAPTURE_FRAME: "pet:capture-frame",
  PET_GET_CURSOR_POS: "pet:get-cursor-pos",
  PET_ZOOM: "pet:zoom",
  PET_SET_SCALE: "pet:set-scale",
  PET_SHOW_CONTEXT_MENU: "pet:show-context-menu",
  PET_VISIBILITY_CHANGED: "pet:visibility-changed",
  PET_SPEAKING_CHANGED: "pet:speaking-changed",
  PET_INTERACTION: "pet:interaction",
  WINDOW_OPEN_CHAT: "window:open-chat",
  WINDOW_OPEN_STATUS: "window:open-status",
  WINDOW_OPEN_SETTINGS: "window:open-settings",
  WINDOW_OPEN_SUMMARY: "window:open-summary",
  CHARACTER_SUMMARY_UPDATED: "character:summary-updated",

  // Live2D / Action Execution
  LIVE2D_PLAY_ACTION: "live2d:play-action",
  LIVE2D_MOUTH_START: "live2d:mouth-start",
  LIVE2D_MOUTH_STOP: "live2d:mouth-stop",

  // Character State & Care
  STATE_GET: "state:get",
  STATE_CHANGED: "state:changed",
  CARE_ACTION: "care:action",

  // TTS Speech System
  TTS_SESSION_START: "tts:session-start",
  TTS_SESSION_CANCEL: "tts:session-cancel",
  TTS_SESSION_EVENT: "tts:session-event",
  TTS_GET_SETTINGS: "tts:get-settings",
  TTS_SAVE_SETTINGS: "tts:save-settings",

  // Chat & AI
  CHAT_SEND_MESSAGE: "chat:send-message",

  // Settings & Startup
  SETTINGS_LOAD: "settings:load",
  SETTINGS_SAVE: "settings:save",
  STARTUP_GET: "startup:get",
  STARTUP_SET: "startup:set",
} as const;

contextBridge.exposeInMainWorld("firefly", {
  minimize: () => ipcRenderer.send(IPC.WINDOW_MINIMIZE),
  hide: () => ipcRenderer.send(IPC.WINDOW_HIDE),
  quit: () => ipcRenderer.send(IPC.WINDOW_QUIT),
  setInteractive: (interactive: boolean) => ipcRenderer.invoke(IPC.PET_SET_INTERACTIVE, interactive),
  moveBy: (dx: number, dy: number) => ipcRenderer.send(IPC.PET_MOVE_BY, { dx, dy }),
  moveTo: (x: number, y: number) => ipcRenderer.send(IPC.PET_MOVE_TO, { x, y }),
  setDragging: (isDragging: boolean) => ipcRenderer.send(IPC.PET_SET_DRAGGING, isDragging),
  setSpeaking: (isSpeaking: boolean) => ipcRenderer.send(IPC.PET_SPEAKING_CHANGED, isSpeaking),
  onSpeakingChanged: (cb: (isSpeaking: boolean) => void) => {
    const listener = (_: unknown, isSpeaking: boolean) => cb(isSpeaking);
    ipcRenderer.on(IPC.PET_SPEAKING_CHANGED, listener);
    return () => { ipcRenderer.removeListener(IPC.PET_SPEAKING_CHANGED, listener); };
  },
  captureFrame: () => ipcRenderer.invoke(IPC.PET_CAPTURE_FRAME),
  getCursorPosition: () => ipcRenderer.invoke(IPC.PET_GET_CURSOR_POS),
  interact: (action: "click" | "touch") => ipcRenderer.invoke(IPC.PET_INTERACTION, action),
  openChat: () => ipcRenderer.send(IPC.WINDOW_OPEN_CHAT),
  openStatus: () => ipcRenderer.send(IPC.WINDOW_OPEN_STATUS),
  openSettings: () => ipcRenderer.send(IPC.WINDOW_OPEN_SETTINGS),
  openSummary: () => ipcRenderer.send(IPC.WINDOW_OPEN_SUMMARY),
  onSummaryUpdated: (cb: (summary: any) => void) => {
    const listener = (_: unknown, summary: any) => cb(summary);
    ipcRenderer.on(IPC.CHARACTER_SUMMARY_UPDATED, listener);
    return () => { ipcRenderer.removeListener(IPC.CHARACTER_SUMMARY_UPDATED, listener); };
  },
  showContextMenu: () => ipcRenderer.send(IPC.PET_SHOW_CONTEXT_MENU),
  setScale: (scale: number) => ipcRenderer.send(IPC.PET_SET_SCALE, scale),
  onPetZoom: (cb: (zoom: number) => void) => {
    const listener = (_: unknown, zoom: number) => cb(zoom);
    ipcRenderer.on(IPC.PET_ZOOM, listener);
    return () => { ipcRenderer.removeListener(IPC.PET_ZOOM, listener); };
  },
  onPetVisibilityChanged: (cb: (visible: boolean) => void) => {
    const listener = (_: unknown, visible: boolean) => cb(visible);
    ipcRenderer.on(IPC.PET_VISIBILITY_CHANGED, listener);
    return () => { ipcRenderer.removeListener(IPC.PET_VISIBILITY_CHANGED, listener); };
  },
});

contextBridge.exposeInMainWorld("live2dAction", {
  onPlayAction: (cb: (target: FireflyTarget) => void) => {
    const listener = (_: unknown, target: FireflyTarget) => cb(target);
    ipcRenderer.on(IPC.LIVE2D_PLAY_ACTION, listener);
    return () => { ipcRenderer.removeListener(IPC.LIVE2D_PLAY_ACTION, listener); };
  },
});

contextBridge.exposeInMainWorld("characterState", {
  getState: (): Promise<CharacterStateData> => ipcRenderer.invoke(IPC.STATE_GET),
  careAction: (action: CareActionType): Promise<{ state: CharacterStateData; actionId: string; feedback?: string }> =>
    ipcRenderer.invoke(IPC.CARE_ACTION, action),
  onStateChanged: (cb: (state: CharacterStateData) => void) => {
    const listener = (_: unknown, state: CharacterStateData) => cb(state);
    ipcRenderer.on(IPC.STATE_CHANGED, listener);
    return () => { ipcRenderer.removeListener(IPC.STATE_CHANGED, listener); };
  },
});

contextBridge.exposeInMainWorld("tts", {
  startSession: (request: StartTtsRequest): Promise<TtsStartResult> => ipcRenderer.invoke(IPC.TTS_SESSION_START, request),
  cancelSession: (requestId: string): Promise<boolean> => ipcRenderer.invoke(IPC.TTS_SESSION_CANCEL, requestId),
  getSettings: (): Promise<TtsSettings> => ipcRenderer.invoke(IPC.TTS_GET_SETTINGS),
  saveSettings: (settings: TtsSettings): Promise<boolean> => ipcRenderer.invoke(IPC.TTS_SAVE_SETTINGS, settings),
  onSessionEvent: (cb: (event: TtsSessionEvent) => void) => {
    const listener = (_: unknown, ev: TtsSessionEvent) => cb(ev);
    ipcRenderer.on(IPC.TTS_SESSION_EVENT, listener);
    return () => { ipcRenderer.removeListener(IPC.TTS_SESSION_EVENT, listener); };
  },
});

contextBridge.exposeInMainWorld("chat", {
  sendMessage: (
    message: string,
    history?: ChatMessage[],
  ): Promise<{
    replyText: string;
    history: ChatMessage[];
    toolCalled?: boolean;
    embodimentPlan?: any;
    correlationId?: string;
  }> => {
    console.log(`[Harness Trace] preload.chat.sendMessage prompt="${message}"`);
    return ipcRenderer.invoke(IPC.CHAT_SEND_MESSAGE, { message, history });
  },
});

contextBridge.exposeInMainWorld("settings", {
  load: (): Promise<any> => ipcRenderer.invoke(IPC.SETTINGS_LOAD),
  save: (settings: any): Promise<boolean> => ipcRenderer.invoke(IPC.SETTINGS_SAVE, settings),
});

contextBridge.exposeInMainWorld("startup", {
  get: (): Promise<boolean> => ipcRenderer.invoke(IPC.STARTUP_GET),
  set: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke(IPC.STARTUP_SET, enabled),
});
