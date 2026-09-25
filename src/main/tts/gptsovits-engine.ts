// GPT-SoVITS 本地 TTS 引擎
// 接口：官方 api_v2 (POST /tts)，返回 wav 或 mp3 字节
// 参考：https://github.com/RVC-Boss/GPT-SoVITS
import * as fs from "fs";
import { resolveTimeoutPolicy } from "../runtime-policy";

export interface GptsovitsSynthesizeOptions {
  baseUrl: string;
  refAudioPath: string;     // 参考音频绝对路径
  promptText: string;      // 参考音频对应的文本
  text: string;             // 待合成文本
  speed?: number;           // 0.5~2，默认 1
  format?: "wav" | "mp3";   // 默认 wav
  timeoutMs?: number;      // 默认由 ../runtime-policy 的 tts-gptsovits 阶段提供，当前 3 分钟
  signal?: AbortSignal;
  debugLog?: (entry: Record<string, unknown>) => void;
}

export interface GptsovitsSynthesizeResult {
  audio: Buffer;
  format: "wav" | "mp3";
}

const DEFAULT_TIMEOUT_MS = resolveTimeoutPolicy({ stage: "tts-gptsovits" }).totalMs;
const TTS_PATH = "/tts";
const FIREFLY_SEED = 15;
const FIREFLY_TEXT_SPLIT_METHOD = "cut5";

export function normalizeGptsovitsText(text: string): string {
  return text.replace(/AR-26710/g, "AR二六七一零").replace(/失熵症/g, "失商症");
}

/**
 * 调 GPT-SoVITS api_v2。
 * 请求体 JSON：text / text_lang / ref_audio_path / prompt_text / prompt_lang / media_type。
 * 返回完整 wav（或 mp3）字节。
 */
export async function synthesize(opts: GptsovitsSynthesizeOptions): Promise<GptsovitsSynthesizeResult> {
  const format: "wav" | "mp3" = opts.format ?? "wav";
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const requestId = `gptsovits-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  const log = (entry: Record<string, unknown>) => {
    try { opts.debugLog?.({ requestId, ts: new Date().toISOString(), ...entry }); } catch { /* ignore */ }
  };

  // 1) 输入校验
  if (!opts.baseUrl) throw new Error("缺少 GPT-SoVITS API 地址");
  if (!opts.refAudioPath) throw new Error("缺少参考音频路径");
  if (!opts.promptText) throw new Error("缺少参考音频对应的文本");
  if (!opts.text) throw new Error("缺少合成文本");
  if (!fs.existsSync(opts.refAudioPath)) {
    throw new Error("参考音频文件不存在");
  }

  // 2) 构造 JSON body（裸对象，不包 data）
  // 契约参考 GPT-SoVITS api_v2.py: POST /tts，body 是 TTS_Request 模型
  // 必需字段：text / text_lang / ref_audio_path / prompt_lang
  const body = JSON.stringify({
    text: normalizeGptsovitsText(opts.text),
    text_lang: "zh",
    ref_audio_path: opts.refAudioPath,
    prompt_text: opts.promptText,
    prompt_lang: "zh",
    speed_factor: opts.speed ?? 1,
    seed: FIREFLY_SEED,
    text_split_method: FIREFLY_TEXT_SPLIT_METHOD,
    streaming_mode: false,
    media_type: format,
  });

  // baseUrl 去掉尾部斜杠，拼 /tts
  const url = opts.baseUrl.replace(/\/+$/, "") + TTS_PATH;

  log({
    phase: "request.begin",
    textChars: Array.from(opts.text).length,
    format,
  });

  // 3) 发请求 + 超时控制
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const abort = () => controller.abort();
  opts.signal?.addEventListener("abort", abort, { once: true });
  if (opts.signal?.aborted) controller.abort();

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", abort);
    if (err instanceof Error && err.name === "AbortError") {
      if (timedOut) throw new Error(`GPT-SoVITS 合成超时（${timeoutMs}ms），检查服务是否在跑`);
      throw new Error("GPT-SoVITS 合成已取消");
    }
    log({ phase: "error", durationMs: Date.now() - startedAt });
    throw new Error("GPT-SoVITS 请求失败，请检查已配置的服务地址与运行状态");
  }
  try {
    if (!resp.ok) {
      log({ phase: "error", status: resp.status, durationMs: Date.now() - startedAt });
      throw new Error(`GPT-SoVITS 合成失败: HTTP ${resp.status}`);
    }
    const audio = Buffer.from(await resp.arrayBuffer());
    if (controller.signal.aborted) throw new Error(timedOut ? "GPT-SoVITS 合成超时" : "GPT-SoVITS 合成已取消");
    const isWav = audio.length >= 12 && audio.subarray(0, 4).toString("ascii") === "RIFF" && audio.subarray(8, 12).toString("ascii") === "WAVE";
    const isMp3 = audio.length >= 3 && (audio.subarray(0, 3).toString("ascii") === "ID3" || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0));
    if (format === "wav" ? !isWav : !isMp3) throw new Error("GPT-SoVITS 返回的音频格式不符合请求");
    log({ phase: "response.final", durationMs: Date.now() - startedAt, audioBytes: audio.length });
    return { audio, format };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", abort);
  }
}
