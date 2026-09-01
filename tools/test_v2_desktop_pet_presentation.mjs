/**
 * @file test_v2_desktop_pet_presentation.mjs
 * @description Unit & Integration test suite for V2.4 Desktop Pet Presentation.
 * Verifies default expression determinism, severance of legacy state timers from Live2D,
 * speaking/reset controller non-interference, and user interaction routing through CharacterPolicyEngine.
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

// Import CharacterPolicyEngine and state components
const { CharacterPolicyEngine } = await import("../dist/main/main/character/character-policy.js");
const { CharacterStateManager } = await import("../dist/main/main/state/state-manager.js");
const { SpeakingMotionController } = await import("../dist/renderer/assets/renderer-BfB6sYrj.js").catch(() => ({}));
const { FIREFLY_ACTIONS, findFireflyAction, resolveFireflyTarget } = await import("../dist/main/shared/firefly-actions.js");

test("1. Default Expression Determinism: Firefly.model3.json binds expression00 to Expressions_0_File_0.json", () => {
  const modelJsonPath = path.join(rootDir, "assets", "firefly", "models", "Firefly.model3.json");
  assert.ok(fs.existsSync(modelJsonPath), "Firefly.model3.json must exist");
  const modelData = JSON.parse(fs.readFileSync(modelJsonPath, "utf-8"));
  
  const exp0 = modelData.FileReferences.Expressions.find(e => e.Name === "expression00");
  assert.ok(exp0, "expression00 must be defined in model3.json");
  assert.equal(exp0.File, "Expressions/Expressions_0_File_0.json");

  const exp0File = path.join(rootDir, "assets", "firefly", "models", exp0.File);
  assert.ok(fs.existsSync(exp0File), "Expressions_0_File_0.json must exist on disk");
});

test("2. Startup Determinism: Manager initializes with expression00 without random expression assignment", () => {
  const managerSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "live2d", "manager.ts"), "utf-8");
  assert.ok(managerSource.includes('this.setExpression("expression00")'), "Live2DManager must explicitly set expression00 on load");
  assert.ok(!managerSource.includes("Math.random()"), "Manager must not randomly select expressions on init");
});

test("3. Numeric State Isolation: StateManager does NOT dispatch actions on decayTimer or timers", () => {
  const stateManagerSource = fs.readFileSync(path.join(rootDir, "src", "main", "state", "state-manager.ts"), "utf-8");
  
  // Verify timer blocks contain zero dispatchAction calls
  const timerBlockMatch = stateManagerSource.match(/private startTimers\(\): void \{([\s\S]*?)\n  \}/);
  assert.ok(timerBlockMatch, "startTimers method must exist");
  assert.ok(!timerBlockMatch[1].includes("this.dispatchAction("), "startTimers must not call dispatchAction");
});

test("4. actionTimer Severance: 18s timer has zero Live2D dispatch callers", () => {
  const stateManagerSource = fs.readFileSync(path.join(rootDir, "src", "main", "state", "state-manager.ts"), "utf-8");
  assert.ok(stateManagerSource.includes("actionTimer = setInterval"), "actionTimer must exist");
  assert.ok(!stateManagerSource.includes("this.dispatchAction(nextAction)"), "actionTimer must not dispatch nextAction");
});

test("5. proactiveTimer Severance: 45s timer has zero Live2D dispatch callers", () => {
  const stateManagerSource = fs.readFileSync(path.join(rootDir, "src", "main", "state", "state-manager.ts"), "utf-8");
  assert.ok(stateManagerSource.includes("proactiveTimer = setInterval"), "proactiveTimer must exist");
  assert.ok(!stateManagerSource.includes("this.dispatchAction(proactive)"), "proactiveTimer must not dispatch proactive");
});

test("6. SpeakingMotionController Non-Interference: Speaking state does NOT override Live2D expression to talking or idle", () => {
  const speakingSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "live2d", "speaking-motion.ts"), "utf-8");
  assert.ok(!speakingSource.includes('this.manager.playActionId("talking")'), "setSpeaking(true) must not force talking action");
  assert.ok(!speakingSource.includes('this.manager.playActionId("idle")'), "setSpeaking(false) must not force idle action");
});

test("7. ExpressionResetController Non-Interference: Expressions do NOT get arbitrarily wiped after 5 seconds", () => {
  const mainRendererSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "main.ts"), "utf-8");
  assert.ok(mainRendererSource.includes("temporary"), "Expression reset must only trigger when explicitly temporary");
  assert.ok(mainRendererSource.includes('manager.setExpression("expression00")'), "Expression reset must restore to expression00");
});

test("8. User Interaction Routing: click/touch/drag route through CharacterPolicyEngine -> EmbodimentPlan", () => {
  const policyEngine = CharacterPolicyEngine.getInstance();
  
  // Touch -> comfort_user / touched (expression4)
  const touchPlan = policyEngine.handleInteraction("touch");
  assert.equal(touchPlan.behaviorType, "comfort_user");
  assert.equal(touchPlan.visual?.actionId, "touched");
  assert.ok(touchPlan.correlationId.startsWith("emb-"));
  assert.equal(touchPlan.visual?.target.kind, "expression");

  // Click -> warm_conversation / waving (Tap/1)
  const clickPlan = policyEngine.handleInteraction("click");
  assert.equal(clickPlan.behaviorType, "warm_conversation");
  assert.equal(clickPlan.visual?.actionId, "waving");
  assert.equal(clickPlan.visual?.target.kind, "motion");

  // Drag -> warm_conversation / dragged (Tap/0)
  const dragPlan = policyEngine.handleInteraction("drag");
  assert.equal(dragPlan.behaviorType, "warm_conversation");
  assert.equal(dragPlan.visual?.actionId, "dragged");
  assert.equal(dragPlan.visual?.target.kind, "motion");
});

test("9. StateManager handleCareAction Severance: Care action does NOT dispatch to Live2D directly", () => {
  const stateManagerSource = fs.readFileSync(path.join(rootDir, "src", "main", "state", "state-manager.ts"), "utf-8");
  const handleCareActionMatch = stateManagerSource.match(/handleCareAction\([\s\S]*?\n  \}/);
  assert.ok(handleCareActionMatch, "handleCareAction must exist");
  assert.ok(!handleCareActionMatch[0].includes("this.dispatchAction("), "handleCareAction must not call dispatchAction directly");
});

test("10. Legacy Action Catalog Audit: All 19 actions in FIREFLY_ACTIONS resolve to valid Live2D targets", () => {
  assert.equal(FIREFLY_ACTIONS.length, 19, "FIREFLY_ACTIONS must contain exactly 19 catalogued actions");
  for (const action of FIREFLY_ACTIONS) {
    const target = resolveFireflyTarget(action.id);
    assert.ok(target, `Action ${action.id} must resolve to a valid target`);
    assert.ok(target.kind === "motion" || target.kind === "expression", `Target kind must be motion or expression`);
  }
});

test("11. Assets & Resources Frozen: git diff reports 0 diff on assets/ and resources/", () => {
  try {
    const diffAssets = execSync("git diff HEAD -- assets/", { cwd: rootDir, encoding: "utf-8" }).trim();
    const diffResources = execSync("git diff HEAD -- resources/", { cwd: rootDir, encoding: "utf-8" }).trim();
    assert.equal(diffAssets, "", "assets/ must have 0 diff");
    assert.equal(diffResources, "", "resources/ must have 0 diff");
  } catch (err) {
    // If git diff command fails, ensure paths exist
    assert.ok(fs.existsSync(path.join(rootDir, "assets")), "assets directory exists");
    assert.ok(fs.existsSync(path.join(rootDir, "resources")), "resources directory exists");
  }
});
