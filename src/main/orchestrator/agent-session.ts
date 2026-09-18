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

  replaceMessage(id: string, message: ChatMessage): boolean {
    const index = this.messages.findIndex((existing) => existing.id === id);
    if (index < 0) return false;
    this.messages[index] = message;
    return true;
  }

  /**
   * Replaces one Main-owned set of transient messages as a single operation.
   * Matching is by the exact ids supplied by the owning run; unrelated
   * history entries are never removed because they happen to share text.
   */
  replaceMessagesById(
    ids: readonly string[],
    replacements: readonly ChatMessage[],
    anchorId?: string,
  ): boolean {
    const idSet = new Set(ids);
    if (idSet.size === 0) return false;

    const firstIndex = this.messages.findIndex((message) => idSet.has(message.id));
    if (firstIndex < 0) {
      if (anchorId === undefined) return false;
      const anchorIndex = this.messages.findIndex((message) => message.id === anchorId);
      if (anchorIndex < 0) return false;
      this.messages = [
        ...this.messages.slice(0, anchorIndex + 1),
        ...replacements,
        ...this.messages.slice(anchorIndex + 1),
      ];
      return true;
    }

    const before = this.messages.slice(0, firstIndex).filter((message) => !idSet.has(message.id));
    const after = this.messages.slice(firstIndex).filter((message) => !idSet.has(message.id));
    this.messages = [...before, ...replacements, ...after];
    return true;
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
