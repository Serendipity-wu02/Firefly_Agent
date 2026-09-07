import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  ApprovalService,
} from "../../../dist/main/main/runtime/approval/approval-service.js";
import {
  ApprovalServiceError,
} from "../../../dist/main/main/runtime/approval/approval-errors.js";
import {
  createApprovalRequestId,
} from "../../../dist/main/shared/approval-types.js";
import {
  createCapabilityId,
  createCapabilityRequestId,
} from "../../../dist/main/shared/capability-types.js";
import {
  CapabilityRegistry,
} from "../../../dist/main/main/runtime/capabilities/capability-registry.js";
import {
  SandboxPolicyEvaluator,
} from "../../../dist/main/main/runtime/sandbox/sandbox-policy.js";
import {
  createSandboxProfileId,
} from "../../../dist/main/shared/sandbox-types.js";
import { ToolExecutionEngine } from "../../../dist/main/main/runtime/execution/tool-execution-engine.js";

const projectRoot = process.cwd();
const approvalDirectory = path.join(projectRoot, "src", "main", "runtime", "approval");
const capabilityId = createCapabilityId("synthetic.read");
const capabilityRequestId = createCapabilityRequestId("capability-request-1");
const effectiveScope = {
  kind: "filesystem",
  path: "C:\\workspace",
  access: "read",
};

function createClock(start = 1_000) {
  let current = start;
  return {
    now: () => current,
    set: (value) => {
      current = value;
    },
  };
}

function createIdFactory(prefix = "approval-test") {
  let sequence = 0;
  return () => createApprovalRequestId(`${prefix}-${++sequence}`);
}

function createService(clock = createClock(), idFactory = createIdFactory()) {
  return {
    clock,
    service: new ApprovalService({
      now: clock.now,
      createRequestId: idFactory,
    }),
  };
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

test("A-B. A valid approval is pending and retrievable", () => {
  const { service } = createService();
  const record = service.createPending(createInput());

  assert.equal(record.state, "pending");
  assert.equal(record.request.approvalRequestId, "approval-test-1");
  assert.equal(service.get(record.request.approvalRequestId)?.state, "pending");
  assert.deepEqual(service.listPending(), [record]);
});

test("C. A pending request can be approved once", () => {
  const { service } = createService();
  const pending = service.createPending(createInput());
  const resolved = service.approve(pending.request.approvalRequestId);

  assert.equal(resolved.state, "approved");
  assert.equal(resolved.decision?.approved, true);
  if (resolved.decision?.approved) {
    assert.equal(resolved.decision.grant.lifetime, "once");
    assert.deepEqual(resolved.decision.grant.scope, effectiveScope);
  }
});

test("D. A pending request can be denied", () => {
  const { service } = createService();
  const pending = service.createPending(createInput());
  const resolved = service.deny(pending.request.approvalRequestId);

  assert.equal(resolved.state, "denied");
  assert.deepEqual(resolved.decision, {
    approved: false,
    reason: {
      code: "USER_DENIED",
      message: "The user denied this approval request.",
    },
  });
});

test("E. A pending request can be cancelled independently of denial", () => {
  const { service } = createService();
  const pending = service.createPending(createInput());
  const resolved = service.cancel(pending.request.approvalRequestId);

  assert.equal(resolved.state, "cancelled");
  assert.equal(resolved.decision?.approved, false);
  if (resolved.decision && !resolved.decision.approved) {
    assert.equal(resolved.decision.reason.code, "CANCELLED");
  }
});

test("F. Expiration is deterministic and does not require sleeping", () => {
  const { clock, service } = createService();
  const pending = service.createPending(createInput({ expiresAt: 1_500 }));
  clock.set(1_500);
  const expired = service.expireExpired();

  assert.equal(expired.length, 1);
  assert.equal(expired[0].request.approvalRequestId, pending.request.approvalRequestId);
  assert.equal(expired[0].state, "expired");
  if (expired[0].decision && !expired[0].decision.approved) {
    assert.equal(expired[0].decision.reason.code, "EXPIRED");
  }
});

test("G-J. Every terminal state rejects a second resolution", () => {
  const transitions = [
    (service, id) => service.approve(id),
    (service, id) => service.deny(id),
    (service, id) => service.cancel(id),
  ];

  for (const resolve of transitions) {
    const { service } = createService();
    const pending = service.createPending(createInput());
    const resolved = resolve(service, pending.request.approvalRequestId);
    assert.notEqual(resolved.state, "pending");
    assert.throws(
      () => service.deny(pending.request.approvalRequestId),
      (error) => error instanceof ApprovalServiceError && error.code === "APPROVAL_ALREADY_RESOLVED",
    );
  }

  const { clock, service } = createService();
  const pending = service.createPending(createInput({ expiresAt: 1_500 }));
  clock.set(1_500);
  service.expireExpired();
  assert.throws(
    () => service.approve(pending.request.approvalRequestId),
    (error) => error instanceof ApprovalServiceError && error.code === "APPROVAL_ALREADY_RESOLVED",
  );
});

test("K-L. Unknown IDs and invalid requests expose stable service errors", () => {
  const { service } = createService();
  assert.throws(
    () => service.approve(createApprovalRequestId("missing")),
    (error) => error instanceof ApprovalServiceError && error.code === "APPROVAL_NOT_FOUND",
  );
  assert.throws(
    () => service.createPending(createInput({ summary: "" })),
    (error) => error instanceof ApprovalServiceError && error.code === "INVALID_APPROVAL_REQUEST",
  );
});

test("M-P. Requester, capability, correlation, and effective scope are preserved", () => {
  const { service } = createService();
  const input = createInput({
    requester: { type: "subagent", id: "future-subagent", parentRunId: "run-1" },
    reason: "A structured reason for a future requester.",
  });
  const record = service.createPending(input);

  assert.deepEqual(record.request.requester, input.requester);
  assert.equal(record.request.capabilityId, capabilityId);
  assert.equal(record.request.capabilityRequestId, capabilityRequestId);
  assert.deepEqual(record.request.effectiveScope, effectiveScope);
});

test("Q. An approval grant cannot broaden the effective Sandbox scope", () => {
  const { service } = createService();
  const pending = service.createPending(createInput());
  assert.throws(
    () => service.approve(pending.request.approvalRequestId, {
      kind: "filesystem",
      path: "C:\\",
      access: "read",
    }),
    (error) => error instanceof ApprovalServiceError && error.code === "INVALID_APPROVAL_GRANT",
  );

  const narrowed = service.approve(pending.request.approvalRequestId, {
    kind: "filesystem",
    path: "C:\\workspace\\nested",
    access: "read",
  });
  assert.equal(narrowed.state, "approved");
});

test("R. Registered capability metadata does not create an approved request", () => {
  const registry = new CapabilityRegistry();
  registry.register({
    id: capabilityId,
    name: "Synthetic Read",
    description: "Test capability metadata.",
    version: "1.0.0",
    category: "synthetic",
  });
  const { service } = createService();
  const record = service.createPending(createInput());

  assert.equal(registry.has(capabilityId), true);
  assert.equal(record.state, "pending");
  assert.equal(record.decision, undefined);
});

test("S. Sandbox allow does not create an approved request", () => {
  const profileId = createSandboxProfileId("approval-test-profile");
  const evaluator = new SandboxPolicyEvaluator([{
    id: profileId,
    version: "1.0.0",
    rules: [{ kind: "filesystem", allowedRoots: ["C:\\workspace"], access: ["read"] }],
  }]);
  const sandboxDecision = evaluator.evaluate({
    requestId: "sandbox-request-1",
    capabilityId,
    requester: { type: "main-agent", id: "firefly-main" },
    profileId,
    requestedScope: effectiveScope,
  });
  assert.equal(sandboxDecision.allowed, true);

  const { service } = createService();
  const record = service.createPending(createInput({
    effectiveScope: sandboxDecision.effectiveScope,
  }));
  assert.equal(record.state, "pending");
});

test("T-U. Approval does not execute tools or depend on ToolExecutionEngine", () => {
  const prototypeNames = Object.getOwnPropertyNames(ApprovalService.prototype);
  for (const forbiddenName of ["executeTool", "runTool", "invokeTool", "dispatchTool"]) {
    assert.equal(prototypeNames.includes(forbiddenName), false, `${forbiddenName} must not be an approval method`);
  }
  assert.equal(typeof ToolExecutionEngine.prototype.executeToolCall, "function");

  for (const fileName of ["approval-errors.ts", "approval-service.ts", "approval-store.ts"]) {
    const source = fs.readFileSync(path.join(approvalDirectory, fileName), "utf8");
    assert.equal(source.includes("ToolExecutionEngine"), false, `${fileName} must not import the execution owner`);
    assert.equal(/executeTool|runTool|invokeTool|dispatchTool/.test(source), false, `${fileName} must not expose tool execution`);
    for (const forbiddenSymbol of ["ApprovalExecutor", "ApprovalToolExecutor", "SecureToolExecutor"]) {
      assert.equal(source.includes(forbiddenSymbol), false, `${forbiddenSymbol} must not be an approval symbol`);
    }
  }
});

test("V-W. Approval does not evaluate Sandbox or implement SubAgent", () => {
  for (const fileName of ["approval-errors.ts", "approval-service.ts", "approval-store.ts"]) {
    const source = fs.readFileSync(path.join(approvalDirectory, fileName), "utf8");
    assert.equal(source.includes("SandboxPolicyEvaluator"), false, `${fileName} must not evaluate Sandbox profiles`);
    assert.equal(source.includes("sandbox-policy"), false, `${fileName} must not depend on Sandbox runtime`);
    assert.equal(/SubAgentRuntime|createSubAgent|runSubAgent/.test(source), false, `${fileName} must not implement SubAgent`);
    assert.equal(/BrowserWindow|from ["']electron|GPT-SoVITS|gptsovits|renderer|Live2D/.test(source), false, `${fileName} has a forbidden runtime dependency`);
  }
});

test("X. Approval request, record, and decision DTOs are serializable", () => {
  const { service } = createService();
  const pending = service.createPending(createInput());
  const approved = service.approve(pending.request.approvalRequestId);
  const parsed = JSON.parse(JSON.stringify(approved));

  assert.equal(parsed.request.approvalRequestId, "approval-test-1");
  assert.equal(parsed.request.capabilityRequestId, "capability-request-1");
  assert.equal(parsed.state, "approved");
  assert.equal(parsed.decision.approved, true);
  assert.equal(parsed.decision.grant.lifetime, "once");
});

test("Y. Approval runtime remains TypeScript-first and has one canonical store", () => {
  assert.deepEqual(fs.readdirSync(approvalDirectory).sort(), [
    "approval-errors.ts",
    "approval-ipc.ts",
    "approval-presentation-coordinator.ts",
    "approval-requirement-resolver.ts",
    "approval-service.ts",
    "approval-store.ts",
    "approval-window-coordinator.ts",
  ]);
  const guard = spawnSync(
    process.execPath,
    [path.join(projectRoot, "tools", "verify", "verify-typescript-production.mjs")],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.equal(guard.status, 0, guard.stderr || guard.stdout);
});
