import { beforeEach, describe, expect, it, vi } from "vitest";

const { trace, getPlanState, supplementPlan, getPlanPath, completeExecution, readFile } = vi.hoisted(() => ({
  trace: [] as string[],
  getPlanState: vi.fn(),
  supplementPlan: vi.fn(),
  getPlanPath: vi.fn(() => "C:\\plans\\plan.md"),
  completeExecution: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("../../plan-mode", () => ({
  getPlanState,
  supplementPlan,
  getPlanPath,
  completeExecution,
}));

vi.mock("fs", () => ({
  promises: { readFile },
}));

import { completePlanRun, preparePlanRunContext } from "./plan-lifecycle";

describe("harness plan lifecycle", () => {
  beforeEach(() => {
    trace.length = 0;
    getPlanState.mockReset();
    supplementPlan.mockReset();
    getPlanPath.mockReset();
    getPlanPath.mockReturnValue("C:\\plans\\plan.md");
    completeExecution.mockReset();
    readFile.mockReset();
  });

  it("returns the plan state after moving PLAN_REVIEW back to discussion", async () => {
    getPlanState.mockReturnValueOnce("PLAN_REVIEW").mockReturnValueOnce("PLAN_DISCUSSING");

    const prepared = await preparePlanRunContext({ mode: "code", threadId: "thread-1" });

    expect(supplementPlan).toHaveBeenCalledWith("thread-1");
    expect(prepared.planState).toBe("PLAN_DISCUSSING");
  });

  it("emits plan completion only when execution returns a path and signal is active", () => {
    completeExecution.mockImplementation(() => {
      trace.push("completeExecution");
      return "C:\\plans\\plan.md";
    });
    const sent: unknown[] = [];

    completePlanRun({ planState: "EXECUTING",
      mode: "code",
      threadId: "thread-1",
      runId: "run-1",
      runStatus: "completed",
      signal: new AbortController().signal,
      send: (event) => sent.push(event),
    });

    expect(trace).toEqual(["completeExecution"]);
    expect(sent).toEqual([expect.objectContaining({
      type: "CUSTOM",
      name: "firefly.plan.completed",
      runId: "run-1",
      value: { planPath: "C:\\plans\\plan.md", runStatus: "completed" },
    })]);
  });
});

describe("plan completion terminal truth", () => {
  beforeEach(() => { completeExecution.mockReset(); completeExecution.mockReturnValue("C:\\plans\\plan.md"); });
  it.each(["failed", "cancelled", "halted"] as const)("does not publish completion for %s while releasing execution state", runStatus => {
    const sent: unknown[] = [];
    completePlanRun({ planState: "EXECUTING", mode: "code", threadId: "thread-1", runId: "run-1", runStatus, signal: new AbortController().signal, send: event => sent.push(event) });
    expect(completeExecution).toHaveBeenCalledWith("thread-1");
    expect(sent).toEqual([]);
  });
  it("releases aborted execution without publishing completion", () => {
    const controller = new AbortController(); controller.abort();
    const sent: unknown[] = [];
    completePlanRun({ planState: "EXECUTING", mode: "code", threadId: "thread-1", runId: "run-1", runStatus: "completed", signal: controller.signal, send: event => sent.push(event) });
    expect(completeExecution).toHaveBeenCalledWith("thread-1");
    expect(sent).toEqual([]);
  });
});

it.each(["NORMAL", "PLAN_REVIEW", "PLAN_DISCUSSING", undefined] as const)("never consumes a newly approved plan from a run prepared with %s", planState => {
  vi.clearAllMocks();
  const sent: unknown[] = [];
  completePlanRun({ mode: "code", threadId: "thread-1", runId: "approval-run", planState, runStatus: "completed", signal: new AbortController().signal, send: event => sent.push(event) });
  expect(completeExecution).not.toHaveBeenCalled();
  expect(sent).toEqual([]);
});
