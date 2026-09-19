import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  WORK_HISTORY_LIMITS,
  type WorkHistoryRecord,
} from "../../../dist/main/shared/work-history-types.js";
import {
  WorkHistoryStore,
  projectWorkHistoryRecord,
} from "../../../dist/main/main/work/work-history-store.js";
import { WorkTaskCoordinator, type WorkAgentCore } from "../../../dist/main/main/work/work-task-coordinator.js";
import { AgentEventBus } from "../../../dist/main/main/orchestrator/agent-events.js";
import type { AgentRunResult } from "../../../src/shared/agent-types.ts";

function record(historyId: string, finalText: string): WorkHistoryRecord {
  return {
    historyId,
    taskId: historyId,
    userPrompt: `任务 ${historyId}`,
    fileReadMode: "optional",
    phase: "completed",
    steps: [],
    finalText,
    createdAt: 1,
    updatedAt: 2,
  };
}

test("Work history contract declares bounded in-process retention", () => {
  assert.equal(WORK_HISTORY_LIMITS.maxRecords, 20);
  assert.equal(WORK_HISTORY_LIMITS.maxTotalBytes, 512 * 1024);
});

test("Work history store evicts the oldest record at the count limit", () => {
  const store = new WorkHistoryStore();
  for (let index = 0; index <= WORK_HISTORY_LIMITS.maxRecords; index += 1) {
    assert.equal(store.add(record(`task-${index}`, `结果 ${index}`)), true);
  }

  const history = store.getSnapshot();
  assert.equal(history.records.length, WORK_HISTORY_LIMITS.maxRecords);
  assert.equal(history.records[0]?.historyId, "task-20");
  assert.equal(history.records.at(-1)?.historyId, "task-1");
  assert.equal(store.get("task-0"), undefined);
});

test("projected Work history excludes execution-only data", () => {
  const projected = projectWorkHistoryRecord({
    taskId: "task-project",
    userPrompt: "比较资料",
    browserRequestTargets: ["https://example.invalid/"],
    fileSelection: {
      selectionId: "selection-private" as never,
      fileSelectionId: "selection-private" as never,
      files: [{
        fileId: "file-private" as never,
        displayName: "facts.md",
        fileKind: "markdown",
        byteLength: 12,
        symbolicLink: false,
      }],
      totalBytes: 12,
    },
    fileReadMode: "required",
    fileReadRequirement: {
      selectionId: "selection-private" as never,
      fileSelectionId: "selection-private" as never,
      fileIds: ["file-private" as never],
    },
    phase: "completed",
    proposalId: "proposal-private",
    runId: "run-private",
    planId: "plan-private",
    steps: [{
      index: 0,
      description: "读取资料",
      completionRequirement: "tool",
      toolBinding: {
        toolName: "file_read",
        arguments: { selectionId: "selection-private", fileId: "file-private" },
        argumentMatching: "exact",
        successContract: "json_ok_true",
        correction: "once",
      },
      status: "completed",
      verificationStatus: "success",
      observation: "正文不应进入历史",
    }],
    cancelRequested: false,
    finalText: "最终结果",
    error: JSON.stringify({ error: "file_read_failed", body: "不应进入历史的完整正文" }),
    createdAt: 1,
    updatedAt: 2,
  });

  assert.equal(projected.historyId, "task-project");
  assert.equal(projected.steps[0]?.plannedOperation, "读取用户选择的文件");
  assert.equal("selectionId" in projected, false);
  assert.equal("fileReadRequirement" in projected, false);
  assert.equal("observation" in (projected.steps[0] ?? {}), false);
  assert.equal(projected.fileSelection?.files[0]?.displayName, "facts.md");
  assert.equal(projected.finalText, "最终结果");
  assert.equal(projected.error, "任务未完成；详细执行错误未保留。");
  assert.doesNotMatch(JSON.stringify(projected), /不应进入历史的完整正文/);
});

test("Work history rejects a single record larger than the total budget", () => {
  const store = new WorkHistoryStore();
  assert.equal(store.add(record("too-large", "x".repeat(WORK_HISTORY_LIMITS.maxTotalBytes))), false);
  assert.equal(store.getSnapshot().records.length, 0);
});

function completedResult(runId: string, finalText: string): AgentRunResult {
  return {
    runId,
    status: "completed",
    terminationReason: { kind: "completed" },
    finalText,
    transcript: [],
    toolCallsCount: 0,
    roundsCount: 1,
    durationMs: 1,
  };
}

function createAnalysisCore(
  eventBus: AgentEventBus,
  run: (runId: string) => AgentRunResult | { readonly ok: false; readonly code: "invalid_plan_request"; readonly message: string },
): WorkAgentCore {
  return {
    getEventBus: () => eventBus,
    proposeRequiredPlan: async () => ({
      ok: true as const,
      steps: [{ description: "整理结果", completionRequirement: "analysis" as const }],
    }),
    runRequiredPlan: async (request: unknown) => {
      const runId = String((request as { runId: string }).runId);
      const result = run(runId);
      if ("ok" in result) return result;
      return { ok: true as const, result };
    },
    cancel: () => true,
  };
}

test("terminal tasks are retained independently and export by immutable history identity", async () => {
  const eventBus = new AgentEventBus();
  let runCount = 0;
  const coordinator = new WorkTaskCoordinator({
    agentCore: createAnalysisCore(eventBus, (runId) => completedResult(runId, `结果 ${++runCount}`)),
  });

  const complete = async (task: string): Promise<void> => {
    const created = await coordinator.createPlan({ task, fileReadMode: "optional" });
    assert.equal(created.ok, true);
    if (!created.ok || created.snapshot.proposalId === undefined) return;
    const confirmed = await coordinator.confirmPlan(created.snapshot.proposalId);
    assert.equal(confirmed.ok, true);
  };

  await complete("第一个历史任务");
  const firstHistoryId = coordinator.getHistory().records[0]?.historyId;
  assert.ok(firstHistoryId);
  await complete("第二个历史任务");
  assert.equal(coordinator.getHistory().records.length, 2);
  assert.equal(coordinator.getHistory().records.find((item) => item.historyId === firstHistoryId)?.finalText, "结果 1");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "firefly-work-history-"));
  try {
    const target = path.join(directory, "first-history.md");
    const exported = await coordinator.exportMarkdown(firstHistoryId, target);
    assert.deepEqual(exported, { ok: true, fileName: "first-history.md" });
    const markdown = await fs.readFile(target, "utf8");
    assert.match(markdown, /结果 1/);
    assert.doesNotMatch(markdown, /结果 2/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }

  const activePlan = await coordinator.createPlan({ task: "当前在途任务", fileReadMode: "optional" });
  assert.equal(activePlan.ok, true);
  assert.equal(coordinator.getHistory().records.length, 2);
  assert.equal(coordinator.getSnapshot()?.phase, "awaiting_confirmation");
  coordinator.dispose();
});

test("failed and cancelled terminal tasks are retained with their real terminal phases", async () => {
  const failedCoordinator = new WorkTaskCoordinator({
    agentCore: createAnalysisCore(new AgentEventBus(), () => ({
      ok: false,
      code: "invalid_plan_request",
      message: "执行请求被拒绝",
    })),
  });
  const failedPlan = await failedCoordinator.createPlan({ task: "失败任务", fileReadMode: "optional" });
  assert.equal(failedPlan.ok, true);
  if (failedPlan.ok && failedPlan.snapshot.proposalId !== undefined) {
    await failedCoordinator.confirmPlan(failedPlan.snapshot.proposalId);
  }
  assert.equal(failedCoordinator.getHistory().records[0]?.phase, "failed");
  assert.equal(failedCoordinator.getHistory().records[0]?.error, "任务未完成；详细执行错误未保留。");
  failedCoordinator.dispose();

  const cancelledCoordinator = new WorkTaskCoordinator({
    agentCore: createAnalysisCore(new AgentEventBus(), () => {
      throw new Error("run should not start");
    }),
  });
  const cancellablePlan = await cancelledCoordinator.createPlan({ task: "取消任务", fileReadMode: "optional" });
  assert.equal(cancellablePlan.ok, true);
  const cancelled = await cancelledCoordinator.cancel();
  assert.equal(cancelled.ok, true);
  assert.equal(cancelledCoordinator.getHistory().records[0]?.phase, "cancelled");
  cancelledCoordinator.dispose();
});
