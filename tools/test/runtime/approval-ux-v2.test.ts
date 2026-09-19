import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { ApprovalService } from "../../../dist/main/main/runtime/approval/approval-service.js";
import { ApprovalPresentationCoordinator } from "../../../dist/main/main/runtime/approval/approval-window-coordinator.js";
import type { ApprovalChangedEvent } from "../../../dist/main/shared/approval-ipc-types.js";
import type { ApprovalRequestInput } from "../../../dist/main/shared/approval-types.js";
import type { ApprovalWindowHost } from "../../../dist/main/main/runtime/approval/approval-window-coordinator.js";
import { createApprovalRequestId } from "../../../dist/main/shared/approval-types.js";
import { createCapabilityId, createCapabilityRequestId } from "../../../dist/main/shared/capability-types.js";

const rootDir = process.cwd();
const approvalDir = path.join(rootDir, "src", "main", "runtime", "approval");
const approvalViewPath = path.join(rootDir, "src", "renderer", "ui", "components", "ApprovalView.tsx");
const capabilityId = createCapabilityId("approval.ux.v2.read");
const capabilityRequestId = createCapabilityRequestId("approval-ux-v2-request");

interface InlineReadyState {
  value: boolean;
}

interface ApprovalUxHost extends ApprovalWindowHost {
  readonly windowEvents: ApprovalChangedEvent[];
  readonly inlineEvents: ApprovalChangedEvent[];
  readonly windowOpen: boolean;
  readonly openCount: number;
  readonly closeCount: number;
  readonly clearInlineCount: number;
  userClose(): void;
  flushDeferredClose(): void;
  refreshPresentation(): void;
}

function createHost(
  inlineReady: InlineReadyState,
  workTaskActive: InlineReadyState = { value: false },
  deferWindowClose = false,
): ApprovalUxHost {
  let closeHandler: (() => void) | null = null;
  let presentationRefreshHandler: (() => void) | null = null;
  let deferredCloseHandler: (() => void) | null = null;
  let windowOpen = false;
  const windowEvents: ApprovalChangedEvent[] = [];
  const inlineEvents: ApprovalChangedEvent[] = [];
  let openCount = 0;
  let closeCount = 0;
  let clearInlineCount = 0;
  return {
    windowEvents,
    inlineEvents,
    get windowOpen() { return windowOpen; },
    get openCount() { return openCount; },
    get closeCount() { return closeCount; },
    get clearInlineCount() { return clearInlineCount; },
    openApprovalWindow() { windowOpen = true; openCount += 1; },
    isApprovalWindowOpen() { return windowOpen; },
    closeApprovalWindow() {
      if (!windowOpen) return false;
      windowOpen = false;
      closeCount += 1;
      if (deferWindowClose) deferredCloseHandler = closeHandler;
      else closeHandler?.();
      return true;
    },
    sendApprovalChanged(event: ApprovalChangedEvent) { windowEvents.push(event); },
    setApprovalWindowCloseHandler(handler: (() => void) | null) { closeHandler = handler; },
    isChatInlineReady() { return inlineReady.value; },
    isWorkTaskActive() { return workTaskActive.value; },
    sendApprovalInline(event: ApprovalChangedEvent) { inlineEvents.push(event); },
    clearApprovalInline() {
      clearInlineCount += 1;
      inlineEvents.push({ record: null });
    },
    setApprovalPresentationRefreshHandler(handler: (() => void) | null) { presentationRefreshHandler = handler; },
    refreshPresentation() { presentationRefreshHandler?.(); },
    userClose() {
      if (!windowOpen) return;
      windowOpen = false;
      closeHandler?.();
    },
    flushDeferredClose() {
      const handler = deferredCloseHandler;
      deferredCloseHandler = null;
      handler?.();
    },
  };
}

function createFixture(inlineReadyValue = false, workTaskActiveValue = false, deferWindowClose = false) {
  let sequence = 0;
  const inlineReady = { value: inlineReadyValue };
  const workTaskActive = { value: workTaskActiveValue };
  const service = new ApprovalService({
    now: () => 1_000,
    createRequestId: () => createApprovalRequestId(`approval-ux-v2-${++sequence}`),
  });
  const host = createHost(inlineReady, workTaskActive, deferWindowClose);
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const coordinator = new ApprovalPresentationCoordinator({
    approvalService: service,
    windowHost: host,
    schedule: (callback: () => void, delayMs: number): ReturnType<typeof setTimeout> => {
      const timer = setTimeout(callback, delayMs);
      timer.unref?.();
      timers.push(timer);
      return timer;
    },
    cancelScheduled: (timer: ReturnType<typeof setTimeout>) => { clearTimeout(timer); },
  });
  return { service, host, coordinator, inlineReady, workTaskActive, timers };
}

function createInput(overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    capabilityRequestId,
    capabilityId,
    requester: { type: "main-agent", id: "firefly-main" },
    summary: "读取项目目录",
    reason: "完成用户请求的本地项目检查。",
    effectiveScope: { kind: "filesystem", path: "C:\\workspace", access: "read" },
    expiresAt: 2_000,
    ...overrides,
  };
}

test("A. Visible ready Chat selects the inline approval presenter", () => {
  const fixture = createFixture(true);
  fixture.service.createPending(createInput());
  fixture.coordinator.notifyPending();

  assert.equal(fixture.host.openCount, 0);
  assert.equal(fixture.host.windowOpen, false);
  const event = fixture.host.inlineEvents.at(-1);
  assert.ok(event?.record);
  assert.equal(event.record.state, "pending");
});

test("B-C. Hidden Chat selects one fallback window and never both surfaces", () => {
  const fixture = createFixture(false);
  const pending = fixture.service.createPending(createInput());
  fixture.coordinator.notifyPending();

  assert.equal(fixture.host.openCount, 1);
  assert.equal(fixture.host.windowOpen, true);
  assert.equal(fixture.host.inlineEvents.length, 0);
  const current = fixture.coordinator.getCurrentRecord();
  assert.ok(current);
  assert.equal(current.request.approvalRequestId, pending.request.approvalRequestId);
});

test("Work task activity forces the dedicated approval window even when Chat is inline-ready", () => {
  const fixture = createFixture(true, true);
  fixture.service.createPending(createInput());
  fixture.coordinator.notifyPending();

  assert.equal(fixture.host.openCount, 1);
  assert.equal(fixture.host.windowOpen, true);
  assert.equal(fixture.host.inlineEvents.length, 0);
});

test("A new pending request is presented when the previous approval window close callback is delayed", () => {
  const fixture = createFixture(false, true, true);
  const first = fixture.service.createPending(createInput());
  fixture.coordinator.notifyPending();
  assert.equal(fixture.host.openCount, 1);

  fixture.coordinator.resolveCurrent(first.request.approvalRequestId, "deny");
  const second = fixture.service.createPending(createInput());
  fixture.coordinator.notifyPending();

  assert.equal(fixture.host.openCount, 2);
  assert.equal(fixture.coordinator.getCurrentRecord()?.request.approvalRequestId, second.request.approvalRequestId);
});

test("D. ApprovalService remains the canonical state owner while surfaces switch", () => {
  const fixture = createFixture(false);
  const pending = fixture.service.createPending(createInput());
  fixture.coordinator.notifyPending();
  fixture.inlineReady.value = true;
  fixture.coordinator.refreshPresentation();

  assert.equal(fixture.host.windowOpen, false);
  const inlineEvent = fixture.host.inlineEvents.at(-1);
  assert.ok(inlineEvent?.record);
  assert.equal(inlineEvent.record.request.approvalRequestId, pending.request.approvalRequestId);
  const current = fixture.service.get(pending.request.approvalRequestId);
  assert.ok(current);
  assert.equal(current.state, "pending");
});

test("E-F. Inline approve and deny resolve the same ApprovalService request", () => {
  const approveFixture = createFixture(true);
  const approved = approveFixture.service.createPending(createInput());
  approveFixture.coordinator.notifyPending();
  assert.equal(approveFixture.coordinator.resolveCurrent(approved.request.approvalRequestId, "approve").state, "approved");
  const approvedRecord = approveFixture.service.get(approved.request.approvalRequestId);
  assert.ok(approvedRecord);
  assert.equal(approvedRecord.state, "approved");
  assert.equal(approveFixture.host.inlineEvents.at(-1)?.record, null);

  const denyFixture = createFixture(true);
  const denied = denyFixture.service.createPending(createInput());
  denyFixture.coordinator.notifyPending();
  assert.equal(denyFixture.coordinator.resolveCurrent(denied.request.approvalRequestId, "deny").state, "denied");
  const deniedRecord = denyFixture.service.get(denied.request.approvalRequestId);
  assert.ok(deniedRecord);
  assert.equal(deniedRecord.state, "denied");
  assert.equal(denyFixture.host.inlineEvents.at(-1)?.record, null);
});

test("G-H. Fallback approve and close use the canonical lifecycle", () => {
  const approveFixture = createFixture(false);
  const approved = approveFixture.service.createPending(createInput());
  approveFixture.coordinator.notifyPending();
  assert.equal(approveFixture.coordinator.resolveCurrent(approved.request.approvalRequestId, "approve").state, "approved");
  assert.equal(approveFixture.host.windowOpen, false);
  const approvedEvent = approveFixture.host.windowEvents.at(-1);
  assert.ok(approvedEvent?.record);
  assert.equal(approvedEvent.record.state, "approved");

  const closeFixture = createFixture(false);
  const cancelled = closeFixture.service.createPending(createInput());
  closeFixture.coordinator.notifyPending();
  closeFixture.host.userClose();
  const cancelledRecord = closeFixture.service.get(cancelled.request.approvalRequestId);
  assert.ok(cancelledRecord);
  assert.equal(cancelledRecord.state, "cancelled");
  const cancelledEvent = closeFixture.host.windowEvents.at(-1);
  assert.ok(cancelledEvent?.record);
  assert.equal(cancelledEvent.record.state, "cancelled");
});

test("I-K. Settled and stale requests clear their active presenter", () => {
  const fixture = createFixture(true);
  const pending = fixture.service.createPending(createInput());
  fixture.coordinator.notifyPending();
  fixture.service.deny(pending.request.approvalRequestId);
  fixture.coordinator.refresh();
  assert.equal(fixture.host.inlineEvents.at(-1)?.record, null);
  assert.throws(
    () => fixture.coordinator.resolveCurrent(pending.request.approvalRequestId, "approve"),
    /not the request currently displayed/,
  );
});

test("L-N. The Firefly hint is fallback-only, deterministic, and separate from security fields", () => {
  const approvalView = fs.readFileSync(approvalViewPath, "utf8");
  assert.match(approvalView, /FIREFLY_APPROVAL_HINT/);
  assert.match(approvalView, /这个操作需要你的许可，我会等你决定。/);
  assert.match(approvalView, /data-firefly-approval-hint/);
  assert.doesNotMatch(approvalView, /capabilityId.*FIREFLY_APPROVAL_HINT|FIREFLY_APPROVAL_HINT.*capabilityId/);

  const coordinator = fs.readFileSync(path.join(approvalDir, "approval-window-coordinator.ts"), "utf8");
  assert.doesNotMatch(coordinator, /FIREFLY_APPROVAL_HINT|TTS|Live2D|ToolExecutionEngine/);
});

test("O. Presentation coordinator has no second pending store or execution owner", () => {
  const source = fs.readFileSync(path.join(approvalDir, "approval-window-coordinator.ts"), "utf8");
  assert.match(source, /ApprovalPresentationCoordinator/);
  assert.doesNotMatch(source, /new Map\s*\(|ToolExecutionEngine|executeTool|SandboxPolicyEvaluator|FireflyHarness/);
});
