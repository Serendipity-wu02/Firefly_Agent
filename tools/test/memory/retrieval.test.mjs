import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryMemoryStore } from "../../../dist/main/main/character/memory/memory-store.js";
import { MemoryRetriever } from "../../../dist/main/main/character/memory/memory-retriever.js";
import { MemoryRanker } from "../../../dist/main/main/character/memory/memory-ranker.js";
import { DEFAULT_RETRIEVAL_POLICY } from "../../../dist/main/main/character/memory/retrieval-types.js";

function createMockRecord(id, key, value, overrides = {}) {
  return {
    id,
    layer: "L2_SEMANTIC",
    category: "profile",
    scope: "user",
    key,
    value,
    importance: 0.8,
    confidence: 1.0,
    accessCount: 1,
    createdAt: 1000,
    updatedAt: 1000,
    lastAccessedAt: 1000,
    source: "user_explicit",
    ...overrides,
  };
}

test("1. Exact Match: Exact match on entity or key scores highest", async () => {
  const store = new InMemoryMemoryStore();
  await store.saveRecord(createMockRecord("m1", "用户名字", "开拓者", { entities: ["开拓者"] }));
  await store.saveRecord(createMockRecord("m2", "用户喜好", "橡木蛋糕卷", { entities: ["橡木蛋糕卷"] }));

  const retriever = new MemoryRetriever(store);
  const result = await retriever.retrieve({ queryText: "用户名字" });

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].record.id, "m1");
  assert.ok(result.items[0].score > result.items[1].score);
  assert.equal(result.items[0].breakdown.textScore, 1.0);
});

test("2. Partial Match: Substring and token matching across key, value, summary", async () => {
  const store = new InMemoryMemoryStore();
  await store.saveRecord(createMockRecord("m1", "喜欢的食物", "非常喜欢吃美味的橡木蛋糕卷", { summary: "甜品偏好" }));
  await store.saveRecord(createMockRecord("m2", "常去的地方", "黄金的时刻"));

  const retriever = new MemoryRetriever(store);
  const result = await retriever.retrieve({ queryText: "蛋糕卷" });

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].record.id, "m1");
  assert.ok(result.items[0].breakdown.textScore > 0);
});

test("3. Scope Isolation: Single scope filtering isolates records strictly", async () => {
  const store = new InMemoryMemoryStore();
  await store.saveRecord(createMockRecord("m_user", "生日", "5月2日", { scope: "user" }));
  await store.saveRecord(createMockRecord("m_char", "生日", "星历不可考", { scope: "character" }));
  await store.saveRecord(createMockRecord("m_sess", "临时状态", "会话进行中", { scope: "session" }));

  const retriever = new MemoryRetriever(store);
  const userResult = await retriever.retrieve({ queryText: "生日", scope: "user" });

  assert.equal(userResult.items.length, 1);
  assert.equal(userResult.items[0].record.id, "m_user");

  const charResult = await retriever.retrieve({ queryText: "生日", scope: "character" });
  assert.equal(charResult.items.length, 1);
  assert.equal(charResult.items[0].record.id, "m_char");
});

test("4. Layer Filtering: Strict single layer boundary filtering", async () => {
  const store = new InMemoryMemoryStore();
  await store.saveRecord(createMockRecord("m_l0", "任务", "查找天气", { layer: "L0_WORKING" }));
  await store.saveRecord(createMockRecord("m_l1", "约定", "明天听歌", { layer: "L1_EPISODIC" }));
  await store.saveRecord(createMockRecord("m_l2", "姓名", "开拓者", { layer: "L2_SEMANTIC" }));

  const retriever = new MemoryRetriever(store);
  const l2Only = await retriever.retrieve({ layer: "L2_SEMANTIC" });
  assert.equal(l2Only.items.length, 1);
  assert.equal(l2Only.items[0].record.id, "m_l2");
});

test("5. Entity Filtering: Explicit entity query targets relevant entity records", async () => {
  const store = new InMemoryMemoryStore();
  await store.saveRecord(createMockRecord("m_ent1", "格拉默战记", "机甲描述", { entities: ["萨姆", "格拉默"] }));
  await store.saveRecord(createMockRecord("m_ent2", "甜品偏好", "喜欢吃甜品", { entities: ["蛋糕卷"] }));

  const retriever = new MemoryRetriever(store);
  const result = await retriever.retrieve({ entities: ["蛋糕卷"] });

  assert.equal(result.items[0].record.id, "m_ent2");
  assert.equal(result.items[0].breakdown.entityScore, 1.0);
});

test("6. Importance Ranking: Higher importance ranks above lower importance with identical query", async () => {
  const store = new InMemoryMemoryStore();
  await store.saveRecord(createMockRecord("m_low", "备注", "随手记事", { importance: 0.2 }));
  await store.saveRecord(createMockRecord("m_high", "核心画像", "重要过敏禁忌", { importance: 0.95 }));

  const retriever = new MemoryRetriever(store);
  const result = await retriever.retrieve({ queryText: "note" });

  assert.equal(result.items[0].record.id, "m_high");
  assert.ok(result.items[0].score > result.items[1].score);
});

test("7. Recency Ranking: Fresh records score higher on recency dimension", async () => {
  const now = 1000000000;
  const store = new InMemoryMemoryStore();
  await store.saveRecord(createMockRecord("m_old", "日记", "上个月的事情", { updatedAt: now - 30 * 86400000 }));
  await store.saveRecord(createMockRecord("m_new", "日记", "刚才的事情", { updatedAt: now - 3600000 }));

  const retriever = new MemoryRetriever(store);
  const result = await retriever.retrieve({ queryText: "日记", currentTime: now });

  assert.equal(result.items[0].record.id, "m_new");
  assert.ok(result.items[0].breakdown.recencyScore > result.items[1].breakdown.recencyScore);
});

test("8. Confidence Ranking: High confidence beats low confidence with equal match", async () => {
  const store = new InMemoryMemoryStore();
  await store.saveRecord(createMockRecord("m_low_conf", "称呼", "好像是开拓者", { confidence: 0.4 }));
  await store.saveRecord(createMockRecord("m_high_conf", "称呼", "确认是开拓者", { confidence: 1.0 }));

  const retriever = new MemoryRetriever(store);
  const result = await retriever.retrieve({ queryText: "称呼" });

  assert.equal(result.items[0].record.id, "m_high_conf");
  assert.ok(result.items[0].score > result.items[1].score);
});

test("9. Combined Ranking: Multi-dimensional score calculation according to weights", () => {
  const ranker = new MemoryRanker(DEFAULT_RETRIEVAL_POLICY);
  const now = 100000000;

  const record = createMockRecord("m1", "用户名字", "开拓者", {
    entities: ["开拓者"],
    importance: 0.9,
    confidence: 1.0,
    updatedAt: now,
  });

  const scored = ranker.scoreRecord(record, { queryText: "开拓者", entities: ["开拓者"], currentTime: now });
  assert.ok(scored.score > 0.85);
  assert.equal(scored.breakdown.entityScore, 1.0);
  assert.equal(scored.breakdown.importanceScore, 0.9);
  assert.equal(scored.breakdown.confidenceScore, 1.0);
});

test("10. Top-K Boundary: Result count strictly respects topK parameter", async () => {
  const store = new InMemoryMemoryStore();
  for (let i = 1; i <= 10; i++) {
    await store.saveRecord(createMockRecord(`m_${i}`, `key_${i}`, `value_${i}`, { importance: i * 0.1 }));
  }

  const retriever = new MemoryRetriever(store);
  const result = await retriever.retrieve({ topK: 3 });

  assert.equal(result.items.length, 3);
  assert.equal(result.totalFound, 10);
  assert.equal(result.items[0].record.id, "m_10");
});

test("11. Deterministic Tie Breaking: Tie breaking by createdAt desc then id asc", async () => {
  const store = new InMemoryMemoryStore();
  await store.saveRecord(createMockRecord("m_b", "同分项", "内容", { importance: 0.5, createdAt: 100 }));
  await store.saveRecord(createMockRecord("m_a", "同分项", "内容", { importance: 0.5, createdAt: 200 }));
  await store.saveRecord(createMockRecord("m_c", "同分项", "内容", { importance: 0.5, createdAt: 200 }));

  const retriever = new MemoryRetriever(store);
  const result = await retriever.retrieve({ queryText: "同分项" });

  assert.equal(result.items[0].record.id, "m_a"); // createdAt 200, id m_a < m_c
  assert.equal(result.items[1].record.id, "m_c"); // createdAt 200, id m_c
  assert.equal(result.items[2].record.id, "m_b"); // createdAt 100
});

test("12. Empty Result: Query returning zero matches or filtering empty store gracefully returns empty list", async () => {
  const store = new InMemoryMemoryStore();
  const retriever = new MemoryRetriever(store);

  const emptyStoreResult = await retriever.retrieve({ queryText: "something" });
  assert.equal(emptyStoreResult.items.length, 0);
  assert.equal(emptyStoreResult.totalFound, 0);

  await store.saveRecord(createMockRecord("m1", "关于天气", "晴朗", { scope: "user" }));
  const unmatchedScopeResult = await retriever.retrieve({ scope: "character" });
  assert.equal(unmatchedScopeResult.items.length, 0);
  assert.equal(unmatchedScopeResult.totalFound, 0);
});

test("13. Store Mutation Safety: Retrieval operations perform ZERO mutations to store records", async () => {
  const store = new InMemoryMemoryStore();
  const initial = createMockRecord("m1", "原始记录", "原始值", { importance: 0.9 });
  await store.saveRecord(initial);

  const retriever = new MemoryRetriever(store);
  await retriever.retrieve({ queryText: "原始" });

  const recordAfter = await store.getRecord("m1");
  assert.deepEqual(recordAfter, initial);
});

test("14. Multiple Scopes: Multi-scope array filter matches records from any specified scope", async () => {
  const store = new InMemoryMemoryStore();
  await store.saveRecord(createMockRecord("m_user", "画像", "A", { scope: "user" }));
  await store.saveRecord(createMockRecord("m_conv", "对话上下文", "B", { scope: "conversation" }));
  await store.saveRecord(createMockRecord("m_global", "系统设定", "C", { scope: "global" }));

  const retriever = new MemoryRetriever(store);
  const multiScope = await retriever.retrieve({ scope: ["user", "conversation"] });

  assert.equal(multiScope.items.length, 2);
  const ids = multiScope.items.map((it) => it.record.id);
  assert.ok(ids.includes("m_user"));
  assert.ok(ids.includes("m_conv"));
  assert.ok(!ids.includes("m_global"));
});

test("15. Multiple Layers: Multi-layer array filter matches records from specified layers", async () => {
  const store = new InMemoryMemoryStore();
  await store.saveRecord(createMockRecord("m_l0", "当前工作", "X", { layer: "L0_WORKING" }));
  await store.saveRecord(createMockRecord("m_l1", "昨天日记", "Y", { layer: "L1_EPISODIC" }));
  await store.saveRecord(createMockRecord("m_l2", "永久事实", "Z", { layer: "L2_SEMANTIC" }));

  const retriever = new MemoryRetriever(store);
  const multiLayer = await retriever.retrieve({ layer: ["L0_WORKING", "L1_EPISODIC"] });

  assert.equal(multiLayer.items.length, 2);
  const ids = multiLayer.items.map((it) => it.record.id);
  assert.ok(ids.includes("m_l0"));
  assert.ok(ids.includes("m_l1"));
  assert.ok(!ids.includes("m_l2"));
});
