import test from "node:test";
import assert from "node:assert/strict";
import { FireflyToolRegistry } from "../../../dist/main/main/tools/tool-registry.js";
import { ToolExecutionEngine } from "../../../dist/main/main/runtime/execution/tool-execution-engine.js";
import { ToolPolicyEvaluator } from "../../../dist/main/main/runtime/execution/tool-policy.js";
import { ToolBatchPlanner } from "../../../dist/main/main/runtime/execution/tool-concurrency.js";
import { ToolResultPolicy } from "../../../dist/main/main/runtime/execution/tool-result-policy.js";
import { AgentEventBus } from "../../../dist/main/main/orchestrator/agent-events.js";
import { FireflyAgentCore } from "../../../dist/main/main/orchestrator/firefly-agent-core.js";

test("1. Policy Denied: Blacklist and whitelist enforcement", async () => {
  const registry = new FireflyToolRegistry();
  registry.register({
    id: "dangerous_tool",
    name: "Dangerous Tool",
    description: "Dangerous",
    enabled: true,
    risk: "high_risk",
    inputSchema: { type: "object", properties: {} },
    execute: async () => JSON.stringify({ ok: true }),
  });

  const eventBus = new AgentEventBus();
  const deniedEvents = [];
  eventBus.on("tool:denied", (e) => deniedEvents.push(e));

  const engine = new ToolExecutionEngine(
    registry,
    { deniedTools: ["dangerous_tool"] },
    eventBus,
  );

  const res = await engine.executeToolCall(
    { id: "call-1", name: "dangerous_tool", arguments: {} },
    { runId: "r1", step: 1, toolCallsCount: 1 },
  );

  assert.equal(res.isError, true);
  assert.ok(res.output.includes("policy_denied"));
  assert.equal(deniedEvents.length, 1);
  assert.equal(deniedEvents[0].toolName, "dangerous_tool");
});

test("2. Safety Level & Confirmation Requirement: Blocks unconfirmed high-risk tools", async () => {
  const registry = new FireflyToolRegistry();
  registry.register({
    id: "system_reboot",
    name: "System Reboot",
    description: "Reboot system",
    enabled: true,
    safetyLevel: "confirm_required",
    inputSchema: { type: "object", properties: {} },
    execute: async () => JSON.stringify({ ok: true, status: "rebooting" }),
  });

  const engine = new ToolExecutionEngine(registry, {});
  const res = await engine.executeToolCall(
    { id: "call-2", name: "system_reboot", arguments: {} },
    { runId: "r1", step: 1, toolCallsCount: 1 },
  );

  assert.equal(res.isError, true);
  assert.ok(res.output.includes("confirmation_required"));
});

test("3. Tool Timeout: Long-running tool execution times out safely", async () => {
  const registry = new FireflyToolRegistry();
  registry.register({
    id: "slow_tool",
    name: "Slow Tool",
    description: "Slow",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    execute: async (_args, ctx) => {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 500);
        ctx?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("aborted"));
        });
      });
      return JSON.stringify({ ok: true });
    },
  });

  const eventBus = new AgentEventBus();
  const timeouts = [];
  eventBus.on("tool:timeout", (e) => timeouts.push(e));

  const engine = new ToolExecutionEngine(
    registry,
    { rules: { slow_tool: { timeoutMs: 50, maxRetries: 0 } } },
    eventBus,
  );

  const res = await engine.executeToolCall(
    { id: "call-slow", name: "slow_tool", arguments: {} },
    { runId: "r1", step: 1, toolCallsCount: 1 },
  );

  assert.equal(res.isError, true);
  assert.ok(res.output.includes("tool_timeout"));
  assert.equal(timeouts.length, 1);
});

test("4. Transient Failure Retry: Tool with transient failure retries and succeeds", async () => {
  const registry = new FireflyToolRegistry();
  let attempt = 0;
  registry.register({
    id: "flaky_tool",
    name: "Flaky Tool",
    description: "Flaky",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    execute: async () => {
      attempt++;
      if (attempt === 1) {
        return JSON.stringify({ ok: false, error: "network_timeout", message: "Temporary socket error" });
      }
      return JSON.stringify({ ok: true, data: "success_on_retry" });
    },
  });

  const eventBus = new AgentEventBus();
  const retries = [];
  eventBus.on("tool:retry", (e) => retries.push(e));

  const engine = new ToolExecutionEngine(
    registry,
    { rules: { flaky_tool: { maxRetries: 2, retryBackoffMs: 10 } } },
    eventBus,
  );

  const res = await engine.executeToolCall(
    { id: "call-flaky", name: "flaky_tool", arguments: {} },
    { runId: "r1", step: 1, toolCallsCount: 1 },
  );

  assert.equal(res.isError, false);
  assert.ok(res.output.includes("success_on_retry"));
  assert.equal(retries.length, 1);
  assert.equal(attempt, 2);
});

test("5. Permanent Failure: Non-transient error does NOT retry", async () => {
  const registry = new FireflyToolRegistry();
  let attempt = 0;
  registry.register({
    id: "invalid_tool",
    name: "Invalid Tool",
    description: "Invalid",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    execute: async () => {
      attempt++;
      return JSON.stringify({ ok: false, error: "invalid_argument", message: "Param missing" });
    },
  });

  const eventBus = new AgentEventBus();
  const retries = [];
  eventBus.on("tool:retry", (e) => retries.push(e));

  const engine = new ToolExecutionEngine(registry, {}, eventBus);
  const res = await engine.executeToolCall(
    { id: "call-inv", name: "invalid_tool", arguments: {} },
    { runId: "r1", step: 1, toolCallsCount: 1 },
  );

  assert.equal(res.isError, true);
  assert.equal(attempt, 1, "Must not retry permanent errors");
  assert.equal(retries.length, 0);
});

test("6. Cancellation: AbortSignal stops execution immediately", async () => {
  const registry = new FireflyToolRegistry();
  registry.register({
    id: "long_running",
    name: "Long Running",
    description: "Long",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    execute: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return JSON.stringify({ ok: true });
    },
  });

  const abortController = new AbortController();
  abortController.abort(); // already cancelled

  const engine = new ToolExecutionEngine(registry, {});
  const res = await engine.executeToolCall(
    { id: "call-cancel", name: "long_running", arguments: {} },
    { runId: "r1", step: 1, toolCallsCount: 1, signal: abortController.signal },
  );

  assert.equal(res.isError, true);
  assert.ok(res.output.includes("tool_cancelled"));
});

test("7. Concurrency Planner: Groups read-only tools in parallel, state-changing in serial", () => {
  const decisionMap = new Map();
  decisionMap.set("search_1", { toolName: "search_1", executionMode: "parallel" });
  decisionMap.set("search_2", { toolName: "search_2", executionMode: "parallel" });
  decisionMap.set("play_action", { toolName: "play_action", executionMode: "serial" });
  decisionMap.set("status_1", { toolName: "status_1", executionMode: "parallel" });

  const calls = [
    { id: "1", name: "search_1", arguments: {} },
    { id: "2", name: "search_2", arguments: {} },
    { id: "3", name: "play_action", arguments: {} },
    { id: "4", name: "status_1", arguments: {} },
  ];

  const batches = ToolBatchPlanner.plan(calls, decisionMap, 4);

  assert.equal(batches.length, 3);
  assert.equal(batches[0].mode, "parallel");
  assert.equal(batches[0].calls.length, 2); // search_1 + search_2
  assert.equal(batches[1].mode, "serial");
  assert.equal(batches[1].calls.length, 1); // play_action
  assert.equal(batches[2].mode, "parallel");
  assert.equal(batches[2].calls.length, 1); // status_1
});

test("8. Tool Result Policy: Pruning super large outputs cleanly", () => {
  const hugeOutput = "RESULT_" + "A".repeat(10000);
  const rawResult = { toolCallId: "c1", name: "large_tool", output: hugeOutput, isError: false };

  const processed = ToolResultPolicy.apply(rawResult, { maxResultChars: 200 });

  assert.ok(processed.output.length <= 250);
  assert.ok(processed.output.includes("ToolResultPolicy 自动修剪"));
});

test("9. Malformed Tool Result: Non-JSON raw strings handled gracefully", async () => {
  const registry = new FireflyToolRegistry();
  registry.register({
    id: "raw_string_tool",
    name: "Raw String Tool",
    description: "Raw",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    execute: async () => "Hello plain string output!",
  });

  const engine = new ToolExecutionEngine(registry, {});
  const res = await engine.executeToolCall(
    { id: "call-raw", name: "raw_string_tool", arguments: {} },
    { runId: "r1", step: 1, toolCallsCount: 1 },
  );

  assert.equal(res.isError, false);
  assert.equal(res.output, "Hello plain string output!");
});

test("10. Unknown Tool: Unregistered tool returns structured error", async () => {
  const registry = new FireflyToolRegistry();
  const engine = new ToolExecutionEngine(registry, {});

  const res = await engine.executeToolCall(
    { id: "call-unknown", name: "ghost_tool", arguments: {} },
    { runId: "r1", step: 1, toolCallsCount: 1 },
  );

  assert.equal(res.isError, true);
  assert.ok(res.output.includes("tool_not_found"));
});

test("11. Tool Budget Exceeded: Max tool calls per run enforced", async () => {
  const registry = new FireflyToolRegistry();
  registry.register({
    id: "normal_tool",
    name: "Normal",
    description: "Normal",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    execute: async () => JSON.stringify({ ok: true }),
  });

  const engine = new ToolExecutionEngine(registry, { maxToolCallsPerRun: 2 });

  // Call 3 exceeds maxToolCallsPerRun: 2
  const res = await engine.executeToolCall(
    { id: "call-3", name: "normal_tool", arguments: {} },
    { runId: "r1", step: 1, toolCallsCount: 3 },
  );

  assert.equal(res.isError, true);
  assert.ok(res.output.includes("budget_exceeded"));
});

test("12. Tool Execution Exception: Tool throwing runtime error does not crash", async () => {
  const registry = new FireflyToolRegistry();
  registry.register({
    id: "exploding_tool",
    name: "Exploding",
    description: "Exploding",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    execute: async () => {
      throw new Error("Hardware explosion!");
    },
  });

  const engine = new ToolExecutionEngine(registry, { defaultMaxRetries: 0 });
  const res = await engine.executeToolCall(
    { id: "call-boom", name: "exploding_tool", arguments: {} },
    { runId: "r1", step: 1, toolCallsCount: 1 },
  );

  assert.equal(res.isError, true);
  assert.ok(res.output.includes("Hardware explosion!"));
});

test("13. Multi-turn Tool Calling with FireflyAgentCore & ToolExecutionEngine", async () => {
  const registry = new FireflyToolRegistry();
  registry.register({
    id: "test_action",
    name: "Test Action",
    description: "Test Action",
    enabled: true,
    inputSchema: { type: "object", properties: {} },
    execute: async () => JSON.stringify({ ok: true, action: "idle" }),
  });

  let round = 0;
  const mockProvider = {
    async generateCompletion() {
      round++;
      if (round === 1) {
        return {
          message: {
            role: "assistant",
            content: "",
            toolCalls: [{ id: "c_action", name: "test_action", arguments: {} }],
          },
        };
      }
      return {
        message: {
          role: "assistant",
          content: "动作已播放完毕，开拓者！",
        },
      };
    },
  };

  const eventBus = new AgentEventBus();
  const authorizedTools = [];
  eventBus.on("tool:authorized", (e) => authorizedTools.push(e));

  const core = new FireflyAgentCore({
    provider: mockProvider,
    toolRegistry: registry,
    eventBus,
  });

  const result = await core.run({ userPrompt: "打个招呼吧" });

  assert.equal(result.status, "completed");
  assert.equal(result.finalText, "动作已播放完毕，开拓者！");
  assert.equal(result.toolCallsCount, 1);
  assert.equal(authorizedTools.length, 1);
  assert.equal(authorizedTools[0].toolName, "test_action");
});
