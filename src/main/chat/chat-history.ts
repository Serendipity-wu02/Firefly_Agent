import type { ChatMessage } from "../../shared/chat-types";

function isVisibleChatMessage(message: ChatMessage): boolean {
  return message.role === "user" || message.role === "assistant";
}

function cloneChatMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    ...(message.toolCalls
      ? {
          toolCalls: message.toolCalls.map((toolCall) => ({
            ...toolCall,
            arguments: { ...toolCall.arguments },
          })),
        }
      : {}),
  };
}

/**
 * Process-local transcript for the visible Chat surface.
 *
 * This is intentionally separate from Memory: it preserves the UI transcript
 * while the main process remains alive, but it is not durable user data and is
 * not projected into Memory/RAG by this store.
 */
export class ChatHistoryStore {
  private messages: ChatMessage[] = [];

  getMessages(): ChatMessage[] {
    return this.messages.map(cloneChatMessage);
  }

  replace(messages: readonly ChatMessage[]): void {
    this.messages = messages.filter(isVisibleChatMessage).map(cloneChatMessage);
  }

  append(message: ChatMessage): void {
    if (!isVisibleChatMessage(message)) return;
    this.messages.push(cloneChatMessage(message));
  }

  clear(): void {
    this.messages = [];
  }
}
