import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { FireflyHarness } from "../../../dist/main/main/orchestrator/harness/firefly-harness.js";
import { AgentEventBus } from "../../../dist/main/main/orchestrator/agent-events.js";
import { ContextManager } from "../../../dist/main/main/orchestrator/context/context-manager.js";
import { MemorySlot, RagSlot } from "../../../dist/main/main/orchestrator/context/context-slots.js";
import { AgentSession } from "../../../dist/main/main/orchestrator/agent-session.js";
import { BoundedPlanner } from "../../../dist/main/main/orchestrator/planning/bounded-planner.js";
import { CheckpointManager } from "../../../dist/main/main/orchestrator/recovery/checkpoint-manager.js";
import { InMemoryCheckpointStore } from "../../../dist/main/main/orchestrator/recovery/checkpoint-store.js";
import { RecoveryManager } from "../../../dist/main/main/orchestrator/recovery/recovery-manager.js";
import { ToolExecutionEngine } from "../../../dist/main/main/runtime/execution/tool-execution-engine.js";
import { FireflyToolRegistry } from "../../../dist/main/main/tools/tool-registry.js";

function createProvider(onGenerate) {
  return {
    id: "harness-test-provider",
    name: "Harness Test Provider",
    capabilities: { supportsNativeToolCalling: true, supportsStreaming: false },
    generateCompletion: onGenerate,
  };
}

function finalProvider(text) {
  return createProvider(async () => ({
    message: { role: "assistant", content: text },
  }));
}

function createHarness(options = {}) {
  return new FireflyHarness({
    provider: options.provider || finalProvider("完成。"),
    toolRegistry: options.toolRegistry || new FireflyToolRegistry(),
    ...options,
  });
}

test("1. Harness owns the unique loop and legacy modules are absent", () => {
  const harnessPath = path.join(
    process.cwd(),
    "src",
    "main",
    "orchestrator",
    "harness",
    "firefly-harness.ts",
  );
  const corePath = path.join(
    process.cwd(),
    "src",
    "main",
    "orchestrator",
    "firefly-agent-core.ts",
  );
  const harnessSource = fs.readFileSync(harnessPath, "utf8");
  const coreSource = fs.readFileSync(corePath, "utf8");

  assert.ok(harnessSource.includes("while (stepCount < this.config.maxRounds)"));
  assert.ok(harnessSource.includes("executeToolRound"));
  assert.equal(harnessSource.includes("FireflyToolDispatcher"), false);
  assert.equal(harnessSource.includes("buildFireflySystemPrompt"), false);
  assert.equal(harnessSource.includes("compactMessagesIfNeeded"), false);
  assert.equal(harnessSource.includes("InMemoryCheckpointStore"), false);
  assert.equal(coreSource.includes("while ("), false);
  assert.ok(coreSource.includes("this.harness.run"));

  for (const oldFile of [
    "harness-context.ts",
    "compaction.ts",
    "checkpoint.ts",
    "tool-truncation.ts",
  ]) {
    assert.equal(
      fs.existsSync(path.join(process.cwd(), "src", "main", "orchestrator", "harness", oldFile)),
      false,
      oldFile + " must not remain",
    );
  }
});

test("2. No-tool run reaches a completed AgentRunResult through the Harness", async () => {
  const eventBus = new AgentEventBus();
  const events = [];
  eventBus.onAny((event) => events.push(event));

  const result = await createHarness({
    provider: finalProvider("你好，开拓者。"),
    eventBus,
  }).run({ runId: "harness-no-tool", userPrompt: "你好，流萤。" });

  assert.equal(result.status, "completed");
  assert.equal(result.finalText, "你好，开拓者。");
  assert.equal(result.roundsCount, 1);
  assert.equal(result.toolCallsCount, 0);
  assert.equal(events.filter((event) => event.type === "agent:final-answer").length, 1);
  assert.equal(events.filter((event) => event.type === "agent:error").length, 0);
});

test("3. One tool round uses ToolExecutionEngine and feeds the result to the next LLM call", async () => {
  const registry = new FireflyToolRegistry();
  let executions = 0;
  registry.register({
    id: "safe_lookup",
    name: "Safe Lookup",
    description: "Returns a deterministic observation.",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => {
      executions++;
      return JSON.stringify({ ok: true, value: "observed" });
    },
  });

  let calls = 0;
  const provider = createProvider(async (request) => {
    calls++;
    if (calls === 1) {
      return {
        message: {
          role: "assistant",
          content: "我来查一下。",
          toolCalls: [{ id: "tool-call-1", name: "safe_lookup", arguments: {} }],
        },
      };
    }
    const toolMessage = request.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "tool-call-1",
    );
    assert.ok(toolMessage);
    assert.ok(toolMessage.content.includes("observed"));
    return { message: { role: "assistant", content: "已经观察到结果。" } };
  });

  const result = await createHarness({ provider, toolRegistry: registry }).run({
    runId: "harness-one-tool",
    userPrompt: "执行安全查询",
  });

  assert.equal(executions, 1);
  assert.equal(calls, 2);
  assert.equal(result.status, "completed");
  assert.equal(result.toolCallsCount, 1);
  assert.equal(result.roundsCount, 2);
  assert.ok(result.transcript.some((message) => message.role === "tool"));
  assert.ok(createHarness({ toolRegistry: registry }).getExecutionEngine() instanceof ToolExecutionEngine);
});

test("4. Multiple tool calls preserve toolCallId pairing and transcript order", async () => {
  const registry = new FireflyToolRegistry();
  const executed = [];
  for (const name of ["safe_a", "safe_b"]) {
    registry.register({
      id: name,
      name,
      description: name,
      inputSchema: { type: "object", properties: {} },
      enabled: true,
      execute: async () => {
        executed.push(name);
        return name + "-result";
      },
    });
  }

  let calls = 0;
  const provider = createProvider(async (request) => {
    calls++;
    if (calls === 1) {
      return {
        message: {
          role: "assistant",
          content: "",
          toolCalls: [
            { id: "call-a", name: "safe_a", arguments: {} },
            { id: "call-b", name: "safe_b", arguments: {} },
          ],
        },
      };
    }
    const toolMessages = request.messages.filter((message) => message.role === "tool");
    assert.deepEqual(
      toolMessages.map((message) => [message.toolCallId, message.content]),
      [
        ["call-a", "safe_a-result"],
        ["call-b", "safe_b-result"],
      ],
    );
    return { message: { role: "assistant", content: "两个观察均已收到。" } };
  });

  const result = await createHarness({ provider, toolRegistry: registry }).run({
    runId: "harness-multiple-tools",
    userPrompt: "执行两个安全查询",
  });

  assert.deepEqual(executed, ["safe_a", "safe_b"]);
  assert.equal(result.toolCallsCount, 2);
  assert.equal(result.status, "completed");
});

test("5. Cancellation aborts the real run lifecycle without persona fallback", async () => {
  const controller = new AbortController();
  const provider = createProvider(async (_request, signal) => {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 5000);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new Error("Aborted by test"));
        },
        { once: true },
      );
    });
    return { message: { role: "assistant", content: "不应到达。" } };
  });

  const promise = createHarness({ provider }).run({
    runId: "harness-cancel",
    userPrompt: "取消这个运行",
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 20);
  const result = await promise;

  assert.equal(result.status, "cancelled");
  assert.equal(result.finalText, "（对话已被取消）");
  assert.equal(result.finalText.includes("我在这里"), false);
});

test("6. Timeout reports factual timeout status", async () => {
  const provider = createProvider(async (_request, signal) => {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 5000);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new Error("Timeout abort"));
        },
        { once: true },
      );
    });
    return { message: { role: "assistant", content: "不应到达。" } };
  });

  const result = await createHarness({
    provider,
    config: { totalTimeoutMs: 30 },
  }).run({ runId: "harness-timeout", userPrompt: "超时测试" });

  assert.equal(result.status, "timeout");
  assert.ok(result.error.includes("30ms"));
  assert.equal(result.finalText, "（对话请求已超时）");
});

test("7. Provider failure goes through RecoveryManager and retries", async () => {
  let calls = 0;
  const recoveryEvents = [];
  const eventBus = new AgentEventBus();
  eventBus.on("recovery:started", (event) => recoveryEvents.push(event));
  eventBus.on("recovery:completed", (event) => recoveryEvents.push(event));
  const provider = createProvider(async () => {
    calls++;
    if (calls === 1) throw new Error("503 Service Unavailable");
    return { message: { role: "assistant", content: "恢复成功。" } };
  });

  const result = await createHarness({
    provider,
    eventBus,
    recoveryManager: new RecoveryManager({ initialBackoffMs: 1 }),
  }).run({ runId: "harness-recovery", userPrompt: "恢复测试" });

  assert.equal(result.status, "completed");
  assert.equal(calls, 2);
  assert.equal(recoveryEvents.length, 2);
});

test("8. Context pressure is handled by the canonical ContextManager compaction owner", async () => {
  let receivedMessages = [];
  const history = [];
  for (let index = 0; index < 10; index++) {
    history.push({ id: "history-" + index, role: "user", content: "历史内容 ".repeat(20) });
    history.push({ id: "reply-" + index, role: "assistant", content: "历史回复 ".repeat(20) });
  }
  const contextManager = new ContextManager({
    budgetConfig: {
      contextWindowTokens: 100,
      reservedOutputTokens: 0,
      safetyMarginTokens: 0,
      compactionThreshold: 0.01,
    },
  });
  const provider = createProvider(async (request) => {
    receivedMessages = request.messages;
    return { message: { role: "assistant", content: "压缩后完成。" } };
  });

  const result = await createHarness({
    provider,
    contextManager,
  }).run({ runId: "harness-compaction", userPrompt: "继续" , history });

  assert.equal(result.status, "completed");
  assert.ok(receivedMessages.some((message) => message.id.startsWith("summary-")));
});

test("9. Checkpoint boundaries use the canonical CheckpointManager", async () => {
  const store = new InMemoryCheckpointStore();
  const checkpointManager = new CheckpointManager({ store });
  const result = await createHarness({ checkpointManager }).run({
    runId: "harness-checkpoint",
    userPrompt: "快照测试",
  });

  const checkpoint = await checkpointManager.getLatestForRun(result.runId);
  assert.ok(checkpoint);
  assert.equal(checkpoint.runState, "completed");
  assert.equal(checkpoint.trigger, "run_completed");
  assert.ok(checkpoint.messages.some((message) => message.role === "assistant"));
});

test("10. Existing bounded planning contract remains on the Harness path", async () => {
  const eventBus = new AgentEventBus();
  const eventTypes = [];
  eventBus.onAny((event) => eventTypes.push(event.type));
  const planner = new BoundedPlanner();

  const result = await createHarness({
    eventBus,
    planner,
    provider: finalProvider("计划结果已整理。"),
  }).run({
    runId: "harness-planning",
    userPrompt: "请制定计划并执行",
    planMode: true,
  });

  assert.equal(result.status, "completed");
  assert.ok(eventTypes.includes("plan:created"));
  assert.ok(eventTypes.includes("plan:step-start"));
  assert.ok(eventTypes.includes("plan:verification"));
});

test("11. AgentEventBus is the only production event stream and final event is unique", async () => {
  const eventBus = new AgentEventBus();
  const events = [];
  eventBus.onAny((event) => events.push(event));
  const result = await createHarness({
    eventBus,
    provider: finalProvider("事件测试完成。"),
  }).run({ runId: "harness-events", userPrompt: "事件测试" });

  assert.equal(result.status, "completed");
  assert.equal(events.filter((event) => event.type === "agent:final-answer").length, 1);
  assert.equal(events.filter((event) => event.type === "agent:finished").length, 1);
  assert.equal(events.some((event) => event.type === "run_created"), false);
  assert.equal(events.some((event) => event.type === "round_start"), false);
  assert.equal(events.some((event) => event.type === "final_answer"), false);
});

test("12. Async Memory and RAG slots reach the actual Harness LLM messages", async () => {
  let systemMessage = "";
  const contextManager = new ContextManager({
    customSlots: [
      new MemorySlot({
        retriever: {
          retrieve: async () => ({ items: [{ key: "favorite", value: "星星" }] }),
        },
        projector: {
          project: () => "ASYNC_MEMORY_CONTEXT",
        },
      }),
      new RagSlot({
        retriever: {
          retrieve: async () => ({ items: [{ title: "本地知识" }] }),
        },
        projector: {
          project: () => "ASYNC_RAG_CONTEXT",
        },
      }),
    ],
  });
  const provider = createProvider(async (request) => {
    systemMessage = request.messages[0].content;
    return { message: { role: "assistant", content: "上下文已进入。" } };
  });

  const result = await createHarness({
    provider,
    contextManager,
  }).run({ runId: "harness-context", userPrompt: "记忆上下文测试" });

  assert.equal(result.status, "completed");
  assert.ok(systemMessage.includes("ASYNC_MEMORY_CONTEXT"));
  assert.ok(systemMessage.includes("ASYNC_RAG_CONTEXT"));
});

test("13. Harness source calls the execution owner and contains no local tool policy", () => {
  const source = fs.readFileSync(
    path.join(
      process.cwd(),
      "src",
      "main",
      "orchestrator",
      "harness",
      "tool-round.ts",
    ),
    "utf8",
  );

  assert.ok(source.includes("executionEngine.executeToolCall"));
  assert.equal(source.includes("new FireflyToolDispatcher"), false);
  assert.equal(source.includes("setTimeout"), false);
  assert.equal(source.includes("truncateToolOutput"), false);
});
