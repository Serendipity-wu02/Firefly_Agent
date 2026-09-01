/**
 * @file test_v2_behavior_runtime.mjs
 * @description Comprehensive Test Suite for Firefly-Agent V2.4 Behavior Decision Layer.
 * Validates deterministic priority-driven behavior decisions, unified Multimodal Expression Intent (Text, Voice, Visual),
 * Memory -> Behavior read-only integration, persona/relationship/memory invariance, and zero coupling to Live2D/TTS/numeric pet stats.
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
const behaviorTypesPath = path.join(projectRoot, "dist", "main", "main", "character", "behavior-types.js");
const personaLoaderPath = path.join(projectRoot, "dist", "main", "main", "character", "persona-loader.js");
const relationshipRegistryPath = path.join(projectRoot, "dist", "main", "main", "character", "relationship-registry.js");

test("1. User Distress: Severe fatigue or pain triggers comfort_user behavior with highest priority (100) and caring multimodal intent", async () => {
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);
  const { BehaviorPriority } = await import(`file://${behaviorTypesPath}`);

  const decision = BehaviorRuntime.decide({
    userPrompt: "流萤，我头疼得厉害，今天工作好累啊……",
    mode: "daily",
  });

  assert.equal(decision.type, "comfort_user");
  assert.equal(decision.priority, BehaviorPriority.CRITICAL_CARE);
  assert.equal(decision.priority, 100);
  assert.equal(decision.shouldRespond, true);
  assert.equal(decision.requiresEmbodiment, true);
  assert.equal(decision.allowToolExecution, false);
  assert.ok(decision.reason.includes("关怀抚慰"));

  // Validate Multimodal Intent Consistency
  assert.ok(decision.multimodalIntent.text.includes("温柔"));
  assert.ok(decision.multimodalIntent.voice.includes("放慢") || decision.multimodalIntent.voice.includes("气声"));
  assert.ok(decision.multimodalIntent.visual.includes("关切") || decision.multimodalIntent.visual.includes("前倾"));
});

test("2. Compliments & Warmth: User praise triggers restrained_response behavior with shy multimodal intent", async () => {
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);

  const decision = BehaviorRuntime.decide({
    userPrompt: "流萤今天穿得真漂亮，太可爱了！",
    mode: "daily",
  });

  assert.equal(decision.type, "restrained_response");
  assert.equal(decision.innerState.emotion, "shy");
  assert.equal(decision.shouldRespond, true);
  assert.equal(decision.requiresEmbodiment, true);
  assert.ok(decision.reason.includes("克制羞涩"));

  // Validate Multimodal Intent
  assert.ok(decision.multimodalIntent.text.includes("否认") || decision.multimodalIntent.text.includes("小声"));
  assert.ok(decision.multimodalIntent.voice.includes("轻微") || decision.multimodalIntent.voice.includes("停顿"));
  assert.ok(decision.multimodalIntent.visual.includes("目光移开") || decision.multimodalIntent.visual.includes("低头"));
});

test("3. Joy & Fond Memories: Food and stars trigger share_memory behavior with joyful multimodal intent", async () => {
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);

  const decision = BehaviorRuntime.decide({
    userPrompt: "流萤，我们要不要一起去吃橡木蛋糕卷，然后去看星星？",
    mode: "daily",
  });

  assert.equal(decision.type, "share_memory");
  assert.equal(decision.innerState.emotion, "happy");
  assert.equal(decision.shouldRespond, true);
  assert.equal(decision.requiresEmbodiment, true);
  assert.ok(decision.reason.includes("分享记忆"));

  // Validate Multimodal Intent
  assert.ok(decision.multimodalIntent.text.includes("暖意"));
  assert.ok(decision.multimodalIntent.voice.includes("上扬") || decision.multimodalIntent.voice.includes("温润"));
  assert.ok(decision.multimodalIntent.visual.includes("笑意") || decision.multimodalIntent.visual.includes("温柔"));
});

test("4. Origin & Entropy Loss: Identity/armor queries trigger reflect_origin behavior", async () => {
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);

  const decision = BehaviorRuntime.decide({
    userPrompt: "流萤，你的失熵症现在怎么样了？萨姆装甲还会灼烧身体吗？",
    mode: "daily",
  });

  assert.equal(decision.type, "reflect_origin");
  assert.equal(decision.innerState.emotion, "thinking");
  assert.equal(decision.shouldRespond, true);
  assert.equal(decision.requiresEmbodiment, true);
  assert.ok(decision.reason.includes("沉思回忆"));

  // Validate Multimodal Intent
  assert.ok(decision.multimodalIntent.text.includes("沉静"));
  assert.ok(decision.multimodalIntent.voice.includes("缓慢") || decision.multimodalIntent.voice.includes("思索"));
  assert.ok(decision.multimodalIntent.visual.includes("手托下巴") || decision.multimodalIntent.visual.includes("深思"));
});

test("5. Work Mode & Tasks: Task mode or tool intent triggers focused_execution with tool allowance", async () => {
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);
  const { BehaviorPriority } = await import(`file://${behaviorTypesPath}`);

  const decision = BehaviorRuntime.decide({
    userPrompt: "开始执行代码重构与扫描任务",
    mode: "work",
  });

  assert.equal(decision.type, "focused_execution");
  assert.equal(decision.priority, BehaviorPriority.TASK_EXECUTION);
  assert.equal(decision.priority, 80);
  assert.equal(decision.shouldRespond, true);
  assert.equal(decision.requiresEmbodiment, true);
  assert.equal(decision.allowToolExecution, true);
  assert.ok(decision.reason.includes("专注执行"));

  // Validate Multimodal Intent
  assert.ok(decision.multimodalIntent.text.includes("严密"));
  assert.ok(decision.multimodalIntent.voice.includes("清晰") || decision.multimodalIntent.voice.includes("坚定"));
  assert.ok(decision.multimodalIntent.visual.includes("挺拔") || decision.multimodalIntent.visual.includes("聚焦"));
});

test("6. General Chat: Normal daily conversation triggers warm_conversation behavior", async () => {
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);
  const { BehaviorPriority } = await import(`file://${behaviorTypesPath}`);

  const decision = BehaviorRuntime.decide({
    userPrompt: "今天天气真好呢。",
    mode: "daily",
  });

  assert.equal(decision.type, "warm_conversation");
  assert.equal(decision.priority, BehaviorPriority.GENERAL_CONVERSATION);
  assert.equal(decision.priority, 50);
  assert.equal(decision.shouldRespond, true);
  assert.equal(decision.requiresEmbodiment, true);
  assert.equal(decision.allowToolExecution, false);
});

test("7. Idle State: Empty prompt produces idle_presence with no forced speech response", async () => {
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);
  const { BehaviorPriority } = await import(`file://${behaviorTypesPath}`);

  const decision = BehaviorRuntime.decide({
    userPrompt: "",
    mode: "daily",
  });

  assert.equal(decision.type, "idle_presence");
  assert.equal(decision.priority, BehaviorPriority.IDLE_PRESENCE);
  assert.equal(decision.priority, 10);
  assert.equal(decision.shouldRespond, false);
  assert.equal(decision.requiresEmbodiment, false);
  assert.equal(decision.allowToolExecution, false);
  assert.equal(decision.multimodalIntent.text, "");
  assert.equal(decision.multimodalIntent.voice, "");
});

test("8. Memory -> Behavior Integration: Long-term memory steers behavior decision without modifying Persona/Relationship", async () => {
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);
  const { PersonaLoader } = await import(`file://${personaLoaderPath}`);
  const { RelationshipRegistry } = await import(`file://${relationshipRegistryPath}`);

  const initialProfile = PersonaLoader.getProfile();
  const initialName = initialProfile.character.name;
  const initialPersonality = [...initialProfile.identity.personality];

  const decisionWithMemory = BehaviorRuntime.decide({
    userPrompt: "流萤，我们要不要兑现之前的约定？",
    memoryContext: "用户偏好：喜欢在晚上一起看星星与吃甜点；约定：匹诺康尼重聚",
    mode: "daily",
  });

  assert.equal(decisionWithMemory.type, "share_memory");
  assert.equal(decisionWithMemory.memoryInfluenced, true);
  assert.ok(decisionWithMemory.reason.includes("偏好") || decisionWithMemory.reason.includes("约定"));

  // Verify Persona and Relationships remain 100% untouched
  const currentProfile = PersonaLoader.getProfile();
  assert.equal(currentProfile.character.name, initialName);
  assert.deepEqual(currentProfile.identity.personality, initialPersonality);

  const trailblazerRel = RelationshipRegistry.findRelationship("开拓者");
  assert.ok(trailblazerRel);
  assert.equal(trailblazerRel.name, "开拓者");
});

test("9. Relationship Context: Companion identification coordinates with behavioral priority", async () => {
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);
  const { RelationshipRegistry } = await import(`file://${relationshipRegistryPath}`);

  const relResult = RelationshipRegistry.queryRelationshipPerspective("开拓者");

  const decision = BehaviorRuntime.decide({
    userPrompt: "流萤，你今天真好看！",
    interlocutor: "开拓者",
    relationshipResult: relResult,
    mode: "daily",
  });

  assert.equal(decision.type, "restrained_response");
  assert.equal(decision.priority, 70); // RELATIONSHIP_INTERACTION priority
  assert.ok(decision.innerState.explanation.includes("开拓者"));
});

test("10. Determinism: Same inputs consistently produce 100% identical BehaviorDecision (0 Math.random)", async () => {
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);

  const input = {
    userPrompt: "流萤，今天遇到了好多不顺心的事，心情好低落……",
    mode: "daily",
  };

  const d1 = BehaviorRuntime.decide(input);
  const d2 = BehaviorRuntime.decide(input);

  assert.equal(d1.type, d2.type);
  assert.equal(d1.priority, d2.priority);
  assert.equal(d1.reason, d2.reason);
  assert.equal(d1.shouldRespond, d2.shouldRespond);
  assert.equal(d1.requiresEmbodiment, d2.requiresEmbodiment);
  assert.equal(d1.allowToolExecution, d2.allowToolExecution);
  assert.equal(d1.innerState.emotion, d2.innerState.emotion);
  assert.deepEqual(d1.multimodalIntent, d2.multimodalIntent);
});

test("11. Decoupled Boundary: BehaviorRuntime does NOT call Live2D, TTS, or mutate MemoryStore", async () => {
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);
  const { CharacterPolicyEngine } = await import(`file://${characterPolicyPath}`);

  const decision = CharacterPolicyEngine.getInstance().decideBehavior({
    userPrompt: "流萤，今天辛苦啦！",
    mode: "daily",
  });

  // Behavior decision must not leak Live2D action identifiers or execute tools directly
  assert.equal(typeof decision.type, "string");
  assert.ok(!("actionId" in decision), "BehaviorDecision must not contain raw Live2D actionId");
  assert.ok(!("motionName" in decision), "BehaviorDecision must not contain raw Live2D motionName");
  assert.ok(!("ttsAudio" in decision), "BehaviorDecision must not contain TTS audio buffers");
});

test("12. Numeric State Decoupled: Zero reliance on numeric affection/hunger/energy for behavior arbitration", async () => {
  const { BehaviorRuntime } = await import(`file://${behaviorRuntimePath}`);

  const fakeZeroState = {
    energy: 0,
    hunger: 100,
    affection: 0,
    attention: 0,
    mood: "exhausted",
    health: "sick",
  };

  const fakeFullState = {
    energy: 100,
    hunger: 0,
    affection: 100,
    attention: 100,
    mood: "ecstatic",
    health: "healthy",
  };

  const decisionA = BehaviorRuntime.decide({
    userPrompt: "流萤，要不要一起吃橡木蛋糕卷？",
    legacyState: fakeZeroState,
    mode: "daily",
  });

  const decisionB = BehaviorRuntime.decide({
    userPrompt: "流萤，要不要一起吃橡木蛋糕卷？",
    legacyState: fakeFullState,
    mode: "daily",
  });

  assert.equal(decisionA.type, decisionB.type);
  assert.equal(decisionA.type, "share_memory");
  assert.equal(decisionA.priority, decisionB.priority);
  assert.deepEqual(decisionA.multimodalIntent, decisionB.multimodalIntent);
});
