import test from "node:test";
import assert from "node:assert/strict";

import { FireflyHarness } from "../../../dist/main/main/orchestrator/harness/firefly-harness.js";
import { HarnessAuthorizationAdapter } from "../../../dist/main/main/orchestrator/harness/harness-authorization-adapter.js";
import { OpenAiFireflyProvider } from "../../../dist/main/main/orchestrator/providers/openai-firefly-provider.js";
import {
  createMusicControlExecutionRequirement,
  isAmbiguousMusicControlRequest,
  resolveMusicControlExecution,
  resolveMusicControlIntent,
} from "../../../dist/main/main/orchestrator/tools/music-control-intent.js";
import { createMusicTools } from "../../../dist/main/main/orchestrator/tools/adapters/music-tools.js";
import { ToolExecutionEngine } from "../../../dist/main/main/orchestrator/tools/execution/tool-execution-engine.js";
import { FireflyToolRegistry } from "../../../dist/main/main/orchestrator/tools/registry/tool-registry.js";
import { MusicService } from "../../../dist/main/main/music/music-service.js";
import {
  QQMusicDesktopBridge,
  type GsmtcAction,
  type GsmtcExecutor,
  type GsmtcRawState,
} from "../../../dist/main/main/music/qqmusic-desktop-bridge.js";
import { ApprovalService } from "../../../dist/main/main/runtime/approval/approval-service.js";
import { createApprovalRequirementResolver } from "../../../dist/main/main/runtime/approval/approval-requirement-resolver.js";
import { AuthorizedInvocationBridge } from "../../../dist/main/main/runtime/authorization/authorized-invocation-bridge.js";
import { CapabilityAuthorizationPipeline } from "../../../dist/main/main/runtime/authorization/capability-authorization-pipeline.js";
import type { ProcessApprovalGrantRule } from "../../../dist/main/main/runtime/authorization/capability-authorization-pipeline.js";
import { PermissionProfilePolicyResolver } from "../../../dist/main/main/runtime/authorization/permission-profile-policy-resolver.js";
import { CapabilityBindingResolver } from "../../../dist/main/main/runtime/capabilities/capability-binding-resolver.js";
import { CapabilityRegistry } from "../../../dist/main/main/runtime/capabilities/capability-registry.js";
import { SandboxPolicyEvaluator } from "../../../dist/main/main/runtime/sandbox/sandbox-policy.js";
import { ChatHistoryStore } from "../../../dist/main/main/chat/chat-history.js";
import {
  createCapabilityCategory,
  createCapabilityId,
} from "../../../dist/main/shared/capability-types.js";
import { createApprovalRequestId } from "../../../dist/main/shared/approval-types.js";
import { createSandboxProfileId } from "../../../dist/main/shared/sandbox-types.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
} from "../../../dist/main/shared/chat-types.js";
import type { IFireflyLlmProvider } from "../../../dist/main/shared/provider-types.js";
import type { AgentRunResult } from "../../../dist/main/shared/agent-types.js";
import type { ApprovalRecord } from "../../../dist/main/shared/approval-types.js";
import type { PermissionProfile } from "../../../dist/main/shared/permission-profile-types.js";

const controlCapabilityId = createCapabilityId("music.control");
const musicCategory = createCapabilityCategory("music");
const controlProfileId = createSandboxProfileId("firefly-music-control-v1");
const qqMusicScope = { kind: "desktop", target: "QQMusic" } as const;

type ApprovalAction = "approve" | "deny" | "cancel" | "expire";
type ControlBehavior = "success" | "reject" | "unknown" | "timeout";

class ScriptedProvider implements IFireflyLlmProvider {
  readonly id = "music-control-test";
  readonly name = "Music control truthfulness test provider";
  readonly capabilities = {
    supportsNativeToolCalling: true,
    supportsStreaming: false,
  } as const;
  readonly requests: ChatCompletionRequest[] = [];
  private readonly respond: (
    request: ChatCompletionRequest,
    requestIndex: number,
  ) => ChatCompletionResponse | Promise<ChatCompletionResponse>;

  constructor(
    respond: (
      request: ChatCompletionRequest,
      requestIndex: number,
    ) => ChatCompletionResponse | Promise<ChatCompletionResponse>,
  ) {
    this.respond = respond;
  }

  async generateCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    this.requests.push(request);
    return this.respond(request, this.requests.length - 1);
  }
}

function assistant(content: string): ChatCompletionResponse {
  return { message: { role: "assistant", content } };
}

function toolCall(
  id: string,
  name = "music_control",
  action = "next",
): ChatCompletionResponse {
  return {
    message: {
      role: "assistant",
      content: "",
      toolCalls: [{ id, name, arguments: { action } }],
    },
  };
}

function lastMessage(request: ChatCompletionRequest): ChatMessage | undefined {
  return request.messages.at(-1);
}

function correctiveProvider(): ScriptedProvider {
  let sequence = 0;
  return new ScriptedProvider((request) => {
    if (lastMessage(request)?.role === "tool") {
      return assistant("好的，已经切换成功。这个文本不能成为执行证据。");
    }
    if (request.toolChoice?.function.name === "music_control") {
      sequence++;
      return toolCall(`required-control-${sequence}`);
    }
    return assistant("已经切换到下一首了。这个首轮文本同样不能成为执行证据。");
  });
}

function transportProvider(): ScriptedProvider {
  let sequence = 0;
  return new ScriptedProvider((request) => {
    if (lastMessage(request)?.role === "tool") {
      return assistant("已收到当前工具结果；回复必须以当前执行证据为准。");
    }
    const latestUser = [...request.messages]
      .reverse()
      .find((message) => message.role === "user")?.content ?? "";
    const action = latestUser.includes("上一") ? "previous" : "next";
    sequence += 1;
    return toolCall(`transport-${sequence}`, "music_control", action);
  });
}

interface FixtureOptions {
  readonly provider: ScriptedProvider;
  readonly approvalAction?: ApprovalAction;
  readonly controlBehavior?: ControlBehavior;
  readonly toolTimeoutMs?: number;
  readonly processScopedApproval?: boolean;
  readonly changeTrackAfterControl?: boolean;
  readonly failStateObservationAfterControl?: boolean;
}

async function createFixture(options: FixtureOptions) {
  let clock = 1_000;
  let approvalSequence = 0;
  let permissionProfile: PermissionProfile = "FULL_ACCESS";
  let trackSequence = 0;
  let failStateObservation = false;
  const approvalRecords: ApprovalRecord[] = [];
  const calls: GsmtcAction[] = [];

  const executor: GsmtcExecutor = async (action, signal): Promise<GsmtcRawState> => {
    calls.push(action);
    if (action === "get-state") {
      if (failStateObservation) {
        return { ok: false, found: false, error: "STATE_READ_FAILED" };
      }
      return {
        ok: true,
        found: true,
        appId: "QQMusic.exe",
        title: trackSequence === 0 ? "测试歌曲" : `测试歌曲-${trackSequence}`,
        artist: "流萤",
        playbackStatus: "Playing",
      };
    }
    if (action === "next" && options.changeTrackAfterControl) trackSequence += 1;
    if (action === "next" && options.failStateObservationAfterControl) failStateObservation = true;
    if (options.controlBehavior === "reject") return { ok: false, found: true };
    if (options.controlBehavior === "unknown") {
      return { ok: false, found: true, error: "CONTROL_RESULT_UNKNOWN" };
    }
    if (options.controlBehavior === "timeout") {
      return new Promise<GsmtcRawState>((resolve) => {
        signal?.addEventListener(
          "abort",
          () => resolve({ ok: false, found: true, error: "CANCELLED" }),
          { once: true },
        );
      });
    }
    return { ok: true, found: true };
  };

  const desktopBridge = new QQMusicDesktopBridge({ executor, postControlObservationDelayMs: 0 });
  await desktopBridge.poll();
  const musicService = new MusicService({ desktopBridge });
  const registry = new FireflyToolRegistry();
  for (const tool of createMusicTools(musicService)) {
    registry.register(
      tool.id === "music_control" && options.toolTimeoutMs !== undefined
        ? { ...tool, timeoutMs: options.toolTimeoutMs }
        : tool,
    );
  }

  const capabilityRegistry = new CapabilityRegistry();
  capabilityRegistry.register({
    id: controlCapabilityId,
    name: "Control QQ Music playback",
    description: "Controls QQ Music background playback transport.",
    version: "1.1.1",
    category: musicCategory,
    risk: "side_effect",
    sideEffect: "external_action",
  });
  const bindingResolver = new CapabilityBindingResolver(capabilityRegistry, registry);
  bindingResolver.register({ capabilityId: controlCapabilityId, toolId: "music_control" });
  const sandboxPolicy = new SandboxPolicyEvaluator([
    {
      id: controlProfileId,
      version: "1.1.1",
      rules: [{ kind: "desktop", allowedTargets: ["QQMusic"] }],
    },
  ]);
  const approvalService = new ApprovalService({
    now: () => clock,
    createRequestId: () => createApprovalRequestId(`truthful-control-${++approvalSequence}`),
  });
  const permissionPolicyResolver = new PermissionProfilePolicyResolver();
  const pipeline = new CapabilityAuthorizationPipeline({
    capabilityRegistry,
    bindingResolver,
    sandboxPolicy,
    approvalRequirementResolver: createApprovalRequirementResolver(
      [{ capabilityId: controlCapabilityId, requirement: "required" }],
      {
        permissionPolicyResolver,
        permissionProfile: () => permissionProfile,
      },
    ),
    approvalService,
    permissionPolicyResolver,
    getPermissionProfile: () => permissionProfile,
    processApprovalGrantRule: options.processScopedApproval
      ? {
          capabilityId: controlCapabilityId,
          toolId: "music_control",
          sandboxProfileId: controlProfileId,
          permissionProfile: "FULL_ACCESS",
        } satisfies ProcessApprovalGrantRule
      : undefined,
  });
  const engine = new ToolExecutionEngine(registry);
  const authorizedBridge = new AuthorizedInvocationBridge(engine, registry);
  const authorizationAdapter = new HarnessAuthorizationAdapter({
    pipeline,
    bridge: authorizedBridge,
    approvalService,
    getPermissionProfile: () => permissionProfile,
    now: () => clock,
    routes: [
      {
        toolId: "music_control",
        capabilityId: controlCapabilityId,
        sandboxProfileId: controlProfileId,
        requestedScope: qqMusicScope,
        approvalSummary: "控制 QQ 音乐",
        approvalReason: "控制 QQ 音乐会改变外部播放器状态。",
        approvalTtlMs: 100,
      },
    ],
  });

  const approvalAction = options.approvalAction ?? "approve";
  approvalService.onChanged((record) => {
    approvalRecords.push(record);
    if (record.state !== "pending") return;
    if (approvalAction === "approve") approvalService.approve(record.request.approvalRequestId);
    if (approvalAction === "deny") approvalService.deny(record.request.approvalRequestId);
    if (approvalAction === "cancel") approvalService.cancel(record.request.approvalRequestId);
    if (approvalAction === "expire") {
      clock = record.request.expiresAt;
      approvalService.expireExpired(clock);
    }
  });

  const harness = new FireflyHarness({
    provider: options.provider,
    toolRegistry: registry,
    executionEngine: engine,
    authorizationAdapter,
    config: { maxRounds: 6, totalTimeoutMs: 2_000 },
  });
  return {
    approvalRecords,
    calls,
    controlCalls: () => calls.filter((action) => action !== "get-state"),
    harness,
    provider: options.provider,
    approvalService,
    pipeline,
    setPermissionProfile: (profile: PermissionProfile) => {
      permissionProfile = profile;
    },
  };
}

async function runNextControl(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  message: string,
  history?: ChatMessage[],
): Promise<AgentRunResult> {
  const intent = resolveMusicControlIntent(message);
  assert.ok(intent, `Expected explicit control intent for: ${message}`);
  return fixture.harness.run({
    source: "user",
    userPrompt: message,
    history,
    executionProfile: { kind: "MAIN", allowSubAgentDelegation: true },
    requiredToolExecution: createMusicControlExecutionRequirement(intent),
  });
}

test("1. Three independent next-track requests each execute once with independent approval", async () => {
  const fixture = await createFixture({ provider: correctiveProvider() });
  const messages = ["流萤，切换下一首", "再切换", "再切换下一首"];

  for (const message of messages) {
    const result = await runNextControl(fixture, message);
    assert.equal(result.requiredToolExecution?.status, "succeeded");
    assert.equal(result.requiredToolExecution?.correctionAttempts, 1);
    assert.equal(result.requiredToolExecution?.evidence?.runId, result.runId);
    assert.equal(resolveMusicControlExecution({ kind: "music_control", action: "next" }, result).state, "command_submitted");
  }

  assert.deepEqual(fixture.controlCalls(), ["next", "next", "next"]);
  assert.equal(fixture.approvalRecords.filter((record) => record.state === "pending").length, 3);
  assert.equal(new Set(
    fixture.approvalRecords
      .filter((record) => record.state === "pending")
      .map((record) => record.request.approvalRequestId),
  ).size, 3);
  const correctionRequests = fixture.provider.requests.filter((request) => request.toolChoice !== undefined);
  assert.equal(correctionRequests.length, 3);
  for (const request of correctionRequests) {
    assert.equal(request.toolChoice?.function.name, "music_control");
    assert.deepEqual(request.tools?.map((tool) => tool.function.name), ["music_control"]);
  }
});

test("Control success reports a changed player state only after the post-command read", async () => {
  const fixture = await createFixture({
    provider: correctiveProvider(),
    changeTrackAfterControl: true,
  });
  const result = await runNextControl(fixture, "切换下一首");
  const visible = resolveMusicControlExecution({ kind: "music_control", action: "next" }, result);
  const evidence = result.requiredToolExecution?.evidence;

  assert.equal(result.requiredToolExecution?.status, "succeeded");
  assert.equal(evidence?.runId, result.runId);
  assert.equal(evidence === undefined ? undefined : JSON.parse(evidence.output).playerStateObservation, "changed");
  assert.match(visible.replyText, /确认播放器状态或曲目发生了变化/u);
  assert.deepEqual(fixture.controlCalls(), ["next"]);
});

test("A failed post-command state read never replays the control or claims a change", async () => {
  const fixture = await createFixture({
    provider: correctiveProvider(),
    failStateObservationAfterControl: true,
  });
  const result = await runNextControl(fixture, "切换下一首");
  const visible = resolveMusicControlExecution({ kind: "music_control", action: "next" }, result);
  const evidence = result.requiredToolExecution?.evidence;

  assert.equal(result.requiredToolExecution?.status, "succeeded");
  assert.equal(evidence === undefined ? undefined : JSON.parse(evidence.output).playerStateObservation, "failed");
  assert.match(visible.replyText, /状态读取失败/u);
  assert.match(visible.replyText, /没有重试/u);
  assert.deepEqual(fixture.controlCalls(), ["next"]);
});

test("FULL_ACCESS reuses only the scoped in-process grant, while next/previous executions remain distinct", async () => {
  const fixture = await createFixture({
    provider: transportProvider(),
    processScopedApproval: true,
    changeTrackAfterControl: true,
  });

  const first = await runNextControl(fixture, "切换下一首");
  const second = await runNextControl(fixture, "再切换下一首");
  const previous = await runNextControl(fixture, "切换上一首");

  for (const result of [first, second, previous]) {
    assert.equal(result.requiredToolExecution?.status, "succeeded");
  }
  assert.deepEqual(fixture.controlCalls(), ["next", "next", "prev"]);
  assert.equal(fixture.approvalRecords.filter((record) => record.state === "pending").length, 1);
  assert.equal(fixture.approvalRecords.filter((record) => record.state === "approved").length, 1);
  assert.equal(fixture.approvalRecords.find((record) => record.state === "pending")?.request.grantLifetime, "process");

  fixture.setPermissionProfile("RESTRICTED_SCOPE");
  fixture.approvalService.revokeProcessGrants();
  const restrictedReapproval = await runNextControl(fixture, "切换下一首");
  assert.equal(restrictedReapproval.requiredToolExecution?.status, "succeeded");
  assert.deepEqual(fixture.controlCalls(), ["next", "next", "prev", "next"]);
  assert.equal(
    fixture.approvalRecords.filter((record) => record.state === "pending").length,
    2,
  );
  assert.equal(
    fixture.approvalRecords.find((record) => record.state === "pending" && record.request.grantLifetime === "once") !== undefined,
    true,
  );

  fixture.setPermissionProfile("FULL_ACCESS");
  const afterReapproval = await runNextControl(fixture, "切换下一首");
  assert.equal(afterReapproval.requiredToolExecution?.status, "succeeded");
  assert.deepEqual(fixture.controlCalls(), ["next", "next", "prev", "next", "next"]);
  assert.equal(fixture.approvalRecords.filter((record) => record.state === "pending").length, 3);
});

test("A denied process-scoped approval does not create a reusable grant", async () => {
  const fixture = await createFixture({
    provider: transportProvider(),
    processScopedApproval: true,
    approvalAction: "deny",
  });
  const first = await runNextControl(fixture, "切换下一首");
  const second = await runNextControl(fixture, "再切换下一首");

  assert.notEqual(first.requiredToolExecution?.status, "succeeded");
  assert.notEqual(second.requiredToolExecution?.status, "succeeded");
  assert.deepEqual(fixture.controlCalls(), []);
  assert.equal(fixture.approvalRecords.filter((record) => record.state === "pending").length, 2);
});

test("2-3. Previous visible success and zero tool calls cannot prove current execution", async () => {
  const provider = new ScriptedProvider(() => assistant("已经切换成功。"));
  const fixture = await createFixture({ provider });
  const history: ChatMessage[] = [
    { id: "old-user", role: "user", content: "切换下一首" },
    { id: "old-assistant", role: "assistant", content: "已经切换成功。" },
  ];
  const result = await runNextControl(fixture, "再切换", history);

  assert.equal(result.requiredToolExecution?.status, "not_called");
  assert.equal(result.requiredToolExecution?.correctionAttempts, 1);
  assert.deepEqual(fixture.controlCalls(), []);
  assert.doesNotMatch(result.finalText, /已经切换|切换成功/u);
  const visible = resolveMusicControlExecution({ kind: "music_control", action: "next" }, result);
  assert.equal(visible.state, "not_executed");
  assert.doesNotMatch(visible.replyText, /已经完成|已经切换/u);
});

test("4. A different forged tool call is rejected and cannot prove music control", async () => {
  const provider = new ScriptedProvider(() => toolCall("wrong-tool", "music_status", "next"));
  const fixture = await createFixture({ provider });
  const result = await runNextControl(fixture, "请切换下一首");

  assert.equal(result.requiredToolExecution?.status, "not_called");
  assert.deepEqual(fixture.controlCalls(), []);
  assert.ok(result.toolCallEvidence?.every((entry) => entry.outcome === "not_executed"));
  assert.equal(resolveMusicControlExecution({ kind: "music_control", action: "next" }, result).state, "not_executed");
});

test("5. A rejected control result cannot become a successful final answer", async () => {
  const provider = new ScriptedProvider((request) =>
    lastMessage(request)?.role === "tool"
      ? assistant("已经切换成功。")
      : toolCall("rejected-control")
  );
  const fixture = await createFixture({ provider, controlBehavior: "reject" });
  const result = await runNextControl(fixture, "切换下一首");
  const visible = resolveMusicControlExecution({ kind: "music_control", action: "next" }, result);

  assert.deepEqual(fixture.controlCalls(), ["next"]);
  assert.equal(result.requiredToolExecution?.status, "failed");
  assert.equal(visible.state, "failed");
  assert.doesNotMatch(visible.replyText, /已经切换|已经完成/u);
});

test("6-7. Denied, cancelled, and expired approvals never execute or carry over", async () => {
  for (const approvalAction of ["deny", "cancel", "expire"] as const) {
    const provider = new ScriptedProvider((request) =>
      lastMessage(request)?.role === "tool"
        ? assistant("已经切换成功。")
        : toolCall(`approval-${approvalAction}`)
    );
    const fixture = await createFixture({ provider, approvalAction });
    const result = await runNextControl(fixture, "切换下一首");
    assert.notEqual(result.requiredToolExecution?.status, "succeeded");
    assert.deepEqual(fixture.controlCalls(), []);
    assert.notEqual(
      resolveMusicControlExecution({ kind: "music_control", action: "next" }, result).state,
      "command_submitted",
    );
  }
});

test("8. Duplicate model callbacks within one request submit only one control", async () => {
  let completed = false;
  const provider = new ScriptedProvider((request) => {
    if (completed || lastMessage(request)?.role === "tool") return assistant("已经执行两次。" );
    completed = true;
    return {
      message: {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "duplicate-a", name: "music_control", arguments: { action: "next" } },
          { id: "duplicate-b", name: "music_control", arguments: { action: "next" } },
        ],
      },
    };
  });
  const fixture = await createFixture({ provider });
  const result = await runNextControl(fixture, "切换下一首");

  assert.deepEqual(fixture.controlCalls(), ["next"]);
  assert.equal(result.requiredToolExecution?.status, "succeeded");
  assert.equal(result.toolCallEvidence?.filter((entry) => entry.outcome === "success").length, 1);
  assert.equal(result.toolCallEvidence?.filter((entry) => entry.outcome === "not_executed").length, 1);
});

test("9. Unknown and timed-out submissions are never replayed automatically", async () => {
  for (const controlBehavior of ["unknown", "timeout"] as const) {
    const provider = new ScriptedProvider((request) =>
      lastMessage(request)?.role === "tool"
        ? assistant("已经切换成功。")
        : toolCall(`uncertain-${controlBehavior}`)
    );
    const fixture = await createFixture({
      provider,
      controlBehavior,
      ...(controlBehavior === "timeout" ? { toolTimeoutMs: 20 } : {}),
    });
    const result = await runNextControl(fixture, "切换下一首");
    assert.deepEqual(fixture.controlCalls(), ["next"]);
    assert.equal(result.requiredToolExecution?.status, "unknown");
    const visible = resolveMusicControlExecution({ kind: "music_control", action: "next" }, result);
    assert.equal(visible.state, "unknown");
    assert.match(visible.replyText, /没有自动再试/u);
  }
});

test("10. Discussion, quotations, questions, and negative text do not become control intent", () => {
  for (const text of [
    "怎么切换下一首？",
    "解释一下‘切换下一首’是什么意思",
    "我们讨论一下下一首歌",
    "不要切换下一首",
    "如果切换下一首会怎样",
    "他说：\"切换下一首\"",
    "播放《下一首》这首歌",
  ]) {
    assert.equal(resolveMusicControlIntent(text), undefined, text);
  }
  assert.deepEqual(resolveMusicControlIntent("流萤，切换下一首"), {
    kind: "music_control",
    action: "next",
  });
  assert.deepEqual(resolveMusicControlIntent("再切换"), {
    kind: "music_control",
    action: "next",
  });
});

test("11. The classifier marks an ambiguous transport request without selecting an action", () => {
  assert.equal(isAmbiguousMusicControlRequest("流萤，切换歌曲"), true);
  assert.equal(isAmbiguousMusicControlRequest("切换歌曲是什么意思？"), false);
  assert.equal(isAmbiguousMusicControlRequest("解释一下切换歌曲"), false);
  assert.equal(isAmbiguousMusicControlRequest("切换下一首"), false);
  assert.equal(isAmbiguousMusicControlRequest("切换上一首"), false);
});

test("11. Reading restored visible history does not replay a completed control", async () => {
  const fixture = await createFixture({ provider: correctiveProvider() });
  const store = new ChatHistoryStore();
  const userMessage: ChatMessage = {
    id: "history-user",
    role: "user",
    content: "切换下一首",
  };
  store.append(userMessage);
  const result = await runNextControl(fixture, userMessage.content, store.getMessages());
  const visible = resolveMusicControlExecution({ kind: "music_control", action: "next" }, result);
  store.append({ id: "history-assistant", role: "assistant", content: visible.replyText });

  const firstRestore = store.getMessages();
  const secondRestore = store.getMessages();
  assert.deepEqual(firstRestore, secondRestore);
  assert.equal(firstRestore.length, 2);
  assert.deepEqual(fixture.controlCalls(), ["next"]);
});

test("Required-tool correction reaches the OpenAI-compatible provider as tool_choice", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  const fakeFetch: typeof fetch = async (_input, init) => {
    const parsedBody: unknown = JSON.parse(String(init?.body));
    assert.equal(typeof parsedBody, "object");
    assert.notEqual(parsedBody, null);
    requestBody = parsedBody as Record<string, unknown>;
    return new Response(JSON.stringify({
      choices: [{ message: { role: "assistant", content: "", tool_calls: [] } }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  globalThis.fetch = fakeFetch;

  try {
    const provider = new OpenAiFireflyProvider({
      provider: "custom",
      baseUrl: "https://provider.invalid/v1",
      apiKey: "",
      model: "test-model",
      temperature: 0.7,
      enableStreaming: false,
    });
    await provider.generateCompletion({
      messages: [{ id: "provider-user", role: "user", content: "切换下一首" }],
      tools: [{
        type: "function",
        function: {
          name: "music_control",
          description: "Control QQ Music playback.",
          parameters: {
            type: "object",
            properties: { action: { type: "string", enum: ["next"] } },
            required: ["action"],
          },
        },
      }],
      toolChoice: {
        type: "function",
        function: { name: "music_control" },
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requestBody?.tool_choice, {
    type: "function",
    function: { name: "music_control" },
  });
});
