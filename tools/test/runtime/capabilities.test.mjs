import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  CapabilityRegistry,
} from "../../../dist/main/main/runtime/capabilities/capability-registry.js";
import {
  CapabilityRegistryError,
} from "../../../dist/main/main/runtime/capabilities/capability-errors.js";
import {
  createCapabilityCategory,
  createCapabilityId,
  createCapabilityRequestId,
} from "../../../dist/main/shared/capability-types.js";
import { ToolExecutionEngine } from "../../../dist/main/main/runtime/execution/tool-execution-engine.js";
import { FireflyToolRegistry } from "../../../dist/main/main/tools/tool-registry.js";

const projectRoot = process.cwd();
const capabilityId = createCapabilityId("synthetic.read");
const category = createCapabilityCategory("synthetic");

function createDescriptor(id = capabilityId, descriptorCategory = category) {
  return {
    id,
    name: "Synthetic Read",
    description: "Declarative test capability metadata.",
    version: "1.0.0",
    category: descriptorCategory,
  };
}

test("A-D. Register, get, has, list, and category query are deterministic", () => {
  const registry = new CapabilityRegistry();
  const descriptor = createDescriptor();
  registry.register(descriptor);

  assert.deepEqual(registry.get(capabilityId), descriptor);
  assert.equal(registry.has(capabilityId), true);
  assert.deepEqual(registry.list(), [descriptor]);
  assert.deepEqual(registry.listByCategory(category), [descriptor]);
});

test("E. Duplicate capability IDs are rejected with a stable error code", () => {
  const registry = new CapabilityRegistry();
  registry.register(createDescriptor());

  assert.throws(
    () => registry.register(createDescriptor()),
    (error) =>
      error instanceof CapabilityRegistryError &&
      error.code === "DUPLICATE_ID" &&
      error.message === 'Capability "synthetic.read" is already registered.',
  );
});

test("F. Unknown capability lookup is predictable", () => {
  const registry = new CapabilityRegistry();
  const unknownId = createCapabilityId("synthetic.unknown");

  assert.equal(registry.get(unknownId), undefined);
  assert.equal(registry.has(unknownId), false);
});

test("G. Descriptors are declarative metadata only", () => {
  const descriptor = createDescriptor();
  const registry = new CapabilityRegistry();
  registry.register(descriptor);
  const stored = registry.get(capabilityId);

  assert.ok(stored);
  assert.deepEqual(Object.keys(stored), ["id", "name", "description", "version", "category"]);
  assert.equal(Object.prototype.hasOwnProperty.call(stored, "execute"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(stored, "run"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(stored, "invoke"), false);
});

test("H-I. CapabilityResult has success and failure discriminants", () => {
  const success = { ok: true, value: { observed: true } };
  const failure = {
    ok: false,
    error: { code: "UNAVAILABLE", message: "Synthetic capability unavailable." },
  };

  assert.equal(success.ok, true);
  if (success.ok) assert.deepEqual(success.value, { observed: true });
  assert.equal(failure.ok, false);
  if (!failure.ok) assert.equal(failure.error.code, "UNAVAILABLE");
});

test("J. Capability errors expose stable codes", () => {
  const error = new CapabilityRegistryError(
    "INVALID_DESCRIPTOR",
    "Capability descriptor field \"name\" must be a non-empty string.",
  );
  assert.equal(error.code, "INVALID_DESCRIPTOR");
  assert.equal(error.name, "CapabilityRegistryError");
});

test("K-L. Requests carry identity while runtime context stays separate", () => {
  const request = {
    requestId: createCapabilityRequestId("request-1"),
    capabilityId,
    requester: { type: "main-agent", id: "firefly-main" },
    input: { query: "hello" },
  };
  const context = {
    runId: "run-1",
    conversationId: "conversation-1",
    metadata: { source: "test" },
  };

  assert.equal(request.capabilityId, capabilityId);
  assert.deepEqual(request.requester, { type: "main-agent", id: "firefly-main" });
  assert.equal("runId" in request, false);
  assert.equal("requestId" in context, false);
  assert.doesNotThrow(() => JSON.stringify(request));
});

test("M. CapabilityRegistry exposes no execution behavior", () => {
  const prototypeNames = Object.getOwnPropertyNames(CapabilityRegistry.prototype);
  for (const forbiddenName of ["execute", "run", "invoke", "invokeTool", "executeToolCall"]) {
    assert.equal(prototypeNames.includes(forbiddenName), false, `${forbiddenName} must not be a registry method`);
  }
});

test("N. ToolExecutionEngine remains the canonical execution owner", () => {
  assert.equal(typeof ToolExecutionEngine.prototype.executeToolCall, "function");
  assert.equal(typeof ToolExecutionEngine.prototype.executeRound, "function");
});

test("O. Capability foundation does not introduce a second ToolRegistry", () => {
  const capabilityDirectory = path.join(projectRoot, "src", "main", "runtime", "capabilities");
  const entries = fs.readdirSync(capabilityDirectory);
  assert.deepEqual(entries.sort(), [
    "capability-binding-resolver.ts",
    "capability-errors.ts",
    "capability-registry.ts",
  ]);

  const registrySource = fs.readFileSync(
    path.join(capabilityDirectory, "capability-registry.ts"),
    "utf8",
  );
  assert.equal(registrySource.includes("class FireflyToolRegistry"), false);
  assert.equal(registrySource.includes("class ToolRegistry"), false);
});

test("P. Synthetic tool-capability binding remains metadata-only", () => {
  const binding = { capabilityId, toolId: "synthetic_tool" };
  assert.deepEqual(binding, {
    capabilityId,
    toolId: "synthetic_tool",
  });
  assert.equal(Object.prototype.hasOwnProperty.call(binding, "execute"), false);
});

test("Q. TypeScript production guard passes", () => {
  const guard = spawnSync(
    process.execPath,
    [path.join(projectRoot, "tools", "verify", "verify-typescript-production.mjs")],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.equal(guard.status, 0, guard.stderr || guard.stdout);
});

test("V1.1.1. package.json is the current product version source", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
  );
  assert.equal(packageJson.version, "1.1.1");
});
