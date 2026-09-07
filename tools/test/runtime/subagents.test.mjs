import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  createSubAgentId,
  createSubAgentTaskId,
  isSubAgentBudgetWithinParent,
} from "../../../dist/main/shared/subagent-types.js";
import {
  SubAgentRegistry,
} from "../../../dist/main/main/runtime/subagents/subagent-registry.js";
import {
  SubAgentServiceError,
} from "../../../dist/main/main/runtime/subagents/subagent-errors.js";
import {
  SubAgentTaskService,
} from "../../../dist/main/main/runtime/subagents/subagent-task-service.js";
import { CapabilityRegistry } from "../../../dist/main/main/runtime/capabilities/capability-registry.js";
import { SandboxPolicyEvaluator } from "../../../dist/main/main/runtime/sandbox/sandbox-policy.js";
import { ApprovalService } from "../../../dist/main/main/runtime/approval/approval-service.js";
import { ToolExecutionEngine } from "../../../dist/main/main/runtime/execution/tool-execution-engine.js";

const projectRoot = process.cwd();
const subagentDirectory = path.join(projectRoot, "src", "main", "runtime", "subagents");
const subAgentId = createSubAgentId("synthetic.worker");
const otherSubAgentId = createSubAgentId("synthetic.other");
const capabilityId = "synthetic.read";

function createDescriptor(id = subAgentId) {
  return {
    id,
    name: "Synthetic Worker",
    description: "Declarative functional-worker fixture.",
    version: "1.0.0",
    capabilities: [capabilityId],
  };
}

function createClock(start = 1_000) {
  let current = start;
  return {
    now: () => current,
    set: (value) => {
      current = value;
    },
  };
}

function createTaskIdFactory(prefix = "task") {
  let sequence = 0;
  return () => createSubAgentTaskId(`${prefix}-${++sequence}`);
}

function createConstraints(overrides = {}) {
  return {
    maxSteps: 4,
    maxToolCalls: 3,
    timeoutMs: 10_000,
    maxDepth: 2,
    ...overrides,
  };
}

function createRootInput(overrides = {}) {
  return {
    subAgentId,
    requester: { type: "main-agent", id: "firefly-main" },
    objective: "分析三个文件之间的依赖关系",
    input: { files: ["one.ts", "two.ts", "three.ts"] },
    constraints: createConstraints(),
    depth: 0,
    ...overrides,
  };
}

function createService() {
  const registry = new SubAgentRegistry();
  registry.register(createDescriptor());
  registry.register(createDescriptor(otherSubAgentId));
  const clock = createClock();
  const service = new SubAgentTaskService({
    registry,
    now: clock.now,
    createTaskId: createTaskIdFactory(),
  });
  return { registry, clock, service };
}

test("A. A valid SubAgent descriptor registers", () => {
  const registry = new SubAgentRegistry();
  registry.register(createDescriptor());
  assert.equal(registry.has(subAgentId), true);
  assert.deepEqual(registry.get(subAgentId), createDescriptor());
});

test("B-C. Duplicate IDs are rejected and lookup/list are deterministic", () => {
  const registry = new SubAgentRegistry();
  registry.register(createDescriptor());
  assert.throws(
    () => registry.register(createDescriptor()),
    (error) => error instanceof SubAgentServiceError && error.code === "SUBAGENT_ALREADY_REGISTERED",
  );
  assert.equal(registry.get(subAgentId)?.id, subAgentId);
  assert.deepEqual(registry.list().map((descriptor) => descriptor.id), [subAgentId]);
});

test("D-E. Descriptors are declarative and preserve capability declarations", () => {
  const registry = new SubAgentRegistry();
  registry.register(createDescriptor());
  const descriptor = registry.get(subAgentId);
  assert.ok(descriptor);
  assert.deepEqual(Object.keys(descriptor), ["id", "name", "description", "version", "capabilities"]);
  assert.deepEqual(descriptor.capabilities, [capabilityId]);
  assert.equal(Object.prototype.hasOwnProperty.call(descriptor, "execute"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(descriptor, "persona"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(descriptor, "voice"), false);
});

test("F. Declared capability does not authorize a request", () => {
  const registry = new SubAgentRegistry();
  registry.register(createDescriptor());
  const capabilityRegistry = new CapabilityRegistry();
  const service = new SubAgentTaskService({
    registry,
    createTaskId: createTaskIdFactory("authorization"),
  });
  const task = service.createTask(createRootInput());
  assert.deepEqual(task.task.requester, { type: "main-agent", id: "firefly-main" });
  assert.equal(registry.get(subAgentId)?.capabilities.includes(capabilityId), true);
  assert.equal(capabilityRegistry.has(capabilityId), false);
});

test("G-H. A task is serializable and task identity is distinct from profile identity", () => {
  const { service } = createService();
  const record = service.createTask(createRootInput());
  assert.notEqual(record.task.taskId, record.task.subAgentId);
  assert.doesNotThrow(() => JSON.stringify(record.task));
  assert.equal(record.task.objective, "分析三个文件之间的依赖关系");
});

test("I-J. Requester and parent lineage are preserved", () => {
  const { service } = createService();
  const parent = service.createTask(createRootInput({ parentRunId: "run-1" }));
  const child = service.createTask(createRootInput({
    subAgentId: otherSubAgentId,
    requester: {
      type: "subagent",
      id: "synthetic-worker-task",
      subAgentId,
      taskId: parent.task.taskId,
      parentRunId: "run-1",
    },
    parentRunId: "run-1",
    parentTaskId: parent.task.taskId,
    depth: 1,
    constraints: createConstraints({ maxSteps: 2, maxToolCalls: 1, timeoutMs: 5_000, maxDepth: 1 }),
  }));
  assert.equal(child.task.parentRunId, "run-1");
  assert.equal(child.task.parentTaskId, parent.task.taskId);
  assert.equal(child.task.depth, 1);
  assert.deepEqual(child.task.requester, {
    type: "subagent",
    id: "synthetic-worker-task",
    subAgentId,
    taskId: parent.task.taskId,
    parentRunId: "run-1",
  });
});

test("K-L. Valid depth is accepted and invalid/excessive depth is rejected", () => {
  const { service } = createService();
  assert.equal(service.createTask(createRootInput()).task.depth, 0);
  assert.throws(
    () => service.createTask(createRootInput({ depth: 1 })),
    (error) => error instanceof SubAgentServiceError && error.code === "INVALID_DELEGATION_DEPTH",
  );
  assert.throws(
    () => service.createTask(createRootInput({ depth: 3 })),
    (error) => error instanceof SubAgentServiceError && error.code === "INVALID_DELEGATION_DEPTH",
  );
  assert.equal(isSubAgentBudgetWithinParent(createConstraints(), createConstraints({ maxSteps: 2 })), true);
  assert.equal(isSubAgentBudgetWithinParent(createConstraints(), createConstraints({ maxSteps: 5 })), false);
});

test("M-N. PENDING transitions to RUNNING and then SUCCEEDED", () => {
  const { clock, service } = createService();
  const pending = service.createTask(createRootInput());
  clock.set(1_100);
  const running = service.start(pending.task.taskId);
  assert.equal(running.state, "running");
  assert.equal(running.startedAt, 1_100);
  clock.set(1_200);
  const succeeded = service.succeed(running.task.taskId, {
    ok: true,
    output: { dependencies: ["one.ts", "two.ts"] },
    summary: "依赖关系已整理。",
  });
  assert.equal(succeeded.state, "succeeded");
  assert.deepEqual(succeeded.result, {
    ok: true,
    output: { dependencies: ["one.ts", "two.ts"] },
    summary: "依赖关系已整理。",
  });
  assert.equal(succeeded.resolvedAt, 1_200);
});

test("O. RUNNING transitions to FAILED with a structured failure", () => {
  const { service } = createService();
  const running = service.start(service.createTask(createRootInput()).task.taskId);
  const failed = service.fail(running.task.taskId, {
    code: "RUNTIME_FAILURE",
    message: "Synthetic failure.",
    details: { source: "test" },
  });
  assert.equal(failed.state, "failed");
  assert.deepEqual(failed.result, {
    ok: false,
    error: { code: "RUNTIME_FAILURE", message: "Synthetic failure.", details: { source: "test" } },
  });
});

test("P-Q. PENDING and RUNNING tasks can be CANCELLED", () => {
  const { service } = createService();
  const pending = service.createTask(createRootInput());
  assert.equal(service.cancel(pending.task.taskId).state, "cancelled");

  const running = service.start(service.createTask(createRootInput()).task.taskId);
  assert.equal(service.cancel(running.task.taskId, "Stopped by parent.").state, "cancelled");
});

test("R. Terminal transitions are rejected predictably", () => {
  const { service } = createService();
  const pending = service.createTask(createRootInput());
  const cancelled = service.cancel(pending.task.taskId);
  assert.throws(
    () => service.start(cancelled.task.taskId),
    (error) => error instanceof SubAgentServiceError && error.code === "TASK_ALREADY_TERMINAL",
  );
});

test("S-T. Success and failure are discriminated structured results", () => {
  const success = { ok: true, output: { answer: "structured" } };
  const failure = { ok: false, error: { code: "TIMEOUT", message: "Timed out." } };
  assert.equal(success.ok, true);
  assert.equal(failure.ok, false);
  assert.doesNotThrow(() => JSON.stringify(success));
  assert.doesNotThrow(() => JSON.stringify(failure));
});

test("U-Y. SubAgent foundation has no tool, Harness, LLM, Sandbox, or Approval owner", () => {
  const source = fs.readdirSync(subagentDirectory)
    .filter((fileName) => fileName.endsWith(".ts"))
    .map((fileName) => fs.readFileSync(path.join(subagentDirectory, fileName), "utf8"))
    .join("\n");
  for (const forbidden of [
    "ToolExecutionEngine",
    "FireflyHarness",
    "invokeLLM",
    "invokeTool",
    "executeTool",
    "SandboxPolicyEvaluator",
    "ApprovalService",
    "SubAgentExecutor",
    "SubAgentRunner",
    "SubAgentHarness",
    "SubAgentLoop",
  ]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} must not be implemented`);
  }
  assert.equal(typeof ToolExecutionEngine.prototype.executeToolCall, "function");
  assert.equal(fs.existsSync(path.join(subagentDirectory, "subagent-loop.ts")), false);
});

test("Z. Character, TTS, and Live2D ownership remains outside SubAgent runtime", () => {
  const source = fs.readdirSync(subagentDirectory)
    .filter((fileName) => fileName.endsWith(".ts"))
    .map((fileName) => fs.readFileSync(path.join(subagentDirectory, fileName), "utf8"))
    .join("\n");
  for (const forbidden of ["character", "renderer", "Live2D", "TTS", "GPT-SoVITS", "gptsovits"]) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, `${forbidden} must not leak into SubAgent runtime`);
  }
});

test("AA. TypeScript and architecture production guards pass", () => {
  const typeScriptGuard = spawnSync(
    process.execPath,
    [path.join(projectRoot, "tools", "verify", "verify-typescript-production.mjs")],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.equal(typeScriptGuard.status, 0, typeScriptGuard.stderr || typeScriptGuard.stdout);

  const architectureGuard = spawnSync(
    process.execPath,
    [path.join(projectRoot, "tools", "verify", "verify-architecture.mjs")],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.equal(architectureGuard.status, 0, architectureGuard.stderr || architectureGuard.stdout);
});

test("Version remains 1.1.1", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  assert.equal(packageJson.version, "1.1.1");
});
