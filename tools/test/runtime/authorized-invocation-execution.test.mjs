import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { AuthorizedInvocationBridge } from "../../../dist/main/main/runtime/authorization/authorized-invocation-bridge.js";
import { FireflyToolRegistry } from "../../../dist/main/main/tools/tool-registry.js";
import { ToolExecutionEngine } from "../../../dist/main/main/runtime/execution/tool-execution-engine.js";
import { createCapabilityId, createCapabilityRequestId } from "../../../dist/main/shared/capability-types.js";
import { createApprovalRequestId } from "../../../dist/main/shared/approval-types.js";
import { createAuthorizedCapabilityInvocation } from "../../../dist/main/shared/runtime-integration-types.js";

const projectRoot = process.cwd();
const bridgeSourcePath = path.join(
  projectRoot,
  "src",
  "main",
  "runtime",
  "authorization",
  "authorized-invocation-bridge.ts",
);
const capabilityId = createCapabilityId("execution.seam");
const toolId = "execution_seam_tool";
const requester = { type: "main-agent", id: "firefly-main" };
const scope = { kind: "filesystem", path: "C:\\workspace", access: "read" };

function createContext(overrides = {}) {
  return {
    runId: "run-execution-seam-1",
    step: 1,
    toolCallsCount: 0,
    ...overrides,
  };
}

function createInvocation(overrides = {}) {
  const requestId = overrides.requestId || createCapabilityRequestId("execution-seam-request-1");
  const requestCapabilityId = overrides.requestCapabilityId || capabilityId;
  const bindingCapabilityId = overrides.bindingCapabilityId || requestCapabilityId;
  const bindingToolId = overrides.bindingToolId || toolId;
  const input = overrides.input || { value: "authorized-input" };
  const approvalRequirement = overrides.approvalRequirement || "none";
  const request = {
    requestId,
    capabilityId: requestCapabilityId,
    requester,
    input,
  };
  const base = {
    request,
    binding: { capabilityId: bindingCapabilityId, toolId: bindingToolId },
    sandboxDecision: { allowed: true, effectiveScope: scope },
    approvalRequirement,
    correlation: overrides.correlation,
  };

  if (approvalRequirement === "required") {
    const approvalRequestId = overrides.approvalRequestId ||
      createApprovalRequestId("execution-seam-approval-1");
    return createAuthorizedCapabilityInvocation({
      ...base,
      approvalRequestId,
      approvalDecision: {
        approved: true,
        grant: {
          lifetime: "once",
          scope: overrides.authorizedScope || scope,
        },
      },
    });
  }
  return createAuthorizedCapabilityInvocation(base);
}

function createFixture({ tool = {}, policy = {} } = {}) {
  const registry = new FireflyToolRegistry();
  let executionCount = 0;
  registry.register({
    id: toolId,
    name: "Execution Seam Tool",
    description: "Test-only concrete tool fixture.",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    ...tool,
    execute: async (args, ctx) => {
      executionCount += 1;
      if (tool.execute) return tool.execute(args, ctx);
      return JSON.stringify({ ok: true, args });
    },
  });
  const engine = new ToolExecutionEngine(registry, policy);
  const bridge = new AuthorizedInvocationBridge(engine, registry);
  return {
    registry,
    engine,
    bridge,
    get executionCount() {
      return executionCount;
    },
  };
}

test("A. Authorized invocation delegates to the canonical engine and preserves its result", async () => {
  const fixture = createFixture();
  const invocation = createInvocation();
  const result = await fixture.bridge.execute({ invocation, context: createContext() });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, "succeeded");
  assert.equal(result.toolId, toolId);
  assert.equal(result.capabilityId, capabilityId);
  assert.equal(result.requestId, invocation.request.requestId);
  assert.deepEqual(result.requester, requester);
  assert.equal(result.canonicalResult?.name, toolId);
  assert.equal(fixture.executionCount, 1);
});

test("B. No-approval provenance and authorized scope survive the hand-off", async () => {
  const fixture = createFixture();
  const result = await fixture.bridge.execute(createInvocation(), createContext());

  assert.equal(result.ok, true);
  assert.deepEqual(result.authorization, { type: "sandbox-only" });
  assert.deepEqual(result.effectiveScope, scope);
  assert.deepEqual(result.authorizedScope, scope);
  assert.equal(result.approvalRequirement, "none");
});

test("C. Approved invocation preserves ONCE approval provenance", async () => {
  const fixture = createFixture();
  const invocation = createInvocation({
    requestId: createCapabilityRequestId("execution-seam-approved-request"),
    approvalRequirement: "required",
    approvalRequestId: createApprovalRequestId("execution-seam-approved-1"),
    authorizedScope: { kind: "filesystem", path: "C:\\workspace\\safe", access: "read" },
  });
  const result = await fixture.bridge.execute({ invocation, context: createContext() });

  assert.equal(result.ok, true);
  assert.equal(result.authorization?.type, "approval-grant");
  assert.equal(result.authorization?.grantLifetime, "once");
  assert.equal(result.authorization?.approvalRequestId, "execution-seam-approved-1");
  assert.deepEqual(result.authorizedScope, {
    kind: "filesystem",
    path: "C:\\workspace\\safe",
    access: "read",
  });
});

test("D. The bridge executes the authorized binding tool without capability re-resolution", async () => {
  const fixture = createFixture();
  let otherToolExecuted = false;
  fixture.registry.register({
    id: "execution_other_tool",
    name: "Other Tool",
    description: "Must not be selected by capability lookup.",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    execute: async () => {
      otherToolExecuted = true;
      return JSON.stringify({ ok: true });
    },
  });
  const result = await fixture.bridge.execute(createInvocation(), createContext());

  assert.equal(result.ok, true);
  assert.equal(result.toolId, toolId);
  assert.equal(otherToolExecuted, false);
});

test("E. Raw input is rejected before execution", async () => {
  const fixture = createFixture();
  const result = await fixture.bridge.execute({
    requestId: "raw-request",
    capabilityId,
    requester,
    input: {},
  }, createContext());

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_AUTHORIZED_INVOCATION");
  assert.equal(fixture.executionCount, 0);
});

test("F. Unknown authorized binding tool fails deterministically before engine execution", async () => {
  const fixture = createFixture();
  const result = await fixture.bridge.execute(
    createInvocation({ bindingToolId: "execution_missing_tool" }),
    createContext(),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "TOOL_NOT_FOUND");
  assert.equal(fixture.executionCount, 0);
});

test("G. Binding capability mismatch is a typed authorization failure", async () => {
  const fixture = createFixture();
  const invocation = createInvocation();
  const result = await fixture.bridge.execute(
    {
      ...invocation,
      binding: {
        ...invocation.binding,
        capabilityId: createCapabilityId("execution.other"),
      },
    },
    createContext(),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "AUTHORIZATION_BINDING_MISMATCH");
  assert.equal(fixture.executionCount, 0);
});

test("H. A registered capability without an authorized binding is not executable", async () => {
  const fixture = createFixture();
  const invocation = createInvocation();
  const result = await fixture.bridge.execute({ request: invocation.request }, createContext());

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_AUTHORIZED_INVOCATION");
  assert.equal(fixture.executionCount, 0);
});

test("I. An approval grant without a valid authorized Sandbox scope is rejected", async () => {
  const fixture = createFixture();
  const invocation = createInvocation({ approvalRequirement: "required" });
  const invalid = { ...invocation, effectiveScope: undefined };
  const result = await fixture.bridge.execute(invalid, createContext());

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_AUTHORIZED_INVOCATION");
  assert.equal(fixture.executionCount, 0);
});

test("J. Approval metadata without the required provenance is rejected", async () => {
  const fixture = createFixture();
  const invocation = createInvocation();
  const invalid = { ...invocation, approvalGrant: { lifetime: "once", scope } };
  const result = await fixture.bridge.execute(invalid, createContext());

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_AUTHORIZED_INVOCATION");
  assert.equal(fixture.executionCount, 0);
});

test("K. Legacy ToolPolicy confirmation remains active without upstream authorization", async () => {
  const fixture = createFixture({ tool: { safetyLevel: "confirm_required" } });
  const result = await fixture.engine.executeToolCall(
    { id: "legacy-confirmation", name: toolId, arguments: {} },
    createContext(),
  );

  assert.equal(result.isError, true);
  assert.match(result.output, /confirmation_required/);
  assert.equal(fixture.executionCount, 0);
});

test("L. Valid upstream authorization avoids a second confirmation", async () => {
  const fixture = createFixture({ tool: { safetyLevel: "confirm_required" } });
  const result = await fixture.bridge.execute(
    createInvocation({
      approvalRequirement: "required",
      approvalRequestId: createApprovalRequestId("execution-seam-confirmed-1"),
    }),
    createContext(),
  );

  assert.equal(result.ok, true);
  assert.equal(fixture.executionCount, 1);
});

test("M. Upstream authorization does not bypass an explicit policy denial", async () => {
  const fixture = createFixture({ policy: { deniedTools: [toolId] } });
  const result = await fixture.bridge.execute(createInvocation(), createContext());

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "TOOL_POLICY_FAILURE");
  assert.equal(fixture.executionCount, 0);
});

test("N. Retry remains owned by ToolExecutionEngine", async () => {
  let attempts = 0;
  const fixture = createFixture({
    policy: { rules: { [toolId]: { maxRetries: 1, retryBackoffMs: 1 } } },
    tool: {
      execute: async () => {
        attempts += 1;
        return attempts === 1
          ? JSON.stringify({ ok: false, error: "network_timeout" })
          : JSON.stringify({ ok: true, attempts });
      },
    },
  });
  const result = await fixture.bridge.execute(createInvocation(), createContext());

  assert.equal(result.ok, true);
  assert.equal(attempts, 2);
});

test("O. Result truncation remains owned by ToolResultPolicy", async () => {
  const fixture = createFixture({
    policy: { rules: { [toolId]: { maxResultChars: 80 } } },
    tool: { execute: async () => `RESULT_${"A".repeat(500)}` },
  });
  const result = await fixture.bridge.execute(createInvocation(), createContext());

  assert.equal(result.ok, true);
  assert.ok(result.canonicalResult.output.length <= 130);
  assert.match(result.canonicalResult.output, /ToolResultPolicy/);
});

test("P. AbortSignal is forwarded through the canonical engine", async () => {
  let observedSignal;
  let started;
  const startedPromise = new Promise((resolve) => {
    started = resolve;
  });
  const fixture = createFixture({
    tool: {
      execute: async (_args, ctx) => {
        observedSignal = ctx?.signal;
        started();
        await new Promise((resolve) => {
          ctx?.signal?.addEventListener("abort", resolve, { once: true });
        });
        throw new Error("cancelled by test");
      },
    },
  });
  const controller = new AbortController();
  const execution = fixture.bridge.execute(createInvocation(), createContext({ signal: controller.signal }));
  await startedPromise;
  controller.abort();
  const result = await execution;

  assert.ok(observedSignal);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "CANCELLED");
});

test("Q. Concrete tool failure is typed while the canonical failure is preserved", async () => {
  const fixture = createFixture({
    tool: { execute: async () => { throw new Error("fixture failure"); } },
  });
  const result = await fixture.bridge.execute(createInvocation(), createContext());

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "TOOL_EXECUTION_FAILURE");
  assert.equal(result.canonicalResult?.isError, true);
  assert.match(result.canonicalResult?.output || "", /fixture failure/);
});

test("R. Pre-aborted execution produces CANCELLED without invoking the tool", async () => {
  const fixture = createFixture();
  const controller = new AbortController();
  controller.abort();
  const result = await fixture.bridge.execute(
    createInvocation(),
    createContext({ signal: controller.signal }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "CANCELLED");
  assert.equal(fixture.executionCount, 0);
});

test("S. One bridge call delegates to executeToolCall exactly once", async () => {
  const fixture = createFixture();
  const original = fixture.engine.executeToolCall.bind(fixture.engine);
  let engineCalls = 0;
  fixture.engine.executeToolCall = async (...args) => {
    engineCalls += 1;
    return original(...args);
  };
  const result = await fixture.bridge.execute(createInvocation(), createContext());

  assert.equal(result.ok, true);
  assert.equal(engineCalls, 1);
});

test("T. A raw CapabilityRequest is not accepted as an executable invocation", async () => {
  const fixture = createFixture();
  const invocation = createInvocation();
  const result = await fixture.bridge.execute({
    invocation: invocation.request,
    context: createContext(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_AUTHORIZED_INVOCATION");
});

test("U. The bridge does not import ApprovalService or SandboxPolicy", () => {
  const source = fs.readFileSync(bridgeSourcePath, "utf8");
  assert.doesNotMatch(source, /ApprovalService|SandboxPolicy|SandboxPolicyEvaluator/);
});

test("V. The bridge does not import Harness, Character, Memory, RAG, TTS, Live2D, or renderer", () => {
  const source = fs.readFileSync(bridgeSourcePath, "utf8").toLowerCase();
  for (const forbidden of ["harness", "character", "memory", "rag", "tts", "live2d", "renderer", "browserwindow", "electron"]) {
    assert.equal(source.includes(forbidden), false, `bridge must not reference ${forbidden}`);
  }
});

test("W. The bridge contains no second executor or policy implementation", () => {
  const source = fs.readFileSync(bridgeSourcePath, "utf8");
  assert.doesNotMatch(source, /ToolPolicyEvaluator|FireflyToolDispatcher|ToolBatchPlanner|setTimeout\(|retryBackoff|new FireflyToolRegistry/);
  assert.doesNotMatch(source, /class\s+\w*(Executor|Runner|Loop)\b/);
});

test("X. Architecture guard keeps the canonical execution owner unique", () => {
  const guard = spawnSync(
    process.execPath,
    [path.join(projectRoot, "tools", "verify", "verify-architecture.mjs")],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.equal(guard.status, 0, guard.stderr || guard.stdout);
});

test("Y. The production composition root wires the bridge only through the Harness authorization adapter", () => {
  const indexSource = fs.readFileSync(path.join(projectRoot, "src/main/index.ts"), "utf8");
  const adapterSource = fs.readFileSync(
    path.join(projectRoot, "src/main/orchestrator/harness/harness-authorization-adapter.ts"),
    "utf8",
  );
  assert.match(indexSource, /new AuthorizedInvocationBridge\(/);
  assert.match(indexSource, /new HarnessAuthorizationAdapter\(/);
  assert.match(adapterSource, /CapabilityAuthorizationPipeline/);
  assert.match(adapterSource, /AuthorizedInvocationBridge/);

  for (const file of [
    "src/main/orchestrator/firefly-agent-core.ts",
    "src/main/orchestrator/harness/firefly-harness.ts",
  ]) {
    const source = fs.readFileSync(path.join(projectRoot, file), "utf8");
    assert.equal(source.includes("AuthorizedInvocationBridge"), false, `${file} must not directly use the bridge`);
  }
});

test("Z. ONCE approval cannot be reused through the same bridge", async () => {
  const fixture = createFixture();
  const invocation = createInvocation({
    approvalRequirement: "required",
    approvalRequestId: createApprovalRequestId("execution-seam-once-1"),
  });
  const first = await fixture.bridge.execute(invocation, createContext());
  const second = await fixture.bridge.execute(invocation, createContext({ step: 2 }));

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.error.code, "DUPLICATE_AUTHORIZED_INVOCATION");
  assert.equal(fixture.executionCount, 1);
});

test("AA. Serializable correlation remains attached to the execution result", async () => {
  const fixture = createFixture();
  const result = await fixture.bridge.execute(
    createInvocation({ correlation: { runId: "correlated-run", conversationId: "correlated-conversation" } }),
    createContext({ runId: "correlated-run", conversationId: "correlated-conversation" }),
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.correlation, {
    runId: "correlated-run",
    conversationId: "correlated-conversation",
  });
});

test("AB. The bridge does not widen the authorized scope", async () => {
  const fixture = createFixture();
  const narrowed = { kind: "filesystem", path: "C:\\workspace\\nested", access: "read" };
  const result = await fixture.bridge.execute(
    createInvocation({
      approvalRequirement: "required",
      approvalRequestId: createApprovalRequestId("execution-seam-scope-1"),
      authorizedScope: narrowed,
    }),
    createContext(),
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.effectiveScope, scope);
  assert.deepEqual(result.authorizedScope, narrowed);
});

test("AC. Legacy production Agent paths remain direct outside the one Harness adapter", () => {
  for (const file of [
    "src/main/orchestrator/firefly-agent-core.ts",
    "src/main/orchestrator/harness/firefly-harness.ts",
  ]) {
    const source = fs.readFileSync(path.join(projectRoot, file), "utf8");
    assert.doesNotMatch(source, /authorized-invocation-bridge|AuthorizedCapabilityInvocation/);
  }
  const toolRoundSource = fs.readFileSync(
    path.join(projectRoot, "src/main/orchestrator/harness/tool-round.ts"),
    "utf8",
  );
  assert.match(toolRoundSource, /executionEngine\.executeToolCall/);
  assert.match(toolRoundSource, /authorizationAdapter\?\.handles/);
});
