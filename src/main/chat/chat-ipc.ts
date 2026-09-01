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

      // 1. Unified Behavior Decision
      const behaviorDecision = policyEngine.decideBehavior({
        userPrompt: payload.message,
        legacyState: state,
        mode: "daily",
      });

      // 2. Agent Core LLM Execution
      const result = await agentCore.run({
        userPrompt: payload.message,
        history: payload.history || [],
        characterState: state,
      });

      // 3. Compile Unified EmbodimentPlan with generated reply text
      const embodimentPlan = policyEngine.createEmbodimentPlan(
        behaviorDecision,
        result.finalText,
      );

      // 4. Dispatch Visual Embodiment Target to Live2D Window (if enabled) with correlationId
      if (embodimentPlan.requiresEmbodiment && embodimentPlan.visual && sendToPet) {
        sendToPet(IPC.LIVE2D_PLAY_ACTION, {
          ...embodimentPlan.visual.target,
          correlationId: embodimentPlan.correlationId,
          behaviorType: embodimentPlan.behaviorType,
        });
      }

      onEmbodimentPlan?.(embodimentPlan);

      return {
        replyText: result.finalText,
        history: result.transcript,
        toolCalled: result.toolCallsCount > 0,
        embodimentPlan,
        correlationId: embodimentPlan.correlationId,
      };
    },
  );
}
