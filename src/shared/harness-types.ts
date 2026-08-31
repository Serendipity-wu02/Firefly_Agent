import type { ChatMessage } from "./chat-types";
import type { CharacterStateData } from "./firefly-state";
import type { ToolCallResult } from "./tool-types";

export type HarnessRunStatus =
  | "created"
  | "running"
  | "waiting_tool"
  | "completed"
  | "cancelled"
  | "timeout"
  | "error";

export type ToolCallOutcome = "success" | "failure" | "unknown" | "not_executed";

export interface ContextUsageSnapshot {
  usableInputBudget: number;
  estimatedInput: number;
  systemTokens: number;
  schemaTokens: number;
  messageTokens: number;
  needsCompaction: boolean;
}

export interface HarnessConfig {
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

export const DEFAULT_HARNESS_CONFIG: HarnessConfig = {
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

export interface HarnessInput {
  runId?: string;
  conversationId?: string;
  userPrompt: string;
  history?: ChatMessage[];
  characterState?: CharacterStateData;
  memoryContext?: string;
  systemPromptOverride?: string;
  signal?: AbortSignal;
}

export interface HarnessResult {
  runId: string;
  conversationId?: string;
  status: HarnessRunStatus;
  finalText: string;
  transcript: ChatMessage[];
  toolCallsCount: number;
  roundsCount: number;
  error?: string;
  durationMs: number;
}

export type HarnessEvent =
  | { type: "run_created"; runId: string }
  | { type: "round_start"; roundId: string; round: number }
  | { type: "round_end"; roundId: string; round: number }
  | { type: "progress_text"; delta: string }
  | { type: "final_answer"; content: string }
  | { type: "tool_start"; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: "tool_end"; toolCallId: string; outcome: ToolCallOutcome; preview: string }
  | { type: "context_usage"; snapshot: ContextUsageSnapshot }
  | { type: "run_completed"; runId: string; result: HarnessResult }
  | { type: "run_error"; runId: string; error: string };
