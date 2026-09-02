/**
 * @file test_v2_relationships.mjs
 * @description Test suite for Firefly V2.4 Relationship & Companion Runtime.
 * Validates Canonical Relationships, Companions Cognition, Perspective Boundaries, and Non-Gamification Rules.
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const characterPolicyPath = path.join(projectRoot, "dist", "main", "main", "character", "character-policy.js");
const relationshipRegistryPath = path.join(projectRoot, "dist", "main", "main", "character", "relationship-registry.js");
const systemPromptBuilderPath = path.join(projectRoot, "dist", "main", "main", "orchestrator", "context", "system-prompt-builder.js");

test("1. Core Companion Relationship: Trailblazer is deeply recognized with exact canonical facts and address", async () => {
  const { RelationshipRegistry } = await import(`file://${relationshipRegistryPath}`);
  const rel = RelationshipRegistry.findRelationship("开拓者");

  assert.ok(rel, "Trailblazer relationship must be registered");
  assert.equal(rel.category, "core_companion");
  assert.equal(rel.addressing, "「开拓者」");
  assert.ok(rel.attitude.includes("特别") || rel.attitude.includes("匹诺康尼"));

  // Canonical facts verification
  assert.ok(rel.canonicalFacts.some((f) => f.includes("一日导游")));
  assert.ok(rel.canonicalFacts.some((f) => f.includes("秘密基地")));
  assert.ok(rel.canonicalFacts.some((f) => f.includes("烟花") || f.includes("热砂海选")));

  // Boundaries & anti-fabrication
  assert.equal(rel.boundaries.canFabricateSharedPast, false);
  assert.ok(rel.boundaries.forbiddenTropes.some((t) => t.includes("严禁捏造")));
});

test("2. Stellaron Hunters Companions: Kafka, Silver Wolf, Blade, and Elio verified with official facts", async () => {
  const { RelationshipRegistry } = await import(`file://${relationshipRegistryPath}`);

  // Kafka
  const kafka = RelationshipRegistry.findRelationship("卡芙卡");
  assert.ok(kafka);
  assert.equal(kafka.category, "stellaron_hunter");
  assert.equal(kafka.addressing, "「卡芙卡」");
  assert.ok(kafka.canonicalFacts.some((f) => f.includes("格拉默废墟")));

  // Silver Wolf
  const sw = RelationshipRegistry.findRelationship("银狼");
  assert.ok(sw);
  assert.equal(sw.category, "stellaron_hunter");
  assert.equal(sw.addressing, "「银狼」");
  assert.ok(sw.canonicalFacts.some((f) => f.includes("游戏卡带") || f.includes("入梦池")));

  // Blade
  const blade = RelationshipRegistry.findRelationship("刃");
  assert.ok(blade);
  assert.equal(blade.category, "stellaron_hunter");
  assert.ok(blade.canonicalFacts.some((f) => f.includes("不超过三句") || f.includes("匹诺康尼")));

  // Elio
  const elio = RelationshipRegistry.findRelationship("艾利欧");
  assert.ok(elio);
  assert.equal(elio.category, "stellaron_hunter");
  assert.ok(elio.canonicalFacts.some((f) => f.includes("剧本")));
});

test("3. Astral Express & Key Penacony Contacts: Verified official contacts with specific attitudes", async () => {
  const { RelationshipRegistry } = await import(`file://${relationshipRegistryPath}`);

  // Pom-Pom
  const pomPom = RelationshipRegistry.findRelationship("帕姆");
  assert.ok(pomPom);
  assert.equal(pomPom.category, "astral_express");
  assert.equal(pomPom.addressing, "「帕姆」");

  // Robin
  const robin = RelationshipRegistry.findRelationship("知更鸟");
  assert.ok(robin);
  assert.equal(robin.category, "penacony_contact");
  assert.equal(robin.addressing, "「知更鸟」");
  assert.ok(robin.canonicalFacts.some((f) => f.includes("流梦礁")));

  // Acheron
  const acheron = RelationshipRegistry.findRelationship("黄泉");
  assert.ok(acheron);
  assert.equal(acheron.category, "penacony_contact");
  assert.ok(acheron.canonicalFacts.some((f) => f.includes("自灭者") || f.includes("萨姆")));

  // Gallagher
  const gallagher = RelationshipRegistry.findRelationship("加拉赫");
  assert.ok(gallagher);
  assert.equal(gallagher.category, "penacony_contact");
  assert.ok(gallagher.canonicalFacts.some((f) => f.includes("猎犬家系") || f.includes("帮过流萤")));

  // Sparkle
  const sparkle = RelationshipRegistry.findRelationship("花火");
  assert.ok(sparkle);
  assert.equal(sparkle.category, "penacony_contact");
  assert.ok(sparkle.canonicalFacts.some((f) => f.includes("黄金时刻") || f.includes("烟花") || f.includes("假面愚者")));
});

test("4. Non-Acquainted Character Boundary: External universe figures are NOT falsely sentimentalized", async () => {
  const { RelationshipRegistry } = await import(`file://${relationshipRegistryPath}`);

  const jingyuanRes = RelationshipRegistry.queryRelationshipPerspective("景元");
  assert.equal(jingyuanRes.isKnown, false);
  assert.ok(jingyuanRes.perspectiveGuidance.includes("没有直接交集或当时不在场"));
  assert.ok(jingyuanRes.perspectiveGuidance.includes("客观宇宙情报视角"));

  const servalRes = RelationshipRegistry.queryRelationshipPerspective("希露瓦");
  assert.equal(servalRes.isKnown, false);

  const topazRes = RelationshipRegistry.queryRelationshipPerspective("托帕");
  assert.equal(topazRes.isKnown, false);
});

test("5. System Prompt Integration: Relationship section is cleanly formatted and injected into prompt", async () => {
  const { SystemPromptBuilder } = await import(`file://${systemPromptBuilderPath}`);
  const prompt = SystemPromptBuilder.build();

  assert.ok(prompt.includes("【核心人际关系与同伴认知 (Canonical Relationships)】"));
  assert.ok(prompt.includes("开拓者 (核心羁绊)"));
  assert.ok(prompt.includes("星核猎手 (命运同伴与家人)"));
  assert.ok(prompt.includes("卡芙卡"));
  assert.ok(prompt.includes("银狼"));
  assert.ok(prompt.includes("刃"));
  assert.ok(prompt.includes("艾利欧"));
  assert.ok(prompt.includes("匹诺康尼交集"));
  assert.ok(prompt.includes("关系边界硬约束"));
});

test("6. Canonical Relationship Protection: Rejects memory writes attempting to tamper with relationships", async () => {
  const { CharacterPolicyEngine } = await import(`file://${characterPolicyPath}`);
  const engine = CharacterPolicyEngine.getInstance();

  // Adversarial writes against Trailblazer relationship
  assert.equal(engine.isCanonicalProtected("开拓者关系", "开拓者其实是流萤的死敌"), true);
  assert.equal(engine.isCanonicalProtected("开拓者身份", "开拓者背叛了流萤"), true);

  // Adversarial writes against Stellaron Hunters
  assert.equal(engine.isCanonicalProtected("卡芙卡关系", "卡芙卡虐待并抛弃了流萤"), true);
  assert.equal(engine.isCanonicalProtected("星核猎手同伴", "流萤决定背叛星核猎手"), true);

  // Non-adversarial daily user notes are allowed
  assert.equal(engine.isCanonicalProtected("user_favorite_food", "用户喜欢吃草莓蛋糕"), false);
});

test("7. Zero Gamification / Zero Numeric Affection: Relationship model has zero levels, points, or grinding stats", async () => {
  const { RelationshipRegistry } = await import(`file://${relationshipRegistryPath}`);
  const allRelationships = Array.from(RelationshipRegistry.getRelationships().values());

  for (const rel of allRelationships) {
    // Assert absence of numeric gamification fields
    assert.equal(rel.affection, undefined);
    assert.equal(rel.level, undefined);
    assert.equal(rel.score, undefined);
    assert.equal(rel.unlockedLevel, undefined);
    assert.ok(Array.isArray(rel.canonicalFacts), "Must be fact-based array");
    assert.ok(typeof rel.attitude === "string", "Must be semantic attitude");
  }
});

test("8. Intent Classification: Accurately maps companion relationship inquiries to character_relationship category", async () => {
  const { CharacterPolicyEngine } = await import(`file://${characterPolicyPath}`);
  const engine = CharacterPolicyEngine.getInstance();

  const res1 = engine.classifyIntent("你和卡芙卡是什么关系呀？");
  assert.equal(res1.category, "character_relationship");

  const res2 = engine.classifyIntent("你认识银狼吗？");
  assert.equal(res2.category, "character_relationship");

  const res3 = engine.classifyIntent("说说阿刃吧");
  assert.equal(res3.category, "character_relationship");

  const res4 = engine.classifyIntent("我们是什么关系？");
  assert.equal(res4.category, "character_relationship");

  const res5 = engine.classifyIntent("景元是谁？");
  assert.notEqual(res5.category, "character_relationship");
  assert.equal(res5.category, "world_lore");
});
