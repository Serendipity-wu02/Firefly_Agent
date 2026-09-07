import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { HarnessAuthorizationAdapter } from "../../../dist/main/main/orchestrator/harness/harness-authorization-adapter.js";
import { ApprovalService } from "../../../dist/main/main/runtime/approval/approval-service.js";
import { createApprovalRequirementResolver } from "../../../dist/main/main/runtime/approval/approval-requirement-resolver.js";
import { AuthorizedInvocationBridge } from "../../../dist/main/main/runtime/authorization/authorized-invocation-bridge.js";
import { CapabilityAuthorizationPipeline } from "../../../dist/main/main/runtime/authorization/capability-authorization-pipeline.js";
import { PermissionProfilePolicyResolver } from "../../../dist/main/main/runtime/authorization/permission-profile-policy-resolver.js";
import { CapabilityBindingResolver } from "../../../dist/main/main/runtime/capabilities/capability-binding-resolver.js";
import { CapabilityRegistry } from "../../../dist/main/main/runtime/capabilities/capability-registry.js";
import { ToolExecutionEngine } from "../../../dist/main/main/runtime/execution/tool-execution-engine.js";
import { MusicService } from "../../../dist/main/main/runtime/music/music-service.js";
import {
  isCanonicalQqMusicSessionId,
  QQ_MUSIC_SESSION_ID,
  QQMusicDesktopBridge,
} from "../../../dist/main/main/runtime/music/qqmusic-desktop-bridge.js";
import { SandboxPolicyEvaluator } from "../../../dist/main/main/runtime/sandbox/sandbox-policy.js";
import { createMusicTools } from "../../../dist/main/main/tools/music-tools.js";
import { FireflyToolRegistry } from "../../../dist/main/main/tools/tool-registry.js";
import {
  createCapabilityCategory,
  createCapabilityId,
  createCapabilityRequestId,
} from "../../../dist/main/shared/capability-types.js";
import { createApprovalRequestId } from "../../../dist/main/shared/approval-types.js";
import { createSandboxProfileId } from "../../../dist/main/shared/sandbox-types.js";

const projectRoot = process.cwd();
const controlCapabilityId = createCapabilityId("music.control");
const statusCapabilityId = createCapabilityId("music.status.read");
const searchCapabilityId = createCapabilityId("music.search.read");
const musicCategory = createCapabilityCategory("music");
const controlProfileId = createSandboxProfileId("firefly-music-control-v1");
const statusProfileId = createSandboxProfileId("firefly-music-status-read-v1");
const qqMusicScope = { kind: "desktop", target: "QQMusic" };

function createExecutor({ sessionAvailable = true, commandGate = false } = {}) {
  const calls = [];
  let commandStarted;
  let resolveCommandStarted;
  commandStarted = new Promise((resolve) => {
    resolveCommandStarted = resolve;
  });

  const executor = async (action, signal) => {
    calls.push(action);
    if (action === "get-state") {
      return {
        ok: true,
        found: sessionAvailable,
        appId: "QQMusic.exe",
        title: "测试歌曲",
        artist: "流萤",
        albumTitle: "测试专辑",
        playbackStatus: "Playing",
        position: 12,
        duration: 180,
      };
    }

    if (commandGate) {
      resolveCommandStarted();
      return new Promise((resolve) => {
        signal?.addEventListener(
          "abort",
          () => resolve({ ok: false, found: true, error: "CANCELLED" }),
          { once: true },
        );
      });
    }

    return { ok: true, found: true, action };
  };

  return {
    executor,
    calls,
    commandStarted,
    controlCalls: () => calls.filter((action) => action !== "get-state"),
  };
}

function createFixture({ profile = "RESTRICTED_SCOPE", sessionAvailable = true, commandGate = false } = {}) {
  let clock = 1_000;
  let approvalSequence = 0;
  const executorState = createExecutor({ sessionAvailable, commandGate });
  const bridge = new QQMusicDesktopBridge({ executor: executorState.executor });
  const service = new MusicService({ desktopBridge: bridge });

  const toolRegistry = new FireflyToolRegistry();
  for (const tool of createMusicTools(service)) toolRegistry.register(tool);

  const capabilityRegistry = new CapabilityRegistry();
  capabilityRegistry.register({
    id: statusCapabilityId,
    name: "Read music playback status",
    description: "Reads the current QQ Music playback status.",
    version: "1.1.1",
    category: musicCategory,
    risk: "read_only",
    sideEffect: "read_only",
  });
  capabilityRegistry.register({
    id: controlCapabilityId,
    name: "Control QQ Music playback",
    description: "Controls QQ Music background playback transport.",
    version: "1.1.1",
    category: musicCategory,
    risk: "side_effect",
    sideEffect: "external_action",
  });

  const bindingResolver = new CapabilityBindingResolver(capabilityRegistry, toolRegistry);
  bindingResolver.register({ capabilityId: statusCapabilityId, toolId: "music_status" });
  bindingResolver.register({ capabilityId: controlCapabilityId, toolId: "music_control" });

  const sandboxPolicy = new SandboxPolicyEvaluator([
    {
      id: statusProfileId,
      version: "1.1.1",
      rules: [{ kind: "desktop", allowedTargets: ["QQMusic"] }],
    },
    {
      id: controlProfileId,
      version: "1.1.1",
      rules: [{ kind: "desktop", allowedTargets: ["QQMusic"] }],
    },
  ]);
  const approvalService = new ApprovalService({
    now: () => clock,
    createRequestId: () => createApprovalRequestId(`qqmusic-control-${++approvalSequence}`),
  });
  const permissionPolicyResolver = new PermissionProfilePolicyResolver();
  const pipeline = new CapabilityAuthorizationPipeline({
    capabilityRegistry,
    bindingResolver,
    sandboxPolicy,
    approvalRequirementResolver: createApprovalRequirementResolver([
      { capabilityId: statusCapabilityId, requirement: "none" },
      { capabilityId: controlCapabilityId, requirement: "required" },
    ], {
      permissionPolicyResolver,
      permissionProfile: () => profile,
    }),
    approvalService,
    permissionPolicyResolver,
    getPermissionProfile: () => profile,
  });
  const engine = new ToolExecutionEngine(toolRegistry);
  const bridgeSeam = new AuthorizedInvocationBridge(engine, toolRegistry);
  const adapter = new HarnessAuthorizationAdapter({
    pipeline,
    bridge: bridgeSeam,
    approvalService,
    getPermissionProfile: () => profile,
    routes: [
      {
        toolId: "music_status",
        capabilityId: statusCapabilityId,
        sandboxProfileId: statusProfileId,
        requestedScope: qqMusicScope,
        approvalSummary: "查询当前播放器状态",
        approvalReason: "读取 QQ 音乐状态。",
        approvalTtlMs: 10_000,
      },
      {
        toolId: "music_control",
        capabilityId: controlCapabilityId,
        sandboxProfileId: controlProfileId,
        requestedScope: qqMusicScope,
        approvalSummary: (input) => `控制 QQ 音乐：${String(input.action ?? "不支持的操作")}`,
        approvalReason: "控制 QQ 音乐会改变外部播放器状态。",
        approvalTtlMs: 10_000,
      },
    ],
  });

  return {
    adapter,
    approvalService,
    bridge,
    bridgeSeam,
    capabilityRegistry,
    controlTool: toolRegistry.get("music_control"),
    controlCalls: executorState.controlCalls,
    commandStarted: executorState.commandStarted,
    pipeline,
    service,
    setClock(value) {
      clock = value;
    },
  };
}

function context(callId, signal = new AbortController().signal) {
  return {
    runId: `qqmusic-run-${callId}`,
    step: 1,
    conversationId: "qqmusic-conversation",
    toolCallId: callId,
    userQuery: "控制 QQ 音乐",
    signal,
    toolCallsCount: 1,
    maxToolCallsPerRun: 25,
  };
}

function controlCall(id, action) {
  return { id, name: "music_control", arguments: { action } };
}

function resultBody(result) {
  return JSON.parse(result.output);
}

async function approveOnPending(fixture) {
  return {
    onPendingApproval: (request) => {
      fixture.approvalService.approve(request.approvalRequestId);
    },
  };
}

test("A-F. music.control route, binding, QQMusic Sandbox target, and fixed tool surface", async () => {
  const fixture = createFixture();
  try {
    assert.equal(fixture.adapter.handles({ name: "music_control" }), true);
    assert.equal(fixture.adapter.handles({ name: "music_status" }), true);
    assert.equal(fixture.adapter.handles({ name: "music_search" }), false);
    assert.equal(fixture.adapter.handles({ name: "music_recommend" }), false);
    assert.equal(fixture.adapter.handles({ name: "music_play" }), false);
    assert.equal(fixture.capabilityRegistry.has(controlCapabilityId), true);
    assert.equal(fixture.capabilityRegistry.has(searchCapabilityId), false);
    assert.deepEqual(fixture.pipeline.authorize({
      request: {
        requestId: createCapabilityRequestId("qqmusic-control-scope"),
        capabilityId: controlCapabilityId,
        requester: { type: "main-agent", id: "firefly-harness" },
        input: { action: "next" },
      },
      sandbox: { profileId: controlProfileId, requestedScope: qqMusicScope },
      permissionProfile: "RESTRICTED_SCOPE",
      approval: {
        summary: "控制 QQ 音乐：下一首",
        reason: "控制 QQ 音乐会改变外部播放器状态。",
        expiresAt: 10_000,
      },
      runtimeContext: { runId: "scope-run", toolCallId: "scope-call" },
    }).status, "PENDING_APPROVAL");
    assert.equal(Object.prototype.hasOwnProperty.call(fixture.controlTool.inputSchema.properties, "appId"), false);
  const script = fs.readFileSync(
    path.join(projectRoot, "src", "main", "runtime", "music", "scripts", "qqmusic_gsmtc.ps1"),
    "utf8",
  );
  assert.match(script, /SourceAppUserModelId/);
  assert.match(script, /QQMusic/);
  const bridgeSource = fs.readFileSync(
    path.join(projectRoot, "src", "main", "runtime", "music", "qqmusic-desktop-bridge.ts"),
    "utf8",
  );
  assert.match(bridgeSource, /src.*main.*runtime.*music.*scripts/);
  } finally {
    await fixture.service.shutdown();
  }
});

test("Exact QQMusic identity is case-insensitive and rejects other sessions", async () => {
  const sessions = [
    { id: QQ_MUSIC_SESSION_ID, expected: true },
    { id: "qqmusic.EXE", expected: true },
    { id: "QQMusic.exe.preview", expected: false },
    { id: "QQMusic", expected: false },
    { id: "MPV", expected: false },
    { id: "Spotify.exe", expected: false },
  ];
  for (const session of sessions) {
    assert.equal(isCanonicalQqMusicSessionId(session.id), session.expected, session.id);
  }

  const script = fs.readFileSync(
    path.join(projectRoot, "src", "main", "runtime", "music", "scripts", "qqmusic_gsmtc.ps1"),
    "utf8",
  );
  assert.match(script, /canonicalQqMusicSessionId/);
  assert.match(script, /SourceAppUserModelId[\s\S]{0,100}-ieq/);
  assert.doesNotMatch(script, /SourceAppUserModelId[\s\S]{0,100}-match/);

  const misleadingBridge = new QQMusicDesktopBridge({
    executor: async (action) => action === "get-state"
      ? { ok: true, found: true, appId: "QQMusic.exe.preview", playbackStatus: "Playing" }
      : { ok: true, found: true, action },
  });
  await misleadingBridge.poll();
  assert.equal(misleadingBridge.getSnapshot().available, false);
  assert.equal(await misleadingBridge.play(), false);
  await misleadingBridge.dispose();
});

test("G-K. Supported play, pause, next, previous, and toggle actions route to GSMTC once", async () => {
  for (const [action, expectedBridgeAction] of [
    ["play", "play"],
    ["pause", "pause"],
    ["next", "next"],
    ["previous", "prev"],
    ["toggle", "toggle"],
  ]) {
    const fixture = createFixture();
    await fixture.bridge.poll();
    try {
      const id = `control-${action}`;
      const result = await fixture.adapter.execute(
        controlCall(id, action),
        context(id),
        await approveOnPending(fixture),
      );
      assert.equal(result.isError, false, action);
      assert.deepEqual(resultBody(result), { ok: true, action, target: "QQMusic" });
      assert.deepEqual(fixture.controlCalls(), [expectedBridgeAction]);
    } finally {
      await fixture.service.shutdown();
    }
  }
});

test("L. Unsupported commands are rejected before external control", async () => {
  const fixture = createFixture();
  await fixture.bridge.poll();
  try {
    const result = await fixture.adapter.execute(
      controlCall("unsupported-stop", "stop"),
      context("unsupported-stop"),
      await approveOnPending(fixture),
    );
    assert.equal(result.isError, true);
    assert.equal(resultBody(result).error, "TOOL_EXECUTION_FAILURE");
    assert.deepEqual(fixture.controlCalls(), []);
  } finally {
    await fixture.service.shutdown();
  }
});

test("M-N. The four permission schemes enforce the canonical control policy", async () => {
  for (const profile of ["RESTRICTED_SCOPE", "ASK_EVERY_TIME", "FULL_ACCESS"]) {
    const fixture = createFixture({ profile });
    await fixture.bridge.poll();
    try {
      let pendingRequest;
      const resultPromise = fixture.adapter.execute(
        controlCall(`profile-${profile}`, "pause"),
        context(`profile-${profile}`),
        { onPendingApproval: (request) => { pendingRequest = request; } },
      );
      await Promise.resolve();
      assert.ok(pendingRequest, profile);
      assert.equal(fixture.approvalService.get(pendingRequest.approvalRequestId).state, "pending");
      fixture.approvalService.approve(pendingRequest.approvalRequestId);
      const result = await resultPromise;
      assert.equal(resultBody(result).ok, true, profile);
    } finally {
      await fixture.service.shutdown();
    }
  }

  const readOnly = createFixture({ profile: "READ_ONLY" });
  await readOnly.bridge.poll();
  try {
    const result = await readOnly.adapter.execute(
      controlCall("profile-read-only", "pause"),
      context("profile-read-only"),
    );
    assert.equal(result.isError, true);
    assert.equal(resultBody(result).error, "PERMISSION_PROFILE_DENIED");
    assert.equal(readOnly.approvalService.listPending().length, 0);
    assert.deepEqual(readOnly.controlCalls(), []);
  } finally {
    await readOnly.service.shutdown();
  }
});

test("O-Q. Approval executes once, denial executes zero times, and an unavailable QQMusic session never falls back", async () => {
  const approved = createFixture();
  await approved.bridge.poll();
  try {
    const result = await approved.adapter.execute(
      controlCall("approve-once", "next"),
      context("approve-once"),
      await approveOnPending(approved),
    );
    assert.equal(resultBody(result).ok, true);
    assert.deepEqual(approved.controlCalls(), ["next"]);
    assert.equal(approved.approvalService.listPending().length, 0);
  } finally {
    await approved.service.shutdown();
  }

  const denied = createFixture();
  await denied.bridge.poll();
  try {
    const result = await denied.adapter.execute(
      controlCall("deny-once", "pause"),
      context("deny-once"),
      { onPendingApproval: (request) => { denied.approvalService.deny(request.approvalRequestId); } },
    );
    assert.equal(resultBody(result).error, "APPROVAL_DENIED");
    assert.deepEqual(denied.controlCalls(), []);
  } finally {
    await denied.service.shutdown();
  }

  const unavailable = createFixture({ sessionAvailable: false });
  await unavailable.bridge.poll();
  try {
    const result = await unavailable.adapter.execute(
      controlCall("player-missing", "play"),
      context("player-missing"),
      await approveOnPending(unavailable),
    );
    assert.equal(resultBody(result).error, "TOOL_EXECUTION_FAILURE");
    assert.deepEqual(unavailable.controlCalls(), []);
  } finally {
    await unavailable.service.shutdown();
  }
});

test("R-S. Cancel, stale correlation, and duplicate approval cannot dispatch a second command", async () => {
  const cancelled = createFixture();
  await cancelled.bridge.poll();
  const cancelController = new AbortController();
  let cancelRequest;
  const cancelPromise = cancelled.adapter.execute(
    controlCall("pending-cancel", "pause"),
    context("pending-cancel", cancelController.signal),
    { onPendingApproval: (request) => { cancelRequest = request; } },
  );
  await Promise.resolve();
  assert.ok(cancelRequest);
  cancelController.abort();
  const cancelResult = await cancelPromise;
  assert.equal(resultBody(cancelResult).error, "APPROVAL_CANCELLED");
  assert.deepEqual(cancelled.controlCalls(), []);
  await cancelled.service.shutdown();

  const stale = createFixture();
  await stale.bridge.poll();
  const pending = stale.pipeline.authorize({
    request: {
      requestId: createCapabilityRequestId("stale-control"),
      capabilityId: controlCapabilityId,
      requester: { type: "main-agent", id: "firefly-harness" },
      input: { action: "next" },
    },
    sandbox: { profileId: controlProfileId, requestedScope: qqMusicScope },
    permissionProfile: "RESTRICTED_SCOPE",
    runtimeContext: { runId: "stale-run", toolCallId: "stale-call" },
    approval: {
      summary: "控制 QQ 音乐：下一首",
      reason: "控制 QQ 音乐会改变外部播放器状态。",
      expiresAt: 10_000,
    },
  });
  assert.equal(pending.status, "PENDING_APPROVAL");
  if (pending.status !== "PENDING_APPROVAL") throw new Error("Expected pending control approval.");
  stale.approvalService.approve(pending.approvalRequest.approvalRequestId);
  const invocation = stale.pipeline.resumeAfterApproval(pending.approvalRequest.approvalRequestId, {
    capabilityRequestId: pending.approvalRequest.capabilityRequestId,
    capabilityId: controlCapabilityId,
    correlation: { runId: "stale-run", toolCallId: "stale-call" },
  });
  assert.equal(invocation.status, "AUTHORIZED");
  if (invocation.status !== "AUTHORIZED") throw new Error("Expected authorized control invocation.");
  const staleResult = await stale.bridgeSeam.execute(invocation.invocation, context("different-call"));
  assert.equal(staleResult.ok, false);
  assert.equal(staleResult.error.code, "AUTHORIZATION_CORRELATION_MISMATCH");
  assert.deepEqual(stale.controlCalls(), []);
  await stale.service.shutdown();

  const duplicate = createFixture();
  await duplicate.bridge.poll();
  const duplicateResult = await duplicate.adapter.execute(
    controlCall("duplicate-approval", "pause"),
    context("duplicate-approval"),
    await approveOnPending(duplicate),
  );
  assert.equal(resultBody(duplicateResult).ok, true);
  assert.throws(() => duplicate.approvalService.approve("qqmusic-control-1"));
  assert.deepEqual(duplicate.controlCalls(), ["pause"]);
  await duplicate.service.shutdown();
});

test("T. Run cancellation during GSMTC control reports CANCELLED without false success", async () => {
  const fixture = createFixture({ commandGate: true });
  await fixture.bridge.poll();
  const controller = new AbortController();
  const execution = fixture.adapter.execute(
    controlCall("in-flight-cancel", "next"),
    context("in-flight-cancel", controller.signal),
    await approveOnPending(fixture),
  );
  await fixture.commandStarted;
  controller.abort();
  const result = await execution;
  assert.equal(resultBody(result).error, "CANCELLED");
  assert.equal(resultBody(result).ok, false);
  assert.deepEqual(fixture.controlCalls(), ["next"]);
  await fixture.service.shutdown();
});

test("U-V. Same-round barrier, ToolPolicy confirmation bypass, and target mismatch stay explicit", async () => {
  const fixture = createFixture();
  const toolRound = fs.readFileSync(
    path.join(projectRoot, "src", "main", "orchestrator", "harness", "tool-round.ts"),
    "utf8",
  );
  assert.match(toolRound, /deferred_after_approval/);
  assert.match(toolRound, /outcome: "not_executed"/);

  const mismatch = await fixture.controlTool.execute(
    { action: "next" },
    {
      userQuery: "控制音乐",
      upstreamAuthorization: {
        capabilityId: controlCapabilityId,
        requestId: "wrong-target-request",
        requester: { type: "main-agent", id: "firefly-harness" },
        toolId: "music_control",
        authorizedScope: { kind: "desktop", target: "OtherPlayer" },
        approvalRequirement: "required",
        authorization: {
          type: "approval-grant",
          approvalRequestId: "wrong-target-approval",
          grantLifetime: "once",
        },
      },
    },
  );
  assert.equal(JSON.parse(mismatch).error, "CONTROL_TARGET_MISMATCH");
  await fixture.service.shutdown();
});

test("W-X. music_status remains authorized read-only and discovery remains unregistered", async () => {
  const fixture = createFixture();
  await fixture.bridge.poll();
  try {
    const statusCall = { id: "status-regression", name: "music_status", arguments: {} };
    const result = await fixture.adapter.execute(statusCall, context("status-regression"));
    assert.equal(resultBody(result).ok, true);
    assert.deepEqual(fixture.controlCalls(), []);
    assert.equal(fixture.capabilityRegistry.has(searchCapabilityId), false);
    assert.equal(fixture.adapter.handles({ name: "music_search" }), false);
  } finally {
    await fixture.service.shutdown();
  }
});

test("Y-Z. One canonical adapter and execution owner remain, with no renderer or second control runtime", () => {
  const adapterSource = fs.readFileSync(
    path.join(projectRoot, "src", "main", "orchestrator", "harness", "harness-authorization-adapter.ts"),
    "utf8",
  );
  assert.doesNotMatch(adapterSource, /new ApprovalService|new Map|new Set|QQMusicAuthorizationPipeline|MusicControlAuthorizationPipeline|DesktopControlExecutor|SMTCExecutor/);
  assert.doesNotMatch(adapterSource, /renderer|tts|live2d/i);
  const bridgeSource = fs.readFileSync(
    path.join(projectRoot, "src", "main", "runtime", "music", "qqmusic-desktop-bridge.ts"),
    "utf8",
  );
  assert.doesNotMatch(bridgeSource, /SetForegroundWindow|ShowWindow|mouse|keyboard|focus\(/i);
});
