import type { ChatMessage } from "./chat-types";
import type { CharacterStateData } from "./firefly-state";
import type { ToolCall } from "./tool-types";
import type { MusicContextEvent } from "./music-context-types";
import type { AgentExecutionProfile } from "./subagent-types";

/** Identifies the producer of an Agent run for Context and execution policy. */
export type AgentRunSource = "user" | "proactive" | "worker";

export type AgentRunStatus =
  | "created"
  | "running"
  | "waiting_tool"
  | "completed"
  | "cancelled"
  | "timeout"
  | "error";

export type ToolCallOutcome = "success" | "failure" | "unknown" | "not_executed";

export interface AgentConfig {
  maxRounds: number;
  totalTimeoutMs: number;
  roundTimeoutMs: number;
  toolTimeoutMs: number;
  contextWindowTokens: number;
  reservedOutputTokens: number;
  safetyMarginTokens: number;
  compactionThreshold: number;
  compactionRetainCount: number;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxRounds: 10,
  totalTimeoutMs: 120_000,
  roundTimeoutMs: 45_000,
  toolTimeoutMs: 25_000,
  contextWindowTokens: 128_000,
  reservedOutputTokens: 8_192,
  safetyMarginTokens: 512,
  compactionThreshold: 0.7,
  compactionRetainCount: 4,
};

export interface AgentRunInput {
  runId?: string;
  conversationId?: string;
  /** Defaults to user for existing callers; proactive runs must set proactive explicitly. */
  source?: AgentRunSource;
  userPrompt: string;
  history?: ChatMessage[];
  characterState?: CharacterStateData;
  memoryContext?: string;
  systemPromptOverride?: string;
  planMode?: boolean;
  customSteps?: string[];
  signal?: AbortSignal;
  executionProfile?: AgentExecutionProfile;
}

export interface AgentRunResult {
  runId: string;
  conversationId?: string;
  status: AgentRunStatus;
  finalText: string;
  transcript: ChatMessage[];
  toolCallsCount: number;
  roundsCount: number;
  error?: string;
  durationMs: number;
}

export type AgentEvent =
  | { type: "agent:started"; runId: string; prompt: string; timestamp: number }
  | { type: "agent:step-start"; runId: string; step: number; timestamp: number }
  | { type: "agent:llm-request"; runId: string; step: number; messageCount: number; timestamp: number }
  | { type: "agent:progress"; runId: string; step: number; delta: string; timestamp: number }
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
      status: AgentRunStatus;
      durationMs: number;
      toolCallsCount: number;
      stepsCount: number;
      timestamp: number;
    }
  | {
      type: "subagent:started";
      runId: string;
      subAgentId: string;
      taskId: string;
      parentRunId?: string;
      timestamp: number;
    }
  | {
      type: "subagent:completed";
      runId: string;
      subAgentId: string;
      taskId: string;
      timestamp: number;
    }
  | {
      type: "subagent:failed";
      runId: string;
      subAgentId: string;
      taskId: string;
      error: string;
      timestamp: number;
    }
  | {
      type: "subagent:cancelled";
      runId: string;
      subAgentId: string;
      taskId: string;
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
    }
  | MusicContextEvent;

export type AgentEventType = AgentEvent["type"];
