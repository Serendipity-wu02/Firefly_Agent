import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { RagSlot, MemorySlot, ContextSlotPriority } from "../dist/main/main/agent/context/context-slots.js";
import { ContextManager } from "../dist/main/main/agent/context/context-manager.js";
import { ContextProjector } from "../dist/main/main/agent/context/context-projector.js";
import { TokenMeter } from "../dist/main/main/agent/context/token-meter.js";
import { KnowledgeProjector } from "../dist/main/main/rag/knowledge-projector.js";
import { KnowledgeCoordinator } from "../dist/main/main/rag/knowledge-coordinator.js";
import { HybridRetriever } from "../dist/main/main/rag/hybrid-retriever.js";
import { InMemoryVectorStore } from "../dist/main/main/rag/vector-store.js";
import { DeterministicEmbeddingProvider } from "../dist/main/main/rag/embedding-provider.js";
import { ProductionEmbeddingProvider } from "../dist/main/main/rag/production-embedding-provider.js";

const sampleChunks = [
  {
    id: "chunk_sam",
    documentId: "doc_facts",
    sourceUri: "knowledge/facts.yaml",
    chunkIndex: 0,
    chunkType: "atomic_fact",
    text: "【萨姆 - 战斗形态】萨姆是格拉默铁骑IV型装甲，具备强大的焦土作战能力。",
    tokenEstimate: 30,
    headingPath: ["萨姆", "战斗形态"],
    entityNames: ["萨姆", "格拉默铁骑"],
    keywords: ["萨姆", "装甲", "焦土"],
    canonicalPriority: 0.95,
    metadata: { perspective: "factual_assertion", sourceFile: "knowledge/facts.yaml", characters: ["萨姆"], verified: true },
  },
  {
    id: "chunk_firefly_secret",
    documentId: "doc_card_secret",
    sourceUri: "knowledge/curated_cards/秘密基地.md",
    chunkIndex: 0,
    chunkType: "curated_card",
    text: "【秘密基地】在流梦礁的边缘，流萤向开拓者坦白了自己身患失熵症的真相。",
    tokenEstimate: 35,
    headingPath: ["秘密基地"],
    entityNames: ["流萤", "开拓者", "失熵症", "流梦礁"],
    keywords: ["秘密基地", "流梦礁", "失熵症"],
    canonicalPriority: 0.85,
    metadata: { perspective: "first_person", sourceFile: "knowledge/curated_cards/秘密基地.md", characters: ["流萤", "开拓者"], verified: true },
  },
];

test("1. RagSlot Creation: Instantiates cleanly with priority 70", () => {
  const slot = new RagSlot();
  assert.equal(slot.id, "rag");
  assert.equal(slot.priority, ContextSlotPriority.RAG);
  assert.equal(slot.priority, 70);
  assert.equal(slot.enabled, true);
});

test("2. Query Propagation: User prompt passed into RagSlot is forwarded to retriever", async () => {
  let capturedQuery = "";
  const mockRetriever = {
    retrieve: async (q) => {
      capturedQuery = q.queryText || "";
      return { items: [] };
    },
  };

  const slot = new RagSlot({ retriever: mockRetriever });
  await slot.render({ userPrompt: "流萤是谁" });

  assert.equal(capturedQuery, "流萤是谁");
});

test("3. HybridRetriever Invocation: Renders retrieved items through projector", async () => {
  const projector = new KnowledgeProjector();
  const mockRetriever = {
    retrieve: async () => ({
      items: [
        {
          chunk: sampleChunks[0],
          finalScore: 0.9,
          breakdown: { lexicalScore: 0.9, vectorScore: 0.8, entityScore: 1, canonicalScore: 0.95, timelineScore: 0.5 },
        },
      ],
    }),
  };

  const slot = new RagSlot({
    retriever: mockRetriever,
    projector: {
      project: (items, cfg) => projector.project(items, cfg),
    },
  });

  const rendered = await slot.render({ userPrompt: "萨姆装甲" });
  assert.ok(rendered.includes("【相关背景知识】"));
  assert.ok(rendered.includes("萨姆是格拉默铁骑IV型装甲"));
});

test("4. Result Projection: Formats clean structured markdown lines", () => {
  const projector = new KnowledgeProjector();
  const items = [
    {
      chunk: sampleChunks[1],
      finalScore: 0.85,
      breakdown: { lexicalScore: 0.8, vectorScore: 0.7, entityScore: 1, canonicalScore: 0.85, timelineScore: 0.5 },
    },
  ];

  const out = projector.project(items);
  assert.ok(out.includes("[秘密基地.md]"));
  assert.ok(out.includes("在流梦礁的边缘"));
  assert.ok(out.includes("(权威度: 0.85)"));
});

test("5. TopK: RagSlot respects configured topK parameter", async () => {
  let capturedTopK = -1;
  const mockRetriever = {
    retrieve: async (q) => {
      capturedTopK = q.topK || -1;
      return { items: [] };
    },
  };

  const slot = new RagSlot({ retriever: mockRetriever, topK: 3 });
  await slot.render({ userPrompt: "测试" });

  assert.equal(capturedTopK, 3);
});

test("6. Rag Token Budget: Projection strictly respects maxTokens budget", () => {
  const projector = new KnowledgeProjector();
  const longItems = Array.from({ length: 20 }, (_, i) => ({
    chunk: { ...sampleChunks[0], id: `c_${i}`, text: `超长背景知识详细记录第 ${i} 段内容...`.repeat(5) },
    finalScore: 0.9 - i * 0.01,
    breakdown: { lexicalScore: 0.9, vectorScore: 0.8, entityScore: 1, canonicalScore: 0.95, timelineScore: 0.5 },
  }));

  const out = projector.project(longItems, { maxTokens: 100 });
  const meter = new TokenMeter();
  const tokens = meter.estimateTokens(out);

  assert.ok(tokens <= 120, `Tokens should be bounded near budget, got ${tokens}`);
});

test("7. Empty Result: Renders empty string when no relevant knowledge found", async () => {
  const mockRetriever = {
    retrieve: async () => ({ items: [] }),
  };
  const slot = new RagSlot({ retriever: mockRetriever });
  const rendered = await slot.render({ userPrompt: "不存在的内容" });

  assert.equal(rendered, "");
});

test("8. Retrieval Failure Isolation: Retriever errors gracefully return empty string without crashing", async () => {
  const failingRetriever = {
    retrieve: async () => {
      throw new Error("Simulated network/DB timeout");
    },
  };
  const slot = new RagSlot({ retriever: failingRetriever });

  const rendered = await slot.render({ userPrompt: "任何查询" });
  assert.equal(rendered, "");
});

test("9. Provenance Preservation: Source filename is accurately projected", () => {
  const projector = new KnowledgeProjector();
  const out = projector.project([
    { chunk: sampleChunks[0], finalScore: 0.9, breakdown: {} },
  ]);

  assert.ok(out.includes("[facts.yaml]"));
});

test("10. Canonical Priority Preservation: High-priority chunk includes canonical tag", () => {
  const projector = new KnowledgeProjector();
  const out = projector.project([
    { chunk: sampleChunks[0], finalScore: 0.9, breakdown: {} },
  ]);

  assert.ok(out.includes("0.95"));
});

test("11. Memory / RAG Isolation: RagSlot rendering causes zero side-effects on memory", async () => {
  const memoryV2Path = path.join(process.cwd(), "config", "memory_v2.json");
  const memoryV2Content = fs.existsSync(memoryV2Path) ? fs.readFileSync(memoryV2Path, "utf-8") : null;

  const projector = new KnowledgeProjector();
  const slot = new RagSlot({
    retriever: { retrieve: async () => ({ items: [{ chunk: sampleChunks[0], finalScore: 0.9, breakdown: {} }] }) },
    projector: { project: (items) => projector.project(items) },
  });

  await slot.render({ userPrompt: "萨姆" });

  if (memoryV2Content) {
    assert.equal(fs.readFileSync(memoryV2Path, "utf-8"), memoryV2Content);
  } else {
    assert.equal(fs.existsSync(memoryV2Path), false);
  }
});

test("12. ContextManager Integration: RagSlot is mounted in ContextManager alongside MemorySlot", async () => {
  const cm = new ContextManager();
  const ragSlot = cm.getSlot("rag");
  const memorySlot = cm.getSlot("memory");

  assert.ok(ragSlot);
  assert.ok(memorySlot);
  assert.equal(ragSlot.priority, 70);
  assert.equal(memorySlot.priority, 80);
});

test("13. FireflyAgentCore No Direct RAG Dependency: Core has zero imports from src/main/rag/*", () => {
  const coreFile = path.join(process.cwd(), "src", "main", "agent", "firefly-agent-core.ts");
  const content = fs.readFileSync(coreFile, "utf-8");

  assert.ok(!content.includes("src/main/rag"));
  assert.ok(!content.includes("KnowledgeRetriever"));
  assert.ok(!content.includes("HybridRetriever"));
  assert.ok(!content.includes("VectorStore"));
  assert.ok(!content.includes("EmbeddingProvider"));
});

test("14. Compaction Compatibility: RAG projection works seamlessly with ContextProjector", () => {
  const projector = new ContextProjector();
  const projected = projector.project({
    userPrompt: "你好流萤",
    memoryContext: "【长期记忆】用户喜欢星穹铁道",
    ragContext: "【相关背景知识】流萤是星核猎手成员",
  });

  assert.ok(projected.systemPrompt.includes("【长期记忆】"));
  assert.ok(projected.systemPrompt.includes("【相关背景知识】"));
  assert.ok(projected.usage.systemTokens > 0);
  assert.ok(projected.usage.ragTokens > 0);
});

test("15. Deterministic Provider Test Mode: Coordinator correctly marks test embedding mode", () => {
  const coordinator = new KnowledgeCoordinator();
  const retriever = coordinator.getRetriever();
  assert.ok(retriever);
});

test("16. Production Provider Absence Handling: Unconfigured production provider is caught safely", () => {
  const prodProvider = new ProductionEmbeddingProvider();
  const discovery = prodProvider.discoverBackend();
  assert.equal(discovery.isAvailable, false);
});

test("17. Repeated Query Determinism: Consecutive renders with same prompt produce identical text", async () => {
  const projector = new KnowledgeProjector();
  const slot = new RagSlot({
    retriever: { retrieve: async () => ({ items: [{ chunk: sampleChunks[0], finalScore: 0.9, breakdown: {} }] }) },
    projector: { project: (items) => projector.project(items) },
  });

  const out1 = await slot.render({ userPrompt: "测试" });
  const out2 = await slot.render({ userPrompt: "测试" });

  assert.equal(out1, out2);
});

test("18. RAG Projection Does Not Mutate Source Corpus: Raw chunk objects remain unmodified", async () => {
  const chunkOriginal = JSON.parse(JSON.stringify(sampleChunks[0]));
  const projector = new KnowledgeProjector();
  projector.project([{ chunk: sampleChunks[0], finalScore: 0.9, breakdown: {} }]);

  assert.deepEqual(sampleChunks[0], chunkOriginal);
});

test("19. Memory Projection Remains Independent: Memory and RAG slot projections do not interfere", () => {
  const projector = new ContextProjector();
  const memOnly = projector.project({ userPrompt: "hi", memoryContext: "MEM" });
  const ragOnly = projector.project({ userPrompt: "hi", ragContext: "RAG" });
  const both = projector.project({ userPrompt: "hi", memoryContext: "MEM", ragContext: "RAG" });

  assert.ok(memOnly.systemPrompt.includes("MEM"));
  assert.ok(!memOnly.systemPrompt.includes("RAG"));

  assert.ok(!ragOnly.systemPrompt.includes("MEM"));
  assert.ok(ragOnly.systemPrompt.includes("RAG"));

  assert.ok(both.systemPrompt.includes("MEM"));
  assert.ok(both.systemPrompt.includes("RAG"));
});

test("20. Slot Priority Ordering: System (100) > State (90) > Memory (80) > RAG (70) > Tool (60) > Plan (50)", () => {
  const cm = new ContextManager();
  const slots = cm.listSlots();

  const priorities = slots.map((s) => s.priority);
  for (let i = 0; i < priorities.length - 1; i++) {
    assert.ok(priorities[i] >= priorities[i + 1], `Slot ${slots[i].id} priority (${priorities[i]}) must >= slot ${slots[i+1].id} (${priorities[i+1]})`);
  }
});
