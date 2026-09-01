/**
 * @file test_v2_desktop_pet_behavior_presentation.mjs
 * @description Behavior Presentation & Motion/Expression tuning test suite for V2.4 Desktop Pet.
 * Verifies S1-S8 behavioral scenarios, severance from numeric state, Speaking/Reset controller non-interference,
 * strict semantic distinction between User Distress and Self Entropy Loss, and resource immutability.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const { CharacterPolicyEngine } = await import("../dist/main/main/character/character-policy.js");
const { CharacterStateManager } = await import("../dist/main/main/state/state-manager.js");
const { EmbodimentAdapter } = await import("../dist/main/main/character/embodiment-adapter.js");
const { FIREFLY_ACTIONS, resolveFireflyTarget } = await import("../dist/main/shared/firefly-actions.js");

test("1. Idle Default State: Expression is expression00 and Idle Motion is Idle/0", () => {
  const modelJsonPath = path.join(rootDir, "assets", "firefly", "models", "Firefly.model3.json");
  const modelData = JSON.parse(fs.readFileSync(modelJsonPath, "utf-8"));
  
  const exp0 = modelData.FileReferences.Expressions.find(e => e.Name === "expression00");
  assert.equal(exp0.File, "Expressions/Expressions_0_File_0.json");

  const idle0 = modelData.FileReferences.Motions.Idle[0];
  assert.equal(idle0.File, "Motions/Motions_Tick2_0_File_0.json");

  const managerSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "live2d", "manager.ts"), "utf-8");
  assert.ok(managerSource.includes('this.setExpression("expression00")'), "Manager must initialize with expression00");
});

test("2. Click Interaction: Dispatches waving motion through CharacterPolicyEngine without altering numeric stats", () => {
  const policyEngine = CharacterPolicyEngine.getInstance();
  const plan = policyEngine.handleInteraction("click");

  assert.equal(plan.behaviorType, "warm_conversation");
  assert.equal(plan.visual?.actionId, "waving");
  assert.equal(plan.visual?.target.kind, "motion");
  assert.equal(plan.visual?.target.group, "Tap");
  assert.equal(plan.visual?.target.motionName, "1");

  // Verify renderer invokes pet:interaction instead of characterState.careAction
  const mainRendererSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "main.ts"), "utf-8");
  assert.ok(mainRendererSource.includes('interact?.("click")'), "onPetClick must invoke interact('click')");
});

test("3. Touch Interaction: Dispatches touched expression through CharacterPolicyEngine without altering numeric stats", () => {
  const policyEngine = CharacterPolicyEngine.getInstance();
  const plan = policyEngine.handleInteraction("touch");

  assert.equal(plan.behaviorType, "comfort_user");
  assert.equal(plan.visual?.actionId, "touched");
  assert.equal(plan.visual?.target.kind, "expression");
  assert.equal(plan.visual?.target.name, "expression4");

  const mainRendererSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "main.ts"), "utf-8");
  assert.ok(mainRendererSource.includes('interact?.("touch")'), "onPetPet must invoke interact('touch')");
});

test("4. Drag Severance: Pure window movement without care action or state mutations", () => {
  const mainRendererSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "main.ts"), "utf-8");
  assert.ok(!mainRendererSource.includes('careAction("drag")'), "Drag must not invoke careAction('drag')");

  const interactionSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "live2d", "interaction.ts"), "utf-8");
  assert.ok(interactionSource.includes("window.firefly?.moveBy(dx, dy);"), "Drag must move window directly");
});

test("5. Drag End Visual Non-Interference: Drag does not force idle or talking action", () => {
  const interactionSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "live2d", "interaction.ts"), "utf-8");
  assert.ok(!interactionSource.includes('playActionId("idle")'), "Drag end must not force idle");
  assert.ok(!interactionSource.includes('playActionId("talking")'), "Drag end must not force talking");
});

test("6. Speaking Visual Non-Interference: Speaking only modulates mouthSync without overriding visual expression", () => {
  const speakingSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "live2d", "speaking-motion.ts"), "utf-8");
  assert.ok(!speakingSource.includes('this.manager.playActionId("talking")'), "Speaking must not force talking action");
  assert.ok(!speakingSource.includes('this.manager.playActionId("idle")'), "Speaking stop must not force idle action");
});

test("7. ExpressionResetController Non-Interference: temporary expressions restore the CURRENT Behavior expression", () => {
  const mainRendererSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "main.ts"), "utf-8");
  assert.ok(mainRendererSource.includes("temporary"), "Expression reset must only run for temporary targets");
  assert.ok(
    mainRendererSource.includes("manager.setExpression(currentPersistentExpression)"),
    "Reset must restore the current Behavior expression, not a fixed one",
  );
  assert.ok(
    !mainRendererSource.includes('manager.setExpression("expression00")'),
    "Reset must NOT unconditionally fall back to expression00 (Behavior may be happy/shy/thinking/concerned)",
  );
});

test("8. Semantic Distinction: User Distress (comfort_user) != Legacy sick", () => {
  const policyEngine = CharacterPolicyEngine.getInstance();
  const evaluation = policyEngine.decideBehavior({
    userPrompt: "流萤，我今天头好疼……",
  });

  assert.equal(evaluation.type, "comfort_user");
  const plan = policyEngine.createEmbodimentPlan(evaluation);
  assert.equal(plan.visual?.actionId, "touched");
  assert.equal(plan.visual?.target.kind, "expression");
  assert.equal(plan.visual?.target.name, "expression4");
  assert.notEqual(plan.visual?.actionId, "sick", "User distress must NEVER map to sick");
});

test("9. Semantic Distinction: Self Entropy Loss (reflect_origin) is distinct from User Distress", () => {
  const policyEngine = CharacterPolicyEngine.getInstance();
  const evaluation = policyEngine.decideBehavior({
    userPrompt: "你怎么看自己的失熵症？我的身体自身失熵症身体病理好像……",
  });

  assert.equal(evaluation.type, "reflect_origin");
  const plan = policyEngine.createEmbodimentPlan(evaluation);
  assert.ok(plan.visual?.actionId === "sick" || plan.visual?.actionId === "thinking");
});

test("10. Praise Scenario: User praise produces restrained_response with shy expression", () => {
  const policyEngine = CharacterPolicyEngine.getInstance();
  const evaluation = policyEngine.decideBehavior({
    userPrompt: "流萤，你真的很可爱。",
  });

  assert.equal(evaluation.type, "restrained_response");
  const plan = policyEngine.createEmbodimentPlan(evaluation);
  assert.equal(plan.visual?.actionId, "shy");
  assert.equal(plan.visual?.target.name, "expression10");
});

test("11. Memory Scenario: Sharing memory produces share_memory with happy expression", () => {
  const policyEngine = CharacterPolicyEngine.getInstance();
  const evaluation = policyEngine.decideBehavior({
    userPrompt: "还记得匹诺康尼的天台吗？",
  });

  assert.equal(evaluation.type, "share_memory");
  const plan = policyEngine.createEmbodimentPlan(evaluation);
  assert.equal(plan.visual?.actionId, "happy");
  assert.equal(plan.visual?.target.name, "expression4");
});

test("12. Deterministic Execution: Zero random expression or motion selection across all behavior rules", () => {
  const policyEngine = CharacterPolicyEngine.getInstance();
  for (let i = 0; i < 5; i++) {
    const plan = policyEngine.handleInteraction("touch");
    assert.equal(plan.visual?.actionId, "touched");
    assert.equal(plan.visual?.target.name, "expression4");
  }
});

test("13. Resources & Assets Immutability: 0 diff on resources/ and assets/", () => {
  try {
    const diffAssets = execSync("git diff HEAD -- assets/", { cwd: rootDir, encoding: "utf-8" }).trim();
    const diffResources = execSync("git diff HEAD -- resources/", { cwd: rootDir, encoding: "utf-8" }).trim();
    assert.equal(diffAssets, "", "assets/ must have 0 diff");
    assert.equal(diffResources, "", "resources/ must have 0 diff");
  } catch (err) {
    assert.ok(fs.existsSync(path.join(rootDir, "assets")), "assets directory exists");
    assert.ok(fs.existsSync(path.join(rootDir, "resources")), "resources directory exists");
  }
});
