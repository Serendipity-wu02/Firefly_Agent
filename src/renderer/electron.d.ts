import type { FireflyTarget } from "../shared/firefly-actions";
import type { StartTtsRequest, TtsPlaybackStopRequest, TtsStartResult, TtsSessionEvent } from "../shared/tts-session";
import type { TtsSettings } from "../shared/tts-types";
import type { ChatMessage } from "../shared/chat-types";
import type { ProviderStatus } from "../shared/provider-types";
import type { ProactiveLinePayload } from "../shared/proactive-types";
import type { WindowStateSnapshot } from "../shared/window-types";
import type { FireflySettingsSnapshot, FireflySettingsUpdate } from "../shared/settings-types";
import type {
  ApprovalChangedEvent,
  ApprovalIpcResponse,
  ApprovalResolveRequest,
} from "../shared/approval-ipc-types";
import type { ApprovalRecord } from "../shared/approval-types";
import type {
  WorkCreatePlanRequest,
  WorkMarkdownExportResult,
  WorkTaskOperationResult,
  WorkTaskSnapshot,
} from "../shared/work-types";
import type {
  WorkFileSelectionOperationResult,
  WorkFileSelectionSnapshot,
} from "../shared/work-file-types";

declare global {
  interface Window {
    firefly?: {
      minimize: () => void;
      hide: () => void;
      close: () => void;
      toggleMaximize: () => void;
      getWindowState: () => Promise<WindowStateSnapshot>;
      onWindowStateChanged: (cb: (state: WindowStateSnapshot) => void) => () => void;
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
      openSummary: () => void;
      openWork: () => void;
      onSummaryUpdated?: (cb: (summary: any) => void) => () => void;
      showContextMenu: () => void;
      setScale: (scale: number) => void;
      onPetZoom: (cb: (zoom: number) => void) => () => void;
      onPetVisibilityChanged: (cb: (visible: boolean) => void) => () => void;
    };
    live2dAction?: {
      onPlayAction: (cb: (target: FireflyTarget) => void) => () => void;
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
      getHistory: () => Promise<ChatMessage[]>;
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
      save: (settings: FireflySettingsUpdate) => Promise<boolean>;
      onSettingsChanged: (cb: (settings: FireflySettingsSnapshot) => void) => () => void;
    };
    work?: {
      getState: () => Promise<WorkTaskSnapshot | null>;
      getFileSelection: () => Promise<WorkFileSelectionSnapshot | undefined>;
      selectFiles: () => Promise<WorkFileSelectionOperationResult>;
      createPlan: (request: WorkCreatePlanRequest) => Promise<WorkTaskOperationResult>;
      confirmPlan: (proposalId: string) => Promise<WorkTaskOperationResult>;
      cancel: () => Promise<WorkTaskOperationResult>;
      exportMarkdown: () => Promise<WorkMarkdownExportResult>;
      onStateChanged: (cb: (snapshot: WorkTaskSnapshot) => void) => () => void;
    };
    startup?: {
      get: () => Promise<boolean>;
      set: (enabled: boolean) => Promise<boolean>;
    };
    approval?: {
      getApprovalRequest: () => Promise<ApprovalRecord | null>;
      resolveApproval: (request: ApprovalResolveRequest) => Promise<ApprovalIpcResponse>;
      onApprovalChanged: (cb: (event: ApprovalChangedEvent) => void) => () => void;
    };
  }
}
