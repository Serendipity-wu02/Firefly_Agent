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
import { ToolExecutionEngine } from "../../../dist/main/main/orchestrator/tools/execution/tool-execution-engine.js";
import { FireflyToolRegistry } from "../../../dist/main/main/orchestrator/tools/registry/tool-registry.js";
import type { IFireflyLlmProvider } from "../../../dist/main/shared/provider-types.js";
import type { FireflyHarnessOptions } from "../../../dist/main/main/orchestrator/harness/firefly-harness.js";
import type { AgentEvent, AgentEventType } from "../../../dist/main/shared/agent-types.js";
import type { ChatMessage } from "../../../dist/main/shared/chat-types.js";
import {
  COMPACTION_INPUT_BUDGET_ERROR,
  COMPACTION_TASK_FACTS_BUDGET_ERROR,
} from "../../../dist/main/shared/compaction-task-facts.js";

function createProvider(onGenerate: IFireflyLlmProvider["generateCompletion"]): IFireflyLlmProvider {
  return {
    id: "harness-test-provider",
    name: "Harness Test Provider",
    capabilities: { supportsNativeToolCalling: true, supportsStreaming: false },
    generateCompletion: onGenerate,
  };
}

function finalProvider(text: string): IFireflyLlmProvider {
  return createProvider(async () => ({
    message: { role: "assistant", content: text },
  }));
}

function createHarness(options: Partial<FireflyHarnessOptions> = {}) {
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

  assert.ok(harnessSource.includes("while (status === \"running\" && stepCount < this.config.maxRounds)"));
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
  const events: Array<{ type: string }> = [];
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
  const executed: string[] = [];
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
      signal?.addEventListener(
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
      signal?.addEventListener(
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
  assert.ok(result.error);
  assert.ok(result.error.includes("30ms"));
  assert.equal(result.finalText, "（对话请求已超时）");
});

test("7. Provider failure goes through RecoveryManager and retries", async () => {
  let calls = 0;
  const recoveryEvents: AgentEvent[] = [];
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
  const started = recoveryEvents.find((event) => event.type === "recovery:started");
  assert.ok(started);
  assert.equal(started.attempt, 1);
});

test("8. Context pressure is handled by the canonical ContextManager compaction owner", async () => {
  let receivedMessages: ChatMessage[] = [];
  const history: ChatMessage[] = [];
  for (let index = 0; index < 10; index++) {
    history.push({ id: "history-" + index, role: "user", content: "历史内容 ".repeat(20) });
    history.push({ id: "reply-" + index, role: "assistant", content: "历史回复 ".repeat(20) });
  }
  const contextManager = new ContextManager({
    budgetConfig: {
      contextWindowTokens: 5000,
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
  assert.ok(receivedMessages.some((message) => message.id === "compaction-summary:harness-compaction"));
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
  assert.deepEqual(checkpoint.terminationReason, result.terminationReason);
  assert.ok(checkpoint.messages.some((message) => message.role === "assistant"));
});

test("10. Existing bounded planning contract remains on the Harness path", async () => {
  const eventBus = new AgentEventBus();
  const eventTypes: AgentEventType[] = [];
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
  const events: Array<{ type: string }> = [];
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
    const firstMessage = request.messages[0];
    assert.ok(firstMessage);
    systemMessage = firstMessage.content;
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

test("14. A final answer on the last allowed round is still an explicit completion", async () => {
  const registry = new FireflyToolRegistry();
  registry.register({
    id: "last-round-tool",
    name: "Last round tool",
    description: "Test tool",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => JSON.stringify({ ok: true }),
  });

  let providerCalls = 0;
  const eventBus = new AgentEventBus();
  const events: AgentEvent[] = [];
  eventBus.onAny((event) => events.push(event));
  const provider = createProvider(async () => {
    providerCalls++;
    return providerCalls === 1
      ? {
          message: {
            role: "assistant",
            content: "先执行工具。",
            toolCalls: [{ id: "last-round-call", name: "last-round-tool", arguments: {} }],
          },
        }
      : { message: { role: "assistant", content: "最后一轮完成。" } };
  });

  const result = await createHarness({
    provider,
    toolRegistry: registry,
    eventBus,
    config: { maxRounds: 2 },
  }).run({ runId: "harness-last-round", userPrompt: "最后一轮测试" });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.terminationReason, { kind: "completed" });
  assert.equal(result.roundsCount, 2);
  assert.equal(result.finalText, "最后一轮完成。");
  assert.equal(events.filter((event) => event.type === "agent:final-answer").length, 1);
});

test("15. A blocked tool budget is non-success without dispatching beyond the budget", async () => {
  const registry = new FireflyToolRegistry();
  let executions = 0;
  registry.register({
    id: "budget-tool",
    name: "Budget tool",
    description: "Test budget tool",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => {
      executions++;
      return JSON.stringify({ ok: true });
    },
  });

  const eventBus = new AgentEventBus();
  const events: AgentEvent[] = [];
  eventBus.onAny((event) => events.push(event));
  const provider = createProvider(async () => ({
    message: {
      role: "assistant",
      content: "继续调用工具。",
      toolCalls: [
        { id: "budget-call-1", name: "budget-tool", arguments: {} },
        { id: "budget-call-2", name: "budget-tool", arguments: {} },
      ],
    },
  }));

  const result = await createHarness({
    provider,
    toolRegistry: registry,
    eventBus,
    toolPolicy: { maxToolCallsPerRun: 1 },
    config: { maxRounds: 1 },
  }).run({ runId: "harness-tool-budget", userPrompt: "工具预算测试" });

  assert.equal(result.status, "error");
  assert.deepEqual(result.terminationReason, {
    kind: "budget_exhausted",
    budget: "tool_calls",
  });
  assert.equal(result.finalText, "");
  assert.equal(executions, 1);
  assert.equal(result.toolCallEvidence?.length, 2);
  assert.equal(events.filter((event) => event.type === "agent:final-answer").length, 0);
  assert.equal(events.filter((event) => event.type === "agent:finished").length, 1);
});

test("16. An exact tool-budget boundary still permits an in-budget final answer", async () => {
  const registry = new FireflyToolRegistry();
  let executions = 0;
  registry.register({
    id: "exact-budget-tool",
    name: "Exact budget tool",
    description: "Consumes the one allowed logical tool call.",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => {
      executions++;
      return JSON.stringify({ ok: true });
    },
  });

  let providerCalls = 0;
  const eventBus = new AgentEventBus();
  const events: AgentEvent[] = [];
  eventBus.onAny((event) => events.push(event));
  const provider = createProvider(async () => {
    providerCalls++;
    return providerCalls === 1
      ? {
          message: {
            role: "assistant",
            content: "执行一次查询。",
            toolCalls: [{ id: "exact-budget-call", name: "exact-budget-tool", arguments: {} }],
          },
        }
      : { message: { role: "assistant", content: "已根据查询结果完成回答。" } };
  });

  const result = await createHarness({
    provider,
    toolRegistry: registry,
    eventBus,
    toolPolicy: { maxToolCallsPerRun: 1 },
    config: { maxRounds: 2 },
  }).run({ runId: "harness-exact-tool-budget", userPrompt: "工具预算边界测试" });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.terminationReason, { kind: "completed" });
  assert.equal(result.finalText, "已根据查询结果完成回答。");
  assert.equal(result.toolCallsCount, 1);
  assert.equal(providerCalls, 2);
  assert.equal(executions, 1);
  assert.equal(events.filter((event) => event.type === "agent:final-answer").length, 1);
});

test("17. Cancellation observed at the budget boundary is not relabeled as exhaustion", async () => {
  const registry = new FireflyToolRegistry();
  let executions = 0;
  registry.register({
    id: "boundary-cancel-tool",
    name: "Boundary cancel tool",
    description: "Completes before the checkpoint-triggered cancellation.",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => {
      executions++;
      return JSON.stringify({ ok: true });
    },
  });

  const controller = new AbortController();
  const checkpointStore = new InMemoryCheckpointStore();
  const saveCheckpoint = checkpointStore.save.bind(checkpointStore);
  checkpointStore.save = async (checkpoint) => {
    await saveCheckpoint(checkpoint);
    if (checkpoint.trigger === "tool_round_completed") controller.abort();
  };

  const eventBus = new AgentEventBus();
  const events: AgentEvent[] = [];
  eventBus.onAny((event) => events.push(event));
  const provider = createProvider(async () => ({
    message: {
      role: "assistant",
      content: "执行查询。",
      toolCalls: [{ id: "boundary-cancel-call", name: "boundary-cancel-tool", arguments: {} }],
    },
  }));

  const result = await createHarness({
    provider,
    toolRegistry: registry,
    eventBus,
    checkpointManager: new CheckpointManager({ store: checkpointStore }),
    config: { maxRounds: 1 },
  }).run({
    runId: "harness-budget-cancel-boundary",
    userPrompt: "预算边界取消测试",
    signal: controller.signal,
  });

  assert.equal(result.status, "cancelled");
  assert.deepEqual(result.terminationReason, { kind: "cancelled" });
  assert.equal(executions, 1);
  assert.equal(events.filter((event) => event.type === "agent:final-answer").length, 0);
});

test("18. The first real context overflow enters emergency compaction before retrying", async () => {
  const contextManager = new ContextManager();
  const compactionStrategies: string[] = [];
  const originalProject = contextManager.project.bind(contextManager);
  contextManager.project = (options) => {
    if (options.forceCompactionStrategy !== undefined) {
      compactionStrategies.push(options.forceCompactionStrategy);
    }
    return originalProject(options);
  };

  let providerCalls = 0;
  const provider = createProvider(async () => {
    providerCalls++;
    if (providerCalls === 1) {
      throw new Error("400 Bad Request: context_length_exceeded");
    }
    return { message: { role: "assistant", content: "压缩后重试成功。" } };
  });

  const result = await createHarness({
    provider,
    contextManager,
    recoveryManager: new RecoveryManager({ initialBackoffMs: 1 }),
  }).run({ runId: "harness-first-overflow", userPrompt: "首次超限恢复" });

  assert.equal(result.status, "completed");
  assert.equal(providerCalls, 2);
  assert.deepEqual(compactionStrategies, ["emergency"]);
  assert.equal(result.error, undefined);
});

test("19. Context overflow recovery stops after the configured compaction budget", async () => {
  let providerCalls = 0;
  const provider = createProvider(async () => {
    providerCalls++;
    throw new Error("400 Bad Request: context_length_exceeded");
  });

  const result = await createHarness({
    provider,
    recoveryManager: new RecoveryManager({ maxOverflowRetries: 1 }),
  }).run({ runId: "harness-overflow-budget", userPrompt: "超限预算" });

  assert.equal(result.status, "error");
  assert.equal(providerCalls, 2);
  assert.ok(result.error?.includes("context_length_exceeded"));
  assert.equal(result.roundsCount, 1);
});

test("20. Compaction failure is terminal and does not retry indefinitely", async () => {
  const contextManager = new ContextManager();
  const originalProject = contextManager.project.bind(contextManager);
  contextManager.project = (options) => {
    if (options.forceCompactionStrategy === "emergency") {
      throw new Error("emergency compaction failed");
    }
    return originalProject(options);
  };

  let providerCalls = 0;
  const provider = createProvider(async () => {
    providerCalls++;
    throw new Error("400 Bad Request: context_length_exceeded");
  });

  const result = await createHarness({ provider, contextManager }).run({
    runId: "harness-compaction-failure",
    userPrompt: "压缩失败",
  });

  assert.equal(result.status, "error");
  assert.equal(providerCalls, 1);
  assert.ok(result.error?.includes("emergency compaction failed"));
});

test("21. Provider recovery backoff cancellation prevents the next provider call", async () => {
  const controller = new AbortController();
  const eventBus = new AgentEventBus();
  const completedRecoveryEvents: AgentEvent[] = [];
  eventBus.on("recovery:started", () => {
    setImmediate(() => controller.abort());
  });
  eventBus.on("recovery:completed", (event) => completedRecoveryEvents.push(event));

  let providerCalls = 0;
  const provider = createProvider(async () => {
    providerCalls++;
    throw new Error("503 Service Unavailable");
  });

  const result = await createHarness({
    provider,
    eventBus,
    recoveryManager: new RecoveryManager({ initialBackoffMs: 1_000 }),
  }).run({
    runId: "harness-provider-backoff-cancel",
    userPrompt: "取消 Provider 退避",
    signal: controller.signal,
  });

  assert.equal(result.status, "cancelled");
  assert.deepEqual(result.terminationReason, { kind: "cancelled" });
  assert.equal(providerCalls, 1);
  assert.equal(completedRecoveryEvents.length, 0);
});

test("22. Total timeout during provider recovery backoff remains a timeout", async () => {
  let providerCalls = 0;
  const provider = createProvider(async () => {
    providerCalls++;
    throw new Error("503 Service Unavailable");
  });

  const result = await createHarness({
    provider,
    config: { totalTimeoutMs: 25 },
    recoveryManager: new RecoveryManager({ initialBackoffMs: 1_000 }),
  }).run({ runId: "harness-provider-backoff-timeout", userPrompt: "退避超时" });

  assert.equal(result.status, "timeout");
  assert.deepEqual(result.terminationReason, { kind: "timeout" });
  assert.equal(providerCalls, 1);
});

test("23. Harness refreshes one current-run task-facts envelope after tool evidence", async () => {
  const registry = new FireflyToolRegistry();
  registry.register({
    id: "facts_lookup",
    name: "Facts lookup",
    description: "Returns a structured external observation.",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => JSON.stringify({
      ok: true,
      status: "observed",
      untrustedContent: true,
      body: "external page text",
    }),
  });

  const requests: Array<{ messages: ChatMessage[] }> = [];
  let providerCalls = 0;
  const provider = createProvider(async (request) => {
    providerCalls++;
    requests.push({ messages: request.messages });
    if (providerCalls === 1) {
      return {
        message: {
          role: "assistant",
          content: "我来观察。",
          toolCalls: [{ id: "facts-call", name: "facts_lookup", arguments: {} }],
        },
      };
    }
    return { message: { role: "assistant", content: "我已收到当前观察。" } };
  });

  const result = await createHarness({ provider, toolRegistry: registry }).run({
    runId: "harness-task-facts",
    userPrompt: "保留当前任务约束并读取观察",
  });

  assert.equal(result.status, "completed");
  assert.equal(providerCalls, 2);
  const factsMessage = requests[1].messages.find((message) =>
    message.id === "compaction-task-constraints:harness-task-facts",
  );
  assert.ok(factsMessage);
  assert.equal(factsMessage.role, "system");
  assert.ok(factsMessage.content.includes("trustedExecutionConstraints"));
  assert.ok(factsMessage.content.includes("facts-call"));
  assert.ok(factsMessage.content.includes("untrustedObservationRefs"));
  assert.doesNotMatch(factsMessage.content, /external page text/u);
});

test("24. Harness stops before Provider when current task facts exceed the input budget", async () => {
  let providerCalls = 0;
  const provider = createProvider(async () => {
    providerCalls++;
    return { message: { role: "assistant", content: "不应调用。" } };
  });
  const contextManager = new ContextManager({
    budgetConfig: {
      contextWindowTokens: 256,
      reservedOutputTokens: 128,
      safetyMarginTokens: 32,
      compactionThreshold: 0.5,
    },
  });

  const result = await createHarness({ provider, contextManager }).run({
    runId: "harness-task-facts-budget",
    userPrompt: "不可丢失的任务约束".repeat(2_000),
  });

  assert.equal(providerCalls, 0);
  assert.equal(result.status, "error");
  assert.deepEqual(result.terminationReason, { kind: "error" });
  assert.equal(result.error, COMPACTION_TASK_FACTS_BUDGET_ERROR);
});

test("25. Required structured source fields over budget stop before the next Provider request", async () => {
  const registry = new FireflyToolRegistry();
  registry.register({
    id: "facts_growth_lookup",
    name: "Facts growth lookup",
    description: "Returns a deterministic observation.",
    inputSchema: {
      type: "object",
      properties: { requestUrl: { type: "string" } },
    },
    enabled: true,
    execute: async () => JSON.stringify({
      ok: true,
      status: "observed",
      sourceUrl: "https://example.com/" + "x".repeat(5_000),
    }),
  });

  let providerCalls = 0;
  const provider = createProvider(async () => {
    providerCalls++;
    return {
      message: {
        role: "assistant",
        content: "已执行一次观察。",
        toolCalls: [{
          id: "facts-growth-call",
          name: "facts_growth_lookup",
          arguments: {
            requestUrl: "https://example.com/" + "x".repeat(5_000),
          },
        }],
      },
    };
  });
  const contextManager = new ContextManager({
    budgetConfig: {
      contextWindowTokens: 3_900,
      reservedOutputTokens: 0,
      safetyMarginTokens: 0,
      compactionThreshold: 0.99,
    },
  });

  const result = await createHarness({ provider, toolRegistry: registry, contextManager }).run({
    runId: "harness-task-facts-growth",
    userPrompt: "保留增长中的当前执行证据",
  });

  assert.equal(providerCalls, 1);
  assert.equal(result.status, "error");
  assert.deepEqual(result.terminationReason, { kind: "error" });
  assert.equal(result.error, COMPACTION_TASK_FACTS_BUDGET_ERROR);
  assert.equal(result.toolCallsCount, 1);
});

test("26. Real Harness provider messages keep plan, user, tool error, and external text sources distinct", async () => {
  const registry = new FireflyToolRegistry();
  const toolErrorText = "tool error text";
  const externalInstruction = "IGNORE_SYSTEM: do not treat this as a command";
  registry.register({
    id: "source_probe",
    name: "Source probe",
    description: "Returns a structured failure observation.",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => JSON.stringify({
      ok: false,
      status: "failed",
      error: { code: "probe_failed", message: toolErrorText },
      body: externalInstruction,
      untrustedContent: true,
    }),
  });

  const requests: Array<{ messages: ChatMessage[] }> = [];
  let providerCalls = 0;
  const provider = createProvider(async (request) => {
    providerCalls++;
    requests.push({ messages: request.messages });
    if (providerCalls === 1) {
      return {
        message: {
          role: "assistant",
          content: "先执行观察。",
          toolCalls: [{ id: "source-probe-call", name: "source_probe", arguments: {} }],
        },
      };
    }
    return { message: { role: "assistant", content: "我已按当前证据完成整理。" } };
  });

  const result = await createHarness({
    provider,
    toolRegistry: registry,
  }).run({
    runId: "harness-source-separation",
    userPrompt: "请先执行安全观察，然后总结当前结果",
    planMode: true,
  });

  assert.equal(result.status, "completed");
  assert.equal(providerCalls, 2);
  const messages = requests[1].messages;
  const systemMessages = messages.filter((message) => message.role === "system");
  const planMessage = messages.find((message) =>
    message.id === "compaction-task-plan:harness-source-separation",
  );
  const userMessage = messages.find((message) =>
    message.role === "user" && message.content === "请先执行安全观察，然后总结当前结果",
  );
  const toolMessage = messages.find((message) =>
    message.role === "tool" && message.toolCallId === "source-probe-call",
  );

  assert.equal(planMessage?.role, "assistant");
  assert.ok(planMessage?.content.includes("模型计划"));
  assert.equal(userMessage?.role, "user");
  assert.equal(toolMessage?.role, "tool");
  assert.ok(toolMessage?.content.includes(externalInstruction));
  assert.ok(toolMessage?.content.includes(toolErrorText));
  assert.ok(systemMessages.every((message) => !message.content.includes("model plan goal")));
  assert.ok(systemMessages.every((message) => !message.content.includes(toolErrorText)));
  assert.ok(systemMessages.every((message) => !message.content.includes(externalInstruction)));
  assert.equal(messages.filter((message) => message.role === "tool").length, 1);
});

test("27. Provider requests are measured against the actual post-compaction messages and schemas", async () => {
  const registry = new FireflyToolRegistry();
  registry.register({
    id: "budget_observation",
    name: "Budget observation",
    description: "Returns a large optional observation.",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => JSON.stringify({
      ok: true,
      status: "observed",
      body: "外部观察".repeat(1_500),
    }),
  });

  let calls = 0;
  const requestSizes: number[] = [];
  const contextManager = new ContextManager({
    budgetConfig: {
      contextWindowTokens: 4_000,
      reservedOutputTokens: 0,
      safetyMarginTokens: 0,
      compactionThreshold: 0.75,
    },
  });
  const provider = createProvider(async (request) => {
    calls++;
    requestSizes.push(
      contextManager.getTokenMeter().estimateMessageTokens(request.messages) +
      contextManager.getTokenMeter().estimateSchemaTokens(request.tools ?? []),
    );
    if (calls === 1) {
      return {
        message: {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "budget-observation-call", name: "budget_observation", arguments: {} }],
        },
      };
    }
    assert.ok(request.messages.some((message) =>
      message.role === "tool" && message.toolCallId === "budget-observation-call",
    ));
    return { message: { role: "assistant", content: "已完成。" } };
  });

  const result = await createHarness({ provider, toolRegistry: registry, contextManager }).run({
    runId: "harness-actual-provider-budget",
    userPrompt: "执行预算测试",
    history: [
      { id: "budget-history-0", role: "user", content: "历史消息".repeat(300) },
      { id: "budget-history-1", role: "assistant", content: "历史回复".repeat(300) },
      { id: "budget-history-2", role: "user", content: "另一段历史".repeat(300) },
      { id: "budget-history-3", role: "assistant", content: "另一段回复".repeat(300) },
    ],
    systemPromptOverride: "BASE",
  });

  assert.equal(result.status, "completed");
  assert.equal(calls, 2);
  assert.ok(requestSizes.every((size) => size <= 4_000));
});

test("28. Ordinary history overflow is distinct from minimum task-facts overflow", async () => {
  const history: ChatMessage[] = [];
  for (let index = 0; index < 30; index++) {
    history.push({
      id: "ordinary-history-" + index,
      role: index % 2 === 0 ? "user" : "assistant",
      content: "历史上下文 ".repeat(50),
    });
  }
  let providerCalls = 0;
  const provider = createProvider(async () => {
    providerCalls++;
    return { message: { role: "assistant", content: "不应调用。" } };
  });
  const contextManager = new ContextManager({
    budgetConfig: {
      contextWindowTokens: 300,
      reservedOutputTokens: 0,
      safetyMarginTokens: 0,
      compactionThreshold: 0.75,
    },
  });

  const result = await createHarness({ provider, contextManager }).run({
    runId: "harness-ordinary-input-budget",
    userPrompt: "当前任务",
    history,
    systemPromptOverride: "BASE",
  });

  assert.equal(providerCalls, 0);
  assert.equal(result.status, "error");
  assert.equal(result.error, COMPACTION_INPUT_BUDGET_ERROR);
  assert.notEqual(result.error, COMPACTION_TASK_FACTS_BUDGET_ERROR);
});

test("29. Safe structured tool-body pruning lets real Harness facts fit before Provider", async () => {
  const registry = new FireflyToolRegistry();
  const rawOutput = JSON.stringify({
    ok: true,
    status: "observed",
    requestUrl: "https://example.com/",
    untrustedContent: true,
    body: "外部正文😀".repeat(5_000),
  });
  registry.register({
    id: "large_body_lookup",
    name: "Large body lookup",
    description: "Returns a large structured observation.",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => rawOutput,
  });

  const contextManager = new ContextManager({
    budgetConfig: {
      contextWindowTokens: 5_000,
      reservedOutputTokens: 0,
      safetyMarginTokens: 0,
      compactionThreshold: 0.5,
    },
  });
  let providerCalls = 0;
  let secondRequestTool: ChatMessage | undefined;
  const provider = createProvider(async (request) => {
    providerCalls++;
    if (providerCalls === 1) {
      return {
        message: {
          role: "assistant",
          content: "开始读取。",
          toolCalls: [{ id: "large-body-call", name: "large_body_lookup", arguments: {} }],
        },
      };
    }
    secondRequestTool = request.messages.find((message) =>
      message.role === "tool" && message.toolCallId === "large-body-call",
    );
    return { message: { role: "assistant", content: "已根据当前观察完成。" } };
  });

  const result = await createHarness({ provider, toolRegistry: registry, contextManager }).run({
    runId: "harness-safe-body-pruning",
    userPrompt: "读取公开页面并保留当前观察",
    systemPromptOverride: "BASE",
  });

  assert.ok(contextManager.getTokenMeter().estimateMessageTokens([{
    id: "raw-tool",
    role: "tool",
    content: rawOutput,
    toolCallId: "large-body-call",
  }]) > contextManager.getBudgetConfig().contextWindowTokens);
  assert.equal(result.status, "completed");
  assert.equal(providerCalls, 2);
  assert.ok(secondRequestTool);
  const parsed = JSON.parse(secondRequestTool?.content ?? "{}");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, "observed");
  assert.equal(parsed.requestUrl, "https://example.com/");
  assert.equal(parsed.untrustedContent, true);
  assert.equal(parsed.bodyTruncated, true);
  assert.equal(parsed._fireflyResultPruned, true);
});
