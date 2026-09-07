import { randomUUID } from "node:crypto";
import type { CapabilityJsonValue, CapabilityRequester } from "../../../shared/capability-types";
import {
  createSubAgentTaskId,
  isSubAgentBudgetWithinParent,
  type SubAgentFailure,
  type SubAgentResult,
  type SubAgentTask,
  type SubAgentTaskConstraints,
  type SubAgentTaskId,
  type SubAgentTaskInput,
  type SubAgentTaskRecord,
  type SubAgentTaskState,
} from "../../../shared/subagent-types";
import { SubAgentRegistry } from "./subagent-registry";
import { SubAgentServiceError } from "./subagent-errors";

export interface SubAgentTaskServiceOptions {
  readonly registry: SubAgentRegistry;
  readonly now?: () => number;
  readonly createTaskId?: () => SubAgentTaskId;
}

function defaultNow(): number {
  return Date.now();
}

function defaultCreateTaskId(): SubAgentTaskId {
  return createSubAgentTaskId(`subagent-task-${randomUUID()}`);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isCapabilityJsonValue(value: unknown): value is CapabilityJsonValue {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((entry) => isCapabilityJsonValue(entry));
  if (typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value).every((entry) => isCapabilityJsonValue(entry));
}

function cloneJson<T extends CapabilityJsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneRequester(requester: CapabilityRequester): CapabilityRequester {
  return Object.freeze({ ...requester });
}

function validateRequester(requester: CapabilityRequester): void {
  if (typeof requester !== "object" || requester === null || !isNonEmptyString(requester.id)) {
    throw new SubAgentServiceError(
      "INVALID_TASK",
      "SubAgent task requester metadata is invalid.",
    );
  }

  if (
    requester.type !== "main-agent" &&
    requester.type !== "subagent" &&
    requester.type !== "system-runtime"
  ) {
    throw new SubAgentServiceError(
      "INVALID_TASK",
      "SubAgent task requester type is invalid.",
    );
  }

  if (requester.type === "subagent") {
    if (!isNonEmptyString(requester.subAgentId) || !isNonEmptyString(requester.taskId)) {
      throw new SubAgentServiceError(
        "INVALID_TASK",
        "SubAgent requester must carry both profile and task identity.",
      );
    }
    if (requester.parentRunId !== undefined && !isNonEmptyString(requester.parentRunId)) {
      throw new SubAgentServiceError(
        "INVALID_TASK",
        "SubAgent requester parentRunId must be non-empty when provided.",
      );
    }
  }
}

function validateConstraints(constraints: SubAgentTaskConstraints): void {
  if (typeof constraints !== "object" || constraints === null) {
    throw new SubAgentServiceError(
      "INVALID_TASK",
      "SubAgent task constraints must be an object.",
    );
  }
  if (!isPositiveInteger(constraints.maxSteps)) {
    throw new SubAgentServiceError(
      "INVALID_TASK",
      "SubAgent task maxSteps must be a positive integer.",
    );
  }
  if (!isNonNegativeInteger(constraints.maxToolCalls)) {
    throw new SubAgentServiceError(
      "INVALID_TASK",
      "SubAgent task maxToolCalls must be a non-negative integer.",
    );
  }
  if (!isPositiveInteger(constraints.timeoutMs)) {
    throw new SubAgentServiceError(
      "INVALID_TASK",
      "SubAgent task timeoutMs must be a positive integer.",
    );
  }
  if (!isNonNegativeInteger(constraints.maxDepth)) {
    throw new SubAgentServiceError(
      "INVALID_TASK",
      "SubAgent task maxDepth must be a non-negative integer.",
    );
  }
}

function validateInput(input: SubAgentTaskInput): void {
  if (typeof input !== "object" || input === null) {
    throw new SubAgentServiceError("INVALID_TASK", "SubAgent task must be an object.");
  }
  if (!isNonEmptyString(input.subAgentId)) {
    throw new SubAgentServiceError("INVALID_TASK", "SubAgent task profile ID is required.");
  }
  if (!isNonEmptyString(input.objective)) {
    throw new SubAgentServiceError("INVALID_TASK", "SubAgent task objective is required.");
  }
  if (!isCapabilityJsonValue(input.input)) {
    throw new SubAgentServiceError(
      "INVALID_TASK",
      "SubAgent task input must be serializable JSON data.",
    );
  }
  validateRequester(input.requester);
  validateConstraints(input.constraints);
  if (!isNonNegativeInteger(input.depth)) {
    throw new SubAgentServiceError(
      "INVALID_DELEGATION_DEPTH",
      "SubAgent task depth must be a non-negative integer.",
    );
  }
  if (input.depth > input.constraints.maxDepth) {
    throw new SubAgentServiceError(
      "INVALID_DELEGATION_DEPTH",
      "SubAgent task depth cannot exceed maxDepth.",
    );
  }
  if (input.parentRunId !== undefined && !isNonEmptyString(input.parentRunId)) {
    throw new SubAgentServiceError(
      "INVALID_TASK",
      "SubAgent task parentRunId must be non-empty when provided.",
    );
  }
  if (input.parentTaskId !== undefined && !isNonEmptyString(input.parentTaskId)) {
    throw new SubAgentServiceError(
      "INVALID_TASK",
      "SubAgent task parentTaskId must be non-empty when provided.",
    );
  }
  if (input.createdAt !== undefined && !isFiniteTimestamp(input.createdAt)) {
    throw new SubAgentServiceError(
      "INVALID_TASK",
      "SubAgent task createdAt must be a finite timestamp.",
    );
  }
}

const SUBAGENT_FAILURE_CODES = new Set([
  "RUNTIME_FAILURE",
  "TIMEOUT",
  "CAPABILITY_FAILURE",
  "INVALID_OUTPUT",
  "CANCELLED",
]);

function freezeFailure(failure: SubAgentFailure): SubAgentFailure {
  return Object.freeze({
    code: failure.code,
    message: failure.message,
    ...(failure.details !== undefined ? { details: cloneJson(failure.details) } : {}),
  });
}

function freezeResult(result: SubAgentResult): SubAgentResult {
  if (result.ok) {
    return Object.freeze({
      ok: true,
      output: cloneJson(result.output),
      ...(result.summary !== undefined ? { summary: result.summary } : {}),
    });
  }
  return Object.freeze({ ok: false, error: freezeFailure(result.error) });
}

function freezeTask(task: SubAgentTask): SubAgentTask {
  return Object.freeze({
    ...task,
    requester: cloneRequester(task.requester),
    input: cloneJson(task.input),
    constraints: Object.freeze({ ...task.constraints }),
  });
}

function freezeRecord(record: SubAgentTaskRecord): SubAgentTaskRecord {
  return Object.freeze({
    task: freezeTask(record.task),
    state: record.state,
    ...(record.result ? { result: freezeResult(record.result) } : {}),
    ...(record.startedAt !== undefined ? { startedAt: record.startedAt } : {}),
    ...(record.resolvedAt !== undefined ? { resolvedAt: record.resolvedAt } : {}),
  });
}

export class SubAgentTaskService {
  private readonly registry: SubAgentRegistry;
  private readonly now: () => number;
  private readonly createTaskId: () => SubAgentTaskId;
  private readonly records = new Map<SubAgentTaskId, SubAgentTaskRecord>();

  constructor(options: SubAgentTaskServiceOptions) {
    this.registry = options.registry;
    this.now = options.now ?? defaultNow;
    this.createTaskId = options.createTaskId ?? defaultCreateTaskId;
  }

  createTask(input: SubAgentTaskInput): SubAgentTaskRecord {
    validateInput(input);
    if (!this.registry.has(input.subAgentId)) {
      throw new SubAgentServiceError(
        "SUBAGENT_NOT_FOUND",
        `SubAgent "${input.subAgentId}" is not registered.`,
      );
    }

    const createdAt = input.createdAt ?? this.now();
    if (!isFiniteTimestamp(createdAt)) {
      throw new SubAgentServiceError("INVALID_TASK", "SubAgent task clock must be finite.");
    }

    let parent: SubAgentTaskRecord | undefined;
    if (input.parentTaskId !== undefined) {
      parent = this.records.get(input.parentTaskId);
      if (!parent) {
        throw new SubAgentServiceError(
          "TASK_NOT_FOUND",
          `Parent task "${input.parentTaskId}" was not found.`,
        );
      }
      if (input.depth !== parent.task.depth + 1) {
        throw new SubAgentServiceError(
          "INVALID_DELEGATION_DEPTH",
          "Child task depth must be exactly one greater than its parent task.",
        );
      }
      if (!isSubAgentBudgetWithinParent(parent.task.constraints, input.constraints)) {
        throw new SubAgentServiceError(
          "INVALID_TASK",
          "Child task constraints cannot exceed the parent task budget.",
        );
      }
    } else if (input.depth !== 0) {
      throw new SubAgentServiceError(
        "INVALID_DELEGATION_DEPTH",
        "A root SubAgent task must have depth 0.",
      );
    }

    const taskId = this.createTaskId();
    if (this.records.has(taskId)) {
      throw new SubAgentServiceError(
        "TASK_ID_COLLISION",
        `SubAgent task "${taskId}" already exists.`,
      );
    }

    const task = freezeTask({
      taskId,
      subAgentId: input.subAgentId,
      ...(input.parentRunId !== undefined ? { parentRunId: input.parentRunId } : {}),
      ...(input.parentTaskId !== undefined ? { parentTaskId: input.parentTaskId } : {}),
      requester: input.requester,
      objective: input.objective,
      input: input.input,
      constraints: input.constraints,
      depth: input.depth,
      createdAt,
    });
    const record = freezeRecord({ task, state: "pending" });
    this.records.set(taskId, record);
    return record;
  }

  get(taskId: SubAgentTaskId): SubAgentTaskRecord | undefined {
    return this.records.get(taskId);
  }

  list(): readonly SubAgentTaskRecord[] {
    return Object.freeze(Array.from(this.records.values()));
  }

  start(taskId: SubAgentTaskId): SubAgentTaskRecord {
    const record = this.require(taskId);
    if (record.state !== "pending") this.rejectTransition(record);
    return this.transition(record, "running", undefined, this.now());
  }

  succeed(taskId: SubAgentTaskId, result: Extract<SubAgentResult, { ok: true }>): SubAgentTaskRecord {
    const record = this.require(taskId);
    if (record.state !== "running") this.rejectTransition(record);
    if (
      !isCapabilityJsonValue(result.output) ||
      (result.summary !== undefined && !isNonEmptyString(result.summary))
    ) {
      throw new SubAgentServiceError(
        "INVALID_RESULT",
        "SubAgent success output and summary must be serializable JSON data.",
      );
    }
    return this.transition(record, "succeeded", result, this.now());
  }

  fail(taskId: SubAgentTaskId, failure: SubAgentFailure): SubAgentTaskRecord {
    const record = this.require(taskId);
    if (record.state !== "running") this.rejectTransition(record);
    if (
      typeof failure !== "object" ||
      failure === null ||
      !SUBAGENT_FAILURE_CODES.has(failure.code) ||
      !isNonEmptyString(failure.message) ||
      !isCapabilityJsonValue(failure.details ?? null)
    ) {
      throw new SubAgentServiceError(
        "INVALID_RESULT",
        "SubAgent failure must contain a stable code, message, and serializable details.",
      );
    }
    return this.transition(record, "failed", { ok: false, error: failure }, this.now());
  }

  cancel(taskId: SubAgentTaskId, message = "The SubAgent task was cancelled."): SubAgentTaskRecord {
    const record = this.require(taskId);
    if (record.state !== "pending" && record.state !== "running") {
      this.rejectTransition(record);
    }
    return this.transition(record, "cancelled", {
      ok: false,
      error: { code: "CANCELLED", message },
    }, this.now());
  }

  private require(taskId: SubAgentTaskId): SubAgentTaskRecord {
    const record = this.records.get(taskId);
    if (!record) {
      throw new SubAgentServiceError(
        "TASK_NOT_FOUND",
        `SubAgent task "${taskId}" was not found.`,
      );
    }
    return record;
  }

  private rejectTransition(record: SubAgentTaskRecord): never {
    if (
      record.state === "succeeded" ||
      record.state === "failed" ||
      record.state === "cancelled"
    ) {
      throw new SubAgentServiceError(
        "TASK_ALREADY_TERMINAL",
        `SubAgent task "${record.task.taskId}" is already ${record.state}.`,
      );
    }
    throw new SubAgentServiceError(
      "INVALID_TASK_TRANSITION",
      `SubAgent task "${record.task.taskId}" cannot transition from ${record.state}.`,
    );
  }

  private transition(
    record: SubAgentTaskRecord,
    state: SubAgentTaskState,
    result: SubAgentResult | undefined,
    timestamp: number,
  ): SubAgentTaskRecord {
    if (!isFiniteTimestamp(timestamp)) {
      throw new SubAgentServiceError("INVALID_TASK", "SubAgent task clock must be finite.");
    }
    const next = freezeRecord({
      task: record.task,
      state,
      ...(result ? { result } : {}),
      ...(state === "running"
        ? { startedAt: timestamp }
        : { startedAt: record.startedAt, resolvedAt: timestamp }),
    });
    this.records.set(record.task.taskId, next);
    return next;
  }
}
