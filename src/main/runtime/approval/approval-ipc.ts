import { ipcMain } from "electron";
import type {
  ApprovalIpcResponse,
  ApprovalResolveRequest,
} from "../../../shared/approval-ipc-types";
import {
  createApprovalRequestId,
  type ApprovalRequestId,
} from "../../../shared/approval-types";
import { IPC } from "../../../shared/ipc-channels";
import { ApprovalService } from "./approval-service";
import { ApprovalServiceError } from "./approval-errors";
import {
  ApprovalPresentationCoordinator as ApprovalWindowCoordinator,
  type ApprovalWindowHost,
} from "./approval-presentation-coordinator";
import type { WindowManager } from "../../windows/window-manager";

export interface ApprovalIpcRegistration {
  readonly coordinator: ApprovalWindowCoordinator;
  readonly notifyPending: () => void;
  readonly dispose: () => void;
}

function isApprovalResolveRequest(value: unknown): value is ApprovalResolveRequest {
  if (typeof value !== "object" || value === null) return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request.approvalRequestId === "string" &&
    request.approvalRequestId.trim().length > 0 &&
    (request.action === "approve" || request.action === "deny")
  );
}

function toApprovalRequestId(value: string): ApprovalRequestId {
  return createApprovalRequestId(value);
}

function toIpcError(error: unknown): ApprovalIpcResponse {
  if (error instanceof ApprovalServiceError) {
    return { ok: false, code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { ok: false, code: "APPROVAL_NOT_CURRENT", message: error.message };
  }
  return {
    ok: false,
    code: "INVALID_APPROVAL_REQUEST",
    message: "The approval request could not be resolved.",
  };
}

/** Register the only renderer-facing Approval surface in the main process. */
export function registerApprovalIpc(options: {
  readonly approvalService: ApprovalService;
  readonly windowManager: WindowManager;
}): ApprovalIpcRegistration {
  const windowHost: ApprovalWindowHost = options.windowManager;
  const coordinator = new ApprovalWindowCoordinator({
    approvalService: options.approvalService,
    windowHost,
  });

  const isApprovalSurfaceSender = (sender: unknown): boolean =>
    options.windowManager.isApprovalSurfaceSender(sender);

  ipcMain.handle(IPC.APPROVAL_GET, (event) => {
    if (!isApprovalSurfaceSender(event.sender)) {
      throw new Error("Approval IPC is only available in Chat or the approval window.");
    }
    return coordinator.getCurrentRecord();
  });

  ipcMain.handle(IPC.APPROVAL_RESOLVE, (event, payload: unknown): ApprovalIpcResponse => {
    if (!isApprovalSurfaceSender(event.sender)) {
      return {
        ok: false,
        code: "INVALID_APPROVAL_REQUEST",
        message: "Approval IPC is only available in Chat or the approval window.",
      };
    }
    if (!isApprovalResolveRequest(payload)) {
      return {
        ok: false,
        code: "APPROVAL_INVALID_ACTION",
        message: "Approval resolution must contain an approval request ID and action.",
      };
    }

    try {
      const record = coordinator.resolveCurrent(
        toApprovalRequestId(payload.approvalRequestId),
        payload.action,
      );
      return { ok: true, record };
    } catch (error) {
      coordinator.refresh();
      return toIpcError(error);
    }
  });

  return {
    coordinator,
    notifyPending: () => coordinator.notifyPending(),
    dispose: () => {
      coordinator.dispose();
      ipcMain.removeHandler(IPC.APPROVAL_GET);
      ipcMain.removeHandler(IPC.APPROVAL_RESOLVE);
    },
  };
}
