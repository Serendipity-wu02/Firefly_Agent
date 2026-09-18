import { ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels";
import type { ChatMessage } from "../../shared/chat-types";
import type { IAgentCore } from "../../shared/agent-core";
import { CharacterPolicyEngine } from "../character/character-policy";
import type { EmbodimentPlan } from "../character/embodiment-types";
import type { FireflyMemoryService } from "../memory/memory-service";
import {
  createMusicControlExecutionRequirement,
  isAmbiguousMusicControlRequest,
  resolveMusicControlExecution,
  resolveMusicControlIntent,
} from "../orchestrator/tools/music-control-intent";
import {
  createBrowserReadExecutionRequirement,
  resolveBrowserReadExecution,
  resolveBrowserReadIntent,
} from "../browser/browser-read-intent";
import { extractBrowserUserTargetUrls } from "../browser/browser-user-targets";
import { emitDiagnosticTrace, summarizeBrowserUrl } from "../diagnostics/diagnostic-trace";
import { ChatHistoryStore } from "./chat-history";

export interface ChatIpcOptions {
  sendToPet?: (channel: string, payload?: unknown) => void;
  onEmbodimentPlan?: (plan: EmbodimentPlan) => void;
  onChatInFlight?: (active: boolean) => void;
  memoryService?: FireflyMemoryService;
}

export function registerChatIpc(
  agentCore: IAgentCore,
  options?: ChatIpcOptions | ((channel: string, payload?: unknown) => void),
): () => void {
  const sendToPet = typeof options === "function" ? options : options?.sendToPet;
  const onEmbodimentPlan = typeof options === "object" ? options?.onEmbodimentPlan : undefined;
  const onChatInFlight = typeof options === "object" ? options?.onChatInFlight : undefined;
  const memoryService = typeof options === "object" ? options?.memoryService : undefined;
  const historyStore = new ChatHistoryStore();

  const seedSubmittedHistoryIfEmpty = (submittedHistory: ChatMessage[] | undefined): void => {
    if (historyStore.getMessages().length !== 0 || !submittedHistory || submittedHistory.length === 0) return;
    historyStore.replace(submittedHistory);
  };

  const appendUserTurn = (message: string): void => {
    const lastMessage = historyStore.getMessages().at(-1);
    if (lastMessage?.role === "user" && lastMessage.content === message) return;
    historyStore.append({
      id: `chat-user-${Date.now()}`,
      role: "user",
      content: message,
      timestamp: Date.now(),
    });
  };

  const appendFailureMessage = (status: string | undefined, error: string | undefined): void => {
    historyStore.append({
      id: `chat-error-${Date.now()}`,
      role: "assistant",
      content: `❌ 流萤这次没能回应（${status ?? "error"}）。${error ? `原因：${error}` : "未收到有效回复，请检查模型连接设置后重试。"}`,
      timestamp: Date.now(),
    });
  };

  ipcMain.handle(IPC.CHAT_GET_HISTORY, () => historyStore.getMessages());

  ipcMain.handle(
    IPC.CHAT_SEND_MESSAGE,
    async (_event, payload: { message: string; history?: ChatMessage[] }) => {
      onChatInFlight?.(true);
      // The renderer history is only an initial seed for the first request in
      // this process. Once Main owns a transcript, renderer submissions can
      // never overwrite it after a close/reopen or a restore race.
      seedSubmittedHistoryIfEmpty(payload.history);
      appendUserTurn(payload.message);
      const effectiveHistory = historyStore.getMessages();
      try {
        if (memoryService && payload.message) {
          const extracted = memoryService.extractFromText(payload.message);
          for (const item of extracted) {
            memoryService.remember(item.key, item.value, "chat_auto_extract");
          }
        }
      const policyEngine = CharacterPolicyEngine.getInstance();

      console.log(`[Harness Trace] main.chat.received prompt="${payload.message}"`);
      // 1. Unified Behavior Decision
      const behaviorDecision = policyEngine.decideBehavior({
        userPrompt: payload.message,
        mode: "daily",
      });

      const musicControlIntent = resolveMusicControlIntent(payload.message);
      if (isAmbiguousMusicControlRequest(payload.message)) {
        const replyText = policyEngine.createMusicControlClarification();
        const embodimentPlan = policyEngine.createEmbodimentPlan(
          behaviorDecision,
          replyText,
        );
        if (embodimentPlan.requiresEmbodiment && embodimentPlan.visual && sendToPet) {
          const { target } = embodimentPlan.visual;
          const durationMs = embodimentPlan.visual.durationMs ?? 5000;
          sendToPet(IPC.LIVE2D_PLAY_ACTION, {
            ...target,
            durationMs,
            behaviorDurationMs: durationMs,
            correlationId: embodimentPlan.correlationId,
            behaviorType: embodimentPlan.behaviorType,
          });
        }
        console.log(
          `[Music Control Trace] state=ambiguous_direction toolCallId=none ` +
          `prompt="${payload.message}"`,
        );
        onEmbodimentPlan?.(embodimentPlan);
        historyStore.append({
          id: `chat-assistant-${Date.now()}`,
          role: "assistant",
          content: replyText,
          timestamp: Date.now(),
          behaviorType: embodimentPlan.behaviorType,
          correlationId: embodimentPlan.correlationId,
          voiceIntent: embodimentPlan.voice.voiceIntent,
          prosodyHint: embodimentPlan.voice.prosodyHint,
        });
        return {
          ok: true as const,
          status: "completed" as const,
          replyText,
          history: historyStore.getMessages(),
          toolCalled: false,
          embodimentPlan,
          correlationId: embodimentPlan.correlationId,
        };
      }

      // 2. Agent Core LLM Execution
      console.log(`[Harness Trace] agent.start prompt="${payload.message}"`);
      const browserRequestTargets = extractBrowserUserTargetUrls(payload.message);
      const browserReadIntent = resolveBrowserReadIntent(
        payload.message,
        browserRequestTargets,
      );
      emitDiagnosticTrace(
        `[Browser Trace] user-targets count=${browserRequestTargets.length}`
          + ` urls=${browserRequestTargets.map(summarizeBrowserUrl).join(",") || "none"}`,
      );
      const browserExecutionRequirement = browserReadIntent?.targetUrls.length === 1
        ? createBrowserReadExecutionRequirement(browserReadIntent.targetUrls[0])
        : undefined;
      const result = await agentCore.run({
        source: "user",
        userPrompt: payload.message,
        history: effectiveHistory,
        browserRequestTargets,
        executionProfile: { kind: "MAIN", allowSubAgentDelegation: true },
        ...(musicControlIntent !== undefined
          ? {
              requiredToolExecution: createMusicControlExecutionRequirement(musicControlIntent),
            }
          : browserExecutionRequirement === undefined
            ? {}
            : { requiredToolExecution: browserExecutionRequirement }),
      });
      console.log(
        `[Harness Trace] agent.complete status=${result.status} text="${result.finalText?.slice(0, 30)}..."`,
      );

      // 3. Real Agent failure must be reported as failure, never disguised as a persona reply.
      //    On failure we do NOT dispatch Live2D visuals and do NOT update Mood state.
      if (result.status !== "completed") {
        console.error(
          `[Harness Trace] agent.failed status=${result.status} error="${result.error ?? "unknown"}"`,
        );
        appendFailureMessage(result.status, result.error);
        return {
          ok: false as const,
          status: result.status,
          error: result.error,
          replyText: "",
          history: historyStore.getMessages(),
          toolCalled: false,
          embodimentPlan: undefined,
          correlationId: undefined,
        };
      }

      if (!result.finalText?.trim()) {
        console.warn("[Harness Trace] agent.empty_output");
        appendFailureMessage("empty_output", "模型返回了空文本");
        return {
          ok: false as const,
          status: "empty_output",
          error: "模型返回了空文本",
          replyText: "",
          history: historyStore.getMessages(),
          toolCalled: false,
          embodimentPlan: undefined,
          correlationId: undefined,
        };
      }

      const musicControlResolution = musicControlIntent === undefined
        ? undefined
        : resolveMusicControlExecution(musicControlIntent, result);
      const browserReadResolution = musicControlIntent === undefined && browserReadIntent !== undefined
        ? resolveBrowserReadExecution(browserReadIntent, result)
        : undefined;
      if (browserReadResolution !== undefined) {
        console.log(
          `[Browser Truth Trace] runId=${browserReadResolution.runId} `
            + `state=${browserReadResolution.state} `
            + `targetCount=${browserReadResolution.targetUrls.length} `
            + `toolCallId=${browserReadResolution.toolCallId ?? "none"}`,
        );
      }
      const replyText = musicControlResolution?.replyText
        ?? browserReadResolution?.replyText
        ?? result.finalText;
      if (musicControlResolution !== undefined) {
        console.log(
          `[Music Control Trace] runId=${musicControlResolution.runId} ` +
          `action=${musicControlResolution.intent.action} state=${musicControlResolution.state} ` +
          `toolCallId=${musicControlResolution.toolCallId ?? "none"}`,
        );
      }

      // 4. Compile Unified EmbodimentPlan with generated reply text
      const embodimentPlan = policyEngine.createEmbodimentPlan(
        behaviorDecision,
        replyText,
      );

      // 5. Dispatch Visual Embodiment Target to Live2D Window (if enabled) with correlationId
      if (embodimentPlan.requiresEmbodiment && embodimentPlan.visual && sendToPet) {
        const { target } = embodimentPlan.visual;
        const durationMs = embodimentPlan.visual.durationMs ?? 5000;
        sendToPet(IPC.LIVE2D_PLAY_ACTION, {
          ...target,
          durationMs,
          behaviorDurationMs: durationMs,
          correlationId: embodimentPlan.correlationId,
          behaviorType: embodimentPlan.behaviorType,
        });
      }
      console.log(
        `[Presentation Trace] prompt="${payload.message}" behavior=${embodimentPlan.behaviorType} correlationId=${embodimentPlan.correlationId}`,
      );

      onEmbodimentPlan?.(embodimentPlan);

      if (replyText) {
        historyStore.append({
          id: `chat-assistant-${Date.now()}`,
          role: "assistant",
          content: replyText,
          timestamp: Date.now(),
          behaviorType: embodimentPlan.behaviorType,
          correlationId: embodimentPlan.correlationId,
          voiceIntent: embodimentPlan.voice.voiceIntent,
          prosodyHint: embodimentPlan.voice.prosodyHint,
        });
      }

      return {
        ok: true as const,
        status: result.status,
        replyText,
        history: historyStore.getMessages(),
        toolCalled: result.toolCallsCount > 0,
        embodimentPlan,
        correlationId: embodimentPlan.correlationId,
      };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        historyStore.append({
          id: `chat-error-${Date.now()}`,
          role: "assistant",
          content: `❌ ${message || "与流萤交流时发生异常"}`,
          timestamp: Date.now(),
        });
        throw error;
      } finally {
        onChatInFlight?.(false);
      }
    },
  );

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    ipcMain.removeHandler(IPC.CHAT_SEND_MESSAGE);
    ipcMain.removeHandler(IPC.CHAT_GET_HISTORY);
  };
}
