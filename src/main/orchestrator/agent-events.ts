import { EventEmitter } from "node:events";
import type { AgentEvent } from "../../shared/agent-types";

export type { AgentEvent } from "../../shared/agent-types";
export type AgentEventType = AgentEvent["type"];

export class AgentEventBus {
  private readonly emitter = new EventEmitter();

  emit(event: AgentEvent): void {
    try {
      this.emitter.emit(event.type, event);
    } catch (err) {
      console.warn("[AgentEventBus] Listener error on event " + event.type + ":", err);
    }
    try {
      this.emitter.emit("*", event);
    } catch (err) {
      console.warn("[AgentEventBus] Wildcard listener error on event " + event.type + ":", err);
    }
  }

  on<T extends AgentEvent["type"]>(
    type: T,
    listener: (event: Extract<AgentEvent, { type: T }>) => void,
  ): () => void {
    const handler = listener as (...args: unknown[]) => void;
    this.emitter.on(type, handler);
    return () => {
      this.emitter.off(type, handler);
    };
  }

  onAny(listener: (event: AgentEvent) => void): () => void {
    this.emitter.on("*", listener);
    return () => {
      this.emitter.off("*", listener);
    };
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}
