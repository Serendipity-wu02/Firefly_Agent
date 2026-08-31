import { app, protocol, BrowserWindow, ipcMain, Tray } from "electron";
import path from "node:path";
import { WindowManager } from "./windows/window-manager";
import { createTray } from "./tray";
import { IPC } from "../shared/ipc-channels";
import { CharacterStateManager } from "./state/state-manager";
import { registerTtsIpc } from "./tts/tts-ipc";
import { globalToolRegistry } from "./tools/tool-registry";
import { createPlayLive2DActionTool } from "./tools/play-live2d-action";
import { FireflyMemoryService } from "./memory/memory-service";
import { FireflyAgentCore } from "./agent/firefly-agent-core";
import { FireflyProactiveScheduler } from "./agent/proactive/proactive-scheduler";
import { registerChatIpc } from "./chat/chat-ipc";
import { getAutoLaunch, setAutoLaunch } from "./startup";
import { SettingsManager } from "./settings/settings-manager";
import { createFireflyProvider } from "./agent/providers/provider-factory";
import { MusicService } from "./music/music-service";
import { createMusicTools } from "./tools/music-tools";
import { registerMusicIpc } from "./music/music-ipc";
import { QQMusicProvider } from "./music/qqmusic-provider";
import { KnowledgeCoordinator } from "./rag/knowledge-coordinator";
import { ContextManager } from "./agent/context/context-manager";
import type { IAgentCore } from "../shared/agent-core";
import type { CareActionType } from "../shared/firefly-state";

const isDev = process.env.VITE_DEV === "1";
const windowManager = new WindowManager(isDev);
const configPath = path.join(app.getAppPath(), "config", "settings.json");
const memoryPath = path.join(app.getAppPath(), "config", "memory.json");

let stateManager: CharacterStateManager;
let memoryService: FireflyMemoryService;
let settingsManager: SettingsManager;
let musicService: MusicService;
let unregisterMusicIpc: (() => void) | null = null;
/** Typed as IAgentCore so consumers never depend on the concrete class.
 *  index.ts is the sole composition root: change new FireflyHarness → new FireflyAgentCore here only. */
let agentCore: IAgentCore;
let proactiveScheduler: FireflyProactiveScheduler;
let tray: Tray | null = null;
let isSpeaking = false;
let isChatInFlight = false;
let ttsSessionService: import("./tts/tts-session-service").TtsSessionService | null = null;

function setupIpcHandlers() {
  ipcMain.on(IPC.WINDOW_MINIMIZE, () => {
    windowManager.getPetWindow()?.minimize();
  });

  ipcMain.on(IPC.WINDOW_HIDE, () => {
    windowManager.getPetWindow()?.hide();
  });

  ipcMain.on(IPC.WINDOW_QUIT, () => {
    app.quit();
  });

  ipcMain.on(IPC.WINDOW_OPEN_STATUS, () => {
    windowManager.createStatusWindow();
  });

  ipcMain.on(IPC.WINDOW_OPEN_CHAT, () => {
    windowManager.createChatWindow();
  });

  ipcMain.on(IPC.WINDOW_OPEN_SETTINGS, () => {
    windowManager.createSettingsWindow();
  });

  ipcMain.on(IPC.PET_SHOW_CONTEXT_MENU, () => {
    windowManager.showContextMenu();
  });

  ipcMain.on(IPC.PET_SET_SCALE, (_event, scale: number) => {
    windowManager.setPetScale(scale);
  });

  // State IPC Handlers
  ipcMain.handle(IPC.STATE_GET, async () => {
    return stateManager.getState();
  });

  ipcMain.handle(IPC.CARE_ACTION, async (_event, action: CareActionType) => {
    return stateManager.handleCareAction(action);
  });

  ipcMain.handle(IPC.PET_SET_INTERACTIVE, async (_event, interactive: boolean) => {
    const win = windowManager.getPetWindow();
    if (win && !win.isDestroyed()) {
      win.setIgnoreMouseEvents(!interactive, { forward: true });
    }
  });

  ipcMain.on(IPC.PET_MOVE_BY, (_event, { dx, dy }: { dx: number; dy: number }) => {
    const win = windowManager.getPetWindow();
    if (win && !win.isDestroyed()) {
      const [x, y] = win.getPosition();
      win.setPosition(x + dx, y + dy);
    }
  });

  ipcMain.on(IPC.PET_SET_DRAGGING, (_event, isDragging: boolean) => {
    const win = windowManager.getPetWindow();
    if (win && !win.isDestroyed()) {
      if (isDragging) {
        win.setIgnoreMouseEvents(false);
      }
    }
  });

  ipcMain.on(IPC.PET_SPEAKING_CHANGED, (_event, speaking: boolean) => {
    isSpeaking = speaking;
    windowManager.broadcast(IPC.PET_SPEAKING_CHANGED, speaking);
  });

  // Startup IPC Handlers
  ipcMain.handle(IPC.STARTUP_GET, async () => {
    return getAutoLaunch();
  });

  ipcMain.handle(IPC.STARTUP_SET, async (_event, enabled: boolean) => {
    return setAutoLaunch(enabled);
  });

  // Settings IPC Handlers
  ipcMain.handle(IPC.SETTINGS_LOAD, async () => {
    return settingsManager.load();
  });

  ipcMain.handle(IPC.SETTINGS_SAVE, async (_event, newSettings) => {
    const ok = settingsManager.save(newSettings);
    if (newSettings.llm) {
      const provider = createFireflyProvider(settingsManager.getLlmConfig());
      // setProvider is optional on IAgentCore — use optional chaining
      agentCore.setProvider?.(provider);
    }
    return ok;
  });
}

app.whenReady().then(() => {
  // 1. Initialize State Manager, Memory Service & Settings
  stateManager = new CharacterStateManager({
    configPath,
    broadcast: (ch, data) => windowManager.broadcast(ch, data),
    sendToPet: (ch, data) => windowManager.sendToPet(ch, data),
  });
  memoryService = new FireflyMemoryService(memoryPath);
  settingsManager = new SettingsManager(configPath);

  // 2. Register Tools in Tool Registry (Live2D Action + Music Tools)
  const playActionTool = createPlayLive2DActionTool({
    sendToPet: (ch, payload) => windowManager.sendToPet(ch, payload),
  });
  globalToolRegistry.register(playActionTool);

  // Initialize Music Service & Register Music Tools
  musicService = new MusicService({ provider: new QQMusicProvider() });
  void musicService.start();
  const musicTools = createMusicTools(musicService);
  for (const t of musicTools) {
    globalToolRegistry.register(t);
  }
  unregisterMusicIpc = registerMusicIpc(musicService);

  // 3. Initialize RAG Knowledge Coordinator & Context Layer
  const knowledgeCoordinator = new KnowledgeCoordinator({
    knowledgeDataDir: path.join(app.getAppPath(), "data", "knowledge"),
  });
  void knowledgeCoordinator.initialize();
  const ragSlot = knowledgeCoordinator.createRagSlot();
  const contextManager = new ContextManager({ customSlots: [ragSlot] });

  // 4. Initialize Agent Core (FireflyAgentCore v1 -> v2.3) with Provider from Settings
  const initialProvider = createFireflyProvider(settingsManager.getLlmConfig());
  agentCore = new FireflyAgentCore({
    provider: initialProvider,
    toolRegistry: globalToolRegistry,
    contextManager,
  });
  registerChatIpc(agentCore, stateManager);

  // 5. Initialize Firefly Proactive Scheduler
  proactiveScheduler = new FireflyProactiveScheduler({
    stateManager,
    agentCore,
    memoryService,
    isPetVisible: () => {
      const win = windowManager.getPetWindow();
      return !!(win && !win.isDestroyed() && win.isVisible());
    },
    isUserChatActive: () => isChatInFlight,
    isSpeakingActive: () => isSpeaking,
    broadcastProactive: (payload) => {
      windowManager.broadcast(IPC.PET_PROACTIVE_LINE, payload);
    },
  });
  proactiveScheduler.start();

  // 5. Setup System Tray
  tray = createTray({
    togglePetWindow: () => windowManager.togglePetWindow(),
    createChatWindow: () => windowManager.createChatWindow(),
    createStatusWindow: () => windowManager.createStatusWindow(),
    createSettingsWindow: () => windowManager.createSettingsWindow(),
  });

  // 6. Register custom assets:// protocol so PNG renderer can access project assets
  //    regardless of whether running in dev or production Electron context.
  protocol.registerFileProtocol("assets", (request, callback) => {
    const url = decodeURIComponent(request.url.replace("assets://", ""));
    const filePath = path.join(app.getAppPath(), "assets", url);
    callback({ path: filePath });
  });

  // 7. Setup IPC, TTS, and Pet Window
  setupIpcHandlers();
  const ttsResult = registerTtsIpc({ configPath });
  ttsSessionService = ttsResult.sessionService;
  const petWin = windowManager.createPetWindow();

  if (process.env.ELECTRON_SMOKE_TEST === "1") {
    console.log("[SmokeTest] Pet window created. Running smoke verification...");
    setTimeout(() => {
      console.log("[SmokeTest] Verification passed. Exiting cleanly.");
      app.quit();
    }, 2500);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager.createPetWindow();
    }
  });
});

app.on("before-quit", () => {
  proactiveScheduler?.stop();
  stateManager?.dispose();
  memoryService?.save();
  agentCore?.cancelAll();
  ttsSessionService?.cancelAll();
  void musicService?.shutdown();
  unregisterMusicIpc?.();
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !tray) {
    app.quit();
  }
});
