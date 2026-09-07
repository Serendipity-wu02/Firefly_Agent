/**
 * @file settings-types.ts
 * @description Shared settings snapshot and update contracts for every renderer.
 */

import type { LlmProviderConfig } from "./provider-types";
import type { TtsSettings } from "./tts-types";
import type { UiPreferences } from "./ui-types";
import type { PermissionProfile } from "./permission-profile-types";

export interface FireflySettingsSnapshot {
  permissionProfile?: PermissionProfile;
  llm?: LlmProviderConfig;
  tts?: TtsSettings;
  ui?: UiPreferences;
  window?: {
    x?: number;
    y?: number;
    pet_scale?: number;
  };
  startup?: {
    openAtLogin?: boolean;
  };
}

export type FireflySettingsUpdate = Partial<FireflySettingsSnapshot>;
