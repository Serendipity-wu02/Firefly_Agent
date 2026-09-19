import test from "node:test";
import assert from "node:assert/strict";

import { BoundedPlanner } from "../../../dist/main/main/orchestrator/planning/bounded-planner.js";
import { StepVerifier } from "../../../dist/main/main/orchestrator/planning/step-verifier.js";
import {
  validatePlanStatusTransition,
  validateStepStatusTransition,
  formatPlanContext,
} from "../../../dist/main/main/orchestrator/planning/plan-lifecycle.js";
import { PlanSlot } from "../../../dist/main/main/orchestrator/context/context-slots.js";
import { TokenMeter } from "../../../dist/main/main/orchestrator/context/token-meter.js";
import { FireflyToolRegistry } from "../../../dist/main/main/orchestrator/tools/registry/tool-registry.js";
import { AgentEventBus } from "../../../dist/main/main/orchestrator/agent-events.js";
import { FireflyAgentCore } from "../../../dist/main/main/orchestrator/firefly-agent-core.js";
import { InMemoryCheckpointStore } from "../../../dist/main/main/orchestrator/recovery/checkpoint-store.js";
import { CheckpointManager } from "../../../dist/main/main/orchestrator/recovery/checkpoint-manager.js";
import type {
  AgentEvent,
  AgentRequiredToolExecution,
  AgentToolCallEvidence,
} from "../../../dist/main/shared/agent-types.js";
import type { IFireflyLlmProvider } from "../../../dist/main/shared/provider-types.js";
import type { ChatMessage } from "../../../dist/main/shared/chat-types.js";
import type { RunExecutionState } from "../../../dist/main/main/orchestrator/recovery/execution-state.js";
import type { Checkpoint } from "../../../dist/main/main/orchestrator/recovery/checkpoint-types.js";
import type { PlanStep } from "../../../src/main/orchestrator/planning/plan-types.ts";

const testProviderMetadata = {
  id: "planning-test-provider",
  name: "Planning Test Provider",
  capabilities: { supportsNativeToolCalling: true, supportsStreaming: false },
};

function createToolBinding(
  toolName: string,
  args: Record<string, unknown> = {},
  argumentMatching: AgentRequiredToolExecution["argumentMatching"] = "exact",
): AgentRequiredToolExecution {
  return {
    toolName,
    arguments: args,
    ...(argumentMatching === undefined ? {} : { argumentMatching }),
    successContract: "json_ok_true",
    correction: "once",
  };
}

test("1. Direct Mode: Simple question does NOT trigger plan mode", async () => {
  const planner = new BoundedPlanner();
  assert.equal(planner.shouldPlan("今天天气怎么样？", 0), false);
  assert.equal(planner.shouldPlan("你好流萤", 0), false);

  const registry = new FireflyToolRegistry();
  const mockProvider: IFireflyLlmProvider = { ...testProviderMetadata,
    async generateCompletion() {
      return {
        message: {
          role: "assistant",
          content: "开拓者，今天天气很不错哦！",
        },
      };
    },
  };

  const eventBus = new AgentEventBus();
  const planEvents: AgentEvent[] = [];
  eventBus.on("plan:created", (e) => planEvents.push(e));

  const core = new FireflyAgentCore({
    provider: mockProvider,
    toolRegistry: registry,
    eventBus,
    planner,
  });

  const res = await core.run({ userPrompt: "今天天气怎么样？" });
  assert.equal(res.status, "completed");
  assert.equal(res.finalText, "开拓者，今天天气很不错哦！");
  assert.equal(planEvents.length, 0, "Direct mode must NOT emit plan events");
});

test("2. Plan Mode: Composite multi-step task triggers bounded planning", async () => {
  const planner = new BoundedPlanner();
  assert.equal(planner.shouldPlan("第一步搜索音乐，然后播放第二首歌曲", 2), true);

  const plan = planner.createPlan("run-p2", "第一步搜索音乐，然后播放第二首歌曲");
  assert.ok(plan);
  assert.equal(plan.status, "running");
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.currentStepIndex, 0);
});

test("3. Max Steps: Plan steps are strictly capped at maxSteps limit", () => {
  const planner = new BoundedPlanner({ maxSteps: 3 });
  const rawSteps = ["步骤1", "步骤2", "步骤3", "步骤4", "步骤5", "步骤6"];
  const plan = planner.createPlan("run-p3", "多步骤超限任务", rawSteps);

  assert.equal(plan.steps.length, 3, "Plan steps must be capped at maxSteps (3)");
});

test("4. Step Lifecycle: Valid status transitions", () => {
  assert.equal(validatePlanStatusTransition("draft", "ready"), true);
  assert.equal(validatePlanStatusTransition("ready", "running"), true);
  assert.equal(validatePlanStatusTransition("running", "completed"), true);
  assert.equal(validatePlanStatusTransition("completed", "running"), false);

  assert.equal(validateStepStatusTransition("pending", "running"), true);
  assert.equal(validateStepStatusTransition("running", "completed"), true);
  assert.equal(validateStepStatusTransition("completed", "pending"), false);
});

test("5. Step Dependency: Sequential dependency indices assigned correctly", () => {
  const planner = new BoundedPlanner();
  const plan = planner.createPlan("run-p5", "任务", ["动作A", "动作B", "动作C"]);

  assert.equal(plan.steps[0].dependsOn, undefined);
  assert.deepEqual(plan.steps[1].dependsOn, [0]);
  assert.deepEqual(plan.steps[2].dependsOn, [1]);
});

test("6. Step Verification Success: Valid observation advances step", () => {
  const planner = new BoundedPlanner();
  const plan = planner.createPlan("run-p6", "测试任务", [
    { description: "第1步", completionRequirement: "analysis" },
    { description: "第2步", completionRequirement: "analysis" },
  ]);

  const analysisContext = { currentToolEvidence: [] };
  const res1 = planner.advanceStep(plan, "已成功获取城市天气数据: 晴朗 22℃", false, analysisContext);
  assert.equal(res1.action, "next");
  assert.equal(res1.verification.status, "success");
  assert.equal(plan.currentStepIndex, 1);
  assert.equal(plan.steps[0].status, "completed");

  const res2 = planner.advanceStep(plan, "已成功完成全部汇报", false, analysisContext);
  assert.equal(res2.action, "complete");
  assert.equal(plan.status, "completed");
});

test("7. Step Verification Failure: Error observation marks failure", () => {
  const planner = new BoundedPlanner();
  const plan = planner.createPlan("run-p7", "失败任务", [
    { description: "第1步", completionRequirement: "analysis" },
    { description: "第2步", completionRequirement: "analysis" },
  ]);

  const res = planner.advanceStep(
    plan,
    '{"ok":false,"error":"sensor_offline"}',
    false,
    { currentToolEvidence: [] },
  );
  assert.equal(res.action, "fail");
  assert.equal(res.verification.status, "failure");
  assert.equal(plan.status, "failed");
});

test("8. Step Verification Uncertain: Empty observation triggers retry", () => {
  const verifier = new StepVerifier();
  const result = verifier.verifyStep(
    {
      stepId: "s1",
      index: 0,
      description: "test",
      completionRequirement: "analysis",
      status: "running",
    },
    "",
    false,
    { currentToolEvidence: [] },
  );
  assert.equal(result.status, "uncertain");
});

test("9. Plan Failure Budget: Bounded planner configuration verification", () => {
  const planner = new BoundedPlanner({ maxSteps: 4, maxPlanFailures: 2 });
  const cfg = planner.getConfig();
  assert.equal(cfg.maxSteps, 4);
  assert.equal(cfg.maxPlanFailures, 2);
});

test("10. Plan Cancellation: User cancellation marks plan cancelled and emits event", async () => {
  const eventBus = new AgentEventBus();
  const cancelledEvents: AgentEvent[] = [];
  eventBus.on("plan:cancelled", (e) => cancelledEvents.push(e));

  const registry = new FireflyToolRegistry();
  const mockProvider: IFireflyLlmProvider = { ...testProviderMetadata,
    async generateCompletion(_req, signal) {
      assert.ok(signal);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 500);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("aborted"));
        });
      });
      return { message: { role: "assistant", content: "ok" } };
    },
  };

  const core = new FireflyAgentCore({
    provider: mockProvider,
    toolRegistry: registry,
    eventBus,
  });

  const runPromise = core.run({
    userPrompt: "第一步搜索，然后处理",
    planExecutionMode: "required",
    customSteps: [{ description: "等待外部操作完成", completionRequirement: "analysis" }],
  });

  setTimeout(() => core.cancelAll(), 20);

  const res = await runPromise;
  assert.equal(res.status, "cancelled");
  assert.equal(cancelledEvents.length, 1);
});

test("11. Plan Timeout: Total timeout safely terminates plan", async () => {
  const registry = new FireflyToolRegistry();
  const mockProvider: IFireflyLlmProvider = { ...testProviderMetadata,
    async generateCompletion(_req, signal) {
      assert.ok(signal);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 1000);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("aborted"));
        });
      });
      return { message: { role: "assistant", content: "ok" } };
    },
  };

  const core = new FireflyAgentCore({
    provider: mockProvider,
    toolRegistry: registry,
    config: { totalTimeoutMs: 50 },
  });

  const res = await core.run({
    userPrompt: "第一步耗时操作，然后完成",
    planExecutionMode: "required",
    customSteps: [{ description: "等待耗时操作完成", completionRequirement: "analysis" }],
  });

  assert.equal(res.status, "timeout");
});

test("12. Tool Execution Integration: Multi-step plan executes tools through ToolExecutionEngine", async () => {
  const registry = new FireflyToolRegistry();
  let step1Called = false;
  let step2Called = false;

  registry.register({
    id: "tool_step1",
    name: "tool_step1",
    description: "step 1",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => {
      step1Called = true;
      return JSON.stringify({ ok: true, step: 1, data: "step 1 data" });
    },
  });

  registry.register({
    id: "tool_step2",
    name: "tool_step2",
    description: "step 2",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => {
      step2Called = true;
      return JSON.stringify({ ok: true, step: 2, data: "step 2 done" });
    },
  });

  let turn = 0;
  const mockProvider: IFireflyLlmProvider = { ...testProviderMetadata,
    async generateCompletion() {
      turn++;
      if (turn === 1) {
        return {
          message: {
            role: "assistant",
            content: "正在执行第一步",
            toolCalls: [{ id: "c1", name: "tool_step1", arguments: {} }],
          },
        };
      } else if (turn === 2) {
        return {
          message: {
            role: "assistant",
            content: "正在执行第二步",
            toolCalls: [{ id: "c2", name: "tool_step2", arguments: {} }],
          },
        };
      }
      return {
        message: {
          role: "assistant",
          content: "两步计划均已圆满完成！",
        },
      };
    },
  };

  const eventBus = new AgentEventBus();
  const planCompletedEvents: AgentEvent[] = [];
  eventBus.on("plan:completed", (e) => planCompletedEvents.push(e));

  const core = new FireflyAgentCore({
    provider: mockProvider,
    toolRegistry: registry,
    eventBus,
  });

  const res = await core.run({
    userPrompt: "第一步获取数据，然后执行处理",
    planExecutionMode: "required",
    customSteps: [
      {
        description: "第一步获取数据",
        completionRequirement: "tool",
        toolBinding: createToolBinding("tool_step1"),
      },
      {
        description: "第二步执行处理",
        completionRequirement: "tool",
        toolBinding: createToolBinding("tool_step2"),
      },
    ],
  });

  assert.equal(res.status, "completed");
  assert.equal(step1Called, true);
  assert.equal(step2Called, true);
  assert.equal(res.finalText, "两步计划均已圆满完成！");
  assert.equal(planCompletedEvents.length, 1);
});

test("13. Context Integration: PlanSlot formats markdown plan into context", () => {
  const planner = new BoundedPlanner();
  const plan = planner.createPlan("run-p13", "多步骤目标", ["第1步", "第2步"]);
  plan.steps[0].observation = "第1步数据正常";

  const formatted = formatPlanContext(plan);
  assert.ok(formatted.includes("目标 (Goal): 多步骤目标"));
  assert.ok(formatted.includes("[► 进行中] 第1步"));
  assert.ok(formatted.includes("第1步数据正常"));

  const planSlot = new PlanSlot();
  const meter = new TokenMeter();
  const rendered = planSlot.render({ planContext: formatted });
  assert.ok(rendered.includes("【当前任务执行计划】"));
  assert.ok(planSlot.estimateTokens({ planContext: formatted }, meter) > 0);
});

test("14. Checkpoint Integration: Plan state serialized into checkpoint safely", async () => {
  const store = new InMemoryCheckpointStore();
  const manager = new CheckpointManager({ store });

  const planner = new BoundedPlanner();
  const plan = planner.createPlan("run-p14", "快照测试目标", ["步骤A", "步骤B"]);

  const state: RunExecutionState = {
    runId: "run-p14",
    sessionId: "sess-p14",
    step: 1,
    runState: "running",
    stepState: "running",
    activeToolCalls: [],
    recoveryAttempts: 0,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    plan,
  };

  const cp = await manager.createCheckpoint(state, [{ id: "1", role: "user", content: "test" }], "step_start");
  assert.ok(cp);
  assert.ok(cp.plan);
  assert.equal(cp.plan.planId, plan.planId);
  assert.equal(cp.plan.steps.length, 2);
});

test("15. Resume V1: Legacy plan checkpoint is diagnostic-only", async () => {
  const store = new InMemoryCheckpointStore();
  const manager = new CheckpointManager({ store });

  const planner = new BoundedPlanner();
  const plan = planner.createPlan("run-p15", "恢复目标", ["步骤1", "步骤2"]);
  plan.currentStepIndex = 1;
  plan.steps[0].status = "completed";
  plan.steps[1].status = "running";

  const checkpoint: Checkpoint = {
    checkpointId: "cp-resume-plan-1",
    runId: "run-p15",
    sessionId: "sess-p15",
    step: 2,
    runState: "running",
    stepState: "running",
    messages: [{ id: "m1", role: "user", content: "恢复目标" }],
    activeToolCalls: [],
    recoveryAttempts: 0,
    createdAt: Date.now(),
    version: 1,
    trigger: "step_start",
    plan,
  };

  await store.save(checkpoint);

  let providerCalls = 0;
  const mockProvider: IFireflyLlmProvider = { ...testProviderMetadata,
    async generateCompletion() {
      providerCalls += 1;
      return {
        message: { role: "assistant", content: "已成功恢复并完成第二步！" },
      };
    },
  };

  const registry = new FireflyToolRegistry();
  const core = new FireflyAgentCore({
    provider: mockProvider,
    toolRegistry: registry,
    checkpointManager: manager,
  });

  const res = await core.resume("cp-resume-plan-1");
  if (!("kind" in res) || res.kind !== "resume_rejected") {
    throw new Error("Resume result must be structured rejection");
  }
  assert.equal(res.kind, "resume_rejected");
  assert.equal(res.rejection.code, "checkpoint_facts_missing");
  assert.equal(res.status, "error");
  assert.equal(res.finalText, "");
  assert.equal(providerCalls, 0);
});

test("16. Resume V1: Interrupted tool checkpoint is rejected without synthetic execution", async () => {
  const store = new InMemoryCheckpointStore();
  const manager = new CheckpointManager({ store });

  const checkpoint: Checkpoint = {
    checkpointId: "cp-resume-safe-1",
    runId: "run-p16",
    sessionId: "sess-p16",
    step: 2,
    runState: "running",
    stepState: "waiting_tool",
    messages: [
      { id: "m1", role: "user", content: "第一步" },
      { id: "m2", role: "assistant", content: "", toolCalls: [{ id: "tc_crash", name: "tool_action", arguments: {} }] },
    ],
    activeToolCalls: [
      {
        toolCallId: "tc_crash",
        name: "tool_action",
        arguments: {},
        status: "running",
        sideEffectState: "started",
      },
    ],
    recoveryAttempts: 0,
    createdAt: Date.now(),
    version: 1,
    trigger: "step_start",
  };

  await store.save(checkpoint);

  let providerCalls = 0;
  const mockProvider: IFireflyLlmProvider = { ...testProviderMetadata,
    async generateCompletion() {
      providerCalls += 1;
      return {
        message: { role: "assistant", content: "感知到前序工具中断，已做安全恢复处理。" },
      };
    },
  };

  const registry = new FireflyToolRegistry();
  const core = new FireflyAgentCore({
    provider: mockProvider,
    toolRegistry: registry,
    checkpointManager: manager,
  });

  const res = await core.resume("cp-resume-safe-1");
  if (!("kind" in res) || res.kind !== "resume_rejected") {
    throw new Error("Resume result must be structured rejection");
  }
  assert.equal(res.kind, "resume_rejected");
  assert.equal(res.rejection.code, "checkpoint_facts_missing");
  assert.equal(providerCalls, 0);
});

test("17. Plan Loop Termination Guarantee: Cannot loop forever", async () => {
  const registry = new FireflyToolRegistry();
  // Provider keeps returning repetitive tool call indefinitely
  const mockProvider: IFireflyLlmProvider = { ...testProviderMetadata,
    async generateCompletion() {
      return {
        message: {
          role: "assistant",
          content: "循环调用",
          toolCalls: [{ id: "tc_loop", name: "dummy_tool", arguments: {} }],
        },
      };
    },
  };

  registry.register({
    id: "dummy_tool",
    name: "dummy_tool",
    description: "dummy",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => JSON.stringify({ ok: true }),
  });

  const eventBus = new AgentEventBus();
  const events: AgentEvent[] = [];
  eventBus.onAny((event) => events.push(event));

  const core = new FireflyAgentCore({
    provider: mockProvider,
    toolRegistry: registry,
    eventBus,
    config: { maxRounds: 3 }, // Bounded rounds
  });

  const res = await core.run({
    userPrompt: "计划任务",
    planExecutionMode: "required",
    customSteps: [{
      description: "持续执行计划步骤",
      completionRequirement: "tool",
      toolBinding: createToolBinding("dummy_tool"),
    }],
  });

  assert.equal(res.status, "error");
  assert.deepEqual(res.terminationReason, {
    kind: "budget_exhausted",
    budget: "rounds",
  });
  assert.equal(res.finalText, "");
  assert.equal(res.roundsCount, 3);
  assert.equal(events.filter((event) => event.type === "agent:final-answer").length, 0);
  assert.equal(events.filter((event) => event.type === "agent:finished").length, 1);
  assert.equal(events.find((event) => event.type === "agent:finished")?.status, "error");
});

test("18. Final Answer Synthesis after Successful Plan", async () => {
  const registry = new FireflyToolRegistry();
  const mockProvider: IFireflyLlmProvider = { ...testProviderMetadata,
    async generateCompletion() {
      return {
        message: {
          role: "assistant",
          content: "开拓者，所有计划步骤均已完成，流萤已为您整理好最终结果！",
        },
      };
    },
  };

  const eventBus = new AgentEventBus();
  const finishedEvents: AgentEvent[] = [];
  const planCompletedEvents: AgentEvent[] = [];
  eventBus.on("agent:finished", (e) => finishedEvents.push(e));
  eventBus.on("plan:completed", (e) => planCompletedEvents.push(e));

  const core = new FireflyAgentCore({
    provider: mockProvider,
    toolRegistry: registry,
    eventBus,
  });

  const res = await core.run({
    userPrompt: "帮我制定计划并执行",
    planExecutionMode: "required",
    customSteps: [
      { description: "整理最终回答", completionRequirement: "analysis" },
    ],
  });

  assert.equal(res.status, "completed");
  assert.equal(res.finalText, "开拓者，所有计划步骤均已完成，流萤已为您整理好最终结果！");
  assert.equal(finishedEvents.length, 1);
  assert.equal(planCompletedEvents.length, 1);
});

function createStepEvidence(
  overrides: Partial<AgentToolCallEvidence> = {},
): AgentToolCallEvidence {
  return {
    runId: "run-step-evidence",
    step: 1,
    toolCallId: "step-tool-call",
    toolName: "step-tool",
    assistantMessageId: "assistant-step-1",
    toolMessageId: "tool-step-1",
    arguments: { requestUrl: "https://example.com/a" },
    outcome: "success",
    output: JSON.stringify({ ok: true, value: "observed" }),
    isError: false,
    ...overrides,
  };
}

test("19. Tool-step text alone remains unverified without current execution evidence", () => {
  const verifier = new StepVerifier();
  const result = verifier.verifyStep(
    {
      stepId: "tool-step",
      index: 0,
      description: "执行外部读取",
      completionRequirement: "tool",
      status: "running",
    },
    "已经成功读取页面。",
    false,
    { currentToolEvidence: [] },
  );

  assert.equal(result.status, "uncertain");
});

test("20. A failed current tool result cannot be overridden by assistant success text", () => {
  const verifier = new StepVerifier();
  const result = verifier.verifyStep(
    {
      stepId: "tool-failure-step",
      index: 0,
      description: "执行外部操作",
      completionRequirement: "tool",
      toolBinding: createToolBinding("step-tool", { requestUrl: "https://example.com/a" }, "normalized_url"),
      status: "running",
    },
    "操作已经成功完成。",
    false,
    {
      currentToolEvidence: [createStepEvidence({
        outcome: "failure",
        output: JSON.stringify({ ok: false, error: "tool_failed" }),
        isError: true,
      })],
    },
  );

  assert.equal(result.status, "failure");
});

test("21. Evidence from another step is not reused when the current step has none", () => {
  const verifier = new StepVerifier();
  const previousStepEvidence = createStepEvidence({ step: 1, output: JSON.stringify({ ok: true }) });
  assert.equal(previousStepEvidence.outcome, "success");

  const result = verifier.verifyStep(
    {
      stepId: "current-step",
      index: 1,
      description: "执行第二个外部读取",
      completionRequirement: "tool",
      toolBinding: createToolBinding("step-tool", { requestUrl: "https://example.com/a" }, "normalized_url"),
      status: "running",
    },
    "第二步已经完成。",
    false,
    {
      currentRunId: "run-current-step",
      currentToolEvidence: [previousStepEvidence],
    },
  );

  assert.equal(result.status, "uncertain");
});

test("22. A successful current tool result is valid step completion evidence", () => {
  const verifier = new StepVerifier();
  const result = verifier.verifyStep(
    {
      stepId: "tool-success-step",
      index: 0,
      description: "读取页面",
      completionRequirement: "tool",
      toolBinding: createToolBinding("step-tool", { requestUrl: "https://example.com/a" }, "normalized_url"),
      status: "running",
    },
    "读取完成。",
    false,
    {
      currentToolEvidence: [createStepEvidence()],
    },
  );

  assert.equal(result.status, "success");
});

test("22b. A successful different tool cannot satisfy a bound tool step", () => {
  const verifier = new StepVerifier();
  const result = verifier.verifyStep(
    {
      stepId: "bound-tool-step",
      index: 0,
      description: "读取页面",
      completionRequirement: "tool",
      toolBinding: {
        toolName: "browser_read",
        arguments: { requestUrl: "https://example.com/a" },
        argumentMatching: "normalized_url",
        successContract: "json_ok_true",
        correction: "once",
      },
      status: "running",
    } as PlanStep & { readonly toolBinding: Record<string, unknown> },
    "已经读取完成。",
    false,
    {
      currentToolEvidence: [createStepEvidence({
        toolName: "music_status",
        arguments: {},
      })],
    },
  );

  assert.equal(result.status, "failure");
  assert.match(result.reason ?? "", /does not match/u);
});

test("22c. A successful bound tool with different parameters cannot satisfy the step", () => {
  const verifier = new StepVerifier();
  const result = verifier.verifyStep(
    {
      stepId: "bound-parameter-step",
      index: 0,
      description: "读取指定页面",
      completionRequirement: "tool",
      toolBinding: createToolBinding(
        "browser_read",
        { requestUrl: "https://example.com/a" },
        "normalized_url",
      ),
      status: "running",
    },
    "已经读取完成。",
    false,
    {
      currentToolEvidence: [createStepEvidence({
        toolName: "browser_read",
        arguments: { requestUrl: "https://example.com/b" },
      })],
    },
  );

  assert.equal(result.status, "failure");
  assert.match(result.reason ?? "", /does not match/u);
});

test("22d. Command submission does not claim that player state changed", () => {
  const verifier = new StepVerifier();
  const result = verifier.verifyStep(
    {
      stepId: "music-command-step",
      index: 0,
      description: "提交下一首命令",
      completionRequirement: "tool",
      toolBinding: createToolBinding("music_control", { action: "next" }),
      status: "running",
    },
    "命令已提交。",
    false,
    {
      currentToolEvidence: [createStepEvidence({
        toolName: "music_control",
        arguments: { action: "next" },
        output: JSON.stringify({
          ok: true,
          commandSubmission: "accepted",
          playerStateObservation: "not_observed",
        }),
      })],
    },
  );

  assert.equal(result.status, "success");
  assert.match(result.reason ?? "", /state change is not proven/u);
});

test("22a. Unknown and not-executed tool outcomes cannot complete a step", () => {
  const verifier = new StepVerifier();
  for (const outcome of ["unknown", "not_executed"] as const) {
    const result = verifier.verifyStep(
      {
        stepId: `tool-${outcome}-step`,
        index: 0,
        description: "执行外部操作",
        completionRequirement: "tool",
        toolBinding: createToolBinding("step-tool", { requestUrl: "https://example.com/a" }, "normalized_url"),
        status: "running",
      },
      "操作已经完成。",
      false,
      {
        currentToolEvidence: [createStepEvidence({
          outcome,
          output: JSON.stringify({ ok: false, error: outcome }),
          isError: false,
        })],
      },
    );

    assert.equal(result.status, "uncertain");
  }
});

test("23. Pure analysis steps can complete from a non-empty answer", () => {
  const verifier = new StepVerifier();
  const result = verifier.verifyStep(
    {
      stepId: "analysis-step",
      index: 0,
      description: "整理观察结果",
      completionRequirement: "analysis",
      status: "running",
    },
    "整理后的结论如下。",
    false,
    { currentToolEvidence: [] },
  );

  assert.equal(result.status, "success");
});

test("24. A failed tool step cannot emit plan completion after a success-claiming final answer", async () => {
  const registry = new FireflyToolRegistry();
  registry.register({
    id: "failing-plan-tool",
    name: "Failing plan tool",
    description: "Fails the current plan step.",
    risk: "read_only",
    sideEffect: "read_only",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => JSON.stringify({ ok: false, error: "external_failed" }),
  });

  let providerCalls = 0;
  const provider: IFireflyLlmProvider = {
    ...testProviderMetadata,
    async generateCompletion() {
      providerCalls++;
      if (providerCalls === 1) {
        return {
          message: {
            role: "assistant",
            content: "正在执行外部读取。",
            toolCalls: [{ id: "failing-plan-call", name: "failing-plan-tool", arguments: {} }],
          },
        };
      }
      return { message: { role: "assistant", content: "外部读取已经成功完成。" } };
    },
  };

  const eventBus = new AgentEventBus();
  const events: AgentEvent[] = [];
  eventBus.onAny((event) => events.push(event));
  const core = new FireflyAgentCore({ provider, toolRegistry: registry, eventBus });

  const result = await core.run({
    userPrompt: "第一步读取外部数据，然后整理结果",
    planExecutionMode: "required",
    customSteps: [
      {
        description: "读取外部数据",
        completionRequirement: "tool",
        toolBinding: createToolBinding("failing-plan-tool"),
      },
      { description: "整理结果", completionRequirement: "analysis" },
    ],
  });

  assert.equal(result.status, "error");
  assert.equal(result.finalText, "");
  assert.deepEqual(result.terminationReason, {
    kind: "plan_incomplete",
    planId: result.terminationReason.kind === "plan_incomplete"
      ? result.terminationReason.planId
      : undefined,
    stepIndex: 0,
    reason: "step_failed",
  });
  assert.equal(providerCalls, 1);
  assert.equal(events.filter((event) => event.type === "plan:verification" && event.result === "failure").length, 1);
  assert.equal(events.filter((event) => event.type === "plan:step-completed").length, 0);
  assert.equal(events.filter((event) => event.type === "plan:completed").length, 0);
  assert.equal(events.filter((event) => event.type === "plan:step-failed").length, 1);
  assert.equal(events.filter((event) => event.type === "plan:failed").length, 1);
});

test("25. An explicitly tool-required step cannot complete from a zero-call success claim", async () => {
  const registry = new FireflyToolRegistry();
  registry.register({
    id: "required-plan-tool",
    name: "Required plan tool",
    description: "A no-call regression tool.",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => JSON.stringify({ ok: true }),
  });
  let providerCalls = 0;
  const provider: IFireflyLlmProvider = {
    ...testProviderMetadata,
    async generateCompletion() {
      providerCalls++;
      return { message: { role: "assistant", content: "外部操作已经成功完成。" } };
    },
  };

  const eventBus = new AgentEventBus();
  const events: AgentEvent[] = [];
  eventBus.onAny((event) => events.push(event));
  const core = new FireflyAgentCore({
    provider,
    toolRegistry: registry,
    eventBus,
    config: { maxRounds: 2 },
  });

  const input = {
    runId: "run-27",
    userPrompt: "执行外部读取",
    planExecutionMode: "required" as const,
    customSteps: [{
      description: "执行外部读取",
      completionRequirement: "tool" as const,
      toolBinding: createToolBinding("required-plan-tool"),
    }],
  };
  await core.run(input);

  assert.equal(providerCalls, 2);
  assert.equal(events.filter((event) => event.type === "plan:step-completed").length, 0);
  assert.equal(events.filter((event) => event.type === "plan:completed").length, 0);
  assert.equal(events.filter((event) => event.type === "plan:verification" && event.result === "uncertain").length, 1);
});

test("26. A legacy string step without a requirement remains unverified", () => {
  const planner = new BoundedPlanner();
  const plan = planner.createPlan("run-legacy-step", "旧计划", ["旧字符串步骤"]);
  const result = planner.getVerifier().verifyStep(
    plan.steps[0],
    "步骤已经完成。",
    false,
    { currentToolEvidence: [] },
  );

  assert.equal(plan.steps[0].completionRequirement, undefined);
  assert.equal(result.status, "uncertain");
});

test("27. A required plan cannot complete from a zero-call success claim", async () => {
  const store = new InMemoryCheckpointStore();
  const checkpointManager = new CheckpointManager({ store });
  let providerCalls = 0;
  const provider: IFireflyLlmProvider = {
    ...testProviderMetadata,
    async generateCompletion() {
      providerCalls++;
      return { message: { role: "assistant", content: "外部操作已经成功完成。" } };
    },
  };

  const eventBus = new AgentEventBus();
  const events: AgentEvent[] = [];
  eventBus.onAny((event) => events.push(event));
  const registry = new FireflyToolRegistry();
  registry.register({
    id: "required-plan-tool",
    name: "Required plan tool",
    description: "A no-call regression tool.",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => JSON.stringify({ ok: true }),
  });
  const core = new FireflyAgentCore({
    provider,
    toolRegistry: registry,
    eventBus,
    checkpointManager,
    config: { maxRounds: 2 },
  });

  const input = {
    runId: "run-27-gate",
    userPrompt: "执行外部读取",
    planExecutionMode: "required" as const,
    customSteps: [{
      description: "执行外部读取",
      completionRequirement: "tool" as const,
      toolBinding: createToolBinding("required-plan-tool"),
    }],
  };
  const result = await core.run(input);

  assert.equal(providerCalls, 2);
  assert.equal(result.status, "error");
  assert.equal(result.finalText, "");
  assert.equal(result.terminationReason.kind, "plan_incomplete");
  if (result.terminationReason.kind === "plan_incomplete") {
    assert.equal(result.terminationReason.reason, "step_unverified");
    assert.equal(result.terminationReason.stepIndex, 0);
  }
  assert.equal(events.filter((event) => event.type === "agent:final-answer").length, 0);
  const finished = events.filter((event) => event.type === "agent:finished");
  assert.equal(finished.length, 1);
  assert.equal(finished[0].status, "error");
  assert.deepEqual(finished[0].terminationReason, result.terminationReason);

  const checkpoint = await checkpointManager.getLatestForRun("run-27-gate");
  assert.ok(checkpoint);
  assert.equal(checkpoint.runState, "failed");
  assert.deepEqual(checkpoint.terminationReason, result.terminationReason);
});

test("28. An unknown tool result leaves a required step unverified", async () => {
  const registry = new FireflyToolRegistry();
  registry.register({
    id: "unknown-plan-tool",
    name: "Unknown plan tool",
    description: "Returns an unknown external submission.",
    risk: "read_only",
    sideEffect: "read_only",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => JSON.stringify({
      commandSubmission: "unknown",
      error: "external_submission_unknown",
    }),
  });

  let providerCalls = 0;
  const provider: IFireflyLlmProvider = {
    ...testProviderMetadata,
    async generateCompletion() {
      providerCalls++;
      return providerCalls === 1
        ? {
            message: {
              role: "assistant",
              content: "正在执行外部操作。",
              toolCalls: [{ id: "unknown-plan-call", name: "unknown-plan-tool", arguments: {} }],
            },
          }
        : { message: { role: "assistant", content: "外部操作已经成功完成。" } };
    },
  };

  const result = await new FireflyAgentCore({
    provider,
    toolRegistry: registry,
    config: { maxRounds: 2 },
  }).run({
    runId: "run-28-unknown",
    userPrompt: "执行外部操作",
    planExecutionMode: "required",
    customSteps: [{
      description: "执行外部操作",
      completionRequirement: "tool",
      toolBinding: createToolBinding("unknown-plan-tool"),
    }],
  });

  assert.equal(providerCalls, 2);
  assert.equal(result.status, "error");
  assert.equal(result.terminationReason.kind, "plan_incomplete");
  if (result.terminationReason.kind === "plan_incomplete") {
    assert.equal(result.terminationReason.reason, "step_unverified");
  }
  assert.equal(result.toolCallEvidence?.[0]?.outcome, "unknown");
  assert.equal(result.finalText, "");
});

test("29. A not-executed tool result cannot complete a required plan", async () => {
  const registry = new FireflyToolRegistry();
  registry.register({
    id: "restricted-plan-tool",
    name: "Restricted plan tool",
    description: "Is present only to verify the empty execution surface.",
    risk: "read_only",
    sideEffect: "read_only",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => JSON.stringify({ ok: true }),
  });

  let providerCalls = 0;
  const provider: IFireflyLlmProvider = {
    ...testProviderMetadata,
    async generateCompletion() {
      providerCalls++;
      return providerCalls === 1
        ? {
            message: {
              role: "assistant",
              content: "尝试执行受限操作。",
              toolCalls: [{ id: "restricted-plan-call", name: "restricted-plan-tool", arguments: {} }],
            },
          }
        : { message: { role: "assistant", content: "外部操作已经成功完成。" } };
    },
  };

  const result = await new FireflyAgentCore({
    provider,
    toolRegistry: registry,
    config: { maxRounds: 2 },
  }).run({
    runId: "run-29-not-executed",
    userPrompt: "执行受限操作",
    planExecutionMode: "required",
    executionProfile: { kind: "MAIN", toolSurface: "none" },
    customSteps: [{
      description: "执行受限操作",
      completionRequirement: "tool",
      toolBinding: createToolBinding("restricted-plan-tool"),
    }],
  });

  assert.equal(providerCalls, 1);
  assert.equal(result.status, "error");
  assert.equal(result.terminationReason.kind, "plan_incomplete");
  if (result.terminationReason.kind === "plan_incomplete") {
    assert.equal(result.terminationReason.reason, "step_failed");
  }
  assert.equal(result.toolCallEvidence?.[0]?.outcome, "not_executed");
  assert.equal(result.finalText, "");
});

test("30. Main required-plan entry enables the completion gate without changing ordinary Chat", async () => {
  const registry = new FireflyToolRegistry();
  let providerCalls = 0;
  const eventBus = new AgentEventBus();
  const planEvents: AgentEvent[] = [];
  eventBus.onAny((event) => planEvents.push(event));
  const core = new FireflyAgentCore({
    provider: {
      ...testProviderMetadata,
      async generateCompletion() {
        providerCalls++;
        return { message: { role: "assistant", content: "计划步骤已完成。" } };
      },
    },
    toolRegistry: registry,
    eventBus,
  });

  const result = await core.runRequiredPlan({
    planExecutionMode: "required",
    userPrompt: "执行明确计划",
    steps: [{ description: "整理结果", completionRequirement: "analysis" }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Expected required plan entry to accept the request");
  assert.equal(result.result.status, "completed");
  assert.equal(providerCalls, 1);
  assert.equal(planEvents.filter((event) => event.type === "plan:created").length, 1);
  assert.equal(planEvents.filter((event) => event.type === "plan:completed").length, 1);
});

test("31. Main required-plan entry rejects invalid mode and malformed steps before execution", async () => {
  let providerCalls = 0;
  const eventBus = new AgentEventBus();
  const events: AgentEvent[] = [];
  eventBus.onAny((event) => events.push(event));
  const core = new FireflyAgentCore({
    provider: {
      ...testProviderMetadata,
      async generateCompletion() {
        providerCalls++;
        return { message: { role: "assistant", content: "不应执行" } };
      },
    },
    toolRegistry: new FireflyToolRegistry(),
    eventBus,
  });

  const invalidMode = await core.runRequiredPlan({
    planExecutionMode: "assist",
    userPrompt: "不应降级",
    steps: [{ description: "步骤", completionRequirement: "analysis" }],
  });
  const malformedSteps = await core.runRequiredPlan({
    planExecutionMode: "required",
    userPrompt: "不应执行畸形步骤",
    steps: [{ description: "缺少完成要求" }],
  });

  assert.equal(invalidMode.ok, false);
  if (invalidMode.ok) throw new Error("Expected invalid mode rejection");
  assert.equal(invalidMode.code, "invalid_plan_execution_mode");
  assert.equal(malformedSteps.ok, false);
  if (malformedSteps.ok) throw new Error("Expected malformed step rejection");
  assert.equal(malformedSteps.code, "invalid_plan_steps");
  assert.equal(providerCalls, 0);
  assert.equal(events.filter((event) => event.type === "agent:started").length, 0);
});

test("31b. Main required-plan entry rejects unavailable tools, invalid arguments, and out-of-scope Browser targets", async () => {
  let providerCalls = 0;
  const registry = new FireflyToolRegistry();
  registry.register({
    id: "bound-plan-tool",
    name: "bound-plan-tool",
    description: "A schema-bound test tool.",
    inputSchema: {
      type: "object",
      properties: { requestUrl: { type: "string" } },
      required: ["requestUrl"],
    },
    enabled: true,
    execute: async () => JSON.stringify({ ok: true }),
  });
  registry.register({
    id: "browser_read",
    name: "browser_read",
    description: "A controlled Browser schema for boundary validation.",
    inputSchema: {
      type: "object",
      properties: { requestUrl: { type: "string" } },
      required: ["requestUrl"],
    },
    enabled: true,
    execute: async () => JSON.stringify({ ok: true }),
  });
  const core = new FireflyAgentCore({
    provider: {
      ...testProviderMetadata,
      async generateCompletion() {
        providerCalls++;
        return { message: { role: "assistant", content: "不应执行" } };
      },
    },
    toolRegistry: registry,
  });

  const unavailable = await core.runRequiredPlan({
    planExecutionMode: "required",
    userPrompt: "绑定未启用工具",
    steps: [{
      description: "执行未启用工具",
      completionRequirement: "tool",
      toolBinding: createToolBinding("not_enabled_tool"),
    }],
  });
  const invalidArguments = await core.runRequiredPlan({
    planExecutionMode: "required",
    userPrompt: "绑定错误参数",
    steps: [{
      description: "执行错误参数",
      completionRequirement: "tool",
      toolBinding: createToolBinding("bound-plan-tool", { unexpected: true }),
    }],
  });
  const outOfScopeBrowser = await core.runRequiredPlan({
    planExecutionMode: "required",
    userPrompt: "读取用户指定页面",
    browserRequestTargets: ["https://example.com/a"],
    steps: [{
      description: "读取未指定页面",
      completionRequirement: "tool",
      toolBinding: createToolBinding(
        "browser_read",
        { requestUrl: "https://example.com/b" },
        "normalized_url",
      ),
    }],
  });

  for (const result of [unavailable, invalidArguments, outOfScopeBrowser]) {
    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.equal(result.code, "invalid_plan_tool_binding");
  }
  assert.equal(providerCalls, 0);
});

test("32. Direct required AgentRunInput rejects legacy string steps instead of treating them as analysis", async () => {
  let providerCalls = 0;
  const core = new FireflyAgentCore({
    provider: {
      ...testProviderMetadata,
      async generateCompletion() {
        providerCalls++;
        return { message: { role: "assistant", content: "不应执行" } };
      },
    },
    toolRegistry: new FireflyToolRegistry(),
  });

  const result = await core.run({
    userPrompt: "旧字符串步骤不能降级",
    planExecutionMode: "required",
    customSteps: ["旧字符串步骤"],
  });

  assert.equal(result.status, "error");
  assert.equal(result.error?.startsWith("invalid_plan_steps:"), true);
  assert.equal(providerCalls, 0);
});
