export type TtsAudioFormat = "mp3" | "wav" | "pcm";

export interface VoiceProsodyHint {
  pace?: "slow" | "normal" | "brisk";
  pitch?: "soft_low" | "neutral" | "bright_up";
  volumeModifier?: number;
  pauseLengthMs?: number;
}

export interface StartTtsRequest {
  requestId: string;
  conversationId?: string;
  messageId?: string;
  speechText: string;
  voiceIntent?: string;
  behaviorType?: string;
  prosodyHint?: VoiceProsodyHint;
  correlationId?: string;
  converterVersion?: string;
  automatic?: boolean;
  supportsStreamingPlayback?: boolean;
}

export type TtsStartResult =
  | {
      requestId: string;
      status: "ready";
      base64: string;
      cacheKey: string;
      format: TtsAudioFormat;
      cached: boolean;
    }
  | {
      requestId: string;
      status: "streaming";
      cacheKey: string;
      format: TtsAudioFormat;
    }
  | {
      requestId: string;
      status: "skipped" | "cancelled";
      reason?: string;
    }
  | {
      requestId: string;
      status: "error";
      error: string;
    };

export type TtsSessionEvent =
  | { requestId: string; type: "audio-chunk"; base64: string; format: TtsAudioFormat }
  | { requestId: string; type: "stream-completed"; cacheKey: string; format: TtsAudioFormat }
  | { requestId: string; type: "fallback-started" }
  | { requestId: string; type: "fallback-ready"; base64: string; cacheKey: string; format: TtsAudioFormat }
  | { requestId: string; type: "error"; message: string };
