import { app, BrowserWindow, ipcMain, Menu, protocol, screen, type IpcMainEvent, type Tray } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { ApplicationRuntime } from "./application";
import { WindowManager } from "../windows/window-manager";
import { createTray } from "../tray";
import { IPC } from "../../shared/ipc-channels";
import { registerTtsIpc, type TtsIpcRegistration } from "../tts/tts-ipc";
import { globalToolRegistry } from "../orchestrator/tools/registry/tool-registry";
import { createPlayLive2DActionTool } from "../orchestrator/tools/adapters/play-live2d-action";
import { FireflyMemoryService } from "../memory/memory-service";
import { FireflyAgentCore } from "../orchestrator/firefly-agent-core";
import { registerChatIpc } from "../chat/chat-ipc";
import { getAutoLaunch, setAutoLaunch } from "../startup";
import { SettingsManager } from "../settings/settings-manager";
import { createFireflyProvider } from "../orchestrator/providers/provider-factory";
import { MusicService } from "../music/music-service";
import { MusicContextService } from "../music/music-context-service";
import { MusicPreferenceService } from "../music/music-preference-service";
import { registerMusicPreferenceSignalAdapter } from "../music/music-preference-signals";
import { createMusicTools } from "../orchestrator/tools/adapters/music-tools";
import { registerMusicIpc } from "../music/music-ipc";
import { QQMusicProvider } from "../music/qqmusic-provider";
import { KnowledgeCoordinator, resolveKnowledgeDataDir } from "../rag/knowledge-coordinator";
import { ContextManager } from "../orchestrator/context/context-manager";
import { MemorySlot, MusicContextSlot } from "../orchestrator/context/context-slots";
import { CharacterPolicyEngine } from "../character/character-policy";
import { ApprovalService } from "../runtime/approval/approval-service";
import { registerApprovalIpc, type ApprovalIpcRegistration } from "../runtime/approval/approval-ipc";
import { createApprovalRequirementResolver } from "../runtime/approval/approval-requirement-resolver";
import { CapabilityAuthorizationPipeline } from "../runtime/authorization/capability-authorization-pipeline";
import { AuthorizedInvocationBridge } from "../runtime/authorization/authorized-invocation-bridge";
import { PermissionProfilePolicyResolver } from "../runtime/authorization/permission-profile-policy-resolver";
import { CapabilityBindingResolver } from "../runtime/capabilities/capability-binding-resolver";
import { CapabilityRegistry } from "../runtime/capabilities/capability-registry";
import { SandboxPolicyEvaluator } from "../runtime/sandbox/sandbox-policy";
import { ToolExecutionEngine } from "../orchestrator/tools/execution/tool-execution-engine";
import { AgentEventBus } from "../orchestrator/agent-events";
import { HarnessAuthorizationAdapter } from "../orchestrator/harness/harness-authorization-adapter";
import { SubAgentRegistry } from "../orchestrator/subagents/subagent-registry";
import { SubAgentTaskService } from "../orchestrator/subagents/subagent-task-service";
import { MainAgentDelegationService } from "../orchestrator/subagents/main-agent-delegation";
import {
  BROWSER_CAPABILITY_CATEGORY,
  BROWSER_READ_TOOL_ID,
  BROWSER_STATIC_READ_CAPABILITY_ID,
  BROWSER_STATIC_READ_SANDBOX_PROFILE_ID,
  createBrowserReadTool,
  createBrowserSandboxProfile,
} from "../browser/browser-tool";
import { BrowserReadService } from "../browser/browser-read-service";
import { createBrowserAuthorizationFactsResolver } from "../browser/browser-authorization";
import { emitDiagnosticTrace } from "../diagnostics/diagnostic-trace";
import {
  createApplicationToolRegistration,
  registerApplicationToolBindings,
} from "./tool-binding-assembly";
import {
  DEFAULT_MUSIC_STATUS_SUBAGENT_DESCRIPTOR,
  SubAgentWorkerRuntime,
} from "../orchestrator/subagents/subagent-worker-runtime";
import type { IAgentCore } from "../../shared/agent-core";
import { DEFAULT_AGENT_CONFIG } from "../../shared/agent-types";
import {
  createCapabilityCategory,
  createCapabilityId,
} from "../../shared/capability-types";
import { evaluateProviderStatus } from "../../shared/provider-types";
import { createSandboxProfileId } from "../../shared/sandbox-types";
import type { WindowStateSnapshot } from "../../shared/window-types";
import type { FireflySettingsUpdate } from "../../shared/settings-types";
import type { BrowserSettingsSnapshot } from "../../shared/settings-types";
import type { MemoryItem } from "../../shared/memory-types";

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

function resolveUserDataPath(): string {
  try {
    return app.getPath("userData");
  } catch {
    return process.cwd();
  }
}

interface WindowAndSettingsIpcDependencies {
  readonly windowManager: WindowManager;
  readonly settingsManager: SettingsManager;
  readonly agentCore: IAgentCore;
  readonly approvalService: ApprovalService;
  readonly onBrowserSettingsChanged?: (
    previousRevision: number,
    snapshot: BrowserSettingsSnapshot | undefined,
  ) => void;
}

function registerWindowAndSettingsIpc(
  dependencies: WindowAndSettingsIpcDependencies,
): () => void {
  const cleanup: Array<() => void> = [];
  let disposed = false;

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (let index = cleanup.length - 1; index >= 0; index -= 1) {
      cleanup[index]();
    }
  };

  try {
    const minimize = (event: IpcMainEvent): void => {
      BrowserWindow.fromWebContents(event.sender)?.minimize();
    };
    ipcMain.on(IPC.WINDOW_MINIMIZE, minimize);
    cleanup.push(() => ipcMain.removeListener(IPC.WINDOW_MINIMIZE, minimize));

    const hide = (event: IpcMainEvent): void => {
      BrowserWindow.fromWebContents(event.sender)?.hide();
    };
    ipcMain.on(IPC.WINDOW_HIDE, hide);
    cleanup.push(() => ipcMain.removeListener(IPC.WINDOW_HIDE, hide));

    const close = (event: IpcMainEvent): void => {
      BrowserWindow.fromWebContents(event.sender)?.close();
    };
    ipcMain.on(IPC.WINDOW_CLOSE, close);
    cleanup.push(() => ipcMain.removeListener(IPC.WINDOW_CLOSE, close));

    const toggleMaximize = (event: IpcMainEvent): void => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return;
      if (win.isMaximized()) win.restore();
      else win.maximize();
    };
    ipcMain.on(IPC.WINDOW_MAXIMIZE_TOGGLE, toggleMaximize);
    cleanup.push(() => ipcMain.removeListener(IPC.WINDOW_MAXIMIZE_TOGGLE, toggleMaximize));

    ipcMain.handle(IPC.WINDOW_GET_STATE, (event): WindowStateSnapshot => {
      const win = BrowserWindow.fromWebContents(event.sender);
      return { isMaximized: !!win && !win.isDestroyed() && win.isMaximized() };
    });
    cleanup.push(() => ipcMain.removeHandler(IPC.WINDOW_GET_STATE));

    const quit = (): void => {
      app.quit();
    };
    ipcMain.on(IPC.WINDOW_QUIT, quit);
    cleanup.push(() => ipcMain.removeListener(IPC.WINDOW_QUIT, quit));

    const openStatus = (): void => {
      dependencies.windowManager.createStatusWindow();
    };
    ipcMain.on(IPC.WINDOW_OPEN_STATUS, openStatus);
    cleanup.push(() => ipcMain.removeListener(IPC.WINDOW_OPEN_STATUS, openStatus));

    const openChat = (): void => {
      dependencies.windowManager.createChatWindow();
    };
    ipcMain.on(IPC.WINDOW_OPEN_CHAT, openChat);
    cleanup.push(() => ipcMain.removeListener(IPC.WINDOW_OPEN_CHAT, openChat));

    const openSettings = (): void => {
      dependencies.windowManager.createSettingsWindow();
    };
    ipcMain.on(IPC.WINDOW_OPEN_SETTINGS, openSettings);
    cleanup.push(() => ipcMain.removeListener(IPC.WINDOW_OPEN_SETTINGS, openSettings));

    const openSummary = (): void => {
      dependencies.windowManager.toggleSummaryWindow();
    };
    ipcMain.on(IPC.WINDOW_OPEN_SUMMARY, openSummary);
    cleanup.push(() => ipcMain.removeListener(IPC.WINDOW_OPEN_SUMMARY, openSummary));

    const showContextMenu = (): void => {
      dependencies.windowManager.showContextMenu();
    };
    ipcMain.on(IPC.PET_SHOW_CONTEXT_MENU, showContextMenu);
    cleanup.push(() => ipcMain.removeListener(IPC.PET_SHOW_CONTEXT_MENU, showContextMenu));

    const setPetScale = (_event: IpcMainEvent, scale: number): void => {
      dependencies.windowManager.setPetScale(scale);
    };
    ipcMain.on(IPC.PET_SET_SCALE, setPetScale);
    cleanup.push(() => ipcMain.removeListener(IPC.PET_SET_SCALE, setPetScale));

    ipcMain.handle(IPC.PET_INTERACTION, async (_event, action: "click" | "touch") => {
      const policyEngine = CharacterPolicyEngine.getInstance();
      const plan = policyEngine.handleInteraction(action);
      if (plan.requiresEmbodiment && plan.visual) {
        const target = plan.visual.target;
        const payload =
          target.kind === "expression"
            ? { ...target, temporary: true, durationMs: plan.visual.durationMs ?? 5000 }
            : { ...target, durationMs: plan.visual.durationMs ?? 5000 };
        dependencies.windowManager.sendToPet(IPC.LIVE2D_PLAY_ACTION, {
          ...payload,
          correlationId: plan.correlationId,
          behaviorType: plan.behaviorType,
        });
      }
      if (plan.presentationSummary) {
        dependencies.windowManager.broadcast(IPC.CHARACTER_SUMMARY_UPDATED, {
          correlationId: plan.correlationId,
          summary: plan.presentationSummary,
        });
      }
    });
    cleanup.push(() => ipcMain.removeHandler(IPC.PET_INTERACTION));

    ipcMain.handle(IPC.PET_SET_INTERACTIVE, async (_event, interactive: boolean) => {
      const win = dependencies.windowManager.getPetWindow();
      if (win && !win.isDestroyed()) {
        win.setIgnoreMouseEvents(!interactive, { forward: true });
      }
    });
    cleanup.push(() => ipcMain.removeHandler(IPC.PET_SET_INTERACTIVE));

    const moveBy = (_event: IpcMainEvent, delta: { dx: number; dy: number }): void => {
      const win = dependencies.windowManager.getPetWindow();
      if (win && !win.isDestroyed()) {
        const [x, y] = win.getPosition();
        win.setPosition(x + delta.dx, y + delta.dy);
      }
    };
    ipcMain.on(IPC.PET_MOVE_BY, moveBy);
    cleanup.push(() => ipcMain.removeListener(IPC.PET_MOVE_BY, moveBy));

    const setDragging = (_event: IpcMainEvent, isDragging: boolean): void => {
      const win = dependencies.windowManager.getPetWindow();
      if (win && !win.isDestroyed() && isDragging) {
        win.setIgnoreMouseEvents(false);
      }
    };
    ipcMain.on(IPC.PET_SET_DRAGGING, setDragging);
    cleanup.push(() => ipcMain.removeListener(IPC.PET_SET_DRAGGING, setDragging));

    ipcMain.handle(IPC.PET_GET_CURSOR_POS, async () => screen.getCursorScreenPoint());
    cleanup.push(() => ipcMain.removeHandler(IPC.PET_GET_CURSOR_POS));

    ipcMain.handle(IPC.STARTUP_GET, async () => getAutoLaunch());
    cleanup.push(() => ipcMain.removeHandler(IPC.STARTUP_GET));

    ipcMain.handle(IPC.STARTUP_SET, async (_event, enabled: boolean) => setAutoLaunch(enabled));
    cleanup.push(() => ipcMain.removeHandler(IPC.STARTUP_SET));

    ipcMain.handle(IPC.SETTINGS_LOAD, async () => dependencies.settingsManager.load());
    cleanup.push(() => ipcMain.removeHandler(IPC.SETTINGS_LOAD));

    ipcMain.handle(IPC.SETTINGS_SAVE, async (_event, newSettings: FireflySettingsUpdate) => {
      const previousPermissionProfile = dependencies.settingsManager.getPermissionProfile();
      const previousBrowserRevision = dependencies.settingsManager.getBrowserSettingsSnapshot().revision;
      const ok = dependencies.settingsManager.save(newSettings);
      const updated = dependencies.settingsManager.load();
      if (
        ok &&
        previousPermissionProfile === "FULL_ACCESS" &&
        updated.permissionProfile !== "FULL_ACCESS"
      ) {
        dependencies.approvalService.revokeProcessGrants();
      }
      if (ok && newSettings.browser !== undefined) {
        dependencies.onBrowserSettingsChanged?.(previousBrowserRevision, updated.browser);
      }
      dependencies.windowManager.broadcast(IPC.SETTINGS_CHANGED, updated);
      if (newSettings.llm) {
        const provider = createFireflyProvider(dependencies.settingsManager.getLlmConfig());
        dependencies.agentCore.setProvider?.(provider);
        const status = evaluateProviderStatus(dependencies.settingsManager.getLlmConfig());
        dependencies.windowManager.broadcast(IPC.PROVIDER_STATUS_CHANGED, status);
      }
      return ok;
    });
    cleanup.push(() => ipcMain.removeHandler(IPC.SETTINGS_SAVE));

    ipcMain.handle(IPC.PROVIDER_GET_STATUS, async () => {
      const config = dependencies.settingsManager.getLlmConfig();
      return evaluateProviderStatus(config);
    });
    cleanup.push(() => ipcMain.removeHandler(IPC.PROVIDER_GET_STATUS));

    return dispose;
  } catch (error: unknown) {
    dispose();
    throw error;
  }
}

function registerAssetsProtocol(): () => void {
  let registered = false;
  const registeredSuccessfully = protocol.registerFileProtocol("assets", (request, callback) => {
    let clean = decodeURIComponent(request.url.replace("assets://", "").replace(/^\/+/, ""));
    if (clean.startsWith("firefly/")) clean = clean.replace("firefly/", "");

    const candidatePaths = [
      path.join(app.getAppPath(), "src", "renderer", clean),
      path.join(app.getAppPath(), "src", "renderer", "models", clean),
      path.join(app.getAppPath(), "dist", "renderer", clean),
      path.join(app.getAppPath(), "dist", "renderer", "models", clean),
      path.join(app.getAppPath(), clean),
    ];
    let resolved = candidatePaths[0];
    for (const candidatePath of candidatePaths) {
      if (fs.existsSync(candidatePath)) {
        resolved = candidatePath;
        break;
      }
    }
    const exists = fs.existsSync(resolved);
    console.log(`[Assets Protocol] requested: "${request.url}" -> resolved: "${resolved}" (exists: ${exists})`);
    callback({ path: resolved });
  });

  if (!registeredSuccessfully) {
    throw new Error("Failed to register the assets protocol.");
  }
  registered = true;

  return () => {
    if (!registered) return;
    registered = false;
    protocol.unregisterProtocol("assets");
  };
}

interface DefaultApplicationDependencies {
  readonly windowManager: WindowManager;
  readonly memoryService: FireflyMemoryService;
  readonly settingsManager: SettingsManager;
  readonly approvalService: ApprovalService;
  readonly browserReadService: BrowserReadService;
  readonly configPath: string;
  readonly musicService: MusicService;
  readonly musicContextService: MusicContextService;
  readonly musicPreferenceService: MusicPreferenceService;
  readonly agentEventBus: AgentEventBus;
  readonly knowledgeCoordinator: KnowledgeCoordinator;
  readonly agentCore: IAgentCore;
  readonly subAgentWorkerRuntime: SubAgentWorkerRuntime;
  readonly restoreTools: () => void;
  readonly registerWindowAndSettingsIpc: () => () => void;
}

class DefaultApplicationRuntime implements ApplicationRuntime {
  private started = false;
  private disposed = false;
  private tray: Tray | null = null;
  private unregisterAssetsProtocol: (() => void) | null = null;
  private unregisterWindowAndSettingsIpc: (() => void) | null = null;
  private unregisterChatIpc: (() => void) | null = null;
  private unregisterMusicIpc: (() => void) | null = null;
  private unregisterMusicPreferenceSignals: (() => void) | null = null;
  private unregisterApprovalPresentationListener: (() => void) | null = null;
  private approvalIpc: ApprovalIpcRegistration | null = null;
  private ttsIpc: TtsIpcRegistration | null = null;
  private smokeTestTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly dependencies: DefaultApplicationDependencies) {}

  async start(signal: AbortSignal): Promise<void> {
    if (this.disposed) throw new Error("The Firefly application runtime has been disposed.");
    if (this.started) return;

    try {
      Menu.setApplicationMenu(null);
      await this.dependencies.knowledgeCoordinator.initialize();
      this.throwIfAborted(signal);

      this.unregisterMusicIpc = registerMusicIpc(this.dependencies.musicService);
      this.throwIfAborted(signal);

      this.unregisterMusicPreferenceSignals = registerMusicPreferenceSignalAdapter({
        eventBus: this.dependencies.agentEventBus,
        preferenceService: this.dependencies.musicPreferenceService,
      });
      this.dependencies.musicContextService.start();
      await this.dependencies.musicService.start();
      this.throwIfAborted(signal);

      this.unregisterChatIpc = registerChatIpc(this.dependencies.agentCore, {
        sendToPet: (channel, payload) => this.dependencies.windowManager.sendToPet(channel, payload),
        memoryService: this.dependencies.memoryService,
        onEmbodimentPlan: (plan) => {
          if (plan.presentationSummary) {
            this.dependencies.windowManager.broadcast(IPC.CHARACTER_SUMMARY_UPDATED, {
              correlationId: plan.correlationId,
              summary: plan.presentationSummary,
            });
          }
        },
      });

      this.tray = createTray({
        togglePetWindow: () => this.dependencies.windowManager.togglePetWindow(),
        createChatWindow: () => this.dependencies.windowManager.createChatWindow(),
        createStatusWindow: () => this.dependencies.windowManager.createStatusWindow(),
        createSettingsWindow: () => this.dependencies.windowManager.createSettingsWindow(),
      });

      this.unregisterAssetsProtocol = registerAssetsProtocol();
      this.unregisterWindowAndSettingsIpc = this.dependencies.registerWindowAndSettingsIpc();
      this.approvalIpc = registerApprovalIpc({
        approvalService: this.dependencies.approvalService,
        windowManager: this.dependencies.windowManager,
      });
      this.unregisterApprovalPresentationListener = this.dependencies.approvalService.onChanged(() => {
        queueMicrotask(() => this.approvalIpc?.notifyPending());
      });
      this.ttsIpc = registerTtsIpc({
        configPath: this.dependencies.configPath,
        onSpeakingChanged: (speaking) => {
          this.dependencies.windowManager.broadcast(IPC.PET_SPEAKING_CHANGED, speaking);
        },
      });

      this.dependencies.windowManager.createPetWindow();
      if (process.env.ELECTRON_SMOKE_TEST === "1") {
        console.log("[SmokeTest] Pet window created. Running smoke verification...");
        this.smokeTestTimer = setTimeout(() => {
          this.smokeTestTimer = null;
          console.log("[SmokeTest] Verification passed. Exiting cleanly.");
          app.quit();
        }, 2500);
      }
      this.started = true;
    } catch (error: unknown) {
      await this.stop();
      throw error;
    }
  }

  activate(): void {
    if (BrowserWindow.getAllWindows().length === 0) {
      this.dependencies.windowManager.createPetWindow();
    }
  }

  hasTray(): boolean {
    return this.tray !== null && !this.tray.isDestroyed();
  }

  async stop(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    // Stop accepting new work before awaiting any asynchronous resource shutdown.
    this.dependencies.subAgentWorkerRuntime.cancelAll();
    this.dependencies.agentCore.cancelAll();
    await this.dependencies.browserReadService.dispose();
    this.ttsIpc?.sessionService.cancelAll();

    this.ttsIpc?.dispose();
    this.ttsIpc = null;
    this.unregisterApprovalPresentationListener?.();
    this.unregisterApprovalPresentationListener = null;
    this.approvalIpc?.dispose();
    this.approvalIpc = null;
    this.unregisterWindowAndSettingsIpc?.();
    this.unregisterWindowAndSettingsIpc = null;
    this.unregisterChatIpc?.();
    this.unregisterChatIpc = null;
    this.unregisterMusicIpc?.();
    this.unregisterMusicIpc = null;
    this.unregisterMusicPreferenceSignals?.();
    this.unregisterMusicPreferenceSignals = null;
    this.dependencies.musicContextService.dispose();
    if (this.smokeTestTimer) {
      clearTimeout(this.smokeTestTimer);
      this.smokeTestTimer = null;
    }

    this.dependencies.memoryService.save();
    try {
      await this.dependencies.musicService.shutdown();
    } catch (error: unknown) {
      console.error("[FireflyApplication] Music service cleanup failed:", error);
    }

    this.dependencies.restoreTools();
    this.unregisterAssetsProtocol?.();
    this.unregisterAssetsProtocol = null;
    if (this.tray && !this.tray.isDestroyed()) this.tray.destroy();
    this.tray = null;
    this.started = false;
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) throw new Error("The Firefly application runtime startup was cancelled.");
  }
}

export interface DefaultApplicationOptions {
  readonly isDev: boolean;
}

export async function createDefaultApplicationRuntime(
  options: DefaultApplicationOptions,
): Promise<ApplicationRuntime> {
  let musicService: MusicService | null = null;
  let musicContextService: MusicContextService | null = null;
  let browserReadService: BrowserReadService | null = null;
  let restoreToolsOnAssemblyFailure: (() => void) | null = null;

  try {
    const windowManager = new WindowManager(options.isDev);
    const userDataPath = resolveUserDataPath();
    const configPath = path.join(userDataPath, "settings.json");
    const memoryPath = path.join(userDataPath, "memory.json");
    const memoryService = new FireflyMemoryService(memoryPath);
    const settingsManager = new SettingsManager(configPath);
    const approvalService = new ApprovalService();
    const browserReadServiceInstance = new BrowserReadService({
      getBrowserSettingsSnapshot: () => settingsManager.getBrowserSettingsSnapshot(),
    });
    browserReadService = browserReadServiceInstance;

    const playActionTool = createPlayLive2DActionTool({
      sendToPet: (channel, payload) => windowManager.sendToPet(channel, payload),
    });
    const musicServiceInstance = new MusicService({ provider: new QQMusicProvider() });
    musicService = musicServiceInstance;
    const musicTools = createMusicTools(musicServiceInstance);
    const browserReadTool = createBrowserReadTool(browserReadServiceInstance);
    const tools = [playActionTool, ...musicTools, browserReadTool];
    const toolRegistration = createApplicationToolRegistration(globalToolRegistry, tools);
    restoreToolsOnAssemblyFailure = toolRegistration.restore;

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
    capabilityRegistry.register({
      id: BROWSER_STATIC_READ_CAPABILITY_ID,
      name: "Read static public web pages",
      description: "Reads a user-specified public HTTP(S) page as untrusted static content.",
      version: "1.1.1",
      category: BROWSER_CAPABILITY_CATEGORY,
      risk: "read_only",
      sideEffect: "external_network_read",
    });
    const capabilityBindingResolver = new CapabilityBindingResolver(
      capabilityRegistry,
      globalToolRegistry,
    );
    registerApplicationToolBindings(toolRegistration, capabilityBindingResolver, [
      {
        capabilityId: MUSIC_STATUS_CAPABILITY_ID,
        toolId: "music_status",
      },
      {
        capabilityId: MUSIC_CONTROL_CAPABILITY_ID,
        toolId: "music_control",
      },
      {
        capabilityId: BROWSER_STATIC_READ_CAPABILITY_ID,
        toolId: BROWSER_READ_TOOL_ID,
      },
    ]);
    emitDiagnosticTrace(
      `[ToolRegistry Trace] registered=${globalToolRegistry.listEnabled().map((tool) => tool.id).join(",") || "none"} ` +
      `browser=${globalToolRegistry.has(BROWSER_READ_TOOL_ID) ? "enabled" : "missing"}`,
    );
    const browserSettingsSnapshot = settingsManager.getBrowserSettingsSnapshot();
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
      createBrowserSandboxProfile(browserSettingsSnapshot),
    ]);
    const permissionProfilePolicyResolver = new PermissionProfilePolicyResolver();
    const approvalRequirementResolver = createApprovalRequirementResolver(
      [
        { capabilityId: MUSIC_STATUS_CAPABILITY_ID, requirement: "none" },
        { capabilityId: MUSIC_CONTROL_CAPABILITY_ID, requirement: "required" },
        { capabilityId: BROWSER_STATIC_READ_CAPABILITY_ID, requirement: "none" },
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
      processApprovalGrantRule: {
        capabilityId: MUSIC_CONTROL_CAPABILITY_ID,
        toolId: "music_control",
        sandboxProfileId: MUSIC_CONTROL_SANDBOX_PROFILE_ID,
        permissionProfile: "FULL_ACCESS",
      },
    });

    const knowledgeCoordinator = new KnowledgeCoordinator({
      knowledgeDataDir: resolveKnowledgeDataDir(),
    });
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

    const initialProvider = createFireflyProvider(settingsManager.getLlmConfig());
    const agentEventBus = new AgentEventBus();
    const musicContextServiceInstance = new MusicContextService({
      desktopBridge: musicServiceInstance.getDesktopBridge(),
      eventBus: agentEventBus,
    });
    musicContextService = musicContextServiceInstance;
    const musicContextSlot = new MusicContextSlot(musicContextServiceInstance);
    const contextManager = new ContextManager({
      customSlots: [memorySlot, ragSlot, musicContextSlot],
    });
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
        {
          toolId: BROWSER_READ_TOOL_ID,
          capabilityId: BROWSER_STATIC_READ_CAPABILITY_ID,
          sandboxProfileId: BROWSER_STATIC_READ_SANDBOX_PROFILE_ID,
          resolveAuthorizationFacts: createBrowserAuthorizationFactsResolver({
            getBrowserSettingsSnapshot: () => settingsManager.getBrowserSettingsSnapshot(),
            getPermissionProfile: () => settingsManager.getPermissionProfile(),
          }),
          approvalTtlMs: DEFAULT_AGENT_CONFIG.totalTimeoutMs,
        },
      ],
    });
    const subAgentRegistry = new SubAgentRegistry();
    subAgentRegistry.register(DEFAULT_MUSIC_STATUS_SUBAGENT_DESCRIPTOR);
    const subAgentTaskService = new SubAgentTaskService({ registry: subAgentRegistry });
    let agentCore: IAgentCore | null = null;
    const workerRuntime = new SubAgentWorkerRuntime({
      registry: subAgentRegistry,
      taskService: subAgentTaskService,
      bindingResolver: capabilityBindingResolver,
      agentCore: {
        run: (input) => {
          if (!agentCore) throw new Error("AgentCore is not ready.");
          return agentCore.run(input);
        },
      },
      eventBus: agentEventBus,
    });
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

    const musicPreferenceService = new MusicPreferenceService({ memory: memoryService });
    const agentCoreInstance = agentCore;
    if (!agentCoreInstance) throw new Error("AgentCore construction did not complete.");
    const runtimeDependencies: DefaultApplicationDependencies = {
      windowManager,
      memoryService,
      settingsManager,
      approvalService,
      browserReadService: browserReadServiceInstance,
      configPath,
      musicService: musicServiceInstance,
      musicContextService: musicContextServiceInstance,
      musicPreferenceService,
      agentEventBus,
      knowledgeCoordinator,
      agentCore: agentCoreInstance,
      subAgentWorkerRuntime: workerRuntime,
      restoreTools: toolRegistration.restore,
      registerWindowAndSettingsIpc: () =>
        registerWindowAndSettingsIpc({
          windowManager,
          settingsManager,
          agentCore,
          approvalService,
          onBrowserSettingsChanged: (previousRevision, snapshot) => {
            if (snapshot?.revision !== previousRevision && snapshot !== undefined) {
              sandboxPolicy.updateProfile(createBrowserSandboxProfile(snapshot));
              browserReadServiceInstance.invalidateConfiguration();
            }
          },
        }),
    };
    const runtime = new DefaultApplicationRuntime(runtimeDependencies);
    return runtime;
  } catch (error: unknown) {
    restoreToolsOnAssemblyFailure?.();
    restoreToolsOnAssemblyFailure = null;
    musicContextService?.dispose();
    await browserReadService?.dispose();
    if (musicService) await musicService.shutdown();
    throw error;
  }
}
