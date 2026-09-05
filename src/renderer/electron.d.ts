import type { FireflyTarget } from "../shared/firefly-actions";
import type { CareActionType } from "../shared/firefly-state";
import type { StartTtsRequest, TtsPlaybackStopRequest, TtsStartResult, TtsSessionEvent } from "../shared/tts-session";
import type { TtsSettings } from "../shared/tts-types";
import type { ChatMessage } from "../shared/chat-types";
import type { ProviderStatus } from "../shared/provider-types";
import type { ProactiveLinePayload } from "../shared/proactive-types";
import type { UiPreferences } from "../shared/ui-types";

interface FireflySettingsSnapshot {
  llm?: {
    provider: "local" | "openai" | "deepseek" | "openrouter" | "custom";
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
    enableStreaming: boolean;
  };
  tts?: TtsSettings;
  ui?: UiPreferences;
}

declare global {
  interface Window {
    firefly?: {
      minimize: () => void;
      hide: () => void;
      close: () => void;
      toggleMaximize: () => void;
      quit: () => void;
      setInteractive: (interactive: boolean) => Promise<void>;
      moveBy: (dx: number, dy: number) => void;
      moveTo: (x: number, y: number) => void;
      setDragging: (isDragging: boolean) => void;
      setSpeaking: (isSpeaking: boolean, requestId?: string) => void;
      onSpeakingChanged: (cb: (isSpeaking: boolean) => void) => () => void;
      onProactiveLine?: (cb: (payload: ProactiveLinePayload) => void) => () => void;
      captureFrame: () => Promise<string | null>;
      getCursorPosition: () => Promise<{ x: number; y: number } | null>;
      interact?: (action: "click" | "touch") => Promise<any>;
      openChat: () => void;
      openStatus: () => void;
      openSettings: () => void;
      onOpenSettings?: (cb: () => void) => () => void;
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
    characterState?: {
      getState: () => Promise<any>;
      careAction: (action: CareActionType) => Promise<{ state: any; actionId: string; feedback?: string }>;
      onStateChanged: (cb: (state: any) => void) => () => void;
    };
    tts?: {
      startSession: (request: StartTtsRequest) => Promise<TtsStartResult>;
      cancelSession: (requestId: string) => Promise<boolean>;
      acquirePlayback: (requestId: string) => Promise<boolean>;
      releasePlayback: (requestId: string) => Promise<boolean>;
      onPlaybackStop: (cb: (request: TtsPlaybackStopRequest) => void) => () => void;
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
      load: () => Promise<FireflySettingsSnapshot>;
      save: (settings: Partial<FireflySettingsSnapshot>) => Promise<boolean>;
      onSettingsChanged: (cb: (settings: FireflySettingsSnapshot) => void) => () => void;
    };
    startup?: {
      get: () => Promise<boolean>;
      set: (enabled: boolean) => Promise<boolean>;
    };
  }
}
