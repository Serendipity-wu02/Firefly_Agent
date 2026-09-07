import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  createAuthorizedCapabilityInvocation,
  AuthorizedInvocationError,
} from "../../../dist/main/shared/runtime-integration-types.js";
import {
  createCapabilityCategory,
  createCapabilityId,
  createCapabilityRequestId,
} from "../../../dist/main/shared/capability-types.js";
import { createApprovalRequestId } from "../../../dist/main/shared/approval-types.js";
import { createSandboxProfileId } from "../../../dist/main/shared/sandbox-types.js";
import {
  CapabilityBindingError,
  CapabilityBindingResolver,
} from "../../../dist/main/main/runtime/capabilities/capability-binding-resolver.js";
import { CapabilityRegistry } from "../../../dist/main/main/runtime/capabilities/capability-registry.js";
import { FireflyToolRegistry } from "../../../dist/main/main/tools/tool-registry.js";
import { SandboxPolicyEvaluator } from "../../../dist/main/main/runtime/sandbox/sandbox-policy.js";
import { ApprovalService } from "../../../dist/main/main/runtime/approval/approval-service.js";
import {
  createApprovalRequirementResolver,
} from "../../../dist/main/main/runtime/approval/approval-requirement-resolver.js";
import { SubAgentRegistry } from "../../../dist/main/main/runtime/subagents/subagent-registry.js";
import { SubAgentTaskService } from "../../../dist/main/main/runtime/subagents/subagent-task-service.js";
import { ToolExecutionEngine } from "../../../dist/main/main/runtime/execution/tool-execution-engine.js";

const projectRoot = process.cwd();
const capabilityId = createCapabilityId("integration.read");
const declaredOnlyCapabilityId = createCapabilityId("integration.declared-only");
const category = createCapabilityCategory("integration");
const toolId = "integration_read";
const requester = { type: "main-agent", id: "firefly-main" };
const effectiveScope = {
  kind: "filesystem",
  path: "C:\\workspace",
  access: "read",
};

function createToolRegistry() {
  const registry = new FireflyToolRegistry();
  registry.register({
    id: toolId,
    name: "Integration Read",
    description: "Contract-test tool metadata.",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    execute: async () => "not called",
  });
  return registry;
}

function createCapabilityRegistry() {
  const registry = new CapabilityRegistry();
  registry.register({
    id: capabilityId,
    name: "Integration Read",
    description: "Contract-test capability metadata.",
    version: "1.0.0",
    category,
  });
  return registry;
}

function createRequest() {
  return {
    requestId: createCapabilityRequestId("integration-request-1"),
    capabilityId,
    requester,
    input: { path: "C:\\workspace\\file.txt" },
  };
}

function createSandboxDecision() {
  const profileId = createSandboxProfileId("integration-profile");
  const evaluator = new SandboxPolicyEvaluator([{
    id: profileId,
    version: "1.0.0",
    rules: [{ kind: "filesystem", allowedRoots: ["C:\\workspace"], access: ["read"] }],
  }]);
  return evaluator.evaluate({
    requestId: "integration-request-1",
    capabilityId,
    requester,
    profileId,
    requestedScope: effectiveScope,
  });
}

function createApprovalDecision() {
  const service = new ApprovalService({
    now: () => 1_000,
    createRequestId: () => "approval-integration-1",
  });
  const pending = service.createPending({
    capabilityRequestId: createCapabilityRequestId("integration-request-1"),
    capabilityId,
    requester,
    summary: "读取项目文件",
    reason: "Runtime integration contract test.",
    effectiveScope,
    expiresAt: 2_000,
  });
  return service.approve(pending.request.approvalRequestId, {
    kind: "filesystem",
    path: "C:\\workspace\\nested",
    access: "read",
  }).decision;
}

test("A-B. CapabilityBinding resolves and unknown capability/tool bindings fail predictably", () => {
  const capabilityRegistry = createCapabilityRegistry();
  const toolRegistry = createToolRegistry();
  const resolver = new CapabilityBindingResolver(capabilityRegistry, toolRegistry);
  const binding = { capabilityId, toolId };
  resolver.register(binding);
  assert.deepEqual(resolver.resolve(capabilityId), binding);

  assert.throws(
    () => resolver.register({ capabilityId: createCapabilityId("missing"), toolId }),
    (error) => error instanceof CapabilityBindingError && error.code === "CAPABILITY_NOT_FOUND",
  );
  capabilityRegistry.register({
    id: createCapabilityId("missing-tool-capability"),
    name: "Missing Tool Capability",
    description: "Contract-test capability metadata.",
    version: "1.0.0",
    category,
  });
  assert.throws(
    () => resolver.register({ capabilityId: createCapabilityId("missing-tool-capability"), toolId: "missing_tool" }),
    (error) => error instanceof CapabilityBindingError && error.code === "TOOL_NOT_FOUND",
  );
});

test("C. Sandbox effective scope is the scope carried into the authorized boundary", () => {
  const sandboxDecision = createSandboxDecision();
  assert.equal(sandboxDecision.allowed, true);
  if (sandboxDecision.allowed) {
    const invocation = createAuthorizedCapabilityInvocation({
      request: createRequest(),
      binding: { capabilityId, toolId },
      sandboxDecision,
      approvalRequirement: "none",
    });
    assert.deepEqual(invocation.effectiveScope, sandboxDecision.effectiveScope);
    assert.deepEqual(invocation.authorizedScope, sandboxDecision.effectiveScope);
    assert.deepEqual(invocation.authorization, { type: "sandbox-only" });
  }
});

test("D. ApprovalService rejects a grant wider than the Sandbox effective scope", () => {
  const service = new ApprovalService({
    now: () => 1_000,
    createRequestId: () => "approval-widening-1",
  });
  const pending = service.createPending({
    capabilityRequestId: createCapabilityRequestId("integration-request-widening"),
    capabilityId,
    requester,
    summary: "读取项目目录",
    reason: "Contract test.",
    effectiveScope,
    expiresAt: 2_000,
  });
  assert.throws(
    () => service.approve(pending.request.approvalRequestId, {
      kind: "filesystem",
      path: "C:\\",
      access: "read",
    }),
    (error) => error.code === "INVALID_APPROVAL_GRANT",
  );
});

test("E-F. Authorized invocation preserves requester and capability identity", () => {
  const sandboxDecision = createSandboxDecision();
  const requirementResolver = createApprovalRequirementResolver([
    { capabilityId, requirement: "required" },
  ]);
  assert.equal(
    requirementResolver({ capabilityId, requester, binding: { capabilityId, toolId } }),
    "required",
  );
  const invocation = createAuthorizedCapabilityInvocation({
    request: createRequest(),
    binding: { capabilityId, toolId },
    sandboxDecision,
    approvalRequirement: "required",
    approvalDecision: createApprovalDecision(),
    approvalRequestId: createApprovalRequestId("approval-integration-1"),
  });
  assert.deepEqual(invocation.request.requester, requester);
  assert.equal(invocation.request.capabilityId, capabilityId);
  assert.equal(invocation.binding.toolId, toolId);
  assert.equal(invocation.approvalGrant?.lifetime, "once");
  assert.equal(invocation.authorization.type, "approval-grant");
  assert.deepEqual(invocation.authorizedScope, {
    kind: "filesystem",
    path: "C:\\workspace\\nested",
    access: "read",
  });
});

test("G-H. Registration and Sandbox allow do not independently create an executable invocation", () => {
  const capabilityRegistry = createCapabilityRegistry();
  assert.equal(capabilityRegistry.has(capabilityId), true);
  const sandboxDecision = createSandboxDecision();
  assert.equal(sandboxDecision.allowed, true);
  assert.throws(
    () => createAuthorizedCapabilityInvocation({
      request: createRequest(),
      binding: { capabilityId, toolId },
      sandboxDecision,
      approvalRequirement: "required",
    }),
    (error) => error instanceof AuthorizedInvocationError && error.code === "APPROVAL_REQUIRED",
  );
});

test("I. An approval grant without a valid Sandbox context is rejected", () => {
  const deniedSandbox = {
    allowed: false,
    reason: { code: "OUTSIDE_SCOPE", message: "denied" },
  };
  assert.throws(
    () => createAuthorizedCapabilityInvocation({
      request: createRequest(),
      binding: { capabilityId, toolId },
      sandboxDecision: deniedSandbox,
      approvalRequirement: "required",
      approvalDecision: createApprovalDecision(),
    }),
    (error) => error instanceof AuthorizedInvocationError && error.code === "SANDBOX_NOT_ALLOWED",
  );
});

test("J. A SubAgent declaration alone does not create a binding or authorization", () => {
  const subAgentId = "integration-worker";
  const registry = new SubAgentRegistry();
  registry.register({
    id: subAgentId,
    name: "Integration Worker",
    description: "Declarative fixture.",
    version: "1.0.0",
    capabilities: [declaredOnlyCapabilityId],
  });
  const taskService = new SubAgentTaskService({
    registry,
    createTaskId: () => "integration-task-1",
  });
  const task = taskService.createTask({
    subAgentId,
    requester,
    objective: "检查声明边界",
    input: null,
    constraints: { maxSteps: 1, maxToolCalls: 0, timeoutMs: 1_000, maxDepth: 0 },
    depth: 0,
  });
  assert.equal(task.state, "pending");
  assert.equal(taskService.get(task.task.taskId)?.result, undefined);
});

test("K. Foundation components do not import or invoke ToolExecutionEngine", () => {
  for (const directory of ["capabilities", "sandbox", "approval", "subagents"]) {
    const absoluteDirectory = path.join(projectRoot, "src", "main", "runtime", directory);
    for (const fileName of fs.readdirSync(absoluteDirectory).filter((name) => name.endsWith(".ts"))) {
      const source = fs.readFileSync(path.join(absoluteDirectory, fileName), "utf8");
      assert.equal(source.includes("ToolExecutionEngine"), false, `${directory}/${fileName} must not own execution`);
      assert.equal(source.includes("executeToolCall"), false, `${directory}/${fileName} must not invoke execution`);
    }
  }
});

test("L-N. ToolExecutionEngine, Harness, and Agent Loop remain unique owners", () => {
  const guard = spawnSync(
    process.execPath,
    [path.join(projectRoot, "tools", "verify", "verify-architecture.mjs")],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.equal(guard.status, 0, guard.stderr || guard.stdout);
  assert.equal(typeof ToolExecutionEngine.prototype.executeToolCall, "function");
});

test("O. SubAgent runtime has no Character, Memory, RAG, TTS, or Live2D dependency", () => {
  const directory = path.join(projectRoot, "src", "main", "runtime", "subagents");
  for (const fileName of fs.readdirSync(directory).filter((name) => name.endsWith(".ts"))) {
    const source = fs.readFileSync(path.join(directory, fileName), "utf8").toLowerCase();
    for (const forbidden of ["character", "memory", "rag", "tts", "live2d", "renderer"]) {
      assert.equal(source.includes(forbidden), false, `${fileName} must not reference ${forbidden}`);
    }
  }
});

test("P. SubAgent result remains structured", () => {
  const result = { ok: true, output: { findings: ["dependency-a"] }, summary: "结构化结果" };
  assert.equal(result.ok, true);
  assert.deepEqual(result.output.findings, ["dependency-a"]);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test("Q. TypeScript production guard passes", () => {
  const guard = spawnSync(
    process.execPath,
    [path.join(projectRoot, "tools", "verify", "verify-typescript-production.mjs")],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.equal(guard.status, 0, guard.stderr || guard.stdout);
});
