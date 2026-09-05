export const IPC = {
  // Window & System
  WINDOW_MINIMIZE: "window:minimize",
  WINDOW_HIDE: "window:hide",
  WINDOW_CLOSE: "window:close",
  WINDOW_MAXIMIZE_TOGGLE: "window:maximize-toggle",
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
  PET_PROACTIVE_LINE: "pet:proactive-line",
  PET_INTERACTION: "pet:interaction",
  WINDOW_OPEN_CHAT: "window:open-chat",
  WINDOW_OPEN_STATUS: "window:open-status",
  WINDOW_OPEN_SETTINGS: "window:open-settings",
  WINDOW_OPEN_SUMMARY: "window:open-summary",
  CHARACTER_SUMMARY_UPDATED: "character:summary-updated",

  // Live2D / Action Execution
  LIVE2D_PLAY_ACTION: "live2d:play-action",

  // Character State & Care
  STATE_GET: "state:get",
  STATE_UPDATE: "state:update",
  STATE_CHANGED: "state:changed",
  CARE_ACTION: "care:action",

  // TTS Speech System
  TTS_SESSION_START: "tts:session-start",
  TTS_SESSION_CANCEL: "tts:session-cancel",
  TTS_SESSION_EVENT: "tts:session-event",
  TTS_ACQUIRE_PLAYBACK: "tts:acquire-playback",
  TTS_RELEASE_PLAYBACK: "tts:release-playback",
  TTS_STOP_PLAYBACK: "tts:stop-playback",
  TTS_GET_SETTINGS: "tts:get-settings",
  TTS_SAVE_SETTINGS: "tts:save-settings",

  // Chat & AI
  CHAT_SEND_MESSAGE: "chat:send-message",
  CHAT_STREAM_CHUNK: "chat:stream-chunk",
  CHAT_STREAM_END: "chat:stream-end",
  CHAT_CLEAR_HISTORY: "chat:clear-history",
  CHAT_GET_HISTORY: "chat:get-history",

  // Settings & Startup & Provider
  SETTINGS_LOAD: "settings:load",
  SETTINGS_SAVE: "settings:save",
  SETTINGS_CHANGED: "settings:changed",
  STARTUP_GET: "startup:get",
  STARTUP_SET: "startup:set",
  PROVIDER_GET_STATUS: "provider:get-status",
  PROVIDER_STATUS_CHANGED: "provider:status-changed",

  // Music System
  MUSIC_SEARCH: "music:search",
  MUSIC_GET_RECOMMENDATIONS: "music:get-recommendations",
  MUSIC_PLAY: "music:play",
  MUSIC_PAUSE: "music:pause",
  MUSIC_RESUME: "music:resume",
  MUSIC_NEXT: "music:next",
  MUSIC_PREV: "music:prev",
  MUSIC_STOP: "music:stop",
  MUSIC_SET_VOLUME: "music:set-volume",
  MUSIC_GET_STATE: "music:get-state",
  MUSIC_STATE_CHANGED: "music:state-changed",
} as const;

export type IpcChannel = typeof IPC[keyof typeof IPC];
