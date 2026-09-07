import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { FireflyHarness } from "../../../dist/main/main/orchestrator/harness/firefly-harness.js";
import { HarnessAuthorizationAdapter } from "../../../dist/main/main/orchestrator/harness/harness-authorization-adapter.js";
import { AgentEventBus } from "../../../dist/main/main/orchestrator/agent-events.js";
import { ApprovalService } from "../../../dist/main/main/runtime/approval/approval-service.js";
import { createApprovalRequirementResolver } from "../../../dist/main/main/runtime/approval/approval-requirement-resolver.js";
import { AuthorizedInvocationBridge } from "../../../dist/main/main/runtime/authorization/authorized-invocation-bridge.js";
import { CapabilityAuthorizationPipeline } from "../../../dist/main/main/runtime/authorization/capability-authorization-pipeline.js";
import { PermissionProfilePolicyResolver } from "../../../dist/main/main/runtime/authorization/permission-profile-policy-resolver.js";
import { CapabilityBindingResolver } from "../../../dist/main/main/runtime/capabilities/capability-binding-resolver.js";
import { CapabilityRegistry } from "../../../dist/main/main/runtime/capabilities/capability-registry.js";
import { ToolExecutionEngine } from "../../../dist/main/main/runtime/execution/tool-execution-engine.js";
import { SandboxPolicyEvaluator } from "../../../dist/main/main/runtime/sandbox/sandbox-policy.js";
import {
  MAIN_AGENT_DELEGATION_TOOL_ID,
  MainAgentDelegationService,
} from "../../../dist/main/main/runtime/subagents/main-agent-delegation.js";
import { SubAgentRegistry } from "../../../dist/main/main/runtime/subagents/subagent-registry.js";
import { SubAgentTaskService } from "../../../dist/main/main/runtime/subagents/subagent-task-service.js";
import {
  DEFAULT_MUSIC_STATUS_SUBAGENT_DESCRIPTOR,
  SubAgentWorkerRuntime,
} from "../../../dist/main/main/runtime/subagents/subagent-worker-runtime.js";
import { FireflyToolRegistry } from "../../../dist/main/main/tools/tool-registry.js";
import {
  createCapabilityCategory,
  createCapabilityId,
} from "../../../dist/main/shared/capability-types.js";
import { createSandboxProfileId } from "../../../dist/main/shared/sandbox-types.js";
import { createSubAgentTaskId } from "../../../dist/main/shared/subagent-types.js";

const projectRoot = process.cwd();
const statusToolId = "music_status";
const controlToolId = "music_control";
const statusCapabilityId = createCapabilityId("music.status.read");
const musicCategory = createCapabilityCategory("music");
const statusSandboxProfileId = createSandboxProfileId("main-delegation-music-status-v1");
const musicScope = { kind: "desktop", target: "QQMusic" };

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(read, predicate = (value) => value !== undefined, timeoutMs = 1_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await read();
    if (predicate(value)) return value;
    await delay(2);
  }
  throw new Error("Timed out waiting for the delegated task state.");
}

function createProvider(onGenerate) {
  return {
    id: "main-delegation-test-provider",
    name: "Main Delegation Test Provider",
    capabilities: { supportsNativeToolCalling: true, supportsStreaming: false },
    generateCompletion: onGenerate,
  };
}

function toolCall(id, name, args = {}) {
  return { id, name, arguments: args };
}

function delegationArgs(overrides = {}) {
  return {
    subAgentId: DEFAULT_MUSIC_STATUS_SUBAGENT_DESCRIPTOR.id,
    objective: "读取当前音乐状态并返回结构化事实。",
    input: { request: "current_status" },
    ...overrides,
  };
}

function mainProfile() {
  return { kind: "MAIN", allowSubAgentDelegation: true };
}

function createIntegratedFixture({
  provider,
  maxRounds = 8,
  totalTimeoutMs = 2_000,
  permissionProfile = "RESTRICTED_SCOPE",
  statusExecute,
} = {}) {
  let taskSequence = 0;
  const state = {
    requests: [],
    events: [],
    statusExecutions: 0,
    controlExecutions: 0,
    engineCalls: [],
    workerRuntimeCalls: 0,
  };

  const toolRegistry = new FireflyToolRegistry();
  toolRegistry.register({
    id: statusToolId,
    name: "Music status",
    description: "Reads current music status.",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    execute: async (_args, context) => {
      state.statusExecutions++;
      state.statusContext = context;
      if (statusExecute) return statusExecute(_args, context);
      return JSON.stringify({ ok: true, playing: true, title: "Test Track" });
    },
  });
  toolRegistry.register({
    id: controlToolId,
    name: "Music control",
    description: "Controls music playback.",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    execute: async () => {
      state.controlExecutions++;
      return JSON.stringify({ ok: true });
    },
  });

  const eventBus = new AgentEventBus();
  eventBus.onAny((event) => state.events.push(event));
  const engine = new ToolExecutionEngine(toolRegistry, undefined, eventBus);
  const executeToolCall = engine.executeToolCall.bind(engine);
  engine.executeToolCall = async (call, context) => {
    state.engineCalls.push({ call, context });
    return executeToolCall(call, context);
  };

  const capabilityRegistry = new CapabilityRegistry();
  capabilityRegistry.register({
    id: statusCapabilityId,
    name: "Read music status",
    description: "Reads current player status.",
    version: "1.1.1",
    category: musicCategory,
  });
  const bindingResolver = new CapabilityBindingResolver(capabilityRegistry, toolRegistry);
  bindingResolver.register({ capabilityId: statusCapabilityId, toolId: statusToolId });

  const approvalService = new ApprovalService();
  const sandboxPolicy = new SandboxPolicyEvaluator([
    {
      id: statusSandboxProfileId,
      version: "1.1.1",
      rules: [{ kind: "desktop", allowedTargets: [musicScope.target] }],
    },
  ]);
  const approvalRequirementResolver = createApprovalRequirementResolver(
    [{ capabilityId: statusCapabilityId, requirement: "none" }],
    {
      permissionPolicyResolver: new PermissionProfilePolicyResolver(),
      permissionProfile: () => permissionProfile,
    },
  );
  const pipeline = new CapabilityAuthorizationPipeline({
    capabilityRegistry,
    bindingResolver,
    sandboxPolicy,
    approvalRequirementResolver,
    approvalService,
  });
  const bridge = new AuthorizedInvocationBridge(engine, toolRegistry);
  const adapter = new HarnessAuthorizationAdapter({
    pipeline,
    bridge,
    approvalService,
    getPermissionProfile: () => permissionProfile,
    routes: [
      {
        toolId: statusToolId,
        capabilityId: statusCapabilityId,
        sandboxProfileId: statusSandboxProfileId,
        requestedScope: musicScope,
        approvalSummary: "Read music status",
        approvalReason: "Delegated status reads use the canonical policy path.",
        approvalTtlMs: totalTimeoutMs,
      },
    ],
  });

  const subAgentRegistry = new SubAgentRegistry();
  subAgentRegistry.register(DEFAULT_MUSIC_STATUS_SUBAGENT_DESCRIPTOR);
  const taskService = new SubAgentTaskService({
    registry: subAgentRegistry,
    createTaskId: () => createSubAgentTaskId(`main-delegation-task-${++taskSequence}`),
  });

  let harness;
  const runtime = new SubAgentWorkerRuntime({
    registry: subAgentRegistry,
    taskService,
    bindingResolver,
    agentCore: { run: (input) => harness.run(input) },
    eventBus,
  });
  const executeWorker = runtime.execute.bind(runtime);
  runtime.execute = async (...args) => {
    state.workerRuntimeCalls++;
    return executeWorker(...args);
  };
  const delegationService = new MainAgentDelegationService({
    registry: subAgentRegistry,
    taskService,
    workerRuntime: runtime,
  });
  const actualProvider = provider ?? createProvider(async () => ({
    message: { role: "assistant", content: "ordinary-main-result" },
  }));
  const tracedProvider = {
    ...actualProvider,
    generateCompletion: async (request, signal, onChunk) => {
      state.requests.push(request);
      return actualProvider.generateCompletion(request, signal, onChunk);
    },
  };
  harness = new FireflyHarness({
    provider: tracedProvider,
    toolRegistry,
    eventBus,
    executionEngine: engine,
    authorizationAdapter: adapter,
    mainDelegationService: delegationService,
    config: { maxRounds, totalTimeoutMs },
  });

  return {
    adapter,
    approvalService,
    bridge,
    delegationService,
    engine,
    eventBus,
    harness,
    pipeline,
    runtime,
    sandboxPolicy,
    state,
    subAgentRegistry,
    taskService,
    toolRegistry,
  };
}

function directContext(overrides = {}) {
  return {
    parentRunId: "parent-direct",
    parentConversationId: "conversation-direct",
    budget: {
      availableWorkerSteps: 2,
      availableWorkerToolCalls: 1,
      remainingTimeoutMs: 1_000,
    },
    ...overrides,
  };
}

test("A-B. ordinary MAIN is unchanged and only an explicitly enabled MAIN sees delegation", async () => {
  const fixture = createIntegratedFixture();
  const ordinary = await fixture.harness.run({ runId: "ordinary-main", userPrompt: "ordinary" });
  const enabled = await fixture.harness.run({
    runId: "chat-main",
    userPrompt: "chat",
    executionProfile: mainProfile(),
  });

  assert.equal(ordinary.finalText, "ordinary-main-result");
  assert.equal(enabled.finalText, "ordinary-main-result");
  assert.equal(
    fixture.state.requests[0].tools.some((entry) => entry.function.name === MAIN_AGENT_DELEGATION_TOOL_ID),
    false,
  );
  assert.equal(
    fixture.state.requests[1].tools.some((entry) => entry.function.name === MAIN_AGENT_DELEGATION_TOOL_ID),
    true,
  );
  assert.equal(fixture.taskService.list().length, 0);
});

test("C-M. MAIN delegates once, WORKER uses the same Harness, and the same MAIN performs final synthesis", async () => {
  let mainInitialSeen = false;
  let workerToolSeen = false;
  const provider = createProvider(async (request) => {
    const names = (request.tools ?? []).map((entry) => entry.function.name);
    const last = request.messages.at(-1);
    if (names.includes(MAIN_AGENT_DELEGATION_TOOL_ID)) {
      if (!mainInitialSeen) {
        mainInitialSeen = true;
        return {
          message: {
            role: "assistant",
            content: "",
            toolCalls: [toolCall("delegate-call", MAIN_AGENT_DELEGATION_TOOL_ID, delegationArgs())],
          },
        };
      }
      assert.equal(last.role, "tool");
      const observation = JSON.parse(last.content);
      assert.equal(observation.ok, true);
      assert.equal(observation.parentRunId, "chat-parent-run");
      assert.equal(observation.parentConversationId, "chat-conversation");
      assert.deepEqual(observation.result.output, { playing: true, title: "Test Track" });
      return { message: { role: "assistant", content: "主智能体确认：正在播放 Test Track。" } };
    }

    assert.deepEqual(names, [statusToolId]);
    assert.equal(names.includes(controlToolId), false);
    assert.equal(names.includes(MAIN_AGENT_DELEGATION_TOOL_ID), false);
    if (!workerToolSeen) {
      workerToolSeen = true;
      return {
        message: {
          role: "assistant",
          content: "",
          toolCalls: [toolCall("worker-status-call", statusToolId)],
        },
      };
    }
    assert.equal(last.role, "tool");
    return { message: { role: "assistant", content: '{"playing":true,"title":"Test Track"}' } };
  });
  const fixture = createIntegratedFixture({ provider });

  const result = await fixture.harness.run({
    runId: "chat-parent-run",
    conversationId: "chat-conversation",
    userPrompt: "请确认当前音乐状态。",
    executionProfile: mainProfile(),
  });

  assert.equal(result.status, "completed");
  assert.equal(result.finalText, "主智能体确认：正在播放 Test Track。");
  assert.equal(fixture.taskService.list().length, 1);
  assert.equal(fixture.state.workerRuntimeCalls, 1);
  assert.equal(fixture.state.statusExecutions, 1);
  assert.equal(fixture.state.controlExecutions, 0);
  assert.equal(fixture.state.engineCalls.length, 1);
  assert.equal(fixture.state.engineCalls[0].call.name, statusToolId);
  assert.equal(fixture.state.engineCalls[0].context.upstreamAuthorization.requester.type, "subagent");
  assert.equal(result.toolCallsCount, 2);
  assert.equal(result.roundsCount, 2);

  const task = fixture.taskService.list()[0];
  assert.equal(task.task.parentRunId, "chat-parent-run");
  assert.equal(task.task.subAgentId, DEFAULT_MUSIC_STATUS_SUBAGENT_DESCRIPTOR.id);
  assert.equal(task.task.constraints.maxSteps, 2);
  assert.equal(task.task.constraints.maxToolCalls, 1);
  assert.equal(task.task.constraints.maxDepth, 0);
  assert.ok(task.task.constraints.timeoutMs > 0);
  assert.ok(task.task.constraints.timeoutMs <= 2_000);
  assert.equal(task.state, "succeeded");

  assert.equal(fixture.state.requests.length, 4);
  assert.deepEqual(
    fixture.state.requests[1].tools.map((entry) => entry.function.name),
    [statusToolId],
  );
  assert.equal(fixture.state.requests[1].messages[0].content.includes("流萤"), false);
  assert.equal(fixture.state.requests[0].messages[0].content.includes("流萤"), true);
  assert.equal(fixture.state.requests[3].messages[0].content.includes("流萤"), true);
  assert.equal(result.transcript.some((message) => message.content.includes("delegated functional worker")), false);
  assert.equal(result.transcript.some((message) => message.content.includes("task_input")), false);
  assert.equal(
    fixture.state.events.filter((event) => event.type === "agent:final-answer").length,
    1,
  );
  assert.equal(
    fixture.state.events.filter((event) => event.type === "subagent:started").length,
    1,
  );
  assert.equal(
    fixture.state.events.filter((event) => event.type === "subagent:completed").length,
    1,
  );
});

test("V-W. invalid worker identity and invalid arguments are deterministic and create no task", async () => {
  const fixture = createIntegratedFixture();
  const invalidWorker = await fixture.delegationService.execute(
    toolCall("bad-worker", MAIN_AGENT_DELEGATION_TOOL_ID, delegationArgs({ subAgentId: "missing-worker" })),
    directContext(),
  );
  const invalidArgs = await fixture.delegationService.execute(
    toolCall("bad-args", MAIN_AGENT_DELEGATION_TOOL_ID, delegationArgs({ objective: "" })),
    directContext(),
  );
  const invalidInput = await fixture.delegationService.execute(
    toolCall(
      "bad-input",
      MAIN_AGENT_DELEGATION_TOOL_ID,
      delegationArgs({ input: "not-an-object" }),
    ),
    directContext(),
  );

  assert.equal(JSON.parse(invalidWorker.result.output).error, "subagent_not_found");
  assert.equal(JSON.parse(invalidArgs.result.output).error, "invalid_delegation_arguments");
  assert.equal(JSON.parse(invalidInput.result.output).error, "invalid_delegation_arguments");
  assert.equal(invalidWorker.result.isError, true);
  assert.equal(invalidArgs.result.isError, true);
  assert.equal(invalidInput.result.isError, true);
  assert.equal(fixture.taskService.list().length, 0);
  assert.equal(fixture.state.workerRuntimeCalls, 0);
});

test("budget is parent-bounded and preserves one MAIN continuation step", async () => {
  let calls = 0;
  const provider = createProvider(async (request) => {
    calls++;
    if (calls === 1) {
      return {
        message: {
          role: "assistant",
          content: "",
          toolCalls: [toolCall("budget-delegate", MAIN_AGENT_DELEGATION_TOOL_ID, delegationArgs())],
        },
      };
    }
    const observation = JSON.parse(request.messages.at(-1).content);
    assert.equal(observation.error, "delegation_budget_exhausted");
    return { message: { role: "assistant", content: "主运行继续并报告预算不足。" } };
  });
  const fixture = createIntegratedFixture({ provider, maxRounds: 3 });

  const result = await fixture.harness.run({
    runId: "budget-parent",
    userPrompt: "budget",
    executionProfile: mainProfile(),
  });

  assert.equal(result.status, "completed");
  assert.equal(result.finalText, "主运行继续并报告预算不足。");
  assert.equal(result.roundsCount, 2);
  assert.equal(fixture.taskService.list().length, 0);
  assert.equal(fixture.state.workerRuntimeCalls, 0);
});

test("one delegation forms a same-round barrier and cannot launch a second Worker task", async () => {
  let calls = 0;
  const provider = createProvider(async (request) => {
    calls++;
    if (calls === 1) {
      return {
        message: {
          role: "assistant",
          content: "",
          toolCalls: [
            toolCall("first-delegate", MAIN_AGENT_DELEGATION_TOOL_ID, delegationArgs()),
            toolCall("second-delegate", MAIN_AGENT_DELEGATION_TOOL_ID, delegationArgs()),
          ],
        },
      };
    }
    const toolMessages = request.messages.filter((message) => message.role === "tool");
    assert.equal(toolMessages.length, 2);
    assert.equal(JSON.parse(toolMessages[0].content).ok, true);
    assert.equal(JSON.parse(toolMessages[1].content).error, "deferred_after_delegation");
    return { message: { role: "assistant", content: "主运行已消费单个 Worker 结果。" } };
  });
  const fixture = createIntegratedFixture({ provider });
  let workerCalls = 0;
  fixture.runtime.execute = async (taskId) => {
    workerCalls++;
    fixture.taskService.start(taskId);
    return fixture.taskService.succeed(taskId, {
      ok: true,
      output: { playing: true },
    });
  };

  const result = await fixture.harness.run({
    runId: "delegation-barrier-parent",
    userPrompt: "one worker only",
    executionProfile: mainProfile(),
  });

  assert.equal(result.status, "completed");
  assert.equal(result.finalText, "主运行已消费单个 Worker 结果。");
  assert.equal(workerCalls, 1);
  assert.equal(fixture.taskService.list().length, 1);
});

test("X and AE. worker failure becomes a typed observation and the terminal task stays immutable", async () => {
  const fixture = createIntegratedFixture();
  fixture.runtime.execute = async (taskId) => {
    fixture.taskService.start(taskId);
    return fixture.taskService.fail(taskId, {
      code: "CAPABILITY_FAILURE",
      message: "status read failed",
      details: { source: "test" },
    });
  };

  const execution = await fixture.delegationService.execute(
    toolCall("failed-worker", MAIN_AGENT_DELEGATION_TOOL_ID, delegationArgs()),
    directContext(),
  );
  const observation = JSON.parse(execution.result.output);
  assert.equal(observation.ok, false);
  assert.equal(observation.error, "delegation_failed");
  assert.equal(observation.state, "failed");
  assert.equal(observation.failure.code, "CAPABILITY_FAILURE");
  assert.equal(execution.result.isError, true);
  assert.throws(
    () => fixture.taskService.cancel(execution.taskId),
    (error) => error.code === "TASK_ALREADY_TERMINAL",
  );
});

test("failed delegation returns to MAIN for factual replanning instead of becoming a user response", async () => {
  let mainCalls = 0;
  const provider = createProvider(async (request) => {
    mainCalls++;
    if (mainCalls === 1) {
      return {
        message: {
          role: "assistant",
          content: "",
          toolCalls: [toolCall("failure-delegate", MAIN_AGENT_DELEGATION_TOOL_ID, delegationArgs())],
        },
      };
    }
    const observation = JSON.parse(request.messages.at(-1).content);
    assert.equal(observation.error, "delegation_failed");
    assert.equal(observation.failure.code, "CAPABILITY_FAILURE");
    return { message: { role: "assistant", content: "主智能体报告：播放器状态读取失败。" } };
  });
  const fixture = createIntegratedFixture({ provider });
  fixture.runtime.execute = async (taskId) => {
    fixture.taskService.start(taskId);
    return fixture.taskService.fail(taskId, {
      code: "CAPABILITY_FAILURE",
      message: "status read failed",
    });
  };

  const result = await fixture.harness.run({
    runId: "failed-delegation-parent",
    userPrompt: "read status",
    executionProfile: mainProfile(),
  });

  assert.equal(result.status, "completed");
  assert.equal(result.finalText, "主智能体报告：播放器状态读取失败。");
  assert.equal(mainCalls, 2);
  assert.notEqual(result.finalText, "status read failed");
});

test("Z. cancellation before task creation performs no Worker work", async () => {
  const fixture = createIntegratedFixture();
  const controller = new AbortController();
  controller.abort();
  const execution = await fixture.delegationService.execute(
    toolCall("cancel-before-create", MAIN_AGENT_DELEGATION_TOOL_ID, delegationArgs()),
    directContext({ signal: controller.signal }),
  );

  const observation = JSON.parse(execution.result.output);
  assert.equal(observation.error, "delegation_cancelled");
  assert.equal(observation.state, "cancelled");
  assert.equal(fixture.taskService.list().length, 0);
  assert.equal(fixture.state.workerRuntimeCalls, 0);
});

test("AA and Y. parent cancellation during Worker provider execution propagates and never resumes MAIN", async () => {
  let mainCalls = 0;
  const provider = createProvider(async (request, signal) => {
    const names = (request.tools ?? []).map((entry) => entry.function.name);
    if (names.includes(MAIN_AGENT_DELEGATION_TOOL_ID)) {
      mainCalls++;
      return {
        message: {
          role: "assistant",
          content: "",
          toolCalls: [toolCall("cancel-delegate", MAIN_AGENT_DELEGATION_TOOL_ID, delegationArgs())],
        },
      };
    }
    await new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("worker provider aborted"));
        return;
      }
      signal?.addEventListener("abort", () => reject(new Error("worker provider aborted")), { once: true });
      void resolve;
    });
  });
  const fixture = createIntegratedFixture({ provider });
  const controller = new AbortController();
  const run = fixture.harness.run({
    runId: "cancel-parent",
    userPrompt: "cancel",
    executionProfile: mainProfile(),
    signal: controller.signal,
  });
  const task = await waitFor(
    () => fixture.taskService.list()[0],
    (record) => record?.state === "running",
  );
  controller.abort();

  const result = await run;
  assert.equal(result.status, "cancelled");
  assert.equal(fixture.taskService.get(task.task.taskId).state, "cancelled");
  assert.equal(mainCalls, 1);
  assert.equal(fixture.state.statusExecutions, 0);
  assert.equal(fixture.state.events.some((event) => event.type === "agent:final-answer"), false);
});

test("AB-AC. parent cancellation resolves the shared approval wait once and executes no tool", async () => {
  const provider = createProvider(async (request) => {
    const names = (request.tools ?? []).map((entry) => entry.function.name);
    return names.includes(MAIN_AGENT_DELEGATION_TOOL_ID)
      ? {
          message: {
            role: "assistant",
            content: "",
            toolCalls: [toolCall("approval-delegate", MAIN_AGENT_DELEGATION_TOOL_ID, delegationArgs())],
          },
        }
      : {
          message: {
            role: "assistant",
            content: "",
            toolCalls: [toolCall("approval-status", statusToolId)],
          },
        };
  });
  const fixture = createIntegratedFixture({ provider, permissionProfile: "ASK_EVERY_TIME" });
  const controller = new AbortController();
  const run = fixture.harness.run({
    runId: "approval-cancel-parent",
    userPrompt: "approval-cancel",
    executionProfile: mainProfile(),
    signal: controller.signal,
  });
  const approval = await waitFor(() => fixture.approvalService.listPending()[0]);
  controller.abort();

  const result = await run;
  assert.equal(result.status, "cancelled");
  assert.equal(fixture.approvalService.get(approval.request.approvalRequestId).state, "cancelled");
  assert.equal(fixture.taskService.list()[0].state, "cancelled");
  assert.equal(fixture.state.statusExecutions, 0);
  assert.throws(
    () => fixture.approvalService.approve(approval.request.approvalRequestId),
    (error) => error.code === "APPROVAL_ALREADY_RESOLVED",
  );
});

test("parent cancellation during delegated tool execution reaches the canonical engine signal", async () => {
  let markToolStarted;
  const toolStarted = new Promise((resolve) => {
    markToolStarted = resolve;
  });
  const provider = createProvider(async (request) => {
    const names = (request.tools ?? []).map((entry) => entry.function.name);
    return names.includes(MAIN_AGENT_DELEGATION_TOOL_ID)
      ? {
          message: {
            role: "assistant",
            content: "",
            toolCalls: [toolCall("tool-cancel-delegate", MAIN_AGENT_DELEGATION_TOOL_ID, delegationArgs())],
          },
        }
      : {
          message: {
            role: "assistant",
            content: "",
            toolCalls: [toolCall("tool-cancel-status", statusToolId)],
          },
        };
  });
  const fixture = createIntegratedFixture({
    provider,
    statusExecute: async (_args, context) => {
      markToolStarted();
      return new Promise((resolve, reject) => {
        if (context.signal?.aborted) {
          reject(new Error("delegated tool aborted"));
          return;
        }
        context.signal?.addEventListener(
          "abort",
          () => reject(new Error("delegated tool aborted")),
          { once: true },
        );
        void resolve;
      });
    },
  });
  const controller = new AbortController();
  const run = fixture.harness.run({
    runId: "tool-cancel-parent",
    userPrompt: "tool-cancel",
    executionProfile: mainProfile(),
    signal: controller.signal,
  });
  await toolStarted;
  controller.abort();

  const result = await run;
  assert.equal(result.status, "cancelled");
  assert.equal(fixture.taskService.list()[0].state, "cancelled");
  assert.equal(fixture.state.statusExecutions, 1);
  assert.equal(fixture.state.engineCalls.length, 1);
  assert.equal(fixture.state.engineCalls[0].context.signal.aborted, true);
});

test("AD. worker completion racing parent cancellation cannot resume the cancelled parent", async () => {
  const controller = new AbortController();
  let providerCalls = 0;
  const provider = createProvider(async () => {
    providerCalls++;
    return {
      message: {
        role: "assistant",
        content: "",
        toolCalls: [toolCall("race-delegate", MAIN_AGENT_DELEGATION_TOOL_ID, delegationArgs())],
      },
    };
  });
  const fixture = createIntegratedFixture({ provider });
  fixture.runtime.execute = async (taskId) => {
    fixture.taskService.start(taskId);
    const completed = fixture.taskService.succeed(taskId, {
      ok: true,
      output: { playing: true },
    });
    controller.abort();
    return completed;
  };

  const result = await fixture.harness.run({
    runId: "completion-cancel-race",
    userPrompt: "race",
    executionProfile: mainProfile(),
    signal: controller.signal,
  });

  assert.equal(result.status, "cancelled");
  assert.equal(providerCalls, 1);
  assert.equal(result.transcript.some((message) => message.role === "tool"), false);
  assert.equal(fixture.taskService.list()[0].state, "succeeded");
});

test("I and R-U. concurrent parent runs receive only their own correlated observation", async () => {
  const provider = createProvider(async (request) => {
    const last = request.messages.at(-1);
    if (last.role === "tool") {
      const observation = JSON.parse(last.content);
      return {
        message: {
          role: "assistant",
          content: `final:${observation.parentRunId}:${observation.result.output.source}`,
        },
      };
    }
    const user = request.messages.find((message) => message.role === "user").content;
    return {
      message: {
        role: "assistant",
        content: "",
        toolCalls: [
          toolCall(`delegate-${user}`, MAIN_AGENT_DELEGATION_TOOL_ID, delegationArgs({
            objective: `objective:${user}`,
            input: { source: user },
          })),
        ],
      },
    };
  });
  const fixture = createIntegratedFixture({ provider });
  fixture.runtime.execute = async (taskId) => {
    const running = fixture.taskService.start(taskId);
    if (running.task.input.source === "parent-a") await delay(15);
    return fixture.taskService.succeed(taskId, {
      ok: true,
      output: { source: running.task.input.source },
    });
  };

  const [a, b] = await Promise.all([
    fixture.harness.run({
      runId: "run-a",
      conversationId: "conversation-a",
      userPrompt: "parent-a",
      executionProfile: mainProfile(),
    }),
    fixture.harness.run({
      runId: "run-b",
      conversationId: "conversation-b",
      userPrompt: "parent-b",
      executionProfile: mainProfile(),
    }),
  ]);

  assert.equal(a.finalText, "final:run-a:parent-a");
  assert.equal(b.finalText, "final:run-b:parent-b");
  assert.equal(a.transcript.some((message) => message.content.includes("run-b")), false);
  assert.equal(b.transcript.some((message) => message.content.includes("run-a")), false);
  assert.deepEqual(
    fixture.taskService.list().map((record) => record.task.parentRunId).sort(),
    ["run-a", "run-b"],
  );
});

test("N-Q. local mode boundary enables Chat only and does not duplicate the integration", () => {
  const chatSource = fs.readFileSync(path.join(projectRoot, "src", "main", "chat", "chat-ipc.ts"), "utf8");
  const proactiveSource = fs.readFileSync(
    path.join(projectRoot, "src", "main", "orchestrator", "proactive", "proactive-scheduler.ts"),
    "utf8",
  );
  const windowTypes = fs.readFileSync(path.join(projectRoot, "src", "shared", "window-types.ts"), "utf8");
  const characterMode = fs.readFileSync(
    path.join(projectRoot, "src", "main", "character", "semantic-state-types.ts"),
    "utf8",
  );

  assert.match(chatSource, /executionProfile:\s*\{\s*kind:\s*"MAIN",\s*allowSubAgentDelegation:\s*true\s*\}/);
  assert.equal(proactiveSource.includes("allowSubAgentDelegation"), false);
  assert.ok(windowTypes.includes('RendererView = "chat" | "settings" | "summary" | "approval"'));
  assert.ok(characterMode.includes('CharacterMode = "daily" | "work"'));
  assert.equal(characterMode.includes("allowSubAgentDelegation"), false);
});

test("AF-BO. delegation preserves the single-owner architecture and Worker isolation", () => {
  const indexSource = fs.readFileSync(path.join(projectRoot, "src", "main", "index.ts"), "utf8");
  const harnessSource = fs.readFileSync(
    path.join(projectRoot, "src", "main", "orchestrator", "harness", "firefly-harness.ts"),
    "utf8",
  );
  const delegationSource = fs.readFileSync(
    path.join(projectRoot, "src", "main", "runtime", "subagents", "main-agent-delegation.ts"),
    "utf8",
  );
  const sourceFiles = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (/\.ts$/.test(entry.name)) sourceFiles.push(fullPath);
    }
  };
  visit(path.join(projectRoot, "src", "main"));
  const allMainSource = sourceFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");

  assert.equal((indexSource.match(/new SubAgentWorkerRuntime\s*\(/g) ?? []).length, 1);
  assert.equal((indexSource.match(/new SubAgentTaskService\s*\(/g) ?? []).length, 1);
  assert.equal((allMainSource.match(/class FireflyHarness\b/g) ?? []).length, 1);
  assert.equal((allMainSource.match(/class ToolExecutionEngine\b/g) ?? []).length, 1);
  assert.equal((allMainSource.match(/class FireflyToolRegistry\b/g) ?? []).length, 1);
  assert.equal((allMainSource.match(/class AgentEventBus\b/g) ?? []).length, 1);
  assert.equal(harnessSource.includes("MAIN_AGENT_DELEGATION_TOOL_ID"), false);
  assert.equal(delegationSource.includes("ToolExecutionEngine"), false);
  assert.equal(delegationSource.includes("CapabilityAuthorizationPipeline"), false);
  assert.equal(delegationSource.includes("ApprovalService"), false);
  assert.equal(delegationSource.includes("Character"), false);
  assert.equal(delegationSource.includes("Memory"), false);
  assert.equal(delegationSource.includes("Rag"), false);
  assert.equal(delegationSource.includes("Tts"), false);
  assert.equal(delegationSource.includes("Live2D"), false);
  for (const forbiddenName of [
    "SubAgentHarness",
    "WorkerHarness",
    "ChatWorkerHarness",
    "CodexWorkerHarness",
    "WorkWorkerHarness",
    "DelegationHarness",
    "SubAgentExecutor",
    "SubAgentAuthorizationPipeline",
  ]) {
    assert.equal(new RegExp(`class\\s+${forbiddenName}\\b`).test(allMainSource), false);
  }
});
