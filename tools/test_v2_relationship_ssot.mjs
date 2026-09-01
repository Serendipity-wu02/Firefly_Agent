/**
 * @file test_v2_relationship_ssot.mjs
 * @description Validates that resources/knowledge/facts.yaml and curated cards are the STRICT Single Source of Truth
 * for Character Relationships. Tests dynamic synchronization of Canonical Facts -> RelationshipLoader -> Registry -> Policy.
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
const projectRoot = path.resolve(__dirname, "..");

const relationshipLoaderPath = path.join(projectRoot, "dist", "main", "main", "character", "relationship-loader.js");
const relationshipRegistryPath = path.join(projectRoot, "dist", "main", "main", "character", "relationship-registry.js");
const characterPolicyPath = path.join(projectRoot, "dist", "main", "main", "character", "character-policy.js");
const systemPromptBuilderPath = path.join(projectRoot, "dist", "main", "main", "agent", "context", "system-prompt-builder.js");

test("1. Production Canonical Loading: Relationships are dynamically derived from resources/knowledge/facts.yaml", async () => {
  const { RelationshipLoader } = await import(`file://${relationshipLoaderPath}`);
  const { RelationshipRegistry } = await import(`file://${relationshipRegistryPath}`);

  const map = RelationshipRegistry.reload(projectRoot);
  assert.ok(map.size > 0, "Must load relationship entities from resources");

  const rawYaml = yaml.load(fs.readFileSync(path.join(projectRoot, "resources", "knowledge", "facts.yaml"), "utf-8"));
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

test("2. Dynamic SSoT Synchronization: Modifying facts.yaml dynamically changes Relationship Runtime and System Prompt", async () => {
  const { RelationshipRegistry } = await import(`file://${relationshipRegistryPath}`);
  const { CharacterPolicyEngine } = await import(`file://${characterPolicyPath}`);
  const { SystemPromptBuilder } = await import(`file://${systemPromptBuilderPath}`);

  // Create temporary isolated resources fixture directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-rel-ssot-"));
  const tempKnowledgeDir = path.join(tempDir, "resources", "knowledge");
  fs.mkdirSync(tempKnowledgeDir, { recursive: true });

  const customFacts = [
    {
      entity: "开拓者",
      scene: "测试星域",
      source: "亲历",
      fact: "在测试星域ALPHA-999与开拓者共同完成了量子共振仪式，这是动态测试事实。",
      keywords: "开拓者 测试 量子共振",
      verified_against: "test_lore.md",
    },
    {
      entity: "卡芙卡",
      scene: null,
      source: "亲历",
      fact: "卡芙卡在动态测试废墟中传授了高维弦理论战术。",
      keywords: "卡芙卡 战术",
      verified_against: "test_lore.md",
    },
  ];

  fs.writeFileSync(path.join(tempKnowledgeDir, "facts.yaml"), yaml.dump(customFacts), "utf-8");

  try {
    // 1. Reload RelationshipRegistry with custom tempDir
    const customMap = RelationshipRegistry.reload(tempDir);
    const customTrailblazer = customMap.get("trailblazer");

    assert.ok(customTrailblazer);
    assert.ok(
      customTrailblazer.canonicalFacts.some((f) => f.includes("ALPHA-999") && f.includes("量子共振仪式")),
      "Must dynamically reflect the custom facts.yaml content without dual-source lag",
    );

    const customKafka = customMap.get("kafka");
    assert.ok(customKafka);
    assert.ok(
      customKafka.canonicalFacts.some((f) => f.includes("高维弦理论战术")),
      "Must dynamically reflect Kafka's updated fact from facts.yaml",
    );

    // 2. Verify System Prompt incorporates the dynamic relationship model
    const engine = CharacterPolicyEngine.getInstance();
    const prompt = engine.buildSystemPrompt();
    assert.ok(prompt.includes("【核心人际关系与同伴认知 (Canonical Relationships)】"));
    assert.ok(prompt.includes("开拓者 (核心羁绊)"));
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
});

test("3. Addressing & Attitude Consistency: Strictly conforms to canonical naming conventions", async () => {
  const { RelationshipRegistry } = await import(`file://${relationshipRegistryPath}`);
  const pomPom = RelationshipRegistry.findRelationship("帕姆");
  assert.equal(pomPom.addressing, "「帕姆」列车长");

  const robin = RelationshipRegistry.findRelationship("知更鸟");
  assert.equal(robin.addressing, "「知更鸟」小姐");

  const gallagher = RelationshipRegistry.findRelationship("加拉赫");
  assert.equal(gallagher.addressing, "「加拉赫」先生");

  const jade = RelationshipRegistry.findRelationship("翡翠");
  assert.equal(jade.addressing, "「翡翠」女士");
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
