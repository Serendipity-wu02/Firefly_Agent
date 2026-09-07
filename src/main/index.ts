import { app, protocol, BrowserWindow, ipcMain, Tray, screen, Menu } from "electron";
import path from "node:path";
import fs from "node:fs";
import { WindowManager } from "./windows/window-manager";
import { createTray } from "./tray";
import { IPC } from "../shared/ipc-channels";
import { CharacterStateManager } from "./state/state-manager";
import { registerTtsIpc } from "./runtime/tts/tts-ipc";
import { globalToolRegistry } from "./tools/tool-registry";
import { createPlayLive2DActionTool } from "./tools/play-live2d-action";
import { FireflyMemoryService } from "./character/memory/memory-service";
import { FireflyAgentCore } from "./orchestrator/firefly-agent-core";
import { FireflyProactiveScheduler } from "./orchestrator/proactive/proactive-scheduler";
import { registerChatIpc } from "./chat/chat-ipc";
import { getAutoLaunch, setAutoLaunch } from "./startup";
import { SettingsManager } from "../settings/settings-manager";
import { createFireflyProvider } from "./llm/providers/provider-factory";
import { MusicService } from "./runtime/music/music-service";
import { MusicContextService } from "./runtime/music/music-context-service";
import { MusicPreferenceService } from "./runtime/music/music-preference-service";
import { registerMusicPreferenceSignalAdapter } from "./runtime/music/music-preference-signals";
import { createMusicTools } from "./tools/music-tools";
import { registerMusicIpc } from "./runtime/music/music-ipc";
import { QQMusicProvider } from "./runtime/music/qqmusic-provider";
import { KnowledgeCoordinator } from "../rag/knowledge-coordinator";
import { ContextManager } from "./orchestrator/context/context-manager";
import { MemorySlot, MusicContextSlot } from "./orchestrator/context/context-slots";
import { CharacterPolicyEngine } from "./character/character-policy";
import { ApprovalService } from "./runtime/approval/approval-service";
import { registerApprovalIpc } from "./runtime/approval/approval-ipc";
import { createApprovalRequirementResolver } from "./runtime/approval/approval-requirement-resolver";
import { CapabilityAuthorizationPipeline } from "./runtime/authorization/capability-authorization-pipeline";
import { AuthorizedInvocationBridge } from "./runtime/authorization/authorized-invocation-bridge";
import { PermissionProfilePolicyResolver } from "./runtime/authorization/permission-profile-policy-resolver";
import { CapabilityBindingResolver } from "./runtime/capabilities/capability-binding-resolver";
import { CapabilityRegistry } from "./runtime/capabilities/capability-registry";
import { SandboxPolicyEvaluator } from "./runtime/sandbox/sandbox-policy";
import { ToolExecutionEngine } from "./runtime/execution/tool-execution-engine";
import { AgentEventBus } from "./orchestrator/agent-events";
import { HarnessAuthorizationAdapter } from "./orchestrator/harness/harness-authorization-adapter";
import { SubAgentRegistry } from "./runtime/subagents/subagent-registry";
import { SubAgentTaskService } from "./runtime/subagents/subagent-task-service";
import { MainAgentDelegationService } from "./runtime/subagents/main-agent-delegation";
import {
  DEFAULT_MUSIC_STATUS_SUBAGENT_DESCRIPTOR,
  SubAgentWorkerRuntime,
} from "./runtime/subagents/subagent-worker-runtime";
import type { IAgentCore } from "../shared/agent-core";
import type { CareActionType } from "../shared/firefly-state";
import { DEFAULT_AGENT_CONFIG } from "../shared/agent-types";
import {
  createCapabilityCategory,
  createCapabilityId,
} from "../shared/capability-types";
import { evaluateProviderStatus } from "../shared/provider-types";
import { createSandboxProfileId } from "../shared/sandbox-types";
import type { WindowStateSnapshot } from "../shared/window-types";
import type { FireflySettingsUpdate } from "../shared/settings-types";
import type { MemoryItem } from "../shared/memory-types";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "assets",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: true,
    },
  },
]);

const isDev = process.env.VITE_DEV === "1";
const windowManager = new WindowManager(isDev);
let userDataPath: string;
try {
  userDataPath = app.getPath("userData");
} catch {
  userDataPath = process.cwd();
}
const configPath = path.join(userDataPath, "settings.json");
const memoryPath = path.join(userDataPath, "memory.json");
const approvalService = new ApprovalService();
const MUSIC_STATUS_CAPABILITY_ID = createCapabilityId("music.status.read");
const MUSIC_CONTROL_CAPABILITY_ID = createCapabilityId("music.control");
const MUSIC_STATUS_CAPABILITY_CATEGORY = createCapabilityCategory("music");
const MUSIC_STATUS_SANDBOX_PROFILE_ID = createSandboxProfileId("firefly-music-status-read-v1");
const MUSIC_CONTROL_SANDBOX_PROFILE_ID = createSandboxProfileId("firefly-music-control-v1");
const MUSIC_STATUS_SANDBOX_SCOPE = Object.freeze({ kind: "desktop", target: "QQMusic" } as const);
const MUSIC_CONTROL_SANDBOX_SCOPE = Object.freeze({ kind: "desktop", target: "QQMusic" } as const);

const MUSIC_CONTROL_ACTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  play: "播放",
  pause: "暂停播放",
  next: "下一首",
  previous: "上一首",
  toggle: "切换播放状态",
});

function formatMusicControlApprovalSummary(input: Readonly<Record<string, unknown>>): string {
  const action = typeof input.action === "string" ? input.action : "";
  return `控制 QQ 音乐：${MUSIC_CONTROL_ACTION_LABELS[action] ?? "不支持的操作"}`;
}

let stateManager: CharacterStateManager;
let memoryService: FireflyMemoryService;
let settingsManager: SettingsManager;
let musicService: MusicService;
let musicContextService: MusicContextService;
let musicPreferenceService: MusicPreferenceService;
let unregisterMusicPreferenceSignals: (() => void) | null = null;
let unregisterMusicIpc: (() => void) | null = null;
let unregisterApprovalIpc: (() => void) | null = null;
let unregisterApprovalPresentationListener: (() => void) | null = null;
/** Typed as IAgentCore so consumers never depend on the concrete class.
 *  index.ts is the sole composition root: production consumers receive the public AgentCore facade here. */
let agentCore: IAgentCore;
let subAgentWorkerRuntime: SubAgentWorkerRuntime | null = null;
let proactiveScheduler: FireflyProactiveScheduler | null = null;
let unregisterProactivePetVisibility: (() => void) | null = null;
let tray: Tray | null = null;
let isSpeaking = false;
let isChatInFlight = false;
let ttsSessionService: import("./runtime/tts/tts-session-service").TtsSessionService | null = null;

function setupIpcHandlers() {
  ipcMain.on(IPC.WINDOW_MINIMIZE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.on(IPC.WINDOW_HIDE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.hide();
  });

  ipcMain.on(IPC.WINDOW_CLOSE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.on(IPC.WINDOW_MAXIMIZE_TOGGLE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    if (win.isMaximized()) {
      win.restore();
    } else {
      win.maximize();
    }
  });

  ipcMain.handle(IPC.WINDOW_GET_STATE, (event): WindowStateSnapshot => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return { isMaximized: !!win && !win.isDestroyed() && win.isMaximized() };
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

  ipcMain.on(IPC.WINDOW_OPEN_SUMMARY, () => {
    windowManager.toggleSummaryWindow();
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
    // Update legacy numeric state for stats compatibility & UI
    return stateManager.handleCareAction(action);
  });

  // Interaction IPC Handler (Pure V2.4 Character Event, zero numeric state mutation)
  ipcMain.handle(IPC.PET_INTERACTION, async (_event, action: "click" | "touch") => {
    const policyEngine = CharacterPolicyEngine.getInstance();
    const plan = policyEngine.handleInteraction(action);
    if (plan.requiresEmbodiment && plan.visual) {
      const target = plan.visual.target;
      // One-shot interaction reactions must have a bounded lifecycle:
      // expression reactions are marked temporary so the renderer restores
      // the current Behavior expression after durationMs; motions play to
      // their natural end (motion lifecycle is completion, not a timer).
      const payload =
        target.kind === "expression"
          ? { ...target, temporary: true, durationMs: plan.visual.durationMs ?? 5000 }
          : { ...target, durationMs: plan.visual.durationMs ?? 5000 };
      windowManager.sendToPet(IPC.LIVE2D_PLAY_ACTION, {
        ...payload,
        correlationId: plan.correlationId,
        behaviorType: plan.behaviorType,
      });
    }
    if (plan.presentationSummary) {
      windowManager.broadcast(IPC.CHARACTER_SUMMARY_UPDATED, {
        correlationId: plan.correlationId,
        summary: plan.presentationSummary,
      });
    }
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

  ipcMain.handle(IPC.PET_GET_CURSOR_POS, async () => {
    return screen.getCursorScreenPoint();
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

  ipcMain.handle(IPC.SETTINGS_SAVE, async (_event, newSettings: FireflySettingsUpdate) => {
    const ok = settingsManager.save(newSettings);
    const updated = settingsManager.load();
    windowManager.broadcast(IPC.SETTINGS_CHANGED, updated);
    if (newSettings.llm) {
      const provider = createFireflyProvider(settingsManager.getLlmConfig());
      // setProvider is optional on IAgentCore — use optional chaining
      agentCore.setProvider?.(provider);
      const status = evaluateProviderStatus(settingsManager.getLlmConfig());
      windowManager.broadcast(IPC.PROVIDER_STATUS_CHANGED, status);
    }
    return ok;
  });

  // Provider Status IPC Handler
  ipcMain.handle(IPC.PROVIDER_GET_STATUS, async () => {
    const config = settingsManager.getLlmConfig();
    return evaluateProviderStatus(config);
  });
}

app.whenReady().then(() => {
  // Remove the default Electron application menu (File/Edit/View/Window/Help).
  // The tray menu and the pet right-click popup are built independently.
  Menu.setApplicationMenu(null);

  // 1. Initialize State Manager, Memory Service & Settings
  stateManager = new CharacterStateManager({
    configPath,
    broadcast: (ch, data) => windowManager.broadcast(ch, data),
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
  const musicTools = createMusicTools(musicService);
  for (const t of musicTools) {
    globalToolRegistry.register(t);
  }
  unregisterMusicIpc = registerMusicIpc(musicService);

  // Register the two explicitly migrated music routes. Discovery and playback
  // tools retain their legacy route and are not part of this authorization set.
  const capabilityRegistry = new CapabilityRegistry();
  capabilityRegistry.register({
    id: MUSIC_STATUS_CAPABILITY_ID,
    name: "Read music playback status",
    description: "Reads the current music playback status without issuing player controls.",
    version: "1.1.1",
    category: MUSIC_STATUS_CAPABILITY_CATEGORY,
    risk: "read_only",
    sideEffect: "read_only",
  });
  capabilityRegistry.register({
    id: MUSIC_CONTROL_CAPABILITY_ID,
    name: "Control QQ Music playback",
    description: "Controls QQ Music background playback transport without foreground activation.",
    version: "1.1.1",
    category: MUSIC_STATUS_CAPABILITY_CATEGORY,
    risk: "side_effect",
    sideEffect: "external_action",
  });
  const capabilityBindingResolver = new CapabilityBindingResolver(
    capabilityRegistry,
    globalToolRegistry,
  );
  capabilityBindingResolver.register({
    capabilityId: MUSIC_STATUS_CAPABILITY_ID,
    toolId: "music_status",
  });
  capabilityBindingResolver.register({
    capabilityId: MUSIC_CONTROL_CAPABILITY_ID,
    toolId: "music_control",
  });
  const sandboxPolicy = new SandboxPolicyEvaluator([
    {
      id: MUSIC_STATUS_SANDBOX_PROFILE_ID,
      version: "1.1.1",
      rules: [{ kind: "desktop", allowedTargets: [MUSIC_STATUS_SANDBOX_SCOPE.target] }],
    },
    {
      id: MUSIC_CONTROL_SANDBOX_PROFILE_ID,
      version: "1.1.1",
      rules: [{ kind: "desktop", allowedTargets: [MUSIC_CONTROL_SANDBOX_SCOPE.target] }],
    },
  ]);
  const permissionProfilePolicyResolver = new PermissionProfilePolicyResolver();
  const approvalRequirementResolver = createApprovalRequirementResolver(
    [
      { capabilityId: MUSIC_STATUS_CAPABILITY_ID, requirement: "none" },
      { capabilityId: MUSIC_CONTROL_CAPABILITY_ID, requirement: "required" },
    ],
    {
      permissionPolicyResolver: permissionProfilePolicyResolver,
      permissionProfile: () => settingsManager.getPermissionProfile(),
    },
  );
  const authorizationPipeline = new CapabilityAuthorizationPipeline({
    capabilityRegistry,
    bindingResolver: capabilityBindingResolver,
    sandboxPolicy,
    approvalRequirementResolver,
    approvalService,
    permissionPolicyResolver: permissionProfilePolicyResolver,
    getPermissionProfile: () => settingsManager.getPermissionProfile(),
  });

  // 3. Initialize RAG Knowledge Coordinator & Context Layer
  const knowledgeCoordinator = new KnowledgeCoordinator({
    knowledgeDataDir: path.join(app.getAppPath(), "src", "rag", "knowledge"),
  });
  void knowledgeCoordinator.initialize();
  const ragSlot = knowledgeCoordinator.createRagSlot();
  const memorySlot = new MemorySlot({
    retriever: {
      retrieve: async ({ topK }) => ({
        items: memoryService.listForGeneralContext().slice(0, topK ?? 5),
      }),
    },
    projector: {
      project: (items) => memoryService.buildMemoryContextFromItems(items as readonly MemoryItem[]),
    },
  });
  // 4. Initialize the public AgentCore facade with the Provider from Settings
  const initialProvider = createFireflyProvider(settingsManager.getLlmConfig());
  const agentEventBus = new AgentEventBus();
  musicContextService = new MusicContextService({
    desktopBridge: musicService.getDesktopBridge(),
    eventBus: agentEventBus,
  });
  musicPreferenceService = new MusicPreferenceService({ memory: memoryService });
  unregisterMusicPreferenceSignals = registerMusicPreferenceSignalAdapter({
    eventBus: agentEventBus,
    preferenceService: musicPreferenceService,
  });
  musicContextService.start();
  const musicContextSlot = new MusicContextSlot(musicContextService);
  const contextManager = new ContextManager({
    customSlots: [memorySlot, ragSlot, musicContextSlot],
  });
  void musicService.start();
  const toolExecutionEngine = new ToolExecutionEngine(
    globalToolRegistry,
    undefined,
    agentEventBus,
  );
  const authorizedInvocationBridge = new AuthorizedInvocationBridge(
    toolExecutionEngine,
    globalToolRegistry,
  );
  const harnessAuthorizationAdapter = new HarnessAuthorizationAdapter({
    pipeline: authorizationPipeline,
    bridge: authorizedInvocationBridge,
    approvalService,
    getPermissionProfile: () => settingsManager.getPermissionProfile(),
    routes: [
      {
        toolId: "music_status",
        capabilityId: MUSIC_STATUS_CAPABILITY_ID,
        sandboxProfileId: MUSIC_STATUS_SANDBOX_PROFILE_ID,
        requestedScope: MUSIC_STATUS_SANDBOX_SCOPE,
        approvalSummary: "查询当前播放器状态",
        approvalReason: "当前权限方案要求在读取播放器状态前获得确认。",
        approvalTtlMs: DEFAULT_AGENT_CONFIG.totalTimeoutMs,
      },
      {
        toolId: "music_control",
        capabilityId: MUSIC_CONTROL_CAPABILITY_ID,
        sandboxProfileId: MUSIC_CONTROL_SANDBOX_PROFILE_ID,
        requestedScope: MUSIC_CONTROL_SANDBOX_SCOPE,
        approvalSummary: formatMusicControlApprovalSummary,
        approvalReason: "当前权限方案要求在控制 QQ 音乐前获得确认。",
        approvalTtlMs: DEFAULT_AGENT_CONFIG.totalTimeoutMs,
      },
    ],
  });
  const subAgentRegistry = new SubAgentRegistry();
  subAgentRegistry.register(DEFAULT_MUSIC_STATUS_SUBAGENT_DESCRIPTOR);
  const subAgentTaskService = new SubAgentTaskService({ registry: subAgentRegistry });
  const workerRuntime = new SubAgentWorkerRuntime({
    registry: subAgentRegistry,
    taskService: subAgentTaskService,
    bindingResolver: capabilityBindingResolver,
    agentCore: { run: (input) => agentCore.run(input) },
    eventBus: agentEventBus,
  });
  subAgentWorkerRuntime = workerRuntime;
  const mainAgentDelegationService = new MainAgentDelegationService({
    registry: subAgentRegistry,
    taskService: subAgentTaskService,
    workerRuntime,
  });
  agentCore = new FireflyAgentCore({
    provider: initialProvider,
    toolRegistry: globalToolRegistry,
    contextManager,
    eventBus: agentEventBus,
    executionEngine: toolExecutionEngine,
    authorizationAdapter: harnessAuthorizationAdapter,
    mainDelegationService: mainAgentDelegationService,
  });
  registerChatIpc(agentCore, stateManager, {
    sendToPet: (ch, data) => windowManager.sendToPet(ch, data),
    memoryService,
    onChatInFlight: (active) => {
      isChatInFlight = active;
      if (active) proactiveScheduler?.invalidateForChatStart();
    },
    onEmbodimentPlan: (plan) => {
      if (plan.presentationSummary) {
        windowManager.broadcast(IPC.CHARACTER_SUMMARY_UPDATED, {
          correlationId: plan.correlationId,
          summary: plan.presentationSummary,
        });
      }
    },
  });

  // 5. Initialize Firefly Proactive Scheduler
  proactiveScheduler = new FireflyProactiveScheduler({
    stateManager,
    agentCore,
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
  unregisterProactivePetVisibility = windowManager.onPetVisibilityChanged((visible) => {
    if (!visible) proactiveScheduler?.invalidateForPetHidden();
  });
  proactiveScheduler.start();

  // 5. Setup System Tray
  tray = createTray({
    togglePetWindow: () => windowManager.togglePetWindow(),
    createChatWindow: () => windowManager.createChatWindow(),
    createStatusWindow: () => windowManager.createStatusWindow(),
    createSettingsWindow: () => windowManager.createSettingsWindow(),
  });

  // 6. Register custom assets:// protocol so Live2D renderer can access project assets
  protocol.registerFileProtocol("assets", (request, callback) => {
    let clean = decodeURIComponent(request.url.replace("assets://", "").replace(/^\/+/, ""));
    if (clean.startsWith("firefly/")) {
      clean = clean.replace("firefly/", "");
    }
    const candidatePaths = [
      path.join(app.getAppPath(), "src", "renderer", clean),
      path.join(app.getAppPath(), "src", "renderer", "models", clean),
      path.join(app.getAppPath(), "dist", "renderer", clean),
      path.join(app.getAppPath(), "dist", "renderer", "models", clean),
      path.join(app.getAppPath(), clean),
    ];
    let resolved = candidatePaths[0];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        resolved = p;
        break;
      }
    }
    const exists = fs.existsSync(resolved);
    console.log(`[Assets Protocol] requested: "${request.url}" -> resolved: "${resolved}" (exists: ${exists})`);
    callback({ path: resolved });
  });

  // 7. Setup IPC, TTS, and Pet Window
  setupIpcHandlers();
  const approvalIpc = registerApprovalIpc({ approvalService, windowManager });
  unregisterApprovalIpc = approvalIpc.dispose;
  unregisterApprovalPresentationListener = approvalService.onChanged(() => {
    queueMicrotask(() => approvalIpc.notifyPending());
  });
  const ttsResult = registerTtsIpc({
    configPath,
    onSpeakingChanged: (speaking) => {
      if (speaking) proactiveScheduler?.invalidateForSpeakingStart();
      isSpeaking = speaking;
      windowManager.broadcast(IPC.PET_SPEAKING_CHANGED, speaking);
    },
  });
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
  unregisterProactivePetVisibility?.();
  unregisterProactivePetVisibility = null;
  stateManager?.dispose();
  memoryService?.save();
  subAgentWorkerRuntime?.cancelAll();
  subAgentWorkerRuntime = null;
  agentCore?.cancelAll();
  ttsSessionService?.cancelAll();
  unregisterMusicPreferenceSignals?.();
  unregisterMusicPreferenceSignals = null;
  musicContextService?.dispose();
  void musicService?.shutdown();
  unregisterMusicIpc?.();
  unregisterApprovalPresentationListener?.();
  unregisterApprovalIpc?.();
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
