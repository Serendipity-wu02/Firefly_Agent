import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  SandboxPolicyEvaluator,
} from "../../../dist/main/main/runtime/sandbox/sandbox-policy.js";
import {
  SandboxPolicyError,
} from "../../../dist/main/main/runtime/sandbox/sandbox-errors.js";
import {
  createSandboxProfileId,
} from "../../../dist/main/shared/sandbox-types.js";
import {
  createCapabilityId,
} from "../../../dist/main/shared/capability-types.js";
import {
  CapabilityRegistry,
} from "../../../dist/main/main/runtime/capabilities/capability-registry.js";
import { ToolExecutionEngine } from "../../../dist/main/main/runtime/execution/tool-execution-engine.js";

const projectRoot = process.cwd();
const runtimeDirectory = path.join(projectRoot, "src", "main", "runtime", "sandbox");
const profileId = createSandboxProfileId("synthetic-workspace-read");
const capabilityId = createCapabilityId("synthetic.read");
const workspaceProfile = {
  id: profileId,
  version: "1.0.0",
  rules: [
    {
      kind: "filesystem",
      allowedRoots: ["C:\\workspace"],
      access: ["read"],
    },
    {
      kind: "network",
      allowedHosts: ["example.com"],
      allowedPorts: [443],
    },
    {
      kind: "process",
      allowedExecutables: ["node.exe"],
    },
    {
      kind: "desktop",
      allowedTargets: ["qq-music"],
    },
  ],
};

function makeInput(requestedScope, requester = { type: "main-agent", id: "firefly-main" }) {
  return {
    requestId: "request-1",
    capabilityId,
    requester,
    profileId,
    requestedScope,
    context: { runId: "run-1", conversationId: "conversation-1" },
  };
}

test("A. A nested filesystem path inside an allowed root is allowed", () => {
  const evaluator = new SandboxPolicyEvaluator([workspaceProfile]);
  const decision = evaluator.evaluate(
    makeInput({ kind: "filesystem", path: "C:\\workspace\\nested\\file.txt", access: "read" }),
  );

  assert.deepEqual(decision, {
    allowed: true,
    effectiveScope: {
      kind: "filesystem",
      path: "C:\\workspace\\nested\\file.txt",
      access: "read",
    },
  });
});

test("A1. Windows filesystem path matching is case-insensitive", () => {
  const evaluator = new SandboxPolicyEvaluator([workspaceProfile]);
  const decision = evaluator.evaluate(
    makeInput({ kind: "filesystem", path: "c:\\WORKSPACE\\Nested\\file.txt", access: "read" }),
  );

  assert.equal(decision.allowed, true);
});

test("B. A relative filesystem path is denied as invalid", () => {
  const evaluator = new SandboxPolicyEvaluator([workspaceProfile]);
  const decision = evaluator.evaluate(
    makeInput({ kind: "filesystem", path: "relative\\file.txt", access: "read" }),
  );

  assert.equal(decision.allowed, false);
  if (!decision.allowed) assert.equal(decision.reason.code, "INVALID_SCOPE");
});

test("C. An unknown profile denies by default", () => {
  const evaluator = new SandboxPolicyEvaluator();
  const decision = evaluator.evaluate(makeInput({
    kind: "filesystem",
    path: "C:\\workspace\\file.txt",
    access: "read",
  }));

  assert.equal(decision.allowed, false);
  if (!decision.allowed) assert.equal(decision.reason.code, "POLICY_NOT_FOUND");
});

test("D-E. Denial is discriminated and outside paths use a stable code", () => {
  const evaluator = new SandboxPolicyEvaluator([workspaceProfile]);
  const decision = evaluator.evaluate(makeInput({
    kind: "filesystem",
    path: "C:\\workspace-evil\\file.txt",
    access: "read",
  }));

  assert.equal(decision.allowed, false);
  if (!decision.allowed) {
    assert.equal(decision.reason.code, "OUTSIDE_SCOPE");
    assert.equal(typeof decision.reason.message, "string");
  }
});

test("F-G. Requester and capability identity cross the boundary as metadata", () => {
  const evaluator = new SandboxPolicyEvaluator([workspaceProfile]);
  for (const requester of [
    { type: "main-agent", id: "firefly-main" },
    { type: "subagent", id: "future-subagent", parentRunId: "run-1" },
    { type: "system-runtime", id: "system" },
  ]) {
    const input = makeInput(
      { kind: "filesystem", path: "C:\\workspace\\file.txt", access: "read" },
      requester,
    );
    assert.equal(input.capabilityId, capabilityId);
    assert.equal(evaluator.evaluate(input).allowed, true);
  }
});

test("H-I. The evaluator is declarative and has no execution or renderer dependencies", () => {
  const prototypeNames = Object.getOwnPropertyNames(SandboxPolicyEvaluator.prototype);
  for (const forbiddenName of ["execute", "run", "invoke", "executeToolCall", "executeRound"]) {
    assert.equal(prototypeNames.includes(forbiddenName), false, `${forbiddenName} must not be an evaluator method`);
  }

  const source = fs.readFileSync(path.join(runtimeDirectory, "sandbox-policy.ts"), "utf8");
  for (const forbiddenText of ["ToolExecutionEngine", "BrowserWindow", "gptsovits", "renderer"]) {
    assert.equal(source.includes(forbiddenText), false, `${forbiddenText} must not be a sandbox dependency`);
  }
});

test("J. ToolExecutionEngine remains the canonical execution owner", () => {
  assert.equal(typeof ToolExecutionEngine.prototype.executeToolCall, "function");
  assert.equal(typeof ToolExecutionEngine.prototype.executeRound, "function");
});

test("K-L. Sandbox runtime does not implement approval or future agent execution", () => {
  for (const fileName of ["sandbox-errors.ts", "sandbox-policy.ts"]) {
    const source = fs.readFileSync(path.join(runtimeDirectory, fileName), "utf8");
    assert.equal(/Approval|approval/.test(source), false, `${fileName} must not implement approval`);
    assert.equal(/SubAgent|subagent/.test(source), false, `${fileName} must not implement future agent execution`);
  }
});

test("M. CapabilityRegistry exposes no execution behavior", () => {
  const prototypeNames = Object.getOwnPropertyNames(CapabilityRegistry.prototype);
  for (const forbiddenName of ["execute", "run", "invoke", "invokeTool", "executeToolCall"]) {
    assert.equal(prototypeNames.includes(forbiddenName), false, `${forbiddenName} must not be a registry method`);
  }
});

test("N-P. Filesystem traversal and prefix collisions are denied", () => {
  const evaluator = new SandboxPolicyEvaluator([workspaceProfile]);
  for (const pathValue of ["C:\\workspace\\..\\outside\\file.txt", "C:\\workspace-evil\\file.txt"]) {
    const decision = evaluator.evaluate(makeInput({
      kind: "filesystem",
      path: pathValue,
      access: "read",
    }));
    assert.equal(decision.allowed, false);
    if (!decision.allowed) assert.equal(decision.reason.code, "OUTSIDE_SCOPE");
  }
});

test("Q-R. Network host matching is exact and case-insensitive", () => {
  const evaluator = new SandboxPolicyEvaluator([workspaceProfile]);
  const allowed = evaluator.evaluate(makeInput({
    kind: "network",
    host: "EXAMPLE.COM",
    port: 443,
  }));
  assert.equal(allowed.allowed, true);

  const denied = evaluator.evaluate(makeInput({
    kind: "network",
    host: "example.com.evil.test",
    port: 443,
  }));
  assert.equal(denied.allowed, false);
  if (!denied.allowed) assert.equal(denied.reason.code, "OUTSIDE_SCOPE");
});

test("S. Runtime files are limited to the evaluator and its error type", () => {
  const runtimeFiles = fs.readdirSync(runtimeDirectory).sort();
  assert.deepEqual(runtimeFiles, ["sandbox-errors.ts", "sandbox-policy.ts"]);
  for (const forbiddenName of [
    "sandbox-executor.ts",
    "sandbox-tool-executor.ts",
    "capability-executor.ts",
    "secure-tool-executor.ts",
  ]) {
    assert.equal(fs.existsSync(path.join(runtimeDirectory, forbiddenName)), false);
  }
  for (const fileName of runtimeFiles) {
    const source = fs.readFileSync(path.join(runtimeDirectory, fileName), "utf8");
    for (const forbiddenSymbol of [
      "SandboxExecutor",
      "SandboxToolExecutor",
      "CapabilityExecutor",
      "SecureToolExecutor",
    ]) {
      assert.equal(source.includes(forbiddenSymbol), false, `${forbiddenSymbol} must not be a production symbol`);
    }
  }
});

test("T. Duplicate profile IDs are rejected with a stable error code", () => {
  assert.throws(
    () => new SandboxPolicyEvaluator([workspaceProfile, workspaceProfile]),
    (error) =>
      error instanceof SandboxPolicyError &&
      error.code === "DUPLICATE_PROFILE_ID" &&
      error.message === 'Sandbox profile "synthetic-workspace-read" is already registered.',
  );
});

test("U. TypeScript production guard passes", () => {
  const guard = spawnSync(
    process.execPath,
    [path.join(projectRoot, "tools", "verify", "verify-typescript-production.mjs")],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.equal(guard.status, 0, guard.stderr || guard.stdout);
});
