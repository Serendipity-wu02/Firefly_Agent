import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  createCapabilityCategory,
  createCapabilityId,
  createCapabilityRequestId,
} from "../../../dist/main/shared/capability-types.js";
import {
  createAuthorizedCapabilityInvocation,
} from "../../../dist/main/shared/runtime-integration-types.js";
import { createSandboxProfileId } from "../../../dist/main/shared/sandbox-types.js";
import {
  createApprovalRequestId,
} from "../../../dist/main/shared/approval-types.js";
import {
  CapabilityAuthorizationPipeline,
} from "../../../dist/main/main/runtime/authorization/capability-authorization-pipeline.js";
import { ApprovalService } from "../../../dist/main/main/runtime/approval/approval-service.js";
import {
  createApprovalRequirementResolver,
} from "../../../dist/main/main/runtime/approval/approval-requirement-resolver.js";
import { CapabilityBindingResolver } from "../../../dist/main/main/runtime/capabilities/capability-binding-resolver.js";
import { CapabilityRegistry } from "../../../dist/main/main/runtime/capabilities/capability-registry.js";
import { SandboxPolicyEvaluator } from "../../../dist/main/main/runtime/sandbox/sandbox-policy.js";
import { FireflyToolRegistry } from "../../../dist/main/main/tools/tool-registry.js";

const projectRoot = process.cwd();
const capabilityId = createCapabilityId("authorization.read");
const missingCapabilityId = createCapabilityId("authorization.missing");
const category = createCapabilityCategory("authorization");
const toolId = "authorization_read";
const profileId = createSandboxProfileId("authorization-profile");
const requester = { type: "main-agent", id: "firefly-main" };
const rootScope = {
  kind: "filesystem",
  path: "C:\\workspace",
  access: "read",
};

function createFixture(requirement = "none", registerBinding = true) {
  let now = 1_000;
  let requestSequence = 0;
  let executionCount = 0;

  const capabilityRegistry = new CapabilityRegistry();
  capabilityRegistry.register({
    id: capabilityId,
    name: "Authorization Read",
    description: "Authorization pipeline test capability.",
    version: "1.0.0",
    category,
  });

  const toolRegistry = new FireflyToolRegistry();
  toolRegistry.register({
    id: toolId,
    name: "Authorization Read",
    description: "Authorization pipeline test tool.",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    execute: async () => {
      executionCount += 1;
      return JSON.stringify({ ok: true });
    },
  });

  const bindingResolver = new CapabilityBindingResolver(capabilityRegistry, toolRegistry);
  if (registerBinding) {
    bindingResolver.register({ capabilityId, toolId });
  }

  const sandboxPolicy = new SandboxPolicyEvaluator([{
    id: profileId,
    version: "1.0.0",
    rules: [{ kind: "filesystem", allowedRoots: ["C:\\workspace"], access: ["read"] }],
  }]);

  const approvalService = new ApprovalService({
    now: () => now,
    createRequestId: () => createApprovalRequestId(`authorization-approval-${++requestSequence}`),
  });
  const pipeline = new CapabilityAuthorizationPipeline({
    capabilityRegistry,
    bindingResolver,
    sandboxPolicy,
    approvalRequirementResolver: createApprovalRequirementResolver([
      { capabilityId, requirement },
    ]),
    approvalService,
  });

  return {
    capabilityRegistry,
    toolRegistry,
    approvalService,
    pipeline,
    setNow(value) {
      now = value;
    },
    get executionCount() {
      return executionCount;
    },
  };
}

function createRequest(overrides = {}) {
  return {
    requestId: createCapabilityRequestId("authorization-request-1"),
    capabilityId,
    requester,
    input: { path: "C:\\workspace\\file.txt" },
    ...overrides,
  };
}

function createInput(overrides = {}) {
  return {
    request: createRequest(),
    sandbox: {
      profileId,
      requestedScope: rootScope,
    },
    runtimeContext: { runId: "run-authorization-1", conversationId: "conversation-1" },
    approval: {
      summary: "读取项目文件",
      reason: "Capability authorization pipeline test.",
      expiresAt: 2_000,
    },
    ...overrides,
  };
}

function requireAuthorized(result) {
  assert.equal(result.status, "AUTHORIZED");
  if (result.status !== "AUTHORIZED") throw new Error("Expected AUTHORIZED outcome.");
  return result.invocation;
}

function requirePending(result) {
  assert.equal(result.status, "PENDING_APPROVAL");
  if (result.status !== "PENDING_APPROVAL") throw new Error("Expected PENDING_APPROVAL outcome.");
  return result.approvalRequest;
}

test("A. Known capability, valid binding, Sandbox allow, and NONE authorize", () => {
  const fixture = createFixture();
  const invocation = requireAuthorized(fixture.pipeline.authorize(createInput()));
  assert.equal(invocation.binding.toolId, toolId);
  assert.deepEqual(invocation.effectiveScope, rootScope);
  assert.deepEqual(invocation.authorizedScope, rootScope);
  assert.deepEqual(invocation.authorization, { type: "sandbox-only" });
});

test("B. Unknown capability fails deterministically", () => {
  const fixture = createFixture();
  const result = fixture.pipeline.authorize(createInput({
    request: createRequest({ capabilityId: missingCapabilityId }),
  }));
  assert.equal(result.status, "DENIED");
  if (result.status === "DENIED") {
    assert.equal(result.stage, "CAPABILITY");
    assert.equal(result.reason.code, "CAPABILITY_NOT_FOUND");
  }
});

test("C. Missing binding fails deterministically", () => {
  const fixture = createFixture("none", false);
  const result = fixture.pipeline.authorize(createInput());
  assert.equal(result.status, "DENIED");
  if (result.status === "DENIED") {
    assert.equal(result.stage, "BINDING");
    assert.equal(result.reason.code, "BINDING_NOT_FOUND");
  }
});

test("D-E. Sandbox denial is terminal and creates no ApprovalRequest", () => {
  const fixture = createFixture("required");
  const result = fixture.pipeline.authorize(createInput({
    sandbox: { profileId, requestedScope: { ...rootScope, path: "C:\\outside" } },
  }));
  assert.equal(result.status, "DENIED");
  if (result.status === "DENIED") {
    assert.equal(result.stage, "SANDBOX");
    assert.equal(result.reason.code, "SANDBOX_DENIED");
  }
  assert.equal(fixture.approvalService.listPending().length, 0);
});

test("F. Sandbox effective scope is the scope carried forward", () => {
  const fixture = createFixture();
  const narrowedRequestedScope = { ...rootScope, path: "C:\\workspace\\nested" };
  const invocation = requireAuthorized(fixture.pipeline.authorize(createInput({
    sandbox: { profileId, requestedScope: narrowedRequestedScope },
  })));
  assert.deepEqual(invocation.effectiveScope, narrowedRequestedScope);
  assert.deepEqual(invocation.authorizedScope, narrowedRequestedScope);
});

test("G-H. REQUIRED creates one pending request with effective scope", () => {
  const fixture = createFixture("required");
  const request = requirePending(fixture.pipeline.authorize(createInput()));
  assert.equal(request.capabilityId, capabilityId);
  assert.equal(request.capabilityRequestId, "authorization-request-1");
  assert.deepEqual(request.effectiveScope, rootScope);
  assert.equal(fixture.approvalService.listPending().length, 1);
});

test("I. Approved pending request resumes as AUTHORIZED", () => {
  const fixture = createFixture("required");
  const request = requirePending(fixture.pipeline.authorize(createInput()));
  fixture.approvalService.approve(request.approvalRequestId, {
    kind: "filesystem",
    path: "C:\\workspace\\safe",
    access: "read",
  });
  const invocation = requireAuthorized(
    fixture.pipeline.resumeAfterApproval(request.approvalRequestId),
  );
  assert.deepEqual(invocation.effectiveScope, rootScope);
  assert.deepEqual(invocation.authorizedScope, {
    kind: "filesystem",
    path: "C:\\workspace\\safe",
    access: "read",
  });
  assert.deepEqual(invocation.authorization, {
    type: "approval-grant",
    approvalRequestId: request.approvalRequestId,
    grantLifetime: "once",
  });
});

test("J. Denied pending request remains typed DENIED", () => {
  const fixture = createFixture("required");
  const request = requirePending(fixture.pipeline.authorize(createInput()));
  fixture.approvalService.deny(request.approvalRequestId);
  const result = fixture.pipeline.resumeAfterApproval(request.approvalRequestId);
  assert.equal(result.status, "DENIED");
  if (result.status === "DENIED") assert.equal(result.reason.code, "APPROVAL_DENIED");
});

test("K. Pipeline cancellation preserves CANCELLED semantics", () => {
  const fixture = createFixture("required");
  const request = requirePending(fixture.pipeline.authorize(createInput()));
  const result = fixture.pipeline.cancelPending(request.approvalRequestId);
  assert.equal(result.status, "DENIED");
  if (result.status === "DENIED") assert.equal(result.reason.code, "APPROVAL_CANCELLED");
  assert.equal(fixture.approvalService.get(request.approvalRequestId)?.state, "cancelled");
});

test("L. Expired pending request preserves EXPIRED semantics", () => {
  const fixture = createFixture("required");
  const request = requirePending(fixture.pipeline.authorize(createInput()));
  fixture.setNow(2_000);
  const result = fixture.pipeline.resumeAfterApproval(request.approvalRequestId);
  assert.equal(result.status, "DENIED");
  if (result.status === "DENIED") assert.equal(result.reason.code, "APPROVAL_EXPIRED");
});

test("M. ApprovalService rejects a grant wider than the Sandbox scope", () => {
  const fixture = createFixture("required");
  const request = requirePending(fixture.pipeline.authorize(createInput()));
  assert.throws(
    () => fixture.approvalService.approve(request.approvalRequestId, {
      kind: "filesystem",
      path: "C:\\",
      access: "read",
    }),
    (error) => error.code === "INVALID_APPROVAL_GRANT",
  );
});

test("N. AuthorizedInvocation rejects a grant wider than the Sandbox scope", () => {
  const fixture = createFixture();
  assert.throws(
    () => createAuthorizedCapabilityInvocation({
      request: createRequest(),
      binding: { capabilityId, toolId },
      sandboxDecision: { allowed: true, effectiveScope: rootScope },
      approvalRequirement: "required",
      approvalRequestId: createApprovalRequestId("authorization-widening"),
      approvalDecision: {
        approved: true,
        grant: {
          lifetime: "once",
          scope: { kind: "filesystem", path: "C:\\", access: "read" },
        },
      },
    }),
    (error) => error.code === "APPROVAL_SCOPE_WIDENED",
  );
});

test("O. No-approval invocation scope equals effective Sandbox scope", () => {
  const fixture = createFixture();
  const invocation = requireAuthorized(fixture.pipeline.authorize(createInput()));
  assert.deepEqual(invocation.authorizedScope, invocation.effectiveScope);
  assert.equal(invocation.approvalGrant, undefined);
});

test("P-S. Requester, request ID, capability ID, and resolved tool ID survive", () => {
  const fixture = createFixture();
  const invocation = requireAuthorized(fixture.pipeline.authorize(createInput()));
  assert.deepEqual(invocation.request.requester, requester);
  assert.equal(invocation.request.requestId, "authorization-request-1");
  assert.equal(invocation.request.capabilityId, capabilityId);
  assert.equal(invocation.binding.toolId, toolId);
});

test("T. Registered capability alone is not authorized without a binding", () => {
  const fixture = createFixture("none", false);
  assert.equal(fixture.capabilityRegistry.has(capabilityId), true);
  const result = fixture.pipeline.authorize(createInput());
  assert.equal(result.status, "DENIED");
});

test("U. Sandbox allow alone is not authorization when approval is REQUIRED", () => {
  const fixture = createFixture("required");
  const result = fixture.pipeline.authorize(createInput());
  assert.equal(result.status, "PENDING_APPROVAL");
});

test("V. Approval metadata without a valid Sandbox chain is not authorization", () => {
  assert.throws(
    () => createAuthorizedCapabilityInvocation({
      request: createRequest(),
      binding: { capabilityId, toolId },
      sandboxDecision: {
        allowed: false,
        reason: { code: "OUTSIDE_SCOPE", message: "denied" },
      },
      approvalRequirement: "required",
      approvalRequestId: createApprovalRequestId("authorization-invalid-chain"),
      approvalDecision: {
        approved: true,
        grant: { lifetime: "once", scope: rootScope },
      },
    }),
    (error) => error.code === "SANDBOX_NOT_ALLOWED",
  );
});

test("W. An ONCE approval cannot authorize a second invocation", () => {
  const fixture = createFixture("required");
  const request = requirePending(fixture.pipeline.authorize(createInput()));
  fixture.approvalService.approve(request.approvalRequestId);
  assert.equal(fixture.pipeline.resumeAfterApproval(request.approvalRequestId).status, "AUTHORIZED");
  const second = fixture.pipeline.resumeAfterApproval(request.approvalRequestId);
  assert.equal(second.status, "DENIED");
  if (second.status === "DENIED") assert.equal(second.reason.code, "APPROVAL_RUNTIME_ERROR");
});

test("X. Authorization does not execute the registered tool", () => {
  const fixture = createFixture();
  requireAuthorized(fixture.pipeline.authorize(createInput()));
  assert.equal(fixture.executionCount, 0);
});

test("Y-AA. Pipeline source has no execution, LLM, Harness, or SubAgent runtime dependency", () => {
  const sourcePath = path.join(
    projectRoot,
    "src",
    "main",
    "runtime",
    "authorization",
    "capability-authorization-pipeline.ts",
  );
  const source = fs.readFileSync(sourcePath, "utf8").toLowerCase();
  for (const forbidden of [
    "toolexecutionengine",
    "executetoolcall",
    "fireflyharness",
    "llm",
    "subagent-task-service",
    "subagentauthorizationpipeline",
  ]) {
    assert.equal(source.includes(forbidden), false, `authorization pipeline must not reference ${forbidden}`);
  }
});

test("AB. TypeScript production guard passes", () => {
  const guard = spawnSync(
    process.execPath,
    [path.join(projectRoot, "tools", "verify", "verify-typescript-production.mjs")],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.equal(guard.status, 0, guard.stderr || guard.stdout);
});
