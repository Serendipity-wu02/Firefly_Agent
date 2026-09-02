import test from "node:test";
import assert from "node:assert/strict";
import { ToolResultPruner, DEFAULT_PRUNING_CONFIG } from "../dist/main/main/orchestrator/compaction/tool-result-pruner.js";
import { PairedSafeCut } from "../dist/main/main/orchestrator/compaction/safe-cut.js";
import { ContextCompactor } from "../dist/main/main/orchestrator/compaction/compactor.js";
import { ContextProjector } from "../dist/main/main/orchestrator/context/context-projector.js";
import { ContextManager } from "../dist/main/main/orchestrator/context/context-manager.js";
import { AgentSession } from "../dist/main/main/orchestrator/agent-session.js";

test("1. Tool Result Pruning: Head + Tail + Middle Marker on large outputs", () => {
  const hugeText = "START_" + "A".repeat(10000) + "_END";
  const { text, pruned } = ToolResultPruner.pruneText(hugeText, {
    maxResultChars: 100,
    headChars: 20,
    tailChars: 10,
    middleMarker: "[...TRUNCATED...]",
  });

  assert.equal(pruned, true);
  assert.ok(text.startsWith("START_"));
  assert.ok(text.endsWith("_END"));
  assert.ok(text.includes("[...TRUNCATED...]"));
  assert.ok(text.length < 100);
});

test("2. Small Result Preservation: Small tool results are not mutated", () => {
  const smallText = JSON.stringify({ ok: true, status: "playing", track: "流萤之歌" });
  const { text, pruned } = ToolResultPruner.pruneText(smallText, {
    maxResultChars: 1000,
  });

  assert.equal(pruned, false);
  assert.equal(text, smallText);
});

test("3. Paired Safe Cut: Basic single-turn tool call & result pairing", () => {
  const messages = [
    { id: "1", role: "user", content: "播放音乐" },
    { id: "2", role: "assistant", content: "好", toolCalls: [{ id: "c1", name: "music_play", arguments: "{}" }] },
    { id: "3", role: "tool", content: '{"ok":true}', toolCallId: "c1" },
    { id: "4", role: "assistant", content: "已为您播放。" },
    { id: "5", role: "user", content: "谢谢流萤" },
    { id: "6", role: "assistant", content: "不客气呢！" },
  ];

  // Request retainCount = 2 (points to index 4: user '谢谢流萤') -> clean cut boundary at index 4
  const cut1 = PairedSafeCut.findCutIndex(messages, 2);
  assert.equal(cut1, 4);

  // Request retainCount = 4 (points to index 2: role: 'tool') -> MUST step back to 1 (before assistant toolCalls)
  const cut2 = PairedSafeCut.findCutIndex(messages, 4);
  assert.equal(cut2, 1);

  // Request retainCount = 5 (points to index 1: assistant toolCalls) -> MUST step back to 1
  const cut3 = PairedSafeCut.findCutIndex(messages, 5);
  assert.equal(cut3, 1);
});

test("4. Multi Tool Round: Complex multi-turn tool rounds remain paired", () => {
  const messages = [
    { id: "u1", role: "user", content: "先搜歌再播放" },
    { id: "a1", role: "assistant", content: "搜索中", toolCalls: [{ id: "c_search", name: "music_search", arguments: "{}" }] },
    { id: "t1", role: "tool", content: '{"tracks":[1,2]}', toolCallId: "c_search" },
    { id: "a2", role: "assistant", content: "播放第1首", toolCalls: [{ id: "c_play", name: "music_play", arguments: "{}" }] },
    { id: "t2", role: "tool", content: '{"ok":true}', toolCallId: "c_play" },
    { id: "a3", role: "assistant", content: "正在为您播放第1首。" },
    { id: "u2", role: "user", content: "真棒" },
    { id: "a4", role: "assistant", content: "嘻嘻~" },
  ];

  // Target cut falling on t2 (index 4) -> step back before a2 (index 3)
  const cut = PairedSafeCut.findCutIndex(messages, 4);
  assert.equal(cut, 3);

  const retained = messages.slice(cut);
  const integrity = PairedSafeCut.validateIntegrity(retained);
  assert.equal(integrity.valid, true);
});

test("5. Error Tool Result: Error results are preserved safely", () => {
  const errorJson = JSON.stringify({ ok: false, error: "device_offline", message: "Audio device offline" });
  const msg = { id: "t_err", role: "tool", content: errorJson, toolCallId: "c_err" };

  const { message: prunedMsg, pruned } = ToolResultPruner.pruneMessage(msg, {
    maxResultChars: 1000,
    preserveErrors: true,
  });

  assert.equal(pruned, false);
  assert.equal(prunedMsg.content, errorJson);
});

test("6. Soft Compaction: Prunes only tool results without cutting dialogue", () => {
  const messages = [
    { id: "s1", role: "system", content: "System prompt" },
    { id: "u1", role: "user", content: "搜歌" },
    { id: "a1", role: "assistant", content: "", toolCalls: [{ id: "c1", name: "music_search", arguments: "{}" }] },
    { id: "t1", role: "tool", content: "RESULT_".repeat(2000), toolCallId: "c1" },
    { id: "a2", role: "assistant", content: "找到歌曲了" },
  ];

  const result = ContextCompactor.softCompact(messages, {
    pruningConfig: { maxResultChars: 100, headChars: 20, tailChars: 10, middleMarker: "[...]" },
  });

  assert.equal(result.strategyApplied, "soft");
  assert.equal(result.compacted, true);
  assert.equal(result.prunedToolCount, 1);
  assert.equal(result.messages.length, 5); // All 5 messages preserved, tool content pruned
  assert.ok(result.messages[3].content.includes("[...]"));
});

test("7. Hard Compaction: Pruning + Paired Safe Cut + Summary Node insertion", () => {
  const messages = [
    { id: "s1", role: "system", content: "System prompt" },
    { id: "u1", role: "user", content: "第1轮提问" },
    { id: "a1", role: "assistant", content: "第1轮回答" },
    { id: "u2", role: "user", content: "第2轮提问" },
    { id: "a2", role: "assistant", content: "第2轮回答" },
    { id: "u3", role: "user", content: "第3轮提问" },
    { id: "a3", role: "assistant", content: "第3轮回答" },
    { id: "u4", role: "user", content: "第4轮提问" },
    { id: "a4", role: "assistant", content: "第4轮回答" },
  ];

  const result = ContextCompactor.hardCompact(messages, { retainCount: 4 });

  assert.equal(result.strategyApplied, "hard");
  assert.equal(result.compacted, true);
  assert.ok(result.summarizedCount > 0);

  // System (1) + Summary (1) + Recent 4 = 6 messages
  assert.equal(result.messages.length, 6);
  assert.equal(result.messages[0].role, "system");
  assert.equal(result.messages[1].role, "system");
  assert.ok(result.messages[1].content.includes("前序对话历史摘要"));
  assert.equal(result.messages[2].content, "第3轮提问");
});

test("8. Emergency Compaction: Triggered on overflow with aggressive pruning and minimal window", () => {
  const messages = [
    { id: "s1", role: "system", content: "System" },
    { id: "u1", role: "user", content: "历史1" },
    { id: "a1", role: "assistant", content: "历史1回复" },
    { id: "u2", role: "user", content: "历史2" },
    { id: "a2", role: "assistant", content: "历史2回复" },
    { id: "u3", role: "user", content: "历史3" },
    { id: "a3", role: "assistant", content: "历史3回复" },
  ];

  const result = ContextCompactor.emergencyCompact(messages, { emergencyRetainCount: 2 });
  assert.equal(result.strategyApplied, "emergency");
  assert.equal(result.compacted, true);
  // System (1) + Summary (1) + Recent 2 = 4 messages
  assert.equal(result.messages.length, 4);
});

test("9. Projection Only Mutation: Original message array is NOT mutated", () => {
  const originalToolMessage = { id: "t1", role: "tool", content: "X".repeat(5000), toolCallId: "c1" };
  const history = [
    { id: "u1", role: "user", content: "你好" },
    originalToolMessage,
  ];

  const projector = new ContextProjector();
  const projected = projector.project({
    userPrompt: "查一下",
    history,
    forceCompactionStrategy: "soft",
    compactorOptions: { pruningConfig: { maxResultChars: 100, headChars: 10, tailChars: 10, middleMarker: ".." } },
  });

  // Original array & message MUST be intact
  assert.equal(history.length, 2);
  assert.equal(originalToolMessage.content.length, 5000);
  assert.ok(projected.messages.find((m) => m.id === "t1").content.length < 100);
});

test("10. Session Preservation: AgentSession remains uncompacted after projection", () => {
  const session = new AgentSession();
  session.append({ id: "u1", role: "user", content: "你好流萤" });
  session.append({ id: "a1", role: "assistant", content: "开拓者好！" });
  session.append({ id: "u2", role: "user", content: "今天天气真好" });
  session.append({ id: "a2", role: "assistant", content: "是呀，想去散步呢！" });

  const cm = new ContextManager();
  const projected = cm.project({
    userPrompt: "我们出发吧",
    history: session.getMessages(),
    forceCompactionStrategy: "hard",
    compactorOptions: { retainCount: 2 },
  });

  // Session size remains 4
  assert.equal(session.size(), 4);
  assert.equal(session.getMessages()[0].content, "你好流萤");

  // Projected messages are compacted to System + Summary + Recent
  assert.ok(projected.compactionResult.compacted);
  assert.ok(projected.messages[1].content.includes("前序对话历史摘要"));
});

test("11. Compaction Failure Safety: Malformed data does not crash and returns original array", () => {
  const malformedMessages = [
    { id: "s1", role: "system", content: "sys" },
    null, // unexpected item
    { id: "u1", role: "user", content: "hi" },
  ].filter(Boolean);

  const result = ContextCompactor.compact(malformedMessages, undefined);
  assert.equal(result.strategyApplied, "none");
  assert.equal(result.messages.length, 2);
});

test("12. Context Overflow Path: Pressure calculation triggers compaction automatically", () => {
  const cm = new ContextManager({
    budgetConfig: {
      contextWindowTokens: 500,
      reservedOutputTokens: 100,
      safetyMarginTokens: 50,
      compactionThreshold: 0.5,
    },
  });

  // Supply long history (20 messages) that exceeds 0.5 pressure ratio
  const longHistory = [];
  for (let i = 0; i < 10; i++) {
    longHistory.push({ id: `u_${i}`, role: "user", content: `用户长消息测试轮次编号 ${i}` });
    longHistory.push({ id: `a_${i}`, role: "assistant", content: `助手回复测试轮次编号 ${i}` });
  }

  const projected = cm.project({
    userPrompt: "最新提问",
    history: longHistory,
  });

  assert.equal(projected.compactionResult.compacted, true);
  assert.ok(projected.compactionResult.summarizedCount > 0);
  assert.ok(projected.messages.length < longHistory.length);
  assert.ok(projected.usage.conversationTokens < 150);
});
