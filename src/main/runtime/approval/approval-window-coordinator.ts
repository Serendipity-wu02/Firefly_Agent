import type { ApprovalChangedEvent } from "../../../shared/approval-ipc-types";
import type {
  ApprovalRecord,
  ApprovalRequestId,
} from "../../../shared/approval-types";
import { ApprovalService } from "./approval-service";

export type ApprovalPresentationSurface = "chat-inline" | "approval-window";

export interface ApprovalWindowHost {
  openApprovalWindow(): void;
  closeApprovalWindow(): boolean;
  sendApprovalChanged(event: ApprovalChangedEvent): void;
  setApprovalWindowCloseHandler(handler: (() => void) | null): void;
  isChatInlineReady?: () => boolean;
  sendApprovalInline?: (event: ApprovalChangedEvent) => void;
  clearApprovalInline?: () => void;
  setApprovalPresentationRefreshHandler?: (handler: (() => void) | null) => void;
}

export interface ApprovalWindowCoordinatorOptions {
  readonly approvalService: ApprovalService;
  readonly windowHost: ApprovalWindowHost;
  readonly now?: () => number;
  readonly schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  readonly cancelScheduled?: (timer: ReturnType<typeof setTimeout>) => void;
}

/**
 * Main-process presentation coordination only. ApprovalService remains the
 * sole owner of ApprovalRecord state; this class stores at most the displayed
 * request ID and the currently selected presentation surface.
 */
export class ApprovalPresentationCoordinator {
  private readonly approvalService: ApprovalService;
  private readonly windowHost: ApprovalWindowHost;
  private readonly now: () => number;
  private readonly schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  private readonly cancelScheduled: (timer: ReturnType<typeof setTimeout>) => void;
  private currentApprovalRequestId: ApprovalRequestId | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private waitingForTerminalWindowClose = false;
  private suppressWindowCloseCancellation = false;
  private activeSurface: ApprovalPresentationSurface | null = null;

  constructor(options: ApprovalWindowCoordinatorOptions) {
    this.approvalService = options.approvalService;
    this.windowHost = options.windowHost;
    this.now = options.now ?? (() => Date.now());
    this.schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.cancelScheduled = options.cancelScheduled ?? ((timer) => clearTimeout(timer));
    this.windowHost.setApprovalWindowCloseHandler(() => this.handleWindowClosed());
    this.windowHost.setApprovalPresentationRefreshHandler?.(() => this.refresh(true));
  }

  /** Reconcile a new pending request without creating a second presentation. */
  notifyPending(): void {
    this.refresh();
  }

  /** Reconcile the selected surface after a Chat visibility/lifecycle change. */
  refreshPresentation(): void {
    this.refresh(true);
  }

  /** Refresh expiry and return the record currently presented to the user. */
  getCurrentRecord(): ApprovalRecord | null {
    this.refresh();
    if (!this.currentApprovalRequestId) return null;
    return this.approvalService.get(this.currentApprovalRequestId) ?? null;
  }

  resolveCurrent(
    approvalRequestId: ApprovalRequestId,
    action: "approve" | "deny",
  ): ApprovalRecord {
    if (this.currentApprovalRequestId !== approvalRequestId) {
      throw new Error("The approval request is not the request currently displayed.");
    }

    const record = action === "approve"
      ? this.approvalService.approve(approvalRequestId)
      : this.approvalService.deny(approvalRequestId);
    this.finishTerminal(record);
    return record;
  }

  /** Deterministic test/runtime hook for clock-driven expiration. */
  refresh(forcePresentation = false): void {
    if (this.waitingForTerminalWindowClose) return;

    if (this.currentApprovalRequestId) {
      const current = this.approvalService.get(this.currentApprovalRequestId);
      if (current && current.state !== "pending") {
        this.finishTerminal(current);
        return;
      }
      if (!current) {
        this.currentApprovalRequestId = null;
        this.clearExpiryTimer();
        this.clearActivePresentation();
      } else {
        this.scheduleExpiry(current);
        this.presentPending(current, forcePresentation);
        return;
      }
    }

    const pending = [...this.approvalService.listPending()].sort((left, right) => {
      if (left.request.createdAt !== right.request.createdAt) {
        return left.request.createdAt - right.request.createdAt;
      }
      const leftId = left.request.approvalRequestId;
      const rightId = right.request.approvalRequestId;
      return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
    });
    const next = pending[0];
    if (!next) {
      this.clearActivePresentation();
      return;
    }

    this.currentApprovalRequestId = next.request.approvalRequestId;
    this.scheduleExpiry(next);
    this.presentPending(next, true);
  }

  dispose(): void {
    this.clearExpiryTimer();
    this.windowHost.setApprovalWindowCloseHandler(null);
    this.windowHost.setApprovalPresentationRefreshHandler?.(null);
    this.windowHost.clearApprovalInline?.();
    this.currentApprovalRequestId = null;
    this.waitingForTerminalWindowClose = false;
    this.suppressWindowCloseCancellation = false;
    this.activeSurface = null;
  }

  private scheduleExpiry(record: ApprovalRecord): void {
    this.clearExpiryTimer();
    const delayMs = Math.max(0, record.request.expiresAt - this.now());
    this.expiryTimer = this.schedule(() => {
      this.expiryTimer = null;
      this.refresh();
    }, delayMs);
  }

  private clearExpiryTimer(): void {
    if (this.expiryTimer !== null) {
      this.cancelScheduled(this.expiryTimer);
      this.expiryTimer = null;
    }
  }

  private presentPending(record: ApprovalRecord, forcePresentation: boolean): void {
    const inlineReady = this.windowHost.isChatInlineReady?.() === true &&
      this.windowHost.sendApprovalInline !== undefined;
    if (inlineReady) {
      const needsInlineEvent = forcePresentation || this.activeSurface !== "chat-inline";
      if (this.activeSurface === "approval-window") {
        this.suppressWindowCloseCancellation = true;
        this.activeSurface = "chat-inline";
        const closed = this.windowHost.closeApprovalWindow();
        if (!closed) this.suppressWindowCloseCancellation = false;
      } else {
        this.activeSurface = "chat-inline";
      }
      if (needsInlineEvent) {
        this.windowHost.sendApprovalInline?.({ record });
      }
      return;
    }

    if (this.activeSurface === "chat-inline") {
      this.windowHost.clearApprovalInline?.();
    }
    const needsWindow = this.activeSurface !== "approval-window";
    this.activeSurface = "approval-window";
    if (needsWindow) this.windowHost.openApprovalWindow();
  }

  private clearActivePresentation(): void {
    if (this.activeSurface === "chat-inline") {
      this.windowHost.clearApprovalInline?.();
      this.activeSurface = null;
      return;
    }
    if (this.activeSurface === "approval-window") {
      this.activeSurface = null;
      this.suppressWindowCloseCancellation = true;
      const closed = this.windowHost.closeApprovalWindow();
      if (!closed) this.suppressWindowCloseCancellation = false;
    }
  }

  private finishTerminal(record: ApprovalRecord): void {
    this.clearExpiryTimer();
    this.currentApprovalRequestId = null;
    if (this.activeSurface === "chat-inline") {
      this.windowHost.clearApprovalInline?.();
      this.activeSurface = null;
      this.refresh();
      return;
    }

    this.windowHost.sendApprovalChanged({ record });
    this.activeSurface = null;
    this.waitingForTerminalWindowClose = true;
    const hasWindowToClose = this.windowHost.closeApprovalWindow();
    if (!hasWindowToClose) {
      this.waitingForTerminalWindowClose = false;
      this.refresh();
    }
  }

  private handleWindowClosed(): void {
    if (this.suppressWindowCloseCancellation) {
      this.suppressWindowCloseCancellation = false;
      return;
    }
    if (this.waitingForTerminalWindowClose) {
      this.waitingForTerminalWindowClose = false;
      this.refresh();
      return;
    }

    const requestId = this.currentApprovalRequestId;
    this.clearExpiryTimer();
    this.currentApprovalRequestId = null;
    this.activeSurface = null;
    if (requestId) {
      const current = this.approvalService.get(requestId);
      if (current?.state === "pending") {
        const cancelled = this.approvalService.cancel(requestId);
        this.windowHost.sendApprovalChanged({ record: cancelled });
      }
    }
    this.windowHost.clearApprovalInline?.();
    this.refresh();
  }
}

/** Backward-compatible export for the Approval UI V1 test/runtime seam. */
export { ApprovalPresentationCoordinator as ApprovalWindowCoordinator };
