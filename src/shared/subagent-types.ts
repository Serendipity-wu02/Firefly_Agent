/**
 * @file subagent-types.ts
 * @description Serializable SubAgent identity, task, budget, lifecycle, and
 * structured-result contracts.
 *
 * These contracts describe a functional delegated worker. They do not create
 * an Agent loop, grant authority, evaluate a Sandbox, request Approval, or
 * perform a concrete operation.
 */

import type {
  CapabilityId,
  CapabilityJsonValue,
  CapabilityRequester,
} from "./capability-types";

declare const subAgentIdBrand: unique symbol;
declare const subAgentTaskIdBrand: unique symbol;

export type SubAgentId = string & {
  readonly [subAgentIdBrand]: true;
};

export type SubAgentTaskId = string & {
  readonly [subAgentTaskIdBrand]: true;
};

export function createSubAgentId(value: string): SubAgentId {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("SubAgent ID must be a non-empty string.");
  }
  return value as SubAgentId;
}

export function createSubAgentTaskId(value: string): SubAgentTaskId {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("SubAgent task ID must be a non-empty string.");
  }
  return value as SubAgentTaskId;
}

/** Declarative profile metadata; it contains no mutable runtime dependencies. */
export interface SubAgentDescriptor {
  readonly id: SubAgentId;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  /** Capabilities this profile may request; this is not authorization. */
  readonly capabilities: readonly CapabilityId[];
}

/** Explicit limits carried by a task for a future bounded runtime. */
export interface SubAgentTaskConstraints {
  readonly maxSteps: number;
  readonly maxToolCalls: number;
  readonly timeoutMs: number;
  readonly maxDepth: number;
}

/** A serializable delegated-work description owned by the main runtime. */
export interface SubAgentTask {
  readonly taskId: SubAgentTaskId;
  readonly subAgentId: SubAgentId;
  readonly parentRunId?: string;
  readonly parentTaskId?: SubAgentTaskId;
  /** The main agent or a parent delegated worker that requested this task. */
  readonly requester: CapabilityRequester;
  /** Functional work objective; character/persona presentation stays with Firefly. */
  readonly objective: string;
  readonly input: CapabilityJsonValue;
  readonly constraints: SubAgentTaskConstraints;
  readonly depth: number;
  readonly createdAt: number;
}

export type SubAgentTaskInput = Omit<SubAgentTask, "taskId" | "createdAt"> & {
  readonly createdAt?: number;
};

export type SubAgentTaskState =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type SubAgentFailureCode =
  | "RUNTIME_FAILURE"
  | "TIMEOUT"
  | "CAPABILITY_FAILURE"
  | "INVALID_OUTPUT"
  | "CANCELLED";

export interface SubAgentFailure {
  readonly code: SubAgentFailureCode;
  readonly message: string;
  readonly details?: CapabilityJsonValue;
}

export type SubAgentResult<TOutput extends CapabilityJsonValue = CapabilityJsonValue> =
  | {
      readonly ok: true;
      readonly output: TOutput;
      readonly summary?: string;
    }
  | {
      readonly ok: false;
      readonly error: SubAgentFailure;
    };

export interface SubAgentTaskRecord {
  readonly task: SubAgentTask;
  readonly state: SubAgentTaskState;
  readonly result?: SubAgentResult;
  readonly startedAt?: number;
  readonly resolvedAt?: number;
}

/** A bounded, read-only item explicitly projected into a worker run. */
export interface WorkerContextProjectionItem {
  readonly key: string;
  readonly value: CapabilityJsonValue;
}

/** Runtime profile consumed by the existing FireflyHarness worker mode. */
export interface WorkerExecutionProfile {
  readonly kind: "WORKER";
  readonly subAgentId: SubAgentId;
  readonly taskId: SubAgentTaskId;
  readonly requester: Extract<CapabilityRequester, { type: "subagent" }>;
  readonly signal?: AbortSignal;
  readonly objective: string;
  readonly contextProjection: readonly WorkerContextProjectionItem[];
  readonly allowedCapabilityIds: readonly CapabilityId[];
  /** Derived from the canonical capability bindings; not a second registry. */
  readonly allowedToolIds: readonly string[];
  readonly budget: SubAgentTaskConstraints;
}

export interface MainExecutionProfile {
  readonly kind: "MAIN";
  /**
   * Explicit entry-point grant for the Harness delegation operation.
   * Omission keeps non-chat MAIN callers, including proactive runs, on the
   * existing tool surface.
   */
  readonly allowSubAgentDelegation?: true;
  /** Explicit execution surface. "none" is used by internal proactive generation. */
  readonly toolSurface?: "default" | "none";
}

export type AgentExecutionProfile = MainExecutionProfile | WorkerExecutionProfile;

/** Future child tasks must not receive a larger finite budget than their parent. */
export function isSubAgentBudgetWithinParent(
  parent: SubAgentTaskConstraints,
  child: SubAgentTaskConstraints,
): boolean {
  return (
    child.maxSteps <= parent.maxSteps &&
    child.maxToolCalls <= parent.maxToolCalls &&
    child.timeoutMs <= parent.timeoutMs &&
    child.maxDepth <= parent.maxDepth
  );
}
