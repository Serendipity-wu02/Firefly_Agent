/**
 * @file capability-types.ts
 * @description Serializable capability contracts shared by future runtime boundaries.
 *
 * These types describe authority metadata and requests only. They do not grant
 * authorization and they do not execute tools.
 */

import type { SubAgentId, SubAgentTaskId } from "./subagent-types";
import type { ToolRiskLevel, ToolSideEffect } from "./tool-types";

declare const capabilityIdBrand: unique symbol;
declare const capabilityCategoryBrand: unique symbol;
declare const capabilityRequestIdBrand: unique symbol;

export type CapabilityId = string & {
  readonly [capabilityIdBrand]: true;
};

export type CapabilityCategory = string & {
  readonly [capabilityCategoryBrand]: true;
};

export type CapabilityRequestId = string & {
  readonly [capabilityRequestIdBrand]: true;
};

/** Create a stable, non-empty capability identifier without generating identity. */
export function createCapabilityId(value: string): CapabilityId {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("Capability ID must be a non-empty string.");
  }
  return value as CapabilityId;
}

/** Create a stable, non-empty descriptor category. */
export function createCapabilityCategory(value: string): CapabilityCategory {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("Capability category must be a non-empty string.");
  }
  return value as CapabilityCategory;
}

/** Create a stable capability-request correlation identifier. */
export function createCapabilityRequestId(value: string): CapabilityRequestId {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("Capability request ID must be a non-empty string.");
  }
  return value as CapabilityRequestId;
}

export type CapabilityJsonValue =
  | string
  | number
  | boolean
  | null
  | { readonly [key: string]: CapabilityJsonValue }
  | readonly CapabilityJsonValue[];

export interface CapabilityDescriptor {
  readonly id: CapabilityId;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly category: CapabilityCategory;
  /** Reuses the existing ToolDefinition risk vocabulary for policy/UI only. */
  readonly risk?: ToolRiskLevel;
  readonly sideEffect?: ToolSideEffect;
}

export type CapabilityRequester =
  | {
      readonly type: "main-agent";
      readonly id: string;
    }
  | {
      readonly type: "subagent";
      readonly id: string;
      /** Stable delegated-worker profile identity. */
      readonly subAgentId: SubAgentId;
      /** Unique delegated-task identity. */
      readonly taskId: SubAgentTaskId;
      readonly parentRunId?: string;
    }
  | {
      readonly type: "system-runtime";
      readonly id: string;
    };

export interface CapabilityRequest<TInput extends CapabilityJsonValue = CapabilityJsonValue> {
  readonly requestId: CapabilityRequestId;
  readonly capabilityId: CapabilityId;
  readonly requester: CapabilityRequester;
  readonly input: TInput;
}

/** Runtime-only context kept separate from the serializable request DTO. */
export interface CapabilityContext {
  readonly runId: string;
  readonly conversationId?: string;
  /** The exact Harness tool-call identity for authorization correlation. */
  readonly toolCallId?: string;
  readonly signal?: AbortSignal;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type CapabilityErrorCode =
  | "NOT_REGISTERED"
  | "INVALID_REQUEST"
  | "UNAVAILABLE"
  | "DUPLICATE_ID"
  | "INVALID_DESCRIPTOR";

export interface CapabilityError {
  readonly code: CapabilityErrorCode;
  readonly message: string;
  readonly details?: CapabilityJsonValue;
}

export type CapabilityResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
    }
  | {
      readonly ok: false;
      readonly error: CapabilityError;
    };

/**
 * Metadata-only boundary between a concrete tool and the capability it may
 * require. Existing tools are not required to declare bindings in this phase.
 */
export interface CapabilityBinding {
  readonly capabilityId: CapabilityId;
  readonly toolId: string;
}
