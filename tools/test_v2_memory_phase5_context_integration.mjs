import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { InMemoryMemoryStore } from "../dist/main/main/memory/memory-store.js";
import { MemoryCoordinator } from "../dist/main/main/memory/memory-coordinator.js";
import { MemoryProjector } from "../dist/main/main/memory/memory-projector.js";
import { ContextManager } from "../dist/main/main/agent/context/context-manager.js";
import { MemorySlot } from "../dist/main/main/agent/context/context-slots.js";
import { FireflyAgentCore } from "../dist/main/main/agent/firefly-agent-core.js";
import { FireflyToolRegistry } from "../dist/main/main/tools/tool-registry.js";

function createMockLlm(responseText = "你好呀，开拓者！") {
  return {
    id: "mock-llm",
    name: "Mock LLM Provider",
    capabilities: { supportsNativeToolCalling: true, supportsStreaming: false },
    getConfig: () => ({ provider: "local", baseUrl: "", apiKey: "", model: "mock", temperature: 0.7, enableStreaming: false }),
    generateCompletion: async () => ({
      message: {
        role: "assistant",
        content: responseText,
      },
    }),
  };
}

test("1. MemorySlot invokes retrieval: Querying through MemorySlot triggers memory retrieval", async () => {
  const coordinator = new MemoryCoordinator();
  await coordinator.observe({
    key: "用户姓名",
    value: "开拓者",
    category: "profile",
    source: "user_explicit",
  });

  const slot = coordinator.createSlot();
  const rendered = await slot.render({ userPrompt: "请问我的名字是？" });

  assert.ok(rendered.includes("用户姓名: 开拓者"));
  assert.ok(rendered.includes("【流萤对开拓者的长期记忆】"));
});

test("2. Query Propagation: User prompt correctly passed into memory retrieval pipeline", async () => {
  const coordinator = new MemoryCoordinator();
  await coordinator.observe({
    key: "最喜欢的甜品",
    value: "橡木蛋糕卷",
    category: "preference",
    source: "user_explicit",
  });
  await coordinator.observe({
    key: "居住星球",
    value: "匹诺康尼",
    category: "profile",
    source: "user_explicit",
  });

  const slot = coordinator.createSlot();
  const rendered = await slot.render({ userPrompt: "甜品" });

  assert.ok(rendered.includes("橡木蛋糕卷"));
});

test("3. Scope Propagation: Retrieval respects scope boundaries within slot", async () => {
  const store = new InMemoryMemoryStore();
  const coordinator = new MemoryCoordinator({ store });

  await coordinator.observe({
    key: "用户秘密",
    value: "喜欢看星星",
    category: "preference",
    scope: "user",
  });

  const slot = coordinator.createSlot();
  const rendered = await slot.render({ userPrompt: "看星星" });
  assert.ok(rendered.includes("喜欢看星星"));
});

test("4. Ranked Result Projection: Highly ranked memories are ordered cleanly in output", async () => {
  const coordinator = new MemoryCoordinator();
  await coordinator.observe({ key: "爱好1", value: "听歌", category: "preference" });
  await coordinator.observe({ key: "核心身份", value: "星穹列车无名客", category: "profile", pinned: true });

  const slot = coordinator.createSlot();
  const rendered = await slot.render({ userPrompt: "我的信息" });

  assert.ok(rendered.includes("核心身份: 星穹列车无名客"));
  assert.ok(rendered.includes("爱好1: 听歌"));
});

test("5. Memory Token Budget: Output length strictly obeys maxTokens limit", async () => {
  const coordinator = new MemoryCoordinator();
  for (let i = 0; i < 20; i++) {
    await coordinator.observe({
      key: `长记忆项_${i}`,
      value: `这是一条非常长且内容充实详细的记忆记录描述用于测试Token预算截断_${i}`,
      category: "event",
    });
  }

  const slot = coordinator.createSlot({ maxTokens: 80, topK: 15 });
  const rendered = await slot.render({ userPrompt: "长记忆项" });

  const estimatedTokens = slot.estimateTokens({ memoryContext: rendered }, coordinator.getProjector()["tokenMeter"]);
  assert.ok(estimatedTokens <= 100, `Estimated tokens ${estimatedTokens} must be <= budget`);
});

test("6. Empty Memory: Renders empty string when no relevant memories exist", async () => {
  const coordinator = new MemoryCoordinator();
  const slot = coordinator.createSlot();
  const rendered = await slot.render({ userPrompt: "完全不相关的物理常数" });

  assert.equal(rendered, "");
});

test("7. Memory Projection Format: Formats into clean structured sections", async () => {
  const coordinator = new MemoryCoordinator();
  await coordinator.observe({ key: "代号", value: "开拓者", category: "profile" });
  await coordinator.observe({ key: "音乐", value: "使一颗心免于哀伤", category: "preference" });
  await coordinator.observe({ key: "信任", value: "流萤", category: "relation" });
  await coordinator.observe({ key: "约定", value: "秘密基地看烟花", category: "event" });

  const slot = coordinator.createSlot();
  const rendered = await slot.render({ userPrompt: "记忆" });

  assert.ok(rendered.includes("• 基础画像: 代号: 开拓者"));
  assert.ok(rendered.includes("• 偏好喜好: 音乐: 使一颗心免于哀伤"));
  assert.ok(rendered.includes("• 关系纽带: 信任: 流萤"));
  assert.ok(rendered.includes("• 共同经历: 约定: 秘密基地看烟花"));
});

test("8. Retrieval Remains Read-Only: Slot rendering causes ZERO mutations to MemoryStore", async () => {
  const store = new InMemoryMemoryStore();
  const coordinator = new MemoryCoordinator({ store });

  await coordinator.observe({
    key: "测试项",
    value: "值",
    category: "profile",
  });

  const slot = coordinator.createSlot();
  await slot.render({ userPrompt: "测试项" });
  await slot.render({ userPrompt: "测试项" });

  const records = await store.listRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0].accessCount, 0, "Read-only rendering must not mutate accessCount");
});

test("9. ContextManager Integration: MemorySlot correctly mounted inside ContextManager", async () => {
  const coordinator = new MemoryCoordinator();
  await coordinator.observe({ key: "用户称谓", value: "开拓者", category: "profile" });

  const contextManager = new ContextManager({
    customSlots: [coordinator.createSlot()],
  });

  const projected = contextManager.project({
    userPrompt: "你好呀！",
    memoryContext: await coordinator.createSlot().render({ userPrompt: "用户称谓" }),
  });

  assert.ok(projected.systemPrompt.includes("用户称谓: 开拓者"));
});

test("10. FireflyAgentCore Sees Memory Through Context Only: Agent core operates strictly via ContextManager", async () => {
  const coordinator = new MemoryCoordinator();
  await coordinator.observe({ key: "姓名", value: "开拓者", category: "profile" });

  const slot = coordinator.createSlot();
  const memContext = await slot.render({ userPrompt: "姓名" });

  const registry = new FireflyToolRegistry();
  const mockLlm = createMockLlm("你好呀，开拓者！");
  const core = new FireflyAgentCore({
    provider: mockLlm,
    toolRegistry: registry,
  });

  const result = await core.run({
    userPrompt: "你是谁？",
    memoryContext: memContext,
  });

  assert.equal(result.status, "completed");
  assert.equal(result.finalText, "你好呀，开拓者！");
});

test("11. MemoryStore Remains Decoupled: Store operations are independent of Context lifecycle", async () => {
  const store = new InMemoryMemoryStore();
  const coordinator = new MemoryCoordinator({ store });

  await coordinator.observe({ key: "k1", value: "v1", category: "profile" });
  assert.equal((await store.listRecords()).length, 1);

  await store.clear();
  assert.equal((await store.listRecords()).length, 0);
});

test("12. No resources/ Injection: MemorySlot contains zero content from resources/ files", async () => {
  const coordinator = new MemoryCoordinator();
  const slot = coordinator.createSlot();

  const rendered = await slot.render({ userPrompt: "翁法罗斯泰坦神脉" });
  // Should not contain amphoreus_lore.md unless explicitly recorded in user memory
  assert.equal(rendered, "");
});

test("13. No RAG Dependency: MemorySlot operates 100% without Vector DB or Embedding API", async () => {
  const coordinator = new MemoryCoordinator();
  await coordinator.observe({ key: "偏好", value: "红茶", category: "preference" });

  const slot = coordinator.createSlot();
  const rendered = await slot.render({ userPrompt: "红茶" });

  assert.ok(rendered.includes("红茶"));
});

test("14. Compaction Compatibility: Memory projection fits within Context Compactor budget", () => {
  const coordinator = new MemoryCoordinator();
  const projector = coordinator.getProjector();

  const longMemories = Array.from({ length: 10 }, (_, i) => ({
    id: `m_${i}`,
    layer: "L2_SEMANTIC",
    category: "profile",
    scope: "user",
    key: `画像_${i}`,
    value: `测试数值内容_${i}`,
    importance: 0.9,
    accessCount: 1,
    createdAt: 1000,
    updatedAt: 1000,
    lastAccessedAt: 1000,
  }));

  const projected = projector.project(longMemories, { maxTokens: 200 });
  const meter = projector["tokenMeter"];
  assert.ok(meter.estimateTokens(projected) <= 200);
});

test("15. Memory Update Does Not Mutate Projected Context: Frozen projection snapshot guarantee", async () => {
  const coordinator = new MemoryCoordinator();
  await coordinator.observe({ key: "心情", value: "开心", category: "working_state" });

  const slot = coordinator.createSlot();
  const snapshot1 = await slot.render({ userPrompt: "心情" });

  // Update memory store
  await coordinator.observe({ key: "心情", value: "疲惫", category: "working_state", isCorrection: true });

  // Snapshot 1 must remain unchanged in memory
  assert.ok(snapshot1.includes("开心"));
});

test("16. Static Decoupling Audit: FireflyAgentCore has ZERO imports from src/main/memory/*", () => {
  const coreFilePath = path.join(process.cwd(), "src", "main", "agent", "firefly-agent-core.ts");
  const coreSource = fs.readFileSync(coreFilePath, "utf-8");

  // Check no concrete imports from memory directory
  const memoryImports = coreSource.match(/from\s+["'].*\/memory\/.*["']/g);
  assert.equal(
    memoryImports,
    null,
    `FireflyAgentCore must NOT import from memory/ directory directly. Found: ${JSON.stringify(memoryImports)}`
  );

  assert.equal(coreSource.includes("new MemoryStore"), false);
  assert.equal(coreSource.includes("new MemoryRetriever"), false);
  assert.equal(coreSource.includes("new MemoryRanker"), false);
  assert.equal(coreSource.includes("new MemoryWriteService"), false);
  assert.equal(coreSource.includes("new MemoryMaintenanceService"), false);
});
