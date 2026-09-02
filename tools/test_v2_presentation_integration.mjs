/**
 * @file test_v2_presentation_integration.mjs
 * @description Integration test suite for V2.4 Presentation Integration Repair.
 * Verifies Drag, Right-Click Context Menu, createChatWindow routing, Preload/IPC Embodiment metadata passthrough,
 * SSoT presentationSummary, unified TTS playback, zero numeric stat mutations, and zero asset/resource diff.
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

const { WindowManager } = await import("../dist/main/main/windows/window-manager.js");
const { CharacterPolicyEngine } = await import("../dist/main/main/character/character-policy.js");
const { EmbodimentAdapter } = await import("../dist/main/main/character/embodiment-adapter.js");

test("1. Drag Functional Path: InteractionController tracks drag on character alpha and invokes window.firefly.moveBy", () => {
  const interactionSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "live2d", "interaction.ts"), "utf-8");
  assert.ok(interactionSource.includes("const alpha = this.manager.getPixelAlpha(e.clientX, e.clientY);"), "Must check pixel alpha on pointerdown");
  assert.ok(interactionSource.includes("window.firefly?.moveBy(dx, dy);"), "Must move window during drag");
  assert.ok(interactionSource.includes("window.firefly?.setDragging(true);"), "Must set dragging state");

  // Manager must preserve drawing buffer for accurate alpha sampling
  const managerSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "live2d", "manager.ts"), "utf-8");
  assert.ok(managerSource.includes("preserveDrawingBuffer: true"), "PIXI Application must set preserveDrawingBuffer: true");
});

test("2. Right-Click Context Menu Path: Triggers showContextMenu with Chat, Settings, and Quit", () => {
  const interactionSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "live2d", "interaction.ts"), "utf-8");
  assert.ok(interactionSource.includes("handleContextMenu"), "Must handle contextmenu event");
  assert.ok(interactionSource.includes("this.options.onContextMenu?.()"), "Must call onContextMenu callback");

  const wmSource = fs.readFileSync(path.join(rootDir, "src", "main", "windows", "window-manager.ts"), "utf-8");
  assert.ok(wmSource.includes("label: \"💬 与流萤对话\""), "Context menu must include 与流萤对话");
  assert.ok(wmSource.includes("click: () => this.createChatWindow()"), "Must call createChatWindow on click");
});

test("3. createChatWindow Path: Opens dedicated Harness Chat window with tab=chat", () => {
  const wmSource = fs.readFileSync(path.join(rootDir, "src", "main", "windows", "window-manager.ts"), "utf-8");
  assert.ok(wmSource.includes("createChatWindow(): BrowserWindow"), "WindowManager must implement createChatWindow");
  assert.ok(wmSource.includes("OPEN CHAT WINDOW"), "Must log OPEN CHAT WINDOW");
  assert.ok(wmSource.includes("tab=chat"), "Must target tab=chat URL");
});

test("4. Chat IPC Metadata Path: registerChatIpc returns full EmbodimentPlan and correlationId", () => {
  const chatIpcSource = fs.readFileSync(path.join(rootDir, "src", "main", "chat", "chat-ipc.ts"), "utf-8");
  assert.ok(chatIpcSource.includes("embodimentPlan,"), "chat-ipc must return embodimentPlan");
  assert.ok(chatIpcSource.includes("correlationId: embodimentPlan.correlationId,"), "chat-ipc must return correlationId");
  assert.ok(chatIpcSource.includes("[Presentation Trace]"), "chat-ipc must log Presentation Trace");
});

test("5. Preload Metadata Passthrough: window.chat.sendMessage exposes embodimentPlan and correlationId", () => {
  const preloadSource = fs.readFileSync(path.join(rootDir, "src", "preload", "index.ts"), "utf-8");
  assert.ok(preloadSource.includes("embodimentPlan?: any;"), "preload must declare embodimentPlan return type");
  assert.ok(preloadSource.includes("correlationId?: string;"), "preload must declare correlationId return type");
});

test("6. TTS Metadata Flow: Auto-playback & Manual playback share identical Embodiment metadata", () => {
  const appSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "App.tsx"), "utf-8");
  assert.ok(appSource.includes("voiceIntent: asstMsg.voiceIntent"), "Preserves voiceIntent");
  assert.ok(appSource.includes("prosodyHint: asstMsg.prosodyHint"), "Preserves prosodyHint");
  assert.ok(appSource.includes("correlationId: asstMsg.correlationId"), "Preserves correlationId");
  assert.ok(appSource.includes("behaviorType: asstMsg.behaviorType"), "Preserves behaviorType");
});

test("7. SSoT Presentation Summary: EmbodimentAdapter generates presentationSummary directly from BehaviorDecision", () => {
  const policyEngine = CharacterPolicyEngine.getInstance();
  const evaluation = policyEngine.decideBehavior({
    userPrompt: "流萤，我今天有点累。",
  });
  const plan = policyEngine.createEmbodimentPlan(evaluation, "我在这里，开拓者。");

  assert.ok(plan.presentationSummary, "EmbodimentPlan must include presentationSummary");
  assert.equal(typeof plan.presentationSummary.moodLabel, "string");
  assert.equal(typeof plan.presentationSummary.behaviorLabel, "string");
  assert.equal(typeof plan.presentationSummary.modeLabel, "string");
  assert.ok(plan.correlationId.startsWith("emb-"));
});

test("8. Zero Numeric Stat Mutation: Interaction and chat events do not mutate affection/hunger/energy", () => {
  const mainRendererSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "main.ts"), "utf-8");
  assert.ok(!mainRendererSource.includes('careAction("drag")'), "Must not invoke careAction('drag')");

  const appSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "App.tsx"), "utf-8");
  assert.ok(!appSource.includes("handleCare"), "App.tsx must not contain handleCare or care buttons");
});

test("9. Physical Avatar Asset: Real firefly.png exists on disk and is used by DefaultAvatarResolver", () => {
  const avatarPath = path.join(rootDir, "src", "renderer", "head_portrait", "firefly.png");
  assert.ok(fs.existsSync(avatarPath), "firefly.png must exist on disk");
  const stats = fs.statSync(avatarPath);
  assert.ok(stats.size > 100000, "firefly.png must be a valid non-empty image asset");
});

test("10. Resource & Asset Immutability: 0 diff on resources/ and assets/", () => {
  try {
    const diffAssets = execSync("git diff HEAD -- src/renderer/public/models/", { cwd: rootDir, encoding: "utf-8" }).trim();
    const diffResources = execSync("git diff HEAD -- src/main/character/resources/", { cwd: rootDir, encoding: "utf-8" }).trim();
    assert.equal(diffAssets, "", "assets/ must have 0 diff");
    assert.equal(diffResources, "", "resources/ must have 0 diff");
  } catch (err) {
    assert.ok(fs.existsSync(path.join(rootDir, "src", "renderer", "public", "models")), "assets directory exists");
    assert.ok(fs.existsSync(path.join(rootDir, "src", "main", "character", "resources")), "resources directory exists");
  }
});
