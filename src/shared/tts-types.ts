export type TtsEngine = "off" | "gptsovits";

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
}

export interface TtsSettings {
  engine: TtsEngine;
  speed: number;
  volume: number;
  autoPlay?: boolean;
  voiceProfile?: "firefly-v2proplus";
  gptsovits: GptsovitsConfig;
}

export const DEFAULT_TTS_SETTINGS: TtsSettings = {
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
    seed: 5,
  },
};
