import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { FireflyAgentCore } from "../dist/main/main/orchestrator/firefly-agent-core.js";
import { AgentSession } from "../dist/main/main/orchestrator/agent-session.js";
import { AgentEventBus } from "../dist/main/main/orchestrator/agent-events.js";
import { FireflyToolRegistry } from "../dist/main/main/tools/tool-registry.js";
import { FireflyMemoryService } from "../dist/main/main/character/memory/memory-service.js";

// Helper: Create a controllable Mock LLM Provider
function createControllableMockLlm(handlers = {}) {
  const calls = [];
  const provider = {
    id: handlers.id || "mock-llm",
    name: handlers.name || "Mock LLM Provider",
    capabilities: { supportsNativeToolCalling: true, supportsStreaming: false },
    getConfig: () => ({ provider: "local", baseUrl: "", apiKey: "", model: "mock", temperature: 0.7, enableStreaming: false }),
    generateCompletion: async (request, signal) => {
      calls.push({ request, aborted: signal?.aborted });
      if (handlers.onGenerate) {
        return handlers.onGenerate(request, signal, calls.length);
      }
      return {
        message: {
          role: "assistant",
          content: "我是流萤，开拓者！",
        },
      };
    },
  };
  return { provider, calls };
}

// 1. Structure & Static Audit
test("1. FireflyAgentCore Structure & Static Decoupling Audit", () => {
  const coreFilePath = path.join(process.cwd(), "src", "main", "orchestrator", "firefly-agent-core.ts");
  const coreSource = fs.readFileSync(coreFilePath, "utf-8");

  // Verify zero references to forbidden modules in core
  assert.equal(coreSource.includes("FireflyHarness"), false, "Must NOT import or reference FireflyHarness");
  assert.equal(coreSource.includes("MusicService"), false, "Must NOT directly reference MusicService");
  assert.equal(coreSource.includes("QQMusicDesktopBridge"), false, "Must NOT directly reference QQMusicDesktopBridge");
  assert.equal(coreSource.includes("Live2DManager"), false, "Must NOT directly reference Live2DManager");
  assert.equal(coreSource.includes("TtsSessionService"), false, "Must NOT directly reference TtsSessionService");
  assert.equal(coreSource.includes("BrowserWindow"), false, "Must NOT directly reference BrowserWindow");

  // Verify index.ts instantiates FireflyAgentCore
  const indexFilePath = path.join(process.cwd(), "src", "main", "index.ts");
  const indexSource = fs.readFileSync(indexFilePath, "utf-8");
  assert.ok(indexSource.includes("new FireflyAgentCore("), "index.ts must instantiate FireflyAgentCore");
  assert.equal(indexSource.includes("new FireflyHarness("), false, "index.ts must NOT instantiate FireflyHarness");
});

// 2. Normal Chat Conversation & Event Sequence
test("2. Normal Chat: Message History & Exact Event Sequence", async () => {
  const emittedEvents = [];
  const eventBus = new AgentEventBus();
  eventBus.onAny((ev) => emittedEvents.push(ev.type));

  const { provider } = createControllableMockLlm({
    onGenerate: async () => ({
      message: { role: "assistant", content: "开拓者，今天天气真好呢！" },
    }),
  });

  const toolRegistry = new FireflyToolRegistry();
  const core = new FireflyAgentCore({ provider, toolRegistry, eventBus });

  const res = await core.run({ userPrompt: "今天天气怎么样？" });

  assert.equal(res.status, "completed");
  assert.equal(res.finalText, "开拓者，今天天气真好呢！");
  assert.equal(res.roundsCount, 1);
  assert.equal(res.toolCallsCount, 0);

  // Check transcript
  assert.equal(res.transcript[res.transcript.length - 2].role, "user");
  assert.equal(res.transcript[res.transcript.length - 2].content, "今天天气怎么样？");
  assert.equal(res.transcript[res.transcript.length - 1].role, "assistant");
  assert.equal(res.transcript[res.transcript.length - 1].content, "开拓者，今天天气真好呢！");

  // Verify exact event ordering
  assert.deepEqual(emittedEvents, [
    "agent:started",
    "agent:step-start",
    "agent:llm-request",
    "agent:assistant-message",
    "agent:final-answer",
    "agent:finished",
  ]);
});

// 3. Single Tool Call
test("3. Single Tool Call: Transcript Write-Back & Next-Round Visibility", async () => {
  const toolRegistry = new FireflyToolRegistry();
  let toolExecuted = false;
  toolRegistry.register({
    id: "get_weather",
    name: "获取天气",
    description: "获取指定城市的天气",
    inputSchema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
    enabled: true,
    execute: async (args) => {
      toolExecuted = true;
      return JSON.stringify({ city: args.city, weather: "晴朗", temp: "22℃" });
    },
  });

  let round = 0;
  const { provider } = createControllableMockLlm({
    onGenerate: async (request) => {
      round++;
      if (round === 1) {
        return {
          message: {
            role: "assistant",
            content: "好的，我来帮开拓者查一下匹诺康尼的天气！",
            toolCalls: [{ id: "call_w1", name: "get_weather", arguments: { city: "匹诺康尼" } }],
          },
        };
      }
      // In round 2, verify tool message was passed back
      const toolMsg = request.messages.find((m) => m.role === "tool" && m.toolCallId === "call_w1");
      assert.ok(toolMsg, "Round 2 must receive tool result in messages");
      const toolData = JSON.parse(toolMsg.content);
      return {
        message: {
          role: "assistant",
          content: `${toolData.city}现在的天气是${toolData.weather}，气温${toolData.temp}，非常舒适呢！`,
        },
      };
    },
  });

  const core = new FireflyAgentCore({ provider, toolRegistry });
  const res = await core.run({ userPrompt: "帮我查一下匹诺康尼的天气" });

  assert.equal(res.status, "completed");
  assert.equal(res.toolCallsCount, 1);
  assert.equal(res.roundsCount, 2);
  assert.equal(toolExecuted, true);
  assert.ok(res.finalText.includes("匹诺康尼现在的天气是晴朗"));

  // Check transcript completeness
  const roles = res.transcript.map((m) => m.role);
  assert.ok(roles.includes("user"));
  assert.ok(roles.includes("assistant"));
  assert.ok(roles.includes("tool"));
});

// 4. Multi-Turn Tool Calling (>= 3 Tool Rounds)
test("4. Multi-Turn Tool Calling: 3 Tool Rounds & Final Answer", async () => {
  const toolRegistry = new FireflyToolRegistry();
  const executed = [];

  toolRegistry.register({
    id: "tool_a",
    name: "Tool A",
    description: "Step 1",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => {
      executed.push("A");
      return "Result A: 目标已定位";
    },
  });

  toolRegistry.register({
    id: "tool_b",
    name: "Tool B",
    description: "Step 2",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => {
      executed.push("B");
      return "Result B: 功率已就绪";
    },
  });

  toolRegistry.register({
    id: "tool_c",
    name: "Tool C",
    description: "Step 3",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => {
      executed.push("C");
      return "Result C: 任务已达成";
    },
  });

  let round = 0;
  const { provider } = createControllableMockLlm({
    onGenerate: async (request) => {
      round++;
      if (round === 1) {
        return {
          message: {
            role: "assistant",
            content: "第一步：执行 Tool A",
            toolCalls: [{ id: "c1", name: "tool_a", arguments: {} }],
          },
        };
      }
      if (round === 2) {
        return {
          message: {
            role: "assistant",
            content: "第二步：执行 Tool B",
            toolCalls: [{ id: "c2", name: "tool_b", arguments: {} }],
          },
        };
      }
      if (round === 3) {
        return {
          message: {
            role: "assistant",
            content: "第三步：执行 Tool C",
            toolCalls: [{ id: "c3", name: "tool_c", arguments: {} }],
          },
        };
      }
      return {
        message: {
          role: "assistant",
          content: "三道指令已全部完成，开拓者请放心！",
        },
      };
    },
  });

  const core = new FireflyAgentCore({ provider, toolRegistry });
  const res = await core.run({ userPrompt: "请依次执行 A, B, C 三个任务" });

  assert.equal(res.status, "completed");
  assert.equal(res.roundsCount, 4);
  assert.equal(res.toolCallsCount, 3);
  assert.deepEqual(executed, ["A", "B", "C"]);
  assert.equal(res.finalText, "三道指令已全部完成，开拓者请放心！");
});

// 5. Tool Failure Handling (Tool Failure != Agent Crash)
test("5. Tool Failure: Agent Catches Error and Continues to Graceful Final Answer", async () => {
  const toolRegistry = new FireflyToolRegistry();
  toolRegistry.register({
    id: "faulty_tool",
    name: "Faulty Tool",
    description: "Throws an error",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => {
      throw new Error("传感器连接丢失 (Sensor Offline)");
    },
  });

  let round = 0;
  const { provider } = createControllableMockLlm({
    onGenerate: async (request) => {
      round++;
      if (round === 1) {
        return {
          message: {
            role: "assistant",
            content: "正在尝试连接传感器...",
            toolCalls: [{ id: "c_fail", name: "faulty_tool", arguments: {} }],
          },
        };
      }
      // Inspect tool error returned
      const toolMsg = request.messages.find((m) => m.role === "tool");
      assert.ok(toolMsg?.content.includes("Sensor Offline"));
      return {
        message: {
          role: "assistant",
          content: "开拓者，传感器暂时离线了，不过流萤会继续保护你的！",
        },
      };
    },
  });

  const core = new FireflyAgentCore({ provider, toolRegistry });
  const res = await core.run({ userPrompt: "检查传感器状态" });

  assert.equal(res.status, "completed");
  assert.equal(res.toolCallsCount, 1);
  assert.ok(res.finalText.includes("传感器暂时离线了"));
});

// 6. LLM Failure Handling
test("6. LLM Failure: Handles Rejection, Emits Error Event, and Cleans Up State", async () => {
  const emittedEvents = [];
  const eventBus = new AgentEventBus();
  eventBus.onAny((ev) => emittedEvents.push(ev.type));

  const { provider } = createControllableMockLlm({
    onGenerate: async () => {
      throw new Error("API 503 Service Unavailable");
    },
  });

  const toolRegistry = new FireflyToolRegistry();
  const core = new FireflyAgentCore({ provider, toolRegistry, eventBus });

  const res = await core.run({ userPrompt: "你好" });

  assert.equal(res.status, "error");
  assert.ok(res.error?.includes("503"));
  assert.ok(emittedEvents.includes("agent:error"));
  assert.ok(emittedEvents.includes("agent:finished"));

  // Subsequent run must still work
  core.setProvider(
    createControllableMockLlm({
      onGenerate: async () => ({ message: { role: "assistant", content: "服务已恢复！" } }),
    }).provider,
  );

  const res2 = await core.run({ userPrompt: "现在呢？" });
  assert.equal(res2.status, "completed");
  assert.equal(res2.finalText, "服务已恢复！");
});

// 7. Cancellation Scenarios (LLM in-flight, Tool in-flight, Inter-round)
test("7. Cancellation: In-Flight LLM, Tool Execution, and Inter-Round Cancel", async () => {
  const toolRegistry = new FireflyToolRegistry();

  // Scenario A: Cancel during LLM request
  const abortCtrlA = new AbortController();
  const providerA = {
    id: "slow-llm",
    name: "Slow LLM",
    capabilities: { supportsNativeToolCalling: true, supportsStreaming: false },
    getConfig: () => ({ provider: "local", baseUrl: "", apiKey: "", model: "mock", temperature: 0.7, enableStreaming: false }),
    generateCompletion: async (_req, signal) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({ message: { role: "assistant", content: "Finished" } }), 5000);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("Aborted by user"));
        });
      });
    },
  };

  const coreA = new FireflyAgentCore({ provider: providerA, toolRegistry });
  const runPromiseA = coreA.run({ userPrompt: "Test A", signal: abortCtrlA.signal });
  setTimeout(() => abortCtrlA.abort(), 50);
  const resA = await runPromiseA;
  assert.equal(resA.status, "cancelled");
  assert.equal(resA.finalText, "（对话已被取消）");

  // Scenario B: Cancel during Tool execution
  const abortCtrlB = new AbortController();
  toolRegistry.register({
    id: "long_tool",
    name: "Long Tool",
    description: "Takes time",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async (_args, ctx) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve("Tool Done"), 5000);
        ctx?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("Tool Aborted"));
        });
      });
    },
  });

  const { provider: providerB } = createControllableMockLlm({
    onGenerate: async () => ({
      message: {
        role: "assistant",
        content: "Running long tool",
        toolCalls: [{ id: "call_long", name: "long_tool", arguments: {} }],
      },
    }),
  });

  const coreB = new FireflyAgentCore({ provider: providerB, toolRegistry });
  const runPromiseB = coreB.run({ userPrompt: "Test B", signal: abortCtrlB.signal });
  setTimeout(() => abortCtrlB.abort(), 60);
  const resB = await runPromiseB;
  assert.equal(resB.status, "cancelled");

  // Scenario C: Manual cancel() by runId
  const { provider: providerC } = createControllableMockLlm({
    onGenerate: async () => new Promise((resolve) => setTimeout(() => resolve({ message: { role: "assistant", content: "Done" } }), 3000)),
  });

  const coreC = new FireflyAgentCore({ provider: providerC, toolRegistry });
  const runPromiseC = coreC.run({ userPrompt: "Test C", runId: "target-run-c" });
  setTimeout(() => {
    const ok = coreC.cancel("target-run-c");
    assert.equal(ok, true);
  }, 40);
  const resC = await runPromiseC;
  assert.equal(resC.status, "cancelled");
});

// 8. Timeout Differentiated from Cancellation
test("8. Timeout: Total Timeout Aborts Run with 'timeout' Status", async () => {
  const toolRegistry = new FireflyToolRegistry();
  const hangingProvider = {
    id: "hanging-llm",
    name: "Hanging LLM",
    capabilities: { supportsNativeToolCalling: true, supportsStreaming: false },
    getConfig: () => ({ provider: "local", baseUrl: "", apiKey: "", model: "mock", temperature: 0.7, enableStreaming: false }),
    generateCompletion: async (_req, signal) => {
      return new Promise((resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("Timeout abort")));
      });
    },
  };

  const core = new FireflyAgentCore({
    provider: hangingProvider,
    toolRegistry,
    config: { totalTimeoutMs: 150 },
  });

  const res = await core.run({ userPrompt: "Timeout test" });

  assert.equal(res.status, "timeout");
  assert.ok(res.error?.includes("timed out after 150ms"));
  assert.equal(res.finalText, "（对话请求已超时）");
});

// 9. Concurrent Runs: Isolation & Selective Cancellation
test("9. Concurrency: Two Independent Concurrent Runs with Selective Cancel", async () => {
  const toolRegistry = new FireflyToolRegistry();
  const { provider } = createControllableMockLlm({
    onGenerate: async (req, signal) => {
      const isA = req.messages.some((m) => m.content === "Prompt A");
      if (isA) {
        // Run A takes 500ms
        return new Promise((resolve, reject) => {
          const t = setTimeout(() => resolve({ message: { role: "assistant", content: "Reply A" } }), 500);
          signal?.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new Error("Run A Aborted"));
          });
        });
      }
      // Run B completes in 80ms
      return new Promise((resolve) => {
        setTimeout(() => resolve({ message: { role: "assistant", content: "Reply B" } }), 80);
      });
    },
  });

  const core = new FireflyAgentCore({ provider, toolRegistry });

  const runPromiseA = core.run({ userPrompt: "Prompt A", runId: "concurrent-a" });
  const runPromiseB = core.run({ userPrompt: "Prompt B", runId: "concurrent-b" });

  // Cancel Run A only
  setTimeout(() => core.cancel("concurrent-a"), 40);

  const [resA, resB] = await Promise.all([runPromiseA, runPromiseB]);

  assert.equal(resA.status, "cancelled");
  assert.equal(resB.status, "completed");
  assert.equal(resB.finalText, "Reply B");
});

// 10. Provider Hot-Swapping at Runtime
test("10. Provider Switching: Dynamically Swapping Provider Between Runs", async () => {
  const toolRegistry = new FireflyToolRegistry();
  const provider1 = createControllableMockLlm({
    onGenerate: async () => ({ message: { role: "assistant", content: "From Provider 1" } }),
  }).provider;

  const provider2 = createControllableMockLlm({
    onGenerate: async () => ({ message: { role: "assistant", content: "From Provider 2" } }),
  }).provider;

  const core = new FireflyAgentCore({ provider: provider1, toolRegistry });

  const res1 = await core.run({ userPrompt: "Hello 1" });
  assert.equal(res1.finalText, "From Provider 1");

  // Swap to Provider 2
  core.setProvider(provider2);
  const res2 = await core.run({ userPrompt: "Hello 2" });
  assert.equal(res2.finalText, "From Provider 2");
});

// 11. AgentSession Operations & Immutability
test("11. AgentSession: Snapshot Immutability & Message History Tracking", () => {
  const session = new AgentSession({
    initialMessages: [{ id: "m1", role: "user", content: "Hello", timestamp: Date.now() }],
  });

  assert.equal(session.size(), 1);
  assert.equal(session.lastMessage()?.content, "Hello");

  // Snapshot must be a distinct copy
  const snap = session.snapshot();
  snap.push({ id: "m2", role: "assistant", content: "Mutated", timestamp: Date.now() });

  assert.equal(session.size(), 1);
  assert.equal(session.getMessages().length, 1);

  session.append({ id: "m3", role: "assistant", content: "Real append", timestamp: Date.now() });
  assert.equal(session.size(), 2);
  assert.equal(session.lastMessage()?.content, "Real append");

  session.clear();
  assert.equal(session.size(), 0);
});

// 12. AgentEventBus Resilience to Listener Exceptions
test("12. AgentEventBus: Robustness Against Listener Exceptions", async () => {
  const eventBus = new AgentEventBus();

  // Faulty listener that throws
  eventBus.on("agent:step-start", () => {
    throw new Error("Broken third-party listener!");
  });

  const { provider } = createControllableMockLlm({
    onGenerate: async () => ({ message: { role: "assistant", content: "All good" } }),
  });

  const toolRegistry = new FireflyToolRegistry();
  const core = new FireflyAgentCore({ provider, toolRegistry, eventBus });

  // Core must run to completion despite faulty event listener
  const res = await core.run({ userPrompt: "Test listener fault" });
  assert.equal(res.status, "completed");
  assert.equal(res.finalText, "All good");
});
