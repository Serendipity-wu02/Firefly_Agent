export type TtsEngine = "off" | "gptsovits" | "custom-cloud" | "minimax" | "mimo" | "mossland";

export interface GptsovitsConfig {
  baseUrl: string;
  refAudioPath: string;
  promptText: string;
  format?: "wav" | "mp3";
  speed?: number;
}

export interface CustomCloudTtsConfig {
  endpointUrl: string;
  apiKey?: string;
  voiceId?: string;
  format?: "wav" | "mp3";
  speed?: number;
  volume?: number;
  timeoutMs?: number;
}

export interface MinimaxTtsConfig {
  apiKey: string;
  voiceId: string;
  model?: string;
  speed?: number;
  volume?: number;
}

export interface MimoTtsConfig {
  apiKey: string;
  voiceAudioPath?: string;
  stylePrompt?: string;
}

export interface MosslandTtsConfig {
  apiKey: string;
  voiceId?: string;
  model?: string;
  format?: "mp3" | "wav";
}

export interface TtsSettings {
  engine: TtsEngine;
  speed: number;
  volume: number;
  autoPlay?: boolean;
  gptsovits: GptsovitsConfig;
  customCloud: CustomCloudTtsConfig;
  minimax: MinimaxTtsConfig;
  mimo: MimoTtsConfig;
  mossland: MosslandTtsConfig;
}

export const DEFAULT_TTS_SETTINGS: TtsSettings = {
  engine: "gptsovits",
  speed: 1.0,
  volume: 1.0,
  autoPlay: true,
  gptsovits: {
    baseUrl: "http://127.0.0.1:9880",
    refAudioPath: "E:\\GPT-SoVITS\\GPT-SoVITS-firefly-finetuning\\samples\\sample_1.wav",
    promptText: "谢谢你，我们快去体验一下附近的游乐设施吧，目标就暂定为——用光所有代币！",
    format: "wav",
    speed: 1.0,
  },
  customCloud: {
    endpointUrl: "",
    apiKey: "",
    voiceId: "",
    format: "mp3",
    speed: 1.0,
    volume: 1.0,
    timeoutMs: 30000,
  },
  minimax: {
    apiKey: "",
    voiceId: "female-tianmei",
    model: "speech-01-turbo",
    speed: 1.0,
    volume: 1.0,
  },
  mimo: {
    apiKey: "",
    voiceAudioPath: "",
    stylePrompt: "",
  },
  mossland: {
    apiKey: "",
    voiceId: "",
    model: "moss-tts-v1",
    format: "mp3",
  },
};
