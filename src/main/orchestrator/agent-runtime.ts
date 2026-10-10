import {createAttachmentDocumentMaterializer} from "../memory-context/attachment-document-materializer";
import type {BackgroundMemoryHost} from "../memory-context/background-memory-ingress";
import type {MainMemoryRun} from "../memory-context/main-memory-runtime";
import { app } from "electron";
import {copyControlledStreamTarget} from "./controlled-responses";
import type {ChatRequest} from "./vendors/types";
import type {AgentLoopResult} from "./firefly-agent";
import {copyMainResponsesRequest} from "./vendors/response-request-snapshot";
import type {MainSRuntimePort,MainSRuntimeInput,MainSRuntimeResult} from "../memory-context/main-s-runtime-port";
import { loadPromptFile } from "../prompts/prompt-loader";
import type { AguiRunInput, BuildOptionsFn, MainBuildOptionsContext } from "../agui-bridge";
import type { ScheduledTask } from "../scheduler/types";
import type { ChannelId } from "../channels/types";
import type { ModelSettings } from "../settings/model-settings";
import type { GeneralSettings } from "../settings/general-settings";
import type { UserProfile } from "../settings-store";
import { resolveCaptionVisionConfig } from "./image-router";
import { getTimeoutSettings } from "../timeout-manager";
import { resolveModelSettingsProfile, getDefaultModelProfile } from "../settings/model-settings";
import { normalizeChatMessages } from "../chat-api-utils";
import { parseObserverFeeling } from "../chat-stream-utils";
import { captionImageSafe, IMAGE_CAPTION_PROMPT } from "../chat/image-caption";
import { buildEnvironmentContext } from "./environment";
import { buildToneInjection } from "./tone-injector";
import { buildAlwaysOnContext, buildWorldbookContext, scheduleMemoryWrite } from "./index";
import { matchSticker } from "../sticker-embedder";
import { buildRelationshipContext, recordRelationshipTurn } from "../relationship/relationship-log";
import { compileSocialContextBlock } from "../social-context/context";
import { rankSocialAtoms } from "../social-context/retrieval";
import {
  buildSkillCatalog,
  buildAutoInjectedSkillContext,
  buildAutoInjectedSoulContext,
  skillRegistry,
} from "../skills";
import { feelingToExpression } from "../runtime-state";
import { resolveSlashActivation } from "../skills/slash-activation";
import type { CitaService } from "../cita";
import type { SocialAtom, SocialExtractionInput } from "../social-context/types";
import type { ToolDefinition, ToolModeOverrides } from "./tools/registry/tool-registry";
import type { ConversationMode } from "../../shared/chat-types";
import {
  buildAgentRunOptions,
  onAgentRunFinished,
  type BuildOptionsDeps,
  type OnRunFinishedDeps,
  type ModelSettingsLite,
} from "./build-options";
import { buildModelContext } from "./conversation-transcript-context";
import { getConversationTranscriptStore } from "./conversation-transcript-store";
import { getHarnessRunStore } from "./harness/run-store";
import { type FireflyRunResult, type FireflyRunOptions } from "./firefly-agent";
import type { HarnessToolFinishedEvent } from "./harness/types";
import type { ToolFinishedInput } from "../plugin-host/lifecycle-publisher";
import {
  buildToolSystemPrompt,
  buildSoulSystemBasePrompt,
  readStylePrompt,
  resolveSoulSamplingForStyle,
  loadSoulFeelingContext,
} from "./system-prompt-builder";
import { buildModePrompt } from "./mode-prompt-profile";
import { resolveRunCapabilities } from "./run-capabilities";
import { loadStickerSettings } from "./sticker-settings";
import type { RuntimeStateService } from "./runtime-state-service";
import type { LlmClient } from "../services/llm/llm-client";
import type {
  PluginTurnCompletedEvent,
  PluginPromptBuildInput,
  PluginPromptMode,
} from "../../plugins/types";

type EnqueueLLMTask = <T>(
  label: string,
  task: () => Promise<T>,
  options?: { log?: boolean; retryRateLimit?: boolean },
) => Promise<T>;

export interface AgentRuntimeDeps {
  /** Main composition only. Run identity and sink are finalized before invocation. */
  defaultMemory?:{openRun:(input:FireflyRunOptions)=>Promise<MainMemoryRun>;prepareBackgroundRun?:BackgroundMemoryHost["prepareBackgroundRun"]};
  /** Main-only opt-in injection. No product registration or initialization by default. */
  sContext?: {enabled?:boolean;isControlledSession?:(conversationId:string)=>boolean;createPort:(scope?:Readonly<{conversationId:string}>)=>MainSRuntimePort|Promise<MainSRuntimePort>;streamRequest?:(options:FireflyRunOptions)=>ChatRequest};
  runtimeStateService: RuntimeStateService;
  llmClient: LlmClient;
  enqueueLLMTask: EnqueueLLMTask;
  loadModelSettings: () => ModelSettings;
  loadGeneralSettings: () => GeneralSettings;
  loadUserProfile: () => UserProfile;
  toolRegistry: {
    getEnabledTools: () => ToolDefinition[];
    getEnabledToolsForMode: (mode: ConversationMode, overrides?: ToolModeOverrides) => ToolDefinition[];
  };
  skillRegistry: typeof skillRegistry;
  getStickerEmbeddingIndex: () => unknown;
  getEmbeddingProvider: () => unknown;
  broadcastRuntimeStateChanged: () => void;
  citaService: CitaService;
  socialContextScheduler: { schedule: (input: SocialExtractionInput) => void };
  chatsStore: { getWorkspaceBinding: (conversationId: string) => { workspaceRoot: string; displayName: string; boundAt: number } | undefined };
  socialAtomStore: { listActive: (conversationId: string, now: number) => SocialAtom[] };
  buildPluginPromptContext: (input: PluginPromptBuildInput) => Promise<string>;
  publishPluginHostEvent: <T>(event: string, payload: T) => Promise<void>;
  /** 工具完成事件发布入口；缺省不发布（早期装配与测试场景）。 */
  publishToolFinished?: (event: ToolFinishedInput) => void;
}

type SchedulerRunOptions = Omit<FireflyRunOptions, "toolSystemContent" | "soulSystemBaseContent">;

export interface AgentRunFinishedContext {
  source: PluginTurnCompletedEvent["source"];
  mode: PluginPromptMode;
  conversationId: string;
  channel?: string;
  runId?: string;
  modelProfileId?: string;
}

export interface AgentRuntime {
  /** Default-disabled controlled Main entry; production wiring does not provision it. */
  runSContext(input:MainSRuntimeInput):Promise<MainSRuntimeResult>;
  buildOptions: BuildOptionsFn;
  onRunFinished(result: FireflyRunResult, latestUserText: string, context: AgentRunFinishedContext): Promise<{ sticker: string | null }>;
  buildSchedulerOptions(task: ScheduledTask): Promise<SchedulerRunOptions>;
}

export function createAgentRuntime(rawDeps: AgentRuntimeDeps): AgentRuntime {
  const runtimeStateService = rawDeps.runtimeStateService;
  const backgroundMemory:BackgroundMemoryHost|undefined=rawDeps.defaultMemory?.prepareBackgroundRun?{prepareBackgroundRun:input=>rawDeps.defaultMemory!.prepareBackgroundRun!(input)}:undefined;
  const legacyPersonalTools=new Set(["user_memory","read_memory","write_memory","recall_history"]);
  const toolRegistry=rawDeps.defaultMemory?{
    getEnabledTools:()=>rawDeps.toolRegistry.getEnabledTools().filter(tool=>!legacyPersonalTools.has(tool.id)),
    getEnabledToolsForMode:(mode:ConversationMode,overrides?:ToolModeOverrides)=>rawDeps.toolRegistry.getEnabledToolsForMode(mode,overrides).filter(tool=>!legacyPersonalTools.has(tool.id)),
  }:rawDeps.toolRegistry;
  const sPorts=new Map<string|undefined,Promise<MainSRuntimePort>>();
  function provisionSPort(conversationId?:string):Promise<MainSRuntimePort> {
    const injection=rawDeps.sContext;
    if(injection?.enabled!==true)throw Error("MEMORY_CONTEXT_RUNTIME_DISABLED");
    let port=sPorts.get(conversationId);
    if(!port){
      const scope=conversationId===undefined?undefined:Object.freeze({conversationId});
      port=Promise.resolve().then(()=>injection.createPort(scope));
      sPorts.set(conversationId,port);
    }
    return port;
  }
  function mainSessionId(input:AguiRunInput):string {
    const session=Object.getOwnPropertyDescriptor(input,"sessionId");
    if(!session||!("value" in session)||typeof session.value!=="string"||!session.value||session.value.length>256||/[\u0000-\u001f\u007f]/.test(session.value))throw Error("MEMORY_CONTEXT_STREAM_TARGET_INVALID");
    return session.value;
  }
  function selectedSInput(injection:NonNullable<AgentRuntimeDeps["sContext"]>,input:AguiRunInput):boolean {
    const selector=Object.getOwnPropertyDescriptor(injection,"isControlledSession");
    if(!selector)return true;
    if(!("value" in selector)||typeof selector.value!=="function")throw Error("MEMORY_CONTEXT_STREAM_TARGET_INVALID");
    const selected=selector.value(mainSessionId(input));
    if(typeof selected!=="boolean")throw Error("MEMORY_CONTEXT_STREAM_TARGET_INVALID");
    return selected;
  }
  async function prepareTranscript(input:AguiRunInput):Promise<void> {
    const injection=rawDeps.sContext;
    if(injection?.enabled!==true||!selectedSInput(injection,input))return;
    const builder=Object.getOwnPropertyDescriptor(injection,"streamRequest");
    if(builder&&!("value" in builder)||builder?.value!==undefined&&typeof builder.value!=="function")throw Error("MEMORY_CONTEXT_STREAM_TARGET_INVALID");
    if(builder?.value!==undefined){
      await provisionSPort(mainSessionId(input));
    }
  }
  async function runSContext(input:MainSRuntimeInput):Promise<MainSRuntimeResult>{
    const injection=rawDeps.sContext;
    if(injection?.enabled!==true)throw Error("MEMORY_CONTEXT_RUNTIME_DISABLED");
    const signalField=Object.getOwnPropertyDescriptor(input,"signal");
    if(signalField&&!("value" in signalField))throw Error("MEMORY_CONTEXT_COUNTER_UNSUPPORTED");
    const signal=signalField?.value as AbortSignal|undefined;
    if(signal?.aborted)throw Error("MEMORY_CONTEXT_CANCELLED");
    const requestField=Object.getOwnPropertyDescriptor(input,"request");
    if(!requestField||!("value" in requestField))throw Error("MEMORY_CONTEXT_COUNTER_UNSUPPORTED");
    const streamField=Object.getOwnPropertyDescriptor(input,"stream");
    if(streamField&&!("value" in streamField))throw Error("MEMORY_CONTEXT_STREAM_TARGET_INVALID");
    const snapshot:MainSRuntimeInput={request:copyMainResponsesRequest(requestField.value),signal,...(streamField?.value!==undefined?{stream:copyControlledStreamTarget(streamField.value)}:{})};
    // Store the promise before provisioning, including a failure; never silently retry/fallback.
    const port=await provisionSPort(snapshot.stream?.conversationId);
    if(signal?.aborted)throw Error("MEMORY_CONTEXT_CANCELLED");
    return port.run(snapshot);
  }

  async function observeRuntimeState(
    settings: ModelSettingsLite,
    _recentMessages: ReadonlyArray<{ role: "system" | "user" | "assistant"; content: string }>,
    _latestUserText: string,
    chatContent: string,
    profileSelection: "conversation" | "default",
  ): Promise<void> {
    let serviceUrlValid = false;
    try {
      const url = new URL(settings.baseUrl);
      serviceUrlValid = url.protocol === "http:" || url.protocol === "https:";
    } catch {
      serviceUrlValid = false;
    }
    if (!settings.model.trim() || !serviceUrlValid) {
      console.warn("[Firefly] mood observation unavailable: selected model profile has no valid model or service URL");
      return;
    }
    const recentDialogue = [{ role: "assistant" as const, content: chatContent }];
    console.info("[Firefly] mood observation request", { profileSelection, transport: settings.explicitTransport ?? "unspecified" });

    await rawDeps.enqueueLLMTask(
      "心情观察器",
      async () => {
        const observerContent = await rawDeps.llmClient.chat(
          settings as ModelSettings,
          [
            {
              role: "system",
              content:
                "你是一个情绪分析器。以下是流萤的人格设定：\n\n" +
                loadSoulFeelingContext() +
                "\n\n根据以上人格设定和以下对话，判断流萤当前的心情状态。可选心情值（只能选其中一个）：平静 / 开心 / 温柔 / 激动 / 撒娇 / 担心 / 难过 / 感动 / 害羞。只返回 JSON，不要任何多余文字：{\"feeling\": \"心情值\"}。判断规则：以最后一轮对话为主，之前几轮为辅；判断的是流萤的心情，不是用户的心情；无法判断时返回 平静。",
            },
            {
              role: "user",
              content: JSON.stringify({ recentDialogue }),
            },
          ],
          undefined,
          30000,
          "心情观察器",
          false,
        );
        const feeling = parseObserverFeeling(observerContent);
        if (feeling) {
          runtimeStateService.smoothFeeling(feeling);
          console.info("[Firefly] mood observation applied");
        } else {
          console.warn("[Firefly] mood observation returned no recognized feeling");
        }
      },
      { log: false },
    ).catch((err) => {
      console.warn("[Firefly] observe runtime failed; keeping current feeling:", err);
    });
  }

  function buildBuildOptionsDeps(): BuildOptionsDeps {
    return {
      loadModelSettings: (modelProfileId?: string) => resolveModelSettingsProfile(rawDeps.loadModelSettings(), modelProfileId),
      loadGeneralSettings: () => rawDeps.loadGeneralSettings(),
      loadUserProfile: () => rawDeps.loadUserProfile(),
      buildEnvironmentContext: ((model, profile) =>
        buildEnvironmentContext(model, profile as any)) as BuildOptionsDeps["buildEnvironmentContext"],
      buildSkillCatalog: ((skills) =>
        buildSkillCatalog(skills as any)) as BuildOptionsDeps["buildSkillCatalog"],
      buildAutoInjectedSkillContext: ((skills) =>
        buildAutoInjectedSkillContext(skills as any, (id) =>
          rawDeps.skillRegistry.getBody(id),
        )) as BuildOptionsDeps["buildAutoInjectedSkillContext"],
      buildAutoInjectedSoulContext: ((skills) =>
        buildAutoInjectedSoulContext(skills as any, (id) =>
          rawDeps.skillRegistry.getBody(id),
        )) as BuildOptionsDeps["buildAutoInjectedSoulContext"],
      skillRegistry: {
        getEnabled: () => rawDeps.skillRegistry.getEnabled() as unknown[],
        getEnabledForMode: (mode, overrides) =>
          rawDeps.skillRegistry.getEnabledForMode(mode, overrides) as unknown[],
        getBody: (id) => rawDeps.skillRegistry.getBody(id),
      },
      resolveSlashActivation: ((messages, mode, overrides) =>
        resolveSlashActivation(messages as any, mode, overrides)) as BuildOptionsDeps["resolveSlashActivation"],
      buildToneInjection: (() => buildToneInjection()) as BuildOptionsDeps["buildToneInjection"],
      buildAlwaysOnContext: ((userText, messages) =>
        (rawDeps.defaultMemory?buildWorldbookContext:buildAlwaysOnContext)(userText, messages as any)) as BuildOptionsDeps["buildAlwaysOnContext"],
      buildRelationshipContext,
      buildModePrompt,
      buildToolSystemPrompt: ((mode, enabledTools) =>
        buildToolSystemPrompt(mode, enabledTools as ToolDefinition[])) as BuildOptionsDeps["buildToolSystemPrompt"],
      buildSoulSystemBasePrompt,
      resolveRunCapabilities: ({ mode, activeSearchBackend, toolModeOverrides, skillModeOverrides, chatToolsEnabled }) => resolveRunCapabilities({
        mode, activeSearchBackend, toolModeOverrides, skillModeOverrides, chatToolsEnabled,
        toolRegistry,
        skillRegistry: rawDeps.skillRegistry,
      }),
      readStylePrompt,
      resolveSoulSampling: resolveSoulSamplingForStyle,
      toolRegistry: {
        getEnabled: () => toolRegistry.getEnabledTools() as unknown[],
        getEnabledToolsForMode: (mode: ConversationMode, overrides?: ToolModeOverrides) =>
          toolRegistry.getEnabledToolsForMode(mode, overrides) as unknown[],
      },
      normalizeChatMessages: ((raw) =>
        normalizeChatMessages(raw as any)) as BuildOptionsDeps["normalizeChatMessages"],
      chatRequestTimeoutMs: getTimeoutSettings().chatRequestTimeout,
      captionImageForFallback: async (filePath: string) => {
        // 走注入的设置加载（与 buildSchedulerOptions 同策略），保证可测且不绕过依赖装配
        const settings = resolveModelSettingsProfile(rawDeps.loadModelSettings());
        const vision = resolveCaptionVisionConfig(settings);
        if (!vision.ok) return { ok: false, error: vision.error };
        return captionImageSafe(filePath, IMAGE_CAPTION_PROMPT, vision.config);
      },
      prepareCitaTurn: (input) => rawDeps.citaService.prepareTurn(input),
      buildChatSocialContext: async ({ conversationId, query }) => {
        const now = Date.now();
        const active = rawDeps.socialAtomStore.listActive(conversationId, now);
        const retrievedAtoms = rankSocialAtoms(query, active, { now, limit: 5 });
        return {
          contextBlock: compileSocialContextBlock(retrievedAtoms),
          retrievedAtoms,
        };
      },
      getWorkspaceBinding: (conversationId: string) => {
        return rawDeps.chatsStore.getWorkspaceBinding(conversationId);
      },
      buildPluginPromptContext: (input) => rawDeps.buildPluginPromptContext(input),
      // 权威轨迹上下文（CTA Phase 1）：桌面端与 bridge 共用同一 userData 根下的单例 store
      buildModelContext: (conversationId, retainTokens) => buildModelContext({
        store: getConversationTranscriptStore(app.getPath("userData")),
        conversationId,
        retainTokens,
        runReader: getHarnessRunStore(app.getPath("userData")),
      }),
    };
  }

  function buildOnRunFinishedDeps(modelProfileId?: string): OnRunFinishedDeps {
    return {
      loadModelSettings: () => resolveModelSettingsProfile(rawDeps.loadModelSettings(), modelProfileId),
      scheduleMemoryWrite,
      ...(rawDeps.defaultMemory?{personalMemoryMode:"smh" as const}:{}),
      scheduleSocialAtomExtraction: (input) => rawDeps.socialContextScheduler.schedule(input),
      inferRuntimeState: ((userText, reply, flag) =>
        runtimeStateService.inferFromText(userText, reply, flag)) as OnRunFinishedDeps["inferRuntimeState"],
      runtimeState: runtimeStateService.getState(),
      feelingToExpression,
      setRuntimeState: ((next) =>
        runtimeStateService.setStateWithoutNotify(next as any)) as OnRunFinishedDeps["setRuntimeState"],
      stickerEmbeddingIndex: rawDeps.getStickerEmbeddingIndex(),
      getEmbeddingProvider: (() => rawDeps.getEmbeddingProvider() as unknown) as OnRunFinishedDeps["getEmbeddingProvider"],
      matchSticker: ((text, provider, index, threshold) =>
        matchSticker(text, provider as any, index as any, threshold) as Promise<{
          id: string;
        } | null | undefined>) as OnRunFinishedDeps["matchSticker"],
      loadStickerSettings,
      broadcastRuntimeStateChanged: rawDeps.broadcastRuntimeStateChanged,
      observeRuntimeState: ((settings, history, userText, reply) =>
        observeRuntimeState(settings as ModelSettingsLite, history as any, userText, reply, modelProfileId ? "conversation" : "default")) as OnRunFinishedDeps["observeRuntimeState"],
      recordRelationshipTurn,
    };
  }

  // 工具完成观察回调：harness 事件结构与插件事件字段一一对应，直接透传；
  // 未配置发布入口时不注入，harness 侧零开销。
  const onToolFinished = rawDeps.publishToolFinished
    ? (event: HarnessToolFinishedEvent) => rawDeps.publishToolFinished!(event)
    : undefined;

  return {
    runSContext,
    buildOptions: Object.assign(async (input:AguiRunInput, mainContext?:MainBuildOptionsContext) => {
      // Capture the controlled Main scope and builder before the existing asynchronous options build.
      const injection=rawDeps.sContext;
      let controlled:{scope:{conversationId?:string;userTurnId?:string;assistantTurnId?:string};buildRequest:(options:FireflyRunOptions)=>ChatRequest}|undefined;
      if(injection?.enabled===true&&selectedSInput(injection,input)){
        const builder=Object.getOwnPropertyDescriptor(injection,"streamRequest");
        if(builder&&!("value" in builder))throw Error("MEMORY_CONTEXT_STREAM_TARGET_INVALID");
        if(builder?.value!==undefined){
          if(typeof builder.value!=="function")throw Error("MEMORY_CONTEXT_STREAM_TARGET_INVALID");
          const field=(key:"sessionId"|"userTurnId"|"assistantTurnId"):string|undefined=>{
            const descriptor=Object.getOwnPropertyDescriptor(input,key);
            if(descriptor&&!("value" in descriptor)||descriptor?.value!==undefined&&typeof descriptor.value!=="string")throw Error("MEMORY_CONTEXT_STREAM_TARGET_INVALID");
            return descriptor?.value;
          };
          controlled={scope:Object.freeze({conversationId:field("sessionId"),userTurnId:field("userTurnId"),assistantTurnId:field("assistantTurnId")}),buildRequest:builder.value};
        }
      }
      const buildOptionsDeps = buildBuildOptionsDeps();
      if(rawDeps.defaultMemory){
        buildOptionsDeps.requireAttachmentGrant=true;
        buildOptionsDeps.attachmentGrant=mainContext?.attachmentGrant;
        buildOptionsDeps.materializeAttachmentDocument=createAttachmentDocumentMaterializer();
        buildOptionsDeps.buildRelationshipContext=async()=>"";
        buildOptionsDeps.buildChatSocialContext=undefined;
        buildOptionsDeps.prepareCitaTurn=undefined;
      }
      if(controlled){
        buildOptionsDeps.buildAlwaysOnContext=async()=>"";
        buildOptionsDeps.buildRelationshipContext=async()=>"";
        buildOptionsDeps.buildChatSocialContext=async()=>({contextBlock:"",retrievedAtoms:[]});
        buildOptionsDeps.prepareCitaTurn=undefined;
      }
      const { options, latestUserText } = await buildAgentRunOptions(input, buildOptionsDeps);
      const next:FireflyRunOptions={...options,onToolFinished,...(backgroundMemory?{backgroundMemory}:{}),...(rawDeps.defaultMemory?{openMemoryRun:(current:FireflyRunOptions)=>rawDeps.defaultMemory!.openRun(current)}:{})};
      if(controlled){
        const {scope,buildRequest}=controlled;
        next.controlledResponses=async(current,signal,onEvent)=>{
          if(current.executionMode!=="chat"||current.tools?.length)throw Error("MEMORY_CONTEXT_STREAM_MODE_UNSUPPORTED");
          if(!scope.conversationId||!scope.userTurnId||!scope.assistantTurnId||!current.runId||!current.transcriptSink||!current.isControlledRunCurrent||current.conversationId!==scope.conversationId)throw Error("MEMORY_CONTEXT_STREAM_TARGET_INVALID");
          try{
            const sent=await runSContext({request:buildRequest(current),signal,stream:{...scope,conversationId:scope.conversationId,userTurnId:scope.userTurnId,assistantTurnId:scope.assistantTurnId,runId:current.runId,sink:current.transcriptSink,isCurrent:current.isControlledRunCurrent,onEvent}});
            if(sent.status!=="sent")throw Error("MEMORY_CONTEXT_SEND_UNKNOWN");return sent.result as AgentLoopResult;
          }catch(error){
            // Persistence uncertainty remains a runtime error even with an aborted outer signal.
            if(error instanceof Error&&error.message==="MEMORY_CONTEXT_SETTLEMENT_UNKNOWN")return {reply:"",toolResults:[],completionReason:"no_tool",terminal:{status:"runtime_error",reason:"MEMORY_CONTEXT_SETTLEMENT_UNKNOWN",externalEffectsMayContinue:false}};
            throw error;
          }
        };
      }
      return { options:next, latestUserText };
    },{prepareTranscript}),

    onRunFinished: async (result, latestUserText, context) => {
      const controlled=context.source==="desktop"&&context.mode==="chat"&&rawDeps.sContext?.enabled===true&&rawDeps.sContext.isControlledSession?.(context.conversationId)===true;
      const effects = controlled?{sticker:null}:await onAgentRunFinished(
        result,
        latestUserText,
        buildOnRunFinishedDeps(context.modelProfileId),
        context.channel as ChannelId | undefined,
        context.conversationId,
      );
      // 调用方应只在成功终态进入收尾；此处再守住插件事件契约，避免未来新增入口误报完成。
      const terminalStatus = result.terminal?.status;
      if (terminalStatus !== undefined && terminalStatus !== "success") {
        return effects;
      }
      const payload: PluginTurnCompletedEvent = {
        source: context.source,
        mode: context.mode,
        conversationId: context.conversationId,
        ...(context.channel ? { channel: context.channel } : {}),
        ...(context.runId ? { runId: context.runId } : {}),
      };
      // 插件监听器属于旁路扩展：不等待它们，避免第三方插件延迟主回复的终态事件。
      void rawDeps.publishPluginHostEvent("turn:completed", payload).catch((error) => {
        console.warn("[plugins] 发布对话轮次完成事件失败", error);
      });
      return effects;
    },

    buildSchedulerOptions: async (task) => {
      // 与 channel bot / 聊天路径同策略：先展开默认模型档案再取顶层镜像，
      // 否则用户只在档案里配模型时顶层 baseUrl/apiKey 可能为空，定时任务会调不到 LLM。
      const savedSettings=rawDeps.loadModelSettings(),modelProfile=getDefaultModelProfile(savedSettings);
      if(rawDeps.defaultMemory&&!modelProfile)throw Error("MEMORY_RUN_PROFILE_DENIED");
      const settings = resolveModelSettingsProfile(savedSettings,modelProfile?.id);
      const profile = rawDeps.loadUserProfile();
      const generalSettings = rawDeps.loadGeneralSettings();
      // 会话模式取任务冻结字段（旧任务默认 work）：skill 过滤、模式提示词
      // 和插件提示词上下文都跟随该模式。
      const mode = task.mode ?? "work";
      const messages = [{ role: "user" as const, content: task.prompt }];
      // 定时任务按任务模式过滤 skill，并尊重 skill-模式覆盖层；
      // 与聊天路径同约定：chat 模式不暴露 skill。
      const scheduledSkills = mode === "chat"
        ? []
        : rawDeps.skillRegistry.getEnabledForMode(mode, generalSettings.skillModeOverrides);
      const systemContent = [
        buildModePrompt(mode),
        buildEnvironmentContext({ provider: settings.provider, model: settings.model }, profile),
        buildSkillCatalog(scheduledSkills),
        await (rawDeps.defaultMemory?buildWorldbookContext:buildAlwaysOnContext)(task.prompt, messages),
        await rawDeps.buildPluginPromptContext({
          source: "scheduler",
          mode,
          userText: task.prompt,
        }),
      ].join("\n\n---\n\n");
      return {
        ...(modelProfile?{modelProfileId:modelProfile.id}:{}),
        ...(backgroundMemory?{backgroundMemory}:{}),
        settings: {
          provider: settings.provider,
          baseUrl: settings.baseUrl,
          model: settings.model,
          apiKey: settings.apiKey,
          // 协议与推理偏好需与聊天路径一致透传，否则定时任务会按默认协议发请求。
          explicitTransport: settings.explicitTransport,
          reasoning: settings.reasoning,
          contextWindowTokens: settings.contextWindowTokens,
        },
        messages: [{ role: "system" as const, content: systemContent }, ...messages],
        // 定时任务也不因整轮耗时被中断；仍保留单次模型/工具自身的超时。
        timeoutMs: 0,
        onToolFinished,
      };
    },
  };
}
