import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { DeterministicEmbeddingProvider, MockEmbeddingProvider } from "../dist/main/rag/embedding-provider.js";
import { InMemoryVectorStore, FileVectorStore } from "../dist/main/rag/vector-store.js";
import { VectorIndexService } from "../dist/main/rag/vector-index-service.js";

const testOutputDir = path.join(process.cwd(), "data", "test_vector_store");
const testVectorFile = path.join(testOutputDir, "test_vector_index.json");

function cleanup() {
  if (fs.existsSync(testOutputDir)) {
    fs.rmSync(testOutputDir, { recursive: true, force: true });
  }
}

test("1. Embedding Provider Contract: Generates unit-normalized vectors with model metadata", async () => {
  const provider = new DeterministicEmbeddingProvider({ dimension: 128 });
  assert.equal(provider.modelInfo.dimension, 128);
  assert.ok(provider.modelInfo.model.length > 0);

  const vec = await provider.embedText("流萤是星核猎手成员");
  assert.equal(vec.length, 128);

  // Validate unit normalization (norm ~= 1.0)
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  assert.ok(Math.abs(norm - 1.0) < 1e-4, `Expected unit norm, got ${norm}`);
});

test("2. Vector Dimension Validation: Vector dimensionality strictly matches modelInfo across batches", async () => {
  const provider = new DeterministicEmbeddingProvider({ dimension: 384 });
  const batch = await provider.embedBatch(["文本A", "文本B", "文本C"]);

  assert.equal(batch.length, 3);
  for (const v of batch) {
    assert.equal(v.length, 384);
  }
});

test("3. Upsert: Successfully writes vector records into store", async () => {
  const store = new InMemoryVectorStore();
  const rec = {
    chunkId: "chunk_001",
    documentId: "doc_001",
    sourceUri: "knowledge/facts.yaml",
    embedding: [0.6, 0.8],
    text: "萨姆是格拉默铁骑装甲",
    canonicalPriority: 0.95,
    modelInfo: { model: "test-model", dimension: 2 },
    createdAt: 1000,
    updatedAt: 1000,
  };

  await store.upsert([rec]);
  assert.equal(await store.count(), 1);
  const fetched = await store.get("chunk_001");
  assert.ok(fetched);
  assert.equal(fetched.text, "萨姆是格拉默铁骑装甲");
});

test("4. Update: Re-upserting record updates existing vector record without creating duplicates", async () => {
  const store = new InMemoryVectorStore();
  const rec1 = {
    chunkId: "chunk_001",
    documentId: "doc_001",
    sourceUri: "knowledge/facts.yaml",
    embedding: [0.6, 0.8],
    text: "旧内容",
    canonicalPriority: 0.95,
    modelInfo: { model: "test-model", dimension: 2 },
    createdAt: 1000,
    updatedAt: 1000,
  };
  await store.upsert([rec1]);

  const rec2 = {
    ...rec1,
    text: "新内容更新",
    embedding: [0.8, 0.6],
  };
  await store.upsert([rec2]);

  assert.equal(await store.count(), 1);
  const fetched = await store.get("chunk_001");
  assert.equal(fetched.text, "新内容更新");
});

test("5. Delete: Removes vector records by chunk ID array", async () => {
  const store = new InMemoryVectorStore();
  await store.upsert([
    { chunkId: "c1", documentId: "d1", sourceUri: "u1", embedding: [1], text: "t1", canonicalPriority: 1, modelInfo: { model: "m", dimension: 1 }, createdAt: 1, updatedAt: 1 },
    { chunkId: "c2", documentId: "d1", sourceUri: "u1", embedding: [1], text: "t2", canonicalPriority: 1, modelInfo: { model: "m", dimension: 1 }, createdAt: 1, updatedAt: 1 },
  ]);

  assert.equal(await store.count(), 2);
  const deleted = await store.delete(["c1"]);
  assert.equal(deleted, 1);
  assert.equal(await store.count(), 1);
  assert.equal(await store.get("c1"), null);
});

test("6. Get: Accurately fetches record by chunk ID", async () => {
  const store = new InMemoryVectorStore();
  await store.upsert([
    { chunkId: "c_target", documentId: "d1", sourceUri: "u1", embedding: [1, 2], text: "目标内容", canonicalPriority: 1, modelInfo: { model: "m", dimension: 2 }, createdAt: 1, updatedAt: 1 },
  ]);

  const item = await store.get("c_target");
  assert.ok(item);
  assert.equal(item.text, "目标内容");
  assert.equal(await store.get("non_existent"), null);
});

test("7. Count: Accurately reflects stored vector total", async () => {
  const store = new InMemoryVectorStore();
  assert.equal(await store.count(), 0);

  await store.upsert([
    { chunkId: "c1", documentId: "d1", sourceUri: "u1", embedding: [1], text: "t1", canonicalPriority: 1, modelInfo: { model: "m", dimension: 1 }, createdAt: 1, updatedAt: 1 },
    { chunkId: "c2", documentId: "d1", sourceUri: "u1", embedding: [1], text: "t2", canonicalPriority: 1, modelInfo: { model: "m", dimension: 1 }, createdAt: 1, updatedAt: 1 },
  ]);
  assert.equal(await store.count(), 2);
});

test("8. Vector Query: Cosine similarity search returns high similarity items first", async () => {
  const store = new InMemoryVectorStore();
  await store.upsert([
    { chunkId: "c_exact", documentId: "d1", sourceUri: "u1", embedding: [1, 0], text: "正向匹配", canonicalPriority: 1, modelInfo: { model: "m", dimension: 2 }, createdAt: 1, updatedAt: 1 },
    { chunkId: "c_ortho", documentId: "d1", sourceUri: "u1", embedding: [0, 1], text: "正交内容", canonicalPriority: 1, modelInfo: { model: "m", dimension: 2 }, createdAt: 1, updatedAt: 1 },
  ]);

  const results = await store.query([1, 0], 2);
  assert.equal(results.length, 2);
  assert.equal(results[0].chunkId, "c_exact");
  assert.ok(results[0].similarity > 0.99);
  assert.ok(results[1].similarity < 0.01);
});

test("9. TopK: Query strictly respects topK parameter", async () => {
  const store = new InMemoryVectorStore();
  const records = Array.from({ length: 10 }, (_, i) => ({
    chunkId: `c_${i}`,
    documentId: "d1",
    sourceUri: "u1",
    embedding: [i + 1, 1],
    text: `内容_${i}`,
    canonicalPriority: 1,
    modelInfo: { model: "m", dimension: 2 },
    createdAt: 1,
    updatedAt: 1,
  }));
  await store.upsert(records);

  const res3 = await store.query([1, 1], 3);
  assert.equal(res3.length, 3);
});

test("10. Deterministic IDs: Deterministic embedding yields identical vectors for same text", async () => {
  const provider = new DeterministicEmbeddingProvider({ dimension: 64 });
  const v1 = await provider.embedText("匹诺康尼流梦礁秘密基地");
  const v2 = await provider.embedText("匹诺康尼流梦礁秘密基地");

  assert.deepEqual(v1, v2);
});

test("11. Duplicate Upsert: Re-indexing identical chunks causes 0 duplicates in store", async () => {
  const store = new InMemoryVectorStore();
  const provider = new DeterministicEmbeddingProvider({ dimension: 32 });
  const indexService = new VectorIndexService(store, provider);

  const mockChunk = {
    id: "chunk_dup_test",
    documentId: "doc_test",
    sourceUri: "test.md",
    chunkIndex: 0,
    chunkType: "atomic_fact",
    text: "流萤喜欢橡木蛋糕卷",
    tokenEstimate: 10,
    entityNames: ["流萤"],
    keywords: ["蛋糕卷"],
    canonicalPriority: 0.9,
    metadata: { perspective: "first_person", sourceFile: "test.md", characters: ["流萤"], verified: true },
  };

  await indexService.indexChunks([mockChunk]);
  assert.equal(await store.count(), 1);

  // Run index again
  const report = await indexService.indexChunks([mockChunk]);
  assert.equal(report.skippedChunks, 1);
  assert.equal(report.indexedChunks, 0);
  assert.equal(await store.count(), 1);
});

test("12. Manifest Incremental Update: Only unindexed chunks are calculated", async () => {
  const store = new InMemoryVectorStore();
  const provider = new DeterministicEmbeddingProvider({ dimension: 32 });
  const indexService = new VectorIndexService(store, provider);

  const chunks = [
    { id: "c1", documentId: "d1", sourceUri: "s1", chunkIndex: 0, chunkType: "atomic_fact", text: "t1", tokenEstimate: 5, entityNames: [], keywords: [], canonicalPriority: 1, metadata: { perspective: "first_person", sourceFile: "s1", characters: [], verified: true } },
    { id: "c2", documentId: "d1", sourceUri: "s1", chunkIndex: 1, chunkType: "atomic_fact", text: "t2", tokenEstimate: 5, entityNames: [], keywords: [], canonicalPriority: 1, metadata: { perspective: "first_person", sourceFile: "s1", characters: [], verified: true } },
  ];

  await indexService.indexChunks([chunks[0]]);
  assert.equal(await store.count(), 1);

  const report = await indexService.indexChunks(chunks);
  assert.equal(report.indexedChunks, 1);
  assert.equal(report.skippedChunks, 1);
  assert.equal(await store.count(), 2);
});

test("13. Source Modification: Force reindex replaces existing vector values", async () => {
  const store = new InMemoryVectorStore();
  const provider = new DeterministicEmbeddingProvider({ dimension: 32 });
  const indexService = new VectorIndexService(store, provider);

  const chunk = { id: "c1", documentId: "d1", sourceUri: "s1", chunkIndex: 0, chunkType: "atomic_fact", text: "原版文本", tokenEstimate: 5, entityNames: [], keywords: [], canonicalPriority: 1, metadata: { perspective: "first_person", sourceFile: "s1", characters: [], verified: true } };
  await indexService.indexChunks([chunk]);

  const chunkMod = { ...chunk, text: "修改后的全新文本" };
  await indexService.indexChunks([chunkMod], { forceReindex: true });

  const fetched = await store.get("c1");
  assert.equal(fetched.text, "修改后的全新文本");
  assert.equal(await store.count(), 1);
});

test("14. Deleted Source Cleanup: syncWithManifest safely removes obsolete vector records", async () => {
  const store = new InMemoryVectorStore();
  const provider = new DeterministicEmbeddingProvider({ dimension: 32 });
  const indexService = new VectorIndexService(store, provider);

  const chunks = [
    { id: "c1", documentId: "d1", sourceUri: "s1", chunkIndex: 0, chunkType: "atomic_fact", text: "t1", tokenEstimate: 5, entityNames: [], keywords: [], canonicalPriority: 1, metadata: { perspective: "first_person", sourceFile: "s1", characters: [], verified: true } },
    { id: "c_obsolete", documentId: "d2", sourceUri: "s_deleted", chunkIndex: 0, chunkType: "atomic_fact", text: "废弃文本", tokenEstimate: 5, entityNames: [], keywords: [], canonicalPriority: 1, metadata: { perspective: "first_person", sourceFile: "s_deleted", characters: [], verified: true } },
  ];
  await indexService.indexChunks(chunks);
  assert.equal(await store.count(), 2);

  // Sync with remaining valid chunks (c1 only)
  const deletedCount = await indexService.syncWithManifest({}, [chunks[0]]);
  assert.equal(deletedCount, 1);
  assert.equal(await store.count(), 1);
  assert.equal(await store.get("c_obsolete"), null);
});

test("15. Persistence Reload: FileVectorStore atomically saves and reloads across restarts", async () => {
  cleanup();
  const fileStore1 = new FileVectorStore({ filePath: testVectorFile });
  await fileStore1.upsert([
    { chunkId: "c_persist", documentId: "d1", sourceUri: "u1", embedding: [0.1, 0.2], text: "持久化内容", canonicalPriority: 0.9, modelInfo: { model: "m", dimension: 2 }, createdAt: 100, updatedAt: 100 },
  ]);

  assert.ok(fs.existsSync(testVectorFile));

  // Reload in fresh instance
  const fileStore2 = new FileVectorStore({ filePath: testVectorFile });
  await fileStore2.reload();

  assert.equal(await fileStore2.count(), 1);
  const fetched = await fileStore2.get("c_persist");
  assert.ok(fetched);
  assert.equal(fetched.text, "持久化内容");
  cleanup();
});

test("16. Malformed Store Recovery: Corrupt JSON file is safely backed up to .bak without crash", async () => {
  cleanup();
  fs.mkdirSync(testOutputDir, { recursive: true });
  fs.writeFileSync(testVectorFile, "{ corrupt json unclosed [", "utf-8");

  const fileStore = new FileVectorStore({ filePath: testVectorFile });
  await fileStore.reload();

  assert.equal(await fileStore.count(), 0);

  // Verify backup file exists
  const bakFiles = fs.readdirSync(testOutputDir).filter((f) => f.includes(".bak"));
  assert.ok(bakFiles.length > 0, "Corrupt file must generate .bak backup");
  cleanup();
});

test("17. Provenance Preservation: VectorRecord retains sourceUri, documentId, text and chunkType", async () => {
  const store = new InMemoryVectorStore();
  const rec = {
    chunkId: "chunk_prov",
    documentId: "doc_prov",
    sourceUri: "resources/knowledge/firefly_lore.md",
    embedding: [0.5],
    text: "流萤的第一人称传记记录",
    canonicalPriority: 0.85,
    chunkType: "heading_section",
    modelInfo: { model: "m", dimension: 1 },
    createdAt: 100,
    updatedAt: 100,
  };
  await store.upsert([rec]);

  const fetched = await store.get("chunk_prov");
  assert.equal(fetched.sourceUri, "resources/knowledge/firefly_lore.md");
  assert.equal(fetched.documentId, "doc_prov");
  assert.equal(fetched.chunkType, "heading_section");
});

test("18. Embedding Metadata Preservation: VectorRecord retains exact model and dimension", async () => {
  const store = new InMemoryVectorStore();
  const rec = {
    chunkId: "c_meta",
    documentId: "d1",
    sourceUri: "u1",
    embedding: [0.1, 0.2, 0.3],
    text: "t",
    canonicalPriority: 1,
    modelInfo: { model: "bge-small-zh-v1.5", dimension: 3, version: "2.0" },
    createdAt: 100,
    updatedAt: 100,
  };
  await store.upsert([rec]);

  const fetched = await store.get("c_meta");
  assert.equal(fetched.modelInfo.model, "bge-small-zh-v1.5");
  assert.equal(fetched.modelInfo.dimension, 3);
  assert.equal(fetched.modelInfo.version, "2.0");
});

test("19. Resources Unchanged: Vector indexing never modifies raw resources/ files", async () => {
  const resourcesRoot = path.join(process.cwd(), "src", "main", "character", "resources");
  const getDirHash = (dir) => {
    const files = fs.readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((f) => f.isFile())
      .map((f) => path.join(f.parentPath || dir, f.name));
    let totalSize = 0;
    for (const f of files) totalSize += fs.statSync(f).size;
    return { count: files.length, totalSize };
  };

  const before = getDirHash(resourcesRoot);

  const store = new InMemoryVectorStore();
  const provider = new DeterministicEmbeddingProvider({ dimension: 32 });
  const indexService = new VectorIndexService(store, provider);
  await indexService.indexChunks([
    { id: "c1", documentId: "d1", sourceUri: "s1", chunkIndex: 0, chunkType: "atomic_fact", text: "t", tokenEstimate: 5, entityNames: [], keywords: [], canonicalPriority: 1, metadata: { perspective: "first_person", sourceFile: "s1", characters: [], verified: true } },
  ]);

  const after = getDirHash(resourcesRoot);
  assert.equal(before.count, 806);
  assert.equal(after.count, 806);
  assert.equal(before.totalSize, after.totalSize);
});

test("20. Memory Store Isolation: Vector operations do not mutate MemoryStore or memory_v2.json", async () => {
  const memoryV2Path = path.join(process.cwd(), "config", "memory_v2.json");
  const memoryV2Content = fs.existsSync(memoryV2Path) ? fs.readFileSync(memoryV2Path, "utf-8") : null;

  const store = new InMemoryVectorStore();
  const provider = new DeterministicEmbeddingProvider({ dimension: 32 });
  const indexService = new VectorIndexService(store, provider);

  await indexService.indexChunks([
    { id: "c1", documentId: "d1", sourceUri: "s1", chunkIndex: 0, chunkType: "atomic_fact", text: "t", tokenEstimate: 5, entityNames: [], keywords: [], canonicalPriority: 1, metadata: { perspective: "first_person", sourceFile: "s1", characters: [], verified: true } },
  ]);

  if (memoryV2Content) {
    assert.equal(fs.readFileSync(memoryV2Path, "utf-8"), memoryV2Content);
  } else {
    assert.equal(fs.existsSync(memoryV2Path), false);
  }
});
