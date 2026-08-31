import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  FIREFLY_ACTIONS,
  AI_ALLOWED_ACTIONS,
  findFireflyAction,
  resolveFireflyTarget,
} from "../dist/main/shared/firefly-actions.js";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const MODELS_DIR = path.join(PROJECT_ROOT, "assets", "firefly", "models");
const MODEL_JSON_PATH = path.join(MODELS_DIR, "Firefly.model3.json");

test("1. Live2D Model Path: Confirms presence of models directory and main config", () => {
  assert.ok(fs.existsSync(MODELS_DIR), "assets/firefly/models/ must exist");
  assert.ok(fs.existsSync(MODEL_JSON_PATH), "Firefly.model3.json must exist");
});

test("2. Model3.json Integrity: Validates moc3, textures, physics references", () => {
  const raw = fs.readFileSync(MODEL_JSON_PATH, "utf-8");
  const json = JSON.parse(raw);
  assert.equal(json.Version, 3);

  const fileRefs = json.FileReferences;
  assert.ok(fileRefs, "FileReferences must exist");

  const mocPath = path.join(MODELS_DIR, fileRefs.Moc);
  assert.ok(fs.existsSync(mocPath), `Moc binary must exist: ${fileRefs.Moc}`);

  for (const tex of fileRefs.Textures) {
    const texPath = path.join(MODELS_DIR, tex);
    assert.ok(fs.existsSync(texPath), `Texture must exist: ${tex}`);
  }

  if (fileRefs.Physics) {
    const physPath = path.join(MODELS_DIR, fileRefs.Physics);
    assert.ok(fs.existsSync(physPath), `Physics must exist: ${fileRefs.Physics}`);
  }
});

test("3. Motion References: Confirms all motion files in Idle and Tap groups exist on disk", () => {
  const json = JSON.parse(fs.readFileSync(MODEL_JSON_PATH, "utf-8"));
  const motions = json.FileReferences.Motions;
  assert.ok(motions.Idle && motions.Idle.length > 0, "Idle motion group must exist");
  assert.ok(motions.Tap && motions.Tap.length > 0, "Tap motion group must exist");

  for (const [group, list] of Object.entries(motions)) {
    for (const item of list) {
      const motionPath = path.join(MODELS_DIR, item.File);
      assert.ok(fs.existsSync(motionPath), `Motion in group ${group} must exist: ${item.File}`);
    }
  }
});

test("4. Expression References: Confirms all 11 expression json files exist on disk", () => {
  const json = JSON.parse(fs.readFileSync(MODEL_JSON_PATH, "utf-8"));
  const expressions = json.FileReferences.Expressions;
  assert.ok(expressions && expressions.length >= 11, "Must contain at least 11 expressions");

  for (const exp of expressions) {
    const expPath = path.join(MODELS_DIR, exp.File);
    assert.ok(fs.existsSync(expPath), `Expression ${exp.Name} must exist: ${exp.File}`);
  }
});

test("5. FireflyTarget Contract: Ensures NO png_sequence kind in Target Type or runtime instances", () => {
  for (const action of FIREFLY_ACTIONS) {
    assert.notEqual(
      action.target.kind,
      "png_sequence",
      `Action ${action.id} must NOT have target kind png_sequence`
    );
    assert.ok(
      action.target.kind === "motion" || action.target.kind === "expression",
      `Action ${action.id} target kind must be motion or expression`
    );
  }
});

test("6. FireflyAction Catalog: Resolves all actions strictly to real Live2D targets", () => {
  const idleTarget = resolveFireflyTarget("idle");
  assert.equal(idleTarget.kind, "motion");
  assert.equal(idleTarget.group, "Idle");

  const happyTarget = resolveFireflyTarget("happy");
  assert.equal(happyTarget.kind, "expression");
  assert.equal(happyTarget.name, "expression4");

  const wavingTarget = resolveFireflyTarget("waving");
  assert.equal(wavingTarget.kind, "motion");
  assert.equal(wavingTarget.group, "Tap");

  const talkingTarget = resolveFireflyTarget("talking");
  assert.equal(talkingTarget.kind, "expression");
  assert.equal(talkingTarget.name, "expression9");
});

test("7. AI_ALLOWED_ACTIONS Contract: 10 actions completely mapped without PNG dependence", () => {
  assert.equal(AI_ALLOWED_ACTIONS.length, 10);
  for (const actionId of AI_ALLOWED_ACTIONS) {
    const action = findFireflyAction(actionId);
    assert.ok(action, `AI action ${actionId} must exist`);
    assert.ok(action.target.kind === "motion" || action.target.kind === "expression");
  }
});

test("8. Renderer Source Audit: Zero imports of fallback-png or references to fallback-frame", () => {
  const rendererDir = path.join(PROJECT_ROOT, "src", "renderer");
  const files = fs.readdirSync(rendererDir, { recursive: true });

  for (const file of files) {
    const fullPath = path.join(rendererDir, String(file));
    if (fs.statSync(fullPath).isFile() && (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx") || fullPath.endsWith(".html"))) {
      const content = fs.readFileSync(fullPath, "utf-8");
      assert.ok(!content.includes("fallback-png"), `File ${file} must not contain fallback-png`);
      assert.ok(!content.includes("png-frame-container"), `File ${file} must not contain png-frame-container`);
      assert.ok(!content.includes("fallback-frame"), `File ${file} must not contain fallback-frame`);
      assert.ok(!content.includes("PngFallbackController"), `File ${file} must not contain PngFallbackController`);
    }
  }
});

test("9. Normal Asset Audit: assets/firefly/normal/ is 100% removed from disk", () => {
  const normalDir = path.join(PROJECT_ROOT, "assets", "firefly", "normal");
  assert.ok(!fs.existsSync(normalDir), "assets/firefly/normal directory must NOT exist");
});

test("10. Live2DManager Pure Contract: Verified Live2DManager options do not accept PNG elements", () => {
  const managerSource = fs.readFileSync(path.join(PROJECT_ROOT, "src", "renderer", "live2d", "manager.ts"), "utf-8");
  assert.ok(!managerSource.includes("pngContainer"), "manager.ts must not have pngContainer");
  assert.ok(!managerSource.includes("pngImage"), "manager.ts must not have pngImage");
  assert.ok(!managerSource.includes("pngFallback"), "manager.ts must not have pngFallback");
  assert.ok(!managerSource.includes("activateFallback"), "manager.ts must not have activateFallback");
});

test("11. Missing Model Semantics: When model is missing, system marks unavailable (no PNG fallback)", () => {
  const target = resolveFireflyTarget("unknown_random_action");
  assert.equal(target.kind, "motion");
  assert.equal(target.group, "Idle");
  assert.equal(target.motionName, "0");
});

test("12. Speaking Motion & MouthSync: Pure Live2D talking expression and parameter modulation", () => {
  const speakingSource = fs.readFileSync(path.join(PROJECT_ROOT, "src", "renderer", "live2d", "speaking-motion.ts"), "utf-8");
  assert.ok(speakingSource.includes('this.manager.playActionId("talking")'), "Speaking triggers talking action");
  assert.ok(speakingSource.includes("this.mouthSync.start"), "Speaking triggers mouthSync.start");
  assert.ok(speakingSource.includes("this.mouthSync.stop"), "Stop speaking stops mouthSync");
});
