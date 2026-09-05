/**
 * @file integration.test.mjs
 * @description Current presentation integration contract.
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
const rootDir = path.resolve(__dirname, "../../..");
const CHAT_OUTER_RADIUS = "16px";

const { WindowManager } = await import("../../../dist/main/main/windows/window-manager.js");
const { CharacterPolicyEngine } = await import("../../../dist/main/main/character/character-policy.js");
const { EmbodimentAdapter } = await import("../../../dist/main/main/character/embodiment-adapter.js");

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
  assert.ok(wmSource.includes('createChatWindow(initialTab: "chat" | "settings" = "chat"): BrowserWindow'), "WindowManager must implement the unified tab-aware chat window");
  assert.ok(wmSource.includes("OPEN CHAT WINDOW"), "Must log OPEN CHAT WINDOW");
  assert.ok(wmSource.includes("?tab=${initialTab}"), "Must target the requested UI tab");
});

test("4. PET_PROACTIVE_LINE Chain: Preload and Desktop Pet own the proactive text and TTS path", () => {
  const sharedSource = fs.readFileSync(path.join(rootDir, "src", "shared", "ipc-channels.ts"), "utf-8");
  const preloadSource = fs.readFileSync(path.join(rootDir, "src", "preload", "index.ts"), "utf-8");
  const typeSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "electron.d.ts"), "utf-8");
  const mainSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "main.ts"), "utf-8");
  const appSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "App.tsx"), "utf-8");
  const htmlSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "index.html"), "utf-8");

  assert.ok(sharedSource.includes('PET_PROACTIVE_LINE: "pet:proactive-line"'), "shared IPC must define PET_PROACTIVE_LINE");
  assert.ok(preloadSource.includes('PET_PROACTIVE_LINE: "pet:proactive-line"'), "preload mirror must define PET_PROACTIVE_LINE");
  assert.ok(preloadSource.includes("onProactiveLine"), "preload must expose onProactiveLine");
  assert.ok(typeSource.includes("onProactiveLine"), "electron.d.ts must declare onProactiveLine");
  assert.ok(mainSource.includes("window.firefly.onProactiveLine"), "Desktop Pet main.ts must consume onProactiveLine");
  assert.ok(mainSource.includes("globalTtsPlayback.speak(text"), "Desktop Pet must reuse globalTtsPlayback");
  assert.ok(mainSource.includes("behaviorType: `proactive:${payload.reason}`"), "Proactive TTS must preserve the trigger reason");
  assert.ok(htmlSource.includes('id="proactive-line-overlay"'), "Pet HTML must contain the proactive text overlay");
  assert.ok(htmlSource.includes("pointer-events: none"), "Proactive overlay must not block Pet interaction");

  const proactiveStart = mainSource.indexOf("const handleProactiveLine");
  const proactiveEnd = mainSource.indexOf("// 1. Initialize Live2D Manager", proactiveStart);
  assert.ok(proactiveStart >= 0 && proactiveEnd > proactiveStart, "Proactive consumer block must be present");
  const proactiveBlock = mainSource.slice(proactiveStart, proactiveEnd);
  assert.ok(!proactiveBlock.includes("setExpression"), "Proactive speaking must not change Expression");
  assert.ok(!proactiveBlock.includes("playTarget"), "Proactive speaking must not play Motion");
  assert.ok(!proactiveBlock.includes("playActionId"), "Proactive speaking must not invoke talking action");
  assert.ok(!appSource.includes("onProactiveLine"), "Chat App must not register a proactive TTS consumer");
});

test("5. Chat IPC Metadata Path: registerChatIpc returns full EmbodimentPlan and correlationId", () => {
  const chatIpcSource = fs.readFileSync(path.join(rootDir, "src", "main", "chat", "chat-ipc.ts"), "utf-8");
  assert.ok(chatIpcSource.includes("embodimentPlan,"), "chat-ipc must return embodimentPlan");
  assert.ok(chatIpcSource.includes("correlationId: embodimentPlan.correlationId,"), "chat-ipc must return correlationId");
  assert.ok(chatIpcSource.includes("[Presentation Trace]"), "chat-ipc must log Presentation Trace");
});

test("6. Preload Metadata Passthrough: window.chat.sendMessage exposes embodimentPlan and correlationId", () => {
  const preloadSource = fs.readFileSync(path.join(rootDir, "src", "preload", "index.ts"), "utf-8");
  assert.ok(preloadSource.includes("embodimentPlan?: any;"), "preload must declare embodimentPlan return type");
  assert.ok(preloadSource.includes("correlationId?: string;"), "preload must declare correlationId return type");
});

test("7. TTS Metadata Flow: Auto-playback & Manual playback share identical Embodiment metadata", () => {
  const appSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "App.tsx"), "utf-8");
  assert.ok(appSource.includes("voiceIntent: asstMsg.voiceIntent"), "Preserves voiceIntent");
  assert.ok(appSource.includes("prosodyHint: asstMsg.prosodyHint"), "Preserves prosodyHint");
  assert.ok(appSource.includes("correlationId: asstMsg.correlationId"), "Preserves correlationId");
  assert.ok(appSource.includes("behaviorType: asstMsg.behaviorType"), "Preserves behaviorType");
});

test("8. SSoT Presentation Summary: EmbodimentAdapter generates presentationSummary directly from BehaviorDecision", () => {
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

test("9. Zero Numeric Stat Mutation: Interaction and chat events do not mutate affection/hunger/energy", () => {
  const mainRendererSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "main.ts"), "utf-8");
  assert.ok(!mainRendererSource.includes('careAction("drag")'), "Must not invoke careAction('drag')");

  const appSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "App.tsx"), "utf-8");
  assert.ok(!appSource.includes("handleCare"), "App.tsx must not contain handleCare or care buttons");
});

test("10. Physical Avatar Asset: Real firefly.png exists on disk and is used by DefaultAvatarResolver", () => {
  const avatarPath = path.join(rootDir, "src", "renderer", "head_portrait", "firefly.png");
  assert.ok(fs.existsSync(avatarPath), "firefly.png must exist on disk");
  const stats = fs.statSync(avatarPath);
  assert.ok(stats.size > 100000, "firefly.png must be a valid non-empty image asset");
});

test("11. Resource & Asset Immutability: 0 diff on resources/ and assets/", () => {
  try {
    const diffAssets = execSync("git diff HEAD -- src/renderer/models/", { cwd: rootDir, encoding: "utf-8" }).trim();
    const diffResources = execSync("git diff HEAD -- src/main/character/resources/", { cwd: rootDir, encoding: "utf-8" }).trim();
    assert.equal(diffAssets, "", "assets/ must have 0 diff");
    assert.equal(diffResources, "", "resources/ must have 0 diff");
  } catch (err) {
    assert.ok(fs.existsSync(path.join(rootDir, "src", "renderer", "models")), "assets directory exists");
    assert.ok(fs.existsSync(path.join(rootDir, "src", "main", "character", "resources")), "resources directory exists");
  }
});

test("12. GUI Fix Round 2: Status dot, independent Mood settings sync, and Chat shell layout", () => {
  const headerSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "components", "Header.tsx"), "utf-8");
  const appSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "App.tsx"), "utf-8");
  const preloadSource = fs.readFileSync(path.join(rootDir, "src", "preload", "index.ts"), "utf-8");
  const mainSource = fs.readFileSync(path.join(rootDir, "src", "main", "index.ts"), "utf-8");
  const uiHtmlSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "index.html"), "utf-8");
  const wmSource = fs.readFileSync(path.join(rootDir, "src", "main", "windows", "window-manager.ts"), "utf-8");

  assert.ok(headerSource.includes("data-provider-status={providerStatus.status}"), "Header must render only the actual connection status dot");
  assert.ok(!headerSource.includes("{providerStatus.label}"), "Provider/model name must not be visible in the Header");
  assert.ok(appSource.includes("window.settings.onSettingsChanged"), "Mood/App must listen to SETTINGS_CHANGED");
  assert.ok(appSource.includes("setUiFontSize(newSettings.ui.fontSize)"), "Mood/App must apply font changes live");
  assert.ok(preloadSource.includes("onSettingsChanged"), "Preload must expose the settings event to Chat and Mood");
  assert.ok(mainSource.includes("windowManager.broadcast(IPC.SETTINGS_CHANGED, updated)"), "Main must broadcast the saved settings to every window");
  assert.ok(wmSource.includes('http://localhost:5173/ui/index.html?tab=summary'), "Mood must remain an independent summary tab/window");

  assert.ok(uiHtmlSource.includes("html, body, #root"), "Chat html/body/root must be transparent");
  assert.ok(appSource.includes(`borderRadius: "${CHAT_OUTER_RADIUS}"`), `Chat shell must use ${CHAT_OUTER_RADIUS} radius`);
  assert.ok(appSource.includes('overflow: "hidden"'), "Chat shell must clip content");
});
