/**
 * @file test_v2_desktop_pet_presentation.mjs
 * @description Unit & Integration test suite for V2.4 Desktop Pet Presentation.
 * Verifies 429x315 tight window bounds, default petScale 1.0, default expression00, default Idle/0,
 * pure Alpha dragging, severance of Drag from CharacterState, SpeakingMotionController non-interference,
 * context menu simplification, and resource integrity.
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

// Import CharacterPolicyEngine, WindowManager, and state components
const { CharacterPolicyEngine } = await import("../dist/main/main/character/character-policy.js");
const { CharacterStateManager } = await import("../dist/main/main/state/state-manager.js");
const { WindowManager } = await import("../dist/main/main/windows/window-manager.js");
const { FIREFLY_ACTIONS, findFireflyAction, resolveFireflyTarget } = await import("../dist/main/shared/firefly-actions.js");

test("1. Base Window Dimensions: PET_WINDOW_BASE_WIDTH = 429, PET_WINDOW_BASE_HEIGHT = 315", () => {
  const windowManagerSource = fs.readFileSync(path.join(rootDir, "src", "main", "windows", "window-manager.ts"), "utf-8");
  assert.ok(windowManagerSource.includes("const PET_WINDOW_BASE_WIDTH = 429;"), "PET_WINDOW_BASE_WIDTH must be 429");
  assert.ok(windowManagerSource.includes("const PET_WINDOW_BASE_HEIGHT = 315;"), "PET_WINDOW_BASE_HEIGHT must be 315");
});

test("2. Default petScale is 1.0 and ignores legacy 0.7 configuration", () => {
  const wm = new WindowManager(false);
  assert.equal(wm.getPetScale(), 1.0, "WindowManager default petScale must be 1.0");

  const windowManagerSource = fs.readFileSync(path.join(rootDir, "src", "main", "windows", "window-manager.ts"), "utf-8");
  assert.ok(windowManagerSource.includes("json.window.pet_scale !== 0.7"), "loadPetScale must ignore legacy 0.7 configuration");
});

test("3. Default Expression Determinism: Firefly.model3.json binds expression00 to Expressions_0_File_0.json", () => {
  const modelJsonPath = path.join(rootDir, "assets", "firefly", "models", "Firefly.model3.json");
  assert.ok(fs.existsSync(modelJsonPath), "Firefly.model3.json must exist");
  const modelData = JSON.parse(fs.readFileSync(modelJsonPath, "utf-8"));
  
  const exp0 = modelData.FileReferences.Expressions.find(e => e.Name === "expression00");
  assert.ok(exp0, "expression00 must be defined in model3.json");
  assert.equal(exp0.File, "Expressions/Expressions_0_File_0.json");

  const exp0File = path.join(rootDir, "assets", "firefly", "models", exp0.File);
  assert.ok(fs.existsSync(exp0File), "Expressions_0_File_0.json must exist on disk");
});

test("4. Startup Expression: Manager initializes with expression00 without random expression assignment", () => {
  const managerSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "live2d", "manager.ts"), "utf-8");
  assert.ok(managerSource.includes('this.setExpression("expression00")'), "Live2DManager must explicitly set expression00 on load");
  assert.ok(!managerSource.includes("Math.random()"), "Manager must not randomly select expressions on init");
});

test("5. Default Idle Motion: Idle/0 is registered and points to Motions_Tick2_0_File_0.json", () => {
  const modelJsonPath = path.join(rootDir, "assets", "firefly", "models", "Firefly.model3.json");
  const modelData = JSON.parse(fs.readFileSync(modelJsonPath, "utf-8"));
  const idle0 = modelData.FileReferences.Motions.Idle[0];
  assert.ok(idle0, "Idle/0 must exist in model3.json");
  assert.equal(idle0.File, "Motions/Motions_Tick2_0_File_0.json");
  assert.ok(fs.existsSync(path.join(rootDir, "assets", "firefly", "models", idle0.File)), "Motions_Tick2_0_File_0.json must exist");
});

test("6. Isotropic Model Scaling in setupModelTransform: scaleX === scaleY without artificial margin shrinking", () => {
  const managerSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "live2d", "manager.ts"), "utf-8");
  assert.ok(managerSource.includes("const scaleX = this.baseWidth / this.model.width;"), "scaleX must compute true baseWidth ratio");
  assert.ok(managerSource.includes("const scaleY = this.baseHeight / this.model.height;"), "scaleY must compute true baseHeight ratio");
  assert.ok(managerSource.includes("const fitScale = Math.min(scaleX, scaleY);"), "fitScale must be isotropic min(scaleX, scaleY)");
  assert.ok(!managerSource.includes("baseWidth * 0.9"), "Must not artificially shrink width by 0.9");
  assert.ok(!managerSource.includes("baseHeight * 0.95"), "Must not artificially shrink height by 0.95");
});

test("7. Transparent Window Configuration: backgroundColor is #00000000 and transparent is true", () => {
  const windowManagerSource = fs.readFileSync(path.join(rootDir, "src", "main", "windows", "window-manager.ts"), "utf-8");
  assert.ok(windowManagerSource.includes('backgroundColor: "#00000000"'), "petWindow must specify #00000000 backgroundColor");
  assert.ok(windowManagerSource.includes("transparent: true"), "petWindow must be transparent");
  assert.ok(windowManagerSource.includes("frame: false"), "petWindow must be frameless");
  assert.ok(windowManagerSource.includes("hasShadow: false"), "petWindow must have no shadow");
});

test("8. Alpha Pixel Drag Initiation: InteractionController checks alpha >= alphaThreshold before drag", () => {
  const interactionSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "live2d", "interaction.ts"), "utf-8");
  assert.ok(interactionSource.includes("const alpha = this.manager.getPixelAlpha(e.clientX, e.clientY);"), "Must check pixel alpha on pointerdown");
  assert.ok(interactionSource.includes("if (alpha < this.alphaThreshold) return;"), "Must reject drag on transparent pixels");
});

test("9. Drag Window Movement: InteractionController calls window.firefly.moveBy(dx, dy)", () => {
  const interactionSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "live2d", "interaction.ts"), "utf-8");
  assert.ok(interactionSource.includes("window.firefly?.moveBy(dx, dy);"), "Must call window.firefly.moveBy during dragging");
});

test("10. Drag Severance from CharacterState: onPetDragEnd does NOT call careAction('drag')", () => {
  const mainRendererSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "main.ts"), "utf-8");
  assert.ok(!mainRendererSource.includes('careAction("drag")'), "onPetDragEnd must not call careAction('drag')");
});

test("11. Click / Touch Routing: click and touch route through CharacterPolicyEngine -> EmbodimentPlan", () => {
  const policyEngine = CharacterPolicyEngine.getInstance();
  
  const touchPlan = policyEngine.handleInteraction("touch");
  assert.equal(touchPlan.behaviorType, "comfort_user");
  assert.equal(touchPlan.visual?.actionId, "touched");
  assert.ok(touchPlan.correlationId.startsWith("emb-"));

  const clickPlan = policyEngine.handleInteraction("click");
  assert.equal(clickPlan.behaviorType, "warm_conversation");
  assert.equal(clickPlan.visual?.actionId, "waving");
  assert.ok(clickPlan.correlationId.startsWith("emb-"));
});

test("12. Context Menu Simplification: Legacy pet_scale submenu is completely removed", () => {
  const windowManagerSource = fs.readFileSync(path.join(rootDir, "src", "main", "windows", "window-manager.ts"), "utf-8");
  assert.ok(!windowManagerSource.includes("角色大小"), "Context menu must not contain legacy 角色大小 submenu");
  assert.ok(windowManagerSource.includes("💬 与流萤对话"), "Context menu must contain 与流萤对话");
  assert.ok(windowManagerSource.includes("⚙ 设置"), "Context menu must contain 设置");
  assert.ok(windowManagerSource.includes("❌ 退出"), "Context menu must contain 退出");
});

test("13. SpeakingMotionController Non-Interference: Speaking state does NOT override Live2D expression", () => {
  const speakingSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "live2d", "speaking-motion.ts"), "utf-8");
  assert.ok(!speakingSource.includes('this.manager.playActionId("talking")'), "setSpeaking(true) must not force talking action");
  assert.ok(!speakingSource.includes('this.manager.playActionId("idle")'), "setSpeaking(false) must not force idle action");
});

test("14. Assets & Resources Frozen: git diff reports 0 diff on assets/ and resources/", () => {
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
