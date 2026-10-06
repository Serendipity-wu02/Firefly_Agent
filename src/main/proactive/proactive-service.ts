import type { ChatMessage } from "../orchestrator/vendors/types";
import {
  canCommitProactiveMessage,
  canStartProactiveGeneration,
  markNormalConversationEnded,
  markNormalConversationStarted,
  markProactiveCommitted,
  markUserActivity,
} from "./proactive-policy";
import type { ProactiveModelResult } from "./proactive-model";
import type { ProactiveCandidate, ProactiveRuntimeSnapshot, ProactiveState } from "./proactive-types";

export interface ProactiveFallback {
  text: string;
  payload?: unknown;
}

export interface ProactiveCommitInput {
  candidate: ProactiveCandidate;
  text: string;
  source: "model" | "fallback";
  fallbackPayload?: unknown;
  generationEpoch: number;
  /** The actual generation lifetime also governs every delivery boundary. */
  signal: AbortSignal;
}

export type ProactiveCommitResult =
  | { kind: "committed" }
  | { kind: "cancelled"; reason: string; deliveryCommitted?: true };

export interface ProactiveChatServiceDeps {
  loadState: () => ProactiveState;
  saveState: (state: ProactiveState) => void;
  getSnapshot: () => ProactiveRuntimeSnapshot;
  buildMessages: (candidate: ProactiveCandidate, state: ProactiveState, signal: AbortSignal) => Promise<ChatMessage[]>;
  runModel: (messages: ChatMessage[], signal: AbortSignal) => Promise<ProactiveModelResult>;
  getFallback: (candidate: ProactiveCandidate) => Promise<ProactiveFallback | null>;
  commitMessage: (input: ProactiveCommitInput) => Promise<ProactiveCommitResult>;
  canStartDelivery?: () => boolean;
  log?: (event: string, detail?: unknown) => void;
}

export interface ProactiveChatService {
  evaluateCandidate(candidate: ProactiveCandidate): Promise<void>;
  invalidateForUserMessage(): void;
  normalConversationStarted(): void;
  normalConversationEnded(now?: number): void;
  invalidate(): void;
  isGenerating(): boolean;
  close(): Promise<void>;
}

export function createProactiveChatService(deps: ProactiveChatServiceDeps): ProactiveChatService {
  let generating = false, closed = false;
  let activeController: AbortController | undefined;
  let pending: Promise<void> | undefined;
  const abort = () => activeController?.abort(Error("MEMORY_CONTEXT_CANCELLED"));

  const persistMutation = (mutate: (state: ProactiveState) => void): void => {
    const state = deps.loadState();
    mutate(state);
    deps.saveState(state);
  };

  return {
    async evaluateCandidate(candidate): Promise<void> {
      if (closed) return;
      const initialState = deps.loadState();
      const rawInitialSnapshot = deps.getSnapshot();
      const initialSnapshot = { ...rawInitialSnapshot, generationBusy: rawInitialSnapshot.generationBusy || generating };
      const startDecision = canStartProactiveGeneration(initialSnapshot, initialState, candidate);
      if (!startDecision.allowed) {
        deps.log?.("candidate_blocked", { scene: candidate.sceneId, reason: startDecision.reason });
        return;
      }
      if (deps.canStartDelivery && !deps.canStartDelivery()) {
        deps.log?.("candidate_blocked", { scene: candidate.sceneId, reason: "delivery_unavailable" });
        return;
      }

      generating = true;
      const controller = new AbortController(); activeController = controller;
      let settled!: () => void;
      pending = new Promise<void>(resolve => { settled = resolve; });
      const generationEpoch = initialState.proactiveEpoch;
      try {
        const messages = await deps.buildMessages(candidate, initialState, controller.signal);
        if (controller.signal.aborted) return;
        const result = await deps.runModel(messages, controller.signal);
        if (controller.signal.aborted) return;
        const stateAfterModel = deps.loadState();
        if (stateAfterModel.proactiveEpoch !== generationEpoch) {
          deps.log?.("generation_discarded", { scene: candidate.sceneId, reason: "stale_epoch" });
          return;
        }

        let text: string;
        let source: "model" | "fallback";
        let fallbackPayload: unknown;
        if (result.kind === "silent") {
          const silentState = deps.loadState();
          if (silentState.proactiveEpoch === generationEpoch) {
            silentState.globalDesire = 0;
            silentState.lastFiredAt[candidate.sceneId] = deps.getSnapshot().now;
            deps.saveState(silentState);
          }
          deps.log?.("model_silent", { scene: candidate.sceneId });
          return;
        }
        if (result.kind === "send") {
          text = result.text;
          source = "model";
        } else {
          // 技术失败或无效输出才允许寻找旧预设；Epoch 失效已在上方提前拦截。
          const fallback = await deps.getFallback(candidate);
          if (!fallback?.text.trim()) {
            deps.log?.("fallback_unavailable", { scene: candidate.sceneId, result: result.kind });
            return;
          }
          text = fallback.text.trim();
          fallbackPayload = fallback.payload;
          source = "fallback";
        }

        if (closed || controller.signal.aborted) return;
        const commitState = deps.loadState();
        const commitSnapshot = deps.getSnapshot();
        const commitDecision = canCommitProactiveMessage(
          commitSnapshot,
          commitState,
          candidate,
          generationEpoch,
        );
        if (!commitDecision.allowed) {
          deps.log?.("commit_blocked", { scene: candidate.sceneId, reason: commitDecision.reason, source });
          return;
        }

        const commitResult = await deps.commitMessage({ candidate, text, source, fallbackPayload, generationEpoch, signal: controller.signal });
        if (closed || controller.signal.aborted || commitResult.kind === "cancelled") {
          // Preserve the factual cooldown of any already-delivered part, without
          // advancing the unanswered count or claiming a complete active delivery.
          if (commitResult.kind === "committed" || commitResult.deliveryCommitted) {
            const latestState = deps.loadState();
            latestState.lastProactiveAt = commitSnapshot.now;
            latestState.lastProactiveScene = candidate.sceneId;
            latestState.lastFiredAt[candidate.sceneId] = commitSnapshot.now;
            latestState.globalDesire = 0;
            deps.saveState(latestState);
          }
          deps.log?.("commit_cancelled", { scene: candidate.sceneId,
            reason: commitResult.kind === "cancelled" ? commitResult.reason : closed ? "closed" : "generation_cancelled", source });
          return;
        }
        const latestState = deps.loadState();
        if (latestState.proactiveEpoch === generationEpoch) {
          markProactiveCommitted(latestState, candidate, commitSnapshot.now);
        } else {
          // 文本已经成功写入，但用户可能在后续 TTS 等待期间发来消息。
          // 保留更新后的 Epoch/unansweredCount，只补记这次真实发送的硬冷却时间。
          latestState.lastProactiveAt = commitSnapshot.now;
          latestState.lastProactiveScene = candidate.sceneId;
          latestState.lastFiredAt[candidate.sceneId] = commitSnapshot.now;
          latestState.globalDesire = 0;
        }
        deps.saveState(latestState);
        deps.log?.("message_committed", { scene: candidate.sceneId, source });
      } finally {
        activeController = undefined; pending = undefined; settled();
        generating = false;
      }
    },

    invalidateForUserMessage(): void {
      abort();
      persistMutation(markUserActivity);
    },

    normalConversationStarted(): void {
      abort();
      persistMutation(markNormalConversationStarted);
    },

    normalConversationEnded(now = Date.now()): void {
      persistMutation((state) => markNormalConversationEnded(state, now));
    },

    invalidate(): void {
      abort();
      persistMutation((state) => { state.proactiveEpoch += 1; });
    },

    async close(): Promise<void> {
      closed = true; abort(); await pending;
    },

    isGenerating(): boolean {
      return generating;
    },
  };
}
