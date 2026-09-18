import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { ApprovalService } from "../../../dist/main/main/runtime/approval/approval-service.js";
import { ApprovalWindowCoordinator } from "../../../dist/main/main/runtime/approval/approval-window-coordinator.js";
import { ApprovalServiceError } from "../../../dist/main/main/runtime/approval/approval-errors.js";
import type { ApprovalChangedEvent } from "../../../dist/main/shared/approval-ipc-types.js";
import type { ApprovalRequestInput, ApprovalRecord } from "../../../dist/main/shared/approval-types.js";
import type { SandboxScope } from "../../../dist/main/shared/sandbox-types.js";
import { createApprovalRequestId } from "../../../dist/main/shared/approval-types.js";
import { createCapabilityId, createCapabilityRequestId } from "../../../dist/main/shared/capability-types.js";
import type { ApprovalWindowHost } from "../../../dist/main/main/runtime/approval/approval-window-coordinator.js";

const projectRoot = process.cwd();
const approvalSourceRoot = path.join(projectRoot, "src", "main", "runtime", "approval");
const approvalViewPath = path.join(projectRoot, "src", "renderer", "ui", "components", "ApprovalView.tsx");

const capabilityId = createCapabilityId("approval.synthetic.read");
const capabilityRequestId = createCapabilityRequestId("approval-capability-request-1");
const effectiveScope: SandboxScope = { kind: "filesystem", path: "C:\\workspace", access: "read" };

function createClock(start = 1_000): { now: () => number; set: (value: number) => void } {
  let current = start;
  return {
    now: () => current,
    set: (value) => { current = value; },
  };
}

interface ApprovalTestHost extends ApprovalWindowHost {
  readonly events: ApprovalChangedEvent[];
  readonly scheduled: Array<ReturnType<typeof setTimeout>>;
  schedule(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  cancelScheduled(handle: ReturnType<typeof setTimeout>): void;
  userClose(): void;
}

function createHost(): ApprovalTestHost {
  let closeHandler: (() => void) | null = null;
  let windowOpen = false;
  const events: ApprovalChangedEvent[] = [];
  const scheduled: Array<ReturnType<typeof setTimeout>> = [];
  return {
    events,
    scheduled,
    openApprovalWindow() { windowOpen = true; },
    closeApprovalWindow() {
      if (!windowOpen) return false;
      windowOpen = false;
      return true;
    },
    sendApprovalChanged(event: ApprovalChangedEvent) { events.push(event); },
    setApprovalWindowCloseHandler(handler: (() => void) | null) { closeHandler = handler; },
    userClose() {
      if (!windowOpen || !closeHandler) return;
      windowOpen = false;
      closeHandler();
    },
    schedule(callback: () => void, delayMs: number): ReturnType<typeof setTimeout> {
      const handle = setTimeout(callback, delayMs);
      handle.unref?.();
      scheduled.push(handle);
      return handle;
    },
    cancelScheduled(handle: ReturnType<typeof setTimeout>) {
      clearTimeout(handle);
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

function createInput(overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
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
  assert.ok(displayed);
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
  const decision = resolved.decision;
  assert.ok(decision);
  assert.equal(decision.approved, true);
  if (decision.approved) {
    assert.equal(decision.grant.lifetime, "once");
    assert.deepEqual(decision.grant.scope, effectiveScope);
  }
  const approvalEvent = fixture.host.events.at(-1);
  assert.ok(approvalEvent?.record);
  assert.equal(approvalEvent.record.state, "approved");
});

test("G. Deny resolves USER_DENIED and never creates an approved grant", () => {
  const fixture = createFixture();
  const pending = fixture.service.createPending(createInput());
  fixture.coordinator.notifyPending();
  const resolved = fixture.coordinator.resolveCurrent(pending.request.approvalRequestId, "deny");

  assert.equal(resolved.state, "denied");
  const decision = resolved.decision;
  assert.ok(decision);
  assert.equal(decision.approved, false);
  if (!decision.approved) assert.equal(decision.reason.code, "USER_DENIED");
});

test("H. Closing the pending window resolves CANCELLED", () => {
  const fixture = createFixture();
  const pending = fixture.service.createPending(createInput());
  fixture.coordinator.notifyPending();
  fixture.host.userClose();

  const resolved = fixture.service.get(pending.request.approvalRequestId);
  assert.ok(resolved);
  assert.ok(resolved.decision);
  assert.equal(resolved.state, "cancelled");
  if (!resolved.decision.approved) assert.equal(resolved.decision.reason.code, "CANCELLED");
  const cancellationEvent = fixture.host.events.at(-1);
  assert.ok(cancellationEvent?.record);
  assert.equal(cancellationEvent.record.state, "cancelled");
});

test("I. Expired requests are terminal before approval can resolve them", () => {
  const fixture = createFixture();
  const pending = fixture.service.createPending(createInput({ expiresAt: 1_500 }));
  fixture.coordinator.notifyPending();
  fixture.clock.set(1_500);
  fixture.coordinator.refresh();

  const expired = fixture.service.get(pending.request.approvalRequestId);
  assert.ok(expired);
  assert.equal(expired.state, "expired");
  const expiryEvent = fixture.host.events.at(-1);
  assert.ok(expiryEvent?.record);
  assert.equal(expiryEvent.record.state, "expired");
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

test("O-Q. Approval UI exposes scoped lifetime labels without persistent-trust actions", () => {
  const viewSource = fs.readFileSync(approvalViewPath, "utf8");
  assert.match(viewSource, /ONCE/);
  assert.match(viewSource, /本进程范围/);
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
