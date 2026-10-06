/**
 * FireflyHarness 取消传播测试。
 *
 * 验收不变量：
 * - Harness 在 LLM、工具、retry backoff、permission、ask_user、loop-top 任一等待阶段都可取消。
 * - cancelled 不得发 final_answer 事件，不得生成 "最终回复被取消。" finalAnswer。
 * - 每条取消链路只结算一个 terminal：terminateReason="cancelled" + finalAnswer=""。
 * - cancelled 必须保留 externalEffectsMayContinue: true（由 adapter 映射保证，这里测 terminateReason）。
 *
 * 这些测试在实现前应当全部失败：
 * 1. loop-top 取消当前返回 "最终回复被取消。" 而非空 finalAnswer。
 * 2. LLM fetch 中断当前被 catch 块分类为 "error" 而非 "cancelled"。
 * 3. 已开始工具的真实 Promise 未结算前不能释放工作区许可或完成终态。
 * 4. retry backoff sleepWithJitter 不可中断。
 * 5. permission wait 没有 signal race。
 * 6. ask_user wait 没有 signal race。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────

const { fakeAdapter, fakeStreamChatWithSdk, recordUsage, recordRequest } = vi.hoisted(() => {
  const adapter = {
    id: "fake",
    buildRequest: (req: unknown) => ({
      url: "https://fake.local/chat",
      method: "POST" as const,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }),
    parseResponse: (raw: unknown) => raw,
  };
  return {
    fakeAdapter: adapter,
    recordUsage: vi.fn(),
    recordRequest: vi.fn(),
    fakeStreamChatWithSdk: vi.fn(async (input: {
      adapter: typeof adapter;
      request: unknown;
      signal?: AbortSignal;
    }) => {
      const request = input.adapter.buildRequest(input.request);
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: input.signal,
      });
      return input.adapter.parseResponse(await response.json());
    }),
  };
});

vi.mock("../vendors", () => ({
  getAdapterForConfig: vi.fn(() => fakeAdapter),
  streamChatWithSdk: fakeStreamChatWithSdk,
  resolveTransport: vi.fn(() => "openai"),
}));

vi.mock("./tool-dispatcher", () => ({
  dispatchToolCall: vi.fn(),
  persistToolDispatchResult: vi.fn(async (_call: unknown, result: unknown) => result),
}));

vi.mock("../../token-usage-store", () => ({ recordUsage, recordRequest }));

import { runFireflyHarness } from "./firefly-harness";
import { dispatchToolCall } from "./tool-dispatcher";
import type { ToolDispatchResult } from "./tool-dispatcher";
import type { HarnessEvent, HarnessInput, HarnessResult } from "./types";
import type { ChatMessage, ChatResponse, ToolCall } from "../vendors/types";
import type { ToolDefinition } from "../tools/registry/tool-registry";

const mockedDispatch = vi.mocked(dispatchToolCall);

// ── Helpers ────────────────────────────────────────────

function assistantResponse(opts: { text?: string; toolCalls?: ToolCall[] }): ChatResponse {
  const text = opts.text ?? "";
  const toolCalls = opts.toolCalls ?? [];
  const assistantMessage: ChatMessage = {
    role: "assistant",
    content: text,
    ...(toolCalls.length ? { toolCalls } : {}),
  };
  return {
    assistantMessage,
    text,
    toolCalls,
    finishReason: toolCalls.length ? "tool_calls" : "stop",
    raw: {},
  };
}

/** 构建一个可控的 fetch mock：返回 deferred 列表，每个 fetch 调用消费一个。 */
function deferredFetch(): {
  fn: (url: unknown, init?: unknown) => Promise<Response>;
  nextResolve: (resp: ChatResponse) => void;
  nextReject: (err: Error) => void;
  pendingAbort: () => void;
  calls: unknown[];
} {
  const calls: unknown[] = [];
  let pendingReject: ((err: Error) => void) | null = null;
  let pendingResolve: ((resp: ChatResponse) => void) | null = null;
  let pendingSignal: AbortSignal | null = null;

  const fn = vi.fn(async (_url: unknown, init?: unknown): Promise<Response> => {
    calls.push(init);
    pendingSignal = (init as { signal?: AbortSignal } | undefined)?.signal ?? null;
    return new Promise<Response>((resolve, reject) => {
      pendingResolve = (resp) => {
        resolve({
          ok: true,
          json: async () => resp,
        } as unknown as Response);
      };
      pendingReject = (err) => reject(err);
    });
  });

  return {
    fn,
    calls,
    nextResolve: (resp) => {
      const r = pendingResolve;
      pendingResolve = null;
      pendingReject = null;
      pendingSignal = null;
      r?.(resp);
    },
    nextReject: (err) => {
      const r = pendingReject;
      pendingResolve = null;
      pendingReject = null;
      pendingSignal = null;
      r?.(err);
    },
    pendingAbort: () => {
      // 模拟 fetch 在 signal abort 时抛 AbortError
      if (pendingSignal?.aborted) {
        const r = pendingReject;
        pendingReject = null;
        pendingResolve = null;
        r?.(new DOMException("aborted", "AbortError"));
      }
    },
  };
}

function mutationToolCall(id = "call-1"): ToolCall {
  return {
    id,
    name: "write_file",
    arguments: JSON.stringify({ path: "/tmp/x", content: "hello" }),
  };
}

function readToolCall(id = "call-1"): ToolCall {
  return {
    id,
    name: "read_file",
    arguments: JSON.stringify({ path: "/tmp/x" }),
  };
}

function successDispatchResult(callId = "call-1"): ToolDispatchResult {
  return {
    outcome: "success",
    tool: "write_file",
    target: "/tmp/x",
    message: '{"success":true}',
    output: '{"success":true}',
    truncated: false,
    preview: '{"success":true}',
    rawResult: {
      toolId: "write_file",
      args: { path: "/tmp/x", content: "hello" },
      output: '{"success":true}',
      status: "succeeded",
      terminal: true,
      retryable: false,
    },
  };
}

function failureDispatchResult(callId = "call-1"): ToolDispatchResult {
  return {
    outcome: "failure",
    category: "transient",
    tool: "read_file",
    target: "/tmp/x",
    message: "transient error",
    output: "transient error",
    truncated: false,
    preview: "transient error",
    rawResult: {
      toolId: "read_file",
      args: { path: "/tmp/x" },
      output: "transient error",
      status: "failed",
      terminal: true,
      retryable: true,
      errorCode: "TRANSIENT",
    },
  };
}

const vendorConfig = {
  provider: "fake",
  baseUrl: "https://fake.local",
  model: "fake-model",
  apiKey: "fake-key",
} as unknown as HarnessInput["vendorConfig"];

function readTool(): ToolDefinition {
  return {
    id: "read_file",
    name: "Read File",
    description: "read a file",
    enabled: true,
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
    },
    effectKind: "read",
    execute: vi.fn(),
  };
}

/** 收集所有 harness 事件，便于断言 final_answer 是否被发出。 */
function eventCollector(): { events: HarnessEvent[]; fn: (e: HarnessEvent) => void } {
  const events: HarnessEvent[] = [];
  return { events, fn: (e: HarnessEvent) => events.push(e) };
}

/** 断言取消终态不变量。 */
function assertCancelledTerminal(result: HarnessResult, events: HarnessEvent[]): void {
  // 恰好一个终止原因：cancelled
  expect(result.terminateReason).toBe("cancelled");
  expect(result.terminated).toBe(true);
  // 不生成 "最终回复被取消。" —— finalAnswer 必须为空
  expect(result.finalAnswer).toBe("");
  expect(result.finalAnswer).not.toContain("最终回复被取消");
  // 不得发 final_answer 事件
  const finalAnswerEvents = events.filter((e) => e.type === "final_answer");
  expect(finalAnswerEvents).toHaveLength(0);
  // terminal 字段：harness 内部可以不填（adapter 会映射），但如果填了必须是 cancelled
  if (result.terminal) {
    expect(result.terminal.status).toBe("cancelled");
    expect(result.terminal.externalEffectsMayContinue).toBe(true);
  }
}

// ── Tests ──────────────────────────────────────────────

describe("FireflyHarness cancellation propagation", () => {
  beforeEach(() => {
    mockedDispatch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── 1. loop-top 取消（两轮之间）──
  it("cancels at loop top between rounds: empty finalAnswer, no final_answer event, terminal=cancelled", async () => {
    const fetchMock = deferredFetch();
    vi.stubGlobal("fetch", fetchMock.fn);

    const { events, fn: onEvent } = eventCollector();
    const controller = new AbortController();

    const promise = runFireflyHarness({
      systemPrompt: "test",
      messages: [{ role: "user", content: "do work" }],
      tools: [],
      vendorConfig,
      onEvent,
      signal: controller.signal,
    });

    // 第一轮：模型调用工具
    fetchMock.nextResolve(assistantResponse({ toolCalls: [mutationToolCall("call-1")] }));
    await vi.waitFor(() => expect(fetchMock.calls).toHaveLength(1));
    mockedDispatch.mockResolvedValue(successDispatchResult("call-1"));

    // 等第一轮工具跑完、第二轮 LLM 调用发起
    await vi.waitFor(() => expect(fetchMock.calls).toHaveLength(2));

    // 在第二轮 LLM 响应到达前 abort（loop-top 检查会在下一轮入口命中）
    controller.abort();

    // 第二轮 fetch 还在 pending —— abort 触发 AbortError
    fetchMock.pendingAbort();

    const result = await promise;

    assertCancelledTerminal(result, events);
  });

  // ── 2. LLM fetch 中断 ──
  it("cancels during LLM fetch: classify as cancelled NOT error, empty finalAnswer", async () => {
    const fetchMock = deferredFetch();
    vi.stubGlobal("fetch", fetchMock.fn);

    const { events, fn: onEvent } = eventCollector();
    const controller = new AbortController();

    const promise = runFireflyHarness({
      systemPrompt: "test",
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      vendorConfig,
      onEvent,
      signal: controller.signal,
    });

    // 第一轮 fetch 发起，尚未响应
    await vi.waitFor(() => expect(fetchMock.calls).toHaveLength(1));

    // abort 触发 fetch AbortError
    controller.abort();
    fetchMock.pendingAbort();

    const result = await promise;

    // 关键不变量：AbortError 必须分类为 cancelled，不能是 "error"
    assertCancelledTerminal(result, events);
  });

  // ── 3. 工具执行中取消 ──
  it("cancels during tool execution: drains its actual promise before terminal and keeps the workspace locked", async () => {
    const { RunExecutionCoordinator } = await import("./execution-coordinator");
    const coordinator = new RunExecutionCoordinator("synthetic-active-cancel");
    const scope = { workspaceId: coordinator.workspaceId, parentRunId: "main-cancel", groupId: "main-cancel",
      agentId: "main", childRunId: "main-cancel", toolCallId: "call-1" };
    const fetchMock = deferredFetch();
    vi.stubGlobal("fetch", fetchMock.fn);
    const { events, fn: onEvent } = eventCollector();
    const controller = new AbortController();
    let resolveTool!: (result: ToolDispatchResult) => void;
    const actualTool = new Promise<ToolDispatchResult>(resolve => { resolveTool = resolve; });
    mockedDispatch.mockImplementation(async (call, context) => coordinator.runLeaf(
      { ...scope, toolCallId: call.id }, "exclusive", controller.signal, async () => {
        context.onExecutionStarted?.();
        return actualTool;
      },
    ));
    let returned = false;
    const checkpoint = vi.fn();
    const promise = runFireflyHarness({
      systemPrompt: "test", messages: [{ role: "user", content: "do work" }], tools: [readTool()], vendorConfig,
      onEvent, signal: controller.signal, onCheckpoint: checkpoint,
      toolContext: { userQuery: "synthetic", signal: controller.signal, execution: { coordinator, scope } },
    }).then(result => { returned = true; return result; });
    fetchMock.nextResolve(assistantResponse({ toolCalls: [mutationToolCall("call-1")] }));
    await vi.waitFor(() => expect(mockedDispatch).toHaveBeenCalled());
    controller.abort();
    const read = vi.fn(async () => undefined);
    const waitingRead = coordinator.runLeaf({ ...scope, parentRunId: "other", childRunId: "other", groupId: "other" },
      "shared", undefined, read);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(returned).toBe(false);
    // Predispatch call arguments are durable; terminal has not checkpointed.
    expect(checkpoint).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
    resolveTool(successDispatchResult("call-1"));
    const result = await promise;
    await waitingRead;
    expect(read).toHaveBeenCalledOnce();
    assertCancelledTerminal(result, events);
    await coordinator.closeGroup("other");
  });

  // ── 4. retry backoff 中取消 ──
  it("cancels during retry backoff sleep: terminal=cancelled, no final_answer", async () => {
    const fetchMock = deferredFetch();
    vi.stubGlobal("fetch", fetchMock.fn);

    const { events, fn: onEvent } = eventCollector();
    const controller = new AbortController();

    // 第一次工具失败（transient → 会触发 retry，backoff=500ms）
    let resolveTool: (r: ToolDispatchResult) => void = () => {};
    const toolPromise = new Promise<ToolDispatchResult>((resolve) => { resolveTool = resolve; });
    mockedDispatch.mockReturnValue(toolPromise);

    const promise = runFireflyHarness({
      systemPrompt: "test",
      messages: [{ role: "user", content: "do work" }],
      tools: [readTool()],
      vendorConfig,
      onEvent,
      signal: controller.signal,
    });

    // 第一轮：模型调用工具
    fetchMock.nextResolve(assistantResponse({ toolCalls: [readToolCall("call-1")] }));
    await vi.waitFor(() => expect(mockedDispatch).toHaveBeenCalled());

    // 工具失败（transient → 决定 retry，进入 backoff sleep）
    resolveTool(failureDispatchResult("call-1"));

    // 等 harness 进入 backoff sleep
    await new Promise((r) => setTimeout(r, 50));

    // 在 backoff sleep 中 abort
    controller.abort();

    const result = await promise;

    assertCancelledTerminal(result, events);
  });

  // ── 5. permission wait 中取消 ──
  it("cancels during permission wait: terminal=cancelled, zero execution, late approval cannot restart", async () => {
    const fetchMock = deferredFetch();
    vi.stubGlobal("fetch", fetchMock.fn);
    const { events, fn: onEvent } = eventCollector();
    const controller = new AbortController();
    let resolvePermission!: (allowed: boolean) => void;
    const permissionPromise = new Promise<boolean>(resolve => { resolvePermission = resolve; });
    const permissionEntered = vi.fn();
    const actualExecute = vi.fn(async () => successDispatchResult("call-1"));
    mockedDispatch.mockImplementation(async (_call, context) => {
      const allowed = await context.checkPermission?.("read_file", { path: "/tmp/x" });
      if (!allowed) return failureDispatchResult("call-1");
      context.onExecutionStarted?.();
      return actualExecute();
    });
    const promise = runFireflyHarness({
      systemPrompt: "test", messages: [{ role: "user", content: "do work" }], tools: [readTool()], vendorConfig,
      onEvent, signal: controller.signal,
      checkPermission: async () => { permissionEntered(); return permissionPromise; },
    });
    fetchMock.nextResolve(assistantResponse({ toolCalls: [readToolCall("call-1")] }));
    await vi.waitFor(() => expect(permissionEntered).toHaveBeenCalledOnce());
    controller.abort();
    const result = await promise;
    assertCancelledTerminal(result, events);
    expect(actualExecute).not.toHaveBeenCalled();
    resolvePermission(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(actualExecute).not.toHaveBeenCalled();
    expect(fetchMock.calls).toHaveLength(1);
  });

  // ── 6. ask_user wait 中取消 ──
  it("cancels during ask_user wait: terminal=cancelled, clears pending, no final_answer", async () => {
    const fetchMock = deferredFetch();
    vi.stubGlobal("fetch", fetchMock.fn);

    const { events, fn: onEvent } = eventCollector();
    const controller = new AbortController();

    // requestUserClarification 返回永不 resolve 的 Promise（模拟用户未回答）
    let resolveAsk: (val: unknown) => void = () => {};
    const askPromise = new Promise<unknown>((resolve) => { resolveAsk = resolve; });
    mockedDispatch.mockImplementation(async (_call, context) => {
      await context.requestUserClarification?.({});
      return successDispatchResult("call-ask");
    });

    const askToolCall: ToolCall = {
      id: "call-ask",
      name: "ask_user",
      arguments: JSON.stringify({
        questions: [{
          id: "decision",
          question: "选择？",
          type: "single_select",
          options: [
            { label: "继续", value: "continue" },
            { label: "停止", value: "stop" },
          ],
        }],
      }),
    };

    const promise = runFireflyHarness({
      systemPrompt: "test",
      messages: [{ role: "user", content: "do work" }],
      tools: [],
      vendorConfig,
      onEvent,
      signal: controller.signal,
      requestUserClarification: async () => askPromise,
    });

    // 第一轮：模型调用 ask_user
    fetchMock.nextResolve(assistantResponse({ toolCalls: [askToolCall] }));
    await vi.waitFor(() => expect(fetchMock.calls).toHaveLength(1));

    // 等待 harness 进入 ask_user wait
    await new Promise((r) => setTimeout(r, 50));

    // 在 ask_user wait 中 abort
    controller.abort();

    const result = await promise;

    assertCancelledTerminal(result, events);
  });

  // ── 7. 每条取消链路都只结算一个 terminal（组合断言）──
  it("each cancellation path produces exactly one terminal (cancelled) and exactly one return", async () => {
    // 这个测试验证：harness 在取消后不会再继续跑、不会发第二次 terminal
    const fetchMock = deferredFetch();
    vi.stubGlobal("fetch", fetchMock.fn);

    const { events, fn: onEvent } = eventCollector();
    const controller = new AbortController();

    let toolCallCount = 0;
    mockedDispatch.mockImplementation(async () => {
      toolCallCount++;
      return successDispatchResult(`call-${toolCallCount}`);
    });

    const promise = runFireflyHarness({
      systemPrompt: "test",
      messages: [{ role: "user", content: "do work" }],
      tools: [readTool()],
      vendorConfig,
      onEvent,
      signal: controller.signal,
    });

    // 第一轮：模型调用工具
    fetchMock.nextResolve(assistantResponse({ toolCalls: [mutationToolCall("call-1")] }));

    // 等工具跑完、第二轮 fetch 发起
    await vi.waitFor(() => expect(fetchMock.calls).toHaveLength(2));

    // abort
    controller.abort();
    fetchMock.pendingAbort();

    const result = await promise;

    // 恰好一个终止
    expect(result.terminated).toBe(true);
    expect(result.terminateReason).toBe("cancelled");
    expect(result.finalAnswer).toBe("");

    // 不应有 final_answer 事件
    expect(events.filter((e) => e.type === "final_answer")).toHaveLength(0);

    // 取消后不应再发起新的 LLM 调用
    const callsAfterCancel = fetchMock.calls.length;
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock.calls.length).toBe(callsAfterCancel);
  });

  // ── 8. cancelled 不保留 "最终回复被取消。" 文本 ──
  it("cancelled path never produces '最终回复被取消。' as finalAnswer", async () => {
    const fetchMock = deferredFetch();
    vi.stubGlobal("fetch", fetchMock.fn);

    const controller = new AbortController();

    const promise = runFireflyHarness({
      systemPrompt: "test",
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      vendorConfig,
      onEvent: () => {},
      signal: controller.signal,
    });

    await vi.waitFor(() => expect(fetchMock.calls).toHaveLength(1));
    controller.abort();
    fetchMock.pendingAbort();

    const result = await promise;

    // 核心不变量：cancelled 路径不生成 "最终回复被取消。"
    expect(result.finalAnswer).not.toContain("最终回复被取消");
    expect(result.finalAnswer).toBe("");
  });
});

it("failed child Harness quiesces its owned retained process before drain without cancelling its parent", async () => {
  const { RunExecutionCoordinator } = await import("./execution-coordinator");
  const { startShellJob, stopShellJob, waitForShellJob } = await import("../tools/builtin-tools/shell-job-manager");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = mkdtempSync(join(tmpdir(), "firefly-failed-child-drain-"));
  const coordinator = new RunExecutionCoordinator(root);
  const parent = new AbortController();
  const child = new AbortController();
  const signal = AbortSignal.any([parent.signal, child.signal]);
  const scope = { workspaceId: root, parentRunId: "parent", groupId: "siblings", agentId: "role-a", childRunId: "child-a", toolCallId: "launch" };
  const fetchMock = deferredFetch();
  vi.stubGlobal("fetch", fetchMock.fn);
  mockedDispatch.mockReset();
  let job: ReturnType<typeof startShellJob> | undefined;
  const quiesce = vi.fn(() => child.abort());
  mockedDispatch.mockImplementation(async (call, context) => coordinator.runLeaf({ ...scope, toolCallId: call.id }, "exclusive", signal, async permit => {
    context.onExecutionStarted?.();
    job = startShellJob({
      spec: { command: process.execPath, args: ["-e", "setInterval(()=>{},1000)"], env: process.env, cwd: root,
        windowsVerbatimArguments: false, ranViaSandbox: false },
      command: "synthetic failed child background", shell: "node", logDir: root, executionScope: scope, signal,
    });
    coordinator.retainUntil(permit, job.completion);
    return successDispatchResult(call.id);
  }));
  const pending = runFireflyHarness({
    systemPrompt: "synthetic", messages: [], tools: [readTool()], vendorConfig, signal,
    quiesceExecution: quiesce,
    toolContext: { userQuery: "synthetic", signal, execution: { coordinator, scope } },
  });
  try {
    fetchMock.nextResolve(assistantResponse({ toolCalls: [readToolCall("launch")] }));
    await vi.waitFor(() => expect(fetchMock.calls).toHaveLength(2));
    expect((await waitForShellJob(job!.jobId, 0))?.status).toBe("running");
    fetchMock.nextReject(new Error("synthetic next-model failure"));
    const result = await pending;
    expect(result.terminateReason).toBe("error");
    expect(quiesce).toHaveBeenCalledOnce();
    expect(child.signal.aborted).toBe(true);
    expect(parent.signal.aborted).toBe(false);
    expect((await waitForShellJob(job!.jobId, 0))?.status).toBe("stopped");
    await job!.completion;
  } finally {
    child.abort();
    if (job) { stopShellJob(job.jobId); await job.completion; }
    await coordinator.closeGroup("siblings");
    rmSync(root, { recursive: true, force: true });
    vi.unstubAllGlobals();
  }
});
