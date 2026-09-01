import { ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels";
import type { ChatMessage } from "../../shared/chat-types";
import type { IAgentCore } from "../../shared/agent-core";
import { CharacterStateManager } from "../state/state-manager";
import { CharacterPolicyEngine } from "../character/character-policy";
import type { EmbodimentPlan } from "../character/embodiment-types";

export interface ChatIpcOptions {
  sendToPet?: (channel: string, payload?: unknown) => void;
  onEmbodimentPlan?: (plan: EmbodimentPlan) => void;
}

export function registerChatIpc(
  agentCore: IAgentCore,
  stateManager: CharacterStateManager,
  options?: ChatIpcOptions | ((channel: string, payload?: unknown) => void),
): void {
  const sendToPet = typeof options === "function" ? options : options?.sendToPet;
  const onEmbodimentPlan = typeof options === "object" ? options?.onEmbodimentPlan : undefined;

  ipcMain.handle(
    IPC.CHAT_SEND_MESSAGE,
    async (_event, payload: { message: string; history?: ChatMessage[] }) => {
      const state = stateManager.getState();
      const policyEngine = CharacterPolicyEngine.getInstance();

      console.log(`[Harness Trace] main.chat.received prompt="${payload.message}"`);
      // 1. Unified Behavior Decision
      const behaviorDecision = policyEngine.decideBehavior({
        userPrompt: payload.message,
        legacyState: state,
        mode: "daily",
      });

      // 2. Agent Core LLM Execution
      console.log(`[Harness Trace] agent.start prompt="${payload.message}"`);
      const result = await agentCore.run({
        userPrompt: payload.message,
        history: payload.history || [],
        characterState: state,
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
        return {
          ok: false as const,
          status: result.status,
          error: result.error,
          replyText: "",
          history: payload.history || [],
          toolCalled: false,
          embodimentPlan: undefined,
          correlationId: undefined,
        };
      }

      // 4. Compile Unified EmbodimentPlan with generated reply text
      const embodimentPlan = policyEngine.createEmbodimentPlan(
        behaviorDecision,
        result.finalText,
      );

      // 5. Dispatch Visual Embodiment Target to Live2D Window (if enabled) with correlationId
      if (embodimentPlan.requiresEmbodiment && embodimentPlan.visual && sendToPet) {
        sendToPet(IPC.LIVE2D_PLAY_ACTION, {
          ...embodimentPlan.visual.target,
          correlationId: embodimentPlan.correlationId,
          behaviorType: embodimentPlan.behaviorType,
        });
      }
      console.log(
        `[Presentation Trace] prompt="${payload.message}" behavior=${embodimentPlan.behaviorType} correlationId=${embodimentPlan.correlationId}`,
      );

      onEmbodimentPlan?.(embodimentPlan);

      return {
        ok: true as const,
        status: result.status,
        replyText: result.finalText,
        history: result.transcript,
        toolCalled: result.toolCallsCount > 0,
        embodimentPlan,
        correlationId: embodimentPlan.correlationId,
      };
    },
  );
}
