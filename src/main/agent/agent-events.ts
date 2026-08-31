import { EventEmitter } from "node:events";
import type { ToolCall } from "../../shared/tool-types";
import type { HarnessRunStatus } from "../../shared/harness-types";

export type AgentEventType =
  | "agent:started"
  | "agent:step-start"
  | "agent:llm-request"
  | "agent:assistant-message"
  | "agent:tool-call"
  | "agent:tool-result"
  | "agent:final-answer"
  | "agent:cancelled"
  | "agent:error"
  | "agent:finished"
  | "tool:authorized"
  | "tool:denied"
  | "tool:retry"
  | "tool:timeout"
  | "checkpoint:created"
  | "checkpoint:restored"
  | "recovery:started"
  | "recovery:completed"
  | "recovery:failed"
  | "run:resumed"
  | "plan:created"
  | "plan:started"
  | "plan:step-start"
  | "plan:step-completed"
  | "plan:step-failed"
  | "plan:verification"
  | "plan:completed"
  | "plan:failed"
  | "plan:cancelled";

export type AgentEvent =
  | { type: "agent:started"; runId: string; prompt: string; timestamp: number }
  | { type: "agent:step-start"; runId: string; step: number; timestamp: number }
  | { type: "agent:llm-request"; runId: string; step: number; messageCount: number; timestamp: number }
  | {
      type: "agent:assistant-message";
      runId: string;
      step: number;
      content: string;
      toolCalls?: ToolCall[];
      timestamp: number;
    }
  | {
      type: "agent:tool-call";
      runId: string;
      step: number;
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      timestamp: number;
    }
  | {
      type: "agent:tool-result";
      runId: string;
      step: number;
      toolCallId: string;
      toolName: string;
      output: string;
      isError: boolean;
      timestamp: number;
    }
  | { type: "agent:final-answer"; runId: string; content: string; timestamp: number }
  | { type: "agent:cancelled"; runId: string; timestamp: number }
  | { type: "agent:error"; runId: string; error: string; timestamp: number }
  | {
      type: "agent:finished";
      runId: string;
      status: HarnessRunStatus;
      durationMs: number;
      toolCallsCount: number;
      stepsCount: number;
      timestamp: number;
    }
  | {
      type: "tool:authorized";
      runId: string;
      step: number;
      toolCallId: string;
      toolName: string;
      timestamp: number;
    }
  | {
      type: "tool:denied";
      runId: string;
      step: number;
      toolCallId: string;
      toolName: string;
      reason: string;
      timestamp: number;
    }
  | {
      type: "tool:retry";
      runId: string;
      step: number;
      toolCallId: string;
      toolName: string;
      attempt: number;
      delayMs: number;
      error: string;
      timestamp: number;
    }
  | {
      type: "tool:timeout";
      runId: string;
      step: number;
      toolCallId: string;
      toolName: string;
      timeoutMs: number;
      timestamp: number;
    }
  | {
      type: "checkpoint:created";
      runId: string;
      checkpointId: string;
      step: number;
      timestamp: number;
    }
  | {
      type: "checkpoint:restored";
      runId: string;
      checkpointId: string;
      timestamp: number;
    }
  | {
      type: "recovery:started";
      runId: string;
      step: number;
      errorType: string;
      attempt: number;
      timestamp: number;
    }
  | {
      type: "recovery:completed";
      runId: string;
      step: number;
      action: string;
      timestamp: number;
    }
  | {
      type: "recovery:failed";
      runId: string;
      step: number;
      reason: string;
      timestamp: number;
    }
  | {
      type: "run:resumed";
      runId: string;
      fromCheckpointId: string;
      resumeStep: number;
      timestamp: number;
    }
  | {
      type: "plan:created";
      runId: string;
      planId: string;
      goal: string;
      stepsCount: number;
      timestamp: number;
    }
  | {
      type: "plan:started";
      runId: string;
      planId: string;
      timestamp: number;
    }
  | {
      type: "plan:step-start";
      runId: string;
      planId: string;
      stepIndex: number;
      description: string;
      timestamp: number;
    }
  | {
      type: "plan:step-completed";
      runId: string;
      planId: string;
      stepIndex: number;
      observation?: string;
      timestamp: number;
    }
  | {
      type: "plan:step-failed";
      runId: string;
      planId: string;
      stepIndex: number;
      reason: string;
      timestamp: number;
    }
  | {
      type: "plan:verification";
      runId: string;
      planId: string;
      stepIndex: number;
      result: string;
      timestamp: number;
    }
  | {
      type: "plan:completed";
      runId: string;
      planId: string;
      stepsCount: number;
      timestamp: number;
    }
  | {
      type: "plan:failed";
      runId: string;
      planId: string;
      reason: string;
      timestamp: number;
    }
  | {
      type: "plan:cancelled";
      runId: string;
      planId: string;
      timestamp: number;
    };

export class AgentEventBus {
  private readonly emitter = new EventEmitter();

  emit(event: AgentEvent): void {
    try {
      this.emitter.emit(event.type, event);
    } catch (err) {
      console.warn(`[AgentEventBus] Listener error on event "${event.type}":`, err);
    }
    try {
      this.emitter.emit("*", event);
    } catch (err) {
      console.warn(`[AgentEventBus] Wildcard listener error on event "${event.type}":`, err);
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
