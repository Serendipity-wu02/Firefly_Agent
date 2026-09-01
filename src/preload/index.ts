import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../shared/ipc-channels";
import type { FireflyTarget } from "../shared/firefly-actions";
import type { CharacterStateData, CareActionType } from "../shared/firefly-state";
import type { StartTtsRequest, TtsStartResult, TtsSessionEvent } from "../shared/tts-session";
import type { TtsSettings } from "../shared/tts-types";
import type { ChatMessage } from "../shared/chat-types";

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
  sendMessage: (message: string, history?: ChatMessage[]): Promise<{ replyText: string; history: ChatMessage[]; toolCalled?: boolean }> =>
    ipcRenderer.invoke(IPC.CHAT_SEND_MESSAGE, { message, history }),
});

contextBridge.exposeInMainWorld("settings", {
  load: (): Promise<any> => ipcRenderer.invoke(IPC.SETTINGS_LOAD),
  save: (settings: any): Promise<boolean> => ipcRenderer.invoke(IPC.SETTINGS_SAVE, settings),
});

contextBridge.exposeInMainWorld("startup", {
  get: (): Promise<boolean> => ipcRenderer.invoke(IPC.STARTUP_GET),
  set: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke(IPC.STARTUP_SET, enabled),
});
