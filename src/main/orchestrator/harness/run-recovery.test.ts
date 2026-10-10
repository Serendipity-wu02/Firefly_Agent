import { describe, expect, it } from "vitest";
import { prepareHarnessRecovery } from "./run-recovery";
import type { HarnessRunSession } from "./run-store";

function session(toolCalls: HarnessRunSession["toolCalls"]): HarnessRunSession {
  return {
    schemaVersion: 1,
    conversationId: "chat-1",
    runId: "run-old",
    status: "interrupted",
    messages: [{
      role: "assistant",
      content: "我会执行工具。",
      toolCalls: toolCalls.map((call) => ({ id: call.toolCallId, name: call.toolName, arguments: JSON.stringify({ path: "a.txt" }) })),
    }],
    state: { todoItems: [{ id: "work", content: "继续处理", status: "in_progress" }], uncertainEffects: [] },
    toolOutputs: [],
    toolCalls,
    rounds: 3,
    cache: { cacheEpoch: 3, epochReason: "compaction" },
    request: { provider: "openai", model: "old", contextWindowTokens: 128_000, mode: "work", promptFingerprint: "p", toolSchemaFingerprint: "t", workspaceRoot: "E:\\project" },
    createdAt: 1,
    updatedAt: 2,
  };
}

describe("prepareHarnessRecovery", () => {
  it("turns an interrupted non-idempotent invocation into an unknown fact without replaying it", () => {
    const recovered = prepareHarnessRecovery(session([
      { toolCallId: "mail-1", toolName: "send_email", sideEffect: "non_idempotent_side_effect", status: "started", updatedAt: 2 },
    ]), { workspaceRoot: "E:\\project" });

    expect(recovered.state.uncertainEffects).toEqual([
      expect.objectContaining({ toolCallId: "mail-1", toolName: "send_email" }),
    ]);
    expect(recovered.messages.at(-1)).toMatchObject({ role: "tool", toolCallId: "mail-1" });
    expect(recovered.messages.at(-1)?.content).toContain("unknown_after_interruption");
    expect(recovered.recoveryContext).toContain("不得自动重放");
  });

  it("repairs an unstarted planned read call as not executed so the model chooses whether to read again", () => {
    const recovered = prepareHarnessRecovery(session([
      { toolCallId: "read-1", toolName: "read_file", sideEffect: "read_only", status: "planned", updatedAt: 2 },
    ]), { workspaceRoot: "E:\\project" });

    expect(recovered.state.uncertainEffects).toEqual([]);
    expect(recovered.messages.at(-1)?.content).toContain("not_executed_after_interruption");
  });

  it("rejects recovery when the bound workspace changed", () => {
    expect(() => prepareHarnessRecovery(session([]), { workspaceRoot: "E:\\another-project" }))
      .toThrow("HARNESS_RECOVERY_WORKSPACE_MISMATCH");
  });

  it("keeps recovery explicit about a changed model and unavailable old tools", () => {
    const interrupted = session([]);
    interrupted.request.enabledToolIds = ["read_file", "removed_tool"];
    const recovered = prepareHarnessRecovery(interrupted, {
      workspaceRoot: "E:\\project",
      provider: "anthropic",
      model: "new-model",
      enabledToolIds: ["read_file"],
    });

    expect(recovered.recoveryContext).toContain("模型已变化");
    expect(recovered.recoveryContext).toContain("removed_tool");
  });

  it("starts recovery in the next cache epoch without mutating the old transcript", () => {
    const interrupted = session([]);
    const originalMessages = JSON.parse(JSON.stringify(interrupted.messages));

    const recovered = prepareHarnessRecovery(interrupted, { workspaceRoot: "E:\\project" });

    expect(recovered.cache).toEqual({ cacheEpoch: 4, epochReason: "recovery" });
    expect(interrupted.messages).toEqual(originalMessages);
  });
});

it("cancel_then_resume_pairs_every_declared_call_with_the_canonical_started_boundary", async () => {
  const { materializeTranscript } = await import("../conversation-transcript-context");
  const interrupted = session([
    { toolCallId: "planned-write", toolName: "write_file", sideEffect: "non_idempotent_side_effect", status: "planned", updatedAt: 2 },
    { toolCallId: "started-write", toolName: "write_file", sideEffect: "non_idempotent_side_effect", status: "started", updatedAt: 2 },
    { toolCallId: "started-read", toolName: "read_file", sideEffect: "read_only", status: "started", updatedAt: 2 },
    { toolCallId: "unknown-write", toolName: "write_file", sideEffect: "non_idempotent_side_effect", status: "unknown", updatedAt: 2 },
    { toolCallId: "committed", toolName: "read_file", sideEffect: "read_only", status: "committed", updatedAt: 2 },
  ]);
  interrupted.messages[0].toolCalls!.push({ id: "untracked", name: "write_file", arguments: "{}" });
  const committed = { role: "tool" as const, toolCallId: "committed", content: JSON.stringify({ outcome: "success" }) };
  interrupted.messages.push(committed);
  const recovered = prepareHarnessRecovery(interrupted, { workspaceRoot: "E:\\project" });
  const outcomes = new Map(recovered.messages.filter(message => message.role === "tool").map(message => [message.toolCallId, JSON.parse(message.content as string).outcome]));
  expect(outcomes).toEqual(new Map([
    ["committed", "success"], ["planned-write", "not_executed_after_interruption"], ["started-write", "unknown_after_interruption"],
    ["started-read", "unknown_after_interruption"], ["unknown-write", "unknown_after_interruption"], ["untracked", "not_executed_after_interruption"],
  ]));
  for (const call of interrupted.messages[0].toolCalls!) expect(recovered.messages.filter(message => message.toolCallId === call.id)).toHaveLength(1);
  expect(recovered.state.uncertainEffects.map(effect => effect.toolCallId)).toEqual(["started-write", "unknown-write"]);
  const canonical = materializeTranscript([
    { kind: "assistant", id: "assistant", seq: 1, at: 1, runId: interrupted.runId, payload: interrupted.messages[0] },
    { kind: "tool_result", id: "committed-result", seq: 2, at: 2, runId: interrupted.runId, payload: { assistantEntryId: "assistant", toolCallId: "committed", outcome: "success", message: committed } },
  ] as import("../conversation-transcript-types").TranscriptEntry[], { get: () => interrupted });
  for (const message of canonical.messages.filter(message => message.role === "tool")) {
    expect(outcomes.get(message.toolCallId)).toContain(JSON.parse(message.content as string).outcome);
  }
});
