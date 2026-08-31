import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryMemoryStore } from "../dist/main/main/memory/memory-store.js";
import { MemoryDecayEngine } from "../dist/main/main/memory/memory-decay-engine.js";
import { MemoryConflictResolver } from "../dist/main/main/memory/memory-conflict-resolver.js";
import { MemoryConsolidator } from "../dist/main/main/memory/memory-consolidator.js";
import { MemoryMaintenanceService } from "../dist/main/main/memory/memory-maintenance-service.js";
import { MemoryRetriever } from "../dist/main/main/memory/memory-retriever.js";
import { MemoryRanker } from "../dist/main/main/memory/memory-ranker.js";
import { DEFAULT_RETRIEVAL_POLICY } from "../dist/main/main/memory/retrieval-types.js";
import { MemoryWriteService } from "../dist/main/main/memory/memory-write-service.js";

test("1. Basic Decay: Unpinned L1 memory strength decays exponentially over elapsed time", () => {
  const decayEngine = new MemoryDecayEngine({ halfLifeDays: 7 });
  const now = 1000000000000;
  const record = {
    id: "mem_1",
    layer: "L1_EPISODIC",
    category: "event",
    scope: "user",
    key: "约定",
    value: "一起喝咖啡",
    importance: 0.8,
    accessCount: 0,
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
  };

  const initialStrength = decayEngine.calculateStrength(record, now);
  assert.equal(initialStrength, 0.8);

  // After 7 days (1 half-life), strength should be 0.8 * 0.5 = 0.4
  const sevenDaysLater = now + 7 * 24 * 60 * 60 * 1000;
  const strength7d = decayEngine.calculateStrength(record, sevenDaysLater);
  assert.equal(strength7d, 0.4);

  // After 14 days (2 half-lives), strength should be 0.8 * 0.25 = 0.2
  const fourteenDaysLater = now + 14 * 24 * 60 * 60 * 1000;
  const strength14d = decayEngine.calculateStrength(record, fourteenDaysLater);
  assert.equal(strength14d, 0.2);
});

test("2. Pinned / L2 Decay Immunity: Pinned and L2 semantic records are 100% immune to decay", () => {
  const decayEngine = new MemoryDecayEngine({ halfLifeDays: 7 });
  const now = 1000000000000;
  const pinnedRecord = {
    id: "mem_pinned",
    layer: "L1_EPISODIC",
    category: "event",
    scope: "user",
    key: "重要誓约",
    value: "无论何时都会在",
    importance: 0.95,
    pinned: true,
    accessCount: 0,
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
  };

  const l2Record = {
    id: "mem_l2",
    layer: "L2_SEMANTIC",
    category: "profile",
    scope: "user",
    key: "姓名",
    value: "开拓者",
    importance: 1.0,
    accessCount: 0,
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
  };

  const oneYearLater = now + 365 * 24 * 60 * 60 * 1000;
  assert.equal(decayEngine.calculateStrength(pinnedRecord, oneYearLater), 0.95);
  assert.equal(decayEngine.calculateStrength(l2Record, oneYearLater), 1.0);
  assert.equal(decayEngine.isPrunable(pinnedRecord, oneYearLater), false);
  assert.equal(decayEngine.isPrunable(l2Record, oneYearLater), false);
});

test("3. Expiration vs Decay: Explicit TTL expiration triggers pruning cleanly", () => {
  const decayEngine = new MemoryDecayEngine();
  const now = 1000000000000;
  const ephemeralRecord = {
    id: "mem_temp",
    layer: "L0_WORKING",
    category: "working_state",
    scope: "session",
    key: "瞬态",
    value: "正在写周报",
    importance: 0.4,
    accessCount: 0,
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
    expiresAt: now + 3600000, // 1 hour TTL
  };

  assert.equal(decayEngine.isExpired(ephemeralRecord, now + 1800000), false);
  assert.equal(decayEngine.isExpired(ephemeralRecord, now + 3600001), true);
  assert.equal(decayEngine.isPrunable(ephemeralRecord, now + 3600001), true);
});

test("4. Decay Read-Only Safety: Retrieval operations NEVER mutate store", async () => {
  const store = new InMemoryMemoryStore();
  const ranker = new MemoryRanker(DEFAULT_RETRIEVAL_POLICY);
  const retriever = new MemoryRetriever(store, ranker);

  const now = 1000000000000;
  await store.saveRecord({
    id: "mem_read_only",
    layer: "L1_EPISODIC",
    category: "preference",
    scope: "user",
    key: "甜品",
    value: "橡木蛋糕卷",
    importance: 0.8,
    accessCount: 0,
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
  });

  const thirtyDaysLater = now + 30 * 24 * 60 * 60 * 1000;
  const results = await retriever.retrieve({ queryText: "甜品", currentTime: thirtyDaysLater });
  assert.equal(results.items.length, 1);

  const rawInStore = await store.getRecord("mem_read_only");
  assert.equal(rawInStore.importance, 0.8, "Raw store importance must NOT be altered by retrieve");
  assert.equal(rawInStore.lastAccessedAt, now, "Raw store timestamps must NOT be altered during read-only retrieve");
});

test("5. Explicit Correction Resolution: Explicit correction supersedes older statements", () => {
  const resolver = new MemoryConflictResolver();
  const now = 1000000000000;

  const oldFact = {
    id: "mem_old",
    layer: "L2_SEMANTIC",
    category: "profile",
    scope: "user",
    key: "住址",
    value: "现实酒店",
    importance: 0.9,
    confidence: 0.9,
    source: "chat_extract",
    createdAt: now,
    updatedAt: now,
    accessCount: 1,
    lastAccessedAt: now,
  };

  const newCorrection = {
    id: "mem_new",
    layer: "L2_SEMANTIC",
    category: "profile",
    scope: "user",
    key: "住址",
    value: "流梦礁",
    importance: 0.95,
    confidence: 1.0,
    source: "user_explicit",
    createdAt: now + 5000,
    updatedAt: now + 5000,
    accessCount: 0,
    lastAccessedAt: now + 5000,
  };

  const result = resolver.resolveRecordConflict([oldFact, newCorrection]);
  assert.equal(result.activeRecord.id, "mem_new");
  assert.equal(result.activeRecord.value, "流梦礁");
  assert.equal(result.supersededRecords.length, 1);
  assert.equal(result.activeRecord.metadata.history[0].value, "现实酒店");
});

test("6. Conflicting Preference Resolution: Resolves polarity update by recency", () => {
  const resolver = new MemoryConflictResolver();
  const now = 1000000000000;

  const prefA = {
    id: "pref_1",
    category: "music",
    subject: "摇滚乐",
    polarity: "like",
    intensity: 4,
    scope: "user",
    updatedAt: now,
  };

  const prefB = {
    id: "pref_2",
    category: "music",
    subject: "摇滚乐",
    polarity: "dislike",
    intensity: 5,
    scope: "user",
    updatedAt: now + 10000,
  };

  const activePref = resolver.resolvePreferenceConflict([prefA, prefB]);
  assert.equal(activePref.id, "pref_2");
  assert.equal(activePref.polarity, "dislike");
});

test("7. Conflicting Relation Resolution: Resolves contradictory relation edge by confidence & recency", () => {
  const resolver = new MemoryConflictResolver();
  const now = 1000000000000;

  const rel1 = {
    id: "rel_1",
    subject: "user",
    predicate: "信赖",
    object: "星期日",
    confidence: 0.6,
    scope: "user",
    updatedAt: now,
  };

  const rel2 = {
    id: "rel_2",
    subject: "user",
    predicate: "信赖",
    object: "星期日",
    confidence: 0.95,
    scope: "user",
    updatedAt: now + 2000,
  };

  const activeRel = resolver.resolveRelationConflict([rel1, rel2]);
  assert.equal(activeRel.id, "rel_2");
  assert.equal(activeRel.confidence, 0.95);
});

test("8. Recency Conflict Arbitration: Identical confidence and importance resolved by newer timestamp", () => {
  const resolver = new MemoryConflictResolver();
  const r1 = {
    id: "mem_a",
    layer: "L1_EPISODIC",
    category: "preference",
    scope: "user",
    key: "主题色",
    value: "蓝色",
    importance: 0.8,
    confidence: 0.9,
    source: "user_explicit",
    updatedAt: 1000,
    createdAt: 1000,
    accessCount: 0,
    lastAccessedAt: 1000,
  };
  const r2 = {
    id: "mem_b",
    layer: "L1_EPISODIC",
    category: "preference",
    scope: "user",
    key: "主题色",
    value: "淡绿色",
    importance: 0.8,
    confidence: 0.9,
    source: "user_explicit",
    updatedAt: 2000,
    createdAt: 2000,
    accessCount: 0,
    lastAccessedAt: 2000,
  };

  const result = resolver.resolveRecordConflict([r1, r2]);
  assert.equal(result.activeRecord.id, "mem_b");
  assert.equal(result.activeRecord.value, "淡绿色");
});

test("9. Confidence Conflict Arbitration: Higher confidence beats lower confidence", () => {
  const resolver = new MemoryConflictResolver();
  const rLowConf = {
    id: "mem_low",
    layer: "L1_EPISODIC",
    category: "profile",
    scope: "user",
    key: "职业",
    value: "学生",
    importance: 0.8,
    confidence: 0.4,
    source: "chat_extract",
    updatedAt: 2000,
    createdAt: 2000,
    accessCount: 0,
    lastAccessedAt: 2000,
  };
  const rHighConf = {
    id: "mem_high",
    layer: "L1_EPISODIC",
    category: "profile",
    scope: "user",
    key: "职业",
    value: "工程师",
    importance: 0.8,
    confidence: 0.95,
    source: "chat_extract",
    updatedAt: 1000,
    createdAt: 1000,
    accessCount: 0,
    lastAccessedAt: 1000,
  };

  const result = resolver.resolveRecordConflict([rLowConf, rHighConf]);
  assert.equal(result.activeRecord.id, "mem_high");
  assert.equal(result.activeRecord.value, "工程师");
});

test("10. Superseded Memory: Superseded records are tagged in return structure", () => {
  const resolver = new MemoryConflictResolver();
  const r1 = { id: "1", layer: "L1_EPISODIC", category: "event", scope: "user", key: "k", value: "v1", updatedAt: 10, createdAt: 10, accessCount: 0, lastAccessedAt: 10, importance: 0.5, confidence: 1 };
  const r2 = { id: "2", layer: "L1_EPISODIC", category: "event", scope: "user", key: "k", value: "v2", updatedAt: 20, createdAt: 20, accessCount: 0, lastAccessedAt: 20, importance: 0.5, confidence: 1 };

  const res = resolver.resolveRecordConflict([r1, r2]);
  assert.equal(res.activeRecord.id, "2");
  assert.equal(res.supersededRecords.length, 1);
  assert.equal(res.supersededRecords[0].id, "1");
});

test("11. Consolidation & Promotion: L1 promoted to L2 when access frequency >= 3", () => {
  const consolidator = new MemoryConsolidator({ promotionAccessThreshold: 3 });
  const episodic = {
    id: "mem_epi",
    layer: "L1_EPISODIC",
    category: "preference",
    scope: "user",
    key: "爱听音乐",
    value: "使一颗心免于哀伤",
    importance: 0.8,
    accessCount: 3,
    createdAt: 1000,
    updatedAt: 2000,
    lastAccessedAt: 2000,
    expiresAt: 5000000,
  };

  const evalResult = consolidator.evaluatePromotion(episodic);
  assert.equal(evalResult.shouldPromote, true);
  assert.equal(evalResult.promotedRecord.layer, "L2_SEMANTIC");
  assert.equal(evalResult.promotedRecord.expiresAt, undefined);
  assert.equal(evalResult.promotedRecord.metadata.promotionReason, "access_frequency_reinforced");
});

test("12. Duplicate Consolidation: Consolidates multiple related records into unified record", () => {
  const consolidator = new MemoryConsolidator();
  const records = [
    { id: "1", layer: "L1_EPISODIC", category: "preference", scope: "user", key: "爵士乐", value: "常听爵士乐", importance: 0.7, accessCount: 2, entities: ["爵士"], updatedAt: 100, createdAt: 100, lastAccessedAt: 100 },
    { id: "2", layer: "L1_EPISODIC", category: "preference", scope: "user", key: "爵士乐", value: "喜欢轻爵士与萨克斯", importance: 0.85, accessCount: 3, entities: ["萨克斯"], updatedAt: 200, createdAt: 200, lastAccessedAt: 200 },
  ];

  const consolidated = consolidator.consolidateRelatedRecords(records);
  assert.equal(consolidated.layer, "L2_SEMANTIC");
  assert.equal(consolidated.accessCount, 5);
  assert.equal(consolidated.importance, 0.85);
  assert.ok(consolidated.entities.includes("爵士"));
  assert.ok(consolidated.entities.includes("萨克斯"));
  assert.equal(consolidated.metadata.history.length, 1);
});

test("13. History Preservation: Preserves entire historical audit chain across multiple updates", async () => {
  const store = new InMemoryMemoryStore();
  const writeService = new MemoryWriteService(store);

  await writeService.write({ key: "代号", value: "无名客", category: "profile", source: "user_explicit" });
  await writeService.write({ key: "代号", value: "银河球棒侠", category: "profile", source: "user_explicit", isCorrection: true });
  await writeService.write({ key: "代号", value: "开拓者", category: "profile", source: "user_explicit", isCorrection: true });

  const records = await store.listRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0].value, "开拓者");
  assert.equal(records[0].metadata.history.length, 2);
  assert.equal(records[0].metadata.history[0].value, "无名客");
  assert.equal(records[0].metadata.history[1].value, "银河球棒侠");
});

test("14. Maintenance Idempotency: Multiple maintenance runs yield stable final state", async () => {
  const store = new InMemoryMemoryStore();
  const maintenance = new MemoryMaintenanceService(store);

  await store.saveRecord({
    id: "mem_stable",
    layer: "L2_SEMANTIC",
    category: "profile",
    scope: "user",
    key: "名字",
    value: "开拓者",
    importance: 0.95,
    accessCount: 1,
    createdAt: 1000,
    updatedAt: 1000,
    lastAccessedAt: 1000,
  });

  const rep1 = await maintenance.runMaintenance(2000);
  const rep2 = await maintenance.runMaintenance(2000);

  assert.equal(rep1.totalActiveRecords, 1);
  assert.equal(rep2.totalActiveRecords, 1);
  assert.equal(rep2.expiredPrunedCount, 0);
  assert.equal(rep2.conflictsResolvedCount, 0);
});

test("15. Concurrent Read / Write Safety: Reads and writes do not corrupt storage state", async () => {
  const store = new InMemoryMemoryStore();
  const writeService = new MemoryWriteService(store);
  const ranker = new MemoryRanker(DEFAULT_RETRIEVAL_POLICY);
  const retriever = new MemoryRetriever(store, ranker);
  const maintenance = new MemoryMaintenanceService(store);

  // Interleaved concurrent operations
  await Promise.all([
    writeService.write({ key: "喜好1", value: "蛋糕", category: "preference" }),
    writeService.write({ key: "喜好2", value: "红茶", category: "preference" }),
    retriever.retrieve({ queryText: "蛋糕" }),
    maintenance.runMaintenance(),
    writeService.write({ key: "喜好3", value: "星空", category: "preference" }),
    retriever.retrieve({ queryText: "星空" }),
  ]);

  const all = await store.listRecords();
  assert.equal(all.length, 3);
});

test("16. Malformed Memory Safety: Degraded records with missing fields are handled safely", () => {
  const decayEngine = new MemoryDecayEngine();
  const malformed = { id: "broken" };

  const strength = decayEngine.calculateStrength(malformed, 2000);
  assert.ok(strength >= 0 && strength <= 1.0);
  assert.equal(decayEngine.isExpired(malformed, 2000), false);
});

test("17. Deterministic Conflict Resolution: Strict order yields identical resolution regardless of input permutation", () => {
  const resolver = new MemoryConflictResolver();
  const r1 = { id: "1", layer: "L1_EPISODIC", category: "profile", scope: "user", key: "k", value: "v1", updatedAt: 100, createdAt: 100, accessCount: 0, lastAccessedAt: 100, importance: 0.5, confidence: 1 };
  const r2 = { id: "2", layer: "L1_EPISODIC", category: "profile", scope: "user", key: "k", value: "v2", updatedAt: 200, createdAt: 200, accessCount: 0, lastAccessedAt: 200, importance: 0.5, confidence: 1 };

  const resForward = resolver.resolveRecordConflict([r1, r2]);
  const resBackward = resolver.resolveRecordConflict([r2, r1]);

  assert.equal(resForward.activeRecord.id, resBackward.activeRecord.id);
  assert.equal(resForward.activeRecord.value, "v2");
});

test("18. Decay + Retrieval Interaction: Decayed memories receive lower recency scores naturally", async () => {
  const store = new InMemoryMemoryStore();
  const ranker = new MemoryRanker(DEFAULT_RETRIEVAL_POLICY);
  const retriever = new MemoryRetriever(store, ranker);

  const now = 1000000000000;
  // Recent memory
  await store.saveRecord({
    id: "mem_recent",
    layer: "L1_EPISODIC",
    category: "event",
    scope: "user",
    key: "旅行笔记",
    value: "今天在黄金时刻漫步",
    importance: 0.8,
    accessCount: 0,
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
  });

  // Old memory (30 days ago)
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  await store.saveRecord({
    id: "mem_old",
    layer: "L1_EPISODIC",
    category: "event",
    scope: "user",
    key: "旅行笔记",
    value: "上个月在空间站漫步",
    importance: 0.8,
    accessCount: 0,
    createdAt: thirtyDaysAgo,
    updatedAt: thirtyDaysAgo,
    lastAccessedAt: thirtyDaysAgo,
  });

  const results = await retriever.retrieve({ queryText: "旅行笔记", currentTime: now });
  assert.equal(results.items.length, 2);
  assert.equal(results.items[0].record.id, "mem_recent", "Recent memory must rank above decayed 30-day memory");
  assert.ok(results.items[0].score > results.items[1].score);
});
