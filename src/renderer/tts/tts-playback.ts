import type { StartTtsRequest, TtsStartResult, TtsSessionEvent, VoiceProsodyHint } from "../../shared/tts-session";
import { traceTtsTextIntegrity } from "../../shared/tts-text-integrity";
import { debugLog } from "../debug-log";

export type TtsPlaybackStatus = "idle" | "synthesizing" | "playing" | "paused" | "completed" | "error";

export interface TtsPlaybackSnapshot {
  messageId: string | null;
  status: TtsPlaybackStatus;
  error?: string;
}

export interface TtsSpeakOptions {
  messageId?: string;
  voiceIntent?: string;
  behaviorType?: string;
  prosodyHint?: VoiceProsodyHint;
  correlationId?: string;
  volume?: number;
}

interface TtsCompletion {
  requestId: string;
  resolve: () => void;
  settled: boolean;
}

export class TtsPlaybackManager {
  private currentAudio: HTMLAudioElement | null = null;
  private currentRequestId: string | null = null;
  private currentMessageId: string | null = null;
  private currentObjectUrl: string | null = null;
  private currentCompletion: TtsCompletion | null = null;
  private currentPlaybackResolve: (() => void) | null = null;
  private status: TtsPlaybackStatus = "idle";
  private listeners: Array<(snapshot: TtsPlaybackSnapshot) => void> = [];

  constructor() {
    if (typeof window !== "undefined" && window.tts?.onSessionEvent) {
      window.tts.onSessionEvent(this.handleSessionEvent);
    }
    if (typeof window !== "undefined" && window.tts?.onPlaybackStop) {
      window.tts.onPlaybackStop(({ requestId }) => this.stop(requestId));
    }
  }

  getSnapshot(): TtsPlaybackSnapshot {
    return {
      messageId: this.currentMessageId,
      status: this.status,
    };
  }

  subscribe(listener: (snapshot: TtsPlaybackSnapshot) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(error?: string): void {
    const snapshot: TtsPlaybackSnapshot = {
      messageId: this.currentMessageId,
      status: this.status,
      error,
    };
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private handleSessionEvent = (event: TtsSessionEvent): void => {
    if (event.requestId !== this.currentRequestId) return;
    if (event.type === "error") {
      this.finishRequest(event.requestId, "error", event.message);
    }
  };

  private setStatus(status: TtsPlaybackStatus, error?: string): void {
    this.status = status;
    this.notify(error);
  }

  private setSpeaking(isSpeaking: boolean, requestId: string): void {
    try {
      window.firefly?.setSpeaking(isSpeaking, requestId);
    } catch {}
  }

  private isCurrent(requestId: string, audio?: HTMLAudioElement): boolean {
    return this.currentRequestId === requestId && (!audio || this.currentAudio === audio);
  }

  private createCompletion(requestId: string): Promise<void> {
    return new Promise<void>((resolve) => {
      this.currentCompletion = { requestId, resolve, settled: false };
    });
  }

  private resolveCompletion(requestId: string): void {
    if (!this.currentCompletion || this.currentCompletion.requestId !== requestId) return;
    if (this.currentCompletion.settled) return;
    this.currentCompletion.settled = true;
    const resolve = this.currentCompletion.resolve;
    this.currentCompletion = null;
    resolve();
  }

  private requestRelease(requestId: string): void {
    const release = window.tts?.releasePlayback(requestId);
    if (release) void release.catch(() => undefined);
  }

  private requestCancel(requestId: string): void {
    const cancel = window.tts?.cancelSession(requestId);
    if (cancel) void cancel.catch(() => undefined);
  }

  private resolveCurrentPlayback(): void {
    const resolve = this.currentPlaybackResolve;
    this.currentPlaybackResolve = null;
    resolve?.();
  }

  private finishRequest(
    requestId: string,
    status: TtsPlaybackStatus,
    error?: string,
    audio: HTMLAudioElement | null = this.currentAudio,
    objectUrl: string | null = this.currentObjectUrl,
  ): void {
    if (!this.isCurrent(requestId)) return;

    this.currentRequestId = null;
    this.setSpeaking(false, requestId);
    this.requestRelease(requestId);
    this.resolveCurrentPlayback();
    this.cleanupAudio(audio, objectUrl);
    this.setStatus(status, error);
    this.resolveCompletion(requestId);
  }

  async speak(text: string, options: TtsSpeakOptions = {}): Promise<void> {
    this.stop();

    if (!text.trim()) return;

    const requestId = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.currentRequestId = requestId;
    this.currentMessageId = options.messageId || requestId;
    const completion = this.createCompletion(requestId);
    this.setStatus("synthesizing");

    try {
      try {
        await traceTtsTextIntegrity("renderer.speak", requestId, text);
      } catch {
        debugLog(`[TTS Text Integrity] boundary=renderer.speak requestId=${requestId} unavailable`);
      }

      debugLog(
        `[TTS Trace] request: requestId=${requestId} correlationId=${options.correlationId ?? "n/a"} ` +
          `behavior=${options.behaviorType ?? "n/a"} chars=${text.length}`,
      );

      if (!window.tts) {
        debugLog(`[TTS Trace] playback-error: window.tts is unavailable`);
        this.finishRequest(requestId, "error", "TTS preload bridge unavailable");
        await completion;
        return;
      }

      const request: StartTtsRequest = {
        requestId,
        messageId: options.messageId,
        speechText: text,
        voiceIntent: options.voiceIntent,
        behaviorType: options.behaviorType,
        prosodyHint: options.prosodyHint,
        correlationId: options.correlationId,
      };
      const res: TtsStartResult = await window.tts.startSession(request);

      if (!this.isCurrent(requestId)) {
        await completion;
        return;
      }

      if (res.status === "error") {
        debugLog(
          `[TTS Trace] playback-error: requestId=${requestId} correlationId=${options.correlationId ?? "n/a"} error="${res.error}"`,
        );
        this.finishRequest(requestId, "error", res.error);
        await completion;
        return;
      }

      if (res.status === "skipped" || res.status === "cancelled") {
        debugLog(
          `[TTS Trace] skipped: requestId=${requestId} correlationId=${options.correlationId ?? "n/a"} reason=${res.reason ?? "off"}`,
        );
        this.finishRequest(requestId, "idle");
        await completion;
        return;
      }

      if (res.status === "ready" && res.base64) {
        debugLog(
          `[TTS Trace] audio-created: requestId=${requestId} correlationId=${options.correlationId ?? "n/a"} format=${res.format} cached=${res.cached} base64Len=${res.base64.length}`,
        );
        await this.playBase64(requestId, res.base64, res.format, options.volume);
      } else {
        const noAudioErr = "TTS 服务返回成功但未提供音频数据";
        debugLog(`[TTS Trace] playback-error: requestId=${requestId} detail="${noAudioErr}"`);
        this.finishRequest(requestId, "error", noAudioErr);
      }
    } catch (err: any) {
      if (this.isCurrent(requestId)) {
        const errMsg = err?.message || String(err);
        debugLog(
          `[TTS Trace] playback-error: requestId=${requestId} correlationId=${options.correlationId ?? "n/a"} message="${errMsg}"`,
        );
        this.finishRequest(requestId, "error", errMsg);
      }
    }

    await completion;
  }

  private async playBase64(requestId: string, base64: string, format: string, volume?: number): Promise<void> {
    if (!this.isCurrent(requestId)) return;

    const mime = format === "wav" ? "audio/wav" : "audio/mpeg";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });
    const objectUrl = URL.createObjectURL(blob);

    const acquire = window.tts?.acquirePlayback;
    let acquired = false;
    try {
      acquired = acquire ? await acquire(requestId) : false;
    } catch (err: any) {
      URL.revokeObjectURL(objectUrl);
      if (this.isCurrent(requestId)) {
        this.finishRequest(requestId, "error", err?.message || String(err));
      }
      return;
    }
    if (!acquired || !this.isCurrent(requestId)) {
      URL.revokeObjectURL(objectUrl);
      if (this.isCurrent(requestId)) this.finishRequest(requestId, "idle");
      return;
    }

    let audio: HTMLAudioElement;
    try {
      audio = new Audio(objectUrl);
    } catch (err: any) {
      URL.revokeObjectURL(objectUrl);
      this.finishRequest(requestId, "error", err?.message || String(err));
      return;
    }

    if (!this.isCurrent(requestId)) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(objectUrl);
      return;
    }

    this.currentObjectUrl = objectUrl;
    this.currentAudio = audio;
    const safeVolume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume as number)) : 1;
    audio.volume = safeVolume;
    debugLog(`[TTS Trace] audio-created: mime=${mime} blobBytes=${bytes.length} url=${objectUrl}`);

    let resolvePlayback: (() => void) | null = null;
    let settled = false;
    const playbackComplete = new Promise<void>((resolve) => {
      resolvePlayback = resolve;
      this.currentPlaybackResolve = resolve;
    });
    const finishPlayback = (status: TtsPlaybackStatus, error?: string): void => {
      if (settled) return;
      settled = true;
      if (this.isCurrent(requestId, audio)) {
        this.finishRequest(requestId, status, error, audio, objectUrl);
      }
      resolvePlayback?.();
    };

    audio.onplay = () => {
      if (!this.isCurrent(requestId, audio)) return;
      debugLog(`[TTS Trace] playback-start: messageId=${this.currentMessageId ?? "n/a"}`);
      this.setStatus("playing");
      this.setSpeaking(true, requestId);
    };

    audio.onended = () => {
      if (!this.isCurrent(requestId, audio)) return;
      debugLog(`[TTS Trace] playback-end: messageId=${this.currentMessageId ?? "n/a"}`);
      finishPlayback("completed");
    };

    audio.onerror = () => {
      if (!this.isCurrent(requestId, audio)) return;
      const errDetail = audio.error ? `code ${audio.error.code} (${audio.error.message})` : "Audio decode/playback error";
      debugLog(`[TTS Trace] playback-error: messageId=${this.currentMessageId ?? "n/a"} detail="${errDetail}"`);
      finishPlayback("error", errDetail);
    };

    try {
      void audio.play().catch((playErr: any) => {
        if (!this.isCurrent(requestId, audio)) {
          finishPlayback("idle");
          return;
        }
        const rejectErr = playErr?.message || String(playErr);
        debugLog(`[TTS Trace] playback-error: play() rejected: "${rejectErr}"`);
        finishPlayback("error", rejectErr || "Audio playback blocked or failed");
      });
    } catch (playErr: any) {
      const rejectErr = playErr?.message || String(playErr);
      if (this.isCurrent(requestId, audio)) {
        debugLog(`[TTS Trace] playback-error: play() rejected: "${rejectErr}"`);
        finishPlayback("error", rejectErr || "Audio playback blocked or failed");
      } else {
        finishPlayback("idle");
      }
    }

    await playbackComplete;
  }

  stop(requestId?: string): void {
    const activeRequestId = this.currentRequestId;
    if (!activeRequestId || (requestId && requestId !== activeRequestId)) return;

    this.currentRequestId = null;
    this.setSpeaking(false, activeRequestId);
    this.requestCancel(activeRequestId);
    this.requestRelease(activeRequestId);
    this.resolveCurrentPlayback();
    this.cleanupAudio();
    this.setStatus("idle");
    this.resolveCompletion(activeRequestId);
  }

  private cleanupAudio(audio: HTMLAudioElement | null = this.currentAudio, objectUrl: string | null = this.currentObjectUrl): void {
    if (audio) {
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      if (this.currentAudio === audio) this.currentAudio = null;
    }
    if (objectUrl && this.currentObjectUrl === objectUrl) {
      URL.revokeObjectURL(objectUrl);
      this.currentObjectUrl = null;
    }
  }
}

export const globalTtsPlayback = new TtsPlaybackManager();
