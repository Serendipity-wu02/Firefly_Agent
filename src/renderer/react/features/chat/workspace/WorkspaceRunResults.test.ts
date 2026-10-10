// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceRunResults, WorkspaceResultsIndex, WorkspaceChangeDiff } from "./WorkspaceRunResults";
import type { WorkspaceRunOutput } from "./workspace-artifacts";
vi.mock("../../../i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const change = { file: "report.md", kind: "added" as const, insertions: 1, deletions: 0, diff: [{ type: "add" as const, text: "changed bytes" }] };
const output: WorkspaceRunOutput = { id: "results:s:r", sessionId: "s", runId: "r", messageId: "m", files: [{ toolId: "write", change }], tasks: [], tools: [{ id: "delegate", name: "delegate_agent", status: "success", result: "short preview", taskResult: { agentId: "reviewer", sessionId: "child", status: "completed", text: "complete task output", truncated: true } }] };
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
it("opens exact evidence files and diffs while displaying actual full child output", () => {
  const onOpenFile = vi.fn(), onOpenDiff = vi.fn();
  act(() => root.render(React.createElement(WorkspaceRunResults, { output, workspaceRoot: "/work", onOpenFile, onOpenDiff })));
  expect(host.textContent).toContain("complete task output");
  expect(host.textContent).toContain("workspace.resultTruncated");
  act(() => host.querySelector<HTMLButtonElement>('[data-output-file]')!.click());
  expect(onOpenFile).toHaveBeenCalledExactlyOnceWith("report.md");
  act(() => host.querySelector<HTMLButtonElement>('[data-output-diff]')!.click());
  expect(onOpenDiff).toHaveBeenCalledExactlyOnceWith(output, output.files[0]);
});
it("does not offer to read a deleted or outside workspace file", () => {
  act(() => root.render(React.createElement(WorkspaceRunResults, { output: { ...output, files: [{ toolId: "remove", change: { ...change, kind: "deleted" } }, { toolId: "outside", change: { ...change, file: "/elsewhere/a" } }] }, workspaceRoot: "/work", onOpenFile: vi.fn(), onOpenDiff: vi.fn() })));
  expect(host.querySelector('[data-output-file]')).toBeNull();
  expect(host.querySelectorAll('[data-output-diff]')).toHaveLength(2);
});
it("selects the source run rather than inferring a result from chat text", () => {
  const onOpenResult = vi.fn();
  act(() => root.render(React.createElement(WorkspaceResultsIndex, { outputs: [output], onOpenResult })));
  act(() => host.querySelector<HTMLButtonElement>('[data-output-result]')!.click());
  expect(onOpenResult).toHaveBeenCalledExactlyOnceWith(output.id);
});
it("shows real inline diff and a clear state when no diff bytes were supplied", () => {
  act(() => root.render(React.createElement(WorkspaceChangeDiff, { change })));
  expect(host.textContent).toContain("changed bytes");
  expect(host.querySelector('.is-add')).not.toBeNull();
  act(() => root.render(React.createElement(WorkspaceChangeDiff, { change: { ...change, diff: undefined } })));
  expect(host.textContent).toContain("workspace.diffUnavailable");
});

const writeEvidence = { path: "prior.md", canonicalPath: "/work/prior.md", agentId: "reviewer", childRunId: "child-run", toolCallId: "write-child", state: "applied" as const, before: { sha256: "a".repeat(64) }, after: { version: "absent" }, eventIds: ["actual-write-event"] };
it.each(["failed", "cancelled"] as const)("failed_child_shows_prior_writes_and_sibling_success: %s", status => {
  const taskResult = { agentId: "reviewer", sessionId: "child", status, text: "Stopped after writing", writes: [writeEvidence], error: { code: "AGENT_WRITE_CONFLICT", message: "Another child owns blocked.md" } };
  act(() => root.render(React.createElement(WorkspaceRunResults, { output: { ...output, files: [], tools: [
    { id: "failed-child", name: "delegate_agent", status: "error", taskResult },
    { id: "sibling", name: "delegate_agent", status: "success", taskResult: { agentId: "writer", sessionId: "sibling-child", status: "completed", text: "Sibling successful result" } },
  ] }, workspaceRoot: "/work", onOpenFile: vi.fn(), onOpenDiff: vi.fn() })));
  expect(host.textContent).toContain("prior.md");
  expect(host.textContent).toContain("workspace.writeState.applied");
  expect(host.textContent).toContain("a".repeat(64));
  expect(host.textContent).toContain("absent");
  expect(host.textContent).toContain("actual-write-event");
  expect(host.textContent).toContain("write-child");
  expect(host.textContent).toContain("AGENT_WRITE_CONFLICT");
  expect(host.textContent).toContain("Sibling successful result");
});
it("all_effect_states_survive_restore", () => {
  const writes = (["applied", "partially_applied", "unknown", "not_applied"] as const).map(state => ({ ...writeEvidence, path: `${state}.md`, state, before: undefined, after: undefined }));
  const live: WorkspaceRunOutput = { ...output, files: [], tools: [{ ...output.tools[0], taskResult: { ...output.tools[0].taskResult!, status: "failed", writes } }] };
  const restored: WorkspaceRunOutput = JSON.parse(JSON.stringify(live));
  act(() => root.render(React.createElement(WorkspaceRunResults, { output: live, workspaceRoot: "/work", onOpenFile: vi.fn(), onOpenDiff: vi.fn() })));
  const liveMarkup = host.innerHTML;
  act(() => root.render(React.createElement(WorkspaceRunResults, { output: restored, workspaceRoot: "/work", onOpenFile: vi.fn(), onOpenDiff: vi.fn() })));
  expect(host.innerHTML).toBe(liveMarkup);
  for (const state of ["applied", "partially_applied", "unknown", "not_applied"]) expect(host.textContent).toContain(`workspace.writeState.${state}`);
  expect(host.querySelectorAll('[data-write-state]')).toHaveLength(4);
  expect(host.querySelectorAll('[data-output-diff]')).toHaveLength(0);
  expect(host.textContent).toContain("workspace.versionUnavailable");
});
it("shows unavailable evidence for legacy child results rather than zero modifications", () => {
  act(() => root.render(React.createElement(WorkspaceRunResults, { output, workspaceRoot: "/work", onOpenFile: vi.fn(), onOpenDiff: vi.fn() })));
  expect(host.textContent).toContain("workspace.writeEvidenceUnavailable");
});

it("restores observed model event identity, monotonic clock and terminal metadata", () => {
  const executionEvents = [{ id: "model-end", seq: 2, monotonicMs: 20, clockDomainId: "synthetic-clock", agentId: "reviewer", parentRunId: "r", childRunId: "child-run", executionId: "execution-1", phase: "end" as const, terminal: "failed" as const }];
  const restored: WorkspaceRunOutput = JSON.parse(JSON.stringify({ ...output, files: [], tools: [{ ...output.tools[0], taskResult: { ...output.tools[0].taskResult, writes: [writeEvidence], executionEvents } }] }));
  act(() => root.render(React.createElement(WorkspaceRunResults, { output: restored, onOpenFile: vi.fn(), onOpenDiff: vi.fn() })));
  expect(host.textContent).toContain("model-end");
  expect(host.textContent).toContain("execution-1");
  expect(host.textContent).toContain("synthetic-clock");
  expect(host.textContent).toContain("workspace.childStatus.failed");
  expect(host.querySelector('[data-execution-phase="end"]')).not.toBeNull();
});

it("shows the delegated agent and its task above a rendered conclusion, and scrolls to the requested task", () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  const task = { invocationId: "run-1", taskId: "child", description: "检查取消链路", nickname: "艾利欧", assetFileName: "艾利欧.png", status: "completed" as const };
  const withTask: WorkspaceRunOutput = { ...output, files: [], tasks: [task], tools: [{ ...output.tools[0], taskResult: { agentId: "strategy-planning", sessionId: "child", status: "completed", text: "## 结论 已核对 **全部** 文件" } }] };
  const props = { output: withTask, workspaceRoot: "/work", onOpenFile: vi.fn(), onOpenDiff: vi.fn() };
  act(() => root.render(React.createElement(WorkspaceRunResults, props)));
  const article = host.querySelector<HTMLElement>('[data-task-id="child"]')!;
  expect(article.querySelector("header strong")?.textContent).toBe("艾利欧");
  expect(article.querySelector(".cy-workspace-run-results__task")?.textContent).toBe("检查取消链路");
  expect(article.querySelector(".cy-workspace-run-results__text")?.textContent).toContain("已核对");
  expect(article.querySelector(".cy-workspace-run-results__text")?.textContent).not.toContain("**");
  expect(scroll).not.toHaveBeenCalled();
  act(() => root.render(React.createElement(WorkspaceRunResults, { ...props, focusTask: { taskId: "child", seq: 1 } })));
  expect(scroll).toHaveBeenCalledOnce();
  act(() => root.render(React.createElement(WorkspaceRunResults, { ...props, focusTask: { taskId: "child", seq: 2 } })));
  expect(scroll).toHaveBeenCalledTimes(2);
});
