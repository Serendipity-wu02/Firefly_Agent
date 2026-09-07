/**
 * Chat Permission Profile Quick Switcher V1 presentation contract.
 * The checks intentionally inspect the typed ownership and live-sync seams;
 * policy semantics remain covered by the runtime permission-profile tests.
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

const quickSwitcherSource = read("src/renderer/ui/components/PermissionProfileQuickSwitcher.tsx");
const composerSource = read("src/renderer/ui/components/Composer.tsx");
const appSource = read("src/renderer/ui/App.tsx");
const settingsSource = read("src/renderer/ui/components/SettingsView.tsx");
const profileTypesSource = read("src/shared/permission-profile-types.ts");
const settingsTypesSource = read("src/shared/settings-types.ts");
const settingsManagerSource = read("src/settings/settings-manager.ts");
const resolverSource = read("src/main/runtime/authorization/permission-profile-policy-resolver.ts");
const uiTypesSource = read("src/shared/ui-types.ts");

test("A-B. Quick switcher renders the canonical current profile and restricted-scope default", () => {
  assert.ok(quickSwitcherSource.includes("selectedOption"));
  assert.ok(quickSwitcherSource.includes("selectedOption.label"));
  assert.ok(quickSwitcherSource.includes("profile: PermissionProfile"));
  assert.ok(profileTypesSource.includes('DEFAULT_PERMISSION_PROFILE: PermissionProfile = "RESTRICTED_SCOPE"'));
  assert.ok(appSource.includes("useState<PermissionProfile>(DEFAULT_PERMISSION_PROFILE)"));
  assert.ok(settingsManagerSource.includes("getPermissionProfile(): PermissionProfile"));
});

test("C-G. All four profiles are visible and selections use the canonical settings save", () => {
  for (const value of ["READ_ONLY", "RESTRICTED_SCOPE", "ASK_EVERY_TIME", "FULL_ACCESS"]) {
    assert.ok(profileTypesSource.includes(`value: "${value}"`), `${value} must remain canonical`);
    assert.ok(quickSwitcherSource.includes("PERMISSION_PROFILE_OPTIONS.map"));
  }
  assert.ok(quickSwitcherSource.includes("void onChange(option.value)"));
  assert.ok(composerSource.includes("PermissionProfileQuickSwitcher"));
  assert.ok(composerSource.includes("onPermissionProfileChange"));
  assert.ok(appSource.includes("window.settings.save({ permissionProfile: profile })"));
  assert.ok(!appSource.includes("permission:set-profile"));
});

test("H-I. SETTINGS_CHANGED keeps Chat and Settings on one live profile", () => {
  assert.ok(appSource.includes("window.settings.onSettingsChanged"));
  assert.ok(appSource.includes("setPermissionProfile(newSettings.permissionProfile)"));
  assert.ok(appSource.includes("permissionProfile={permissionProfile}"));
  assert.ok(appSource.includes("onPermissionProfileChange={handlePermissionProfileChange}"));
  assert.ok(settingsSource.includes("PERMISSION_PROFILE_OPTIONS"));
  assert.ok(settingsSource.includes("onPermissionProfileChange(option.value)"));
  assert.ok(settingsTypesSource.includes("permissionProfile?: PermissionProfile"));
  assert.ok(settingsManagerSource.includes("permissionProfile: this.getPermissionProfile()"));
});

test("J-L. No renderer-local profile store or policy semantics are added", () => {
  assert.doesNotMatch(quickSwitcherSource, /from ["'][^"']*(settings-manager|permission-profile-policy-resolver)["']/);
  assert.doesNotMatch(quickSwitcherSource, /localStorage/);
  assert.doesNotMatch(appSource, /new SettingsManager|localStorage|permission:set-profile/);
  assert.match(resolverSource, /READ_ONLY/);
  assert.match(profileTypesSource, /RESTRICTED_SCOPE/);
  assert.match(resolverSource, /ASK_EVERY_TIME/);
  assert.match(profileTypesSource, /FULL_ACCESS/);
  assert.match(resolverSource, /capabilityAllowed: false/);
});

test("M-N. Font scaling and Chat radius contracts remain unchanged", () => {
  assert.ok(quickSwitcherSource.includes("THEME_TOKENS.typography.fontSizes.caption"));
  assert.ok(appSource.includes("getFontScaleStyles(uiFontSize)"));
  assert.ok(uiTypesSource.includes('CHAT_OUTER_RADIUS = "16px"'));
  assert.ok(appSource.includes("CHAT_OUTER_RADIUS"));
});

test("O. Accessibility and save-failure recovery remain typed and canonical", () => {
  assert.ok(quickSwitcherSource.includes('type="button"'));
  assert.ok(quickSwitcherSource.includes('aria-haspopup="menu"'));
  assert.ok(quickSwitcherSource.includes("aria-expanded={isOpen}"));
  assert.ok(quickSwitcherSource.includes('role="menu"'));
  assert.ok(quickSwitcherSource.includes('role="menuitemradio"'));
  assert.ok(quickSwitcherSource.includes("aria-checked={isSelected}"));
  assert.ok(quickSwitcherSource.includes('event.key === "Escape"'));
  assert.ok(appSource.includes("if (!ok)"));
  assert.ok(appSource.includes("window.settings?.load()"));
  assert.ok(appSource.includes("restoreCanonicalProfile"));
});
