import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentRunResult } from "../../../src/shared/agent-types.ts";
import type { WorkTaskSnapshot } from "../../../dist/main/shared/work-types.js";
import {
  WorkTaskCoordinator,
  type WorkAgentCore,
} from "../../../dist/main/main/work/work-task-coordinator.js";
import { renderWorkMarkdown } from "../../../dist/main/shared/work-markdown.js";
import { AgentEventBus } from "../../../dist/main/main/orchestrator/agent-events.js";

async function withTempDirectory<T>(fn: (directory: string) => Promise<T>): Promise<T> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "firefly-work-export-"));
  try {
    return await fn(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function snapshot(): WorkTaskSnapshot {
  return {
    taskId: "work-task-test",
    userPrompt: "总结这次任务",
    browserRequestTargets: [],
    fileSelection: {
      selectionId: "selection-test" as never,
      fileSelectionId: "selection-test" as never,
      files: [{
        fileId: "file-test" as never,
        displayName: "notes.md",
        fileKind: "markdown",
        byteLength: 12,
        symbolicLink: false,
      }],
      totalBytes: 12,
    },
    fileReadMode: "required",
    phase: "completed",
    runId: "run-test",
    steps: [{
      index: 0,
      description: "读取资料",
      completionRequirement: "tool",
      toolBinding: {
        toolName: "file_read",
        arguments: { selectionId: "selection-test", fileId: "file-test" },
        argumentMatching: "exact",
        successContract: "json_ok_true",
        correction: "once",
      },
      status: "completed",
      verificationStatus: "success",
      verificationReason: "success",
      observation: "读取成功",
    }],
    cancelRequested: false,
    terminationReason: { kind: "completed" },
    finalText: "资料总结：结论成立。",
    createdAt: 1,
    updatedAt: 2,
  };
}

test("Work Markdown export renders the task result without private paths or opaque identities", () => {
  const markdown = renderWorkMarkdown(snapshot());

  assert.match(markdown, /^# Work 任务/m);
  assert.match(markdown, /总结这次任务/);
  assert.match(markdown, /notes\.md/);
  assert.match(markdown, /读取资料/);
  assert.match(markdown, /资料总结：结论成立。/);
  assert.doesNotMatch(markdown, /selection-test/);
  assert.doesNotMatch(markdown, /file-test/);
  assert.doesNotMatch(markdown, /[A-Z]:\\/);
});

test("Work export asks the native save dialog to confirm an existing target", async () => {
  const source = await fs.readFile(path.resolve("src/main/work/work-ipc.ts"), "utf8");
  const exportHandler = source.slice(source.indexOf("IPC.WORK_EXPORT_MARKDOWN"));
  assert.match(exportHandler, /properties:\s*\["showOverwriteConfirmation"\]/);
});

test("Work coordinator writes a terminal snapshot to the user-selected Markdown path", async () => {
  await withTempDirectory(async (directory) => {
    const eventBus = new AgentEventBus();
    const core: WorkAgentCore = {
      getEventBus: () => eventBus,
      proposeRequiredPlan: async () => ({
        ok: true as const,
        steps: [{ description: "整理结果", completionRequirement: "analysis" as const }],
      }),
      runRequiredPlan: async (request: unknown) => ({
        ok: true as const,
        result: {
          runId: String((request as { runId: string }).runId),
          status: "completed" as const,
          terminationReason: { kind: "completed" as const },
          finalText: "导出的最终结果",
          transcript: [],
          toolCallsCount: 0,
          roundsCount: 1,
          durationMs: 1,
        } satisfies AgentRunResult,
      }),
      cancel: () => true,
    };
    const coordinator = new WorkTaskCoordinator({ agentCore: core });
    const created = await coordinator.createPlan({ task: "导出这个任务", fileReadMode: "optional" });
    assert.equal(created.ok, true);
    if (!created.ok || created.snapshot.proposalId === undefined) return;
    const confirmed = await coordinator.confirmPlan(created.snapshot.proposalId);
    assert.equal(confirmed.ok, true);

    const target = path.join(directory, "work-result.md");
    const historyId = coordinator.getHistory().records[0]?.historyId;
    assert.ok(historyId);
    const exported = await coordinator.exportMarkdown(historyId, target);
    assert.deepEqual(exported, { ok: true, fileName: "work-result.md" });
    assert.match(await fs.readFile(target, "utf8"), /导出的最终结果/);
    coordinator.dispose();
  });
});

test("Repeated Work exports preserve the same terminal result", async () => {
  await withTempDirectory(async (directory) => {
    const eventBus = new AgentEventBus();
    const core: WorkAgentCore = {
      getEventBus: () => eventBus,
      proposeRequiredPlan: async () => ({
        ok: true as const,
        steps: [{ description: "整理结果", completionRequirement: "analysis" as const }],
      }),
      runRequiredPlan: async (request: unknown) => ({
        ok: true as const,
        result: {
          runId: String((request as { runId: string }).runId),
          status: "completed" as const,
          terminationReason: { kind: "completed" as const },
          finalText: "重复导出仍保持同一结果",
          transcript: [],
          toolCallsCount: 0,
          roundsCount: 1,
          durationMs: 1,
        } satisfies AgentRunResult,
      }),
      cancel: () => true,
    };
    const coordinator = new WorkTaskCoordinator({ agentCore: core });
    const created = await coordinator.createPlan({ task: "重复导出", fileReadMode: "optional" });
    assert.equal(created.ok, true);
    if (!created.ok || created.snapshot.proposalId === undefined) return;
    assert.equal((await coordinator.confirmPlan(created.snapshot.proposalId)).ok, true);

    const target = path.join(directory, "repeated.md");
    const historyId = coordinator.getHistory().records[0]?.historyId;
    assert.ok(historyId);
    const results = await Promise.all([
      coordinator.exportMarkdown(historyId, target),
      coordinator.exportMarkdown(historyId, target),
    ]);
    assert.deepEqual(results, [
      { ok: true, fileName: "repeated.md" },
      { ok: true, fileName: "repeated.md" },
    ]);
    assert.match(await fs.readFile(target, "utf8"), /重复导出仍保持同一结果/);
    coordinator.dispose();
  });
});

test("Work export keeps the original snapshot when a new task is created", async () => {
  await withTempDirectory(async (directory) => {
    const eventBus = new AgentEventBus();
    let runCount = 0;
    const core: WorkAgentCore = {
      getEventBus: () => eventBus,
      proposeRequiredPlan: async () => ({
        ok: true as const,
        steps: [{ description: "生成结果", completionRequirement: "analysis" as const }],
      }),
      runRequiredPlan: async (request: unknown) => ({
        ok: true as const,
        result: {
          runId: String((request as { runId: string }).runId),
          status: "completed" as const,
          terminationReason: { kind: "completed" as const },
          finalText: `任务结果 ${++runCount}`,
          transcript: [],
          toolCallsCount: 0,
          roundsCount: 1,
          durationMs: 1,
        } satisfies AgentRunResult,
      }),
      cancel: () => true,
    };
    const coordinator = new WorkTaskCoordinator({ agentCore: core });
    const complete = async (task: string): Promise<void> => {
      const created = await coordinator.createPlan({ task, fileReadMode: "optional" });
      assert.equal(created.ok, true);
      if (!created.ok || created.snapshot.proposalId === undefined) return;
      assert.equal((await coordinator.confirmPlan(created.snapshot.proposalId)).ok, true);
    };

    await complete("第一个任务");
    const target = path.join(directory, "first-task.md");
    const firstHistoryId = coordinator.getHistory().records[0]?.historyId;
    assert.ok(firstHistoryId);
    const firstExport = coordinator.exportMarkdown(firstHistoryId, target);
    await complete("第二个任务");
    assert.equal((await firstExport).ok, true);
    assert.match(await fs.readFile(target, "utf8"), /任务结果 1/);
    assert.doesNotMatch(await fs.readFile(target, "utf8"), /任务结果 2/);
    coordinator.dispose();
  });
});

test("Work Markdown export rejects an active task without writing a file", async () => {
  const eventBus = new AgentEventBus();
  const core: WorkAgentCore = {
    getEventBus: () => eventBus,
    proposeRequiredPlan: async () => ({
      ok: true as const,
      steps: [{ description: "等待确认", completionRequirement: "analysis" as const }],
    }),
    runRequiredPlan: async () => { throw new Error("not reached"); },
    cancel: () => true,
  };
  const coordinator = new WorkTaskCoordinator({ agentCore: core });
  const created = await coordinator.createPlan({ task: "不能导出活动任务", fileReadMode: "optional" });
  assert.equal(created.ok, true);
  const exported = await coordinator.exportMarkdown("missing-history", "ignored.md");
  assert.equal(exported.ok, false);
  if (!exported.ok) assert.equal(exported.code, "not_exportable");
  coordinator.dispose();
});
