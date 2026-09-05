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
import { FireflyToolRegistry } from "../../../dist/main/main/tools/tool-registry.js";
import { AgentEventBus } from "../../../dist/main/main/orchestrator/agent-events.js";
import { FireflyAgentCore } from "../../../dist/main/main/orchestrator/firefly-agent-core.js";
import { InMemoryCheckpointStore } from "../../../dist/main/main/orchestrator/recovery/checkpoint-store.js";
import { CheckpointManager } from "../../../dist/main/main/orchestrator/recovery/checkpoint-manager.js";

test("1. Direct Mode: Simple question does NOT trigger plan mode", async () => {
  const planner = new BoundedPlanner();
  assert.equal(planner.shouldPlan("今天天气怎么样？", 0), false);
  assert.equal(planner.shouldPlan("你好流萤", 0), false);

  const registry = new FireflyToolRegistry();
  const mockProvider = {
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
  const planEvents = [];
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
  const plan = planner.createPlan("run-p6", "测试任务", ["第1步", "第2步"]);

  const res1 = planner.advanceStep(plan, "已成功获取城市天气数据: 晴朗 22℃", false);
  assert.equal(res1.action, "next");
  assert.equal(res1.verification.status, "success");
  assert.equal(plan.currentStepIndex, 1);
  assert.equal(plan.steps[0].status, "completed");

  const res2 = planner.advanceStep(plan, "已成功完成全部汇报", false);
  assert.equal(res2.action, "complete");
  assert.equal(plan.status, "completed");
});

test("7. Step Verification Failure: Error observation marks failure", () => {
  const planner = new BoundedPlanner();
  const plan = planner.createPlan("run-p7", "失败任务", ["第1步", "第2步"]);

  const res = planner.advanceStep(plan, '{"ok":false,"error":"sensor_offline"}', false);
  assert.equal(res.action, "fail");
  assert.equal(res.verification.status, "failure");
  assert.equal(plan.status, "failed");
});

test("8. Step Verification Uncertain: Empty observation triggers retry", () => {
  const verifier = new StepVerifier();
  const result = verifier.verifyStep({ stepId: "s1", index: 0, description: "test", status: "running" }, "", false);
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
  const cancelledEvents = [];
  eventBus.on("plan:cancelled", (e) => cancelledEvents.push(e));

  const registry = new FireflyToolRegistry();
  const mockProvider = {
    async generateCompletion(_req, signal) {
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
    planMode: true,
  });

  setTimeout(() => core.cancelAll(), 20);

  const res = await runPromise;
  assert.equal(res.status, "cancelled");
  assert.equal(cancelledEvents.length, 1);
});

test("11. Plan Timeout: Total timeout safely terminates plan", async () => {
  const registry = new FireflyToolRegistry();
  const mockProvider = {
    async generateCompletion(_req, signal) {
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
    planMode: true,
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
  const mockProvider = {
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
  const planCompletedEvents = [];
  eventBus.on("plan:completed", (e) => planCompletedEvents.push(e));

  const core = new FireflyAgentCore({
    provider: mockProvider,
    toolRegistry: registry,
    eventBus,
  });

  const res = await core.run({
    userPrompt: "第一步获取数据，然后执行处理",
    planMode: true,
    customSteps: ["第一步获取数据", "第二步执行处理"],
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

  const state = {
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

test("15. Resume into current step: Resuming checkpoint restores plan state", async () => {
  const store = new InMemoryCheckpointStore();
  const manager = new CheckpointManager({ store });

  const planner = new BoundedPlanner();
  const plan = planner.createPlan("run-p15", "恢复目标", ["步骤1", "步骤2"]);
  plan.currentStepIndex = 1;
  plan.steps[0].status = "completed";
  plan.steps[1].status = "running";

  const checkpoint = {
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

  const mockProvider = {
    async generateCompletion() {
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
  assert.equal(res.status, "completed");
  assert.equal(res.finalText, "已成功恢复并完成第二步！");
});

test("16. Side Effect Safety on Resume: Interrupted tool call receives synthetic marker", async () => {
  const store = new InMemoryCheckpointStore();
  const manager = new CheckpointManager({ store });

  const checkpoint = {
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

  let resumedInputMessages = [];
  const mockProvider = {
    async generateCompletion(req) {
      resumedInputMessages = req.messages;
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
  assert.equal(res.status, "completed");
  const toolMsg = resumedInputMessages.find((m) => m.role === "tool" && m.toolCallId === "tc_crash");
  assert.ok(toolMsg, "Must contain synthetic tool result for interrupted tool");
  assert.ok(toolMsg.content.includes("interrupted_prior_to_completion"));
});

test("17. Plan Loop Termination Guarantee: Cannot loop forever", async () => {
  const registry = new FireflyToolRegistry();
  // Provider keeps returning repetitive tool call indefinitely
  const mockProvider = {
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

  const core = new FireflyAgentCore({
    provider: mockProvider,
    toolRegistry: registry,
    config: { maxRounds: 3 }, // Bounded rounds
  });

  const res = await core.run({
    userPrompt: "计划任务",
    planMode: true,
  });

  assert.equal(res.status, "completed");
  assert.equal(res.roundsCount, 3);
});

test("18. Final Answer Synthesis after Successful Plan", async () => {
  const registry = new FireflyToolRegistry();
  const mockProvider = {
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
  const finishedEvents = [];
  eventBus.on("agent:finished", (e) => finishedEvents.push(e));

  const core = new FireflyAgentCore({
    provider: mockProvider,
    toolRegistry: registry,
    eventBus,
  });

  const res = await core.run({
    userPrompt: "帮我制定计划并执行",
    planMode: true,
  });

  assert.equal(res.status, "completed");
  assert.equal(res.finalText, "开拓者，所有计划步骤均已完成，流萤已为您整理好最终结果！");
  assert.equal(finishedEvents.length, 1);
});
