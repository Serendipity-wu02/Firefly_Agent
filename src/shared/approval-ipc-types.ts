/**
 * Serializable IPC contracts for the minimal Approval window.
 *
 * The renderer can submit only an action. ApprovalService creates and
 * validates the ONCE grant in the main process.
 */

import type {
  ApprovalRecord,
  ApprovalRequestId,
} from "./approval-types";

export type ApprovalResolveAction = "approve" | "deny";

export interface ApprovalResolveRequest {
  readonly approvalRequestId: ApprovalRequestId;
  readonly action: ApprovalResolveAction;
}

export type ApprovalIpcErrorCode =
  | "APPROVAL_NOT_FOUND"
  | "APPROVAL_ALREADY_RESOLVED"
  | "INVALID_APPROVAL_REQUEST"
  | "INVALID_APPROVAL_GRANT"
  | "APPROVAL_ID_COLLISION"
  | "APPROVAL_NOT_CURRENT"
  | "APPROVAL_INVALID_ACTION";

export type ApprovalIpcResponse =
  | {
      readonly ok: true;
      readonly record: ApprovalRecord;
    }
  | {
      readonly ok: false;
      readonly code: ApprovalIpcErrorCode;
      readonly message: string;
    };

export interface ApprovalChangedEvent {
  readonly record: ApprovalRecord | null;
}
