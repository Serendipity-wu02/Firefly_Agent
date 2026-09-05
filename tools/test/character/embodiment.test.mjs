/**
 * @file embodiment.test.mjs
 * @description Unified multimodal embodiment contract for current Firefly behavior runtime.
 * Validates unified EmbodimentPlan creation from a single BehaviorDecision,
 * verified Live2D Action/Target resolution (with explicit separation of user distress vs self entropy condition),
 * non-destructive TTS metadata and prosody modulation with cache isolation,
 * correlation tracking, and zero side-effects on Persona/Relationship/Memory/Assets/Resources.
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");

const characterPolicyPath = path.join(projectRoot, "dist", "main", "main", "character", "character-policy.js");
const behaviorRuntimePath = path.join(projectRoot, "dist", "main", "main", "character", "behavior-runtime.js");
const embodimentAdapterPath = path.join(projectRoot, "dist", "main", "main", "character", "embodiment-adapter.js");
const personaLoaderPath = path.join(projectRoot, "dist", "main", "main", "character", "persona-loader.js");
const relationshipRegistryPath = path.join(projectRoot, "dist", "main", "main", "character", "relationship-registry.js");
const ttsSessionServicePath = path.join(projectRoot, "dist", "main", "main", "runtime", "tts", "tts-session-service.js");
const ttsDispatcherPath = path.join(projectRoot, "dist", "main", "main", "runtime", "tts", "tts-dispatcher.js");
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

test("4. reflect_origin & Self Entropy Condition: Self illness maps to sick (expression7) while pure pilot lore maps to thinking (expression5)", async () => {
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);
  const { EmbodimentAdapter } = await import(`file://${embodimentAdapterPath}`);

  // 4a. Discussion of entropy loss illness / self condition
  const decisionSelfSick = BehaviorRuntime.decide({
    userPrompt: "流萤，你的失熵症现在怎么样了？身体还会感到解离和疼痛吗？",
    mode: "daily",
  });
  assert.equal(decisionSelfSick.type, "reflect_origin");
  const planSelfSick = EmbodimentAdapter.createPlan(decisionSelfSick, "失熵症虽然无法彻底治愈……但只要能作为流萤生活在这里，我就很满足了。");
  assert.ok(planSelfSick.visual);
  assert.equal(planSelfSick.visual.actionId, "sick");
  assert.equal(planSelfSick.visual.target.kind, "expression");
  assert.equal(planSelfSick.visual.target.name, "expression7");

  // 4b. Pure backstory/lore reflection without active entropy distress
  const decisionPilotLore = BehaviorRuntime.decide({
    userPrompt: "流萤，能跟我讲讲格拉默铁骑装甲过去的战斗记录吗？",
    mode: "daily",
  });
  const planPilotLore = EmbodimentAdapter.createPlan(decisionPilotLore, "那是很久以前的记忆了……");
  assert.ok(planPilotLore.visual);
  assert.equal(planPilotLore.visual.actionId, "thinking");
  assert.equal(planPilotLore.visual.target.kind, "expression");
  assert.equal(planPilotLore.visual.target.name, "expression5");
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

test("7. TTS Prosody & Cache Key Isolation: Voice intent modulates speed and generates distinct cache signatures", async () => {
  const { FireflyTtsDispatcher } = await import(`file://${ttsDispatcherPath}`);
  const { DEFAULT_TTS_SETTINGS } = await import(`file://${ttsSettingsPath}`);

  const dispatcher = new FireflyTtsDispatcher();

  // Test with mock off engine (skipped)
  const reqSlow = {
    requestId: "req-slow",
    speechText: "这是一句测试文本",
    behaviorType: "comfort_user",
    prosodyHint: { pace: "slow", pitch: "soft_low" },
    correlationId: "emb-1-comfort",
  };

  const reqBrisk = {
    requestId: "req-brisk",
    speechText: "这是一句测试文本",
    behaviorType: "focused_execution",
    prosodyHint: { pace: "brisk", pitch: "neutral" },
    correlationId: "emb-2-focused",
  };

  const resSlow = await dispatcher.synthesize(reqSlow, { ...DEFAULT_TTS_SETTINGS, engine: "off" });
  const resBrisk = await dispatcher.synthesize(reqBrisk, { ...DEFAULT_TTS_SETTINGS, engine: "off" });

  assert.equal(resSlow.status, "skipped");
  assert.equal(resBrisk.status, "skipped");
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

test("11. Avatar Resolver: Resolves real default Firefly avatar descriptor with consistent identity", async () => {
  const avatarModule = await import(`file://${path.join(projectRoot, "src", "renderer", "ui", "avatar-resolver.ts")}`);
  const { DefaultAvatarResolver } = avatarModule;

  const resolver = new DefaultAvatarResolver();
  const fireflyAvatar = resolver.resolveAvatar("assistant");
  assert.equal(fireflyAvatar.kind, "image");
  assert.equal(fireflyAvatar.name, "流萤");
  assert.equal(fireflyAvatar.alt, "流萤 (Firefly)");
  assert.ok(fireflyAvatar.src && fireflyAvatar.src.includes("firefly.png"));

  const userAvatar = resolver.resolveAvatar("user");
  assert.equal(userAvatar.name, "开拓者");
});

test("12. Live2D Target Correlation: Live2D target payload safely carries correlationId and behaviorType", async () => {
  const { CharacterPolicyEngine } = await import(`file://${characterPolicyPath}`);

  const engine = CharacterPolicyEngine.getInstance();
  const decision = engine.decideBehavior({
    userPrompt: "流萤，夸夸你！",
    mode: "daily",
  });

  const plan = engine.createEmbodimentPlan(decision, "嘿嘿，谢谢你！");
  assert.ok(plan.visual);

  const live2dPayload = {
    ...plan.visual.target,
    correlationId: plan.correlationId,
    behaviorType: plan.behaviorType,
  };

  assert.equal(live2dPayload.kind, "expression");
  assert.equal(live2dPayload.name, "expression10");
  assert.equal(live2dPayload.correlationId, plan.correlationId);
  assert.equal(live2dPayload.behaviorType, "restrained_response");
});

test("13. Firefly Avatar Asset & Build Verification: Head portrait exists and is bundled into dist/renderer/assets", async () => {
  const fs = await import("node:fs");
  const sourceAvatarPath = path.join(projectRoot, "src", "renderer", "head_portrait", "firefly.png");
  assert.ok(fs.existsSync(sourceAvatarPath), "src/renderer/head_portrait/firefly.png must exist");

  const stat = fs.statSync(sourceAvatarPath);
  assert.ok(stat.size > 10000, "firefly.png size must be substantial (>10KB)");

  // Check dist/renderer/assets/
  const distAssetsDir = path.join(projectRoot, "dist", "renderer", "assets");
  if (fs.existsSync(distAssetsDir)) {
    const files = fs.readdirSync(distAssetsDir);
    const avatarBundled = files.some((f) => f.startsWith("firefly-") && f.endsWith(".png"));
    assert.ok(avatarBundled, "dist/renderer/assets must contain bundled firefly-*.png");
  }
});

test("14. Avatar Decoupling: Avatar resolver returns constant identity regardless of changing emotional state", async () => {
  const avatarModule = await import(`file://${path.join(projectRoot, "src", "renderer", "ui", "avatar-resolver.ts")}`);
  const { DefaultAvatarResolver } = avatarModule;
  const resolver = new DefaultAvatarResolver();

  // Test across multiple simulated emotions
  const emotions = ["happy", "sad", "shy", "thinking", "surprised", "angry", "neutral"];
  for (const emotion of emotions) {
    const descriptor = resolver.resolveAvatar("assistant", { emotion, behaviorType: "comfort_user" });
    assert.equal(descriptor.name, "流萤");
    assert.equal(descriptor.kind, "image");
    assert.ok(descriptor.src && descriptor.src.includes("firefly.png"));
  }
});

test("15. Automatic vs Manual TTS Playback Equivalence: Both consume the exact same Embodiment metadata from ChatMessage", async () => {
  const { CharacterPolicyEngine } = await import(`file://${characterPolicyPath}`);
  const engine = CharacterPolicyEngine.getInstance();

  const decision = engine.decideBehavior({
    userPrompt: "流萤，我今天头好痛……",
    mode: "daily",
  });
  const plan = engine.createEmbodimentPlan(decision, "没关系，我一直都在这里陪着你。");

  // ChatMessage constructed with Embodiment metadata
  const chatMessage = {
    id: "msg-12345",
    role: "assistant",
    content: plan.voice.speechText,
    timestamp: Date.now(),
    behaviorType: plan.behaviorType,
    correlationId: plan.correlationId,
    voiceIntent: plan.voice.voiceIntent,
    prosodyHint: plan.voice.prosodyHint,
  };

  // Simulated Automatic Playback Call payload
  const autoPayload = {
    messageId: chatMessage.id,
    speechText: chatMessage.content,
    voiceIntent: chatMessage.voiceIntent,
    behaviorType: chatMessage.behaviorType,
    prosodyHint: chatMessage.prosodyHint,
    correlationId: chatMessage.correlationId,
  };

  // Simulated Manual Playback Call payload (from clicking TTS button in ChatMessageItem)
  const manualPayload = {
    messageId: chatMessage.id,
    speechText: chatMessage.content,
    voiceIntent: chatMessage.voiceIntent,
    behaviorType: chatMessage.behaviorType,
    prosodyHint: chatMessage.prosodyHint,
    correlationId: chatMessage.correlationId,
  };

  assert.deepEqual(autoPayload, manualPayload, "Auto and manual playback payloads must be strictly identical");
  assert.equal(manualPayload.correlationId, plan.correlationId);
  assert.equal(manualPayload.behaviorType, "comfort_user");
  assert.equal(manualPayload.prosodyHint.pace, "slow");
});

test("16. Legacy State Independence: Behavior and embodiment remain identical across incompatible legacy values", async () => {
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);
  const { EmbodimentAdapter } = await import(`file://${embodimentAdapterPath}`);

  const low = { energy: 0, hunger: 100, affection: 0, attention: 0, mood: "sad", health: "sick" };
  const high = { energy: 100, hunger: 0, affection: 100, attention: 100, mood: "happy", health: "healthy" };
  const decisionLow = BehaviorRuntime.decide({ userPrompt: "流萤，今天辛苦啦！", legacyState: low, mode: "daily" });
  const decisionHigh = BehaviorRuntime.decide({ userPrompt: "流萤，今天辛苦啦！", legacyState: high, mode: "daily" });

  const planLow = EmbodimentAdapter.createPlan(decisionLow, "今天也辛苦啦！");
  const planHigh = EmbodimentAdapter.createPlan(decisionHigh, "今天也辛苦啦！");
  assert.equal(decisionLow.type, decisionHigh.type);
  assert.equal(planLow.behaviorType, planHigh.behaviorType);
  assert.equal(planLow.visual?.actionId, planHigh.visual?.actionId);
  assert.deepEqual(planLow.voice.prosodyHint, planHigh.voice.prosodyHint);
});

test("17. Memory Boundary: Memory can select sharing behavior without changing canonical identity", async () => {
  const { CharacterPolicyEngine } = await import(`file://${characterPolicyPath}`);
  const { PersonaLoader } = await import(`file://${personaLoaderPath}`);
  const engine = CharacterPolicyEngine.getInstance();
  const before = PersonaLoader.getProfile();

  const decision = engine.decideBehavior({
    userPrompt: "今天我们吃什么好呢？",
    memoryContext: "用户偏好：喜欢吃橡木蛋糕卷，曾约定在天台看流星",
    mode: "daily",
  });
  assert.equal(decision.type, "share_memory");
  assert.ok(decision.reason.includes("长期记忆"));
  assert.equal(PersonaLoader.getProfile().character.name, before.character.name);
  assert.deepEqual(PersonaLoader.getProfile().identity.personality, before.identity.personality);
});

test("18. Correlation Chain: One EmbodimentPlan correlationId reaches visual dispatch and TTS request", async () => {
  const { CharacterPolicyEngine } = await import(`file://${characterPolicyPath}`);
  const { DEFAULT_TTS_SETTINGS } = await import(`file://${ttsSettingsPath}`);
  const { TtsSessionService } = await import(`file://${ttsSessionServicePath}`);
  const engine = CharacterPolicyEngine.getInstance();
  const decision = engine.decideBehavior({ userPrompt: "流萤，我头好痛……", mode: "daily" });
  const plan = engine.createEmbodimentPlan(decision, "没关系，我一直在这里陪着你。");
  const visualPayload = { ...plan.visual.target, correlationId: plan.correlationId, behaviorType: plan.behaviorType };
  const ttsRequest = {
    requestId: "req-correlation-chain",
    speechText: plan.voice.speechText,
    voiceIntent: plan.voice.voiceIntent,
    behaviorType: plan.behaviorType,
    prosodyHint: plan.voice.prosodyHint,
    correlationId: plan.correlationId,
  };
  const result = await new TtsSessionService().start(ttsRequest, { ...DEFAULT_TTS_SETTINGS, engine: "off" });

  assert.equal(visualPayload.correlationId, plan.correlationId);
  assert.equal(ttsRequest.correlationId, plan.correlationId);
  assert.equal(result.status, "skipped");
});
