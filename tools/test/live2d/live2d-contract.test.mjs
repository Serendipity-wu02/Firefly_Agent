import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

import {
  FIREFLY_ACTIONS,
  AI_ALLOWED_ACTIONS,
  findFireflyAction,
  resolveFireflyTarget,
} from "../../../dist/main/shared/firefly-actions.js";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../../..");
const MODELS_DIR = path.join(PROJECT_ROOT, "src", "renderer", "models");
const MODEL_JSON_PATH = path.join(MODELS_DIR, "Firefly.model3.json");

test("1. Model3.json: Root configuration exists and parses cleanly", () => {
  assert.ok(fs.existsSync(MODEL_JSON_PATH), "Firefly.model3.json must exist in models root");
  const json = JSON.parse(fs.readFileSync(MODEL_JSON_PATH, "utf-8"));
  assert.equal(json.Version, 3);
  assert.ok(json.FileReferences, "Must have FileReferences");
});

test("2. Moc Binary: Model3 Moc reference exists on disk", () => {
  const json = JSON.parse(fs.readFileSync(MODEL_JSON_PATH, "utf-8"));
  const mocFile = json.FileReferences.Moc;
  assert.ok(mocFile, "Moc file reference must be present");
  const mocPath = path.join(MODELS_DIR, mocFile);
  assert.ok(fs.existsSync(mocPath), `Moc binary must exist: ${mocFile}`);
  const stat = fs.statSync(mocPath);
  assert.ok(stat.size > 100_000, `Moc binary must have valid size, got ${stat.size}`);
});

test("3. Textures: All Model3 Texture files exist on disk", () => {
  const json = JSON.parse(fs.readFileSync(MODEL_JSON_PATH, "utf-8"));
  const textures = json.FileReferences.Textures;
  assert.ok(Array.isArray(textures) && textures.length > 0, "Must have at least 1 texture");
  for (const tex of textures) {
    const texPath = path.join(MODELS_DIR, tex);
    assert.ok(fs.existsSync(texPath), `Texture must exist: ${tex}`);
    const stat = fs.statSync(texPath);
    assert.ok(stat.size > 1_000_000, `Texture png must have valid size, got ${stat.size}`);
  }
});

test("4. Physics: Model3 Physics configuration exists on disk", () => {
  const json = JSON.parse(fs.readFileSync(MODEL_JSON_PATH, "utf-8"));
  const physicsFile = json.FileReferences.Physics;
  assert.ok(physicsFile, "Physics file reference must be present");
  const physicsPath = path.join(MODELS_DIR, physicsFile);
  assert.ok(fs.existsSync(physicsPath), `Physics json must exist: ${physicsFile}`);
});

test("5. Motion Paths: All motions in Idle and Tap groups resolve 100% to models/Motions/", () => {
  const json = JSON.parse(fs.readFileSync(MODEL_JSON_PATH, "utf-8"));
  const motions = json.FileReferences.Motions;
  assert.ok(motions.Idle && motions.Idle.length === 3, "Idle motion group must contain 3 items");
  assert.ok(motions.Tap && motions.Tap.length === 3, "Tap motion group must contain 3 items");

  for (const [group, list] of Object.entries(motions)) {
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      assert.ok(item.File.startsWith("Motions/"), `Motion path must point to Motions/ folder: ${item.File}`);
      const motionPath = path.join(MODELS_DIR, item.File);
      assert.ok(fs.existsSync(motionPath), `Motion [${group}][${i}] must exist on disk: ${item.File}`);
      const content = JSON.parse(fs.readFileSync(motionPath, "utf-8"));
      assert.ok(content.Curves || content.Meta, `Motion [${group}][${i}] must have valid Cubism motion structure`);
    }
  }
});

test("6. Expression Paths: All 11 expressions resolve 100% to models/Expressions/", () => {
  const json = JSON.parse(fs.readFileSync(MODEL_JSON_PATH, "utf-8"));
  const expressions = json.FileReferences.Expressions;
  assert.ok(Array.isArray(expressions) && expressions.length === 11, "Must contain exactly 11 expressions");

  for (let i = 0; i < expressions.length; i++) {
    const exp = expressions[i];
    assert.ok(exp.File.startsWith("Expressions/"), `Expression path must point to Expressions/ folder: ${exp.File}`);
    const expPath = path.join(MODELS_DIR, exp.File);
    assert.ok(fs.existsSync(expPath), `Expression [${exp.Name}] must exist on disk: ${exp.File}`);
    const content = JSON.parse(fs.readFileSync(expPath, "utf-8"));
    assert.ok(content.Type === "Live2D Expression", `Expression must have Live2D Expression type`);
    assert.ok(Array.isArray(content.Parameters), `Expression must contain Parameters array`);
  }
});

test("7. Baseline Assets: expression00 and Idle/0 resolve to the canonical model assets", () => {
  const json = JSON.parse(fs.readFileSync(MODEL_JSON_PATH, "utf-8"));
  const baselineExpression = json.FileReferences.Expressions.find((expression) => expression.Name === "expression00");
  assert.ok(baselineExpression);
  assert.equal(baselineExpression.File, "Expressions/Expressions_0_File_0.json");
  assert.equal(json.FileReferences.Motions.Idle[0].File, "Motions/Motions_Tick2_0_File_0.json");
});

test("8. Idle Group Integrity: Validates 3 Tick motions for standing idle states", () => {
  const json = JSON.parse(fs.readFileSync(MODEL_JSON_PATH, "utf-8"));
  const idleList = json.FileReferences.Motions.Idle;
  assert.equal(idleList.length, 3);
  assert.equal(idleList[0].File, "Motions/Motions_Tick2_0_File_0.json");
  assert.equal(idleList[1].File, "Motions/Motions_Tick2_1_File_0.json");
  assert.equal(idleList[2].File, "Motions/Motions_Tick2_2_File_0.json");
});

test("9. Tap Group Integrity: Validates 3 interactive motion curves", () => {
  const json = JSON.parse(fs.readFileSync(MODEL_JSON_PATH, "utf-8"));
  const tapList = json.FileReferences.Motions.Tap;
  assert.equal(tapList.length, 3);
  assert.equal(tapList[0].File, "Motions/Motions_表情组_0_File_0.json");
  assert.equal(tapList[1].File, "Motions/Motions_表情组_1_File_0.json");
  assert.equal(tapList[2].File, "Motions/Motions_表情组_2_File_0.json");
});

test("10. Action Resolution: All 10 AI_ALLOWED_ACTIONS resolve to existing Motion/Expression", () => {
  const json = JSON.parse(fs.readFileSync(MODEL_JSON_PATH, "utf-8"));
  const expressions = new Set(json.FileReferences.Expressions.map((e) => e.Name));
  const motions = json.FileReferences.Motions;

  assert.equal(AI_ALLOWED_ACTIONS.length, 10);
  for (const actionId of AI_ALLOWED_ACTIONS) {
    const action = findFireflyAction(actionId);
    assert.ok(action, `Action ${actionId} must exist in catalog`);
    const target = action.target;
    if (target.kind === "motion") {
      assert.ok(motions[target.group], `Motion group ${target.group} must exist for action ${actionId}`);
      const idx = parseInt(target.motionName, 10);
      assert.ok(!isNaN(idx) && idx < motions[target.group].length, `Motion index ${target.motionName} valid for ${actionId}`);
    } else if (target.kind === "expression") {
      assert.ok(expressions.has(target.name), `Expression ${target.name} must exist in model3.json for action ${actionId}`);
    } else {
      assert.fail(`Invalid target kind for action ${actionId}`);
    }
  }

  const unknownTarget = resolveFireflyTarget("unknown_random_action");
  assert.equal(unknownTarget.kind, "motion");
  assert.equal(unknownTarget.group, "Idle");
  assert.equal(unknownTarget.motionName, "0");
});

test("11. Speaking Controller Flow: Validates talking expression and idle restoration", () => {
  const talkingAction = findFireflyAction("talking");
  assert.ok(talkingAction);
  assert.equal(talkingAction.target.kind, "expression");
  assert.equal(talkingAction.target.name, "expression9");

  const idleAction = findFireflyAction("idle");
  assert.ok(idleAction);
  assert.equal(idleAction.target.kind, "motion");
  assert.equal(idleAction.target.group, "Idle");
});

test("12. Renderer Contract: Live2D source contains no PNG fallback ownership", () => {
  const rendererDir = path.join(PROJECT_ROOT, "src", "renderer");
  const files = fs.readdirSync(rendererDir, { recursive: true });

  for (const file of files) {
    const fullPath = path.join(rendererDir, String(file));
    if (!fs.statSync(fullPath).isFile() || !/[.]tsx?$|[.]html$/.test(fullPath)) continue;
    const source = fs.readFileSync(fullPath, "utf-8");
    assert.ok(!source.includes("png_sequence"), `${file} must not reference png_sequence`);
    assert.ok(!source.includes("fallback-png"), `${file} must not reference fallback-png`);
    assert.ok(!source.includes("fallback-frame"), `${file} must not reference fallback-frame`);
    assert.ok(!source.includes("PngFallbackController"), `${file} must not reference PngFallbackController`);
  }
});

test("13. Live2DManager Contract: Manager owns only real model assets and no PNG fallback elements", () => {
  const managerSource = fs.readFileSync(path.join(PROJECT_ROOT, "src", "renderer", "live2d", "manager.ts"), "utf-8");
  assert.ok(!managerSource.includes("pngContainer"));
  assert.ok(!managerSource.includes("pngImage"));
  assert.ok(!managerSource.includes("pngFallback"));
  assert.ok(!managerSource.includes("activateFallback"));
});

test("14. Speaking Contract: Speaking state uses mouthSync without motion or expression ownership", () => {
  const speakingSource = fs.readFileSync(path.join(PROJECT_ROOT, "src", "renderer", "live2d", "speaking-motion.ts"), "utf-8");
  assert.ok(speakingSource.includes("this.mouthSync.start"));
  assert.ok(speakingSource.includes("this.mouthSync.stop"));
  assert.ok(!speakingSource.includes('this.manager.playActionId("talking")'));
  assert.ok(!speakingSource.includes('this.manager.playActionId("idle")'));
});

test("15. Cubism Runtime: Renderer loads the real Cubism runtime and build output contains it", () => {
  const rendererHtml = fs.readFileSync(path.join(PROJECT_ROOT, "src", "renderer", "index.html"), "utf-8");
  assert.ok(rendererHtml.includes('src="./live2d/live2dcubismcore.min.js"'));
  const runtimePath = path.join(PROJECT_ROOT, "dist", "renderer", "live2d", "live2dcubismcore.min.js");
  assert.ok(fs.existsSync(runtimePath), "Built Cubism runtime must exist");
  assert.ok(fs.statSync(runtimePath).size > 100_000, "Built Cubism runtime must be non-empty");
});

test("16. Asset Immutability: Live2D model assets have no Git diff", () => {
  const diff = execSync("git diff HEAD -- src/renderer/models/", { cwd: PROJECT_ROOT, encoding: "utf-8" }).trim();
  assert.equal(diff, "");
});
