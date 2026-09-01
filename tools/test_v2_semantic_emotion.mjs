/**
 * @file test_v2_semantic_emotion.mjs
 * @description Comprehensive Test Suite for Firefly-Agent V2.4 Semantic Emotion & Inner State.
 * Validates deterministic interpretation, context integration, persona/relationship/memory invariance,
 * numeric state independence, and System Prompt projection.
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const characterPolicyPath = path.join(projectRoot, "dist", "main", "main", "character", "character-policy.js");
const semanticInterpreterPath = path.join(projectRoot, "dist", "main", "main", "character", "semantic-state-interpreter.js");
const personaLoaderPath = path.join(projectRoot, "dist", "main", "main", "character", "persona-loader.js");
const relationshipRegistryPath = path.join(projectRoot, "dist", "main", "main", "character", "relationship-registry.js");
const systemPromptBuilderPath = path.join(projectRoot, "dist", "main", "main", "agent", "context", "system-prompt-builder.js");

test("1. Determinism: Identical inputs produce 100% identical semantic emotion state", async () => {
  const { SemanticStateInterpreter } = await import(`file://${semanticInterpreterPath}`);

  const input = {
    userPrompt: "流萤，今天工作好累啊，感觉整个人都要垮掉了……",
    mode: "daily",
  };

  const state1 = SemanticStateInterpreter.interpret(input);
  const state2 = SemanticStateInterpreter.interpret(input);

  assert.equal(state1.emotion, state2.emotion);
  assert.equal(state1.cognitiveContext, state2.cognitiveContext);
  assert.equal(state1.explanation, state2.explanation);
  assert.equal(state1.expressionGuidance, state2.expressionGuidance);
  assert.equal(state1.behavioralTendency, state2.behavioralTendency);
  assert.equal(state1.emotion, "concerned");
  assert.equal(state1.cognitiveContext, "caring");
});

test("2. Default State: Empty or idle prompt returns clean deterministic default state", async () => {
  const { SemanticStateInterpreter } = await import(`file://${semanticInterpreterPath}`);

  const dailyDefault = SemanticStateInterpreter.interpret({ userPrompt: "", mode: "daily" });
  assert.equal(dailyDefault.emotion, "neutral");
  assert.equal(dailyDefault.cognitiveContext, "conversing");
  assert.equal(dailyDefault.mode, "daily");
  assert.ok(dailyDefault.explanation.includes("日常闲暇"));

  const workDefault = SemanticStateInterpreter.interpret({ userPrompt: "", mode: "work" });
  assert.equal(workDefault.emotion, "determined");
  assert.equal(workDefault.cognitiveContext, "task_executing");
  assert.equal(workDefault.mode, "work");
  assert.ok(workDefault.explanation.includes("工作"));
});

test("3. Relationship Influence: Interlocutor context enriches emotional explanation without mutating facts", async () => {
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

test("4. Character Knowledge Influence: Backstory and armor queries invoke reflective/determined state", async () => {
  const { SemanticStateInterpreter } = await import(`file://${semanticInterpreterPath}`);

  const input = {
    userPrompt: "流萤，能跟我讲讲萨姆机甲和你在格拉默的故事吗？",
    mode: "daily",
  };

  const state = SemanticStateInterpreter.interpret(input);
  assert.equal(state.emotion, "thinking");
  assert.equal(state.cognitiveContext, "reflecting");
  assert.ok(state.explanation.includes("格拉默铁骑"));
  assert.ok(state.explanation.includes("失熵症"));
});

test("5. Memory Context / Distress: User distress reliably triggers concerned care state", async () => {
  const { SemanticStateInterpreter } = await import(`file://${semanticInterpreterPath}`);

  const input = {
    userPrompt: "今天遇到了很多倒霉事，心里好难过……",
    memoryContext: "用户最近面临巨大工作压力",
    mode: "daily",
  };

  const state = SemanticStateInterpreter.interpret(input);
  assert.equal(state.emotion, "concerned");
  assert.equal(state.cognitiveContext, "caring");
  assert.ok(state.behavioralTendency.includes("守护") || state.behavioralTendency.includes("诚恳"));
});

test("6. Compliments & Warmth: Direct compliments trigger modest shy state", async () => {
  const { SemanticStateInterpreter } = await import(`file://${semanticInterpreterPath}`);

  const input = {
    userPrompt: "流萤今天穿得真漂亮，太可爱了！",
    mode: "daily",
  };

  const state = SemanticStateInterpreter.interpret(input);
  assert.equal(state.emotion, "shy");
  assert.equal(state.cognitiveContext, "conversing");
  assert.ok(state.expressionGuidance.includes("被夸奖") || state.expressionGuidance.includes("害羞"));
});

test("7. Persona Invariance: Emotion transitions NEVER mutate PersonaProfile or firefly.yaml", async () => {
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

test("8. Numeric State Independence: Zero reliance on numeric affection/hunger/energy for emotion reasoning", async () => {
  const { SemanticStateInterpreter } = await import(`file://${semanticInterpreterPath}`);

  // Test with extreme fake legacy numbers
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

  // Same prompt with different fake numbers yields identical genuine semantic emotion
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
  assert.equal(stateA.emotion, "happy");
  assert.equal(stateA.cognitiveContext, "sharing_memory");
});

test("9. System Prompt Projection: Prompt correctly renders structured 【当前内在状态】 section", async () => {
  const { SystemPromptBuilder } = await import(`file://${systemPromptBuilderPath}`);
  const { CharacterPolicyEngine } = await import(`file://${characterPolicyPath}`);

  const prompt = SystemPromptBuilder.build({
    userPrompt: "流萤，今天的橡木蛋糕卷很好吃哦！",
    mode: "daily",
  });

  assert.ok(prompt.includes("【当前内在状态】"), "Prompt must contain semantic inner state section");
  assert.ok(prompt.includes("当前心境：温和欣慰（happy）"), "Must render mapped emotion");
  assert.ok(prompt.includes("认知上下文：分享记忆"), "Must render cognitive context");
  assert.ok(prompt.includes("运行模式：日常陪伴模式"), "Must render active mode");
  assert.ok(prompt.includes("心境起因："), "Must render explainability origin");
  assert.ok(prompt.includes("表达倾向："), "Must render expression guidance");
  assert.ok(prompt.includes("行为倾向："), "Must render behavioral tendency");

  // Verify pure oral constraints and action list remain present
  assert.ok(prompt.includes("【纯口语硬限制】"));
  assert.ok(prompt.includes("【可用动作列表】"));
});

test("10. Work Mode Tone Shift: Switching to work mode produces focused SAM/efficient posture", async () => {
  const { SystemPromptBuilder } = await import(`file://${systemPromptBuilderPath}`);

  const workPrompt = SystemPromptBuilder.build({
    userPrompt: "开始执行代码重构任务",
    mode: "work",
  });

  assert.ok(workPrompt.includes("【当前内在状态】"));
  assert.ok(workPrompt.includes("当前心境：认真坚定（determined）"));
  assert.ok(workPrompt.includes("认知上下文：执行任务"));
  assert.ok(workPrompt.includes("运行模式：工作/任务模式"));
  assert.ok(workPrompt.includes("冷静、果断、高效"));
});

test("11. Speaking Habits Preserved: Output rules and anti-OOC guardrails intact across all states", async () => {
  const { CharacterPolicyEngine } = await import(`file://${characterPolicyPath}`);
  const engine = CharacterPolicyEngine.getInstance();

  // Test validateUtterance under different scenarios
  const normalUtterance = "嗯…今天的天气很不错呢，要不要一起散散步？";
  const normalResult = engine.validateUtterance(normalUtterance);
  assert.equal(normalResult.isValid, true);
  assert.equal(normalResult.sanitizedText, normalUtterance);

  // Test forbidden word rejection
  const badUtterance = "流萤永远是我的绝绝子yyds宝贝！";
  const badResult = engine.validateUtterance(badUtterance);
  assert.equal(badResult.isValid, false);
  assert.ok(badResult.violations.length > 0);

  // Test stage direction rejection
  const stageUtterance = "（微笑着低下头）好的，我会努力的。";
  const stageResult = engine.validateUtterance(stageUtterance);
  assert.equal(stageResult.isValid, false);
  assert.ok(stageResult.violations.includes("parenthesis_stage_direction"));
  assert.equal(stageResult.sanitizedText, "好的，我会努力的。");
});
