import { ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels";
import type { ChatMessage } from "../../shared/chat-types";
import type { IAgentCore } from "../../shared/agent-core";
import { CharacterStateManager } from "../state/state-manager";

export function registerChatIpc(agentCore: IAgentCore, stateManager: CharacterStateManager): void {
  ipcMain.handle(
    IPC.CHAT_SEND_MESSAGE,
    async (_event, payload: { message: string; history?: ChatMessage[] }) => {
      const state = stateManager.getState();

      const result = await agentCore.run({
        userPrompt: payload.message,
        history: payload.history || [],
        characterState: state,
      });

      return {
        replyText: result.finalText,
        history: result.transcript,
        toolCalled: result.toolCallsCount > 0,
      };
    },
  );
}
