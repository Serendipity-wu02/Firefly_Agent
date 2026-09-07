import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { ApprovalService } from "../../../dist/main/main/runtime/approval/approval-service.js";
import { ApprovalPresentationCoordinator } from "../../../dist/main/main/runtime/approval/approval-window-coordinator.js";
import { createApprovalRequestId } from "../../../dist/main/shared/approval-types.js";
import { createCapabilityId, createCapabilityRequestId } from "../../../dist/main/shared/capability-types.js";

const rootDir = process.cwd();
const approvalDir = path.join(rootDir, "src", "main", "runtime", "approval");
const approvalViewPath = path.join(rootDir, "src", "renderer", "ui", "components", "ApprovalView.tsx");
const capabilityId = createCapabilityId("approval.ux.v2.read");
const capabilityRequestId = createCapabilityRequestId("approval-ux-v2-request");

function createHost(inlineReady) {
  let closeHandler = null;
  let presentationRefreshHandler = null;
  let windowOpen = false;
  const windowEvents = [];
  const inlineEvents = [];
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
    closeApprovalWindow() {
      if (!windowOpen) return false;
      windowOpen = false;
      closeCount += 1;
      closeHandler?.();
      return true;
    },
    sendApprovalChanged(event) { windowEvents.push(event); },
    setApprovalWindowCloseHandler(handler) { closeHandler = handler; },
    isChatInlineReady() { return inlineReady.value; },
    sendApprovalInline(event) { inlineEvents.push(event); },
    clearApprovalInline() {
      clearInlineCount += 1;
      inlineEvents.push({ record: null });
    },
    setApprovalPresentationRefreshHandler(handler) { presentationRefreshHandler = handler; },
    refreshPresentation() { presentationRefreshHandler?.(); },
    userClose() {
      if (!windowOpen) return;
      windowOpen = false;
      closeHandler?.();
    },
  };
}

function createFixture(inlineReadyValue = false) {
  let sequence = 0;
  const inlineReady = { value: inlineReadyValue };
  const service = new ApprovalService({
    now: () => 1_000,
    createRequestId: () => createApprovalRequestId(`approval-ux-v2-${++sequence}`),
  });
  const host = createHost(inlineReady);
  const timers = [];
  const coordinator = new ApprovalPresentationCoordinator({
    approvalService: service,
    windowHost: host,
    schedule: (callback, delayMs) => {
      const timer = { callback, delayMs, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancelScheduled: (timer) => { timer.cancelled = true; },
  });
  return { service, host, coordinator, inlineReady, timers };
}

function createInput(overrides = {}) {
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
  assert.equal(fixture.host.inlineEvents.at(-1).record.state, "pending");
});

test("B-C. Hidden Chat selects one fallback window and never both surfaces", () => {
  const fixture = createFixture(false);
  const pending = fixture.service.createPending(createInput());
  fixture.coordinator.notifyPending();

  assert.equal(fixture.host.openCount, 1);
  assert.equal(fixture.host.windowOpen, true);
  assert.equal(fixture.host.inlineEvents.length, 0);
  assert.equal(fixture.coordinator.getCurrentRecord().request.approvalRequestId, pending.request.approvalRequestId);
});

test("D. ApprovalService remains the canonical state owner while surfaces switch", () => {
  const fixture = createFixture(false);
  const pending = fixture.service.createPending(createInput());
  fixture.coordinator.notifyPending();
  fixture.inlineReady.value = true;
  fixture.coordinator.refreshPresentation();

  assert.equal(fixture.host.windowOpen, false);
  assert.equal(fixture.host.inlineEvents.at(-1).record.request.approvalRequestId, pending.request.approvalRequestId);
  assert.equal(fixture.service.get(pending.request.approvalRequestId).state, "pending");
});

test("E-F. Inline approve and deny resolve the same ApprovalService request", () => {
  const approveFixture = createFixture(true);
  const approved = approveFixture.service.createPending(createInput());
  approveFixture.coordinator.notifyPending();
  assert.equal(approveFixture.coordinator.resolveCurrent(approved.request.approvalRequestId, "approve").state, "approved");
  assert.equal(approveFixture.service.get(approved.request.approvalRequestId).state, "approved");
  assert.equal(approveFixture.host.inlineEvents.at(-1).record, null);

  const denyFixture = createFixture(true);
  const denied = denyFixture.service.createPending(createInput());
  denyFixture.coordinator.notifyPending();
  assert.equal(denyFixture.coordinator.resolveCurrent(denied.request.approvalRequestId, "deny").state, "denied");
  assert.equal(denyFixture.service.get(denied.request.approvalRequestId).state, "denied");
  assert.equal(denyFixture.host.inlineEvents.at(-1).record, null);
});

test("G-H. Fallback approve and close use the canonical lifecycle", () => {
  const approveFixture = createFixture(false);
  const approved = approveFixture.service.createPending(createInput());
  approveFixture.coordinator.notifyPending();
  assert.equal(approveFixture.coordinator.resolveCurrent(approved.request.approvalRequestId, "approve").state, "approved");
  assert.equal(approveFixture.host.windowOpen, false);
  assert.equal(approveFixture.host.windowEvents.at(-1).record.state, "approved");

  const closeFixture = createFixture(false);
  const cancelled = closeFixture.service.createPending(createInput());
  closeFixture.coordinator.notifyPending();
  closeFixture.host.userClose();
  assert.equal(closeFixture.service.get(cancelled.request.approvalRequestId).state, "cancelled");
  assert.equal(closeFixture.host.windowEvents.at(-1).record.state, "cancelled");
});

test("I-K. Settled and stale requests clear their active presenter", () => {
  const fixture = createFixture(true);
  const pending = fixture.service.createPending(createInput());
  fixture.coordinator.notifyPending();
  fixture.service.deny(pending.request.approvalRequestId);
  fixture.coordinator.refresh();
  assert.equal(fixture.host.inlineEvents.at(-1).record, null);
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
