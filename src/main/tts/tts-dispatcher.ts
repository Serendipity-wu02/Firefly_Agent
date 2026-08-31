import type { TtsSettings } from "../../shared/tts-types";
import type { StartTtsRequest, TtsStartResult, TtsAudioFormat } from "../../shared/tts-session";
import { TtsCache } from "./tts-cache";
import { buildTtsCacheKey } from "./tts-cache-key";
import { synthesizeCustomCloud } from "./engines/custom-cloud-engine";
import { synthesizeGptsovits } from "./engines/gptsovits-engine";
import { synthesizeMinimax } from "./engines/minimax-engine";

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
    let format: TtsAudioFormat = "mp3";
    let payloadForCache: Record<string, unknown> = { text, speed: settings.speed };

    // Build payload signature
    if (engine === "gptsovits") {
      format = settings.gptsovits.format || "wav";
      payloadForCache = { text, ...settings.gptsovits };
    } else if (engine === "custom-cloud") {
      format = settings.customCloud.format || "mp3";
      payloadForCache = { text, ...settings.customCloud };
    } else if (engine === "minimax") {
      format = "mp3";
      payloadForCache = { text, ...settings.minimax };
    }

    const cacheKey = buildTtsCacheKey(engine, payloadForCache);

    // 1. Check cache
    const cachedBuffer = this.cache.read(cacheKey, format);
    if (cachedBuffer) {
      return {
        requestId: request.requestId,
        status: "ready",
        base64: cachedBuffer.toString("base64"),
        cacheKey,
        format,
        cached: true,
      };
    }

    // 2. Synthesize via selected Engine
    let audioBuffer: Buffer;
    if (engine === "gptsovits") {
      const res = await synthesizeGptsovits(text, settings.gptsovits, signal);
      audioBuffer = res.buffer;
      format = res.format;
    } else if (engine === "custom-cloud") {
      const res = await synthesizeCustomCloud(text, settings.customCloud, signal);
      audioBuffer = res.buffer;
      format = res.format;
    } else if (engine === "minimax") {
      const res = await synthesizeMinimax(text, settings.minimax, signal);
      audioBuffer = res.buffer;
      format = res.format;
    } else {
      return { requestId: request.requestId, status: "skipped" };
    }

    // 3. Write cache
    this.cache.write(cacheKey, audioBuffer, format);

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
