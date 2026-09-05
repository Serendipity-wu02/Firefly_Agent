/**
 * @file persona-ssot.test.mjs
 * @description Validates that resources/persona/firefly.yaml is the STRICT Single Source of Truth for all Persona facts.
 * Tests dynamic synchronization of YAML -> PersonaLoader -> PersonaProfile -> CharacterPolicy -> SystemPrompt.
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

const personaLoaderPath = path.join(projectRoot, "dist", "main", "main", "character", "persona-loader.js");
const characterPolicyPath = path.join(projectRoot, "dist", "main", "main", "character", "character-policy.js");
const systemPromptBuilderPath = path.join(projectRoot, "dist", "main", "main", "orchestrator", "context", "system-prompt-builder.js");

test("1. Production Canonical Loading: PersonaProfile strictly mirrors production firefly.yaml without fabrication", async () => {
  const { PersonaLoader } = await import(`file://${personaLoaderPath}`);
  const profile = PersonaLoader.reloadProfile(projectRoot);

  const yamlPath = PersonaLoader.resolveYamlPath(projectRoot);
  const rawYaml = yaml.load(fs.readFileSync(yamlPath, "utf-8"));

  assert.equal(profile.character.name, rawYaml.character.name);
  assert.equal(profile.character.nameEn, rawYaml.character.name_en);
  assert.equal(profile.character.identity, rawYaml.character.identity);
  assert.equal(profile.identity.background.trim(), rawYaml.identity.background.trim());
  assert.deepEqual(profile.identity.personality, rawYaml.identity.personality);
  assert.deepEqual(profile.identity.likes, rawYaml.identity.likes);
  assert.deepEqual(profile.identity.fears, rawYaml.identity.fears);
  assert.deepEqual(profile.vocabulary.forbidden, rawYaml.vocabulary.forbidden);
  assert.deepEqual(profile.vocabulary.speakingHabits, rawYaml.vocabulary.speaking_habits);
});

test("2. Dynamic Single Source of Truth Synchronization: Changing YAML dynamically alters Prompt and Policies", async () => {
  const { PersonaLoader } = await import(`file://${personaLoaderPath}`);
  const { CharacterPolicyEngine } = await import(`file://${characterPolicyPath}`);
  const { SystemPromptBuilder } = await import(`file://${systemPromptBuilderPath}`);

  // Create an isolated temporary fixture directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-ssot-test-"));
  const tempResourcesDir = path.join(tempDir, "src", "main", "character", "resources");
  fs.mkdirSync(tempResourcesDir, { recursive: true });

  const customYamlData = {
    character: {
      name: "萤火试验机",
      name_en: "FireflyTestUnit",
      source: "崩坏：测试宇宙",
      identity: "巡海游侠测试特战员",
    },
    identity: {
      background: "这是从动态测试YAML加载的身份背景，编号 TEST-UNIT-77777。\n绝不包含任何硬编码默认值。",
      personality: [
        "测试特质A：永远满怀热忱",
        "测试特质B：对一切充满好奇",
      ],
      likes: ["星空爆米花", "量子奶茶"],
      fears: ["断网", "数据库崩溃"],
    },
    vocabulary: {
      preferred: ["我", "游侠伙伴"],
      forbidden: ["测试禁忌词_X", "测试违禁词_Y"],
      speaking_habits: [
        "说话末尾常常带着欢快的语气词「喵」",
        "喜欢用疑问句鼓励对方",
      ],
      output_rules: [
        "必须完全输出口语对话",
        "严禁任何剧本括号",
      ],
    },
    daily_mode: {
      theme: { primary_color: "#112233", accent_color: "#445566", background: "test_bg", bubble_style: "test_bubble", particle_effect: "test_particles" },
      tone: { description: "极度活泼", characteristics: ["语速极快"], example: "你好喵！" },
      emotion_rules: {},
      proactive_care: true,
      hud_visible: false,
      think_visible: false,
    },
    work_mode: {
      theme: { primary_color: "#000", accent_color: "#111", background: "grid", bubble_style: "angular", font: "mono", transition_effect: "glitch" },
      tone: { description: "测试工作态", characteristics: [] },
      sub_tones: { execution: {}, warning: {}, completion: {} },
      proactive_care: false,
      hud_visible: true,
      think_visible: true,
    },
    authors_note: { daily: "测试作者注释", daily_unlocked: "", work: "" },
    transition_lines: { to_work: "", to_daily: "" },
    guardrails: {
      anti_ooc: ["绝不扮演其他任何测试角色"],
      role_boundary: ["始终坚守游侠测试员身份"],
      decision_priority: ["第一优先级：守护测试伙伴"],
    },
    capabilities: {
      self_intro: "测试自我介绍",
      rules: ["遵循测试资料规则"],
    },
    memory_rules: { rules: [], confidence_threshold: 0.85, namespaces: {} },
    proactive_chat: { emotion_detect: "", concern_follow_up: "", idle_casual: "" },
  };

  const tempPersonaDir = path.join(tempResourcesDir, "persona");
  fs.mkdirSync(tempPersonaDir, { recursive: true });
  const customYamlFile = path.join(tempPersonaDir, "firefly.yaml");
  fs.writeFileSync(customYamlFile, yaml.dump(customYamlData), "utf-8");

  try {
    // 1. Reload Profile with custom temp directory
    const customProfile = PersonaLoader.reloadProfile(tempDir);

    // Verify Loader reads exactly what was written
    assert.equal(customProfile.character.name, "萤火试验机");
    assert.equal(customProfile.character.nameEn, "FireflyTestUnit");
    assert.ok(customProfile.identity.background.includes("TEST-UNIT-77777"));
    assert.equal(customProfile.identity.personality[0], "测试特质A：永远满怀热忱");

    // 2. Verify SystemPromptBuilder projects the custom YAML facts without any hardcoded fallback contamination
    const customPrompt = SystemPromptBuilder.build();
    assert.ok(customPrompt.includes("少女「萤火试验机」"), "Prompt must reflect new character name");
    assert.ok(customPrompt.includes("TEST-UNIT-77777"), "Prompt must reflect new background");
    assert.ok(customPrompt.includes("测试特质A：永远满怀热忱"), "Prompt must reflect new personality");
    assert.ok(customPrompt.includes("测试禁忌词_X"), "Prompt must reflect new forbidden list");
    assert.ok(customPrompt.includes("说话末尾常常带着欢快的语气词「喵」"), "Prompt must reflect new speaking habits");
    assert.ok(customPrompt.includes("绝不扮演其他任何测试角色"), "Prompt must reflect new guardrails");

    // 3. Verify Utterance Validation dynamically updates with new forbidden terms
    const engine = CharacterPolicyEngine.getInstance();
    const violationCheck = engine.validateUtterance("这是一句包含测试禁忌词_X的语句");
    assert.equal(violationCheck.isValid, false);
    assert.ok(violationCheck.violations.some((v) => v.includes("测试禁忌词_X")));

    const cleanCheck = engine.validateUtterance("这是一句完全合规的测试语句喵");
    assert.equal(cleanCheck.isValid, true);

    // 4. Verify Canonical Identity Guard dynamically protects the new identity
    assert.equal(engine.isCanonicalProtected("萤火试验机身份"), true);
    assert.equal(engine.isCanonicalProtected("巡海游侠测试特战员"), true);
  } finally {
    // Clean up temporary fixture directory completely
    fs.rmSync(tempDir, { recursive: true, force: true });
    // Restore production singleton
    PersonaLoader.reloadProfile(projectRoot);
  }

  // Confirm production profile is restored cleanly
  const restoredProfile = PersonaLoader.getProfile();
  assert.equal(restoredProfile.character.name, "流萤");
  assert.ok(restoredProfile.identity.background.includes("AR-26710"));
});
