/**
 * @file settings-types.ts
 * @description Shared settings snapshot and update contracts for every renderer.
 */

import type { LlmProviderConfig } from "./provider-types";
import type { TtsSettings } from "./tts-types";
import type { UiPreferences } from "./ui-types";
import type { PermissionProfile } from "./permission-profile-types";
import type { BrowserProxyEndpoint, BrowserTransportMode } from "./browser-types";

/**
 * Persisted, normalized Browser transport configuration.
 *
 * The proxy endpoint deliberately reuses BrowserProxyEndpoint. It contains
 * no credentials and is only created by the Main-side Browser policy.
 */
export type BrowserSettings =
  | {
      readonly transportMode: "direct";
      readonly allowedOrigins: readonly string[];
      readonly httpProxy?: never;
    }
  | {
      readonly transportMode: "http_proxy";
      readonly allowedOrigins: readonly string[];
      readonly httpProxy: BrowserProxyEndpoint;
    };

/**
 * Settings IPC input for Browser transport configuration.
 *
 * Renderer input keeps the endpoint as text so Main can perform the
 * authoritative normalization. The normalized BrowserProxyEndpoint above is
 * what is persisted and exposed in snapshots.
 */
export type BrowserSettingsUpdate =
  | {
      readonly transportMode: "direct";
      /** Omitted by legacy callers means preserve the current list. */
      readonly allowedOrigins?: readonly string[];
      readonly httpProxy?: never;
    }
  | {
      readonly transportMode: "http_proxy";
      readonly httpProxy: string;
      /** Omitted by legacy callers means preserve the current list. */
      readonly allowedOrigins?: readonly string[];
    };

export type BrowserSettingsSnapshot =
  | {
      readonly status: "default" | "configured";
      readonly revision: number;
      readonly settings: BrowserSettings;
    }
  | {
      readonly status: "unavailable";
      readonly revision: number;
      readonly reason: "invalid_saved_configuration";
    };

export interface FireflySettingsSnapshot {
  permissionProfile?: PermissionProfile;
  llm?: LlmProviderConfig;
  tts?: TtsSettings;
  ui?: UiPreferences;
  /** Main-owned Browser network settings and process-local identity snapshot. */
  browser?: BrowserSettingsSnapshot;
  window?: {
    x?: number;
    y?: number;
    pet_scale?: number;
  };
  startup?: {
    openAtLogin?: boolean;
  };
}

export type FireflySettingsUpdate = Omit<Partial<FireflySettingsSnapshot>, "browser"> & {
  browser?: BrowserSettingsUpdate;
};
