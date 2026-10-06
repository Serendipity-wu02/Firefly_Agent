import { describe, expect, it } from "vitest";
import type { BaseEvent } from "@ag-ui/core";
import type { HarnessEvent } from "../types";
import { sendHarnessEventAsAgui, sendTaskLifecycleAsAgui } from "./event-mapper";

describe("harness event mapper", () => {
  const capture = (event: HarnessEvent): BaseEvent[] => {
    const sent: BaseEvent[] = [];
    sendHarnessEventAsAgui(event, "msg-1", "thread-1", "run-1", (value) => sent.push(value));
    return sent;
  };

  it("stamps and orders terminal tool result before tool end", () => {
    const sent = capture({
      type: "tool_end",
      toolCallId: "call-1",
      preview: "done",
      outcome: "success",
    });

    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ type: "TOOL_CALL_RESULT", runId: "run-1", status: "success" });
    expect(sent[1]).toMatchObject({ type: "TOOL_CALL_END", runId: "run-1" });
  });

  it("forwards structured task results with the parent run and thread identity", () => {
    const taskResult = { agentId: "reviewer", sessionId: "child-1", status: "completed" as const, text: "x".repeat(500) };
    const sent = capture({ type: "tool_end", toolCallId: "delegate-1", preview: "short", outcome: "success", taskResult });
    expect(sent[0]).toMatchObject({ type: "TOOL_CALL_RESULT", threadId: "thread-1", runId: "run-1", taskResult });
  });

  it("maps final answers into one AG-UI text message", () => {
    expect(capture({ type: "final_answer", content: "完成" })).toEqual([
      expect.objectContaining({ type: "TEXT_MESSAGE_START", runId: "run-1" }),
      expect.objectContaining({ type: "TEXT_MESSAGE_CONTENT", delta: "完成", runId: "run-1" }),
      expect.objectContaining({ type: "TEXT_MESSAGE_END", runId: "run-1" }),
    ]);
  });

  it("maps candidate text as a round-scoped custom event without opening a formal message", () => {
    expect(capture({
      type: "candidate_text_delta",
      roundId: "round-2",
      delta: "正在生成",
    } as HarnessEvent)).toEqual([
      expect.objectContaining({
        type: "CUSTOM",
        name: "firefly.candidate_text",
        value: { action: "delta", roundId: "round-2", delta: "正在生成" },
        runId: "run-1",
      }),
    ]);
  });

  it("maps candidate discard without emitting formal text events", () => {
    expect(capture({
      type: "candidate_text_discard",
      roundId: "round-2",
    } as HarnessEvent)).toEqual([
      expect.objectContaining({
        type: "CUSTOM",
        name: "firefly.candidate_text",
        value: { action: "discard", roundId: "round-2" },
        runId: "run-1",
      }),
    ]);
  });

  it("maps task lifecycle presentation to a stamped custom event", () => {
    const sent: BaseEvent[] = [];
    sendTaskLifecycleAsAgui({ taskId: "task-1", status: "running" } as never, "thread-1", "run-1", (event) => sent.push(event));
    expect(sent).toEqual([
      expect.objectContaining({ type: "CUSTOM", name: "firefly.task", runId: "run-1" }),
    ]);
  });
});

it("rejects child model evidence belonging to a foreign parent before transmission", () => {
  const sent: BaseEvent[] = [];
  sendHarnessEventAsAgui({ type: "tool_end", toolCallId: "delegate", outcome: "success", preview: "short", taskResult: { agentId: "reviewer", sessionId: "child", status: "failed", text: "stale", executionEvents: [{ id: "event", seq: 1, monotonicMs: 0, clockDomainId: "synthetic", agentId: "reviewer", parentRunId: "foreign-run", childRunId: "child-run", executionId: "execution", phase: "start" }] } } as HarnessEvent, "message", "thread", "run-1", value => sent.push(value));
  expect((sent[0] as BaseEvent & { taskResult?: unknown }).taskResult).toBeUndefined();
});
