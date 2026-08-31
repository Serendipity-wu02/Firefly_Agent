import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { InMemoryMemoryStore, FileMemoryStore } from "../dist/main/main/memory/memory-store.js";

test("1. MemoryRecord CRUD: In-Memory Store create, read, update, delete", async () => {
  const store = new InMemoryMemoryStore();

  const record = {
    id: "mem_1",
    layer: "L2_SEMANTIC",
    category: "profile",
    scope: "user",
    key: "user_name",
    value: "开拓者",
    importance: 0.95,
    confidence: 1.0,
    accessCount: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastAccessedAt: Date.now(),
    source: "user_explicit",
    pinned: true,
  };

  await store.saveRecord(record);
  const fetched = await store.getRecord("mem_1");
  assert.ok(fetched);
  assert.equal(fetched.value, "开拓者");
  assert.equal(fetched.pinned, true);

  // Update
  fetched.value = "星";
  await store.saveRecord(fetched);
  const updated = await store.getRecord("mem_1");
  assert.equal(updated.value, "星");

  // Delete
  const deleted = await store.deleteRecord("mem_1");
  assert.equal(deleted, true);
  const afterDelete = await store.getRecord("mem_1");
  assert.equal(afterDelete, undefined);
});

test("2. EntityNode CRUD: Entities create, read, update, delete, and list", async () => {
  const store = new InMemoryMemoryStore();

  const entity = {
    id: "ent_cake_1",
    name: "橡木蛋糕卷",
    type: "item",
    aliases: ["蛋糕卷", "橡木蛋糕"],
    description: "流萤最喜欢的匹诺康尼甜点",
    importance: 0.85,
    scope: "character",
    updatedAt: Date.now(),
  };

  await store.saveEntity(entity);
  const fetched = await store.getEntity("ent_cake_1");
  assert.ok(fetched);
  assert.equal(fetched.name, "橡木蛋糕卷");
  assert.deepEqual(fetched.aliases, ["蛋糕卷", "橡木蛋糕"]);

  const list = await store.listEntities("character");
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "ent_cake_1");

  await store.deleteEntity("ent_cake_1");
  const afterDelete = await store.getEntity("ent_cake_1");
  assert.equal(afterDelete, undefined);
});

test("3. RelationEdge CRUD: Relation graph triple create, read, and list", async () => {
  const store = new InMemoryMemoryStore();

  const rel = {
    id: "rel_1",
    subject: "firefly",
    predicate: "喜欢",
    object: "橡木蛋糕卷",
    sentiment: "positive",
    confidence: 1.0,
    scope: "user",
    updatedAt: Date.now(),
  };

  await store.saveRelation(rel);
  const fetched = await store.getRelation("rel_1");
  assert.ok(fetched);
  assert.equal(fetched.predicate, "喜欢");

  const list = await store.listRelations("user");
  assert.equal(list.length, 1);
  assert.equal(list[0].object, "橡木蛋糕卷");

  await store.deleteRelation("rel_1");
  assert.equal(await store.getRelation("rel_1"), undefined);
});

test("4. PreferenceItem CRUD: Structured user preference tracking", async () => {
  const store = new InMemoryMemoryStore();

  const pref = {
    id: "pref_1",
    category: "food",
    subject: "辛辣食物",
    polarity: "taboo",
    intensity: 5,
    reason: "用户表示不能吃辣",
    scope: "user",
    updatedAt: Date.now(),
  };

  await store.savePreference(pref);
  const fetched = await store.getPreference("pref_1");
  assert.ok(fetched);
  assert.equal(fetched.polarity, "taboo");
  assert.equal(fetched.intensity, 5);

  const list = await store.listPreferences("user");
  assert.equal(list.length, 1);

  await store.deletePreference("pref_1");
  assert.equal(await store.getPreference("pref_1"), undefined);
});

test("5. Scope & Layer Isolation: Multi-dimensional filtering", async () => {
  const store = new InMemoryMemoryStore();

  await store.saveRecord({
    id: "m_l0_sess",
    layer: "L0_WORKING",
    category: "working_state",
    scope: "session",
    key: "current_task",
    value: "查找天气",
    importance: 0.2,
    confidence: 1.0,
    accessCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastAccessedAt: Date.now(),
    source: "chat_extract",
  });

  await store.saveRecord({
    id: "m_l1_user",
    layer: "L1_EPISODIC",
    category: "event",
    scope: "user",
    key: "meeting_promise",
    value: "约定好明天一起听歌",
    importance: 0.6,
    confidence: 0.9,
    accessCount: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastAccessedAt: Date.now(),
    source: "chat_extract",
  });

  await store.saveRecord({
    id: "m_l2_user",
    layer: "L2_SEMANTIC",
    category: "profile",
    scope: "user",
    key: "user_birthday",
    value: "5月2日",
    importance: 0.95,
    confidence: 1.0,
    accessCount: 5,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastAccessedAt: Date.now(),
    source: "user_explicit",
    pinned: true,
  });

  // Layer filter
  const l0Records = await store.listRecords({ layer: "L0_WORKING" });
  assert.equal(l0Records.length, 1);
  assert.equal(l0Records[0].id, "m_l0_sess");

  const l2Records = await store.listRecords({ layer: "L2_SEMANTIC" });
  assert.equal(l2Records.length, 1);
  assert.equal(l2Records[0].id, "m_l2_user");

  // Scope filter
  const userRecords = await store.listRecords({ scope: "user" });
  assert.equal(userRecords.length, 2);

  // Key filter
  const birthdayRecord = await store.listRecords({ key: "user_birthday" });
  assert.equal(birthdayRecord.length, 1);
  assert.equal(birthdayRecord[0].value, "5月2日");
});

test("6. FileMemoryStore Atomic Persistence: Save, flush, and reload", async () => {
  const tmpDir = path.join(os.tmpdir(), `firefly_mem_test_${Date.now()}`);
  await fs.promises.mkdir(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, "memory_v2.json");

  try {
    const store1 = new FileMemoryStore({ filePath });
    await store1.saveRecord({
      id: "mem_persist_1",
      layer: "L2_SEMANTIC",
      category: "profile",
      scope: "user",
      key: "user_name",
      value: "开拓者",
      importance: 0.95,
      confidence: 1.0,
      accessCount: 1,
      createdAt: 1000,
      updatedAt: 2000,
      lastAccessedAt: 3000,
      source: "user_explicit",
      pinned: true,
    });

    await store1.saveEntity({
      id: "ent_1",
      name: "星穹列车",
      type: "place",
      description: "开拓者所在的列车",
      importance: 0.9,
      scope: "global",
      updatedAt: 2000,
    });

    // File should exist on disk with valid json
    assert.equal(fs.existsSync(filePath), true);
    const raw = await fs.promises.readFile(filePath, "utf-8");
    const json = JSON.parse(raw);
    assert.equal(json.version, 1);
    assert.equal(json.records.length, 1);
    assert.equal(json.entities.length, 1);

    // Create a fresh store instance pointing to same file -> Reload
    const store2 = new FileMemoryStore({ filePath });
    await store2.reload();
    const fetched = await store2.getRecord("mem_persist_1");
    assert.ok(fetched);
    assert.equal(fetched.value, "开拓者");

    const fetchedEnt = await store2.getEntity("ent_1");
    assert.ok(fetchedEnt);
    assert.equal(fetchedEnt.name, "星穹列车");
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});

test("7. FileMemoryStore Malformed JSON Recovery: Corrupt file is backed up and recovered safely", async () => {
  const tmpDir = path.join(os.tmpdir(), `firefly_mem_corrupt_test_${Date.now()}`);
  await fs.promises.mkdir(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, "memory_v2.json");

  try {
    // Write invalid corrupted JSON
    await fs.promises.writeFile(filePath, "{ corrupt json ...!!", "utf-8");

    const store = new FileMemoryStore({ filePath });
    await store.reload();

    // Must not crash, should return empty collection
    const records = await store.listRecords();
    assert.equal(records.length, 0);

    // Corrupted file should have been backed up
    const files = await fs.promises.readdir(tmpDir);
    const backupFile = files.find((f) => f.includes(".corrupt."));
    assert.ok(backupFile, "Must create backup for corrupt file");
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});

test("8. V1 Backwards Compatibility: Read legacy memory.json when V2 does not exist", async () => {
  const tmpDir = path.join(os.tmpdir(), `firefly_mem_v1_compat_${Date.now()}`);
  await fs.promises.mkdir(tmpDir, { recursive: true });
  const v2Path = path.join(tmpDir, "memory_v2.json");
  const v1Path = path.join(tmpDir, "memory.json");

  try {
    // Write legacy V1 memory.json
    const legacyData = [
      { key: "用户名字", value: "开拓者", updatedAt: "2026-08-31T00:00:00.000Z", source: "chat_auto_extract" },
      { key: "用户喜好", value: "橡木蛋糕卷", updatedAt: "2026-08-31T00:00:00.000Z", source: "chat_auto_extract" },
    ];
    await fs.promises.writeFile(v1Path, JSON.stringify(legacyData, null, 2), "utf-8");

    const store = new FileMemoryStore({ filePath: v2Path, legacyV1Path: v1Path });
    await store.reload();

    const records = await store.listRecords();
    assert.equal(records.length, 2);

    const nameRec = records.find((r) => r.key === "用户名字");
    assert.ok(nameRec);
    assert.equal(nameRec.value, "开拓者");
    assert.equal(nameRec.layer, "L2_SEMANTIC");

    const cakeRec = records.find((r) => r.key === "用户喜好");
    assert.ok(cakeRec);
    assert.equal(cakeRec.value, "橡木蛋糕卷");
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
});
