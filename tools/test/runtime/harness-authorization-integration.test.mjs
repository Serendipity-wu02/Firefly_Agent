import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { FireflyHarness } from "../../../dist/main/main/orchestrator/harness/firefly-harness.js";
import { HarnessAuthorizationAdapter } from "../../../dist/main/main/orchestrator/harness/harness-authorization-adapter.js";
import { AgentEventBus } from "../../../dist/main/main/orchestrator/agent-events.js";
import { CheckpointManager } from "../../../dist/main/main/orchestrator/recovery/checkpoint-manager.js";
import { InMemoryCheckpointStore } from "../../../dist/main/main/orchestrator/recovery/checkpoint-store.js";
import { ToolExecutionEngine } from "../../../dist/main/main/runtime/execution/tool-execution-engine.js";
import { ApprovalService } from "../../../dist/main/main/runtime/approval/approval-service.js";
import { createApprovalRequirementResolver } from "../../../dist/main/main/runtime/approval/approval-requirement-resolver.js";
import { CapabilityAuthorizationPipeline } from "../../../dist/main/main/runtime/authorization/capability-authorization-pipeline.js";
import { AuthorizedInvocationBridge } from "../../../dist/main/main/runtime/authorization/authorized-invocation-bridge.js";
import { PermissionProfilePolicyResolver } from "../../../dist/main/main/runtime/authorization/permission-profile-policy-resolver.js";
import { CapabilityBindingResolver } from "../../../dist/main/main/runtime/capabilities/capability-binding-resolver.js";
import { CapabilityRegistry } from "../../../dist/main/main/runtime/capabilities/capability-registry.js";
import { SandboxPolicyEvaluator } from "../../../dist/main/main/runtime/sandbox/sandbox-policy.js";
import { FireflyToolRegistry } from "../../../dist/main/main/tools/tool-registry.js";
import {
  createCapabilityCategory,
  createCapabilityId,
} from "../../../dist/main/shared/capability-types.js";
import { createSandboxProfileId } from "../../../dist/main/shared/sandbox-types.js";

const projectRoot = process.cwd();
const pilotToolId = "music_status";
const legacyToolId = "legacy_lookup";
const pilotCapabilityId = createCapabilityId("music.status.read");
const pilotCapabilityCategory = createCapabilityCategory("music");
const pilotSandboxProfileId = createSandboxProfileId("firefly-music-status-read-v1");
const pilotScope = { kind: "desktop", target: "QQMusic" };

function createProvider(onGenerate) {
  return {
    id: "harness-authorization-test-provider",
    name: "Harness Authorization Test Provider",
    capabilities: { supportsNativeToolCalling: true, supportsStreaming: false },
    generateCompletion: onGenerate,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForValue(read, timeoutMs = 1000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await read();
    if (value !== undefined && value !== null && value !== false) return value;
    await delay(2);
  }
  throw new Error("Timed out waiting for the expected authorization state.");
}

async function waitForPending(approvalService, timeoutMs = 1000) {
  return waitForValue(() => approvalService.listPending()[0], timeoutMs);
}

function parseOutput(result) {
  return JSON.parse(result.output);
}

function createFixture(options = {}) {
  let profile = options.profile ?? "RESTRICTED_SCOPE";
  const state = {
    pilotExecutions: 0,
    legacyExecutions: 0,
    engineCalls: 0,
    engineContexts: [],
  };
  const registry = new FireflyToolRegistry();
  registry.register({
    id: pilotToolId,
    name: pilotToolId,
    description: "Reads the current music status.",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    execute: async () => {
      state.pilotExecutions++;
      return options.pilotOutput ?? JSON.stringify({ ok: true, source: "music-status" });
    },
  });
  registry.register({
    id: legacyToolId,
    name: legacyToolId,
    description: "Legacy tool used to confirm route separation.",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    execute: async () => {
      state.legacyExecutions++;
      return JSON.stringify({ ok: true, source: "legacy" });
    },
  });

  const eventBus = new AgentEventBus();
  const engine = new ToolExecutionEngine(registry, options.toolPolicy ?? {}, eventBus);
  const executeToolCall = engine.executeToolCall.bind(engine);
  engine.executeToolCall = async (call, context) => {
    state.engineCalls++;
    state.engineContexts.push({ call, context });
    return executeToolCall(call, context);
  };

  const now = options.now ?? (() => Date.now());
  const approvalService = new ApprovalService({ now });
  const capabilityRegistry = new CapabilityRegistry();
  const registerCapability = options.registerCapability !== false;
  const registerBinding = options.registerBinding !== false;
  if (registerCapability) {
    capabilityRegistry.register({
      id: pilotCapabilityId,
      name: "Read music playback status",
      description: "Reads a status snapshot without issuing player controls.",
      version: "1.1.1",
      category: pilotCapabilityCategory,
    });
  }
  const bindingResolver = new CapabilityBindingResolver(capabilityRegistry, registry);
  if (registerCapability && registerBinding) {
    bindingResolver.register({ capabilityId: pilotCapabilityId, toolId: pilotToolId });
  }
  const sandboxPolicy = new SandboxPolicyEvaluator([
    {
      id: pilotSandboxProfileId,
      version: "1.1.1",
      rules: [{
        kind: "desktop",
        allowedTargets: [options.sandboxAllowed === false ? "OtherPlayer" : pilotScope.target],
      }],
    },
  ]);
  const approvalRequirementResolver = createApprovalRequirementResolver(
    registerCapability ? [{ capabilityId: pilotCapabilityId, requirement: "none" }] : [],
    {
      permissionPolicyResolver: new PermissionProfilePolicyResolver(),
      permissionProfile: () => profile,
    },
  );
  const pipeline = new CapabilityAuthorizationPipeline({
    capabilityRegistry,
    bindingResolver,
    sandboxPolicy,
    approvalRequirementResolver,
    approvalService,
  });
  const bridge = new AuthorizedInvocationBridge(engine, registry);
  const adapter = new HarnessAuthorizationAdapter({
    pipeline,
    bridge,
    approvalService,
    getPermissionProfile: () => profile,
    now,
    routes: [{
      toolId: pilotToolId,
      capabilityId: pilotCapabilityId,
      sandboxProfileId: pilotSandboxProfileId,
      requestedScope: pilotScope,
      approvalSummary: "Read music playback status",
      approvalReason: "The active permission profile requires approval.",
      approvalTtlMs: options.approvalTtlMs ?? 1000,
    }],
  });

  return {
    adapter,
    approvalService,
    bridge,
    engine,
    eventBus,
    pipeline,
    registry,
    setProfile: (value) => {
      profile = value;
    },
    state,
  };
}

function createHarness(fixture, provider, options = {}) {
  return new FireflyHarness({
    provider,
    toolRegistry: fixture.registry,
    eventBus: fixture.eventBus,
    executionEngine: fixture.engine,
    authorizationAdapter: fixture.adapter,
    ...options,
  });
}

function createToolContext(overrides = {}) {
  return {
    runId: "adapter-direct-run",
    step: 1,
    userQuery: "Read music status",
    toolCallsCount: 1,
    maxToolCallsPerRun: 25,
    ...overrides,
  };
}

function toolCall(id = "pilot-call") {
  return { id, name: pilotToolId, arguments: {} };
}

test("A-J. The music_status pilot follows Capability, Sandbox, Bridge, Engine, and canonical Harness writeback", async () => {
  const fixture = createFixture();
  let providerCalls = 0;
  const provider = createProvider(async (request) => {
    providerCalls++;
    if (providerCalls === 1) {
      return {
        message: {
          role: "assistant",
          content: "正在读取播放器状态。",
          toolCalls: [toolCall("pilot-success")],
        },
      };
    }

    const assistantToolMessage = request.messages.find(
      (message) => message.role === "assistant" && message.toolCalls?.[0]?.id === "pilot-success",
    );
    const toolMessage = request.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "pilot-success",
    );
    assert.ok(assistantToolMessage);
    assert.ok(toolMessage);
    assert.deepEqual(JSON.parse(toolMessage.content), { ok: true, source: "music-status" });
    return { message: { role: "assistant", content: "播放器状态已经读取。" } };
  });

  const result = await createHarness(fixture, provider).run({
    runId: "pilot-success-run",
    userPrompt: "读取音乐状态",
    planMode: false,
  });

  assert.equal(result.status, "completed");
  assert.equal(result.toolCallsCount, 1);
  assert.equal(fixture.state.pilotExecutions, 1);
  assert.equal(fixture.state.engineCalls, 1);
  assert.equal(fixture.state.engineContexts[0].context.upstreamAuthorization.capabilityId, pilotCapabilityId);
  assert.equal(fixture.state.engineContexts[0].context.upstreamAuthorization.toolId, pilotToolId);
  assert.equal(fixture.state.engineContexts[0].context.upstreamAuthorization.authorization.type, "sandbox-only");
  assert.equal(fixture.state.legacyExecutions, 0);
  assert.equal(result.transcript.filter((message) => message.role === "tool").length, 1);
  assert.equal(providerCalls, 2);
});

test("K-M, R-T. ASK_EVERY_TIME waits in the Harness, resumes one logical call, and avoids a second ToolPolicy confirmation", async () => {
  const fixture = createFixture({
    profile: "ASK_EVERY_TIME",
    toolPolicy: { requireConfirmationTools: [pilotToolId] },
  });
  const terminalRecords = [];
  fixture.approvalService.onChanged((record) => {
    if (record.state !== "pending") terminalRecords.push(record);
  });
  const checkpointManager = new CheckpointManager({ store: new InMemoryCheckpointStore() });
  let providerCalls = 0;
  const provider = createProvider(async (request) => {
    providerCalls++;
    if (providerCalls === 1) {
      return {
        message: {
          role: "assistant",
          content: "需要确认后读取状态。",
          toolCalls: [toolCall("approval-resume")],
        },
      };
    }
    const toolMessage = request.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "approval-resume",
    );
    assert.ok(toolMessage);
    assert.equal(JSON.parse(toolMessage.content).ok, true);
    assert.equal(toolMessage.content.includes("confirmation_required"), false);
    return { message: { role: "assistant", content: "确认后的状态已读取。" } };
  });

  const runPromise = createHarness(fixture, provider, { checkpointManager }).run({
    runId: "approval-resume-run",
    userPrompt: "读取音乐状态",
    planMode: false,
  });
  const pending = await waitForPending(fixture.approvalService);
  const waitingCheckpoint = await waitForValue(async () => {
    const checkpoint = await checkpointManager.getLatestForRun("approval-resume-run");
    return checkpoint?.stepState === "waiting_permission" ? checkpoint : undefined;
  });

  assert.equal(waitingCheckpoint.trigger, "waiting_permission");
  assert.equal(fixture.state.pilotExecutions, 0);
  assert.equal(fixture.state.engineCalls, 0);
  assert.equal(fixture.approvalService.listPending().length, 1);

  fixture.approvalService.approve(pending.request.approvalRequestId);
  const result = await runPromise;

  assert.equal(result.status, "completed");
  assert.equal(fixture.state.pilotExecutions, 1);
  assert.equal(fixture.state.engineCalls, 1);
  assert.equal(fixture.state.engineContexts[0].context.upstreamAuthorization.approvalRequirement, "required");
  assert.equal(fixture.state.engineContexts[0].context.upstreamAuthorization.authorization.type, "approval-grant");
  assert.equal(fixture.approvalService.listPending().length, 0);
  assert.equal(terminalRecords.length, 1);
  assert.equal(terminalRecords[0].state, "approved");
});

test("N-Q. Denial, explicit cancellation, expiration, and run cancellation remain distinct terminal outcomes", async () => {
  const denied = createFixture({ profile: "ASK_EVERY_TIME" });
  const deniedProvider = createProvider(async (request) => {
    if (!request.messages.some((message) => message.role === "tool")) {
      return { message: { role: "assistant", content: "", toolCalls: [toolCall("approval-deny")] } };
    }
    const toolMessage = request.messages.find((message) => message.toolCallId === "approval-deny");
    assert.equal(JSON.parse(toolMessage.content).error, "APPROVAL_DENIED");
    return { message: { role: "assistant", content: "好的，我会换一种方式。" } };
  });
  const deniedRun = createHarness(denied, deniedProvider).run({
    runId: "approval-deny-run",
    userPrompt: "读取音乐状态",
    planMode: false,
  });
  const deniedRequest = await waitForPending(denied.approvalService);
  denied.approvalService.deny(deniedRequest.request.approvalRequestId);
  const deniedResult = await deniedRun;
  assert.equal(deniedResult.status, "completed");
  assert.equal(denied.state.pilotExecutions, 0);
  assert.equal(denied.approvalService.listPending().length, 0);

  const cancelled = createFixture({ profile: "ASK_EVERY_TIME" });
  const cancelledProvider = createProvider(async (request) => {
    if (!request.messages.some((message) => message.role === "tool")) {
      return { message: { role: "assistant", content: "", toolCalls: [toolCall("approval-cancel")] } };
    }
    const toolMessage = request.messages.find((message) => message.toolCallId === "approval-cancel");
    assert.equal(JSON.parse(toolMessage.content).error, "APPROVAL_CANCELLED");
    return { message: { role: "assistant", content: "请求已经取消。" } };
  });
  const cancelledRun = createHarness(cancelled, cancelledProvider).run({
    runId: "approval-cancel-run",
    userPrompt: "读取音乐状态",
    planMode: false,
  });
  const cancelledRequest = await waitForPending(cancelled.approvalService);
  cancelled.approvalService.cancel(cancelledRequest.request.approvalRequestId);
  const cancelledResult = await cancelledRun;
  assert.equal(cancelledResult.status, "completed");
  assert.equal(cancelled.state.pilotExecutions, 0);
  assert.equal(cancelled.approvalService.listPending().length, 0);

  const expired = createFixture({ profile: "ASK_EVERY_TIME", approvalTtlMs: 20 });
  const expiredProvider = createProvider(async (request) => {
    if (!request.messages.some((message) => message.role === "tool")) {
      return { message: { role: "assistant", content: "", toolCalls: [toolCall("approval-expire")] } };
    }
    const toolMessage = request.messages.find((message) => message.toolCallId === "approval-expire");
    assert.equal(JSON.parse(toolMessage.content).error, "APPROVAL_EXPIRED");
    return { message: { role: "assistant", content: "确认已经过期。" } };
  });
  const expiredRun = createHarness(expired, expiredProvider, { config: { totalTimeoutMs: 1000 } }).run({
    runId: "approval-expire-run",
    userPrompt: "读取音乐状态",
    planMode: false,
  });
  await waitForPending(expired.approvalService);
  const expiredResult = await expiredRun;
  assert.equal(expiredResult.status, "completed");
  assert.equal(expired.state.pilotExecutions, 0);
  assert.equal(expired.approvalService.listPending().length, 0);

  const abortController = new AbortController();
  const runCancelled = createFixture({ profile: "ASK_EVERY_TIME" });
  const runCancelledProvider = createProvider(async () => ({
    message: { role: "assistant", content: "", toolCalls: [toolCall("run-cancel")] },
  }));
  const runCancelledPromise = createHarness(runCancelled, runCancelledProvider).run({
    runId: "run-cancelled-during-approval",
    userPrompt: "读取音乐状态",
    planMode: false,
    signal: abortController.signal,
  });
  const runCancelledRequest = await waitForPending(runCancelled.approvalService);
  abortController.abort();
  const runCancelledResult = await runCancelledPromise;
  assert.equal(runCancelledResult.status, "cancelled");
  assert.equal(runCancelled.state.pilotExecutions, 0);
  assert.equal(
    runCancelled.approvalService.get(runCancelledRequest.request.approvalRequestId).state,
    "cancelled",
  );
});

test("U-Z. A pending pilot forms a same-round barrier; deferred siblings are written in order and re-planned in the next round", async () => {
  const fixture = createFixture({ profile: "ASK_EVERY_TIME" });
  let providerCalls = 0;
  const provider = createProvider(async (request) => {
    providerCalls++;
    if (providerCalls === 1) {
      return {
        message: {
          role: "assistant",
          content: "先读取状态，再查补充信息。",
          toolCalls: [toolCall("barrier-pilot"), { id: "barrier-legacy", name: legacyToolId, arguments: {} }],
        },
      };
    }
    if (providerCalls === 2) {
      const toolMessages = request.messages.filter((message) => message.role === "tool");
      assert.deepEqual(toolMessages.map((message) => message.toolCallId), ["barrier-pilot", "barrier-legacy"]);
      assert.equal(JSON.parse(toolMessages[0].content).ok, true);
      assert.equal(JSON.parse(toolMessages[1].content).error, "deferred_after_approval");
      assert.equal(JSON.parse(toolMessages[1].content).outcome, "not_executed");
      assert.equal(fixture.state.legacyExecutions, 0);
      return {
        message: {
          role: "assistant",
          content: "重新规划补充查询。",
          toolCalls: [{ id: "legacy-replanned", name: legacyToolId, arguments: {} }],
        },
      };
    }
    const replannedResult = request.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "legacy-replanned",
    );
    assert.ok(replannedResult);
    assert.equal(JSON.parse(replannedResult.content).ok, true);
    return { message: { role: "assistant", content: "两项观察已经完成。" } };
  });

  const runPromise = createHarness(fixture, provider).run({
    runId: "same-round-barrier",
    userPrompt: "读取状态并查询补充信息",
    planMode: false,
  });
  const pending = await waitForPending(fixture.approvalService);
  assert.equal(fixture.state.pilotExecutions, 0);
  assert.equal(fixture.state.legacyExecutions, 0);
  assert.equal(fixture.state.engineCalls, 0);

  fixture.approvalService.approve(pending.request.approvalRequestId);
  const result = await runPromise;

  assert.equal(result.status, "completed");
  assert.equal(result.toolCallsCount, 2);
  assert.equal(fixture.state.pilotExecutions, 1);
  assert.equal(fixture.state.legacyExecutions, 1);
  assert.equal(fixture.state.engineCalls, 2);
  assert.equal(fixture.state.engineContexts[0].context.upstreamAuthorization.toolId, pilotToolId);
  assert.equal(fixture.state.engineContexts[1].context.upstreamAuthorization, undefined);
  assert.equal(providerCalls, 3);
});

test("AA-AE. The current PermissionProfile policy is read at each pilot authorization decision", async () => {
  const fixture = createFixture({ profile: "RESTRICTED_SCOPE" });

  const standard = await fixture.adapter.execute(toolCall("profile-standard"), createToolContext());
  assert.notEqual(standard.isError, true);
  assert.equal(fixture.approvalService.listPending().length, 0);

  fixture.setProfile("FULL_ACCESS");
  const elevated = await fixture.adapter.execute(toolCall("profile-elevated"), createToolContext({ step: 2 }));
  assert.notEqual(elevated.isError, true);
  assert.equal(fixture.approvalService.listPending().length, 0);

  fixture.setProfile("RESTRICTED_SCOPE");
  const restricted = await fixture.adapter.execute(
    toolCall("profile-restricted"),
    createToolContext({ step: 17 }),
  );
  assert.notEqual(restricted.isError, true);
  assert.equal(fixture.approvalService.listPending().length, 0);

  fixture.setProfile("ASK_EVERY_TIME");
  const execution = fixture.adapter.execute(
    toolCall("profile-ask"),
    createToolContext({ step: 18 }),
  );
  const pending = await waitForPending(fixture.approvalService);
  fixture.approvalService.cancel(pending.request.approvalRequestId);
  assert.equal(parseOutput(await execution).error, "APPROVAL_CANCELLED");

  fixture.setProfile("RESTRICTED_SCOPE");
  const beforeLiveChange = await fixture.adapter.execute(
    toolCall("profile-before-live-change"),
    createToolContext({ step: 20 }),
  );
  assert.notEqual(beforeLiveChange.isError, true);
  fixture.setProfile("ASK_EVERY_TIME");
  const afterLiveChange = fixture.adapter.execute(
    toolCall("profile-after-live-change"),
    createToolContext({ step: 21 }),
  );
  const livePending = await waitForPending(fixture.approvalService);
  fixture.approvalService.cancel(livePending.request.approvalRequestId);
  assert.equal(parseOutput(await afterLiveChange).error, "APPROVAL_CANCELLED");
});

test("Failure mapping preserves authorization and execution distinctions without stack output", async () => {
  const missingCapability = createFixture({ registerCapability: false });
  assert.equal(
    parseOutput(await missingCapability.adapter.execute(toolCall("missing-capability"), createToolContext())).error,
    "CAPABILITY_NOT_FOUND",
  );

  const missingBinding = createFixture({ registerBinding: false });
  assert.equal(
    parseOutput(await missingBinding.adapter.execute(toolCall("missing-binding"), createToolContext())).error,
    "BINDING_NOT_FOUND",
  );

  const deniedSandbox = createFixture({ sandboxAllowed: false });
  assert.equal(
    parseOutput(await deniedSandbox.adapter.execute(toolCall("denied-sandbox"), createToolContext())).error,
    "SANDBOX_DENIED",
  );

  const deniedPolicy = createFixture({ toolPolicy: { deniedTools: [pilotToolId] } });
  assert.equal(
    parseOutput(await deniedPolicy.adapter.execute(toolCall("denied-policy"), createToolContext())).error,
    "TOOL_POLICY_FAILURE",
  );
  assert.equal(deniedPolicy.state.pilotExecutions, 0);

  const failedExecution = createFixture({
    pilotOutput: JSON.stringify({ ok: false, error: "status_failed", message: "status unavailable" }),
  });
  assert.equal(
    parseOutput(await failedExecution.adapter.execute(toolCall("failed-execution"), createToolContext())).error,
    "TOOL_EXECUTION_FAILURE",
  );
  assert.equal(failedExecution.state.pilotExecutions, 1);

  const abortedSignal = new AbortController();
  abortedSignal.abort();
  const cancelled = createFixture();
  assert.equal(
    parseOutput(await cancelled.adapter.execute(
      toolCall("bridge-cancelled"),
      createToolContext({ signal: abortedSignal.signal }),
    )).error,
    "CANCELLED",
  );
  assert.equal(cancelled.state.pilotExecutions, 0);
});

test("AF-AN. The adapter keeps execution, state, UI, and architecture ownership canonical", () => {
  const adapterSource = fs.readFileSync(
    path.join(projectRoot, "src", "main", "orchestrator", "harness", "harness-authorization-adapter.ts"),
    "utf8",
  );
  const harnessSource = fs.readFileSync(
    path.join(projectRoot, "src", "main", "orchestrator", "harness", "firefly-harness.ts"),
    "utf8",
  );
  const coreSource = fs.readFileSync(
    path.join(projectRoot, "src", "main", "orchestrator", "firefly-agent-core.ts"),
    "utf8",
  );
  const indexSource = fs.readFileSync(path.join(projectRoot, "src", "main", "index.ts"), "utf8");

  assert.doesNotMatch(adapterSource, /ToolExecutionEngine|FireflyToolRegistry|FireflyToolDispatcher|ToolBatchPlanner|executeToolCall\(/);
  assert.doesNotMatch(adapterSource, /from ["'][^"']*(renderer|tts|live2d|electron)[^"']*["']/i);
  assert.doesNotMatch(adapterSource, /new ApprovalService|new Map|new Set/);
  assert.equal(harnessSource.includes("AuthorizedInvocationBridge"), false);
  assert.equal(coreSource.includes("AuthorizedInvocationBridge"), false);
  assert.equal(coreSource.includes("while ("), false);
  assert.equal(coreSource.includes("executeToolCall"), false);
  assert.equal((indexSource.match(/new ToolExecutionEngine\(/g) ?? []).length, 1);
  assert.equal((indexSource.match(/new AgentEventBus\(/g) ?? []).length, 1);
  assert.equal((indexSource.match(/new FireflyAgentCore\(/g) ?? []).length, 1);
  assert.equal(indexSource.includes("new FireflyHarness("), false);
  assert.ok(indexSource.includes("new AuthorizedInvocationBridge("));
  assert.ok(indexSource.includes("toolId: \"music_status\""));

  const typeGuard = spawnSync(
    process.execPath,
    [path.join(projectRoot, "tools", "verify", "verify-typescript-production.mjs")],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.equal(typeGuard.status, 0, typeGuard.stderr || typeGuard.stdout);
  const architectureGuard = spawnSync(
    process.execPath,
    [path.join(projectRoot, "tools", "verify", "verify-architecture.mjs")],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.equal(architectureGuard.status, 0, architectureGuard.stderr || architectureGuard.stdout);
});
