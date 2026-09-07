/**
 * @file font-size-live-sync.test.mjs
 * @description Global UI font-size ownership and live synchronization contract.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../..");

const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf-8");

test("1. Canonical font-size owner returns an effective UI snapshot", () => {
  const uiTypesSource = read("src/shared/ui-types.ts");
  const settingsTypesSource = read("src/shared/settings-types.ts");
  const managerSource = read("src/settings/settings-manager.ts");

  assert.ok(uiTypesSource.includes('export type UiFontSize = "small" | "medium" | "large";'));
  assert.ok(uiTypesSource.includes("export interface UiPreferences"));
  assert.ok(settingsTypesSource.includes("export interface FireflySettingsSnapshot"));
  assert.ok(settingsTypesSource.includes("export type FireflySettingsUpdate"));
  assert.ok(managerSource.includes("export class SettingsManager"));
  assert.ok(managerSource.includes("getUiPreferences(): UiPreferences"));
  assert.ok(managerSource.includes("getSnapshot(): FireflyAppSettings"));
  assert.ok(managerSource.includes("ui: this.getUiPreferences()"));
});

test("2. A font-size selection persists through the existing main settings IPC", () => {
  const settingsViewSource = read("src/renderer/ui/components/SettingsView.tsx");
  const appSource = read("src/renderer/ui/App.tsx");
  const mainSource = read("src/main/index.ts");

  assert.ok(settingsViewSource.includes("onUiFontSizeChange"));
  assert.ok(settingsViewSource.includes("onClick={() => void onUiFontSizeChange(opt.id)}"));
  assert.ok(appSource.includes("const handleUiFontSizeChange = async (fontSize: UiFontSize)"));
  assert.ok(appSource.includes("setUiFontSize(fontSize)"));
  assert.ok(appSource.includes("window.settings.save({ ui: { fontSize } })"));
  assert.ok(mainSource.includes("settingsManager.save(newSettings)"));
  assert.ok(mainSource.includes("windowManager.broadcast(IPC.SETTINGS_CHANGED, updated)"));
});

test("3. Chat, Mood/Summary, and Settings consume one live settings subscription", () => {
  const appSource = read("src/renderer/ui/App.tsx");
  const preloadSource = read("src/preload/index.ts");
  const typeSource = read("src/renderer/electron.d.ts");
  const wmSource = read("src/main/windows/window-manager.ts");

  assert.equal((appSource.match(/window\.settings\.onSettingsChanged/g) || []).length, 1);
  assert.ok(appSource.includes("setUiFontSize(newSettings.ui.fontSize)"));
  assert.ok(appSource.includes('if (rendererView === "summary")'));
  assert.ok((appSource.match(/data-font-size=\{uiFontSize\}/g) || []).length >= 2);
  assert.ok(preloadSource.includes("onSettingsChanged"));
  assert.ok(typeSource.includes("onSettingsChanged: (cb: (settings: FireflySettingsSnapshot) => void)"));
  assert.ok(wmSource.includes("for (const win of BrowserWindow.getAllWindows())"));
});

test("4. The same CSS font tokens apply immediately to all three renderer views", () => {
  const appSource = read("src/renderer/ui/App.tsx");
  const tokensSource = read("src/renderer/ui/theme/tokens.ts");
  const settingsViewSource = read("src/renderer/ui/components/SettingsView.tsx");

  for (const size of ["small", "medium", "large"]) {
    assert.ok(settingsViewSource.includes(`id: "${size}"`), `Settings must expose ${size}`);
  }
  assert.ok(tokensSource.includes("--ff-font-title"));
  assert.ok(tokensSource.includes("--ff-font-body"));
  assert.ok(tokensSource.includes("--ff-font-input"));
  assert.ok(tokensSource.includes("--ff-font-label"));
  assert.ok(tokensSource.includes("--ff-font-caption"));
  assert.ok((appSource.match(/getFontScaleStyles\(uiFontSize\)/g) || []).length >= 2);
  assert.ok(appSource.includes("setUiFontSize(newSettings.ui.fontSize)"));
});

test("5. Newly opened Chat and Mood/Summary windows initialize from the current snapshot", () => {
  const appSource = read("src/renderer/ui/App.tsx");
  const managerSource = read("src/settings/settings-manager.ts");
  const wmSource = read("src/main/windows/window-manager.ts");

  assert.ok(appSource.includes("window.settings?.load()"));
  assert.ok(appSource.includes("if (res?.ui?.fontSize) setUiFontSize(res.ui.fontSize)"));
  assert.ok(managerSource.includes("return this.getSnapshot()"));
  assert.ok(wmSource.includes('this.getRendererDevUrl("chat")'));
  assert.ok(wmSource.includes('this.getRendererDevUrl("summary")'));
  assert.ok(wmSource.includes('this.getRendererDevUrl("settings")'));
});

test("6. No renderer-local font-size store or renderer-to-renderer coupling exists", () => {
  const appSource = read("src/renderer/ui/App.tsx");
  const settingsViewSource = read("src/renderer/ui/components/SettingsView.tsx");

  assert.ok(!appSource.includes("chatFontSize"));
  assert.ok(!appSource.includes("moodFontSize"));
  assert.ok(!appSource.includes("summaryFontSize"));
  assert.ok(!settingsViewSource.includes("new SettingsManager"));
});

test("7. Settings IPC uses shared TypeScript contracts and preserves the Chat radius", () => {
  const sharedTypesSource = read("src/shared/settings-types.ts");
  const preloadSource = read("src/preload/index.ts");
  const rendererTypesSource = read("src/renderer/electron.d.ts");
  const uiTypesSource = read("src/shared/ui-types.ts");

  assert.ok(sharedTypesSource.includes("FireflySettingsSnapshot"));
  assert.ok(sharedTypesSource.includes("FireflySettingsUpdate"));
  assert.ok(preloadSource.includes("save: (settings: FireflySettingsUpdate)"));
  assert.ok(!preloadSource.includes("save: (settings: any)"));
  assert.ok(rendererTypesSource.includes("FireflySettingsUpdate"));
  assert.ok(uiTypesSource.includes('CHAT_OUTER_RADIUS = "16px"'));
});
