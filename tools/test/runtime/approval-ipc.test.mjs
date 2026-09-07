import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { ApprovalService } from "../../../dist/main/main/runtime/approval/approval-service.js";
import { ApprovalWindowCoordinator } from "../../../dist/main/main/runtime/approval/approval-window-coordinator.js";
import { ApprovalServiceError } from "../../../dist/main/main/runtime/approval/approval-errors.js";
import { createApprovalRequestId } from "../../../dist/main/shared/approval-types.js";
import { createCapabilityId, createCapabilityRequestId } from "../../../dist/main/shared/capability-types.js";

const projectRoot = process.cwd();
const approvalSourceRoot = path.join(projectRoot, "src", "main", "runtime", "approval");
const approvalViewPath = path.join(projectRoot, "src", "renderer", "ui", "components", "ApprovalView.tsx");

const capabilityId = createCapabilityId("approval.synthetic.read");
const capabilityRequestId = createCapabilityRequestId("approval-capability-request-1");
const effectiveScope = { kind: "filesystem", path: "C:\\workspace", access: "read" };

function createClock(start = 1_000) {
  let current = start;
  return {
    now: () => current,
    set: (value) => { current = value; },
  };
}

function createHost() {
  let closeHandler = null;
  let windowOpen = false;
  const events = [];
  const scheduled = [];
  return {
    events,
    scheduled,
    openApprovalWindow() { windowOpen = true; },
    closeApprovalWindow() {
      if (!windowOpen) return false;
      windowOpen = false;
      return true;
    },
    sendApprovalChanged(event) { events.push(event); },
    setApprovalWindowCloseHandler(handler) { closeHandler = handler; },
    userClose() {
      if (!windowOpen || !closeHandler) return;
      windowOpen = false;
      closeHandler();
    },
    schedule(callback, delayMs) {
      const handle = { callback, delayMs, cancelled: false };
      scheduled.push(handle);
      return handle;
    },
    cancelScheduled(handle) {
      handle.cancelled = true;
    },
  };
}

function createFixture() {
  const clock = createClock();
  let sequence = 0;
  const service = new ApprovalService({
    now: clock.now,
    createRequestId: () => createApprovalRequestId(`approval-ipc-${++sequence}`),
  });
  const host = createHost();
  const coordinator = new ApprovalWindowCoordinator({
    approvalService: service,
    windowHost: host,
    now: clock.now,
    schedule: (callback, delayMs) => host.schedule(callback, delayMs),
    cancelScheduled: (handle) => host.cancelScheduled(handle),
  });
  return { clock, service, host, coordinator };
}

function createInput(overrides = {}) {
  return {
    capabilityRequestId,
    capabilityId,
    requester: { type: "main-agent", id: "firefly-main" },
    summary: "读取项目目录中的文件",
    reason: "完成用户请求的本地项目检查。",
    effectiveScope,
    expiresAt: 2_000,
    ...overrides,
  };
}

test("A-E. Pending request is serializable and the coordinator exposes the canonical display record", () => {
  const fixture = createFixture();
  const pending = fixture.service.createPending(createInput());
  fixture.coordinator.notifyPending();

  const displayed = fixture.coordinator.getCurrentRecord();
  assert.deepEqual(JSON.parse(JSON.stringify(displayed)), JSON.parse(JSON.stringify(pending)));
  assert.equal(displayed.request.requester.type, "main-agent");
  assert.equal(displayed.request.summary, "读取项目目录中的文件");
  assert.equal(displayed.request.capabilityId, capabilityId);
  assert.deepEqual(displayed.request.effectiveScope, effectiveScope);
  assert.equal(fixture.host.events.length, 0);
});

test("F. Approve resolves through ApprovalService with an ONCE grant", () => {
  const fixture = createFixture();
  const pending = fixture.service.createPending(createInput());
  fixture.coordinator.notifyPending();
  const resolved = fixture.coordinator.resolveCurrent(pending.request.approvalRequestId, "approve");

  assert.equal(resolved.state, "approved");
  assert.equal(resolved.decision.approved, true);
  if (resolved.decision.approved) {
    assert.equal(resolved.decision.grant.lifetime, "once");
    assert.deepEqual(resolved.decision.grant.scope, effectiveScope);
  }
  assert.equal(fixture.host.events.at(-1).record.state, "approved");
});

test("G. Deny resolves USER_DENIED and never creates an approved grant", () => {
  const fixture = createFixture();
  const pending = fixture.service.createPending(createInput());
  fixture.coordinator.notifyPending();
  const resolved = fixture.coordinator.resolveCurrent(pending.request.approvalRequestId, "deny");

  assert.equal(resolved.state, "denied");
  assert.equal(resolved.decision.approved, false);
  if (!resolved.decision.approved) assert.equal(resolved.decision.reason.code, "USER_DENIED");
});

test("H. Closing the pending window resolves CANCELLED", () => {
  const fixture = createFixture();
  const pending = fixture.service.createPending(createInput());
  fixture.coordinator.notifyPending();
  fixture.host.userClose();

  const resolved = fixture.service.get(pending.request.approvalRequestId);
  assert.equal(resolved.state, "cancelled");
  assert.equal(resolved.decision.reason.code, "CANCELLED");
  assert.equal(fixture.host.events.at(-1).record.state, "cancelled");
});

test("I. Expired requests are terminal before approval can resolve them", () => {
  const fixture = createFixture();
  const pending = fixture.service.createPending(createInput({ expiresAt: 1_500 }));
  fixture.coordinator.notifyPending();
  fixture.clock.set(1_500);
  fixture.coordinator.refresh();

  assert.equal(fixture.service.get(pending.request.approvalRequestId).state, "expired");
  assert.equal(fixture.host.events.at(-1).record.state, "expired");
  assert.throws(
    () => fixture.service.approve(pending.request.approvalRequestId),
    (error) => error instanceof ApprovalServiceError && error.code === "APPROVAL_ALREADY_RESOLVED",
  );
});

test("J. Terminal requests cannot be resolved twice", () => {
  const fixture = createFixture();
  const pending = fixture.service.createPending(createInput());
  fixture.service.deny(pending.request.approvalRequestId);
  assert.throws(
    () => fixture.service.approve(pending.request.approvalRequestId),
    (error) => error instanceof ApprovalServiceError && error.code === "APPROVAL_ALREADY_RESOLVED",
  );
});

test("K. ApprovalService rejects a renderer-style wider scope", () => {
  const fixture = createFixture();
  const pending = fixture.service.createPending(createInput());
  assert.throws(
    () => fixture.service.approve(pending.request.approvalRequestId, {
      kind: "filesystem",
      path: "C:\\",
      access: "read",
    }),
    (error) => error instanceof ApprovalServiceError && error.code === "INVALID_APPROVAL_GRANT",
  );
});

test("L-N. Renderer cannot widen identity and ApprovalService remains the only record owner", () => {
  const viewSource = fs.readFileSync(approvalViewPath, "utf8");
  const serviceSource = fs.readFileSync(path.join(approvalSourceRoot, "approval-service.ts"), "utf8");
  const coordinatorSource = fs.readFileSync(path.join(approvalSourceRoot, "approval-window-coordinator.ts"), "utf8");
  assert.match(viewSource, /record\.request\.approvalRequestId/);
  assert.doesNotMatch(viewSource, /createApprovalRequestId|createCapabilityId|createCapabilityRequestId/);
  assert.doesNotMatch(viewSource, /ApprovalService|SandboxPolicy|ToolExecutionEngine|FireflyHarness/);
  assert.match(serviceSource, /InMemoryApprovalStore/);
  assert.doesNotMatch(coordinatorSource, /new Map\s*\(/);
  assert.doesNotMatch(viewSource, /new Map\s*\(|pendingQueue|pendingRequests/);
});

test("O-Q. Approval UI exposes only ONCE and no persistent-trust actions", () => {
  const viewSource = fs.readFileSync(approvalViewPath, "utf8");
  assert.match(viewSource, /ONCE/);
  for (const forbidden of ["Always", "Forever", "Trust", "始终", "永久", "信任"]) {
    assert.equal(viewSource.includes(forbidden), false, `${forbidden} must not be an Approval UI action`);
  }
  assert.match(viewSource, /允许/);
  assert.match(viewSource, /拒绝/);
});

test("T-U. IPC/preload are typed and approval code remains outside execution/Harness owners", () => {
  const sharedIpc = fs.readFileSync(path.join(projectRoot, "src", "shared", "ipc-channels.ts"), "utf8");
  const preload = fs.readFileSync(path.join(projectRoot, "src", "preload", "index.ts"), "utf8");
  const ipc = fs.readFileSync(path.join(approvalSourceRoot, "approval-ipc.ts"), "utf8");
  const windowManager = fs.readFileSync(path.join(projectRoot, "src", "main", "windows", "window-manager.ts"), "utf8");
  assert.match(sharedIpc, /APPROVAL_GET: "approval:get"/);
  assert.match(sharedIpc, /APPROVAL_RESOLVE: "approval:resolve"/);
  assert.match(sharedIpc, /APPROVAL_CHANGED: "approval:changed"/);
  assert.match(preload, /getApprovalRequest/);
  assert.match(preload, /resolveApproval/);
  assert.match(preload, /onApprovalChanged/);
  assert.match(ipc, /ApprovalWindowCoordinator/);
  assert.match(windowManager, /openApprovalWindow\(\)/);
  assert.doesNotMatch(ipc, /new ApprovalService\s*\(/);
  assert.doesNotMatch(ipc, /new ToolExecutionEngine\s*\(/);
});
