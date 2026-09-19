import test from "node:test";
import assert from "node:assert/strict";
import type { AgentRunResult } from "../../../src/shared/agent-types.ts";
import type { AgentEventBus } from "../../../dist/main/main/orchestrator/agent-events.js";
import type {
  MainPlanExecutionResult,
  MainRequiredPlanRequest,
} from "../../../src/main/orchestrator/planning/plan-execution-entry.ts";
import {
  WorkTaskCoordinator,
  type WorkAgentCore,
} from "../../../dist/main/main/work/work-task-coordinator.js";
import type { WorkPlanGenerationResult } from "../../../src/shared/work-types.ts";
import type { ChatCompletionRequest, ChatCompletionResponse } from "../../../src/shared/chat-types.ts";
import type { IFireflyLlmProvider } from "../../../src/shared/provider-types.ts";
import type { FireflyHarness } from "../../../dist/main/main/orchestrator/harness/firefly-harness.js";

function completedResult(runId: string): AgentRunResult {
  return {
    runId,
    status: "completed",
    terminationReason: { kind: "completed" },
    finalText: "done",
    transcript: [],
    toolCallsCount: 0,
    roundsCount: 1,
    durationMs: 1,
  };
}

function browserReadBinding(url: string) {
  return {
    toolName: "browser_read",
    arguments: { requestUrl: url },
    argumentMatching: "normalized_url" as const,
    successContract: "json_ok_true" as const,
    correction: "once" as const,
  };
}

function createFakeCore(options: {
  readonly proposal?: WorkPlanGenerationResult;
  readonly runResult?: MainPlanExecutionResult;
  readonly eventBus: AgentEventBus;
  readonly onRun?: (request: MainRequiredPlanRequest) => void;
}): WorkAgentCore {
  return {
    getEventBus: () => options.eventBus,
    proposeRequiredPlan: async () => options.proposal ?? {
      ok: true,
      steps: [
        { description: "整理用户目标", completionRequirement: "analysis" },
        { description: "整理真实结果", completionRequirement: "analysis" },
      ],
    },
    runRequiredPlan: async (value: unknown) => {
      const request = value as MainRequiredPlanRequest;
      options.onRun?.(request);
      return options.runResult ?? { ok: true, result: completedResult(request.runId ?? "work-run") };
    },
    cancel: () => true,
  };
}

test("Work proposal confirmation preserves the original task and URL targets", async () => {
  const { AgentEventBus } = await import("../../../dist/main/main/orchestrator/agent-events.js");
  const eventBus = new AgentEventBus();
  let request: MainRequiredPlanRequest | undefined;
  const coordinator = new WorkTaskCoordinator({
    agentCore: createFakeCore({
      eventBus,
      onRun: (value) => { request = value; },
      proposal: {
        ok: true,
        steps: [
          {
            description: "读取用户指定页面",
            completionRequirement: "tool",
            toolBinding: browserReadBinding("https://example.com/hello"),
          },
          { description: "整理真实结果", completionRequirement: "analysis" },
        ],
      },
    }),
  });

  const created = await coordinator.createPlan({
    task: "请读取 [https://example.com/hello](https://example.com/hello)，不要访问其他地址。",
    fileReadMode: "optional",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.snapshot.phase, "awaiting_confirmation");
  assert.deepEqual(created.snapshot.steps.map((step) => step.completionRequirement), ["tool", "analysis"]);

  const confirmed = await coordinator.confirmPlan(created.snapshot.proposalId ?? "");
  assert.equal(confirmed.ok, true);
  assert.equal(request?.userPrompt, "请读取 [https://example.com/hello](https://example.com/hello)，不要访问其他地址。");
  assert.deepEqual(request?.browserRequestTargets, ["https://example.com/hello"]);
  assert.deepEqual(request?.steps, [
    {
      description: "读取用户指定页面",
      completionRequirement: "tool",
      toolBinding: browserReadBinding("https://example.com/hello"),
    },
    { description: "整理真实结果", completionRequirement: "analysis" },
  ]);
  coordinator.dispose();
});

test("Work confirmation is atomically consumed and duplicate confirmation cannot start a second run", async () => {
  const { AgentEventBus } = await import("../../../dist/main/main/orchestrator/agent-events.js");
  const eventBus = new AgentEventBus();
  let runCount = 0;
  let releaseRun: (() => void) | undefined;
  const runGate = new Promise<void>((resolve) => { releaseRun = resolve; });
  const coordinator = new WorkTaskCoordinator({
    agentCore: {
      ...createFakeCore({ eventBus }),
      runRequiredPlan: async (value: unknown) => {
        const request = value as MainRequiredPlanRequest;
        runCount += 1;
        await runGate;
        return { ok: true, result: completedResult(request.runId ?? "work-run") };
      },
    },
  });

  const created = await coordinator.createPlan({ task: "执行一个明确的两步任务", fileReadMode: "optional" });
  assert.equal(created.ok, true);
  if (!created.ok || !created.snapshot.proposalId) return;

  const first = coordinator.confirmPlan(created.snapshot.proposalId);
  const second = await coordinator.confirmPlan(created.snapshot.proposalId);
  assert.equal(second.ok, false);
  assert.equal(second.code, "not_confirmable");
  assert.equal(runCount, 1);
  releaseRun?.();
  const firstResult = await first;
  assert.equal(firstResult.ok, true);
  assert.equal(coordinator.getSnapshot()?.phase, "completed");
  coordinator.dispose();
});

test("cancelling Work plan generation leaves no confirmable proposal", async () => {
  const { AgentEventBus } = await import("../../../dist/main/main/orchestrator/agent-events.js");
  const eventBus = new AgentEventBus();
  let releaseProposal: (() => void) | undefined;
  const proposalGate = new Promise<WorkPlanGenerationResult>((resolve) => { releaseProposal = () => resolve({
    ok: true,
    steps: [{ description: "late", completionRequirement: "analysis" }],
  }); });
  const coordinator = new WorkTaskCoordinator({
    agentCore: {
      ...createFakeCore({ eventBus }),
      proposeRequiredPlan: async () => proposalGate,
    },
  });

  const creating = coordinator.createPlan({ task: "需要取消的任务", fileReadMode: "optional" });
  await new Promise<void>((resolve) => setImmediate(resolve));
  const cancelled = await coordinator.cancel();
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.snapshot?.phase, "cancelled");
  releaseProposal?.();
  await creating;
  assert.equal(coordinator.getSnapshot()?.proposalId, undefined);
  const confirm = await coordinator.confirmPlan("late-proposal");
  assert.equal(confirm.ok, false);
  assert.equal(confirm.code, "not_confirmable");
  coordinator.dispose();
});

test("a planning Provider exception becomes a failed task without leaving a proposal", async () => {
  const { AgentEventBus } = await import("../../../dist/main/main/orchestrator/agent-events.js");
  const eventBus = new AgentEventBus();
  const coordinator = new WorkTaskCoordinator({
    agentCore: {
      ...createFakeCore({ eventBus }),
      proposeRequiredPlan: async () => {
        throw new Error("planner unavailable");
      },
    },
  });

  const result = await coordinator.createPlan({ task: "需要报告规划失败的任务", fileReadMode: "optional" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "execution_failed");
  assert.equal(coordinator.getSnapshot()?.phase, "failed");
  assert.equal(coordinator.getSnapshot()?.proposalId, undefined);
  coordinator.dispose();
});

test("Harness plan generation sends one no-tool request and validates structured steps", async () => {
  const { FireflyHarness } = await import("../../../dist/main/main/orchestrator/harness/firefly-harness.js");
  const { FireflyToolRegistry } = await import("../../../dist/main/main/orchestrator/tools/registry/tool-registry.js");
  const registry = new FireflyToolRegistry();
  registry.register({
    id: "work_read",
    name: "work_read",
    description: "Controlled Work test reader.",
    inputSchema: {
      type: "object",
      properties: { requestUrl: { type: "string" } },
      required: ["requestUrl"],
    },
    enabled: true,
    execute: async () => JSON.stringify({ ok: true }),
  });
  let request: ChatCompletionRequest | undefined;
  const provider: IFireflyLlmProvider = {
    id: "work-plan-test",
    name: "Work plan test provider",
    capabilities: { supportsNativeToolCalling: true, supportsStreaming: false },
    generateCompletion: async (value): Promise<ChatCompletionResponse> => {
      request = value;
      return {
        message: {
          role: "assistant",
          content: JSON.stringify({
            steps: [
              {
                description: "读取用户目标",
                completionRequirement: "tool",
                toolBinding: {
                  toolName: "work_read",
                  arguments: { requestUrl: "https://example.com/" },
                  argumentMatching: "normalized_url",
                  successContract: "json_ok_true",
                  correction: "once",
                },
              },
              { description: "整理读取结果", completionRequirement: "analysis" },
            ],
          }),
        },
      };
    },
  };
  const harness = new FireflyHarness({ provider, toolRegistry: registry });

  const result = await harness.proposeRequiredPlan("读取用户提供的网页");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.steps, [
    {
      description: "读取用户目标",
      completionRequirement: "tool",
      toolBinding: {
        toolName: "work_read",
        arguments: { requestUrl: "https://example.com/" },
        argumentMatching: "normalized_url",
        successContract: "json_ok_true",
        correction: "once",
      },
    },
    { description: "整理读取结果", completionRequirement: "analysis" },
  ]);
  assert.equal(request?.tools, undefined);
  assert.equal(request?.messages.at(-1)?.role, "user");
  assert.equal(request?.messages.at(-1)?.content, "读取用户提供的网页");
});

test("Harness rejects invalid Work planner output without producing a proposal", async () => {
  const { FireflyHarness } = await import("../../../dist/main/main/orchestrator/harness/firefly-harness.js");
  const { FireflyToolRegistry } = await import("../../../dist/main/main/orchestrator/tools/registry/tool-registry.js");
  const provider: IFireflyLlmProvider = {
    id: "invalid-work-plan-test",
    name: "Invalid Work plan test provider",
    capabilities: { supportsNativeToolCalling: true, supportsStreaming: false },
    generateCompletion: async (): Promise<ChatCompletionResponse> => ({
      message: { role: "assistant", content: '{"steps":[{"description":"missing requirement"}]}' },
    }),
  };
  const harness = new FireflyHarness({ provider, toolRegistry: new FireflyToolRegistry() });
  const result = await harness.proposeRequiredPlan("任务");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "invalid_output");
});

test("Harness rejects an all-analysis proposal when Main requires the selected file", async () => {
  const { FireflyHarness } = await import("../../../dist/main/main/orchestrator/harness/firefly-harness.js");
  const { FireflyToolRegistry } = await import("../../../dist/main/main/orchestrator/tools/registry/tool-registry.js");
  const provider: IFireflyLlmProvider = {
    id: "required-file-plan-test",
    name: "Required file plan test provider",
    capabilities: { supportsNativeToolCalling: true, supportsStreaming: false },
    generateCompletion: async (): Promise<ChatCompletionResponse> => ({
      message: {
        role: "assistant",
        content: JSON.stringify({
          steps: [{ description: "只整理输入", completionRequirement: "analysis" }],
        }),
      },
    }),
  };
  type HarnessSelection = NonNullable<Parameters<FireflyHarness["proposeRequiredPlan"]>[3]>;
  const selection = {
    selectionId: "selection-required-test",
    fileSelectionId: "selection-required-test",
    files: [{
      fileId: "file-required-test",
      displayName: "opaque.txt",
      fileKind: "text" as const,
      byteLength: 3,
      symbolicLink: false,
    }],
    totalBytes: 3,
  } as unknown as HarnessSelection;
  const harness = new FireflyHarness({ provider, toolRegistry: new FireflyToolRegistry() });
  const result = await harness.proposeRequiredPlan(
    "读取并总结所选文件",
    undefined,
    [],
    selection,
    {
      selectionId: selection.selectionId,
      fileSelectionId: selection.fileSelectionId,
      fileIds: [selection.files[0].fileId],
    },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.message, /required file-read plan|file_read/i);
});
