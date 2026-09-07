export type TtsEngine = "off" | "gptsovits";

export type GptsovitsTextSplitMethod = "cut0" | "cut1" | "cut2" | "cut3" | "cut4" | "cut5";

export const TTS_SETTINGS_SCHEMA_VERSION = 2;
export const DEFAULT_GPTSOVITS_SEED = 15;
export const DEFAULT_GPTSOVITS_TEXT_SPLIT_METHOD: GptsovitsTextSplitMethod = "cut5";

export interface VoiceProfile {
  id: "firefly-v2proplus";
  displayName: string;
  engine: "gptsovits";
  version: "v2ProPlus";
  baseUrl: string;
  refAudioPath?: string;
  promptText?: string;
  targetLanguage: "zh";
  referenceLanguage: "zh";
}

export const FIREFLY_VOICE_PROFILE: VoiceProfile = {
  id: "firefly-v2proplus",
  displayName: "流萤标准语音 · GPT-SoVITS V2ProPlus",
  engine: "gptsovits",
  version: "v2ProPlus",
  baseUrl: "http://127.0.0.1:9880",
  refAudioPath: "",
  promptText: "谢谢你，我们快去体验一下附近的游乐设施吧，目标就暂定为——用光所有代币！",
  targetLanguage: "zh",
  referenceLanguage: "zh",
};

export interface GptsovitsConfig {
  baseUrl: string;
  refAudioPath: string;
  promptText: string;
  format?: "wav";
  speed?: number;
  seed?: number;
  textSplitMethod?: GptsovitsTextSplitMethod;
}

export interface TtsSettings {
  schemaVersion?: number;
  engine: TtsEngine;
  speed: number;
  volume: number;
  autoPlay?: boolean;
  voiceProfile?: "firefly-v2proplus";
  gptsovits: GptsovitsConfig;
}

export const DEFAULT_TTS_SETTINGS: TtsSettings = {
  schemaVersion: TTS_SETTINGS_SCHEMA_VERSION,
  engine: "gptsovits",
  speed: 0.9,
  volume: 1.0,
  autoPlay: true,
  voiceProfile: "firefly-v2proplus",
  gptsovits: {
    baseUrl: "http://127.0.0.1:9880",
    refAudioPath: "",
    promptText: "谢谢你，我们快去体验一下附近的游乐设施吧，目标就暂定为——用光所有代币！",
    format: "wav",
    speed: 0.9,
    seed: DEFAULT_GPTSOVITS_SEED,
    textSplitMethod: DEFAULT_GPTSOVITS_TEXT_SPLIT_METHOD,
  },
};

export interface TtsSettingsMigrationResult {
  settings: TtsSettings;
  changed: boolean;
  migratedLegacySeed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Migrate persisted TTS settings owned by the TTS IPC settings loader.
 *
 * An unversioned or older settings object with the historical default seed 5
 * is promoted to the approved seed 15. Once the current schema marker is
 * present, an explicit user-selected seed 5 remains untouched.
 */
export function migrateTtsSettings(raw: unknown): TtsSettingsMigrationResult {
  const persisted = isRecord(raw) ? raw : {};
  const persistedGptsovits = isRecord(persisted.gptsovits) ? persisted.gptsovits : {};
  const persistedVersion = persisted.schemaVersion;
  const isCurrentSchema = persistedVersion === TTS_SETTINGS_SCHEMA_VERSION;
  const isLegacySchema = !isCurrentSchema &&
    (persistedVersion === undefined ||
      persistedVersion === null ||
      (typeof persistedVersion === "number" && persistedVersion < TTS_SETTINGS_SCHEMA_VERSION));
  const migratedLegacySeed = isLegacySchema && persistedGptsovits.seed === 5;

  const gptsovits = {
    ...DEFAULT_TTS_SETTINGS.gptsovits,
    ...persistedGptsovits,
  };
  if (migratedLegacySeed) {
    gptsovits.seed = DEFAULT_GPTSOVITS_SEED;
  }

  return {
    settings: {
      ...DEFAULT_TTS_SETTINGS,
      ...persisted,
      schemaVersion: TTS_SETTINGS_SCHEMA_VERSION,
      gptsovits,
    } as TtsSettings,
    changed: persistedVersion !== TTS_SETTINGS_SCHEMA_VERSION || migratedLegacySeed,
    migratedLegacySeed,
  };
}
