import test from "node:test";
import assert from "node:assert/strict";

import { FireflyHarness } from "../../../dist/main/main/orchestrator/harness/firefly-harness.js";
import { matchesRequiredToolExecution } from "../../../dist/main/main/orchestrator/harness/tool-round.js";
import { FireflyToolRegistry } from "../../../dist/main/main/orchestrator/tools/registry/tool-registry.js";
import { extractBrowserUserTargetUrls } from "../../../dist/main/main/browser/browser-user-targets.js";
import {
  createBrowserReadExecutionRequirement,
  resolveBrowserReadExecution,
  resolveBrowserReadIntent,
} from "../../../dist/main/main/browser/browser-read-intent.js";
import type { ChatCompletionRequest, ChatCompletionResponse } from "../../../dist/main/shared/chat-types.js";
import type { IFireflyLlmProvider } from "../../../dist/main/shared/provider-types.js";

const browserUrl = "https://example.com/";

test("Main URL extraction stops before adjacent Chinese prose punctuation", () => {
  assert.deepEqual(
    extractBrowserUserTargetUrls("请读取 https://example.com/，告诉我页面标题。"),
    [browserUrl],
  );
});

test("Main URL extraction uses Markdown link destinations only", () => {
  assert.deepEqual(
    extractBrowserUserTargetUrls("[https://example.com/hello](https://example.com/hello)"),
    ["https://example.com/hello"],
  );
  assert.deepEqual(
    extractBrowserUserTargetUrls("[https://a.example/](https://b.example/)"),
    ["https://b.example/"],
  );
  assert.deepEqual(
    extractBrowserUserTargetUrls("<https://example.com/hello>"),
    ["https://example.com/hello"],
  );
});

test("Main URL extraction preserves multiple links, queries, encoding, and balanced parentheses", () => {
  assert.deepEqual(
    extractBrowserUserTargetUrls(
      "https://example.com/path(a)?q=one%20two。 [说明](https://example.com/second)，https://example.com/path(a)?q=one%20two。",
    ),
    [
      "https://example.com/path(a)?q=one%20two",
      "https://example.com/second",
    ],
  );
});

test("Malformed Markdown link syntax is not concatenated into an authorization target", () => {
  assert.deepEqual(
    extractBrowserUserTargetUrls("[https://a.example/](https://b.example/"),
    [],
  );
  assert.deepEqual(
    extractBrowserUserTargetUrls("https://a.example/](https://b.example/"),
    [],
  );
});

function createBrowserTool(): {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  risk: "read_only";
  safetyLevel: "confirm_required";
  sideEffect: "external_network_read";
  timeoutMs: number;
  retryable: false;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
  execute: () => Promise<string>;
} {
  return {
    id: "browser_read",
    name: "读取网页",
    description: "读取当前用户消息中明确提供的公开 HTTP(S) 静态网页。",
    enabled: true,
    risk: "read_only",
    safetyLevel: "confirm_required",
    sideEffect: "external_network_read",
    timeoutMs: 15_000,
    retryable: false,
    inputSchema: {
      type: "object",
      properties: {
        requestUrl: { type: "string" },
      },
      required: ["requestUrl"],
    },
    execute: async () => JSON.stringify({ ok: false, error: "test_not_executed" }),
  };
}

test("Main Harness passes browser_read schema and matching prompt guidance to the provider", async () => {
  const registry = new FireflyToolRegistry();
  registry.register(createBrowserTool());

  let capturedRequest: ChatCompletionRequest | undefined;
  const provider: IFireflyLlmProvider = {
    id: "browser-routing-test-provider",
    name: "Browser routing test provider",
    capabilities: {
      supportsNativeToolCalling: true,
      supportsStreaming: false,
    },
    async generateCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
      capturedRequest = request;
      return {
        message: {
          role: "assistant",
          content: "本测试故意不返回工具调用。",
        },
      };
    },
  };

  const harness = new FireflyHarness({
    provider,
    toolRegistry: registry,
    config: {
      maxRounds: 1,
      totalTimeoutMs: 5_000,
      roundTimeoutMs: 5_000,
      toolTimeoutMs: 1_000,
    },
  });

  const result = await harness.run({
    source: "user",
    userPrompt: "请读取 https://example.com/ ，告诉我页面标题。",
    browserRequestTargets: [browserUrl],
    executionProfile: { kind: "MAIN", allowSubAgentDelegation: true },
  });

  assert.equal(result.status, "completed");
  assert.ok(capturedRequest);
  const browserSchema = capturedRequest.tools?.find((tool) => tool.function.name === "browser_read");
  assert.ok(browserSchema);
  assert.deepEqual(browserSchema.function.parameters.properties, {
    requestUrl: { type: "string" },
  });
  assert.deepEqual(browserSchema.function.parameters.required, ["requestUrl"]);
  assert.equal(capturedRequest.toolChoice, undefined);

  const systemPrompt = capturedRequest.messages.find((message) => message.role === "system")?.content ?? "";
  assert.match(systemPrompt, /当前网页读取工具/u);
  assert.match(systemPrompt, /browser_read/u);
  assert.doesNotMatch(systemPrompt, /当前运行没有工具执行面/u);
});

function scriptedBrowserProvider(options: {
  readonly neverCall?: boolean;
  readonly toolArguments?: Record<string, unknown>;
  readonly toolOutput?: string;
  readonly firstReply?: string;
}): IFireflyLlmProvider {
  let submitted = false;
  return {
    id: "browser-truthfulness-test-provider",
    name: "Browser truthfulness test provider",
    capabilities: {
      supportsNativeToolCalling: true,
      supportsStreaming: false,
    },
    async generateCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
      const lastMessage = request.messages.at(-1);
      if (request.toolChoice?.function.name === "browser_read" && !submitted && !options.neverCall) {
        submitted = true;
        return {
          message: {
            role: "assistant",
            content: "",
            toolCalls: [{
              id: "browser-truthfulness-call",
              name: "browser_read",
              arguments: options.toolArguments ?? { requestUrl: browserUrl },
            }],
          },
        };
      }
      if (lastMessage?.role === "tool") {
        return {
          message: {
            role: "assistant",
            content: "我根据本次网页读取结果整理了当前页面。",
          },
        };
      }
      return {
        message: {
          role: "assistant",
          content: options.firstReply ?? "上次读取成功，标题是历史标题。",
        },
      };
    },
  };
}

function createHarnessBrowserTool(output: string, onExecute?: () => void) {
  return {
    id: "browser_read",
    name: "读取网页",
    description: "Test-only Browser read.",
    enabled: true,
    risk: "read_only" as const,
    safetyLevel: "safe" as const,
    sideEffect: "external_network_read" as const,
    timeoutMs: 1_000,
    retryable: false as const,
    inputSchema: {
      type: "object" as const,
      properties: { requestUrl: { type: "string" } },
      required: ["requestUrl"],
    },
    execute: async () => {
      onExecute?.();
      return output;
    },
  };
}

async function runBrowserHarness(options: {
  readonly provider: IFireflyLlmProvider;
  readonly targetUrl?: string;
  readonly toolArguments?: Record<string, unknown>;
  readonly toolOutput?: string;
  readonly prompt?: string;
  readonly onExecute?: () => void;
}) {
  const registry = new FireflyToolRegistry();
  registry.register(createHarnessBrowserTool(
    options.toolOutput ?? JSON.stringify({
      ok: true,
      sourceUrl: options.targetUrl ?? browserUrl,
      finalUrl: options.targetUrl ?? browserUrl,
      title: "Current title",
      body: "Current body",
      untrustedContent: true,
    }),
    options.onExecute,
  ));
  const harness = new FireflyHarness({
    provider: options.provider,
    toolRegistry: registry,
    config: {
      maxRounds: 4,
      totalTimeoutMs: 5_000,
      roundTimeoutMs: 5_000,
      toolTimeoutMs: 1_000,
    },
  });
  const targetUrls = options.targetUrl === undefined ? [browserUrl] : [options.targetUrl];
  return harness.run({
    source: "user",
    userPrompt: options.prompt ?? "请重新读取 https://example.com/ 并只根据本次结果回答。",
    history: [
      { id: "old-user", role: "user", content: "请读取 https://example.com/" },
      { id: "old-assistant", role: "assistant", content: "上次读取成功，标题是历史标题。" },
    ],
    browserRequestTargets: targetUrls,
    executionProfile: { kind: "MAIN", allowSubAgentDelegation: true },
    requiredToolExecution: createBrowserReadExecutionRequirement(targetUrls[0]),
  });
}

test("A fresh Browser request cannot be satisfied by a successful historical answer", async () => {
  const intent = resolveBrowserReadIntent(
    "请重新读取 https://example.com/ 并只根据本次结果回答。",
    [browserUrl],
  );
  assert.ok(intent);
  const result = await runBrowserHarness({
    provider: scriptedBrowserProvider({}),
  });
  assert.equal(result.requiredToolExecution?.status, "succeeded");
  assert.equal(resolveBrowserReadExecution(intent, result).state, "succeeded");

  const noCallResult = await runBrowserHarness({
    provider: scriptedBrowserProvider({
      neverCall: true,
      firstReply: "上次读取成功，标题是历史标题。",
    }),
  });
  const noCallResolution = resolveBrowserReadExecution(intent, noCallResult);
  assert.equal(noCallResult.requiredToolExecution?.status, "not_called");
  assert.equal(noCallResolution.state, "not_executed");
  assert.doesNotMatch(noCallResolution.replyText, /历史标题|读取成功/u);
});

test("Browser required execution matches equivalent canonical URL formatting", async () => {
  const requirement = createBrowserReadExecutionRequirement(browserUrl);
  assert.equal(
    matchesRequiredToolExecution(
      {
        id: "browser-formatting-call",
        name: "browser_read",
        arguments: { requestUrl: "https://example.com" },
      },
      requirement,
    ),
    true,
  );

  const result = await runBrowserHarness({
    provider: scriptedBrowserProvider({
      toolArguments: { requestUrl: "https://example.com" },
    }),
  });
  assert.equal(result.requiredToolExecution?.status, "succeeded");
  assert.equal(
    resolveBrowserReadExecution({ kind: "current_read", targetUrls: [browserUrl] }, result).state,
    "succeeded",
  );
});

test("Browser required URL matching preserves path, query, protocol, and port boundaries", async () => {
  const equivalentUrls = [
    "https://example.com",
    "https://example.com/",
    "https://example.com:443/",
  ];
  for (const requestUrl of equivalentUrls) {
    let executions = 0;
    const result = await runBrowserHarness({
      provider: scriptedBrowserProvider({ toolArguments: { requestUrl } }),
      targetUrl: browserUrl,
      toolArguments: { requestUrl },
      onExecute: () => { executions += 1; },
    });
    assert.equal(result.requiredToolExecution?.status, "succeeded", requestUrl);
    assert.equal(executions, 1, requestUrl);
  }

  const mismatchedUrls: readonly [string, string][] = [
    ["https://example.com/hello", "https://example.com/hello/"],
    ["https://example.com/hello", "https://example.com/other"],
    ["https://example.com/hello", "https://example.com/hello?q=1"],
    ["https://example.com/hello", "http://example.com/hello"],
    ["https://example.com/hello", "https://example.com:8443/hello"],
  ];
  for (const [targetUrl, requestUrl] of mismatchedUrls) {
    let executions = 0;
    const result = await runBrowserHarness({
      provider: scriptedBrowserProvider({ toolArguments: { requestUrl } }),
      targetUrl,
      toolArguments: { requestUrl },
      onExecute: () => { executions += 1; },
    });
    assert.equal(result.requiredToolExecution?.status, "not_called", `${targetUrl} <- ${requestUrl}`);
    assert.equal(
      resolveBrowserReadExecution(
        { kind: "current_read", targetUrls: [targetUrl] },
        result,
      ).state,
      "not_executed",
      `${targetUrl} <- ${requestUrl}`,
    );
    assert.equal(executions, 0, `${targetUrl} <- ${requestUrl}`);
  }

  assert.equal(
    matchesRequiredToolExecution(
      {
        id: "exact-other-tool-call",
        name: "music_status",
        arguments: { requestUrl: "https://example.com" },
      },
      {
        toolName: "music_status",
        arguments: { requestUrl: "https://example.com/" },
        successContract: "json_ok_true",
        correction: "once",
      },
    ),
    false,
  );
});

test("A current Browser failure cannot be replaced by historical success", async () => {
  const intent = resolveBrowserReadIntent(
    "请再次读取 https://example.com/。",
    [browserUrl],
  );
  assert.ok(intent);
  const result = await runBrowserHarness({
    provider: scriptedBrowserProvider({}),
    toolOutput: JSON.stringify({ ok: false, error: "http_status_error", sourceUrl: browserUrl }),
  });
  const resolution = resolveBrowserReadExecution(intent, result);
  assert.equal(result.requiredToolExecution?.status, "failed");
  assert.equal(resolution.state, "failed");
  assert.doesNotMatch(resolution.replyText, /历史标题|读取成功/u);
});

test("An HTTP 404 result is a current failure and cannot become a historical success", async () => {
  const intent = resolveBrowserReadIntent(
    "请再次读取 https://example.com/。",
    [browserUrl],
  );
  assert.ok(intent);
  const result = await runBrowserHarness({
    provider: scriptedBrowserProvider({}),
    toolOutput: JSON.stringify({
      ok: false,
      error: "http_status_error",
      httpStatus: 404,
      sourceUrl: browserUrl,
      title: "Not Found",
      body: "Not Found",
      untrustedContent: true,
    }),
  });
  const resolution = resolveBrowserReadExecution(intent, result);
  assert.equal(result.requiredToolExecution?.status, "failed");
  assert.equal(resolution.state, "failed");
  assert.doesNotMatch(resolution.replyText, /Not Found|Example Domain|读取成功|页面标题/u);
});

test("A timeout or cancellation cannot be replaced by historical success", async () => {
  const intent = resolveBrowserReadIntent("请再次读取 https://example.com/。", [browserUrl]);
  assert.ok(intent);
  for (const error of ["tool_timeout", "tool_cancelled"] as const) {
    const result = await runBrowserHarness({
      provider: scriptedBrowserProvider({}),
      toolOutput: JSON.stringify({ ok: false, error, sourceUrl: browserUrl }),
    });
    const resolution = resolveBrowserReadExecution(intent, result);
    assert.equal(resolution.state, "unknown", error);
    assert.doesNotMatch(resolution.replyText, /历史标题|读取成功/u, error);
  }
});

test("A different URL cannot satisfy the current Browser target", async () => {
  const intent = resolveBrowserReadIntent("请读取 https://example.com/。", [browserUrl]);
  assert.ok(intent);
  const result = await runBrowserHarness({
    provider: scriptedBrowserProvider({
      toolArguments: { requestUrl: "https://other.example/" },
    }),
  });
  const resolution = resolveBrowserReadExecution(intent, result);
  assert.equal(result.requiredToolExecution?.status, "not_called");
  assert.equal(resolution.state, "not_executed");
});

test("History review remains distinct from a fresh Browser read", () => {
  assert.equal(resolveBrowserReadIntent("请回顾上次读取的页面结果。", []), undefined);
  const intent = resolveBrowserReadIntent("请重新读取刚才那个页面。", []);
  assert.ok(intent);
  assert.deepEqual(intent.targetUrls, []);
});

test("Consecutive Browser reads require evidence from each run", async () => {
  const first = await runBrowserHarness({ provider: scriptedBrowserProvider({}) });
  const second = await runBrowserHarness({ provider: scriptedBrowserProvider({}) });
  assert.equal(first.requiredToolExecution?.status, "succeeded");
  assert.equal(second.requiredToolExecution?.status, "succeeded");
  assert.notEqual(first.runId, second.runId);
  assert.equal(resolveBrowserReadExecution(
    { kind: "current_read", targetUrls: [browserUrl] },
    first,
  ).state, "succeeded");
  assert.equal(resolveBrowserReadExecution(
    { kind: "current_read", targetUrls: [browserUrl] },
    second,
  ).state, "succeeded");
});
