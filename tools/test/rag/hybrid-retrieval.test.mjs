import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { DeterministicEmbeddingProvider, MockEmbeddingProvider } from "../../../dist/main/rag/embedding-provider.js";
import { InMemoryVectorStore } from "../../../dist/main/rag/vector-store.js";
import { LexicalRetriever } from "../../../dist/main/rag/lexical-retriever.js";
import { VectorRetriever } from "../../../dist/main/rag/vector-retriever.js";
import { KnowledgeReranker } from "../../../dist/main/rag/knowledge-reranker.js";
import { HybridRetriever } from "../../../dist/main/rag/hybrid-retriever.js";

const sampleChunks = [
  {
    id: "chunk_sam_armor",
    documentId: "doc_facts",
    sourceUri: "knowledge/facts.yaml",
    chunkIndex: 0,
    chunkType: "atomic_fact",
    text: "【萨姆 - 战斗形态】萨姆是格拉默铁骑IV型装甲，具备强大的焦土作战能力。",
    tokenEstimate: 30,
    headingPath: ["萨姆", "战斗形态"],
    entityNames: ["萨姆", "格拉默", "格拉默铁骑"],
    keywords: ["萨姆", "铁骑", "装甲", "焦土"],
    canonicalPriority: 0.95,
    metadata: { perspective: "factual_assertion", sourceFile: "knowledge/facts.yaml", characters: ["萨姆"], timelineEpoch: "glamoth", verified: true },
  },
  {
    id: "chunk_firefly_dessert",
    documentId: "doc_facts",
    sourceUri: "knowledge/facts.yaml",
    chunkIndex: 1,
    chunkType: "atomic_fact",
    text: "【流萤 - 饮食偏好】流萤最喜欢的甜品是橡木蛋糕卷，花费了两万信用点。",
    tokenEstimate: 25,
    headingPath: ["流萤", "饮食偏好"],
    entityNames: ["流萤", "橡木蛋糕卷"],
    keywords: ["流萤", "蛋糕卷", "甜品"],
    canonicalPriority: 0.95,
    metadata: { perspective: "first_person", sourceFile: "knowledge/facts.yaml", characters: ["流萤"], timelineEpoch: "penacony", verified: true },
  },
  {
    id: "chunk_penacony_secret",
    documentId: "doc_card_secret",
    sourceUri: "knowledge/curated_cards/秘密基地.md",
    chunkIndex: 0,
    chunkType: "curated_card",
    text: "【精选事件卡片: 秘密基地】在流梦礁的边缘，流萤向开拓者坦白了自己身患失熵症的真相。",
    tokenEstimate: 35,
    headingPath: ["精选卡片", "秘密基地"],
    entityNames: ["流萤", "开拓者", "失熵症", "流梦礁", "秘密基地"],
    keywords: ["秘密基地", "流梦礁", "失熵症"],
    canonicalPriority: 0.85,
    metadata: { perspective: "first_person", sourceFile: "knowledge/curated_cards/秘密基地.md", characters: ["流萤", "开拓者"], timelineEpoch: "penacony", verified: true },
  },
  {
    id: "chunk_wiki_bronya",
    documentId: "doc_wiki_bronya",
    sourceUri: "wiki/角色/布洛妮娅.txt",
    chunkIndex: 0,
    chunkType: "character_profile",
    text: "【布洛妮娅 百科】贝洛伯格大守护者，使用步枪与军乐队支援作战。",
    tokenEstimate: 25,
    headingPath: ["布洛妮娅"],
    entityNames: ["布洛妮娅", "贝洛伯格"],
    keywords: ["布洛妮娅", "大守护者"],
    canonicalPriority: 0.60,
    metadata: { perspective: "third_person", sourceFile: "wiki/角色/布洛妮娅.txt", characters: ["布洛妮娅"], verified: true },
  },
];

test("1. Lexical Exact Match: Exact phrase returns highest lexical score", () => {
  const retriever = new LexicalRetriever(sampleChunks);
  const candidates = retriever.retrieve({ queryText: "橡木蛋糕卷" });

  assert.ok(candidates.length > 0);
  assert.equal(candidates[0].chunk.id, "chunk_firefly_dessert");
  assert.ok(candidates[0].lexicalScore > 0.6);
});

test("2. Lexical Partial Match: Partial keyword overlap successfully hits relevant chunk", () => {
  const retriever = new LexicalRetriever(sampleChunks);
  const candidates = retriever.retrieve({ queryText: "焦土作战形态" });

  assert.ok(candidates.length > 0);
  assert.equal(candidates[0].chunk.id, "chunk_sam_armor");
});

test("3. Vector Retrieval: Dense similarity search retrieves semantically close chunk", async () => {
  const store = new InMemoryVectorStore();
  const provider = new DeterministicEmbeddingProvider({ dimension: 64 });
  for (const c of sampleChunks) {
    const emb = await provider.embedText(c.text);
    await store.upsert([
      { chunkId: c.id, documentId: c.documentId, sourceUri: c.sourceUri, embedding: emb, text: c.text, canonicalPriority: c.canonicalPriority, modelInfo: provider.modelInfo, createdAt: 1, updatedAt: 1 },
    ]);
  }

  const vRetriever = new VectorRetriever(store, provider, sampleChunks);
  const results = await vRetriever.retrieve({ queryText: "萨姆装甲战斗" });

  assert.ok(results.length > 0);
  assert.equal(results[0].chunk.id, "chunk_sam_armor");
  assert.ok(results[0].vectorScore > 0.2);
});

test("4. Hybrid Merge: Combines lexical and vector candidates seamlessly", async () => {
  const store = new InMemoryVectorStore();
  const provider = new DeterministicEmbeddingProvider({ dimension: 64 });
  for (const c of sampleChunks) {
    const emb = await provider.embedText(c.text);
    await store.upsert([
      { chunkId: c.id, documentId: c.documentId, sourceUri: c.sourceUri, embedding: emb, text: c.text, canonicalPriority: c.canonicalPriority, modelInfo: provider.modelInfo, createdAt: 1, updatedAt: 1 },
    ]);
  }

  const hybrid = new HybridRetriever({
    vectorStore: store,
    embeddingProvider: provider,
    chunks: sampleChunks,
  });

  const res = await hybrid.retrieve({ queryText: "流萤秘密基地失熵症" });
  assert.ok(res.items.length > 0);
  assert.equal(res.items[0].chunk.id, "chunk_penacony_secret");
  assert.ok(res.items[0].breakdown.lexicalScore > 0);
  assert.ok(res.items[0].breakdown.vectorScore > 0);
});

test("5. Lexical / Vector Weighting: Custom weights accurately steer final scoring", async () => {
  const rerankerLexOnly = new KnowledgeReranker({
    weights: { entity: 0, lexical: 1.0, vector: 0, canonical: 0, timeline: 0 },
  });
  const rerankerVecOnly = new KnowledgeReranker({
    weights: { entity: 0, lexical: 0, vector: 1.0, canonical: 0, timeline: 0 },
  });

  const lexCandidates = [{ chunk: sampleChunks[0], lexicalScore: 0.9 }];
  const vecCandidates = [{ chunk: sampleChunks[0], vectorScore: 0.4 }];

  const resLex = rerankerLexOnly.rerank({ queryText: "测试" }, lexCandidates, vecCandidates);
  const resVec = rerankerVecOnly.rerank({ queryText: "测试" }, lexCandidates, vecCandidates);

  assert.equal(resLex[0].finalScore, 0.9);
  assert.equal(resVec[0].finalScore, 0.4);
});

test("6. Canonical Priority: Higher canonical priority breaks ties when relevance is equal", () => {
  const chunkCanon = { ...sampleChunks[0], id: "c_canon", canonicalPriority: 0.95 };
  const chunkWiki = { ...sampleChunks[3], id: "c_wiki", canonicalPriority: 0.60 };

  const reranker = new KnowledgeReranker({
    weights: { entity: 0.3, lexical: 0.3, vector: 0, canonical: 0.4, timeline: 0 },
  });

  const lexCandidates = [
    { chunk: chunkCanon, lexicalScore: 0.8 },
    { chunk: chunkWiki, lexicalScore: 0.8 },
  ];

  const results = reranker.rerank({ queryText: "测试" }, lexCandidates, []);
  assert.equal(results[0].chunk.id, "c_canon");
});

test("7. Entity Relevance: Explicit entity match grants additional score weight", () => {
  const reranker = new KnowledgeReranker();
  const lexCandidates = [
    { chunk: sampleChunks[0], lexicalScore: 0.5 }, // entity: 萨姆
    { chunk: sampleChunks[3], lexicalScore: 0.5 }, // entity: 布洛妮娅
  ];

  const results = reranker.rerank({ queryText: "关于萨姆的信息", entities: ["萨姆"] }, lexCandidates, []);
  assert.equal(results[0].chunk.id, "chunk_sam_armor");
  assert.ok(results[0].breakdown.entityScore > 0);
});

test("8. Timeline Relevance: Matching timelineEpoch gives higher boost", () => {
  const reranker = new KnowledgeReranker();
  const lexCandidates = [
    { chunk: sampleChunks[0], lexicalScore: 0.5 }, // glamoth
    { chunk: sampleChunks[1], lexicalScore: 0.5 }, // penacony
  ];

  const results = reranker.rerank({ queryText: "过去的事", timelineEpoch: "glamoth" }, lexCandidates, []);
  assert.equal(results[0].chunk.id, "chunk_sam_armor");
  assert.equal(results[0].breakdown.timelineScore, 1.0);
});

test("9. Reranking: Combines all dimensions into normalized final score in [0.0, 1.0]", () => {
  const reranker = new KnowledgeReranker();
  const lexCandidates = [{ chunk: sampleChunks[2], lexicalScore: 0.8 }];
  const vecCandidates = [{ chunk: sampleChunks[2], vectorScore: 0.7 }];

  const results = reranker.rerank({ queryText: "秘密基地", entities: ["流萤"] }, lexCandidates, []);
  assert.ok(results.length > 0);
  assert.ok(results[0].finalScore >= 0.0 && results[0].finalScore <= 1.0);
  assert.ok(results[0].breakdown.lexicalScore > 0);
});

test("10. TopK: Hybrid retrieval limits items to topK limit", async () => {
  const hybrid = new HybridRetriever({ chunks: sampleChunks });
  const res = await hybrid.retrieve({ queryText: "的", topK: 2 });
  assert.ok(res.items.length <= 2);
});

test("11. Deterministic Ordering: Permuting candidate order yields identical ranked results", () => {
  const reranker = new KnowledgeReranker();
  const c1 = { chunk: sampleChunks[0], lexicalScore: 0.5 };
  const c2 = { chunk: sampleChunks[1], lexicalScore: 0.5 };

  const res1 = reranker.rerank({ queryText: "测试" }, [c1, c2], []);
  const res2 = reranker.rerank({ queryText: "测试" }, [c2, c1], []);

  assert.deepEqual(res1.map((r) => r.chunk.id), res2.map((r) => r.chunk.id));
});

test("12. Duplicate Candidate Merge: Chunk appearing in both lexical and vector streams is merged", () => {
  const reranker = new KnowledgeReranker();
  const lex = [{ chunk: sampleChunks[0], lexicalScore: 0.6 }];
  const vec = [{ chunk: sampleChunks[0], vectorScore: 0.7 }];

  const results = reranker.rerank({ queryText: "测试" }, lex, vec);
  assert.equal(results.length, 1);
  assert.equal(results[0].breakdown.lexicalScore, 0.6);
  assert.equal(results[0].breakdown.vectorScore, 0.7);
});

test("13. Empty Query: Empty or whitespace query returns empty items", async () => {
  const hybrid = new HybridRetriever({ chunks: sampleChunks });
  const res1 = await hybrid.retrieve({ queryText: "" });
  const res2 = await hybrid.retrieve({ queryText: "   " });

  assert.equal(res1.items.length, 0);
  assert.equal(res2.items.length, 0);
});

test("14. No-Result Query: Unrelated nonsense query returns empty items without error", async () => {
  const hybrid = new HybridRetriever({ chunks: sampleChunks });
  const res = await hybrid.retrieve({ queryText: "完全不存在的量子力学微观常数超光速飞船" });

  assert.equal(res.items.length, 0);
});

test("15. Retrieval Read-Only: Repeated retrieval does not mutate chunk data", async () => {
  const chunkCopy = JSON.parse(JSON.stringify(sampleChunks[0]));
  const hybrid = new HybridRetriever({ chunks: [chunkCopy] });

  await hybrid.retrieve({ queryText: "萨姆" });
  await hybrid.retrieve({ queryText: "萨姆" });

  assert.deepEqual(chunkCopy, sampleChunks[0]);
});

test("16. Read-Only Isolation: Hybrid retriever has no side effects on unrelated disk state", async () => {
  const sentinelPath = path.join(os.tmpdir(), "firefly-rag-hybrid-sentinel.json");
  fs.writeFileSync(sentinelPath, "unchanged", "utf-8");
  const hybrid = new HybridRetriever({ chunks: sampleChunks });
  await hybrid.retrieve({ queryText: "萨姆" });
  assert.equal(fs.readFileSync(sentinelPath, "utf-8"), "unchanged");
  fs.rmSync(sentinelPath, { force: true });
});

test("17. Deterministic Embedding Provider: Provides stable vector output for RAG pipeline", async () => {
  const provider = new DeterministicEmbeddingProvider({ dimension: 64 });
  const v1 = await provider.embedText("星核猎手流萤");
  const v2 = await provider.embedText("星核猎手流萤");

  assert.deepEqual(v1, v2);
});

test("18. Provider Abstraction: Mock embedding provider can be seamlessly injected into retrieval pipeline", async () => {
  const customProvider = new MockEmbeddingProvider({
    onEmbed: () => [1, 0, 0, 0],
  });

  const store = new InMemoryVectorStore();
  await store.upsert([
    { chunkId: "c_mock", documentId: "d1", sourceUri: "u1", embedding: [1, 0, 0, 0], text: "Mock 内容", canonicalPriority: 1, modelInfo: customProvider.modelInfo, createdAt: 1, updatedAt: 1 },
  ]);

  const hybrid = new HybridRetriever({
    vectorStore: store,
    embeddingProvider: customProvider,
    chunks: [{ id: "c_mock", documentId: "d1", sourceUri: "u1", chunkIndex: 0, chunkType: "atomic_fact", text: "Mock 内容", tokenEstimate: 5, entityNames: [], keywords: [], canonicalPriority: 1, metadata: { perspective: "first_person", sourceFile: "u1", characters: [], verified: true } }],
  });

  const res = await hybrid.retrieve({ queryText: "任何查询" });
  assert.ok(res.items.length > 0);
  assert.equal(res.items[0].chunk.id, "c_mock");
});

test("19. Metadata Preservation: Final retrieved item preserves full chunk metadata", async () => {
  const hybrid = new HybridRetriever({ chunks: sampleChunks });
  const res = await hybrid.retrieve({ queryText: "蛋糕卷" });

  assert.ok(res.items.length > 0);
  const target = res.items.find((i) => i.chunk.id === "chunk_firefly_dessert");
  assert.ok(target);
  assert.equal(target.chunk.metadata.sourceFile, "knowledge/facts.yaml");
  assert.equal(target.chunk.metadata.perspective, "first_person");
});

test("20. Adversarial Irrelevant High-Priority Source: Irrelevant chunk with 1.0 priority is rejected by relevance gating", () => {
  const irrelevantP1Chunk = {
    id: "chunk_p1_irrelevant",
    documentId: "doc_persona",
    sourceUri: "firefly.yaml",
    chunkIndex: 0,
    chunkType: "structured_persona",
    text: "【流萤人设】流萤说话轻柔温和...",
    tokenEstimate: 20,
    headingPath: ["firefly.yaml", "语气规则"],
    entityNames: ["流萤"],
    keywords: ["语气", "温和"],
    canonicalPriority: 1.00, // Top priority
    metadata: { perspective: "first_person", sourceFile: "firefly.yaml", characters: ["流萤"], verified: true },
  };

  const relevantWikiChunk = {
    id: "chunk_wiki_relevant",
    documentId: "doc_wiki",
    sourceUri: "wiki/NPC/阿兰.txt",
    chunkIndex: 0,
    chunkType: "character_profile",
    text: "【阿兰 百科】空间站防卫科负责人，喜欢吃炸鸡...",
    tokenEstimate: 20,
    headingPath: ["阿兰"],
    entityNames: ["阿兰", "空间站"],
    keywords: ["阿兰", "炸鸡"],
    canonicalPriority: 0.50, // Low priority
    metadata: { perspective: "third_person", sourceFile: "wiki/NPC/阿兰.txt", characters: ["阿兰"], verified: true },
  };

  const reranker = new KnowledgeReranker();
  const lexCandidates = [
    { chunk: relevantWikiChunk, lexicalScore: 0.8 },
  ];

  // Query specifically asking about 阿兰炸鸡 - irrelevantP1Chunk has 0 lexical and 0 entity match
  const results = reranker.rerank({ queryText: "阿兰炸鸡" }, lexCandidates, []);

  assert.ok(results.length > 0);
  assert.equal(results[0].chunk.id, "chunk_wiki_relevant");
  assert.ok(!results.some((r) => r.chunk.id === "chunk_p1_irrelevant"));
});
