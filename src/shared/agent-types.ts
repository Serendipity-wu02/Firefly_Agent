import type { ChatMessage } from "./chat-types";
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

export type AgentBudgetKind = "rounds" | "tool_calls" | "delegation";

/** New contract: whether a plan is advisory or a required execution contract. */
export type AgentPlanExecutionMode = "assist" | "required";

/** New structured terminal reason for a required plan that lacks completion evidence. */
export type AgentPlanCompletionFailureReason =
  | "plan_not_created"
  | "step_failed"
  | "step_unverified"
  | "step_not_executed";

export type AgentTerminationReason =
  | { readonly kind: "completed" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "timeout" }
  | { readonly kind: "error" }
  | { readonly kind: "budget_exhausted"; readonly budget: AgentBudgetKind }
  | {
      readonly kind: "plan_incomplete";
      readonly planId?: string;
      readonly stepIndex?: number;
      readonly reason: AgentPlanCompletionFailureReason;
    };

/** Structured, non-executing rejection reasons for the Resume V1 fail-closed gate. */
export type AgentResumeRejectionCode =
  | "checkpoint_not_found"
  | "checkpoint_read_failed"
  | "checkpoint_invalid_format"
  | "checkpoint_unsupported_version"
  | "checkpoint_terminal"
  | "checkpoint_facts_missing"
  | "resume_eligibility_invalid"
  | "resume_budget_expired"
  | "resume_clock_mismatch"
  | "resume_checkpoint_invalidated"
  | "resume_already_claimed"
  | "resume_chain_claimed";

export type AgentResumeReadFailureCode = "io_error";

export interface AgentResumeRejection {
  readonly code: AgentResumeRejectionCode;
  readonly checkpointId: string;
  readonly message: string;
  readonly runId?: string;
  readonly observedRunState?: string;
  readonly observedVersion?: number;
  readonly readFailureCode?: AgentResumeReadFailureCode;
}

export type ToolCallOutcome = "success" | "failure" | "unknown" | "not_executed";

/**
 * A typed Main-orchestrator requirement for one specific tool operation.
 *
 * It does not authorize or execute the tool. The canonical Harness,
 * authorization adapter, Sandbox, Approval, and ToolExecutionEngine still own
 * those stages. `correction: "once"` permits one additional LLM round only
 * when the required tool call was never produced.
 */
export interface AgentRequiredToolExecution {
  readonly toolName: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  /**
   * Defaults to structural exact matching. Browser URL requirements use the
   * canonical URL form already established by the Main-owned target parser.
   */
  readonly argumentMatching?: "exact" | "normalized_url";
  readonly successContract: "json_ok_true";
  readonly correction: "once";
}

/** Per-run evidence for a model tool call and its actual execution outcome. */
export interface AgentToolCallEvidence {
  readonly runId: string;
  readonly step: number;
  readonly toolCallId: string;
  readonly toolName: string;
  /** Exact transcript message that originally carried this real tool call. */
  readonly assistantMessageId?: string;
  /** Exact transcript message that originally carried this real tool result. */
  readonly toolMessageId?: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly outcome: ToolCallOutcome;
  readonly output: string;
  readonly isError: boolean;
}

/** Structured non-success reason produced by the run-owned no-progress gate. */
export type AgentNoProgressReason = "repeated_read_result" | "repeated_read_failure";

export interface AgentNoProgressInfo {
  readonly reason: AgentNoProgressReason;
  readonly toolName: string;
  readonly toolCallId: string;
  readonly step: number;
  readonly consecutiveRounds: number;
  readonly threshold: number;
}

export type AgentRequiredToolExecutionStatus =
  | "succeeded"
  | "failed"
  | "unknown"
  | "not_called";

export interface AgentRequiredToolExecutionResult {
  readonly requirement: AgentRequiredToolExecution;
  readonly status: AgentRequiredToolExecutionStatus;
  readonly correctionAttempts: number;
  readonly evidence?: AgentToolCallEvidence;
}

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

/** New plan contract: the source of a step's completion evidence. */
export type AgentPlanStepCompletionRequirement = "analysis" | "tool";

/**
 * New plan creation input. A legacy string intentionally carries no
 * completion requirement and remains unverified until a caller supplies one.
 */
export interface AgentPlanStepDefinition {
  readonly description: string;
  readonly completionRequirement?: AgentPlanStepCompletionRequirement;
}

export type AgentPlanStepInput = string | AgentPlanStepDefinition;

export interface AgentRunInput {
  runId?: string;
  conversationId?: string;
  /** Defaults to user for existing callers; proactive runs must set proactive explicitly. */
  source?: AgentRunSource;
  userPrompt: string;
  history?: ChatMessage[];
  memoryContext?: string;
  systemPromptOverride?: string;
  planMode?: boolean;
  /** New trusted Main-side contract; absent/assist plans remain advisory. */
  planExecutionMode?: AgentPlanExecutionMode;
  customSteps?: AgentPlanStepInput[];
  signal?: AbortSignal;
  /** Main-owned normalized URLs explicitly present in the current user turn. */
  browserRequestTargets?: readonly string[];
  executionProfile?: AgentExecutionProfile;
  /** Optional typed requirement supplied by the Main orchestrator. */
  requiredToolExecution?: AgentRequiredToolExecution;
}

export interface AgentRunResult {
  runId: string;
  conversationId?: string;
  status: AgentRunStatus;
  terminationReason: AgentTerminationReason;
  finalText: string;
  transcript: ChatMessage[];
  toolCallsCount: number;
  /** Present on production Harness results; optional for existing IAgentCore test doubles. */
  toolCallEvidence?: readonly AgentToolCallEvidence[];
  /** Present when the caller supplied `requiredToolExecution`. */
  requiredToolExecution?: AgentRequiredToolExecutionResult;
  roundsCount: number;
  /** Set only when an internal R2 stop saved a resumable checkpoint. */
  resumeCheckpointId?: string;
  /** Present only when the run stopped at the run-owned no-progress gate. */
  noProgress?: AgentNoProgressInfo;
  error?: string;
  durationMs: number;
}

/**
 * Resume V1 returns this result without creating an Agent run when the legacy
 * checkpoint cannot prove the original execution boundary.
 */
export interface AgentResumeRejectionResult {
  readonly kind: "resume_rejected";
  readonly checkpointId: string;
  readonly rejection: AgentResumeRejection;
  readonly runId?: string;
  readonly conversationId?: string;
  readonly status: "error";
  readonly terminationReason: { readonly kind: "error" };
  readonly finalText: "";
  readonly transcript: ChatMessage[];
  readonly toolCallsCount: 0;
  readonly roundsCount: 0;
  readonly durationMs: number;
  readonly error: string;
}

export type AgentResumeResult = AgentRunResult | AgentResumeRejectionResult;

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
      terminationReason: AgentTerminationReason;
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
