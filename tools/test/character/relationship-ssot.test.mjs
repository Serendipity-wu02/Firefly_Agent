/**
 * @file relationship-ssot.test.mjs
 * @description Validates that resources/knowledge/facts.yaml and curated cards are the STRICT Single Source of Truth
 * for Character Relationships. Tests dynamic synchronization, deletion transparency (zero fallback prose),
 * and complete absence of hardcoded prose in Registry or Loader.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");

const relationshipLoaderPath = path.join(projectRoot, "dist", "main", "main", "character", "relationship-loader.js");
const relationshipRegistryPath = path.join(projectRoot, "dist", "main", "main", "character", "relationship-registry.js");
const characterPolicyPath = path.join(projectRoot, "dist", "main", "main", "character", "character-policy.js");
const systemPromptBuilderPath = path.join(projectRoot, "dist", "main", "main", "agent", "context", "system-prompt-builder.js");

test("1. Production Canonical Loading: Relationships are dynamically loaded from resources/knowledge/facts.yaml", async () => {
  const { RelationshipRegistry } = await import(`file://${relationshipRegistryPath}`);

  const map = RelationshipRegistry.reload(projectRoot);
  assert.ok(map.size > 0, "Must load relationship entities from resources");

  const rawYaml = yaml.load(fs.readFileSync(path.join(projectRoot, "src", "main", "character", "resources", "knowledge", "facts.yaml"), "utf-8"));
  const rawFactsList = Array.isArray(rawYaml) ? rawYaml : Array.isArray(rawYaml.facts) ? rawYaml.facts : Object.values(rawYaml).flat();
  const trailblazerRawFacts = rawFactsList.filter((f) => f && f.entity === "开拓者").map((f) => f.fact.trim());

  const trailblazer = RelationshipRegistry.findRelationship("开拓者", projectRoot);
  assert.ok(trailblazer);

  for (const rawFact of trailblazerRawFacts) {
    assert.ok(
      trailblazer.canonicalFacts.some((f) => f.includes(rawFact) || rawFact.includes(f)),
      `Canonical facts must contain facts.yaml entry: "${rawFact.slice(0, 20)}..."`,
    );
  }
});

test("2. Dynamic SSoT Synchronization & Deletion Transparency: Modifying facts changes Runtime, deleting facts leaves 0 fallback", async () => {
  const { RelationshipRegistry } = await import(`file://${relationshipRegistryPath}`);
  const { CharacterPolicyEngine } = await import(`file://${characterPolicyPath}`);

  // Create isolated temporary resources fixture directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-rel-ssot-"));
  const tempKnowledgeDir = path.join(tempDir, "src", "main", "character", "resources", "knowledge");
  const tempCardsDir = path.join(tempKnowledgeDir, "curated_cards");
  fs.mkdirSync(tempCardsDir, { recursive: true });

  // Custom facts containing ONLY Trailblazer with custom fact, Kafka completely deleted
  const customFacts = [
    {
      entity: "开拓者",
      scene: "测试星域",
      source: "亲历",
      fact: "在动态测试星域ALPHA-999与开拓者共同完成了量子共振仪式。",
      keywords: "开拓者 测试 量子共振",
      verified_against: "test_lore.md",
    },
  ];

  fs.writeFileSync(path.join(tempKnowledgeDir, "facts.yaml"), yaml.dump(customFacts), "utf-8");

  // Create a curated card
  const customCardContent = `触发: 开拓者|共鸣\n## 测试卡片\n在量子星域中与开拓者达成了深度共振。`;
  fs.writeFileSync(path.join(tempCardsDir, "开拓者共鸣.md"), customCardContent, "utf-8");

  try {
    // 1. Reload with tempDir
    const customMap = RelationshipRegistry.reload(tempDir);
    const customTb = customMap.get("trailblazer");

    assert.ok(customTb, "Trailblazer entity must exist in custom map");
    assert.equal(customTb.canonicalFacts.length, 1);
    assert.ok(customTb.canonicalFacts[0].includes("ALPHA-999"));
    assert.ok(customTb.evidenceSources.some((s) => s.includes("开拓者共鸣.md")));

    // 2. Deletion Transparency: Kafka is absent from custom facts.yaml, so Kafka MUST NOT exist in customMap
    const customKafka = customMap.get("kafka");
    assert.equal(customKafka, undefined, "Kafka was deleted in facts.yaml, so Loader MUST NOT fabricate a fallback Kafka fact!");

    // 3. Verify Prompt reflects the dynamic change
    const engine = CharacterPolicyEngine.getInstance();
    const prompt = engine.buildSystemPrompt();
    assert.ok(prompt.includes("ALPHA-999"), "Prompt must reflect new dynamic fact");
    assert.ok(!prompt.includes("格拉默废墟中唤醒"), "Deleted Kafka fact must not appear in prompt");
  } finally {
    // Cleanup temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
    // Restore production relationships
    RelationshipRegistry.reload(projectRoot);
  }

  // Verify production facts are cleanly restored
  const restoredTb = RelationshipRegistry.findRelationship("开拓者", projectRoot);
  assert.ok(restoredTb);
  assert.ok(restoredTb.canonicalFacts.some((f) => f.includes("一日导游") || f.includes("秘密基地")));

  const restoredKafka = RelationshipRegistry.findRelationship("卡芙卡", projectRoot);
  assert.ok(restoredKafka);
});

test("3. Zero Prose Hardcoding in Source: Relationship Registry & Loader contain zero static relationship facts", async () => {
  const loaderSrc = fs.readFileSync(path.join(projectRoot, "src", "main", "character", "relationship-loader.ts"), "utf-8");
  const registrySrc = fs.readFileSync(path.join(projectRoot, "src", "main", "character", "relationship-registry.ts"), "utf-8");

  // Verify absence of forbidden static constructs
  assert.ok(!loaderSrc.includes("ENTITY_CONFIG_MAP"), "Loader must not contain ENTITY_CONFIG_MAP");
  assert.ok(!loaderSrc.includes("attitudeSummary"), "Loader must not contain attitudeSummary");
  assert.ok(!registrySrc.includes("CANONICAL_RELATIONSHIPS"), "Registry must not contain static CANONICAL_RELATIONSHIPS");
  assert.ok(!registrySrc.includes("黄泉（自灭者，知晓萨姆真相）"), "Registry must not hardcode relationship prose");
  assert.ok(!registrySrc.includes("加拉赫（解围的靠谱长辈）"), "Registry must not hardcode relationship prose");
});

test("4. Unknown Character Non-Sentimentalization: External figures are strictly marked isKnown = false", async () => {
  const { RelationshipRegistry } = await import(`file://${relationshipRegistryPath}`);

  const unknownFigures = ["景元", "希露瓦", "托帕", "翁法罗斯", "阿格莱雅", "白厄"];
  for (const figure of unknownFigures) {
    const res = RelationshipRegistry.queryRelationshipPerspective(figure);
    assert.equal(res.isKnown, false, `Figure ${figure} must NOT be automatically sentimentalized`);
    assert.ok(res.perspectiveGuidance.includes("没有直接交集或当时不在场"));
  }
});

test("5. Memory Protection: Blocks memory proposals that attempt to rewrite canonical relationships", async () => {
  const { CharacterPolicyEngine } = await import(`file://${characterPolicyPath}`);
  const engine = CharacterPolicyEngine.getInstance();

  assert.equal(engine.isCanonicalProtected("开拓者关系", "开拓者其实是假面愚者的间谍"), true);
  assert.equal(engine.isCanonicalProtected("卡芙卡关系", "卡芙卡是流萤的仇人"), true);
  assert.equal(engine.isCanonicalProtected("银狼关系", "银狼黑掉了流萤的萨姆装甲并背叛"), true);

  // Daily benign user fact is permitted
  assert.equal(engine.isCanonicalProtected("user_favorite_drink", "用户喜欢喝乌龙茶"), false);
});

test("6. Non-Gamification Verification: Zero numerical affection, progression, or level stats", async () => {
  const { RelationshipRegistry } = await import(`file://${relationshipRegistryPath}`);
  const allRels = Array.from(RelationshipRegistry.getRelationships().values());

  for (const rel of allRels) {
    assert.equal(rel.affection, undefined);
    assert.equal(rel.level, undefined);
    assert.equal(rel.score, undefined);
    assert.equal(rel.unlocked, undefined);
  }
});
