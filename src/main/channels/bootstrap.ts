import { randomUUID } from "node:crypto";
import type { BrowserWindow } from "electron";
import type { IpcScope } from "../application/ipc-scope";
import { IPC } from "../../shared/ipc-channels";
import type { PluginPromptMode, PluginTurnStatus } from "../../plugins/api";
import { loadGeneralSettings } from "../settings/settings-facade";
import { loadModelSettings, resolveModelSettingsProfile } from "../settings/model-settings";
import { resolveDefaultModelProfile } from "../settings/model-catalog";
import { requireChannelMemoryIngress, type ChannelsMemoryHost } from "../memory-context/channel-memory-ingress";
import type { LifecyclePublisher } from "../plugin-host/lifecycle-publisher";
import { FireflyAgent } from "../orchestrator/firefly-agent";
import { toolRegistry } from "../orchestrator/tools/registry/tool-registry";
import { captionImageSafe, IMAGE_CAPTION_PROMPT } from "../chat/image-caption";
import { resolveCaptionVisionConfig, resolveImageRoute } from "../orchestrator/image-router";
import { indexConversationTurn } from "../orchestrator/tools/history-tools";
import type { AgentRuntime } from "../orchestrator/agent-runtime";

import { buildChannelAttachmentInputs } from "./agent-input";
import { loadChannelsSettings } from "./settings-store";
import { enforceChannelAgentPolicy, resolveChannelAgentPolicy } from "./agent-policy";
import { appendMessage, getSession, listSessions } from "../chats/chats-store";
import { getChannelConversationBindingStore } from "./conversation-binding-store";
import { ChannelDispatcher, type DispatcherDeps } from "./dispatcher";
import {
  createChannelContext,
  formatChannelUserText,
  type BoundConversationMessageMetadata,
} from "./channel-context";
import { appendHistory, migrateHistory } from "./history-log";
import { createKeyedQueue } from "./keyed-queue";
import { createChannelRateLimiter } from "./rate-limiter";
import { createChannelDeliveryService } from "./delivery-service";
import {
  createOutgoingComposer,
  type OutgoingComposer,

} from "./outgoing-composer";
import { channelManager } from "./manager";
import {
  initializeChannels,
  startChannels,
  shutdownChannels,
} from "./init";

export interface ChannelsLifecycleAdapter {
  initialize(): void;
  start(signal?: AbortSignal): Promise<void>;
  shutdown(): Promise<void>;
}

export interface ChannelsSubsystem {
  initialize(): void;
  start(signal?: AbortSignal): Promise<void>;
  /** initialize() 同步注册全部内置 adapter 后解析，插件必须等待该边界。 */
  adaptersRegistered: Promise<void>;
  shutdown(): Promise<void>;
}

export interface ChannelsSubsystemDeps {
  agentRuntime: AgentRuntime;
  /** Main-only shared owner; no renderer opt-in or independent channel Worker. */
  memory?: ChannelsMemoryHost;

  getReactChatWindow: () => BrowserWindow | null;
  /** 共享 IPC scope；传入后 channels IPC 由组合根统一注销。 */
  ipc?: IpcScope;
  /** 生命周期事件发布器：渠道轮次事件由此发布。 */
  publishLifecycle?: LifecyclePublisher;
}

/**
 * 组装渠道子系统。构造期只创建对象并连接依赖，
 * 不做任何初始化/启动 —— initialize / start / shutdown 必须显式调用。
 */
export function createChannelsSubsystem(
  deps: ChannelsSubsystemDeps,
  lifecycle?: ChannelsLifecycleAdapter,
): ChannelsSubsystem {
  const loadRecentChannelHistory = async (sessionId: string, limit: number) => {
    const { loadRecentHistory } = await import("./history-log");
    return loadRecentHistory(sessionId, limit);
  };

  const observeExternalChat: DispatcherDeps["observeExternalChat"] = (sessionId, msg) => {
    getChannelConversationBindingStore().observe({
      sessionId,
      channel: msg.channel,
      chatId: msg.chatId,
      chatType: msg.chatType ?? "private",
      ...(msg.senderName ? { senderName: msg.senderName } : {}),
      lastAt: msg.at.getTime(),
    });
  };

  const resolveBoundConversationId = (sessionId: string): string | null => {
    const conversationId = getChannelConversationBindingStore().resolve(sessionId);
    return conversationId && listSessions().some((session) => session.id === conversationId) ? conversationId : null;
  };

  const loadBoundConversationHistory = async (conversationId: string, limit: number) => {
    const session = getSession(conversationId);
    if (!session) return [];
    return session.messages
      .filter((message) => (message.role === "user" || message.role === "model") && message.content.trim().length > 0)
      .slice(-limit)
      .map((message) => ({
        role: message.role === "model" ? "assistant" as const : "user" as const,
        content: message.modelContext?.trim() || message.content,
      }));
  };

  const appendBoundConversationMessage = (
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    metadata: BoundConversationMessageMetadata,
  ) => {
    const session = appendMessage(conversationId, {
      id: randomUUID(),
      role: role === "assistant" ? "model" : "user",
      content,
      at: Date.now(),
      modelContext: metadata.modelContext,
      sticker: metadata.sticker,
      channelSource: {
        channel: metadata.channel,
        chatType: metadata.chatType,
        senderName: metadata.senderName,
      },
    });
    if (!session) throw new Error("Bound conversation no longer exists");
    const win = deps.getReactChatWindow();
    if (win && !win.isDestroyed()) {
      try {
        win.webContents.send(IPC.CHATS_CHANGED);
      } catch (err) {
        console.warn("[Channels] bound conversation refresh failed:", err);
      }
    }
  };

  const buildAndRunAgent: DispatcherDeps["buildAndRunAgent"] = async (
    msg,
    sessionId,
    priorMessages,
    ingress,
  ) => {
    if (deps.memory && !ingress) throw Error("MEMORY_CHANNEL_ACCOUNT_UNAVAILABLE");
    const memoryBinding = deps.memory ? requireChannelMemoryIngress(ingress, msg) : undefined;
    if (memoryBinding && memoryBinding.sessionId !== sessionId) throw Error("MEMORY_CHANNEL_INGRESS_DENIED");
    const channelResult: { text: string; sticker: string | null } = { text: "", sticker: null };

    const sandbox = loadChannelsSettings().toolSandbox;
    const policy = resolveChannelAgentPolicy(sandbox, {
      channel: msg.channel,
      chatType: msg.chatType,
    });
    const allTools = toolRegistry.getEnabledTools();
    const exposedTools = policy.exposeTools ? allTools : [];
    console.log(
      "[Channels] bot run:",
      `msg.channel=${msg.channel} sandbox=${sandbox} tools=${exposedTools.length}/${allTools.length} priorMsgs=${priorMessages?.length ?? 0}`,
    );

    const historyMessages = (deps.memory ? [] : priorMessages ?? [])
      .filter((m) => typeof m.content === "string" && m.content.trim().length > 0)
      .map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }));

    // 图片路由统一收口在 image-router（基于解析后的默认档案——顶层镜像可能是空壳）
    const savedModelSettings = loadModelSettings();
    const modelProfileId = deps.memory ? resolveDefaultModelProfile(savedModelSettings.modelProfiles ?? [], savedModelSettings.defaultModelProfileId)?.id : undefined;
    if (deps.memory && !modelProfileId) throw Error("MEMORY_RUN_PROFILE_DENIED");
    const agentUserText = formatChannelUserText(msg);
    const runId = randomUUID(), userTurnId = deps.memory ? randomUUID() : `${msg.channel}:${msg.senderId}:${msg.at.toISOString()}:user`;
    const assistantTurnId = deps.memory ? randomUUID() : `${msg.channel}:${msg.senderId}:${msg.at.toISOString()}:assistant`;
    // Authorize and commit the canonical event before any file/caption preparation.
    const memoryRun = deps.memory ? await deps.memory.prepareRun({ ingress: ingress!, message: msg, userText: agentUserText,
      modelProfileId: modelProfileId!, runId, userTurnId, assistantTurnId, signal: memoryBinding!.signal }) : undefined;
    try {
      if (memoryRun && (memoryRun.sessionId !== sessionId || memoryRun.signal.aborted)) throw Error("MEMORY_CHANNEL_INGRESS_DENIED");
      const channelModelSettings = resolveModelSettingsProfile(savedModelSettings);
      const channelImageRoute = resolveImageRoute("channel", channelModelSettings);
      // The canonical route materializes only the owner's opaque attachment grant.
      // Keep the existing adapter media path solely for standalone legacy callers.
      const attachmentInputs = deps.memory ? {} : await buildChannelAttachmentInputs(msg, {
        // reject 时走 caption 分支：每张图会拿到路由的人话错误并诚实告知用户
        imageMode: channelImageRoute.mode === "direct" ? "direct" : "caption",
        captionImage: async (filePath: string) => {
          const settings = resolveModelSettingsProfile(loadModelSettings());
          const vision = resolveCaptionVisionConfig(settings);
          if (!vision.ok) return { ok: false, error: vision.error };
          return captionImageSafe(filePath, IMAGE_CAPTION_PROMPT, vision.config);
        },
      });
      const buildInput: Parameters<AgentRuntime["buildOptions"]>[0] = {
        messages: [
          ...historyMessages,
          { role: "user", content: agentUserText },
        ],
        styleId: "default",
        sessionId,
        ...(modelProfileId ? { modelProfileId } : {}),
        // 渠道绑定只共享文字上下文，不继承桌面对话的工作区权限。
        workspaceBindingSessionId: null,
        attachments: attachmentInputs.attachments,
        imageAttachments: attachmentInputs.imageAttachments,
        channel: msg.channel,
        executionMode: policy.executionMode,
        ...(deps.memory || policy.executionMode === "chat" ? { userTurnId, assistantTurnId } : {}),
      };
      const { options } = memoryRun
        ? await deps.agentRuntime.buildOptions(buildInput, { attachmentGrant: memoryRun.attachmentGrant })
        : await deps.agentRuntime.buildOptions(buildInput);
      options.tools = policy.exposeTools
        ? [...(options.capabilities?.tools ?? exposedTools)]
        : [];
      enforceChannelAgentPolicy(options, policy);
      if (memoryRun) {
        Object.assign(options, { runId, conversationId: sessionId, userTurnId, assistantTurnId,
          signal: memoryRun.signal, transcriptSink: memoryRun.transcriptSink, openMemoryRun: memoryRun.openMemoryRun });
      }

      const threadId = `thread-${sessionId}-${Date.now()}`;
      const agent = new FireflyAgent({ threadId, description: `bot:${msg.channel}:${msg.senderId}` });
      // 轮次事件只带渠道会话标识，不提供桌面消息边界；绑定消息由 dispatcher 镜像写入。
      const mode: PluginPromptMode = options.conversationMode
        ?? (options.executionMode === "chat" ? "chat" : "work");
      const runStartedAt = Date.now();
      deps.publishLifecycle?.publishTurnStarted({
        source: "channel",
        channel: msg.channel,
        conversationId: sessionId,
        runId,
        mode,
      });
      let lifecycleStatus: PluginTurnStatus = "runtime_error";
      try {
        const reply = await new Promise<string>((resolve, reject) => {
          agent.runWithEvents(options).subscribe({
            complete: () => {
              resolve(agent.lastResult?.reply ?? "");
            },
            error: (err) => reject(err instanceof Error ? err : new Error(String(err))),
          });
        });
        lifecycleStatus = agent.lastResult?.terminal?.status ?? "success";
        channelResult.text = reply;
        // Observable 在超时终态下也会正常 complete；只有成功终态才能进入记忆、表情等成功收尾。
        const terminalStatus = agent.lastResult?.terminal?.status;
        if (agent.lastResult && (terminalStatus === undefined || terminalStatus === "success")) {
          const finished = await deps.agentRuntime.onRunFinished(agent.lastResult, agentUserText, {
            source: "channel",
            mode,
            conversationId: sessionId,
            channel: msg.channel,
          });
          channelResult.sticker = finished.sticker;
        }
        if (!deps.memory) void indexConversationTurn(sessionId, agentUserText, reply);
        return channelResult;
      } finally {
        // 无论成功、超时还是异常退出，轮次结束事件都要发布一次
        deps.publishLifecycle?.publishTurnFinished({
          source: "channel",
          channel: msg.channel,
          conversationId: sessionId,
          runId,
          mode,
          status: lifecycleStatus,
          durationMs: Date.now() - runStartedAt,
        });
      }
    } finally { await memoryRun?.close(); }
  };

  const broadcastChat: DispatcherDeps["broadcastChat"] = (event) => {
    const win = deps.getReactChatWindow();
    if (!win || win.isDestroyed()) return;
    try {
      win.webContents.send(IPC.AGUI_EVENT, {
        type: "CUSTOM",
        name: "firefly.botMessage",
        value: event,
      });
    } catch (err) {
      console.warn("[Channels] botMessage 广播失败:", err);
    }
  };

  const context = createChannelContext({
    resolveBoundConversationId,
    loadRecentChannelHistory,
    loadBoundConversationHistory,
    appendChannelHistory: appendHistory,
    appendBoundConversationMessage,
    migrateHistory,
  });
  const baseComposer = createOutgoingComposer();
  const composer: OutgoingComposer = {
    compose: (input) => baseComposer.compose({
      ...input,
      capability: channelManager.getAdapter(input.incoming.channel)?.capability,
    }),
    cleanupTransientFiles: (files) => baseComposer.cleanupTransientFiles(files),
  };
  // 首次处理消息前，调度器会用实际设置重新配置这两个占位上限。
  const limiter = createChannelRateLimiter({
    limits: {
      perUser: Number.MAX_SAFE_INTEGER,
      perChannel: Number.MAX_SAFE_INTEGER,
    },
  });
  const dispatcher = new ChannelDispatcher({
    queue: createKeyedQueue({ maxPendingPerKey: 20 }),
    limiter,
    context,
    composer,
    delivery: createChannelDeliveryService(channelManager),
    buildAndRunAgent,
    memoryEnabled: !!deps.memory,
    loadSettings: loadChannelsSettings,
    loadGeneralSettings,
    observeExternalChat,
    broadcastChat,
  });

  // 默认生命周期：委托到 init.ts 的显式操作（幂等）
  const defaultLifecycle: ChannelsLifecycleAdapter = {
    initialize: () => initializeChannels({
      ipc: deps.ipc,
      handleIncoming: (msg, ingress) => dispatcher.handleIncoming(msg, ingress),
      reloadDispatcherSettings: () => dispatcher.reloadSettings(),
    }),
    start: (signal?: AbortSignal) => startChannels(signal),
    shutdown: () => shutdownChannels(),
  };
  const adapter = lifecycle ?? defaultLifecycle;

  let resolveAdaptersRegistered!: () => void;
  let rejectAdaptersRegistered!: (error: unknown) => void;
  const adaptersRegistered = new Promise<void>((resolve, reject) => {
    resolveAdaptersRegistered = resolve;
    rejectAdaptersRegistered = reject;
  });

  return {
    initialize: () => {
      try {
        adapter.initialize();
        resolveAdaptersRegistered();
      } catch (error) {
        rejectAdaptersRegistered(error);
        throw error;
      }
    },
    start: (signal?: AbortSignal) => adapter.start(signal),
    adaptersRegistered,
    shutdown: async () => {
      try {
        await adapter.shutdown();
      } finally {
        getChannelConversationBindingStore().flush();
      }
    },
  };
}
