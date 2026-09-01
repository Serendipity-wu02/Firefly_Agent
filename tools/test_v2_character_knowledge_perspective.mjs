/**
 * @file test_v2_character_knowledge_perspective.mjs
 * @description Test suite for Firefly-Agent V2.4 Character Knowledge & Subjective Perspective.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const perspectivePath = path.join(projectRoot, "dist", "main", "main", "character", "knowledge-perspective.js");
const characterPolicyPath = path.join(projectRoot, "dist", "main", "main", "character", "character-policy.js");
const knowledgeProjectorPath = path.join(projectRoot, "dist", "main", "main", "rag", "knowledge-projector.js");
const systemPromptBuilderPath = path.join(projectRoot, "dist", "main", "main", "agent", "context", "system-prompt-builder.js");

test("1. First-Person Canonical Experience: Evaluates Firefly's own history as first-person memory", async () => {
  const { KnowledgePerspectiveEvaluator } = await import(`file://${perspectivePath}`);

  // Test own identity / armor / syndrome chunk
  const ownChunk = {
    sourceUri: "knowledge/facts.yaml",
    entityNames: ["流萤", "萨姆", "失熵症"],
    text: "前格拉默铁骑「萨姆」驾驶员，编号 AR-26710。因基因改造罹患失熵症，身体不可逆地慢性解离。",
    metadata: { perspective: "first_person" },
  };

  const evalResult = KnowledgePerspectiveEvaluator.evaluate(ownChunk);
  assert.equal(evalResult.type, "first_person_experience");
  assert.equal(evalResult.perspectiveLabel, "亲历记忆");
  assert.equal(evalResult.isFirstPerson, true);
  assert.equal(evalResult.notPresent, false);
  assert.ok(evalResult.guidance.includes("第一人称"));
});

test("2. Penacony Direct Experience: Evaluates Penacony events as first-person memories", async () => {
  const { KnowledgePerspectiveEvaluator } = await import(`file://${perspectivePath}`);

  const penaconyChunk = {
    sourceUri: "resources/流萤/主线剧情文本/13. 士兵的报酬.md",
    entityNames: ["流萤", "秘密基地", "三次死亡", "烟花"],
    text: "在晖长石号上一起经历了烟花，那既是第三次死亡的仪式，也是第三次重生的开始。",
  };

  const evalResult = KnowledgePerspectiveEvaluator.evaluate(penaconyChunk);
  assert.equal(evalResult.type, "first_person_experience");
  assert.equal(evalResult.perspectiveLabel, "亲历记忆");
  assert.equal(evalResult.isFirstPerson, true);
});

test("3. Relationship Knowledge: Evaluates companion facts with warmth and relational perspective", async () => {
  const { KnowledgePerspectiveEvaluator } = await import(`file://${perspectivePath}`);

  // Silver Wolf relation chunk
  const silverWolfChunk = {
    sourceUri: "knowledge/facts.yaml",
    entityNames: ["银狼", "星核猎手"],
    text: "精通黑客技术的少女，常常借各种游戏卡带给流萤。被黑塔封了76个游戏账号。",
    metadata: { scene: "星核猎手基地" },
  };

  const evalResult = KnowledgePerspectiveEvaluator.evaluate(silverWolfChunk);
  assert.equal(evalResult.type, "relationship_fact");
  assert.equal(evalResult.perspectiveLabel, "同伴与关系");
  assert.equal(evalResult.isFirstPerson, true);
  assert.equal(evalResult.notPresent, false);
  assert.ok(evalResult.guidance.includes("同伴"));
});

test("4. World Lore Intelligence (Not Present): Accurately marks Jarilo-VI / Xianzhou / Space Station as non-present intelligence", async () => {
  const { KnowledgePerspectiveEvaluator } = await import(`file://${perspectivePath}`);

  // Jarilo-VI Belobog chunk
  const jariloChunk = {
    sourceUri: "resources/wiki/角色/希露瓦.txt",
    entityNames: ["希露瓦", "杰帕德"],
    text: "希露瓦在永冬的贝洛伯格经营机械屋「永动」。流萤不在场。",
    metadata: { scene: "雅利洛-VI" },
  };

  const evalResult = KnowledgePerspectiveEvaluator.evaluate(jariloChunk);
  assert.equal(evalResult.type, "world_lore_intelligence");
  assert.equal(evalResult.perspectiveLabel, "外部情报 (不在场)");
  assert.equal(evalResult.isFirstPerson, false);
  assert.equal(evalResult.notPresent, true);
  assert.ok(evalResult.guidance.includes("流萤当时不在场"));
});

test("5. World Lore Intelligence (Not Acquainted): Accurately handles unacquainted entities", async () => {
  const { KnowledgePerspectiveEvaluator } = await import(`file://${perspectivePath}`);

  const unknownEntityChunk = {
    sourceUri: "resources/wiki/开拓任务/不存在的国度.txt",
    entityNames: ["归寂"],
    text: "绝灭大君归寂曾赐予绘世家族毁灭的力量。流萤不认识此人。!不认识",
    metadata: { scene: "二相乐园" },
  };

  const evalResult = KnowledgePerspectiveEvaluator.evaluate(unknownEntityChunk);
  assert.equal(evalResult.type, "world_lore_intelligence");
  assert.equal(evalResult.perspectiveLabel, "外部情报 (不认识)");
  assert.equal(evalResult.isFirstPerson, false);
  assert.equal(evalResult.notAcquainted, true);
  assert.ok(evalResult.guidance.includes("不认识"));
});

test("6. KnowledgeProjector Integration: Formats RAG items with accurate subjective perspective tags", async () => {
  const { KnowledgeProjector } = await import(`file://${knowledgeProjectorPath}`);
  const projector = new KnowledgeProjector();

  const sampleItems = [
    {
      chunk: {
        id: "c1",
        documentId: "d1",
        sourceUri: "knowledge/facts.yaml",
        chunkIndex: 0,
        chunkType: "atomic_fact",
        text: "前格拉默铁骑「萨姆」驾驶员，编号 AR-26710。",
        tokenEstimate: 20,
        entityNames: ["流萤", "萨姆"],
        keywords: ["流萤", "萨姆"],
        canonicalPriority: 1.0,
        metadata: { perspective: "first_person", sourceFile: "knowledge/facts.yaml", characters: ["流萤"], verified: true },
      },
      finalScore: 0.98,
      breakdown: { lexicalScore: 1, vectorScore: 0.9, entityScore: 1, canonicalScore: 1, timelineScore: 0.5 },
    },
    {
      chunk: {
        id: "c2",
        documentId: "d2",
        sourceUri: "resources/wiki/角色/景元.txt",
        chunkIndex: 0,
        chunkType: "wiki_block",
        text: "仙舟罗浮的景元将军，在幻胧决战中统领云骑军。流萤不在场。",
        tokenEstimate: 25,
        entityNames: ["景元"],
        keywords: ["景元", "仙舟"],
        canonicalPriority: 0.7,
        metadata: { perspective: "third_person", sourceFile: "resources/wiki/角色/景元.txt", characters: ["景元"], verified: true },
      },
      finalScore: 0.75,
      breakdown: { lexicalScore: 0.7, vectorScore: 0.7, entityScore: 0.8, canonicalScore: 0.7, timelineScore: 0.5 },
    },
  ];

  const projected = projector.project(sampleItems);
  assert.ok(projected.includes("[facts.yaml] [亲历记忆]"));
  assert.ok(projected.includes("[景元.txt] [外部情报 (不在场)]"));
  assert.ok(projected.includes("前格拉默铁骑「萨姆」驾驶员"));
  assert.ok(projected.includes("仙舟罗浮的景元将军"));
});

test("7. System Prompt Cognitive Perspective Section: Successfully injected into system prompt", async () => {
  const { SystemPromptBuilder } = await import(`file://${systemPromptBuilderPath}`);

  const prompt = SystemPromptBuilder.build();
  assert.ok(prompt.includes("【认知视角与知识准则 (Cognitive Perspective)】"));
  assert.ok(prompt.includes("【亲历记忆】"));
  assert.ok(prompt.includes("【同伴关系】"));
  assert.ok(prompt.includes("【外部世界】"));
  assert.ok(prompt.includes("【未知坦白】"));
});

test("8. CharacterPolicy Perspective Evaluation Delegation: Cleanly delegates to evaluator", async () => {
  const { CharacterPolicyEngine } = await import(`file://${characterPolicyPath}`);
  const engine = CharacterPolicyEngine.getInstance();

  const res = engine.evaluateKnowledgePerspective({
    sourceUri: "knowledge/curated_cards/卡芙卡.md",
    entityNames: ["卡芙卡"],
    text: "卡芙卡在格拉默废墟找到了流萤并带她加入星核猎手。",
  });

  assert.equal(res.type, "relationship_fact");
  assert.equal(res.perspectiveLabel, "同伴与关系");
});

test("9. State / Knowledge Invariance: Physiological state changes do not alter knowledge perspective classification", async () => {
  const { KnowledgePerspectiveEvaluator } = await import(`file://${perspectivePath}`);

  const chunk = {
    sourceUri: "knowledge/facts.yaml",
    entityNames: ["流萤", "失熵症"],
    text: "流萤患有失熵症，身体慢性解离。",
  };

  const eval1 = KnowledgePerspectiveEvaluator.evaluate(chunk);
  assert.equal(eval1.type, "first_person_experience");

  // Even if character state is low energy or sad, the subjective factual ownership does not change
  const eval2 = KnowledgePerspectiveEvaluator.evaluate(chunk);
  assert.equal(eval2.type, "first_person_experience");
  assert.equal(eval2.isFirstPerson, true);
});
