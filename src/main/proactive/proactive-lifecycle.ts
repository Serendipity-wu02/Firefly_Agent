import { getCustomEndpointMode, getCustomEndpointPresentation } from "../../shared/custom-endpoint-state";
import { createBackgroundMemoryIngressIssuer, type BackgroundMemoryHost, type BackgroundMemoryPreparedRun } from "../memory-context/background-memory-ingress";
import type { MainMemoryRun } from "../memory-context/main-memory-runtime";
import type { ChatMessage } from "../orchestrator/vendors/types";
import { searchMemory } from "../rag";
import { randomUUID } from "crypto";
import { powerMonitor } from "electron";
import * as chatsStore from "../chats/chats-store";
import { broadcastChatsChanged } from "../chats/chats-ipc";
import { setChannelsConversationLifecycle } from "../channels/init";
import { channelManager } from "../channels/manager";
import {
  canStartProactiveChannelDelivery,
  sendProactiveChannelMessage,
} from "../channels/proactive-delivery";
import { resolveChatContextTimezone } from "../chat-time-context";
import { buildAlwaysOnContext, buildMemoryInjection, buildWorldbookContext } from "../orchestrator";
import { loadPromptFile } from "../prompts/prompt-loader";
import type { GeneralSettings } from "../settings/general-settings";
import { loadModelSettings, getDefaultModelProfile, resolveModelSettingsProfile } from "../settings/model-settings";
import { loadUserProfile } from "../settings-store";
import { createProactiveChatService } from "./proactive-service";
import type {
  ProactiveChatService,
  ProactiveCommitInput,
  ProactiveCommitResult,
} from "./proactive-service";
import { routeProactiveDelivery } from "./proactive-delivery-routing";
import { buildProactiveMessages, type ProactiveHistoryTurn } from "./proactive-prompt";
import { canCommitProactiveMessage } from "./proactive-policy";
import { loadProactiveState, saveProactiveState } from "./proactive-state-store";
import { createProactiveTrigger, type ProactiveTriggerController } from "./proactive-trigger";
import { runProactiveModel } from "./proactive-model";
import type { ProactiveCandidate, ProactiveRuntimeSnapshot } from "./proactive-types";

export interface ProactiveLifecycleOptions {
  memoryHost?: BackgroundMemoryHost;
  loadGeneralSettings: () => GeneralSettings;
}

export interface ProactiveLifecycle {
  initializeProactiveChatService: () => void;
  initializeProactiveTrigger: () => void;
  stopProactiveTrigger: () => void;
  close(): Promise<void>;
  getProactiveChatService: () => ProactiveChatService | null;
  proactiveConversationLifecycle: {
    onUserMessage: () => void;
    onConversationStarted: () => void;
    onConversationEnded: () => void;
  };
}

export function createProactiveLifecycle(options: ProactiveLifecycleOptions): ProactiveLifecycle {
  let proactiveChatService: ProactiveChatService | null = null;
  let proactiveTrigger: ProactiveTriggerController | null = null;
  const proactiveBackoffMap = new Map<string, number>();
  let normalConversationBusyCount = 0;
  let proactiveScreenLocked = false, closed = false;
  const generations = new WeakMap<ChatMessage[], { candidate: ProactiveCandidate; epoch: number; signal: AbortSignal }>();
  const sources = new Set<object>();
  const issuer = createBackgroundMemoryIngressIssuer({ entry: "proactive", isCurrent: source => !closed && sources.has(source) });

  function buildProactivePersonaPrompt(): string {
    const parts: string[] = [];
    const chatSystem = loadPromptFile("chat_system.md");
    if (chatSystem) parts.push(chatSystem);
    const soul = loadPromptFile("soul.md");
    if (soul) {
      // 主动轮完全不携带工具说明；Soul 尾部的 Live2D/联网章节由正常聊天使用。
      parts.push(soul.split("\n## Live2D 与聊天文字的分工")[0].trim());
    }
    const canon = loadPromptFile("canon_quotes.md");
    if (canon) parts.push(canon);
    const style = loadPromptFile("styles/01_default.md");
    if (style) parts.push(style);
    return parts.join("\n\n---\n\n");
  }

  function toProactiveHistory(
    messages: Array<{ role: "user" | "model"; content: string; at: number }>,
  ): ProactiveHistoryTurn[] {
    return messages
      .filter((message) => message.content.trim())
      .slice(-16)
      .map((message) => ({ role: message.role, content: message.content, at: message.at }));
  }

  function getProactiveHistories(): { ordinary: ProactiveHistoryTurn[]; proactive: ProactiveHistoryTurn[] } {
    const ordinaryMeta = chatsStore.listSessions().find((session) => session.purpose !== "proactive-chat");
    const ordinarySession = ordinaryMeta ? chatsStore.getSession(ordinaryMeta.id) : null;
    const proactiveSession = chatsStore.getSessionByPurpose("proactive-chat");
    return {
      ordinary: toProactiveHistory(ordinarySession?.messages ?? []),
      proactive: toProactiveHistory(proactiveSession?.messages ?? []),
    };
  }

  function getProactiveRuntimeSnapshot(): ProactiveRuntimeSnapshot {
    const now = Date.now();
    let idleSec = Number.POSITIVE_INFINITY;
    try { idleSec = powerMonitor.getSystemIdleTime(); } catch { /* app 尚未 ready */ }
    return {
      now,
      localHour: new Date(now).getHours(),
      idleSec,
      enabled: options.loadGeneralSettings().proactiveChatMode === "on",
      conversationBusy: normalConversationBusyCount > 0,
      generationBusy: false,
      screenLocked: proactiveScreenLocked,
    };
  }

  async function buildProactiveAgentMessages(candidate: ProactiveCandidate) {
    const histories = options.memoryHost ? { ordinary: [], proactive: [] } : getProactiveHistories();
    const recentTopic = histories.ordinary.slice(-4).map((turn) => turn.content).join("\n");
    const retrievalQuery = `${candidate.sceneId}\n${recentTopic}`.trim();
    const [profileContext, memoryContext] = options.memoryHost ? await Promise.all([
      buildWorldbookContext(retrievalQuery, []).catch(() => ""),
      searchMemory(retrievalQuery, "imported_doc", 2).then(docs => docs.length ? "【相关文档】\n" + docs.join("\n") : "").catch(() => ""),
    ]) : await Promise.all([
      buildAlwaysOnContext(retrievalQuery, histories.ordinary.map((turn) => ({ role: turn.role, content: turn.content }))).catch(() => ""),
      buildMemoryInjection(retrievalQuery).catch(() => ""),
    ]);
    const state = loadProactiveState();
    const snapshot = getProactiveRuntimeSnapshot();
    // 用户有效时区：resolver 校验后传给 prompt，禁止未校验的 profile.timezone。
    const profile = loadUserProfile();
    const timezone = resolveChatContextTimezone(profile.timezone);
    return buildProactiveMessages({
      basePersona: buildProactivePersonaPrompt(),
      userProfile: profileContext,
      relevantMemory: memoryContext,
      ordinaryHistory: histories.ordinary,
      proactiveHistory: histories.proactive,
      sceneId: candidate.sceneId,
      localNow: new Date(snapshot.now),
      idleSec: snapshot.idleSec,
      unansweredCount: state.unansweredCount,
      timezone,
    });
  }

  function updateNormalConversationBusy(delta: 1 | -1): void {
    normalConversationBusyCount = Math.max(0, normalConversationBusyCount + delta);
  }

  const proactiveConversationLifecycle = {
    onUserMessage: () => proactiveChatService?.invalidateForUserMessage(),
    onConversationStarted: () => {
      updateNormalConversationBusy(1);
      proactiveChatService?.normalConversationStarted();
    },
    onConversationEnded: () => {
      updateNormalConversationBusy(-1);
      if (normalConversationBusyCount === 0) proactiveChatService?.normalConversationEnded();
    },
  };

  function getProactiveCommitDecision(candidate: ProactiveCandidate, generationEpoch: number, signal?: AbortSignal) {
    if (closed || signal?.aborted) return { allowed: false as const, reason: "generation_cancelled" };
    return canCommitProactiveMessage(
      getProactiveRuntimeSnapshot(),
      loadProactiveState(),
      candidate,
      generationEpoch,
    );
  }

  function recordProactiveDeliveryMetadata(input: ProactiveCommitInput): void {
    // Opener 的 todayFired/recentItems 字段已整体废弃（依赖的 SCENE_CONFIGS 与 ShowBubblePayload 来自旧 opener 子系统）。
    // ProactiveChat 这边只需持久化 committed 副作用；当前 implementation 已无副作用，留空占位即可。
    void input;
  }

  async function commitLocalProactiveMessage(input: ProactiveCommitInput): Promise<ProactiveCommitResult> {
    const initialDecision = getProactiveCommitDecision(input.candidate, input.generationEpoch, input.signal);
    if (!initialDecision.allowed) return { kind: "cancelled", reason: initialDecision.reason };

    const session = chatsStore.getOrCreateSessionByPurpose("proactive-chat", {
      title: "流萤的主动消息",
      identityId: null,
    });
    const at = Date.now();
    const appended = chatsStore.appendMessage(session.id, {
      id: randomUUID(),
      role: "model",
      content: input.text,
      at,
    });
    if (!appended) throw new Error("主动聊天会话写入失败");
    broadcastChatsChanged();

    // 文本已落库；上次落库后没有 panel/show 步骤要做（opener 气泡已被移除，fallback 路径没有了）。
    void input;
    void at;
    return { kind: "committed" };
  }

  async function commitSelectedProactiveMessage(input: ProactiveCommitInput): Promise<ProactiveCommitResult> {
    const initialDecision = getProactiveCommitDecision(input.candidate, input.generationEpoch, input.signal);
    if (!initialDecision.allowed) return { kind: "cancelled", reason: initialDecision.reason };
    const settings = options.loadGeneralSettings();
    const target = settings.proactiveDeliveryTarget;
    const result = await routeProactiveDelivery(target, {
      commitLocal: () => commitLocalProactiveMessage(input),
      commitChannel: async (channel) => {
        const channelResult = await sendProactiveChannelMessage({
          channel,
          text: input.text,
          mobileMessageSegmentation: settings.mobileMessageSegmentation,
          manager: channelManager,
          canContinue: () => {
            if (options.loadGeneralSettings().proactiveDeliveryTarget !== channel) return false;
            return getProactiveCommitDecision(input.candidate, input.generationEpoch, input.signal).allowed;
          },
        });
        return channelResult.kind === "committed"
          ? { kind: "committed" }
          : { kind: "cancelled", reason: channelResult.reason };
      },
    });

    // Already-started sends are awaited and recorded by the channel delivery log.
    // A cancelled generation must not publish a new successful whole-message commit.
    if (closed || input.signal.aborted) return { kind: "cancelled", reason: "generation_cancelled", ...(result.kind === "committed" ? { deliveryCommitted: true as const } : {}) };
    if (result.kind === "committed") recordProactiveDeliveryMetadata(input);
    return result;
  }

  function initializeProactiveChatService(): void {
    proactiveChatService = createProactiveChatService({
      loadState: loadProactiveState,
      saveState: (state) => {
        saveProactiveState(state);
      },
      getSnapshot: getProactiveRuntimeSnapshot,
      buildMessages: async (candidate, state, signal) => {
        const epoch = state.proactiveEpoch;
        const messages = await buildProactiveAgentMessages(candidate);
        generations.set(messages, { candidate, epoch, signal });
        return messages;
      },
      runModel: async (messages, signal) => {
        const savedSettings = loadModelSettings();
        const profile = getDefaultModelProfile(savedSettings);
        const settings = resolveModelSettingsProfile(savedSettings);
        const customMode = getCustomEndpointMode(settings.provider), keyOptional = customMode !== null && getCustomEndpointPresentation(customMode).apiKeyOptional;
        if (!keyOptional && !settings.apiKey?.trim()) return { kind: "error", reason: "missing_api_key" };
        const vendorConfig = { provider: settings.provider, baseUrl: settings.baseUrl, model: settings.model,
          apiKey: settings.apiKey, explicitTransport: settings.explicitTransport, reasoning: settings.reasoning };
        if (options.memoryHost) {
          if (!profile) return { kind: "error", reason: "MEMORY_RUN_PROFILE_DENIED" };
          const generation = generations.get(messages), source = {};
          if (!generation || generation.signal !== signal || generation.epoch !== loadProactiveState().proactiveEpoch || closed || signal.aborted)
            return { kind: "error", reason: "MEMORY_CONTEXT_CANCELLED" };
          const runId = randomUUID(), instructionText = messages.filter(message => message.role === "user").map(message => message.content).join("\n");
          sources.add(source);
          let prepared: BackgroundMemoryPreparedRun | undefined, memoryRun: MainMemoryRun | undefined;
          try {
            const ingress = issuer.capture({ source, sessionId: "proactive-memory-v1", sourceKey: "proactive-trigger-v1", instructionText, signal });
            prepared = await options.memoryHost.prepareBackgroundRun({ ingress, modelProfileId: profile.id, runId,
              userTurnId: `${runId}-instruction`, assistantTurnId: `${runId}-assistant`, instructionText, signal });
            memoryRun = await prepared.openMemoryRun({ settings: { ...vendorConfig, contextWindowTokens: settings.contextWindowTokens },
              messages, runId, conversationId: prepared.sessionId, signal: prepared.signal, transcriptSink: prepared.transcriptSink,
              toolSystemContent: "", soulSystemBaseContent: "", timeoutMs: 45_000 });
            return await runProactiveModel({ settings: vendorConfig, messages, timeoutMs: 45_000, signal: prepared.signal, memoryRun, transcriptSink: prepared.transcriptSink });
          } catch (error) {
            return { kind: "error", reason: error instanceof Error && /^MEMORY_[A-Z0-9_]+$/.test(error.message) ? error.message : "memory_runtime_error" };
          } finally {
            try { await memoryRun?.close(); } finally { await prepared?.close(); sources.delete(source); }
          }
        }
        return runProactiveModel({
          signal,
          settings: {
            provider: settings.provider,
            baseUrl: settings.baseUrl,
            model: settings.model,
            apiKey: settings.apiKey,
            explicitTransport: settings.explicitTransport,
            reasoning: settings.reasoning,
          },
          messages,
          timeoutMs: 45_000,
        });
      },
      // Opener 的 preset fallback 已移除：model 失败时由 proactive-service 自身走 cancel 路径。
      getFallback: async () => null,
      canStartDelivery: () => {
        const target = options.loadGeneralSettings().proactiveDeliveryTarget;
        return target === "local" || canStartProactiveChannelDelivery(target, channelManager);
      },
      commitMessage: commitSelectedProactiveMessage,
      log: (event, detail) => console.log(`[Proactive] ${event}`, detail ?? ""),
    });

    setChannelsConversationLifecycle(proactiveConversationLifecycle);

    powerMonitor.on("lock-screen", () => {
      proactiveScreenLocked = true;
      proactiveChatService?.invalidate();
    });
    powerMonitor.on("unlock-screen", () => { proactiveScreenLocked = false; });
    powerMonitor.on("suspend", () => {
      proactiveScreenLocked = true;
      proactiveChatService?.invalidate();
    });
    powerMonitor.on("resume", () => { proactiveScreenLocked = false; });
  }

  function initializeProactiveTrigger(): void {
    if (proactiveTrigger) return; // 幂等
    if (!proactiveChatService) {
      console.warn("[Proactive] trigger skipped: service not initialized");
      return;
    }
    const service = proactiveChatService;
    proactiveTrigger = createProactiveTrigger({
      evaluateCandidate: (c) => service.evaluateCandidate(c),
      getRuntimeSnapshot: getProactiveRuntimeSnapshot,
      getProactiveState: loadProactiveState,
      getTimezone: () => resolveChatContextTimezone(loadUserProfile().timezone),
      // getWeatherContext 第一版不传：未来天气缓存接入后填，函数体无需改
      getLastEvaluatedAtByScene: () => new Map(proactiveBackoffMap),
      setLastEvaluatedAtByScene: (next) => {
        proactiveBackoffMap.clear();
        for (const [k, v] of next) proactiveBackoffMap.set(k, v);
      },
    });
    proactiveTrigger.start();
  }

  function stopProactiveTrigger(): void {
    proactiveTrigger?.stop();
    proactiveTrigger = null;
  }

  return {
    initializeProactiveChatService,
    initializeProactiveTrigger,
    stopProactiveTrigger,
    async close(): Promise<void> { closed = true; stopProactiveTrigger(); await proactiveChatService?.close(); },
    getProactiveChatService: () => proactiveChatService,
    proactiveConversationLifecycle,
  };
}
