import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { FireflyHarness } from "../../../dist/main/main/orchestrator/harness/firefly-harness.js";
import { HarnessAuthorizationAdapter } from "../../../dist/main/main/orchestrator/harness/harness-authorization-adapter.js";
import { AgentEventBus } from "../../../dist/main/main/orchestrator/agent-events.js";
import { CheckpointManager } from "../../../dist/main/main/orchestrator/recovery/checkpoint-manager.js";
import { InMemoryCheckpointStore } from "../../../dist/main/main/orchestrator/recovery/checkpoint-store.js";
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
  DEFAULT_MUSIC_STATUS_SUBAGENT_DESCRIPTOR,
  SubAgentWorkerRuntime,
} from "../../../dist/main/main/runtime/subagents/subagent-worker-runtime.js";
import { SubAgentRegistry } from "../../../dist/main/main/runtime/subagents/subagent-registry.js";
import { SubAgentTaskService } from "../../../dist/main/main/runtime/subagents/subagent-task-service.js";
import {
  createCapabilityCategory,
  createCapabilityId,
} from "../../../dist/main/shared/capability-types.js";
import { createSandboxProfileId } from "../../../dist/main/shared/sandbox-types.js";
import { createSubAgentTaskId } from "../../../dist/main/shared/subagent-types.js";
import { FireflyToolRegistry } from "../../../dist/main/main/tools/tool-registry.js";

const projectRoot = process.cwd();
const statusToolId = "music_status";
const controlToolId = "music_control";
const statusCapabilityId = createCapabilityId("music.status.read");
const controlCapabilityId = createCapabilityId("music.control");
const capabilityCategory = createCapabilityCategory("music");
const statusSandboxProfileId = createSandboxProfileId("worker-music-status-v1");
const controlSandboxProfileId = createSandboxProfileId("worker-music-control-v1");
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
  throw new Error("Timed out waiting for the expected worker state.");
}

function createProvider(onGenerate) {
  return {
    id: "subagent-worker-test-provider",
    name: "SubAgent Worker Test Provider",
    capabilities: { supportsNativeToolCalling: true, supportsStreaming: false },
    generateCompletion: onGenerate,
  };
}

function createFixture({
  profile = "RESTRICTED_SCOPE",
  provider,
  constraints = {},
  approvalTtlMs = 1_000,
  statusExecute,
} = {}) {
  let activeProfile = profile;
  let taskSequence = 0;
  const state = {
    statusExecutions: 0,
    controlExecutions: 0,
    engineCalls: [],
    requests: [],
  };

  const toolRegistry = new FireflyToolRegistry();
  toolRegistry.register({
    id: statusToolId,
    name: "Music status",
    description: "Reads the current music status.",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    execute: statusExecute ?? (async (_args, context) => {
      state.statusExecutions++;
      state.lastStatusContext = context;
      return JSON.stringify({ ok: true, playing: true, source: "worker-test" });
    }),
  });
  toolRegistry.register({
    id: controlToolId,
    name: "Music control",
    description: "Controls music playback.",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    execute: async () => {
      state.controlExecutions++;
      return JSON.stringify({ ok: true, source: "control-test" });
    },
  });

  const eventBus = new AgentEventBus();
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
    description: "Reads the current player status.",
    version: "1.1.1",
    category: capabilityCategory,
  });
  capabilityRegistry.register({
    id: controlCapabilityId,
    name: "Control music",
    description: "Controls music playback.",
    version: "1.1.1",
    category: capabilityCategory,
  });

  const bindingResolver = new CapabilityBindingResolver(capabilityRegistry, toolRegistry);
  bindingResolver.register({ capabilityId: statusCapabilityId, toolId: statusToolId });
  bindingResolver.register({ capabilityId: controlCapabilityId, toolId: controlToolId });

  const approvalService = new ApprovalService();
  const sandboxPolicy = new SandboxPolicyEvaluator([
    {
      id: statusSandboxProfileId,
      version: "1.1.1",
      rules: [{ kind: "desktop", allowedTargets: [musicScope.target] }],
    },
    {
      id: controlSandboxProfileId,
      version: "1.1.1",
      rules: [{ kind: "desktop", allowedTargets: [musicScope.target] }],
    },
  ]);
  const approvalRequirementResolver = createApprovalRequirementResolver(
    [
      { capabilityId: statusCapabilityId, requirement: "none" },
      { capabilityId: controlCapabilityId, requirement: "required" },
    ],
    {
      permissionPolicyResolver: new PermissionProfilePolicyResolver(),
      permissionProfile: () => activeProfile,
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
    getPermissionProfile: () => activeProfile,
    routes: [
      {
        toolId: statusToolId,
        capabilityId: statusCapabilityId,
        sandboxProfileId: statusSandboxProfileId,
        requestedScope: musicScope,
        approvalSummary: "Read music status",
        approvalReason: "Worker status access requires the canonical policy path.",
        approvalTtlMs,
      },
      {
        toolId: controlToolId,
        capabilityId: controlCapabilityId,
        sandboxProfileId: controlSandboxProfileId,
        requestedScope: musicScope,
        approvalSummary: "Control music",
        approvalReason: "Worker control access requires approval.",
        approvalTtlMs,
      },
    ],
  });

  const checkpointStore = new InMemoryCheckpointStore();
  const checkpointManager = new CheckpointManager({ store: checkpointStore });
  const actualProvider = provider ?? createProvider(async () => ({
    message: { role: "assistant", content: '{"ok":true}' },
  }));
  const harness = new FireflyHarness({
    provider: actualProvider,
    toolRegistry,
    eventBus,
    executionEngine: engine,
    authorizationAdapter: adapter,
    checkpointManager,
    config: { maxRounds: 4, totalTimeoutMs: 1_000 },
  });

  const subAgentRegistry = new SubAgentRegistry();
  subAgentRegistry.register(DEFAULT_MUSIC_STATUS_SUBAGENT_DESCRIPTOR);
  const taskService = new SubAgentTaskService({
    registry: subAgentRegistry,
    createTaskId: () => createSubAgentTaskId(`worker-task-${++taskSequence}`),
  });
  const runtime = new SubAgentWorkerRuntime({
    registry: subAgentRegistry,
    taskService,
    bindingResolver,
    agentCore: harness,
    eventBus,
  });

  function createTask(extra = {}) {
    return taskService.createTask({
      subAgentId: DEFAULT_MUSIC_STATUS_SUBAGENT_DESCRIPTOR.id,
      requester: { type: "main-agent", id: "firefly-main" },
      objective: "读取当前音乐状态并返回结构化结果。",
      input: { request: "status" },
      constraints: {
        maxSteps: 4,
        maxToolCalls: 3,
        timeoutMs: 1_000,
        maxDepth: 0,
        ...constraints,
        ...(extra.constraints ?? {}),
      },
      depth: 0,
      ...extra,
      constraints: {
        maxSteps: 4,
        maxToolCalls: 3,
        timeoutMs: 1_000,
        maxDepth: 0,
        ...constraints,
        ...(extra.constraints ?? {}),
      },
    });
  }

  return {
    adapter,
    approvalService,
    bridge,
    checkpointManager,
    engine,
    eventBus,
    harness,
    runtime,
    state,
    taskService,
    createTask,
    setProfile: (value) => {
      activeProfile = value;
    },
  };
}

function toolCall(id, name) {
  return { id, name, arguments: {} };
}

test("worker success uses the canonical Harness and authorized status path", async () => {
  const fixture = createFixture();
  let providerCalls = 0;
  const provider = createProvider(async (request) => {
    providerCalls++;
    fixture.state.requests.push(request);
    if (providerCalls === 1) {
      return {
        message: {
          role: "assistant",
          content: "",
          toolCalls: [toolCall("status-call", statusToolId)],
        },
      };
    }
    return { message: { role: "assistant", content: '{"status":"playing"}' } };
  });
  fixture.harness.setProvider(provider);
  const events = [];
  fixture.eventBus.onAny((event) => events.push(event));
  const task = fixture.createTask();

  const record = await fixture.runtime.execute(task.task.taskId);

  assert.equal(record.state, "succeeded");
  assert.deepEqual(record.result, { ok: true, output: { status: "playing" } });
  assert.equal(providerCalls, 2);
  assert.deepEqual(
    fixture.state.requests[0].tools.map((entry) => entry.function.name),
    [statusToolId],
  );
  assert.equal(fixture.state.statusExecutions, 1);
  assert.equal(fixture.state.controlExecutions, 0);
  assert.equal(fixture.state.engineCalls.length, 1);
  assert.deepEqual(fixture.state.engineCalls[0].context.upstreamAuthorization.requester, {
    type: "subagent",
    id: `subagent:${task.task.taskId}`,
    subAgentId: DEFAULT_MUSIC_STATUS_SUBAGENT_DESCRIPTOR.id,
    taskId: task.task.taskId,
  });
  assert.equal(fixture.harness.getEventBus(), fixture.eventBus);
  assert.equal(fixture.harness.getExecutionEngine(), fixture.engine);
  const systemPrompt = fixture.state.requests[0].messages[0].content;
  assert.ok(systemPrompt.includes("delegated functional worker"));
  assert.ok(systemPrompt.includes("task_input"));
  assert.equal(systemPrompt.includes("流萤"), false);
  assert.equal(fixture.state.requests[0].messages.length, 2);
  assert.equal(
    await fixture.checkpointManager.getLatestForRun(`subagent-run:${record.task.taskId}`),
    undefined,
  );
  assert.equal(events.filter((event) => event.type === "subagent:started").length, 1);
  assert.equal(events.filter((event) => event.type === "subagent:completed").length, 1);
  assert.equal(events.filter((event) => event.type === "subagent:failed").length, 0);
  assert.equal(events.filter((event) => event.type === "subagent:cancelled").length, 0);
});

test("worker tool surface rejects an undeclared call before adapter or engine execution", async () => {
  const fixture = createFixture();
  let providerCalls = 0;
  const provider = createProvider(async (request) => {
    providerCalls++;
    fixture.state.requests.push(request);
    if (providerCalls === 1) {
      return {
        message: {
          role: "assistant",
          content: "",
          toolCalls: [toolCall("control-call", controlToolId)],
        },
      };
    }
    return { message: { role: "assistant", content: '{"rejected":true}' } };
  });
  fixture.harness.setProvider(provider);

  const record = await fixture.runtime.execute(fixture.createTask().task.taskId);

  assert.equal(record.state, "succeeded");
  assert.equal(fixture.state.controlExecutions, 0);
  assert.equal(fixture.state.engineCalls.length, 0);
  assert.ok(fixture.state.requests[1].messages.at(-1).content.includes("worker_capability_not_declared"));
});

test("worker rejects an arbitrary undeclared tool without a legacy execution fallback", async () => {
  const fixture = createFixture();
  let providerCalls = 0;
  const provider = createProvider(async (request) => {
    providerCalls++;
    fixture.state.requests.push(request);
    if (providerCalls === 1) {
      return {
        message: {
          role: "assistant",
          content: "",
          toolCalls: [toolCall("arbitrary-call", "arbitrary_tool")],
        },
      };
    }
    return { message: { role: "assistant", content: '{"rejected":"arbitrary"}' } };
  });
  fixture.harness.setProvider(provider);

  const record = await fixture.runtime.execute(fixture.createTask().task.taskId);

  assert.equal(record.state, "succeeded");
  assert.equal(fixture.state.engineCalls.length, 0);
  assert.ok(fixture.state.requests[1].messages.at(-1).content.includes("worker_capability_not_declared"));
});

test("worker approval uses the same approval lifecycle and preserves subagent requester identity", async () => {
  const fixture = createFixture({ profile: "ASK_EVERY_TIME" });
  let providerCalls = 0;
  const provider = createProvider(async (request) => {
    providerCalls++;
    fixture.state.requests.push(request);
    if (providerCalls === 1) {
      return {
        message: {
          role: "assistant",
          content: "",
          toolCalls: [toolCall("status-approval-call", statusToolId)],
        },
      };
    }
    return { message: { role: "assistant", content: '{"approved":true}' } };
  });
  fixture.harness.setProvider(provider);
  const task = fixture.createTask();
  const run = fixture.runtime.execute(task.task.taskId);
  const approval = await waitFor(() => fixture.approvalService.listPending()[0]);

  assert.equal(approval.request.requester.type, "subagent");
  assert.equal(approval.request.requester.taskId, task.task.taskId);
  assert.equal(approval.request.requester.subAgentId, DEFAULT_MUSIC_STATUS_SUBAGENT_DESCRIPTOR.id);
  fixture.approvalService.approve(approval.request.approvalRequestId);

  const record = await run;
  assert.equal(record.state, "succeeded");
  assert.equal(fixture.state.statusExecutions, 1);
  assert.equal(providerCalls, 2);
  assert.equal(fixture.approvalService.listPending().length, 0);
});

test("worker approval denial produces a typed observation and zero tool execution", async () => {
  const fixture = createFixture({ profile: "ASK_EVERY_TIME" });
  let providerCalls = 0;
  const provider = createProvider(async (request) => {
    providerCalls++;
    fixture.state.requests.push(request);
    if (providerCalls === 1) {
      return {
        message: {
          role: "assistant",
          content: "",
          toolCalls: [toolCall("status-deny-call", statusToolId)],
        },
      };
    }
    return { message: { role: "assistant", content: '{"denied":true}' } };
  });
  fixture.harness.setProvider(provider);
  const run = fixture.runtime.execute(fixture.createTask().task.taskId);
  const approval = await waitFor(() => fixture.approvalService.listPending()[0]);
  fixture.approvalService.deny(approval.request.approvalRequestId);

  const record = await run;
  assert.equal(record.state, "succeeded");
  assert.equal(fixture.state.statusExecutions, 0);
  assert.equal(fixture.state.engineCalls.length, 0);
  assert.ok(fixture.state.requests[1].messages.at(-1).content.includes("APPROVAL_DENIED"));
});

test("worker approval expiry produces a typed observation and zero tool execution", async () => {
  const fixture = createFixture({ profile: "ASK_EVERY_TIME", approvalTtlMs: 100 });
  let providerCalls = 0;
  const provider = createProvider(async (request) => {
    providerCalls++;
    fixture.state.requests.push(request);
    if (providerCalls === 1) {
      return {
        message: {
          role: "assistant",
          content: "",
          toolCalls: [toolCall("status-expire-call", statusToolId)],
        },
      };
    }
    return { message: { role: "assistant", content: '{"expired":true}' } };
  });
  fixture.harness.setProvider(provider);
  const run = fixture.runtime.execute(fixture.createTask().task.taskId);
  const approval = await waitFor(() => fixture.approvalService.listPending()[0]);
  await delay(130);
  fixture.approvalService.listPending();

  const record = await run;
  assert.equal(record.state, "succeeded");
  assert.equal(fixture.state.statusExecutions, 0);
  assert.equal(fixture.state.engineCalls.length, 0);
  assert.equal(fixture.approvalService.get(approval.request.approvalRequestId).state, "expired");
  assert.ok(fixture.state.requests[1].messages.at(-1).content.includes("APPROVAL_EXPIRED"));
});

test("worker same-round approval barrier defers later calls", async () => {
  const fixture = createFixture({ profile: "ASK_EVERY_TIME" });
  let providerCalls = 0;
  const provider = createProvider(async (request) => {
    providerCalls++;
    fixture.state.requests.push(request);
    if (providerCalls === 1) {
      return {
        message: {
          role: "assistant",
          content: "",
          toolCalls: [
            toolCall("status-barrier-1", statusToolId),
            toolCall("status-barrier-2", statusToolId),
          ],
        },
      };
    }
    return { message: { role: "assistant", content: '{"barrier":"ok"}' } };
  });
  fixture.harness.setProvider(provider);
  const run = fixture.runtime.execute(fixture.createTask().task.taskId);
  const approval = await waitFor(() => fixture.approvalService.listPending()[0]);
  fixture.approvalService.approve(approval.request.approvalRequestId);

  const record = await run;
  assert.equal(record.state, "succeeded");
  assert.equal(fixture.state.statusExecutions, 1);
  assert.equal(fixture.state.engineCalls.length, 1);
  assert.ok(fixture.state.requests[1].messages.at(-1).content.includes("deferred_after_approval"));
});

test("worker cancellation reaches the task lifecycle and emits one terminal cancellation event", async () => {
  const fixture = createFixture();
  const provider = createProvider(async (_request, signal) => {
    await new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("provider aborted"));
        return;
      }
      signal?.addEventListener("abort", () => reject(new Error("provider aborted")), { once: true });
      void resolve;
    });
  });
  fixture.harness.setProvider(provider);
  const events = [];
  fixture.eventBus.onAny((event) => events.push(event));
  const task = fixture.createTask();
  const run = fixture.runtime.execute(task.task.taskId);
  await waitFor(() => fixture.taskService.get(task.task.taskId)?.state, (state) => state === "running");

  assert.equal(fixture.runtime.cancel(task.task.taskId), true);
  const record = await run;
  assert.equal(record.state, "cancelled");
  assert.equal(events.filter((event) => event.type === "subagent:cancelled").length, 1);
  assert.equal(events.filter((event) => event.type === "subagent:completed").length, 0);
  assert.equal(events.filter((event) => event.type === "subagent:failed").length, 0);
  assert.equal(fixture.runtime.cancel(task.task.taskId), false);
  assert.throws(
    () => fixture.taskService.start(task.task.taskId),
    (error) => error.code === "TASK_ALREADY_TERMINAL",
  );
});

test("worker cancellation before start transitions PENDING directly to CANCELLED", async () => {
  const fixture = createFixture();
  const task = fixture.createTask();
  const controller = new AbortController();
  controller.abort();

  const record = await fixture.runtime.execute(task.task.taskId, controller.signal);

  assert.equal(record.state, "cancelled");
  assert.equal(fixture.state.engineCalls.length, 0);
});

test("worker cancellation during approval cancels the shared ApprovalService request", async () => {
  const fixture = createFixture({ profile: "ASK_EVERY_TIME" });
  const provider = createProvider(async (request) => {
    fixture.state.requests.push(request);
    return {
      message: {
        role: "assistant",
        content: "",
        toolCalls: [toolCall("status-cancel-approval", statusToolId)],
      },
    };
  });
  fixture.harness.setProvider(provider);
  const task = fixture.createTask();
  const run = fixture.runtime.execute(task.task.taskId);
  const approval = await waitFor(() => fixture.approvalService.listPending()[0]);

  assert.equal(fixture.runtime.cancel(task.task.taskId), true);
  const record = await run;
  assert.equal(record.state, "cancelled");
  assert.equal(fixture.approvalService.get(approval.request.approvalRequestId).state, "cancelled");
  assert.equal(fixture.state.statusExecutions, 0);
  assert.equal(fixture.state.engineCalls.length, 0);
});

test("approval and cancellation race cannot execute the worker tool twice", async () => {
  const fixture = createFixture({ profile: "ASK_EVERY_TIME" });
  const provider = createProvider(async (request) => {
    fixture.state.requests.push(request);
    return {
      message: {
        role: "assistant",
        content: "",
        toolCalls: [toolCall("status-race-call", statusToolId)],
      },
    };
  });
  fixture.harness.setProvider(provider);
  const task = fixture.createTask();
  const run = fixture.runtime.execute(task.task.taskId);
  const approval = await waitFor(() => fixture.approvalService.listPending()[0]);
  fixture.runtime.cancel(task.task.taskId);
  assert.throws(
    () => fixture.approvalService.approve(approval.request.approvalRequestId),
    (error) => error.code === "APPROVAL_ALREADY_RESOLVED",
  );

  const record = await run;
  assert.equal(record.state, "cancelled");
  assert.equal(fixture.state.statusExecutions, 0);
  assert.equal(fixture.state.engineCalls.length, 0);
});

test("worker timeout is reported as a structured failure and never becomes success", async () => {
  const fixture = createFixture();
  const provider = createProvider(async () => {
    await delay(60);
    return { message: { role: "assistant", content: '{"late":true}' } };
  });
  fixture.harness.setProvider(provider);
  const task = fixture.createTask({ constraints: { timeoutMs: 20 } });

  const record = await fixture.runtime.execute(task.task.taskId);

  assert.equal(record.state, "failed");
  assert.equal(record.result.ok, false);
  assert.equal(record.result.error.code, "TIMEOUT");
});

test("worker tool budget is forwarded to the canonical execution engine", async () => {
  const fixture = createFixture();
  let providerCalls = 0;
  const provider = createProvider(async (request) => {
    providerCalls++;
    fixture.state.requests.push(request);
    if (providerCalls === 1) {
      return {
        message: {
          role: "assistant",
          content: "",
          toolCalls: [
            toolCall("status-budget-1", statusToolId),
            toolCall("status-budget-2", statusToolId),
          ],
        },
      };
    }
    return { message: { role: "assistant", content: '{"budget":"bounded"}' } };
  });
  fixture.harness.setProvider(provider);
  const task = fixture.createTask({ constraints: { maxToolCalls: 1 } });

  const record = await fixture.runtime.execute(task.task.taskId);

  assert.equal(record.state, "succeeded");
  assert.equal(fixture.state.engineCalls.length, 2);
  assert.equal(fixture.state.statusExecutions, 1);
  assert.ok(fixture.state.requests[1].messages.at(-1).content.includes("budget_exceeded"));
});

test("worker step budget stops the canonical loop at the task limit", async () => {
  const fixture = createFixture();
  let providerCalls = 0;
  const provider = createProvider(async (request) => {
    providerCalls++;
    fixture.state.requests.push(request);
    return {
      message: {
        role: "assistant",
        content: "",
        toolCalls: [toolCall("status-step-limit", statusToolId)],
      },
    };
  });
  fixture.harness.setProvider(provider);
  const task = fixture.createTask({ constraints: { maxSteps: 1 } });

  const record = await fixture.runtime.execute(task.task.taskId);

  assert.equal(record.state, "succeeded");
  assert.equal(providerCalls, 1);
  assert.equal(fixture.state.statusExecutions, 1);
});

test("nested worker tasks are rejected before the canonical loop starts", async () => {
  const fixture = createFixture();
  const parent = fixture.createTask({
    parentRunId: "parent-run",
    constraints: { maxDepth: 1 },
  });
  const child = fixture.taskService.createTask({
    subAgentId: DEFAULT_MUSIC_STATUS_SUBAGENT_DESCRIPTOR.id,
    requester: {
      type: "subagent",
      id: `subagent:${parent.task.taskId}`,
      subAgentId: DEFAULT_MUSIC_STATUS_SUBAGENT_DESCRIPTOR.id,
      taskId: parent.task.taskId,
      parentRunId: "parent-run",
    },
    objective: "nested worker",
    input: { request: "status" },
    constraints: { maxSteps: 2, maxToolCalls: 1, timeoutMs: 500, maxDepth: 1 },
    depth: 1,
    parentRunId: "parent-run",
    parentTaskId: parent.task.taskId,
  });

  await assert.rejects(
    () => fixture.runtime.execute(child.task.taskId),
    (error) => error.code === "INVALID_DELEGATION_DEPTH",
  );
  assert.equal(fixture.taskService.get(child.task.taskId).state, "pending");
});

test("worker runtime is an orchestration owner and does not create duplicate execution owners", () => {
  const runtimePath = path.join(
    projectRoot,
    "src",
    "main",
    "runtime",
    "subagents",
    "subagent-worker-runtime.ts",
  );
  const source = fs.readFileSync(runtimePath, "utf8");
  for (const forbidden of [
    "new ToolExecutionEngine",
    "new CapabilityAuthorizationPipeline",
    "new ApprovalService",
    "new AgentEventBus",
    "new FireflyHarness",
    "new FireflyToolRegistry",
    "MemorySlot",
    "RagSlot",
    "CharacterStateSlot",
  ]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} must remain outside worker orchestration`);
  }
  assert.ok(source.includes("this.options.agentCore.run"));
  assert.ok(source.includes("WorkerExecutionProfile"));
  assert.equal(source.includes("new SubAgentRegistry"), false);
});
