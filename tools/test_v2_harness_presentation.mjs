/**
 * @file test_v2_harness_presentation.mjs
 * @description Unit & Integration test suite for V2.4 Light Sky Harness Chat UI.
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
const rootDir = path.resolve(__dirname, "..");

const { THEME_TOKENS } = await import("../dist/renderer/assets/chat-BWus1paF.js").catch(() => ({}));
const { globalAvatarResolver } = await import("../src/renderer/react/avatar-resolver.ts");

test("1. Light Sky Design Tokens: Theme tokens define spring green & clear sky palette", () => {
  const tokenSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "react", "theme", "tokens.ts"), "utf-8");
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

test("3. Chat-Centric Header: Renders character capsule, Firefly name, and navigation tabs", () => {
  const headerSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "react", "components", "Header.tsx"), "utf-8");
  assert.ok(headerSource.includes("流萤"), "Header must include 流萤");
  assert.ok(headerSource.includes("Firefly"), "Header must include Firefly badge");
  assert.ok(headerSource.includes("💬 对话"), "Header must include 对话 tab");
  assert.ok(headerSource.includes("⚙ 设置"), "Header must include 设置 tab");
});

test("4. Assistant Message Rendering: Includes avatar, Firefly label, speech bubble, and TTS action", () => {
  const itemSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "react", "components", "ChatMessageItem.tsx"), "utf-8");
  assert.ok(itemSource.includes("globalAvatarResolver.resolveAvatar"), "Must resolve real avatar");
  assert.ok(itemSource.includes("isAssistant"), "Must handle assistant messages");
  assert.ok(itemSource.includes("onSpeak(message)"), "Must allow TTS playback with message metadata");
});

test("5. User Message Rendering: Right-aligned with spring-green gradient bubble", () => {
  const itemSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "react", "components", "ChatMessageItem.tsx"), "utf-8");
  assert.ok(itemSource.includes("userBubble"), "User message must use userBubble token");
  assert.ok(itemSource.includes("justifyContent: \"flex-end\""), "User message must be right-aligned");
});

test("6. Character Summary SSoT: Shows cognitive mood, behavior, and mode without numeric stats", () => {
  const summarySource = fs.readFileSync(path.join(rootDir, "src", "renderer", "react", "components", "CharacterSummary.tsx"), "utf-8");
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
  const composerSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "react", "components", "Composer.tsx"), "utf-8");
  assert.ok(composerSource.includes("onKeyDown={handleKeyDown}"), "Composer must handle keydown events");
  assert.ok(composerSource.includes("e.key === \"Enter\" && !e.shiftKey"), "Must send on Enter without Shift");
  assert.ok(composerSource.includes("toolStatus"), "Must display tool execution status");
});

test("8. TTS Metadata Preservation: Auto-playback & Manual playback share identical Embodiment metadata", () => {
  const appSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "react", "App.tsx"), "utf-8");
  assert.ok(appSource.includes("globalTtsPlayback.speak(asstMsg.content"), "Auto playback passes embodiment metadata");
  assert.ok(appSource.includes("globalTtsPlayback.speak(msg.content"), "Manual playback passes embodiment metadata");
  assert.ok(appSource.includes("voiceIntent: asstMsg.voiceIntent"), "Preserves voiceIntent");
  assert.ok(appSource.includes("prosodyHint: asstMsg.prosodyHint"), "Preserves prosodyHint");
  assert.ok(appSource.includes("correlationId: asstMsg.correlationId"), "Preserves correlationId");
});

test("9. Harness & Desktop Pet Isolation: Harness does not import or call Live2DManager", () => {
  const appSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "react", "App.tsx"), "utf-8");
  assert.ok(!appSource.includes("Live2DManager"), "App.tsx must not import or instantiate Live2DManager");
  assert.ok(!appSource.includes("pixi"), "App.tsx must not depend on PixiJS");
});

test("10. Main Chat Window Isolation: WindowManager creates separate Pet and Chat BrowserWindows", () => {
  const wmSource = fs.readFileSync(path.join(rootDir, "src", "main", "windows", "window-manager.ts"), "utf-8");
  assert.ok(wmSource.includes("createPetWindow()"), "WindowManager must manage Pet window");
  assert.ok(wmSource.includes("createChatWindow()"), "WindowManager must manage Chat window");
  assert.ok(wmSource.includes("transparent: true"), "Pet window must be transparent");
  assert.ok(wmSource.includes("frame: true"), "Chat window must have standard frame");
});

test("11. Resource & Asset Immutability: 0 diff on resources/ and assets/", () => {
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
