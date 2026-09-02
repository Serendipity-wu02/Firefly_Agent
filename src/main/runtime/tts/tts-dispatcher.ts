import type { TtsSettings } from "../../../shared/tts-types";
import type { StartTtsRequest, TtsStartResult, TtsAudioFormat } from "../../../shared/tts-session";
import { TtsCache } from "./tts-cache";
import { buildTtsCacheKey } from "./tts-cache-key";
import { synthesizeGptsovits } from "./engines/gptsovits-engine";

export class FireflyTtsDispatcher {
  private cache: TtsCache;

  constructor(cache?: TtsCache) {
    this.cache = cache || new TtsCache();
  }

  async synthesize(
    request: StartTtsRequest,
    settings: TtsSettings,
    signal?: AbortSignal,
  ): Promise<TtsStartResult> {
    const engine = settings.engine;
    if (engine === "off" || !request.speechText.trim()) {
      return { requestId: request.requestId, status: "skipped" };
    }

    const text = request.speechText.trim();
    let format: TtsAudioFormat = "wav";

    console.log(
      `[TTS Trace] request: requestId=${request.requestId} correlationId=${request.correlationId ?? "n/a"} ` +
        `behavior=${request.behaviorType ?? "n/a"} text="${text.slice(0, 25)}..."`,
    );
    console.log(`[TTS Trace] dispatch: engine=${engine}`);

    // 1. Calculate effective speed based on settings and Behavior prosody hint
    let baseSpeed = settings.speed ?? 1.0;
    if (request.prosodyHint?.pace === "slow") {
      baseSpeed = Number((baseSpeed * 0.9).toFixed(2));
    } else if (request.prosodyHint?.pace === "brisk") {
      baseSpeed = Number((baseSpeed * 1.1).toFixed(2));
    }

    // Build engine config with effective speed
    const gptsovitsConfig = {
      ...settings.gptsovits,
      speed: baseSpeed,
    };
    format = gptsovitsConfig.format || "wav";

    const payloadForCache: Record<string, unknown> = {
      text,
      behaviorType: request.behaviorType,
      pace: request.prosodyHint?.pace,
      ...gptsovitsConfig,
      speed: baseSpeed,
    };

    const cacheKey = buildTtsCacheKey(engine, payloadForCache);

    // 2. Check cache
    const cachedBuffer = this.cache.read(cacheKey, format);
    if (cachedBuffer) {
      console.log(`[TTS Trace] result: cache hit key=${cacheKey} format=${format}`);
      return {
        requestId: request.requestId,
        status: "ready",
        base64: cachedBuffer.toString("base64"),
        cacheKey,
        format,
        cached: true,
      };
    }

    // 3. Synthesize via GPT-SoVITS
    console.log(`[TTS Trace] engine: invoking ${engine} synthesizer...`);
    let audioBuffer: Buffer;
    try {
      if (engine === "gptsovits") {
        const res = await synthesizeGptsovits(text, gptsovitsConfig, signal);
        audioBuffer = res.buffer;
        format = res.format;
      } else {
        const errMsg = `不支持或未配置的 TTS 引擎: ${engine}`;
        console.log(`[TTS Trace] synthesis-error: ${errMsg}`);
        return { requestId: request.requestId, status: "error", error: errMsg };
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.log(`[TTS Trace] synthesis-error: engine=${engine} error="${errMsg}"`);
      throw err;
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      const errMsg = `TTS 引擎 ${engine} 返回了空音频数据`;
      console.log(`[TTS Trace] synthesis-error: ${errMsg}`);
      return { requestId: request.requestId, status: "error", error: errMsg };
    }

    // 4. Write cache
    this.cache.write(cacheKey, audioBuffer, format);
    console.log(`[TTS Trace] synthesis-success: bytes=${audioBuffer.length} format=${format}`);

    return {
      requestId: request.requestId,
      status: "ready",
      base64: audioBuffer.toString("base64"),
      cacheKey,
      format,
      cached: false,
    };
  }
}
