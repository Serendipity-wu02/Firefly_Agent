import type { ChatMessage } from "../../../shared/chat-types";
import type {
  AgentRequiredToolExecution,
  AgentToolCallEvidence,
} from "../../../shared/agent-types";
import type {
  CompactionPlanFact,
  CompactionPlanStepFact,
  CompactionStructuredError,
  CompactionStructuredObservation,
  CompactionTaskFactsInput,
  CompactionTaskFactsV1,
} from "../../../shared/compaction-task-facts";
import type { Plan } from "../planning/plan-types";

/**
 * Main-owned identity for the transient task-facts projection.
 *
 * The identity is an exact association kept by the active Harness run. It is
 * intentionally not inferred from a message-id prefix, because a history
 * entry with a similar textual id is not evidence that it belongs to this
 * run.
 */
export interface CompactionTaskFactsMessageIdentity {
  /** Main-owned base system prompt for this run. */
  readonly baseSystemMessageId: string;
  readonly constraintsMessageId: string;
  readonly planMessageId?: string;
  /** Main-owned summary node replaced by the next projection of this run. */
  readonly summaryMessageId: string;
}

export interface CompactionTaskFactsMessageSet {
  readonly identity: CompactionTaskFactsMessageIdentity;
  readonly messages: readonly ChatMessage[];
}

const TASK_FACTS_TEXT_PREVIEW_CODE_POINTS = 256;
const TASK_FACTS_BODY_PREVIEW_CODE_POINTS = 512;

/** New Main-owned message ids; callers retain the returned association. */
export function createCompactionTaskFactsMessageIdentity(
  runId: string,
  includesPlan: boolean,
): CompactionTaskFactsMessageIdentity {
  return {
    baseSystemMessageId: `compaction-base-system:${runId}`,
    constraintsMessageId: `compaction-task-constraints:${runId}`,
    ...(includesPlan ? { planMessageId: `compaction-task-plan:${runId}` } : {}),
    summaryMessageId: `compaction-summary:${runId}`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => cloneJsonValue(entry));
  if (isRecord(value)) {
    const copy: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const cloned = cloneJsonValue(child);
      if (cloned !== undefined) copy[key] = cloned;
    }
    return copy;
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return undefined;
}

function exactStringValue(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function boundedStringValue(
  record: Record<string, unknown>,
  key: string,
  limit: number,
): { value?: string; truncated: boolean } {
  const value = exactStringValue(record, key);
  if (value === undefined) return { truncated: false };
  const codePoints = Array.from(value);
  return {
    value: codePoints.length <= limit ? value : codePoints.slice(0, limit).join(""),
    truncated: codePoints.length > limit,
  };
}

function booleanValue(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function numberValue(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function cloneStructuredError(value: unknown): string | CompactionStructuredError | undefined {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return undefined;

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const cloned = cloneJsonValue(child);
    if (cloned !== undefined) result[key] = cloned;
  }
  return result as CompactionStructuredError;
}

function boundedObservation(output: string, toolName: string): CompactionStructuredObservation | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;

  const error = cloneStructuredError(parsed.error);
  const message = boundedStringValue(parsed, "message", TASK_FACTS_TEXT_PREVIEW_CODE_POINTS);
  const reason = exactStringValue(parsed, "reason");
  const title = boundedStringValue(parsed, "title", TASK_FACTS_TEXT_PREVIEW_CODE_POINTS);
  const displayName = boundedStringValue(parsed, "displayName", TASK_FACTS_TEXT_PREVIEW_CODE_POINTS);
  const originalTitleTruncated = booleanValue(parsed, "titleTruncated") === true;
  const originalBodyTruncated = booleanValue(parsed, "bodyTruncated") === true;
  const originalBodyPreviewTruncated = booleanValue(parsed, "bodyPreviewTruncated") === true;
  const bodySource = typeof parsed.body === "string"
    ? parsed.body
    : typeof parsed.bodyPreview === "string"
      ? parsed.bodyPreview
      : undefined;
  const bodyPreview = bodySource === undefined
    ? undefined
    : Array.from(bodySource).slice(0, TASK_FACTS_BODY_PREVIEW_CODE_POINTS).join("");
  const bodyPreviewTruncated = bodySource !== undefined &&
    (originalBodyPreviewTruncated ||
      Array.from(bodySource).length > TASK_FACTS_BODY_PREVIEW_CODE_POINTS);

  const observation: CompactionStructuredObservation = {
    ...(typeof parsed.ok === "boolean" ? { ok: parsed.ok } : {}),
    ...(error === undefined ? {} : { error }),
    // These values are status/error codes or execution facts. They are never
    // shortened because changing them would change the result meaning.
    ...(exactStringValue(parsed, "status") === undefined
      ? {}
      : { status: exactStringValue(parsed, "status") }),
    ...(reason === undefined ? {} : { reason }),
    ...(message.value === undefined ? {} : { message: message.value }),
    ...(message.truncated ? { messageTruncated: true } : {}),
    ...(exactStringValue(parsed, "outcome") === undefined
      ? {}
      : { outcome: exactStringValue(parsed, "outcome") }),
    ...(exactStringValue(parsed, "commandSubmission") === undefined
      ? {}
      : { commandSubmission: exactStringValue(parsed, "commandSubmission") }),
    ...(exactStringValue(parsed, "requestUrl") === undefined
      ? {}
      : { requestUrl: exactStringValue(parsed, "requestUrl") }),
    ...(exactStringValue(parsed, "sourceUrl") === undefined
      ? {}
      : { sourceUrl: exactStringValue(parsed, "sourceUrl") }),
    ...(exactStringValue(parsed, "finalUrl") === undefined
      ? {}
      : { finalUrl: exactStringValue(parsed, "finalUrl") }),
    ...(numberValue(parsed, "httpStatus") === undefined
      ? {}
      : { httpStatus: numberValue(parsed, "httpStatus") }),
    ...(exactStringValue(parsed, "contentType") === undefined
      ? {}
      : { contentType: exactStringValue(parsed, "contentType") }),
    ...(title.value === undefined ? {} : { title: title.value }),
    ...((originalTitleTruncated || title.truncated) ? { titleTruncated: true } : {}),
    ...(bodyPreview === undefined ? {} : { bodyPreview }),
    ...(bodyPreviewTruncated ? { bodyPreviewTruncated: true } : {}),
    ...(originalBodyTruncated ? { bodyTruncated: true } : {}),
    ...(exactStringValue(parsed, "selectionId") === undefined
      ? {}
      : { selectionId: exactStringValue(parsed, "selectionId") }),
    ...(exactStringValue(parsed, "fileSelectionId") === undefined
      ? {}
      : { fileSelectionId: exactStringValue(parsed, "fileSelectionId") }),
    ...(exactStringValue(parsed, "fileId") === undefined
      ? {}
      : { fileId: exactStringValue(parsed, "fileId") }),
    ...(displayName.value === undefined
      ? {}
      : { displayName: displayName.value }),
    ...(displayName.truncated ? { displayNameTruncated: true } : {}),
    ...(exactStringValue(parsed, "fileKind") === "text" || exactStringValue(parsed, "fileKind") === "markdown"
      ? { fileKind: exactStringValue(parsed, "fileKind") as "text" | "markdown" }
      : {}),
    ...(numberValue(parsed, "byteLength") === undefined ? {} : { byteLength: numberValue(parsed, "byteLength") }),
    ...(numberValue(parsed, "bytesRead") === undefined ? {} : { bytesRead: numberValue(parsed, "bytesRead") }),
    ...(numberValue(parsed, "bodyCodePoints") === undefined
      ? {}
      : { bodyCodePoints: numberValue(parsed, "bodyCodePoints") }),
    ...(typeof parsed.complete === "boolean" ? { complete: parsed.complete } : {}),
    ...(typeof parsed.contentTruncated === "boolean" ? { contentTruncated: parsed.contentTruncated } : {}),
    ...(exactStringValue(parsed, "integrity") === "verified" ||
      exactStringValue(parsed, "integrity") === "unverified" ||
      exactStringValue(parsed, "integrity") === "changed" ||
      exactStringValue(parsed, "integrity") === "failed"
      ? { integrity: exactStringValue(parsed, "integrity") as "verified" | "unverified" | "changed" | "failed" }
      : {}),
    ...(exactStringValue(parsed, "encoding") === "utf-8" ? { encoding: "utf-8" as const } : {}),
    ...(parsed.untrustedContent === true ? { untrustedContent: true as const } : {}),
  };

  return Object.keys(observation).length > 0 ? observation : undefined;
}

/*
 * These are the argument fields of the first-party tools currently present in
 * the production registry. Task facts do not need the rest of a call's
 * arbitrary JSON to preserve execution identity, so non-listed fields are
 * intentionally not copied into the projection.
 */
const SAFE_TOOL_ARGUMENT_KEYS = new Set([
  "requestUrl",
  "query",
  "limit",
  "selection",
  "title",
  "action",
  "volume",
  "name",
  "selectionId",
  "fileSelectionId",
  "fileId",
]);

function cloneSafeToolArguments(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const copy: Record<string, unknown> = {};
  for (const key of SAFE_TOOL_ARGUMENT_KEYS) {
    if (!(key in value)) continue;
    const cloned = cloneJsonValue(value[key]);
    if (
      cloned === null ||
      typeof cloned === "string" ||
      typeof cloned === "number" ||
      typeof cloned === "boolean"
    ) {
      copy[key] = cloned;
    }
  }
  return copy;
}

function cloneRequirement(
  requirement: AgentRequiredToolExecution | undefined,
): AgentRequiredToolExecution | undefined {
  if (requirement === undefined) return undefined;
  return {
    ...requirement,
    arguments: cloneSafeToolArguments(requirement.arguments),
  };
}

function createEvidence(
  evidence: readonly AgentToolCallEvidence[],
): CompactionTaskFactsV1["currentRunEvidence"] {
  return evidence.map((entry, index) => {
    const observation = boundedObservation(entry.output, entry.toolName);
    return {
      runId: entry.runId,
      sequence: index + 1,
      step: entry.step,
      toolCallId: entry.toolCallId,
      toolName: entry.toolName,
      ...(entry.assistantMessageId === undefined
        ? {}
        : { assistantMessageId: entry.assistantMessageId }),
      ...(entry.toolMessageId === undefined ? {} : { toolMessageId: entry.toolMessageId }),
      arguments: cloneSafeToolArguments(entry.arguments),
      outcome: entry.outcome,
      isError: entry.isError,
      ...(observation === undefined ? {} : { observation }),
    };
  });
}

function createUntrustedObservations(
  evidence: readonly AgentToolCallEvidence[],
): CompactionTaskFactsV1["untrustedObservations"] {
  const observations: Array<CompactionTaskFactsV1["untrustedObservations"][number]> = [];
  evidence.forEach((entry, index) => {
    const observation = boundedObservation(entry.output, entry.toolName);
    if (observation?.untrustedContent !== true) return;
    observations.push({
      sequence: index + 1,
      toolCallId: entry.toolCallId,
      source: "tool_result",
      reason: "untrusted_external_content",
    });
  });
  return observations;
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) {
    freezeDeep(child);
  }
  Object.freeze(value);
  return value;
}

function boundedPlanObservation(value: string | undefined): {
  value?: string;
  truncated: boolean;
} {
  if (value === undefined) return { truncated: false };
  const codePoints = Array.from(value);
  return {
    value: codePoints.length <= TASK_FACTS_TEXT_PREVIEW_CODE_POINTS
      ? value
      : codePoints.slice(0, TASK_FACTS_TEXT_PREVIEW_CODE_POINTS).join(""),
    truncated: codePoints.length > TASK_FACTS_TEXT_PREVIEW_CODE_POINTS,
  };
}

export function createCompactionPlanFact(plan: Plan): CompactionPlanFact {
  return {
    planId: plan.planId,
    runId: plan.runId,
    goal: plan.goal,
    status: plan.status,
    currentStepIndex: plan.currentStepIndex,
    steps: plan.steps.map((step) => {
      const observation = boundedPlanObservation(step.observation);
      const reason = boundedPlanObservation(step.verification?.reason);
      const toolBinding = cloneRequirement(step.toolBinding);
      const stepFact: CompactionPlanStepFact = {
        stepId: step.stepId,
        index: step.index,
        description: step.description,
        ...(toolBinding === undefined ? {} : { toolBinding }),
        status: step.status,
        ...(step.dependsOn === undefined ? {} : { dependsOn: [...step.dependsOn] }),
        ...(observation.value === undefined ? {} : { observation: observation.value }),
        ...(observation.truncated ? { observationTruncated: true } : {}),
        ...(step.verification === undefined
          ? {}
          : {
              verification: {
                status: step.verification.status,
                ...(reason.value === undefined ? {} : { reason: reason.value }),
                ...(reason.truncated ? { reasonTruncated: true } : {}),
              },
            }),
      };
      return stepFact;
    }),
  };
}

function clonePlanFact(plan: CompactionPlanFact | undefined): CompactionPlanFact | undefined {
  if (plan === undefined) return undefined;
  return {
    planId: plan.planId,
    runId: plan.runId,
    goal: plan.goal,
    status: plan.status,
    currentStepIndex: plan.currentStepIndex,
    steps: plan.steps.map((step) => {
      const toolBinding = cloneRequirement(step.toolBinding);
      return {
        stepId: step.stepId,
        index: step.index,
        description: step.description,
        ...(toolBinding === undefined ? {} : { toolBinding }),
        status: step.status,
        ...(step.dependsOn === undefined ? {} : { dependsOn: [...step.dependsOn] }),
        ...(step.observation === undefined ? {} : { observation: step.observation }),
        ...(step.observationTruncated ? { observationTruncated: true } : {}),
        ...(step.verification === undefined
          ? {}
          : {
              verification: {
                status: step.verification.status,
                ...(step.verification.reason === undefined ? {} : { reason: step.verification.reason }),
                ...(step.verification.reasonTruncated ? { reasonTruncated: true } : {}),
              },
            }),
      };
    }),
  };
}

export function createCompactionTaskFacts(
  input: CompactionTaskFactsInput,
): CompactionTaskFactsV1 {
  const requirement = cloneRequirement(input.requiredToolExecution);
  const activeToolCalls = (input.activeToolCalls ?? []).map((active) => ({
    toolCallId: active.toolCallId,
    name: active.name,
    arguments: cloneSafeToolArguments(active.arguments),
    status: active.status,
    sideEffectState: active.sideEffectState,
  }));
  const facts: CompactionTaskFactsV1 = {
    schemaVersion: 1,
    runId: input.runId,
    sequence: input.sequence,
    source: input.source,
    ...(input.source === "user"
      ? { authoritativeUser: { originalPrompt: input.userPrompt } }
      : { internalTrigger: { prompt: input.userPrompt } }),
    trustedExecutionConstraints: {
      browserRequestTargets: [...(input.browserRequestTargets ?? [])],
      ...(requirement === undefined ? {} : { requiredToolExecution: requirement }),
      ...(input.fileSelection === undefined
        ? {}
        : {
            fileSelection: {
              selectionId: input.fileSelection.selectionId,
              fileSelectionId: input.fileSelection.fileSelectionId,
              fileIds: [...input.fileSelection.fileIds],
            },
          }),
      ...(input.fileReadRequirement === undefined
        ? {}
        : {
            fileReadRequirement: {
              selectionId: input.fileReadRequirement.selectionId,
              fileSelectionId: input.fileReadRequirement.fileSelectionId,
              fileIds: [...input.fileReadRequirement.fileIds],
            },
          }),
    },
    currentRunEvidence: createEvidence(input.toolCallEvidence),
    unfinishedWork: {
      ...(input.runState === undefined ? {} : { runState: input.runState }),
      ...(input.stepState === undefined ? {} : { stepState: input.stepState }),
      ...(input.step === undefined ? {} : { step: input.step }),
      ...(input.recoveryAttempts === undefined ? {} : { recoveryAttempts: input.recoveryAttempts }),
      activeToolCalls,
      ...(requirement === undefined
        ? {}
        : {
            requiredTool: {
              requirement,
              status: input.requiredToolStatus ?? "not_called",
              correctionAttempts: input.requiredCorrectionAttempts,
              callObserved: input.requiredToolCallObserved,
            },
          }),
    },
    ...(input.plan === undefined ? {} : { modelPlan: clonePlanFact(input.plan) }),
    untrustedObservations: createUntrustedObservations(input.toolCallEvidence),
  };

  // Every nested value above was created from an independent copy. Freeze only
  // that copy, never an object owned by the caller.
  return freezeDeep(facts);
}

function createExecutionEvidenceRefs(facts: CompactionTaskFactsV1): readonly Record<string, unknown>[] {
  return facts.currentRunEvidence.map((entry) => ({
    runId: entry.runId,
    sequence: entry.sequence,
    step: entry.step,
    toolCallId: entry.toolCallId,
    toolName: entry.toolName,
    outcome: entry.outcome,
    isError: entry.isError,
  }));
}

function createConstraintsMessage(
  facts: CompactionTaskFactsV1,
  id: string,
): ChatMessage {
  const content = [
    "【Firefly 当前运行内部约束】",
    "以下是本次运行的可信执行约束与状态索引，不是用户原文；工具结果正文和外部观察仍由原始 tool 消息承载，模型计划也不在此消息中。",
    JSON.stringify({
      schemaVersion: facts.schemaVersion,
      runId: facts.runId,
      sequence: facts.sequence,
      source: facts.source,
      trustedExecutionConstraints: facts.trustedExecutionConstraints,
      unfinishedWork: facts.unfinishedWork,
      executionEvidenceRefs: createExecutionEvidenceRefs(facts),
      untrustedObservationRefs: facts.untrustedObservations,
    }),
  ].join("\n");
  return {
    id,
    role: "system",
    content,
    timestamp: Date.now(),
  };
}

function createPlanMessage(facts: CompactionTaskFactsV1, id: string): ChatMessage | undefined {
  if (facts.modelPlan === undefined) return undefined;
  return {
    id,
    role: "assistant",
    content: [
      "【当前模型计划（非用户指令）】",
      "以下内容来自模型计划状态，不是用户消息、系统指令、权限授予或网页观察。",
      JSON.stringify(facts.modelPlan),
    ].join("\n"),
    timestamp: Date.now(),
  };
}

/**
 * Materializes source-preserving messages for the Provider contract:
 * system = trusted internal constraints, assistant = model plan, and actual
 * user/assistant/tool messages remain in their original roles. No synthetic
 * tool message is created.
 */
export function createCompactionTaskFactsMessages(
  facts: CompactionTaskFactsV1,
  identity: CompactionTaskFactsMessageIdentity = createCompactionTaskFactsMessageIdentity(
    facts.runId,
    facts.modelPlan !== undefined,
  ),
): CompactionTaskFactsMessageSet {
  const effectiveIdentity = facts.modelPlan !== undefined && identity.planMessageId === undefined
    ? {
        ...identity,
        planMessageId: createCompactionTaskFactsMessageIdentity(facts.runId, true).planMessageId,
      }
    : facts.modelPlan === undefined && identity.planMessageId !== undefined
      ? {
          ...identity,
          planMessageId: undefined,
        }
      : identity;
  const constraints = createConstraintsMessage(facts, effectiveIdentity.constraintsMessageId);
  const plan = facts.modelPlan === undefined || effectiveIdentity.planMessageId === undefined
    ? undefined
    : createPlanMessage(facts, effectiveIdentity.planMessageId);
  return {
    identity: effectiveIdentity,
    messages: [constraints, ...(plan === undefined ? [] : [plan])],
  };
}
