import type { MinimaxTtsConfig } from "../../../shared/tts-types";
import type { TtsAudioFormat } from "../../../shared/tts-session";

export interface MinimaxSynthesizeResult {
  buffer: Buffer;
  format: TtsAudioFormat;
}

export async function synthesizeMinimax(
  text: string,
  config: MinimaxTtsConfig,
  signal?: AbortSignal,
): Promise<MinimaxSynthesizeResult> {
  if (!config.apiKey) {
    throw new Error("MiniMax API Key is not configured");
  }

  const url = "https://api.minimax.chat/v1/t2a_v2";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model || "speech-01-turbo",
      text,
      stream: false,
      voice_setting: {
        voice_id: config.voiceId || "female-tianmei",
        speed: config.speed ?? 1.0,
        vol: config.volume ?? 1.0,
      },
      audio_setting: {
        format: "mp3",
        sample_rate: 32000,
      },
    }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`MiniMax TTS request failed with HTTP ${res.status}: ${await res.text()}`);
  }

  const json: any = await res.json();
  if (json.data?.audio) {
    // Hex string or base64
    const audioHex = json.data.audio;
    const buffer = Buffer.from(audioHex, "hex");
    return {
      buffer,
      format: "mp3",
    };
  }

  throw new Error(`MiniMax response did not contain audio data: ${JSON.stringify(json)}`);
}
