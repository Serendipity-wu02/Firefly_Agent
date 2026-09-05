import type { GptsovitsConfig } from "../../../../shared/tts-types";
import type { TtsAudioFormat } from "../../../../shared/tts-session";
import { traceTtsTextIntegrity } from "../../../../shared/tts-text-integrity";

export interface GptsovitsSynthesizeResult {
  buffer: Buffer;
  format: TtsAudioFormat;
}

/**
 * GPT-SoVITS' bundled Chinese pronunciation dictionary maps 熵 to di1.
 * Keep the visible character in Firefly, but send the verified shang1
 * homophone to the external synthesizer for this canonical term.
 */
export function normalizeGptsovitsText(text: string): string {
  return text.replace(/失熵症/g, "失商症");
}

/**
 * synthesizeGptsovits
 *
 * Calls the local or remote GPT-SoVITS inference API server.
 * Standard parameters:
 * - text: Target Chinese text to synthesize
 * - text_lang: "zh" (Chinese)
 * - ref_audio_path: Reference audio path for zero-shot voice cloning
 * - prompt_text: Reference audio transcript prompt
 * - prompt_lang: "zh"
 * - media_type: "wav"
 * - speed_factor: Speech speed rate (e.g. 1.0)
 * - seed: Fixed semantic sampling seed for stable pronunciation
 */
export async function synthesizeGptsovits(
  text: string,
  config: GptsovitsConfig,
  signal?: AbortSignal,
  requestId = "n/a",
): Promise<GptsovitsSynthesizeResult> {
  const baseUrl = (config.baseUrl || "http://127.0.0.1:9880").replace(/\/+$/, "");
  const endpoint = `${baseUrl}/tts`;
  const synthesisText = normalizeGptsovitsText(text);

  const refAudioPath = config.refAudioPath;
  const promptText = config.promptText;

  const payload: Record<string, unknown> = {
    text: synthesisText,
    text_lang: "zh",
    ref_audio_path: refAudioPath,
    prompt_text: promptText,
    prompt_lang: "zh",
    media_type: config.format || "wav",
    speed_factor: config.speed ?? 1.0,
    seed: config.seed ?? 5,
    streaming_mode: false,
  };

  const serializedBody = JSON.stringify(payload);
  const serializedText = (JSON.parse(serializedBody) as { text?: unknown }).text;
  if (typeof serializedText !== "string" || serializedText !== synthesisText) {
    throw new Error("GPT-SoVITS request serialization changed the TTS text");
  }
  try {
    await traceTtsTextIntegrity("gptsovits.request", requestId, serializedText);
  } catch {
    console.warn(`[TTS Text Integrity] boundary=gptsovits.request requestId=${requestId} unavailable`);
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: serializedBody,
      signal,
    });
  } catch (err: any) {
    if (signal?.aborted) {
      throw new Error("GPT-SoVITS 请求已被取消。");
    }
    throw new Error(`GPT-SoVITS 服务连接失败 (${err?.message || "请确认本地 127.0.0.1:9880 服务已启动"})`);
  }

  if (!res.ok) {
    let errBody = "";
    try {
      errBody = await res.text();
    } catch {}
    throw new Error(`GPT-SoVITS 推理失败 (HTTP ${res.status}): ${errBody.slice(0, 200)}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length === 0) {
    throw new Error("GPT-SoVITS 返回了空音频数据。");
  }

  return {
    buffer,
    format: (config.format as TtsAudioFormat) || "wav",
  };
}
