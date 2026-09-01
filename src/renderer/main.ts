import { Live2DManager } from "./live2d/manager";
import { ClickThroughController } from "./live2d/click-through";
import { MouseFocusController } from "./live2d/focus";
import { MouthSyncController } from "./live2d/mouth-sync";
import { ExpressionResetController } from "./live2d/expression-reset";
import { SpeakingMotionController } from "./live2d/speaking-motion";
import { InteractionController, DefaultHitAreaAbstraction } from "./live2d/interaction";
import { Live2DRendererLifecycleTracker } from "./live2d/lifecycle-diagnostics";
import type { FireflyTarget } from "../shared/firefly-actions";
import type { CareActionType } from "../shared/firefly-state";

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
      openChat: () => void;
      openStatus: () => void;
      openSettings: () => void;
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
      startSession: (request: any) => Promise<any>;
      cancelSession: (requestId: string) => Promise<boolean>;
      getSettings: () => Promise<any>;
      saveSettings: (settings: any) => Promise<boolean>;
      onSessionEvent: (cb: (event: any) => void) => () => void;
    };
  }
}

window.addEventListener("error", (event) => {
  console.error("[Renderer Error]", event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[Renderer Promise Rejection]", event.reason);
});

console.log("[Firefly-Agent] Initializing Live2D Desktop Pet Renderer...");

const canvas = document.getElementById("live2d-canvas") as HTMLCanvasElement;

if (!canvas) {
  throw new Error("Required DOM element #live2d-canvas not found");
}

console.log(
  "[Canvas Diagnostics]",
  [...document.querySelectorAll("canvas")].map((c) => ({
    width: c.width,
    height: c.height,
    clientWidth: c.clientWidth,
    clientHeight: c.clientHeight,
  }))
);

const lifecycle = new Live2DRendererLifecycleTracker();

// 1. Initialize Live2D Manager (Live2D-only Architecture)
const manager = new Live2DManager({
  canvas,
  width: window.innerWidth,
  height: window.innerHeight,
  modelPath: "assets://firefly/models/Firefly.model3.json",
  onLoad: () => {
    console.log("[Firefly-Agent] Live2D Model loaded successfully.");
  },
  onModelUnavailable: () => {
    console.warn("[Firefly-Agent] Live2D model unavailable.");
  },
});

lifecycle.track("resource", "manager", () => manager.dispose());

// 2. Interaction Controller (Click, Touch, Drag, Context Menu)
const interaction = new InteractionController(canvas, manager, {
  hitArea: new DefaultHitAreaAbstraction(() => manager),
  alphaThreshold: 15,
  dragDistanceThreshold: 5,
  onPetClick: () => {
    console.log("[Firefly-Agent] Character Body Clicked -> Requesting V2.4 Character Interaction (click)");
    void (window.firefly as any)?.interact?.("click");
  },
  onPetPet: () => {
    console.log("[Firefly-Agent] Character Head Petted -> Requesting V2.4 Character Interaction (touch)");
    void (window.firefly as any)?.interact?.("touch");
  },
  onPetDragStart: () => {
    console.log("[Firefly-Agent] Character Dragging started");
  },
  onPetDragEnd: () => {
    console.log("[Firefly-Agent] Character Drag Ended");
  },
  onContextMenu: () => {
    console.log("[Firefly-Agent] Context Menu requested");
    window.firefly?.showContextMenu();
  },
});
lifecycle.track("resource", "interaction", () => interaction.dispose());

// 3. Click Through Controller (pixel alpha sampling)
const clickThrough = new ClickThroughController(canvas, manager, {
  alphaThreshold: 15,
  isDraggingCheck: () => interaction.getIsDragging(),
  onInteractive: (interactive) => {
    void window.firefly?.setInteractive(interactive);
  },
});
lifecycle.track("resource", "clickThrough", () => clickThrough.dispose());

// 4. Mouse Focus Tracking Controller
const mouseFocus = new MouseFocusController(canvas, () => manager.getModel());
lifecycle.track("resource", "mouseFocus", () => mouseFocus.dispose());

// 5. Mouth Sync Controller
const mouthSync = new MouthSyncController(() => manager.getModel());
lifecycle.track("resource", "mouthSync", () => mouthSync.dispose());

// 6. Expression Reset Controller
// Restores the CURRENT Behavior expression (persistent state), never an
// unconditional expression00 — the Behavior may legitimately be happy, shy,
// thinking, concerned, etc. when a temporary reaction expires.
let currentPersistentExpression = "expression00";
const expressionReset = new ExpressionResetController({
  defaultDurationMs: 5000,
  onReset: () => {
    manager.setExpression(currentPersistentExpression);
  },
});
lifecycle.track("resource", "expressionReset", () => expressionReset.dispose());

// 7. Speaking Motion Controller
const speakingMotion = new SpeakingMotionController({
  manager,
  mouthSync,
});
lifecycle.track("resource", "speakingMotion", () => speakingMotion.dispose());

// 8. Speaking State -> Live2D Mouth Sync
if (window.firefly?.onSpeakingChanged) {
  const unsubSpeaking = window.firefly.onSpeakingChanged((isSpeaking) => {
    console.log("[Firefly-Agent] Speaking state changed:", isSpeaking);
    speakingMotion.setSpeaking(isSpeaking);
  });
  lifecycle.track("subscription", "speakingChanged", unsubSpeaking);
}

// 9. Hook IPC Listeners
if (window.live2dAction?.onPlayAction) {
  const unsub = window.live2dAction.onPlayAction((target) => {
    console.log("[Firefly-Agent] Received Action Target from Main Action Catalog:", target);
    manager.playTarget(target);
    if (target.kind === "expression") {
      if ((target as any).temporary) {
        // One-shot reaction expression: apply → duration → restore current Behavior expression
        expressionReset.trigger((target as any).durationMs);
      } else {
        // Persistent Behavior expression: becomes the restore target and
        // supersedes any pending temporary-expression reset
        currentPersistentExpression = target.name;
        expressionReset.cancel();
      }
    }
    // Motion lifecycle: plays to its natural end, then Idle group resumes.
    // No timer is imposed on motions.
  });
  lifecycle.track("subscription", "live2dAction", unsub);
}

// 10. Live2D Speech manual hooks
if (window.live2dSpeech?.onMouthStart) {
  const unsubMouthStart = window.live2dSpeech.onMouthStart(({ durationMs }) => {
    mouthSync.start(durationMs);
  });
  lifecycle.track("subscription", "live2dSpeech:mouthStart", unsubMouthStart);
}

if (window.live2dSpeech?.onMouthStop) {
  const unsubMouthStop = window.live2dSpeech.onMouthStop(() => {
    mouthSync.stop();
  });
  lifecycle.track("subscription", "live2dSpeech:mouthStop", unsubMouthStop);
}

// 11. Zoom Listener
if (window.firefly?.onPetZoom) {
  const unsubZoom = window.firefly.onPetZoom((scale) => {
    console.log("[Firefly-Agent] Window zoom updated:", scale);
    manager.applyZoom(scale);
  });
  lifecycle.track("subscription", "petZoom", unsubZoom);
}

// 12. Visibility Listener
if (window.firefly?.onPetVisibilityChanged) {
  const unsubVisibility = window.firefly.onPetVisibilityChanged((visible) => {
    console.log("[Firefly-Agent] Visibility changed:", visible);
    if (visible) {
      manager.resume();
      mouseFocus.resume();
      clickThrough.resume();
    } else {
      manager.pause();
      mouseFocus.pause();
      clickThrough.pause();
    }
  });
  lifecycle.track("subscription", "petVisibility", unsubVisibility);
}

// 13. Window Resize
const handleResize = () => {
  manager.resize(window.innerWidth, window.innerHeight);
};
window.addEventListener("resize", handleResize);
lifecycle.track("listener", "windowResize", () => window.removeEventListener("resize", handleResize));

console.log("[Firefly-Agent] Live2D Desktop Pet Renderer ready!");
