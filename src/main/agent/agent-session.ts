import type { ChatMessage } from "../../shared/chat-types";

export interface AgentSessionOptions {
  initialMessages?: ChatMessage[];
}

export class AgentSession {
  private messages: ChatMessage[];

  constructor(options: AgentSessionOptions = {}) {
    this.messages = options.initialMessages ? [...options.initialMessages] : [];
  }

  append(message: ChatMessage): void {
    this.messages.push(message);
  }

  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  lastMessage(): ChatMessage | undefined {
    return this.messages[this.messages.length - 1];
  }

  find(predicate: (m: ChatMessage) => boolean): ChatMessage | undefined {
    return this.messages.find(predicate);
  }

  snapshot(): ChatMessage[] {
    return JSON.parse(JSON.stringify(this.messages));
  }

  clear(): void {
    this.messages = [];
  }

  size(): number {
    return this.messages.length;
  }
}
