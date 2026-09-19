import type { ChatMessage } from "../../../shared/chat-types";
import type {
  AgentResumeRejectionCode,
  AgentToolCallEvidence,
} from "../../../shared/agent-types";
import type { ToolCall } from "../../../shared/tool-types";
import type { VoiceProsodyHint } from "../../../shared/tts-session";
import { CHECKPOINT_SCHEMA_VERSION, type Checkpoint } from "./checkpoint-types";
import {
  RESUME_FACTS_VERSION,
  type ResumeCheckpointFacts,
} from "./resume-types";
import { validateProviderFailureBoundary } from "./provider-failure-boundary";

import type { Plan } from "../planning/plan-types";
import type { CompactionTaskFactsMessageIdentity } from "../compaction/task-facts";

export interface ResumeEvaluation {
  canResume: boolean;
  resumeStep: number;
  sanitizedMessages: ChatMessage[];
  restoredPlan?: Plan;
  resumeFacts?: ResumeCheckpointFacts;
  reason?: string;
  rejectionCode?: AgentResumeRejectionCode;
}

/**
 * ResumeProtocol (快照安全恢复协议)
 *
 * Resume V1 is fail-closed. Schema V1 does not contain the immutable execution
 * binding required to re-enter the Harness, so it remains readable for
 * diagnostics but cannot start a new Provider or tool execution.
 */
export class ResumeProtocol {
  static evaluate(checkpoint: Checkpoint): ResumeEvaluation {
    if (checkpoint.version !== CHECKPOINT_SCHEMA_VERSION) {
      return {
        canResume: false,
        resumeStep: checkpoint.step,
        sanitizedMessages: [],
        rejectionCode: "checkpoint_unsupported_version",
        reason: `Checkpoint version mismatch (Expected: ${CHECKPOINT_SCHEMA_VERSION}, got: ${checkpoint.version}).`,
      };
    }

    if (checkpoint.runState === "completed") {
      return {
        canResume: false,
        resumeStep: checkpoint.step,
        sanitizedMessages: [],
        rejectionCode: "checkpoint_terminal",
        reason: "Run has already completed successfully.",
      };
    }

    if (checkpoint.runState === "cancelled") {
      return {
        canResume: false,
        resumeStep: checkpoint.step,
        sanitizedMessages: [],
        rejectionCode: "checkpoint_terminal",
        reason: "Run was manually cancelled by user and cannot be resumed.",
      };
    }

    if (checkpoint.runState === "failed" || checkpoint.runState === "timed_out") {
      return {
        canResume: false,
        resumeStep: checkpoint.step,
        sanitizedMessages: [],
        rejectionCode: "checkpoint_terminal",
        reason: `Run is in terminal state "${checkpoint.runState}" and cannot be resumed by Resume V1.`,
      };
    }

    if (checkpoint.runState !== "resumable") {
      return {
        canResume: false,
        resumeStep: checkpoint.step,
        sanitizedMessages: [],
        rejectionCode: "checkpoint_facts_missing",
        reason:
          "Checkpoint is not a newly sealed R2 resumable snapshot and lacks the immutable execution facts required by Resume V1; the snapshot remains diagnostic-only.",
      };
    }

    const factsValidation = validateResumeFacts(checkpoint, checkpoint.resumeFacts);
    if (!factsValidation.ok) {
      return {
        canResume: false,
        resumeStep: checkpoint.step,
        sanitizedMessages: [],
        rejectionCode: "resume_eligibility_invalid",
        reason: factsValidation.reason,
      };
    }

    return {
      canResume: true,
      resumeStep: checkpoint.step,
      sanitizedMessages: JSON.parse(JSON.stringify(checkpoint.messages)) as ChatMessage[],
      restoredPlan: checkpoint.plan === undefined
        ? undefined
        : JSON.parse(JSON.stringify(checkpoint.plan)) as Plan,
      resumeFacts: JSON.parse(JSON.stringify(factsValidation.facts)) as ResumeCheckpointFacts,
    };
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || isString(value);
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

function isVoiceProsodyHint(value: unknown): value is VoiceProsodyHint {
  if (!isRecord(value)) return false;
  return (value.pace === undefined ||
      value.pace === "slow" || value.pace === "normal" || value.pace === "brisk") &&
    (value.pitch === undefined ||
      value.pitch === "soft_low" || value.pitch === "neutral" || value.pitch === "bright_up") &&
    isOptionalFiniteNumber(value.volumeModifier) &&
    isOptionalFiniteNumber(value.pauseLengthMs);
}

function isToolCall(value: unknown): value is ToolCall {
  return isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isRecord(value.arguments);
}

function isMessageIdentity(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const identity = value as Record<string, unknown>;
  return typeof identity.baseSystemMessageId === "string" &&
    typeof identity.constraintsMessageId === "string" &&
    typeof identity.summaryMessageId === "string" &&
    (identity.planMessageId === undefined || typeof identity.planMessageId === "string");
}

function isToolCallEvidence(value: unknown): value is AgentToolCallEvidence {
  if (!isRecord(value) || !isNonNegativeInteger(value.step) ||
      !isString(value.runId) || !isString(value.toolCallId) ||
      !isString(value.toolName) || !isRecord(value.arguments) ||
      !isString(value.output) || typeof value.isError !== "boolean") {
    return false;
  }
  if (!["success", "failure", "unknown", "not_executed"].includes(String(value.outcome))) {
    return false;
  }
  return (value.assistantMessageId === undefined || isString(value.assistantMessageId)) &&
    (value.toolMessageId === undefined || isString(value.toolMessageId));
}

function isCheckpointMessage(value: unknown): value is ChatMessage {
  return isRecord(value) &&
    isString(value.id) &&
    (value.role === "system" || value.role === "user" ||
      value.role === "assistant" || value.role === "tool") &&
    isString(value.content) &&
    (value.toolCalls === undefined ||
      (Array.isArray(value.toolCalls) && value.toolCalls.every(isToolCall))) &&
    isOptionalString(value.toolCallId) &&
    isOptionalFiniteNumber(value.timestamp) &&
    isOptionalString(value.behaviorType) &&
    isOptionalString(value.correlationId) &&
    isOptionalString(value.voiceIntent) &&
    (value.prosodyHint === undefined || isVoiceProsodyHint(value.prosodyHint));
}

function validateResumeFacts(
  checkpoint: Checkpoint,
  rawValue: unknown,
):
  | { readonly ok: true; readonly facts: ResumeCheckpointFacts }
  | { readonly ok: false; readonly reason: string } {
  if (!isRecord(rawValue)) {
    return { ok: false, reason: "Checkpoint R2 facts are missing or not an object." };
  }
  if (!Array.isArray(checkpoint.messages) || !checkpoint.messages.every(isCheckpointMessage)) {
    return { ok: false, reason: "Checkpoint R2 contains an invalid message or tool-call structure." };
  }
  const rawFacts = rawValue;
  if (rawFacts.protocol !== "r2" || rawFacts.version !== RESUME_FACTS_VERSION) {
    return { ok: false, reason: "Checkpoint R2 facts have an unsupported protocol or version." };
  }
  if (rawFacts.planExecutionMode !== undefined &&
      rawFacts.planExecutionMode !== "assist" &&
      rawFacts.planExecutionMode !== "required") {
    return { ok: false, reason: "Checkpoint R2 plan execution mode is invalid." };
  }
  if (rawFacts.planExecutionMode === "required") {
    return {
      ok: false,
      reason: "Checkpoint R2 does not contain the plan facts required to resume a required execution plan.",
    };
  }
  if (!isString(rawFacts.originRunId) || !isString(rawFacts.executionRunId) ||
      rawFacts.source !== "user" || rawFacts.executionRunId !== checkpoint.runId) {
    return { ok: false, reason: "Checkpoint R2 facts do not bind to their execution run." };
  }
  if (rawFacts.executionProfileKind !== "MAIN" ||
      rawFacts.toolBoundary !== "none" ||
      rawFacts.approvalBoundary !== "none" ||
      rawFacts.delegationBoundary !== "none") {
    return { ok: false, reason: "Checkpoint R2 facts contain a tool, approval, delegation, or non-MAIN boundary." };
  }
  if (!isString(rawFacts.userPrompt) || rawFacts.userPrompt.length === 0) {
    return { ok: false, reason: "Checkpoint R2 facts do not contain the original user prompt." };
  }
  if (!isNonNegativeInteger(rawFacts.generation) ||
      (rawFacts.generation === 0 && rawFacts.parentCheckpointId !== undefined) ||
      (rawFacts.generation > 0 && !isString(rawFacts.parentCheckpointId)) ||
      (rawFacts.generation === 0 && rawFacts.originRunId !== checkpoint.runId) ||
      (rawFacts.generation > 0 && rawFacts.originRunId === rawFacts.executionRunId)) {
    return { ok: false, reason: "Checkpoint R2 generation binding is invalid." };
  }
  const parentCheckpointId = isString(rawFacts.parentCheckpointId)
    ? rawFacts.parentCheckpointId
    : undefined;
  if (!isNonNegativeInteger(rawFacts.taskFactsSequence) ||
      !isMessageIdentity(rawFacts.taskFactsMessageIdentity) ||
      !Array.isArray(rawFacts.completedToolEvidence) ||
      !rawFacts.completedToolEvidence.every(isToolCallEvidence) ||
      !Array.isArray(checkpoint.activeToolCalls) ||
      checkpoint.activeToolCalls.length !== 0) {
    return { ok: false, reason: "Checkpoint R2 task facts or active tool boundary is invalid." };
  }
  const checkpointMessageIds = new Set(
    checkpoint.messages.map((message) => message.id),
  );
  const identity = rawFacts.taskFactsMessageIdentity as CompactionTaskFactsMessageIdentity;
  if (!checkpointMessageIds.has(identity.baseSystemMessageId) ||
      !checkpointMessageIds.has(identity.constraintsMessageId) ||
      (identity.planMessageId !== undefined && !checkpointMessageIds.has(identity.planMessageId)) ||
      !checkpoint.messages.some((message) =>
        message.role === "user" && message.content === rawFacts.userPrompt,
      )) {
    return { ok: false, reason: "Checkpoint R2 messages do not contain the bound task-facts identity and user request." };
  }

  if (!isRecord(rawFacts.budget)) {
    return { ok: false, reason: "Checkpoint R2 budget facts are missing or not an object." };
  }
  const budget = rawFacts.budget;
  if (budget.version !== RESUME_FACTS_VERSION ||
      !isNonNegativeInteger(budget.originalMaxRounds) ||
      !isNonNegativeInteger(budget.originalMaxToolCalls) ||
      budget.originalDelegatedStepsLimit !== 0 ||
      !isNonNegativeInteger(budget.consumedRounds) ||
      !isNonNegativeInteger(budget.consumedToolCalls) ||
      budget.consumedDelegatedSteps !== 0 ||
      !isNonNegativeInteger(budget.consumedRecoveryAttempts) ||
      typeof budget.monotonicClockId !== "string" ||
      (budget.monotonicDeadline !== undefined && !isFiniteNumber(budget.monotonicDeadline)) ||
      budget.consumedRounds > budget.originalMaxRounds ||
      budget.consumedToolCalls > budget.originalMaxToolCalls ||
      budget.consumedRecoveryAttempts !== checkpoint.recoveryAttempts) {
    return { ok: false, reason: "Checkpoint R2 budget facts are incomplete or inconsistent." };
  }

  const boundaryValidation = validateProviderFailureBoundary(rawFacts.pendingProviderFailure);
  if (!boundaryValidation.ok) {
    return { ok: false, reason: `Checkpoint R2 Provider boundary is invalid: ${boundaryValidation.code}.` };
  }
  if (boundaryValidation.boundary.completedRecoveryAttempts !== budget.consumedRecoveryAttempts) {
    return { ok: false, reason: "Checkpoint R2 Provider boundary and recovery budget disagree." };
  }
  if (checkpoint.stepState !== "waiting_llm") {
    return { ok: false, reason: "Checkpoint R2 is not paused at a Provider continuation boundary." };
  }
  const facts: ResumeCheckpointFacts = {
    protocol: "r2",
    version: RESUME_FACTS_VERSION,
    originRunId: rawFacts.originRunId,
    executionRunId: rawFacts.executionRunId,
    generation: rawFacts.generation,
    ...(parentCheckpointId === undefined
      ? {}
      : { parentCheckpointId }),
    userPrompt: rawFacts.userPrompt,
    source: "user",
    executionProfileKind: "MAIN",
    toolBoundary: "none",
    approvalBoundary: "none",
    delegationBoundary: "none",
    ...(rawFacts.planExecutionMode === undefined
      ? {}
      : { planExecutionMode: rawFacts.planExecutionMode }),
    taskFactsSequence: rawFacts.taskFactsSequence,
    taskFactsMessageIdentity: identity,
    completedToolEvidence: rawFacts.completedToolEvidence,
    budget: {
      version: RESUME_FACTS_VERSION,
      originalMaxRounds: budget.originalMaxRounds,
      originalMaxToolCalls: budget.originalMaxToolCalls,
      originalDelegatedStepsLimit: 0,
      consumedRounds: budget.consumedRounds,
      consumedToolCalls: budget.consumedToolCalls,
      consumedDelegatedSteps: 0,
      consumedRecoveryAttempts: budget.consumedRecoveryAttempts,
      monotonicClockId: budget.monotonicClockId,
      ...(budget.monotonicDeadline === undefined
        ? {}
        : { monotonicDeadline: budget.monotonicDeadline }),
    },
    pendingProviderFailure: boundaryValidation.boundary,
  };
  return { ok: true, facts };
}
