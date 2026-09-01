/**
 * @file test_v2_semantic_emotion.mjs
 * @description Comprehensive Test Suite for Firefly-Agent V2.4 Semantic Emotion & Inner State.
 * Validates canonical YAML mapping, dynamic PersonaLoader derivation, zero duplicate prose,
 * user distress vs self physical state distinction, persona/relationship/memory invariance,
 * numeric state independence, and System Prompt projection.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const characterPolicyPath = path.join(projectRoot, "dist", "main", "main", "character", "character-policy.js");
const semanticInterpreterPath = path.join(projectRoot, "dist", "main", "main", "character", "semantic-state-interpreter.js");
const semanticTypesPath = path.join(projectRoot, "dist", "main", "main", "character", "semantic-state-types.js");
const personaLoaderPath = path.join(projectRoot, "dist", "main", "main", "character", "persona-loader.js");
const relationshipRegistryPath = path.join(projectRoot, "dist", "main", "main", "character", "relationship-registry.js");
const systemPromptBuilderPath = path.join(projectRoot, "dist", "main", "main", "agent", "context", "system-prompt-builder.js");

test("1. Canonical Mapping: YAML emotion_rules keys map bijectively to SemanticEmotion", async () => {
  const { CANONICAL_TO_SEMANTIC_EMOTION_MAP, SEMANTIC_TO_CANONICAL_EMOTION_MAP } = await import(`file://${semanticTypesPath}`);
  const { PersonaLoader } = await import(`file://${personaLoaderPath}`);

  const profile = PersonaLoader.getProfile();
  const yamlEmotionKeys = Object.keys(profile.dailyMode.emotionRules);

  // YAML has 7 canonical keys: happy, sad, shy, thinking, surprised, angry, neutral
  assert.equal(yamlEmotionKeys.length, 7);
  for (const yamlKey of yamlEmotionKeys) {
    assert.ok(
      CANONICAL_TO_SEMANTIC_EMOTION_MAP[yamlKey],
      `YAML key ${yamlKey} must map to a SemanticEmotion`,
    );
  }

  assert.equal(CANONICAL_TO_SEMANTIC_EMOTION_MAP["neutral"], "neutral");
  assert.equal(CANONICAL_TO_SEMANTIC_EMOTION_MAP["happy"], "happy");
  assert.equal(CANONICAL_TO_SEMANTIC_EMOTION_MAP["shy"], "shy");
  assert.equal(CANONICAL_TO_SEMANTIC_EMOTION_MAP["thinking"], "thinking");
  assert.equal(CANONICAL_TO_SEMANTIC_EMOTION_MAP["surprised"], "surprised");
  assert.equal(CANONICAL_TO_SEMANTIC_EMOTION_MAP["sad"], "concerned");
  assert.equal(CANONICAL_TO_SEMANTIC_EMOTION_MAP["angry"], "determined");

  assert.equal(SEMANTIC_TO_CANONICAL_EMOTION_MAP["concerned"], "sad");
  assert.equal(SEMANTIC_TO_CANONICAL_EMOTION_MAP["determined"], "angry");
});

test("2. Dynamic PersonaLoader Derivation: expressionGuidance dynamically sources from firefly.yaml", async () => {
  const { SemanticStateInterpreter } = await import(`file://${semanticInterpreterPath}`);
  const { PersonaLoader } = await import(`file://${personaLoaderPath}`);

  const profile = PersonaLoader.getProfile();
  const happyState = SemanticStateInterpreter.interpret({
    userPrompt: "流萤，我们要不要一起去吃橡木蛋糕卷？",
    mode: "daily",
  });

  assert.equal(happyState.emotion, "happy");
  assert.equal(happyState.canonicalEmotion, "happy");
  // expressionGuidance must strictly match firefly.yaml daily_mode.emotion_rules.happy
  assert.equal(happyState.expressionGuidance, profile.dailyMode.emotionRules.happy);
});

test("3. Zero Duplicate Prose Static Check: semantic-state-interpreter.ts has no hardcoded duplicate persona prose", () => {
  const interpreterSrcPath = path.join(projectRoot, "src", "main", "character", "semantic-state-interpreter.ts");
  const src = fs.readFileSync(interpreterSrcPath, "utf-8");

  // Verify that old hardcoded prose strings were removed
  assert.ok(!src.includes("“语气轻快柔和"), "Must not hardcode duplicated persona prose");
  assert.ok(!src.includes("“拘谨害羞"), "Must not hardcode duplicated persona prose");
  assert.ok(!src.includes("“善用省略号"), "Must not hardcode duplicated persona prose");
  assert.ok(!src.includes("“声音变低变稳"), "Must not hardcode duplicated persona prose");
  assert.ok(src.includes("resolveGuidanceFromProfile"), "Must resolve guidance from PersonaLoader");
});

test("4. Distress Distinction: User distress vs Firefly self physical / entropy loss condition", async () => {
  const { SemanticStateInterpreter } = await import(`file://${semanticInterpreterPath}`);

  // Scenario A: User distress -> concerned / caring
  const userDistressState = SemanticStateInterpreter.interpret({
    userPrompt: "流萤，我头疼得厉害，今天工作好累啊……",
    mode: "daily",
  });
  assert.equal(userDistressState.emotion, "concerned");
  assert.equal(userDistressState.canonicalEmotion, "sad");
  assert.equal(userDistressState.cognitiveContext, "caring");
  assert.ok(userDistressState.explanation.includes("对方的身体不适或情绪困扰"));

  // Scenario B: Firefly self condition / entropy loss -> thinking / reflecting
  const selfEntropyState = SemanticStateInterpreter.interpret({
    userPrompt: "流萤，你的失熵症现在怎么样了？身体还会缓慢解离吗？",
    mode: "daily",
  });
  assert.equal(selfEntropyState.emotion, "thinking");
  assert.equal(selfEntropyState.canonicalEmotion, "thinking");
  assert.equal(selfEntropyState.cognitiveContext, "reflecting");
  assert.ok(selfEntropyState.explanation.includes("失熵症"));
});

test("5. Determinism: Identical inputs produce 100% identical semantic emotion state", async () => {
  const { SemanticStateInterpreter } = await import(`file://${semanticInterpreterPath}`);

  const input = {
    userPrompt: "流萤，今天遇到了好多倒霉事，我好难过……",
    mode: "daily",
  };

  const state1 = SemanticStateInterpreter.interpret(input);
  const state2 = SemanticStateInterpreter.interpret(input);

  assert.equal(state1.emotion, state2.emotion);
  assert.equal(state1.canonicalEmotion, state2.canonicalEmotion);
  assert.equal(state1.cognitiveContext, state2.cognitiveContext);
  assert.equal(state1.explanation, state2.explanation);
  assert.equal(state1.expressionGuidance, state2.expressionGuidance);
  assert.equal(state1.behavioralTendency, state2.behavioralTendency);
  assert.equal(state1.emotion, "concerned");
});

test("6. Default State: Empty or idle prompt returns clean deterministic default state", async () => {
  const { SemanticStateInterpreter } = await import(`file://${semanticInterpreterPath}`);

  const dailyDefault = SemanticStateInterpreter.interpret({ userPrompt: "", mode: "daily" });
  assert.equal(dailyDefault.emotion, "neutral");
  assert.equal(dailyDefault.canonicalEmotion, "neutral");
  assert.equal(dailyDefault.cognitiveContext, "conversing");
  assert.equal(dailyDefault.mode, "daily");
  assert.ok(dailyDefault.explanation.includes("日常闲暇"));

  const workDefault = SemanticStateInterpreter.interpret({ userPrompt: "", mode: "work" });
  assert.equal(workDefault.emotion, "determined");
  assert.equal(workDefault.canonicalEmotion, "angry");
  assert.equal(workDefault.cognitiveContext, "task_executing");
  assert.equal(workDefault.mode, "work");
  assert.ok(workDefault.explanation.includes("工作"));
});

test("7. Relationship Influence: Interlocutor context enriches emotional explanation without mutating facts", async () => {
  const { SemanticStateInterpreter } = await import(`file://${semanticInterpreterPath}`);
  const { RelationshipRegistry } = await import(`file://${relationshipRegistryPath}`);

  const relResult = RelationshipRegistry.queryRelationshipPerspective("开拓者");

  const inputWithRel = {
    userPrompt: "流萤，要不要一起去吃橡木蛋糕卷？",
    relationshipResult: relResult,
    interlocutor: "开拓者",
    mode: "daily",
  };

  const state = SemanticStateInterpreter.interpret(inputWithRel);
  assert.equal(state.emotion, "happy");
  assert.equal(state.cognitiveContext, "sharing_memory");
  assert.ok(state.explanation.includes("开拓者"));
  assert.ok(state.explanation.includes("蛋糕卷"));

  // Verify Canonical Relationship is NOT mutated
  const canonicalTrailblazer = RelationshipRegistry.findRelationship("开拓者");
  assert.ok(canonicalTrailblazer);
  assert.equal(canonicalTrailblazer.name, "开拓者");
  assert.equal(canonicalTrailblazer.category, "core_companion");
});

test("8. Compliments & Warmth: Direct compliments trigger modest shy state", async () => {
  const { SemanticStateInterpreter } = await import(`file://${semanticInterpreterPath}`);

  const input = {
    userPrompt: "流萤今天穿得真漂亮，太可爱了！",
    mode: "daily",
  };

  const state = SemanticStateInterpreter.interpret(input);
  assert.equal(state.emotion, "shy");
  assert.equal(state.canonicalEmotion, "shy");
  assert.equal(state.cognitiveContext, "conversing");
  assert.ok(state.expressionGuidance.includes("被夸奖") || state.expressionGuidance.includes("害羞"));
});

test("9. Persona Invariance: Emotion transitions NEVER mutate PersonaProfile or firefly.yaml", async () => {
  const { PersonaLoader } = await import(`file://${personaLoaderPath}`);
  const { SemanticStateInterpreter } = await import(`file://${semanticInterpreterPath}`);

  const initialProfile = PersonaLoader.getProfile();
  const initialName = initialProfile.character.name;
  const initialPersonality = [...initialProfile.identity.personality];
  const initialForbidden = [...initialProfile.vocabulary.forbidden];

  // Trigger multiple intense emotional states
  SemanticStateInterpreter.interpret({ userPrompt: "我好难过好痛苦！", mode: "daily" });
  SemanticStateInterpreter.interpret({ userPrompt: "你太可爱了喜欢你！", mode: "daily" });
  SemanticStateInterpreter.interpret({ userPrompt: "立即执行清扫协议！", mode: "work" });
  SemanticStateInterpreter.interpret({ userPrompt: "怎么可能发生这种事？！", mode: "daily" });

  const currentProfile = PersonaLoader.getProfile();
  assert.equal(currentProfile.character.name, initialName);
  assert.deepEqual(currentProfile.identity.personality, initialPersonality);
  assert.deepEqual(currentProfile.vocabulary.forbidden, initialForbidden);
  assert.equal(currentProfile.character.identity, "星核猎手成员 / 前格拉默铁骑「萨姆」驾驶员");
});

test("10. Numeric State Independence: Zero reliance on numeric affection/hunger/energy for emotion reasoning", async () => {
  const { SemanticStateInterpreter } = await import(`file://${semanticInterpreterPath}`);

  const fakeLowState = {
    energy: 0,
    hunger: 100,
    affection: 0,
    attention: 0,
    mood: "exhausted",
    health: "sick",
  };

  const fakeHighState = {
    energy: 100,
    hunger: 0,
    affection: 100,
    attention: 100,
    mood: "ecstatic",
    health: "healthy",
  };

  const stateA = SemanticStateInterpreter.interpret({
    userPrompt: "流萤，我们要不要一起去看烟花？",
    legacyState: fakeLowState,
    mode: "daily",
  });

  const stateB = SemanticStateInterpreter.interpret({
    userPrompt: "流萤，我们要不要一起去看烟花？",
    legacyState: fakeHighState,
    mode: "daily",
  });

  assert.equal(stateA.emotion, stateB.emotion);
  assert.equal(stateA.canonicalEmotion, stateB.canonicalEmotion);
  assert.equal(stateA.emotion, "happy");
  assert.equal(stateA.cognitiveContext, "sharing_memory");
});

test("11. System Prompt Projection: Prompt correctly renders structured 【当前内在状态】 section", async () => {
  const { SystemPromptBuilder } = await import(`file://${systemPromptBuilderPath}`);

  const prompt = SystemPromptBuilder.build({
    userPrompt: "流萤，今天的橡木蛋糕卷很好吃哦！",
    mode: "daily",
  });

  assert.ok(prompt.includes("【当前内在状态】"), "Prompt must contain semantic inner state section");
  assert.ok(prompt.includes("当前心境：温和欣慰（happy，对应官方规则：happy）"));
  assert.ok(prompt.includes("认知上下文：分享记忆"));
  assert.ok(prompt.includes("运行模式：日常陪伴模式"));
  assert.ok(prompt.includes("心境起因："));
  assert.ok(prompt.includes("表达倾向："));
  assert.ok(prompt.includes("行为倾向："));
});

test("12. Work Mode Tone Shift: Switching to work mode produces focused SAM/efficient posture", async () => {
  const { SystemPromptBuilder } = await import(`file://${systemPromptBuilderPath}`);

  const workPrompt = SystemPromptBuilder.build({
    userPrompt: "开始执行代码重构任务",
    mode: "work",
  });

  assert.ok(workPrompt.includes("【当前内在状态】"));
  assert.ok(workPrompt.includes("当前心境：认真坚定（determined，对应官方规则：angry）"));
  assert.ok(workPrompt.includes("认知上下文：执行任务"));
  assert.ok(workPrompt.includes("运行模式：工作/任务模式"));
  assert.ok(workPrompt.includes("冷静、果断、高效"));
});
