import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryMemoryStore } from "../dist/main/main/character/memory/memory-store.js";
import { ImportanceEvaluator } from "../dist/main/main/character/memory/importance-evaluator.js";
import { MemoryWritePolicy } from "../dist/main/main/character/memory/memory-write-policy.js";
import { MemoryWriteService } from "../dist/main/main/character/memory/memory-write-service.js";

test("1. Explicit User Fact: Accurately accepted and routed to L2 Semantic user profile", async () => {
  const store = new InMemoryMemoryStore();
  const service = new MemoryWriteService(store);

  const decision = await service.write({
    key: "用户姓名",
    value: "开拓者",
    category: "profile",
    source: "user_explicit",
  });

  assert.equal(decision.accepted, true);
  assert.equal(decision.reason, "explicit_profile");
  assert.equal(decision.targetLayer, "L2_SEMANTIC");
  assert.equal(decision.targetScope, "user");
  assert.ok(decision.importance >= 0.95);

  const saved = await store.listRecords();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].key, "用户姓名");
  assert.equal(saved[0].value, "开拓者");
});

test("2. User Preference: Saved as L2 Semantic record and creates PreferenceItem", async () => {
  const store = new InMemoryMemoryStore();
  const service = new MemoryWriteService(store);

  const decision = await service.write({
    key: "喜爱的甜品",
    value: "橡木蛋糕卷",
    category: "preference",
    source: "user_explicit",
  });

  assert.equal(decision.accepted, true);
  assert.equal(decision.reason, "user_preference");
  assert.equal(decision.targetLayer, "L2_SEMANTIC");
  assert.ok(decision.preferenceItem !== undefined);
  assert.equal(decision.preferenceItem.subject, "喜爱的甜品");

  const prefs = await store.listPreferences();
  assert.equal(prefs.length, 1);
  assert.equal(prefs[0].subject, "喜爱的甜品");
});

test("3. Relationship Memory: Creates relation edge and correctly links to memory record", async () => {
  const store = new InMemoryMemoryStore();
  const service = new MemoryWriteService(store);

  const decision = await service.write({
    key: "特别信赖",
    value: "流萤",
    category: "relation",
    source: "user_explicit",
  });

  assert.equal(decision.accepted, true);
  assert.equal(decision.reason, "relationship_state");
  assert.ok(decision.relationEdge !== undefined);
  assert.equal(decision.relationEdge.predicate, "特别信赖");
  assert.equal(decision.relationEdge.object, "流萤");

  const relations = await store.listRelations();
  assert.equal(relations.length, 1);
});

test("4. Important Event: Milestone event allocated with high importance", async () => {
  const store = new InMemoryMemoryStore();
  const service = new MemoryWriteService(store);

  const decision = await service.write({
    key: "天台之约",
    value: "在筑梦边境秘密基地看流星雨",
    category: "event",
    source: "user_explicit",
  });

  assert.equal(decision.accepted, true);
  assert.equal(decision.reason, "important_event");
  assert.ok(decision.importance >= 0.75);
});

test("5. Casual Chat Rejection: Routine greetings and chatter are blocked from store", async () => {
  const store = new InMemoryMemoryStore();
  const service = new MemoryWriteService(store);

  const greetings = [
    { key: "闲聊", value: "你好呀！", category: "casual_chat" },
    { key: "表情", value: "哈哈哈哈", category: "ephemeral_chat" },
    { key: "系统日志", value: "render cycle 12", category: "system_noise" },
  ];

  for (const item of greetings) {
    const decision = await service.write(item);
    assert.equal(decision.accepted, false);
    assert.ok(decision.reason.includes("rejected"));
  }

  const saved = await store.listRecords();
  assert.equal(saved.length, 0, "No casual chat should ever enter store");
});

test("6. Ephemeral State: Temporary state allocated to L0_WORKING with TTL and session scope", async () => {
  const store = new InMemoryMemoryStore();
  const service = new MemoryWriteService(store);

  const decision = await service.write({
    key: "当前心情",
    value: "今天有点累",
    category: "working_state",
    ttlMs: 3600000,
  });

  assert.equal(decision.accepted, true);
  assert.equal(decision.reason, "temporary_state");
  assert.equal(decision.targetLayer, "L0_WORKING");
  assert.equal(decision.targetScope, "session");
  assert.ok(decision.normalizedRecord.expiresAt > Date.now());
});

test("7. Persistent Fact: Unexpiring profile fact allocated to L2 without expiresAt", async () => {
  const store = new InMemoryMemoryStore();
  const service = new MemoryWriteService(store);

  const decision = await service.write({
    key: "坚果过敏",
    value: "严重花生坚果过敏",
    category: "profile",
    pinned: true,
  });

  assert.equal(decision.accepted, true);
  assert.equal(decision.targetLayer, "L2_SEMANTIC");
  assert.equal(decision.normalizedRecord.expiresAt, undefined);
  assert.equal(decision.normalizedRecord.pinned, true);
});

test("8. Importance Scoring: Evaluator outputs proper relative scores across categories", () => {
  const evaluator = new ImportanceEvaluator();

  const profileScore = evaluator.evaluate({ key: "k", value: "v", category: "profile", source: "user_explicit" });
  const prefScore = evaluator.evaluate({ key: "k", value: "v", category: "preference" });
  const eventScore = evaluator.evaluate({ key: "k", value: "v", category: "event" });
  const chatScore = evaluator.evaluate({ key: "k", value: "v", category: "casual_chat" });

  assert.equal(profileScore, 1.0);
  assert.equal(prefScore, 0.85);
  assert.equal(eventScore, 0.75);
  assert.equal(chatScore, 0.10);
});

test("9. Pinned Behavior: Pinned memory guarantees maximum importance and immunity", () => {
  const evaluator = new ImportanceEvaluator();
  const score = evaluator.evaluate({ key: "k", value: "v", category: "working_state", pinned: true });
  assert.ok(score >= 0.95, "Pinned items must have >= 0.95 importance");
});

test("10. Duplicate Memory: Identical write proposal increments accessCount without creating duplicate record", async () => {
  const store = new InMemoryMemoryStore();
  const service = new MemoryWriteService(store);

  const proposal = {
    key: "喜欢的歌曲",
    value: "使一颗心免于哀伤",
    category: "preference",
    source: "user_explicit",
  };

  const decision1 = await service.write(proposal);
  assert.equal(decision1.accepted, true);

  const decision2 = await service.write(proposal);
  assert.equal(decision2.accepted, true);
  assert.equal(decision2.reason, "duplicate_updated");

  const records = await store.listRecords();
  assert.equal(records.length, 1, "Must not create duplicate record in store");
  assert.equal(records[0].accessCount, 1, "accessCount must be incremented");
});

test("11. Explicit User Correction: Supersedes previous value and records audit history in metadata", async () => {
  const store = new InMemoryMemoryStore();
  const service = new MemoryWriteService(store);

  // Initial statement
  await service.write({
    key: "居住地",
    value: "黄金的时刻",
    category: "profile",
  });

  // User correction
  const decision = await service.write({
    key: "居住地",
    value: "流梦礁",
    category: "profile",
    isCorrection: true,
  });

  assert.equal(decision.accepted, true);
  assert.equal(decision.reason, "user_correction");

  const records = await store.listRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0].value, "流梦礁");
  assert.ok(records[0].metadata.history.length === 1);
  assert.equal(records[0].metadata.history[0].value, "黄金的时刻");
  assert.equal(records[0].metadata.history[0].reason, "user_correction");
});

test("12. Rejected Item Never Reaches Store: Low importance item is completely blocked", async () => {
  const store = new InMemoryMemoryStore();
  const service = new MemoryWriteService(store, { minImportanceThreshold: 0.5 });

  const decision = await service.write({
    key: "零碎信息",
    value: "路过了一家便利店",
    category: "working_state", // Importance ~0.35 < 0.50
  });

  assert.equal(decision.accepted, false);
  assert.equal(decision.reason, "low_importance_rejected");

  const records = await store.listRecords();
  assert.equal(records.length, 0);
});

test("13. Deterministic Importance: Identical proposals yield exact same importance output", () => {
  const evaluator = new ImportanceEvaluator();
  const proposal = {
    key: "测试",
    value: "内容",
    category: "event",
    source: "user_explicit",
  };

  const score1 = evaluator.evaluate(proposal);
  const score2 = evaluator.evaluate(proposal);
  assert.equal(score1, score2);
  assert.equal(score1, 0.80);
});

test("14. Scope Assignment: Correct scope resolution without leaking to global scope", async () => {
  const policy = new MemoryWritePolicy();

  const userDec = policy.evaluateProposal({ key: "k", value: "v", category: "profile" });
  assert.equal(userDec.targetScope, "user");

  const sessDec = policy.evaluateProposal({ key: "k", value: "v", category: "working_state" });
  assert.equal(sessDec.targetScope, "session");

  const charDec = policy.evaluateProposal({ key: "k", value: "v", category: "profile", scope: "character" });
  assert.equal(charDec.targetScope, "character");
});

test("15. Write Service and Store End-to-End Integration: Entity and relation sync", async () => {
  const store = new InMemoryMemoryStore();
  const service = new MemoryWriteService(store);

  await service.write({
    key: "格拉默",
    value: "帝国故土",
    category: "entity",
  });

  const entities = await store.listEntities();
  assert.equal(entities.length, 1);
  assert.equal(entities[0].name, "格拉默");
});
