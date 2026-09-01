import type { StartTtsRequest, TtsStartResult, TtsSessionEvent, VoiceProsodyHint } from "../../shared/tts-session";
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
}

export class TtsPlaybackManager {
  private currentAudio: HTMLAudioElement | null = null;
  private currentRequestId: string | null = null;
  private currentMessageId: string | null = null;
  private currentObjectUrl: string | null = null;
  private status: TtsPlaybackStatus = "idle";
  private listeners: Array<(snapshot: TtsPlaybackSnapshot) => void> = [];

  constructor() {
    if (typeof window !== "undefined" && window.tts?.onSessionEvent) {
      window.tts.onSessionEvent(this.handleSessionEvent);
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
    for (const l of this.listeners) {
      l(snapshot);
    }
  }

  private handleSessionEvent = (event: TtsSessionEvent): void => {
    if (event.requestId !== this.currentRequestId) return;
    if (event.type === "error") {
      this.setStatus("error", event.message);
      this.setSpeaking(false);
    }
  };

  private setStatus(status: TtsPlaybackStatus, error?: string): void {
    this.status = status;
    this.notify(error);
  }

  private setSpeaking(isSpeaking: boolean): void {
    try {
      window.firefly?.setSpeaking(isSpeaking);
    } catch {}
  }

  async speak(text: string, options: TtsSpeakOptions = {}): Promise<void> {
    this.stop();

    if (!text.trim()) return;

    const requestId = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.currentRequestId = requestId;
    this.currentMessageId = options.messageId || requestId;
    this.setStatus("synthesizing");
    debugLog(
      `[TTS Trace] start requestId=${requestId} correlationId=${options.correlationId ?? "n/a"} ` +
        `behavior=${options.behaviorType ?? "n/a"} chars=${text.length}`,
    );

    try {
      const res: TtsStartResult = await window.tts.startSession({
        requestId,
        messageId: options.messageId,
        speechText: text,
        voiceIntent: options.voiceIntent,
        behaviorType: options.behaviorType,
        prosodyHint: options.prosodyHint,
        correlationId: options.correlationId,
      });

      if (this.currentRequestId !== requestId) return;

      if (res.status === "skipped" || res.status === "cancelled") {
        debugLog(`[TTS Trace] skipped requestId=${requestId} correlationId=${options.correlationId ?? "n/a"}`);
        this.setStatus("idle");
        return;
      }

      if (res.status === "ready" && res.base64) {
        debugLog(`[TTS Trace] ready requestId=${requestId} correlationId=${options.correlationId ?? "n/a"} format=${res.format}`);
        await this.playBase64(res.base64, res.format);
      }
    } catch (err: any) {
      if (this.currentRequestId === requestId) {
        debugLog(`[TTS Trace] error requestId=${requestId} correlationId=${options.correlationId ?? "n/a"} message="${err?.message || err}"`);
        this.setStatus("error", err?.message || String(err));
        this.setSpeaking(false);
      }
    }
  }

  private async playBase64(base64: string, format: string): Promise<void> {
    this.cleanupAudio();

    const mime = format === "wav" ? "audio/wav" : "audio/mpeg";
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });
    this.currentObjectUrl = URL.createObjectURL(blob);

    const audio = new Audio(this.currentObjectUrl);
    this.currentAudio = audio;

    audio.onplay = () => {
      debugLog(`[TTS Trace] playing messageId=${this.currentMessageId ?? "n/a"}`);
      this.setStatus("playing");
      this.setSpeaking(true);
    };

    audio.onended = () => {
      this.setStatus("completed");
      this.setSpeaking(false);
      this.cleanupAudio();
    };

    audio.onerror = () => {
      this.setStatus("error", "Audio playback error");
      this.setSpeaking(false);
      this.cleanupAudio();
    };

    await audio.play();
  }

  stop(): void {
    if (this.currentRequestId) {
      window.tts?.cancelSession(this.currentRequestId);
      this.currentRequestId = null;
    }
    this.cleanupAudio();
    this.setSpeaking(false);
    this.setStatus("idle");
  }

  private cleanupAudio(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.src = "";
      this.currentAudio = null;
    }
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
  }
}

export const globalTtsPlayback = new TtsPlaybackManager();
