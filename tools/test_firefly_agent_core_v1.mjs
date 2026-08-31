import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { FireflyAgentCore } from "../dist/main/main/agent/firefly-agent-core.js";
import { FireflyHarness } from "../dist/main/main/agent/harness/firefly-harness.js";
import { AgentSession } from "../dist/main/main/agent/agent-session.js";
import { AgentEventBus } from "../dist/main/main/agent/agent-events.js";
import { FireflyToolRegistry } from "../dist/main/main/tools/tool-registry.js";
import { createPlayLive2DActionTool } from "../dist/main/main/tools/play-live2d-action.js";

function createMockProvider(turnHandler) {
  return {
    id: "mock",
    name: "Mock Provider",
    capabilities: { supportsNativeToolCalling: true, supportsStreaming: false },
    getConfig: () => ({ provider: "local", baseUrl: "", apiKey: "", model: "mock", temperature: 0.7, enableStreaming: false }),
    generateCompletion: async (request, signal) => {
      if (signal?.aborted) throw new Error("Request aborted");
      return turnHandler(request);
    },
  };
}

test("1. 普通对话: Single-turn standard chat without tools", async () => {
  const toolRegistry = new FireflyToolRegistry();
  const eventBus = new AgentEventBus();
  const events = [];
  eventBus.onAny((e) => events.push(e));

  const provider = createMockProvider(() => ({
    message: { role: "assistant", content: "你好呀，开拓者！" },
  }));

  const core = new FireflyAgentCore({ provider, toolRegistry, eventBus });
  const result = await core.run({ userPrompt: "你好！" });

  assert.equal(result.status, "completed");
  assert.equal(result.finalText, "你好呀，开拓者！");
  assert.equal(result.toolCallsCount, 0);
  assert.equal(result.roundsCount, 1);
  assert.ok(events.some((e) => e.type === "agent:started"));
  assert.ok(events.some((e) => e.type === "agent:final-answer"));
  assert.ok(events.some((e) => e.type === "agent:finished"));
});

test("2. 一次 tool call: Single tool call executed and returned to LLM", async () => {
  const toolRegistry = new FireflyToolRegistry();
  const dispatchedTargets = [];
  toolRegistry.register(
    createPlayLive2DActionTool({
      sendToPet: (_ch, payload) => dispatchedTargets.push(payload),
    })
  );

  let round = 0;
  const provider = createMockProvider((req) => {
    round++;
    if (round === 1) {
      return {
        message: {
          role: "assistant",
          content: "我要做个动作！",
          toolCalls: [{ id: "call_1", name: "play_live2d_action", arguments: { name: "开心" } }],
        },
      };
    }
    return {
      message: { role: "assistant", content: "动作展示完毕，开拓者！" },
    };
  });

  const core = new FireflyAgentCore({ provider, toolRegistry });
  const result = await core.run({ userPrompt: "展示开心动作" });

  assert.equal(result.status, "completed");
  assert.equal(result.toolCallsCount, 1);
  assert.equal(result.roundsCount, 2);
  assert.equal(result.finalText, "动作展示完毕，开拓者！");
  assert.equal(dispatchedTargets.length, 1);
  assert.equal(dispatchedTargets[0].action_id, "happy");
});

test("3. 多轮 tool call: Multi-turn tool execution across multiple rounds", async () => {
  const toolRegistry = new FireflyToolRegistry();
  const dispatchedTargets = [];
  toolRegistry.register(
    createPlayLive2DActionTool({
      sendToPet: (_ch, payload) => dispatchedTargets.push(payload),
    })
  );

  let round = 0;
  const provider = createMockProvider(() => {
    round++;
    if (round === 1) {
      return {
        message: {
          role: "assistant",
          content: "先做思考动作",
          toolCalls: [{ id: "call_think", name: "play_live2d_action", arguments: { name: "思考" } }],
        },
      };
    } else if (round === 2) {
      return {
        message: {
          role: "assistant",
          content: "再做开心动作",
          toolCalls: [{ id: "call_happy", name: "play_live2d_action", arguments: { name: "开心" } }],
        },
      };
    }
    return {
      message: { role: "assistant", content: "两组动作均已完成！" },
    };
  });

  const core = new FireflyAgentCore({ provider, toolRegistry });
  const result = await core.run({ userPrompt: "做两个动作" });

  assert.equal(result.status, "completed");
  assert.equal(result.toolCallsCount, 2);
  assert.equal(result.roundsCount, 3);
  assert.equal(result.finalText, "两组动作均已完成！");
  assert.equal(dispatchedTargets.length, 2);
  assert.equal(dispatchedTargets[0].action_id, "thinking");
  assert.equal(dispatchedTargets[1].action_id, "happy");
});

test("4, 5, 6. Transcript 写回: assistant, tool call, tool result verified in transcript", async () => {
  const toolRegistry = new FireflyToolRegistry();
  toolRegistry.register(
    createPlayLive2DActionTool({
      sendToPet: () => {},
    })
  );

  let round = 0;
  const provider = createMockProvider(() => {
    round++;
    if (round === 1) {
      return {
        message: {
          role: "assistant",
          content: "思考中...",
          toolCalls: [{ id: "call_check_456", name: "play_live2d_action", arguments: { name: "思考" } }],
        },
      };
    }
    return {
      message: { role: "assistant", content: "思考结束！" },
    };
  });

  const core = new FireflyAgentCore({ provider, toolRegistry });
  const result = await core.run({ userPrompt: "帮我想想" });

  const transcript = result.transcript;
  // 4. Assistant message in transcript
  const asstMsgs = transcript.filter((m) => m.role === "assistant");
  assert.ok(asstMsgs.length >= 2, "Transcript must contain both assistant messages");

  // 5. Tool call attached to assistant message
  assert.ok(asstMsgs[0].toolCalls && asstMsgs[0].toolCalls.length > 0, "First assistant message must record toolCalls");
  assert.equal(asstMsgs[0].toolCalls[0].id, "call_check_456");

  // 6. Tool result in transcript with role='tool' and toolCallId
  const toolMsgs = transcript.filter((m) => m.role === "tool");
  assert.equal(toolMsgs.length, 1, "Transcript must record tool result message");
  assert.equal(toolMsgs[0].toolCallId, "call_check_456");
  assert.ok(toolMsgs[0].content.includes("ok"), "Tool result content must contain execution response");
});

test("7. Cancellation: AbortController cancels in-flight run cleanly", async () => {
  const toolRegistry = new FireflyToolRegistry();
  const abortController = new AbortController();

  const provider = createMockProvider(async () => {
    // Simulate long delay then check abort
    await new Promise((r) => setTimeout(r, 50));
    return { message: { role: "assistant", content: "延迟回复" } };
  });

  const core = new FireflyAgentCore({ provider, toolRegistry });
  const runPromise = core.run({ userPrompt: "测试取消", signal: abortController.signal });

  // Cancel immediately
  setTimeout(() => abortController.abort(), 10);
  const result = await runPromise;

  assert.equal(result.status, "cancelled");
  assert.equal(result.finalText, "（对话已被取消）");
});

test("8. Timeout: Total run timeout aborts execution", async () => {
  const toolRegistry = new FireflyToolRegistry();

  const provider = createMockProvider(async () => {
    await new Promise((r) => setTimeout(r, 200));
    return { message: { role: "assistant", content: "超时未达" } };
  });

  const core = new FireflyAgentCore({
    provider,
    toolRegistry,
    config: { totalTimeoutMs: 30 },
  });

  const result = await core.run({ userPrompt: "测试超时" });
  assert.equal(result.status, "timeout");
});

test("9. LLM failure: Provider throwing exception is safely handled", async () => {
  const toolRegistry = new FireflyToolRegistry();

  const provider = createMockProvider(() => {
    throw new Error("503 Service Unavailable");
  });

  const core = new FireflyAgentCore({ provider, toolRegistry });
  const result = await core.run({ userPrompt: "网络故障测试" });

  assert.equal(result.status, "error");
  assert.ok(result.error?.includes("503"), "Result error must record exception message");
  assert.equal(result.finalText, "我在这里，开拓者。", "Fallback text must be provided gracefully");
});

test("10. Tool failure: Tool execution error is passed back into transcript as tool output", async () => {
  const toolRegistry = new FireflyToolRegistry();
  toolRegistry.register({
    id: "failing_tool",
    description: "Always fails",
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    execute: async () => {
      throw new Error("Sensor disconnected");
    },
  });

  let round = 0;
  const provider = createMockProvider((req) => {
    round++;
    if (round === 1) {
      return {
        message: {
          role: "assistant",
          content: "调用故障工具",
          toolCalls: [{ id: "call_fail", name: "failing_tool", arguments: {} }],
        },
      };
    }
    // LLM inspects tool failure and explains to user
    const toolMsg = req.messages.find((m) => m.role === "tool");
    return {
      message: { role: "assistant", content: `工具执行失败：${toolMsg?.content}` },
    };
  });

  const core = new FireflyAgentCore({ provider, toolRegistry });
  const result = await core.run({ userPrompt: "调用坏工具" });

  assert.equal(result.status, "completed");
  assert.ok(result.finalText.includes("Sensor disconnected"), "LLM should receive and explain tool error");
});

test("11. Final answer: Result object contains complete fields", async () => {
  const toolRegistry = new FireflyToolRegistry();
  const provider = createMockProvider(() => ({
    message: { role: "assistant", content: "最终答案。" },
  }));

  const core = new FireflyAgentCore({ provider, toolRegistry });
  const result = await core.run({ userPrompt: "测试最终答案", conversationId: "conv-123" });

  assert.equal(result.status, "completed");
  assert.equal(result.conversationId, "conv-123");
  assert.equal(result.finalText, "最终答案。");
  assert.ok(result.durationMs >= 0);
  assert.ok(Array.isArray(result.transcript));
});

test("12. Event lifecycle: Typed events emitted in correct order", async () => {
  const toolRegistry = new FireflyToolRegistry();
  const eventBus = new AgentEventBus();
  const eventTypes = [];
  eventBus.onAny((e) => eventTypes.push(e.type));

  const provider = createMockProvider(() => ({
    message: { role: "assistant", content: "事件生命周期验证" },
  }));

  const core = new FireflyAgentCore({ provider, toolRegistry, eventBus });
  await core.run({ userPrompt: "生命周期" });

  assert.deepEqual(eventTypes, [
    "agent:started",
    "agent:step-start",
    "agent:llm-request",
    "agent:assistant-message",
    "agent:final-answer",
    "agent:finished",
  ]);
});

test("13. Contract check: Both FireflyHarness and FireflyAgentCore implement IAgentCore", () => {
  const toolRegistry = new FireflyToolRegistry();
  const core = new FireflyAgentCore({ toolRegistry });
  const harness = new FireflyHarness({ toolRegistry });

  assert.equal(typeof core.run, "function");
  assert.equal(typeof core.cancel, "function");
  assert.equal(typeof core.cancelAll, "function");
  assert.equal(typeof core.setProvider, "function");

  assert.equal(typeof harness.run, "function");
  assert.equal(typeof harness.cancel, "function");
  assert.equal(typeof harness.cancelAll, "function");
  assert.equal(typeof harness.setProvider, "function");
});

test("14. Isolation check: FireflyAgentCore source does NOT import FireflyHarness", () => {
  const sourcePath = path.join(process.cwd(), "src", "main", "agent", "firefly-agent-core.ts");
  const sourceContent = fs.readFileSync(sourcePath, "utf-8");

  assert.ok(!sourceContent.includes("FireflyHarness"), "FireflyAgentCore must not import or mention FireflyHarness");
  assert.ok(!sourceContent.includes("harness/firefly-harness"), "FireflyAgentCore must not import harness/firefly-harness");
});
