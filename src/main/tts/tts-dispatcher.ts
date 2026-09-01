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

    // 1. Calculate effective speed based on settings and Behavior prosody hint
    let baseSpeed = settings.speed ?? 1.0;
    if (request.prosodyHint?.pace === "slow") {
      baseSpeed = Number((baseSpeed * 0.9).toFixed(2));
    } else if (request.prosodyHint?.pace === "brisk") {
      baseSpeed = Number((baseSpeed * 1.1).toFixed(2));
    }

    let payloadForCache: Record<string, unknown> = {
      text,
      speed: baseSpeed,
      behaviorType: request.behaviorType,
      pace: request.prosodyHint?.pace,
      pitch: request.prosodyHint?.pitch,
    };

    // Build engine-specific configs with effective speed
    const gptsovitsConfig = {
      ...settings.gptsovits,
      speed: baseSpeed,
    };
    const customCloudConfig = {
      ...settings.customCloud,
      speed: baseSpeed,
    };
    const minimaxConfig = {
      ...settings.minimax,
      speed: baseSpeed,
    };

    // Build payload signature
    if (engine === "gptsovits") {
      format = gptsovitsConfig.format || "wav";
      payloadForCache = { ...payloadForCache, ...gptsovitsConfig };
    } else if (engine === "custom-cloud") {
      format = customCloudConfig.format || "mp3";
      payloadForCache = { ...payloadForCache, ...customCloudConfig };
    } else if (engine === "minimax") {
      format = "mp3";
      payloadForCache = { ...payloadForCache, ...minimaxConfig };
    }

    const cacheKey = buildTtsCacheKey(engine, payloadForCache);

    // 2. Check cache
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

    // 3. Synthesize via selected Engine
    let audioBuffer: Buffer;
    if (engine === "gptsovits") {
      const res = await synthesizeGptsovits(text, gptsovitsConfig, signal);
      audioBuffer = res.buffer;
      format = res.format;
    } else if (engine === "custom-cloud") {
      const res = await synthesizeCustomCloud(text, customCloudConfig, signal);
      audioBuffer = res.buffer;
      format = res.format;
    } else if (engine === "minimax") {
      const res = await synthesizeMinimax(text, minimaxConfig, signal);
      audioBuffer = res.buffer;
      format = res.format;
    } else {
      return { requestId: request.requestId, status: "skipped" };
    }

    // 4. Write cache
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
