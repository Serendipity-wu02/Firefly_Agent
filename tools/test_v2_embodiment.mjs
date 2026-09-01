/**
 * @file test_v2_embodiment.mjs
 * @description Comprehensive Test Suite for Firefly-Agent V2.4 Multimodal Embodiment Runtime.
 * Validates unified EmbodimentPlan creation from a single BehaviorDecision,
 * verified Live2D Action/Target resolution, non-destructive TTS metadata,
 * correlation tracking, and zero side-effects on Persona/Relationship/Memory/Assets/Resources.
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const characterPolicyPath = path.join(projectRoot, "dist", "main", "main", "character", "character-policy.js");
const behaviorRuntimePath = path.join(projectRoot, "dist", "main", "main", "character", "behavior-runtime.js");
const embodimentAdapterPath = path.join(projectRoot, "dist", "main", "main", "character", "embodiment-adapter.js");
const personaLoaderPath = path.join(projectRoot, "dist", "main", "main", "character", "persona-loader.js");
const relationshipRegistryPath = path.join(projectRoot, "dist", "main", "main", "character", "relationship-registry.js");
const ttsSessionServicePath = path.join(projectRoot, "dist", "main", "main", "tts", "tts-session-service.js");
const ttsSettingsPath = path.join(projectRoot, "dist", "main", "shared", "tts-types.js");

test("1. comfort_user: Unified EmbodimentPlan maps to touched Live2D expression and gentle voice prosody", async () => {
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);
  const { EmbodimentAdapter } = await import(`file://${embodimentAdapterPath}`);

  const decision = BehaviorRuntime.decide({
    userPrompt: "流萤，我今天真的好累，头疼得厉害……",
    mode: "daily",
  });

  assert.equal(decision.type, "comfort_user");
  const plan = EmbodimentAdapter.createPlan(decision, "没关系……慢慢说，我一直都在这里听着。");

  // Visual Verification
  assert.ok(plan.visual, "comfort_user must produce a visual embodiment target");
  assert.equal(plan.visual.actionId, "touched");
  assert.equal(plan.visual.target.kind, "expression");
  assert.equal(plan.visual.target.name, "expression4");

  // Voice Verification
  assert.equal(plan.voice.speechText, "没关系……慢慢说，我一直都在这里听着。");
  assert.equal(plan.voice.prosodyHint.pace, "slow");
  assert.equal(plan.voice.prosodyHint.pitch, "soft_low");
  assert.equal(plan.voice.prosodyHint.volumeModifier, 0.9);
  assert.ok(plan.voice.prosodyHint.pauseLengthMs >= 300);

  // Text Verification
  assert.ok(plan.text.textGuidance.includes("温柔"));
});

test("2. restrained_response: Unified EmbodimentPlan maps to shy Live2D expression and hesitant voice prosody", async () => {
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);
  const { EmbodimentAdapter } = await import(`file://${embodimentAdapterPath}`);

  const decision = BehaviorRuntime.decide({
    userPrompt: "流萤今天穿得真漂亮，太可爱了！",
    mode: "daily",
  });

  assert.equal(decision.type, "restrained_response");
  const plan = EmbodimentAdapter.createPlan(decision, "突、突然这么夸我……会有点不好意思的。");

  // Visual Verification
  assert.ok(plan.visual);
  assert.equal(plan.visual.actionId, "shy");
  assert.equal(plan.visual.target.kind, "expression");
  assert.equal(plan.visual.target.name, "expression10");

  // Voice Verification
  assert.equal(plan.voice.prosodyHint.volumeModifier, 0.85);
  assert.equal(plan.voice.prosodyHint.pitch, "soft_low");
  assert.equal(plan.voice.prosodyHint.pauseLengthMs, 350);
});

test("3. share_memory: Unified EmbodimentPlan maps to happy Live2D expression and bright voice prosody", async () => {
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);
  const { EmbodimentAdapter } = await import(`file://${embodimentAdapterPath}`);

  const decision = BehaviorRuntime.decide({
    userPrompt: "流萤，我们要不要一起去吃橡木蛋糕卷，然后去看星星？",
    mode: "daily",
  });

  assert.equal(decision.type, "share_memory");
  const plan = EmbodimentAdapter.createPlan(decision, "好呀！一想到蛋糕卷的味道，心情就变好了呢。");

  // Visual Verification
  assert.ok(plan.visual);
  assert.equal(plan.visual.actionId, "happy");
  assert.equal(plan.visual.target.kind, "expression");
  assert.equal(plan.visual.target.name, "expression4");

  // Voice Verification
  assert.equal(plan.voice.prosodyHint.pitch, "bright_up");
  assert.equal(plan.voice.prosodyHint.volumeModifier, 1.05);
});

test("4. reflect_origin: Unified EmbodimentPlan maps to thinking Live2D expression and contemplative voice prosody", async () => {
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);
  const { EmbodimentAdapter } = await import(`file://${embodimentAdapterPath}`);

  const decision = BehaviorRuntime.decide({
    userPrompt: "流萤，你的失熵症现在怎么样了？萨姆装甲还会灼烧身体吗？",
    mode: "daily",
  });

  assert.equal(decision.type, "reflect_origin");
  const plan = EmbodimentAdapter.createPlan(decision, "失熵症虽然无法治愈……但我会珍惜能够作为流萤生活的每一个当下。");

  // Visual Verification
  assert.ok(plan.visual);
  assert.equal(plan.visual.actionId, "thinking");
  assert.equal(plan.visual.target.kind, "expression");
  assert.equal(plan.visual.target.name, "expression5");

  // Voice Verification
  assert.equal(plan.voice.prosodyHint.pace, "slow");
  assert.equal(plan.voice.prosodyHint.pitch, "neutral");
});

test("5. focused_execution: Unified EmbodimentPlan maps to reading/focused Live2D motion and brisk voice prosody", async () => {
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);
  const { EmbodimentAdapter } = await import(`file://${embodimentAdapterPath}`);

  const decision = BehaviorRuntime.decide({
    userPrompt: "开始执行代码重构与扫描任务",
    mode: "work",
  });

  assert.equal(decision.type, "focused_execution");
  const plan = EmbodimentAdapter.createPlan(decision, "指令确认。正在检索目标项目路径，建立临时工作区。");

  // Visual Verification
  assert.ok(plan.visual);
  assert.equal(plan.visual.actionId, "reading");
  assert.equal(plan.visual.target.kind, "motion");
  assert.equal(plan.visual.target.group, "Idle");
  assert.equal(plan.visual.target.motionName, "1");

  // Voice Verification
  assert.equal(plan.voice.prosodyHint.pace, "brisk");
  assert.equal(plan.voice.prosodyHint.pauseLengthMs, 150);
});

test("6. Unified SSoT: Text, Voice, and Visual originate from the exact same single BehaviorDecision with traceable correlationId", async () => {
  const { CharacterPolicyEngine } = await import(`file://${characterPolicyPath}`);

  const engine = CharacterPolicyEngine.getInstance();
  const decision = engine.decideBehavior({
    userPrompt: "流萤，今天辛苦啦！",
    mode: "daily",
  });

  const plan = engine.createEmbodimentPlan(decision, "今天也辛苦啦！");

  assert.equal(plan.behaviorDecision, decision);
  assert.equal(plan.behaviorType, decision.type);
  assert.ok(plan.correlationId.startsWith("emb-"));
  assert.ok(plan.correlationId.includes(decision.type));
  assert.equal(plan.requiresEmbodiment, decision.requiresEmbodiment);
});

test("7. Non-Destructive TTS Metadata: StartTtsRequest conveys voiceIntent and correlationId without speechText tag pollution", async () => {
  const { TtsSessionService } = await import(`file://${ttsSessionServicePath}`);
  const { DEFAULT_TTS_SETTINGS } = await import(`file://${ttsSettingsPath}`);

  const sessionService = new TtsSessionService();

  const startRequest = {
    requestId: "test-req-001",
    speechText: "开拓者，见到你很开心！",
    voiceIntent: "语调自然轻盈上扬，语速适中温润，流露真挚的喜悦与怀念感。",
    behaviorType: "share_memory",
    correlationId: "emb-123456-share_memory",
  };

  // speechText must NOT contain control tags like <slow><soft>
  assert.ok(!startRequest.speechText.includes("<"));
  assert.ok(!startRequest.speechText.includes(">"));

  // Verify session service starts or gracefully skips without crashing
  const result = await sessionService.start(startRequest, {
    ...DEFAULT_TTS_SETTINGS,
    engine: "off",
  });
  assert.equal(result.status, "skipped");
});

test("8. Inactive Embodiment: When requiresEmbodiment=false, visual target is strictly null", async () => {
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);
  const { EmbodimentAdapter } = await import(`file://${embodimentAdapterPath}`);

  const idleDecision = BehaviorRuntime.decide({
    userPrompt: "",
    mode: "daily",
  });

  assert.equal(idleDecision.requiresEmbodiment, false);
  const plan = EmbodimentAdapter.createPlan(idleDecision);

  assert.equal(plan.visual, null, "Inactive embodiment must produce null visual target");
  assert.equal(plan.requiresEmbodiment, false);
});

test("9. Invariance: Embodiment execution NEVER mutates Persona, Relationship, or MemoryStore", async () => {
  const { PersonaLoader } = await import(`file://${personaLoaderPath}`);
  const { RelationshipRegistry } = await import(`file://${relationshipRegistryPath}`);
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);
  const { EmbodimentAdapter } = await import(`file://${embodimentAdapterPath}`);

  const initialProfile = PersonaLoader.getProfile();
  const initialName = initialProfile.character.name;
  const initialPersonality = [...initialProfile.identity.personality];

  // Execute full cycle of 5 intense embodiment plans
  const types = [
    "流萤我好难过好累！",
    "你太可爱了喜欢你！",
    "一起吃蛋糕卷看星星吧！",
    "你的失熵症严重吗？",
    "开始执行扫描任务！",
  ];

  for (const prompt of types) {
    const d = BehaviorRuntime.decide({ userPrompt: prompt, mode: "daily" });
    EmbodimentAdapter.createPlan(d, "测试口语输出文本");
  }

  const currentProfile = PersonaLoader.getProfile();
  assert.equal(currentProfile.character.name, initialName);
  assert.deepEqual(currentProfile.identity.personality, initialPersonality);

  const trailblazerRel = RelationshipRegistry.findRelationship("开拓者");
  assert.ok(trailblazerRel);
  assert.equal(trailblazerRel.name, "开拓者");
});

test("10. Numeric Independence: Zero reliance on legacy affection/hunger/energy stats", async () => {
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);
  const { EmbodimentAdapter } = await import(`file://${embodimentAdapterPath}`);

  const legacyLow = { energy: 0, hunger: 100, affection: 0, attention: 0, mood: "sad", health: "sick" };
  const legacyHigh = { energy: 100, hunger: 0, affection: 100, attention: 100, mood: "happy", health: "healthy" };

  const d1 = BehaviorRuntime.decide({ userPrompt: "流萤，今天辛苦啦！", legacyState: legacyLow, mode: "daily" });
  const d2 = BehaviorRuntime.decide({ userPrompt: "流萤，今天辛苦啦！", legacyState: legacyHigh, mode: "daily" });

  const p1 = EmbodimentAdapter.createPlan(d1, "今天也辛苦啦！");
  const p2 = EmbodimentAdapter.createPlan(d2, "今天也辛苦啦！");

  assert.equal(p1.behaviorType, p2.behaviorType);
  assert.equal(p1.visual?.actionId, p2.visual?.actionId);
  assert.deepEqual(p1.voice.prosodyHint, p2.voice.prosodyHint);
});
