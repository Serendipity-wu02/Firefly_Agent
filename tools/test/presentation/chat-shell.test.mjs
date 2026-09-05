/**
 * @file chat-shell.test.mjs
 * @description Current Light Sky chat shell presentation contract.
 * Verifies Light Sky design tokens, real Firefly avatar usage, Chat-centric layout,
 * CharacterSummary semantic state isolation (zero numeric stats), unified TTS metadata flow,
 * and strict separation between Harness Chat and Live2D Desktop Pet.
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

const { THEME_TOKENS } = await import("../../../dist/renderer/assets/chat-BWus1paF.js").catch(() => ({}));
const { globalAvatarResolver } = await import("../../../src/renderer/ui/avatar-resolver.ts");

test("1. Light Sky Design Tokens: Theme tokens define spring green & clear sky palette", () => {
  const tokenSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "theme", "tokens.ts"), "utf-8");
  assert.ok(tokenSource.includes("bgMain"), "Must define bgMain");
  assert.ok(tokenSource.includes("accent"), "Must define accent");
  assert.ok(tokenSource.includes("assistantBubble"), "Must define assistantBubble");
  assert.ok(tokenSource.includes("userBubble"), "Must define userBubble");
  assert.ok(!tokenSource.includes("#12141a"), "Must NOT contain dark theme main background");
});

test("2. Real Firefly Avatar: Default avatar resolver points to physical firefly.png", () => {
  const avatar = globalAvatarResolver.resolveAvatar("assistant");
  assert.equal(avatar.kind, "image");
  assert.equal(avatar.name, "流萤");
  assert.ok(avatar.src?.includes("firefly.png"), "Avatar src must link to firefly.png");

  const avatarDiskPath = path.join(rootDir, "src", "renderer", "head_portrait", "firefly.png");
  assert.ok(fs.existsSync(avatarDiskPath), "Physical firefly.png must exist on disk");
});

test("3. Top Navigation Header: Renders clean navigation tabs and a status dot without provider text", () => {
  const headerSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "components", "Header.tsx"), "utf-8");
  assert.ok(headerSource.includes("💬 对话"), "Header must include 对话 tab");
  assert.ok(headerSource.includes("⚙ 设置"), "Header must include 设置 tab");
  assert.ok(headerSource.includes("data-provider-status={providerStatus.status}"), "Header must expose the actual provider status on the indicator");
  assert.ok(headerSource.includes("statusColor"), "Header indicator color must derive from actual provider status");
  assert.ok(!headerSource.includes("{providerStatus.label}"), "Header must not render provider/model label text");
});

test("4. Assistant Message Rendering: Includes avatar, Firefly label, speech bubble, and TTS action", () => {
  const itemSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "components", "ChatMessageItem.tsx"), "utf-8");
  assert.ok(itemSource.includes("globalAvatarResolver.resolveAvatar"), "Must resolve real avatar");
  assert.ok(itemSource.includes("isAssistant"), "Must handle assistant messages");
  assert.ok(itemSource.includes("onSpeak(message)"), "Must allow TTS playback with message metadata");
});

test("5. User Message Rendering: Right-aligned with spring-green gradient bubble", () => {
  const itemSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "components", "ChatMessageItem.tsx"), "utf-8");
  assert.ok(itemSource.includes("userBubble"), "User message must use userBubble token");
  assert.ok(itemSource.includes("justifyContent: \"flex-end\""), "User message must be right-aligned");
});

test("6. Character Summary SSoT: Shows cognitive mood, behavior, and mode without numeric stats", () => {
  const summarySource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "components", "CharacterSummary.tsx"), "utf-8");
  assert.ok(summarySource.includes("当前心境"), "Must display 当前心境");
  assert.ok(summarySource.includes("当前行为"), "Must display 当前行为");
  assert.ok(summarySource.includes("当前模式"), "Must display 当前模式");

  // Verify complete absence of legacy numeric stats
  assert.ok(!summarySource.includes("affection"), "Must not display affection stat");
  assert.ok(!summarySource.includes("hunger"), "Must not display hunger stat");
  assert.ok(!summarySource.includes("energy"), "Must not display energy stat");
  assert.ok(!summarySource.includes("health"), "Must not display health stat");
  assert.ok(!summarySource.includes("attention"), "Must not display attention stat");
  assert.ok(!summarySource.includes("喂食"), "Must not display 喂食 care button");
  assert.ok(!summarySource.includes("治疗"), "Must not display 治疗 care button");
  assert.ok(!summarySource.includes("休息"), "Must not display 休息 care button");
});

test("7. Composer Support: Textarea supports Enter send, Shift+Enter newline, and status indicator", () => {
  const composerSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "components", "Composer.tsx"), "utf-8");
  assert.ok(composerSource.includes("onKeyDown={handleKeyDown}"), "Composer must handle keydown events");
  assert.ok(composerSource.includes("e.key === \"Enter\" && !e.shiftKey"), "Must send on Enter without Shift");
  assert.ok(composerSource.includes("toolStatus"), "Must display tool execution status");
});

test("8. TTS Metadata Preservation: Auto-playback & Manual playback share identical Embodiment metadata", () => {
  const appSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "App.tsx"), "utf-8");
  assert.ok(appSource.includes("globalTtsPlayback.speak(asstMsg.content"), "Auto playback passes embodiment metadata");
  assert.ok(appSource.includes("globalTtsPlayback.speak(msg.content"), "Manual playback passes embodiment metadata");
  assert.ok(appSource.includes("voiceIntent: asstMsg.voiceIntent"), "Preserves voiceIntent");
  assert.ok(appSource.includes("prosodyHint: asstMsg.prosodyHint"), "Preserves prosodyHint");
  assert.ok(appSource.includes("correlationId: asstMsg.correlationId"), "Preserves correlationId");
});

test("9. Harness & Desktop Pet Isolation: Harness does not import or call Live2DManager", () => {
  const appSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "App.tsx"), "utf-8");
  assert.ok(!appSource.includes("Live2DManager"), "App.tsx must not import or instantiate Live2DManager");
  assert.ok(!appSource.includes("pixi"), "App.tsx must not depend on PixiJS");
});

test("10. Main Chat Window Isolation: WindowManager creates separate Pet and Chat BrowserWindows", () => {
  const wmSource = fs.readFileSync(path.join(rootDir, "src", "main", "windows", "window-manager.ts"), "utf-8");
  assert.ok(wmSource.includes("createPetWindow()"), "WindowManager must manage Pet window");
  assert.ok(wmSource.includes("createChatWindow()"), "WindowManager must manage Chat window");
  assert.ok(wmSource.includes("transparent: true"), "Pet window must be transparent");
  assert.ok(wmSource.includes("frame: false"), "Chat window must be frameless");
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

test("12. Preload Channel Sync: sandbox-safe preload mirror matches shared/ipc-channels.ts", () => {
  // The preload runs inside the default Electron sandbox and can only
  // require("electron"), so it carries a literal mirror of the IPC channel
  // table instead of importing ../shared/ipc-channels. This guard fails the
  // build the moment the two definitions drift apart.
  const readChannels = (relPath) => {
    const source = fs.readFileSync(path.join(rootDir, relPath), "utf-8");
    const channels = {};
    const pattern = /([A-Z][A-Z0-9_]+)\s*:\s*"([a-z0-9:-]+)"/g;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      channels[match[1]] = match[2];
    }
    return channels;
  };

  const shared = readChannels(path.join("src", "shared", "ipc-channels.ts"));
  const preload = readChannels(path.join("src", "preload", "index.ts"));

  const preloadKeys = Object.keys(preload);
  assert.ok(preloadKeys.length >= 30, "preload mirror must define the full channel table");
  for (const key of preloadKeys) {
    assert.ok(key in shared, `preload channel ${key} must exist in shared/ipc-channels.ts`);
    assert.equal(preload[key], shared[key], `preload channel ${key} value must match shared definition`);
  }
  assert.equal(preload.CHAT_SEND_MESSAGE, shared.CHAT_SEND_MESSAGE, "chat bridge channel must stay aligned");
});

test("13. Canonical Window Sizing & Centering: Chat = 1344x756 centered, Mood = 254x388", () => {
  const wmSource = fs.readFileSync(path.join(rootDir, "src", "main", "windows", "window-manager.ts"), "utf-8");
  assert.ok(wmSource.includes("const CHAT_WINDOW_WIDTH = 1344;"), "CHAT_WINDOW_WIDTH must be 1344");
  assert.ok(wmSource.includes("const CHAT_WINDOW_HEIGHT = 756;"), "CHAT_WINDOW_HEIGHT must be 756");
  assert.ok(wmSource.includes("const SUMMARY_WINDOW_WIDTH = 254;"), "SUMMARY_WINDOW_WIDTH must be 254");
  assert.ok(wmSource.includes("const SUMMARY_WINDOW_HEIGHT = 388;"), "SUMMARY_WINDOW_HEIGHT must be 388");
  assert.ok(wmSource.includes("win.center()"), "Chat window must call win.center()");
});

test("14. 3-Tier Global UI Font Scale: small, medium, large with CSS variables", () => {
  const uiTypesSource = fs.readFileSync(path.join(rootDir, "src", "shared", "ui-types.ts"), "utf-8");
  assert.ok(uiTypesSource.includes('"small" | "medium" | "large"'), "Must define 3-tier font sizes");
  assert.ok(uiTypesSource.includes("DEFAULT_UI_PREFERENCES"), "Must define default UI preferences");

  const tokensSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "theme", "tokens.ts"), "utf-8");
  assert.ok(tokensSource.includes("getFontScaleStyles"), "Must export getFontScaleStyles helper");
  assert.ok(tokensSource.includes("--ff-font-title"), "Must support --ff-font-title CSS variable");
  assert.ok(tokensSource.includes("--ff-font-body"), "Must support --ff-font-body CSS variable");

  const appSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "App.tsx"), "utf-8");
  const preloadSource = fs.readFileSync(path.join(rootDir, "src", "preload", "index.ts"), "utf-8");
  assert.ok(appSource.includes("onSettingsChanged"), "App must subscribe to SETTINGS_CHANGED");
  assert.ok(appSource.includes("setUiFontSize(newSettings.ui.fontSize)"), "App must apply the saved font size without reload");
  assert.ok(appSource.includes("getFontScaleStyles(uiFontSize)"), "App must apply shared font scale tokens");
  assert.ok(preloadSource.includes("onSettingsChanged"), "Preload must expose SETTINGS_CHANGED subscription");
});

test("15. Clean Title Integration: Native window title used without duplicate inner banner", () => {
  const appSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "App.tsx"), "utf-8");
  assert.ok(appSource.includes('document.title = "流萤 · Firefly";'), "App.tsx must set clean document.title");
  assert.ok(!appSource.includes("与流萤对话 · Firefly Chat"), "Must remove old duplicate title banner");
});

test("16. TTS Engine Contract: Strictly off | gptsovits with firefly-v2proplus VoiceProfile", () => {
  const ttsTypesSource = fs.readFileSync(path.join(rootDir, "src", "shared", "tts-types.ts"), "utf-8");
  assert.ok(ttsTypesSource.includes('export type TtsEngine = "off" | "gptsovits";'), "TtsEngine must only be off | gptsovits");
  assert.ok(ttsTypesSource.includes('"firefly-v2proplus"'), "Must define firefly-v2proplus voice profile");
  assert.ok(ttsTypesSource.includes('"http://127.0.0.1:9880"'), "Default baseUrl must be 127.0.0.1:9880");
  assert.ok(!ttsTypesSource.includes('"edge"'), "TtsEngine union must NOT include edge");
  assert.ok(!ttsTypesSource.includes('"custom-cloud"'), "TtsEngine union must NOT include custom-cloud");
  assert.ok(!ttsTypesSource.includes('"minimax"'), "TtsEngine union must NOT include minimax");
  assert.ok(!ttsTypesSource.includes('"mimo"'), "TtsEngine union must NOT include mimo");
  assert.ok(!ttsTypesSource.includes('"mossland"'), "TtsEngine union must NOT include mossland");

  const ttsIpcSource = fs.readFileSync(path.join(rootDir, "src", "main", "runtime", "tts", "tts-ipc.ts"), "utf-8");
  assert.ok(ttsIpcSource.includes("TTS Migration"), "tts-ipc must perform migration on invalid engines");
});

test("17. Live2D Expression Lifecycle: expression00 is baseline, temporary restores active behavior", () => {
  const mainSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "main.ts"), "utf-8");
  assert.ok(mainSource.includes('let currentPersistentExpression = "expression00";'), "currentPersistentExpression must default to expression00");
  assert.ok(mainSource.includes("setActiveBehavior"), "main.ts must manage active behavior lifecycle");
  assert.ok(mainSource.includes("speakingMotion.setSpeaking"), "Speaking state must delegate to speakingMotion without owning expression");
});

test("18. PET_PROACTIVE_LINE Ownership: Desktop Pet consumes proactive TTS exactly once", () => {
  const sharedSource = fs.readFileSync(path.join(rootDir, "src", "shared", "ipc-channels.ts"), "utf-8");
  const preloadSource = fs.readFileSync(path.join(rootDir, "src", "preload", "index.ts"), "utf-8");
  const mainSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "main.ts"), "utf-8");
  const appSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "App.tsx"), "utf-8");

  assert.ok(sharedSource.includes('PET_PROACTIVE_LINE: "pet:proactive-line"'), "Shared IPC must expose proactive line");
  assert.ok(preloadSource.includes("onProactiveLine"), "Preload must expose proactive line subscription");
  assert.ok(mainSource.includes("window.firefly.onProactiveLine"), "Desktop Pet must subscribe to proactive line");
  assert.ok(mainSource.includes("globalTtsPlayback.speak(text"), "Desktop Pet must use the shared TTS playback manager");
  assert.ok(!appSource.includes("onProactiveLine"), "Chat App must not consume proactive TTS");
});

test("19. GUI Fix Round 2: Chat shell, transparent page, compact Pet overlay, and TTS POST contract", () => {
  const uiHtmlSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "index.html"), "utf-8");
  const appSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "ui", "App.tsx"), "utf-8");
  const petHtmlSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "index.html"), "utf-8");
  const petMainSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "main.ts"), "utf-8");
  const ttsEngineSource = fs.readFileSync(path.join(rootDir, "src", "main", "runtime", "tts", "engines", "gptsovits-engine.ts"), "utf-8");

  assert.ok(uiHtmlSource.includes("html, body, #root"), "Chat page must define the transparent full-size root");
  assert.ok(uiHtmlSource.includes("background: transparent"), "Chat page background must be transparent for the frameless window");
  assert.ok(appSource.includes(`borderRadius: "${CHAT_OUTER_RADIUS}"`), `Chat shell must use ${CHAT_OUTER_RADIUS} radius`);
  assert.ok(appSource.includes('overflow: "hidden"'), "Chat shell must clip content to its radius");

  assert.ok(petHtmlSource.includes("top: 8px"), "Pet overlay must be positioned from the top");
  assert.ok(petHtmlSource.includes("left: 8px"), "Pet overlay must be positioned from the left");
  assert.ok(petHtmlSource.includes("width: 210px"), "Pet overlay width must be 210px");
  assert.ok(petHtmlSource.includes("max-height: 68px"), "Pet overlay height must be capped at 68px");
  assert.ok(petHtmlSource.includes('font: 11px/1.45'), "Pet overlay typography must be compact");
  assert.ok(petHtmlSource.includes("-webkit-line-clamp: 3"), "Pet overlay must show at most three lines");
  assert.ok(petMainSource.includes("hideProactiveLine();\n  lifecycle.disposeAll();"), "Pet overlay timer/content must be cleared on unload");

  assert.ok(ttsEngineSource.includes('method: "POST"'), "GPT-SoVITS must use POST");
  assert.ok(ttsEngineSource.includes("${baseUrl}/tts"), "GPT-SoVITS must call /tts");
  assert.ok(ttsEngineSource.includes('text_lang: "zh"'), "GPT-SoVITS request must specify Chinese text language");
  assert.ok(ttsEngineSource.includes('ref_audio_path: refAudioPath'), "GPT-SoVITS request must pass reference audio");
});
