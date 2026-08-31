import type { CustomCloudTtsConfig } from "../../../shared/tts-types";
import type { TtsAudioFormat } from "../../../shared/tts-session";

export interface CustomCloudSynthesizeResult {
  buffer: Buffer;
  format: TtsAudioFormat;
}

export async function synthesizeCustomCloud(
  text: string,
  config: CustomCloudTtsConfig,
  signal?: AbortSignal,
): Promise<CustomCloudSynthesizeResult> {
  if (!config.endpointUrl) {
    throw new Error("Custom Cloud TTS endpoint URL is not configured");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const body = JSON.stringify({
    text,
    voice: config.voiceId || "default",
    speed: config.speed ?? 1.0,
    volume: config.volume ?? 1.0,
    format: config.format ?? "mp3",
  });

  const res = await fetch(config.endpointUrl, {
    method: "POST",
    headers,
    body,
    signal,
  });

  if (!res.ok) {
    throw new Error(`Custom Cloud TTS request failed with HTTP ${res.status}: ${await res.text()}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    format: (config.format as TtsAudioFormat) || "mp3",
  };
}
