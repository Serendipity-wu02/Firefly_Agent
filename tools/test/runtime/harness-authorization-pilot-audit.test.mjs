import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { executeToolRound } from "../../../dist/main/main/orchestrator/harness/tool-round.js";
import { HarnessAuthorizationAdapter } from "../../../dist/main/main/orchestrator/harness/harness-authorization-adapter.js";
import { AuthorizedInvocationBridge } from "../../../dist/main/main/runtime/authorization/authorized-invocation-bridge.js";
import { CapabilityAuthorizationPipeline } from "../../../dist/main/main/runtime/authorization/capability-authorization-pipeline.js";
import { PermissionProfilePolicyResolver } from "../../../dist/main/main/runtime/authorization/permission-profile-policy-resolver.js";
import { ApprovalService } from "../../../dist/main/main/runtime/approval/approval-service.js";
import { createApprovalRequirementResolver } from "../../../dist/main/main/runtime/approval/approval-requirement-resolver.js";
import { CapabilityBindingResolver } from "../../../dist/main/main/runtime/capabilities/capability-binding-resolver.js";
import { CapabilityRegistry } from "../../../dist/main/main/runtime/capabilities/capability-registry.js";
import { ToolExecutionEngine } from "../../../dist/main/main/runtime/execution/tool-execution-engine.js";
import { ToolPolicyEvaluator } from "../../../dist/main/main/runtime/execution/tool-policy.js";
import { SandboxPolicyEvaluator } from "../../../dist/main/main/runtime/sandbox/sandbox-policy.js";
import { createMusicTools } from "../../../dist/main/main/tools/music-tools.js";
import { FireflyToolRegistry } from "../../../dist/main/main/tools/tool-registry.js";
import {
  createCapabilityCategory,
  createCapabilityId,
  createCapabilityRequestId,
} from "../../../dist/main/shared/capability-types.js";
import { createSandboxProfileId } from "../../../dist/main/shared/sandbox-types.js";

const projectRoot = process.cwd();
const pilotToolId = "music_status";
const legacyToolId = "legacy_lookup";
const capabilityId = createCapabilityId("music.status.read");
const capabilityCategory = createCapabilityCategory("music");
const sandboxProfileId = createSandboxProfileId("firefly-music-status-read-v1");
const scope = { kind: "desktop", target: "QQMusic" };
const requester = { type: "main-agent", id: "firefly-harness" };

function pendingRecord(approvalService) {
  const existing = approvalService.listPending()[0];
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const unsubscribe = approvalService.onChanged((record) => {
      if (record.state === "pending") {
        unsubscribe();
        resolve(record);
      }
    });
  });
}

function parseOutput(result) {
  return JSON.parse(result.output);
}

function createFixture(options = {}) {
  let profile = options.profile ?? "RESTRICTED_SCOPE";
  let clock = options.clock ?? 1_000;
  const state = {
    pilotExecutions: 0,
    legacyExecutions: 0,
    engineCalls: 0,
    toolStarted: 0,
  };
  const registry = new FireflyToolRegistry();
  registry.register({
    id: pilotToolId,
    name: pilotToolId,
    description: "Reads the current music status.",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    execute: options.pilotExecute ?? (async () => {
      state.pilotExecutions++;
      return JSON.stringify({ ok: true, source: "music-status" });
    }),
  });
  registry.register({
    id: legacyToolId,
    name: legacyToolId,
    description: "Legacy read-only fixture.",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    execute: async () => {
      state.legacyExecutions++;
      return JSON.stringify({ ok: true, source: "legacy" });
    },
  });

  const approvalService = new ApprovalService({ now: () => clock });
  const capabilityRegistry = new CapabilityRegistry();
  capabilityRegistry.register({
    id: capabilityId,
    name: "Read music playback status",
    description: "Reads a status snapshot without player controls.",
    version: "1.1.1",
    category: capabilityCategory,
  });
  const bindingResolver = new CapabilityBindingResolver(capabilityRegistry, registry);
  bindingResolver.register({ capabilityId, toolId: pilotToolId });
  const sandboxPolicy = new SandboxPolicyEvaluator([
    {
      id: sandboxProfileId,
      version: "1.1.1",
      rules: [{ kind: "desktop", allowedTargets: [scope.target] }],
    },
  ]);
  const approvalRequirementResolver = createApprovalRequirementResolver(
    [{ capabilityId, requirement: "none" }],
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
  const engine = new ToolExecutionEngine(registry, options.toolPolicy ?? {});
  const originalExecuteToolCall = engine.executeToolCall.bind(engine);
  engine.executeToolCall = async (call, context) => {
    state.engineCalls++;
    return originalExecuteToolCall(call, context);
  };
  const bridge = new AuthorizedInvocationBridge(engine, registry);
  const adapter = new HarnessAuthorizationAdapter({
    pipeline,
    bridge,
    approvalService,
    getPermissionProfile: () => profile,
    now: () => clock,
    routes: [{
      toolId: pilotToolId,
      capabilityId,
      sandboxProfileId,
      requestedScope: scope,
      approvalSummary: "Read music status",
      approvalReason: "The active permission profile requires approval.",
      approvalTtlMs: options.approvalTtlMs ?? 1_000,
    }],
  });

  return {
    adapter,
    approvalService,
    bridge,
    capabilityRegistry,
    engine,
    pipeline,
    registry,
    state,
    setClock(value) {
      clock = value;
    },
    setProfile(value) {
      profile = value;
    },
    getProfile() {
      return profile;
    },
  };
}

function call(id, name = pilotToolId) {
  return { id, name, arguments: {} };
}

function context(toolCallId, overrides = {}) {
  return {
    runId: "audit-run",
    step: 1,
    toolCallId,
    userQuery: "Read music status",
    toolCallsCount: 1,
    maxToolCallsPerRun: 25,
    ...overrides,
  };
}

function authorizePending(fixture, requestId, runId, toolCallId) {
  return fixture.pipeline.authorize({
    request: {
      requestId: createCapabilityRequestId(requestId),
      capabilityId,
      requester,
      input: {},
    },
    sandbox: { profileId: sandboxProfileId, requestedScope: scope },
    permissionProfile: fixture.getProfile(),
    runtimeContext: { runId, toolCallId },
    approval: {
      summary: "Read music status",
      reason: "Audit approval request.",
      expiresAt: 2_000,
    },
  });
}

test("A-B, G. Approval resolve is exactly once and stale correlation cannot resume another invocation", async () => {
  const fixture = createFixture({ profile: "ASK_EVERY_TIME" });
  const pending = pendingRecord(fixture.approvalService);
  const execution = fixture.adapter.execute(call("exact-once-call"), context("exact-once-call"));
  const request = await pending;
  fixture.approvalService.approve(request.request.approvalRequestId);
  assert.throws(
    () => fixture.approvalService.approve(request.request.approvalRequestId),
    (error) => error.code === "APPROVAL_ALREADY_RESOLVED",
  );
  const result = await execution;
  assert.equal(parseOutput(result).ok, true);
  assert.equal(fixture.state.engineCalls, 1);
  assert.equal(fixture.state.pilotExecutions, 1);

  const secondResume = fixture.pipeline.resumeAfterApproval(request.request.approvalRequestId);
  assert.equal(secondResume.status, "DENIED");

  const staleFixture = createFixture({ profile: "ASK_EVERY_TIME" });
  const old = authorizePending(staleFixture, "old-capability-request", "old-run", "old-call");
  assert.equal(old.status, "PENDING_APPROVAL");
  if (old.status !== "PENDING_APPROVAL") return;
  staleFixture.approvalService.approve(old.approvalRequest.approvalRequestId);
  const stale = staleFixture.pipeline.resumeAfterApproval(old.approvalRequest.approvalRequestId, {
    capabilityRequestId: createCapabilityRequestId("new-capability-request"),
    capabilityId,
    correlation: { runId: "new-run", toolCallId: "new-call" },
  });
  assert.equal(stale.status, "DENIED");
  if (stale.status === "DENIED") assert.equal(stale.reason.code, "APPROVAL_CORRELATION_MISMATCH");
  const original = staleFixture.pipeline.resumeAfterApproval(old.approvalRequest.approvalRequestId, {
    capabilityRequestId: createCapabilityRequestId("old-capability-request"),
    capabilityId,
    correlation: { runId: "old-run", toolCallId: "old-call" },
  });
  assert.equal(original.status, "AUTHORIZED");
});

test("C-E. Cancellation boundaries settle once without false success or duplicate execution", async () => {
  const beforePending = createFixture();
  const beforeController = new AbortController();
  beforeController.abort();
  const beforeResult = await beforePending.adapter.execute(
    call("cancel-before-pending"),
    context("cancel-before-pending", { signal: beforeController.signal }),
  );
  assert.equal(parseOutput(beforeResult).error, "CANCELLED");
  assert.equal(beforePending.approvalService.listPending().length, 0);
  assert.equal(beforePending.state.engineCalls, 0);

  const duringApproval = createFixture({ profile: "ASK_EVERY_TIME" });
  const duringController = new AbortController();
  const duringPending = pendingRecord(duringApproval.approvalService);
  const duringResultPromise = duringApproval.adapter.execute(
    call("cancel-during-approval"),
    context("cancel-during-approval", { signal: duringController.signal }),
  );
  const duringRequest = await duringPending;
  duringController.abort();
  const duringResult = await duringResultPromise;
  assert.equal(parseOutput(duringResult).error, "APPROVAL_CANCELLED");
  assert.equal(duringApproval.approvalService.get(duringRequest.request.approvalRequestId).state, "cancelled");
  assert.equal(duringApproval.state.pilotExecutions, 0);

  const approveCancel = createFixture({ profile: "ASK_EVERY_TIME" });
  const approveCancelController = new AbortController();
  const approveCancelPending = pendingRecord(approveCancel.approvalService);
  const approveCancelResultPromise = approveCancel.adapter.execute(
    call("approve-cancel-race"),
    context("approve-cancel-race", { signal: approveCancelController.signal }),
    { onApprovalResolved: () => approveCancelController.abort() },
  );
  const approveCancelRequest = await approveCancelPending;
  approveCancel.approvalService.approve(approveCancelRequest.request.approvalRequestId);
  const approveCancelResult = await approveCancelResultPromise;
  assert.equal(parseOutput(approveCancelResult).error, "CANCELLED");
  assert.equal(approveCancel.state.pilotExecutions, 0);
  assert.equal(approveCancel.state.engineCalls, 0);

  let releaseTool;
  let toolStartedResolve;
  const toolStarted = new Promise((resolve) => {
    toolStartedResolve = resolve;
  });
  const toolGate = new Promise((resolve) => {
    releaseTool = resolve;
  });
  const running = createFixture({
    pilotExecute: async (_args, toolContext) => {
      running.state.toolStarted++;
      toolStartedResolve();
      await toolGate;
      return JSON.stringify({ ok: true, signalAborted: toolContext.signal?.aborted === true });
    },
  });
  const runningController = new AbortController();
  const runningResultPromise = running.adapter.execute(
    call("cancel-running-tool"),
    context("cancel-running-tool", { signal: runningController.signal }),
  );
  await toolStarted;
  runningController.abort();
  releaseTool();
  const runningResult = await runningResultPromise;
  assert.equal(parseOutput(runningResult).error, "CANCELLED");
  assert.equal(running.state.toolStarted, 1);
  assert.equal(running.state.pilotExecutions, 0);

  const expires = createFixture({ profile: "ASK_EVERY_TIME", approvalTtlMs: 100 });
  const expiresController = new AbortController();
  const expiresPending = pendingRecord(expires.approvalService);
  const expiresResultPromise = expires.adapter.execute(
    call("expire-cancel-race"),
    context("expire-cancel-race", { signal: expiresController.signal }),
  );
  const expiresRequest = await expiresPending;
  expires.setClock(1_100);
  expires.approvalService.expireExpired(1_100);
  expiresController.abort();
  const expiresResult = await expiresResultPromise;
  assert.equal(parseOutput(expiresResult).error, "APPROVAL_EXPIRED");
  assert.equal(expires.approvalService.get(expiresRequest.request.approvalRequestId).state, "expired");
  assert.equal(expires.state.pilotExecutions, 0);
});

test("F, H, O. Pending approval is stable across profile changes and has no renderer auto-approval path", async () => {
  const fixture = createFixture({ profile: "ASK_EVERY_TIME" });
  const pending = pendingRecord(fixture.approvalService);
  const execution = fixture.adapter.execute(call("profile-stability"), context("profile-stability"));
  const request = await pending;
  fixture.setProfile("FULL_ACCESS");
  assert.equal(fixture.approvalService.get(request.request.approvalRequestId).state, "pending");
  assert.equal(fixture.state.engineCalls, 0);
  fixture.approvalService.approve(request.request.approvalRequestId);
  assert.equal(parseOutput(await execution).ok, true);
  assert.equal(fixture.state.engineCalls, 1);

  const presentationAbsent = createFixture({ profile: "ASK_EVERY_TIME" });
  const presentationPending = pendingRecord(presentationAbsent.approvalService);
  const presentationExecution = presentationAbsent.adapter.execute(
    call("presentation-absent"),
    context("presentation-absent"),
  );
  const presentationRequest = await presentationPending;
  assert.equal(presentationAbsent.state.engineCalls, 0);
  presentationAbsent.approvalService.deny(presentationRequest.request.approvalRequestId);
  assert.equal(parseOutput(await presentationExecution).error, "APPROVAL_DENIED");
  assert.equal(presentationAbsent.state.engineCalls, 0);
});

test("I-K. Same-round deferral is explicit, ordered, and visible to the model", async () => {
  const fixture = createFixture({ profile: "ASK_EVERY_TIME" });
  const pending = pendingRecord(fixture.approvalService);
  const roundPromise = executeToolRound(
    [call("barrier-pilot"), call("barrier-legacy", legacyToolId)],
    {
      executionEngine: fixture.engine,
      authorizationAdapter: fixture.adapter,
      runId: "barrier-run",
      step: 1,
      userQuery: "Read status and lookup details",
      toolCallsCount: 0,
      maxToolCallsPerRun: 25,
    },
  );
  const request = await pending;
  assert.equal(fixture.state.legacyExecutions, 0);
  fixture.approvalService.approve(request.request.approvalRequestId);
  const observations = await roundPromise;
  assert.deepEqual(observations.map((entry) => entry.call.id), ["barrier-pilot", "barrier-legacy"]);
  assert.equal(observations[1].outcome, "not_executed");
  assert.equal(parseOutput(observations[1].result).outcome, "not_executed");
  assert.equal(parseOutput(observations[1].result).error, "deferred_after_approval");
  assert.equal(fixture.state.legacyExecutions, 0);
});

test("L-M, P. Approval denial, cancellation, expiration, and ToolPolicy remain distinct", async () => {
  for (const [terminal, expectedError] of [
    ["denied", "APPROVAL_DENIED"],
    ["cancelled", "APPROVAL_CANCELLED"],
    ["expired", "APPROVAL_EXPIRED"],
  ]) {
    const fixture = createFixture({ profile: "ASK_EVERY_TIME", approvalTtlMs: 100 });
    const pending = pendingRecord(fixture.approvalService);
    const execution = fixture.adapter.execute(call(`terminal-${terminal}`), context(`terminal-${terminal}`));
    const request = await pending;
    if (terminal === "denied") fixture.approvalService.deny(request.request.approvalRequestId);
    if (terminal === "cancelled") fixture.approvalService.cancel(request.request.approvalRequestId);
    if (terminal === "expired") {
      fixture.setClock(1_100);
      fixture.approvalService.expireExpired(1_100);
    }
    assert.equal(parseOutput(await execution).error, expectedError);
    assert.equal(fixture.state.engineCalls, 0);
  }

  let policyExecutions = 0;
  const policyRegistry = new FireflyToolRegistry();
  policyRegistry.register({
    id: "policy_tool",
    name: "Policy tool",
    description: "Tool policy seam fixture.",
    enabled: true,
    safetyLevel: "confirm_required",
    inputSchema: { type: "object", properties: {} },
    execute: async () => {
      policyExecutions++;
      return JSON.stringify({ ok: true });
    },
  });
  const policyEngine = new ToolExecutionEngine(policyRegistry);
  const upstream = {
    capabilityId: "policy.read",
    requestId: "policy-request",
    requester,
    toolId: "policy_tool",
    authorizedScope: scope,
    approvalRequirement: "none",
    authorization: { type: "sandbox-only" },
  };
  const approved = await policyEngine.executeToolCall(
    call("policy-call", "policy_tool"),
    context("policy-call", { upstreamAuthorization: upstream }),
  );
  assert.equal(parseOutput(approved).ok, true);
  assert.equal(policyExecutions, 1);

  const deniedByPolicy = new ToolExecutionEngine(policyRegistry, { deniedTools: ["policy_tool"] });
  const denied = await deniedByPolicy.executeToolCall(
    call("policy-denied", "policy_tool"),
    context("policy-denied", { upstreamAuthorization: upstream }),
  );
  assert.equal(parseOutput(denied).error, "policy_denied");
  assert.equal(
    ToolPolicyEvaluator.evaluate(policyRegistry.get("policy_tool"), "policy_tool").action,
    "require_confirmation",
  );
});

test("Q-R. music_status reads a snapshot only and ownership remains canonical", async () => {
  let snapshotReads = 0;
  const musicService = {
    getSnapshot() {
      snapshotReads++;
      return {
        backendState: "ready",
        playerState: "available",
        accountState: "logged_in",
        playbackState: { loaded: false, paused: true, volume: 50 },
        currentTrack: undefined,
        queueLength: 0,
      };
    },
  };
  const statusTool = createMusicTools(musicService).find((tool) => tool.id === pilotToolId);
  const result = JSON.parse(await statusTool.execute({}));
  assert.equal(result.ok, true);
  assert.equal(snapshotReads, 1);

  const musicToolsSource = fs.readFileSync(
    path.join(projectRoot, "src", "main", "tools", "music-tools.ts"),
    "utf8",
  );
  const statusSource = musicToolsSource.slice(
    musicToolsSource.indexOf("const statusTool"),
    musicToolsSource.indexOf("return [searchTool"),
  );
  assert.doesNotMatch(statusSource, /musicService\.(play|pause|resume|next|prev|stop|setVolume)\s*\(/);

  const adapterSource = fs.readFileSync(
    path.join(projectRoot, "src", "main", "orchestrator", "harness", "harness-authorization-adapter.ts"),
    "utf8",
  );
  const subagentRoot = path.join(projectRoot, "src", "main", "runtime", "subagents");
  const subagentSources = fs.readdirSync(subagentRoot)
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => fs.readFileSync(path.join(subagentRoot, entry), "utf8"));
  assert.doesNotMatch(adapterSource, /READ_ONLY|RESTRICTED_SCOPE|ASK_EVERY_TIME|FULL_ACCESS/);
  assert.equal(subagentSources.some((source) => source.includes("HarnessAuthorizationAdapter")), false);
});

test("S. The Bridge rejects a stale invocation in a new run and prevents a second request submission", async () => {
  const fixture = createFixture();
  const authorized = fixture.pipeline.authorize({
    request: {
      requestId: createCapabilityRequestId("bridge-old-request"),
      capabilityId,
      requester,
      input: {},
    },
    sandbox: { profileId: sandboxProfileId, requestedScope: scope },
    permissionProfile: "RESTRICTED_SCOPE",
    runtimeContext: { runId: "bridge-old-run", toolCallId: "bridge-old-call" },
  });
  assert.equal(authorized.status, "AUTHORIZED");
  if (authorized.status !== "AUTHORIZED") return;
  const stale = await fixture.bridge.execute(
    authorized.invocation,
    context("bridge-new-call", { runId: "bridge-new-run" }),
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, "AUTHORIZATION_CORRELATION_MISMATCH");
  assert.equal(fixture.state.engineCalls, 0);

  const first = await fixture.bridge.execute(
    authorized.invocation,
    context("bridge-old-call", { runId: "bridge-old-run" }),
  );
  const second = await fixture.bridge.execute(
    authorized.invocation,
    context("bridge-old-call", { runId: "bridge-old-run", step: 2 }),
  );
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.error.code, "DUPLICATE_AUTHORIZED_INVOCATION");
  assert.equal(fixture.state.pilotExecutions, 1);
});
