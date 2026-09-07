/**
 * @file approval-types.ts
 * @description Serializable contracts for the Approval Foundation.
 *
 * Approval answers whether a user consents to one requested authority/action.
 * It does not describe capability authority, evaluate sandbox profiles, or
 * execute tools.
 */

import type {
  CapabilityId,
  CapabilityRequestId,
  CapabilityRequester,
} from "./capability-types";
import type { SandboxScope } from "./sandbox-types";
import type { ToolRiskLevel, ToolSideEffect } from "./tool-types";

declare const approvalRequestIdBrand: unique symbol;

export type ApprovalRequestId = string & {
  readonly [approvalRequestIdBrand]: true;
};

/** Create a non-empty approval-request correlation identifier. */
export function createApprovalRequestId(value: string): ApprovalRequestId {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("Approval request ID must be a non-empty string.");
  }
  return value as ApprovalRequestId;
}

export type ApprovalRequirement = "none" | "required";

/** Contract-level relationship; capability descriptors remain metadata-only. */
export interface CapabilityApprovalRequirement {
  readonly capabilityId: CapabilityId;
  readonly requirement: ApprovalRequirement;
}

export type ApprovalState =
  | "pending"
  | "approved"
  | "denied"
  | "cancelled"
  | "expired";

export type ApprovalGrantLifetime = "once";

export interface ApprovalGrant {
  readonly lifetime: ApprovalGrantLifetime;
  /** The approved scope must be no wider than ApprovalRequest.effectiveScope. */
  readonly scope: SandboxScope;
}

export type ApprovalDenialCode =
  | "USER_DENIED"
  | "EXPIRED"
  | "CANCELLED"
  | "INVALID_REQUEST";

export interface ApprovalDenial {
  readonly code: ApprovalDenialCode;
  readonly message: string;
}

export type ApprovalDecision =
  | {
      readonly approved: true;
      readonly grant: ApprovalGrant;
    }
  | {
      readonly approved: false;
      readonly reason: ApprovalDenial;
    };

/** Serializable information a future human approval surface can display. */
export interface ApprovalRequest {
  readonly approvalRequestId: ApprovalRequestId;
  readonly capabilityRequestId: CapabilityRequestId;
  readonly capabilityId: CapabilityId;
  readonly requester: CapabilityRequester;
  readonly summary: string;
  readonly reason: string;
  readonly risk?: ToolRiskLevel;
  readonly sideEffect?: ToolSideEffect;
  readonly effectiveScope: SandboxScope;
  readonly createdAt: number;
  readonly expiresAt: number;
}

/** Input accepted by ApprovalService before it assigns request identity/time. */
export type ApprovalRequestInput = Omit<ApprovalRequest, "approvalRequestId" | "createdAt"> & {
  readonly createdAt?: number;
};

export interface ApprovalRecord {
  readonly request: ApprovalRequest;
  readonly state: ApprovalState;
  readonly decision?: ApprovalDecision;
  readonly resolvedAt?: number;
}
