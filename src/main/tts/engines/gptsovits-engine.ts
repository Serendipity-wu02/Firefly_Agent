import type { GptsovitsConfig } from "../../../shared/tts-types";
import type { TtsAudioFormat } from "../../../shared/tts-session";

export interface GptsovitsSynthesizeResult {
  buffer: Buffer;
  format: TtsAudioFormat;
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
 * - media_type: "wav" | "mp3"
 * - speed: Speech speed rate (e.g. 1.0)
 */
export async function synthesizeGptsovits(
  text: string,
  config: GptsovitsConfig,
  signal?: AbortSignal,
): Promise<GptsovitsSynthesizeResult> {
  const baseUrl = (config.baseUrl || "http://127.0.0.1:9880").replace(/\/+$/, "");
  const endpoint = `${baseUrl}/tts`;

  const payload: Record<string, unknown> = {
    text,
    text_lang: "zh",
    ref_audio_path: config.refAudioPath || "",
    prompt_text: config.promptText || "",
    prompt_lang: "zh",
    media_type: config.format || "wav",
    speed_factor: config.speed ?? 1.0,
  };

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err: any) {
    if (signal?.aborted) {
      throw new Error("GPT-SoVITS 请求已被取消。");
    }
    throw new Error(`GPT-SoVITS 服务连接失败 (${err?.message || "请确认本地 127.0.0.1:9880 服务已启动"})`);
  }

  // Fallback: If POST returns 405 Method Not Allowed, try GET query parameters
  if (res.status === 405) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(payload)) {
      if (v !== undefined && v !== "") {
        params.set(k, String(v));
      }
    }
    try {
      res = await fetch(`${endpoint}?${params.toString()}`, { method: "GET", signal });
    } catch (err: any) {
      throw new Error(`GPT-SoVITS GET 请求失败: ${err?.message}`);
    }
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
