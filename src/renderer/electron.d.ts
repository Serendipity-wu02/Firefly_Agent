import type { FireflyTarget } from "../shared/firefly-actions";
import type { CareActionType } from "../shared/firefly-state";
import type { StartTtsRequest, TtsStartResult, TtsSessionEvent } from "../shared/tts-session";
import type { TtsSettings } from "../shared/tts-types";
import type { ChatMessage } from "../shared/chat-types";
import type { ProviderStatus } from "../shared/provider-types";

declare global {
  interface Window {
    firefly?: {
      minimize: () => void;
      hide: () => void;
      quit: () => void;
      setInteractive: (interactive: boolean) => Promise<void>;
      moveBy: (dx: number, dy: number) => void;
      moveTo: (x: number, y: number) => void;
      setDragging: (isDragging: boolean) => void;
      setSpeaking: (isSpeaking: boolean) => void;
      onSpeakingChanged: (cb: (isSpeaking: boolean) => void) => () => void;
      captureFrame: () => Promise<string | null>;
      getCursorPosition: () => Promise<{ x: number; y: number } | null>;
      interact?: (action: "click" | "touch") => Promise<any>;
      openChat: () => void;
      openStatus: () => void;
      openSettings: () => void;
      openSummary: () => void;
      onSummaryUpdated?: (cb: (summary: any) => void) => () => void;
      showContextMenu: () => void;
      setScale: (scale: number) => void;
      onPetZoom: (cb: (zoom: number) => void) => () => void;
      onPetVisibilityChanged: (cb: (visible: boolean) => void) => () => void;
    };
    live2dAction?: {
      onPlayAction: (cb: (target: FireflyTarget) => void) => () => void;
    };
    live2dSpeech?: {
      onPrepare: (cb: () => void) => () => void;
      onMouthStart: (cb: (payload: { durationMs: number }) => void) => () => void;
      onMouthStop: (cb: () => void) => () => void;
    };
    characterState?: {
      getState: () => Promise<any>;
      careAction: (action: CareActionType) => Promise<{ state: any; actionId: string; feedback?: string }>;
      onStateChanged: (cb: (state: any) => void) => () => void;
    };
    tts?: {
      startSession: (request: StartTtsRequest) => Promise<TtsStartResult>;
      cancelSession: (requestId: string) => Promise<boolean>;
      getSettings: () => Promise<TtsSettings>;
      saveSettings: (settings: TtsSettings) => Promise<boolean>;
      onSessionEvent: (cb: (event: TtsSessionEvent) => void) => () => void;
    };
    chat?: {
      sendMessage: (
        message: string,
        history?: ChatMessage[],
      ) => Promise<{
        ok?: boolean;
        status?: string;
        replyText: string;
        history: ChatMessage[];
        toolCalled?: boolean;
        error?: string;
        embodimentPlan?: any;
        correlationId?: string;
      }>;
      getProviderStatus: () => Promise<ProviderStatus>;
      onProviderStatusChanged: (cb: (status: ProviderStatus) => void) => () => void;
    };
    settings?: {
      load: () => Promise<any>;
      save: (settings: any) => Promise<boolean>;
    };
    startup?: {
      get: () => Promise<boolean>;
      set: (enabled: boolean) => Promise<boolean>;
    };
  }
}
