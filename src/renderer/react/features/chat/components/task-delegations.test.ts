import { describe, expect, it } from "vitest";
import { applyTaskDelegationEvent, normalizeTaskDelegationEvent } from "./task-delegations";

const running = {
  invocationId: "child-run-1", taskId: "task-1", description: "检查取消链路",
  nickname: "艾利欧", assetFileName: "艾利欧.png", status: "running" as const,
};

describe("task delegation presentation reducer", () => {
  it("inserts start and updates the same invocation on terminal settlement", () => {
    const started = applyTaskDelegationEvent([], running, "round-1");
    const completed = applyTaskDelegationEvent(started, { ...running, status: "completed" }, "round-2");

    expect(completed).toEqual([{ ...running, status: "completed", roundId: "round-1" }]);
  });

  it("rejects unknown nicknames and mismatched asset filenames", () => {
    expect(normalizeTaskDelegationEvent({ ...running, nickname: "未知角色" })).toBeUndefined();
    expect(normalizeTaskDelegationEvent({ ...running, assetFileName: "知更鸟.png" })).toBeUndefined();
    expect(normalizeTaskDelegationEvent({ ...running, nickname: "风堇", assetFileName: "风堇.png" })).toBeUndefined();
  });
});

it.each(["completed", "failed", "cancelled"] as const)("does not revive a %s invocation from a replayed start event", status => {
  const terminal = applyTaskDelegationEvent([], { ...running, status }, "round-1");
  const replayed = applyTaskDelegationEvent(terminal, running, "round-2");
  expect(replayed).toEqual(terminal);
  const retry = applyTaskDelegationEvent(replayed, { ...running, invocationId: "child-run-2" }, "round-2");
  expect(retry).toHaveLength(2);
  expect(retry[1]).toMatchObject({ status: "running", roundId: "round-2" });
});
