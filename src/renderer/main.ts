import { Live2DManager } from "./live2d/manager";
import { debugLog } from "./debug-log";
import { ClickThroughController } from "./live2d/click-through";
import { MouseFocusController } from "./live2d/focus";
import { MouthSyncController } from "./live2d/mouth-sync";
import { ExpressionResetController } from "./live2d/expression-reset";
import { SpeakingMotionController } from "./live2d/speaking-motion";
import { InteractionController, DefaultHitAreaAbstraction } from "./live2d/interaction";
import { Live2DRendererLifecycleTracker } from "./live2d/lifecycle-diagnostics";
import type { FireflyTarget } from "../shared/firefly-actions";
import type { CareActionType } from "../shared/firefly-state";



window.addEventListener("error", (event) => {
  console.error("[Renderer Error]", event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[Renderer Promise Rejection]", event.reason);
});

debugLog("[Firefly-Agent] Initializing Live2D Desktop Pet Renderer...");

const canvas = document.getElementById("live2d-canvas") as HTMLCanvasElement;

if (!canvas) {
  throw new Error("Required DOM element #live2d-canvas not found");
}

debugLog(
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
    debugLog("[Firefly-Agent] Live2D Model loaded successfully.");
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
    debugLog("[Firefly-Agent] Character Body Clicked -> Requesting V2.4 Character Interaction (click)");
    void (window.firefly as any)?.interact?.("click");
  },
  onPetPet: () => {
    debugLog("[Firefly-Agent] Character Head Petted -> Requesting V2.4 Character Interaction (touch)");
    void (window.firefly as any)?.interact?.("touch");
  },
  onPetDragStart: () => {
    debugLog("[Firefly-Agent] Character Dragging started");
  },
  onPetDragEnd: () => {
    debugLog("[Firefly-Agent] Character Drag Ended");
  },
  onContextMenu: () => {
    debugLog("[Firefly-Agent] Context Menu requested");
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

// 6. Expression Lifecycle & Reset Controller
// - No active Behavior: currentPersistentExpression = "expression00" (baseline)
// - Active Behavior: currentPersistentExpression = target.name
// - Temporary Reaction: plays for durationMs, then restores currentPersistentExpression
// - Behavior Completion: when active behavior finishes, returns cleanly to currentPersistentExpression = "expression00"
let currentPersistentExpression = "expression00";
let activeBehaviorTimer: number | null = null;

const expressionReset = new ExpressionResetController({
  defaultDurationMs: 5000,
  onReset: () => {
    debugLog(`[Live2D Lifecycle] temporary expression expired -> restoring current behavior expression "${currentPersistentExpression}"`);
    manager.setExpression(currentPersistentExpression);
  },
});

function setActiveBehavior(expressionName: string, durationMs?: number): void {
  if (activeBehaviorTimer !== null) {
    window.clearTimeout(activeBehaviorTimer);
    activeBehaviorTimer = null;
  }

  currentPersistentExpression = expressionName || "expression00";
  expressionReset.cancel();
  manager.setExpression(currentPersistentExpression);

  if (currentPersistentExpression !== "expression00" && durationMs && durationMs > 0) {
    activeBehaviorTimer = window.setTimeout(() => {
      activeBehaviorTimer = null;
      debugLog(`[Live2D Lifecycle] active behavior (${currentPersistentExpression}) completed -> returning to baseline`);
      currentPersistentExpression = "expression00";
      manager.setExpression(currentPersistentExpression);
    }, durationMs);
  }
}

lifecycle.track("resource", "expressionReset", () => {
  expressionReset.dispose();
  if (activeBehaviorTimer !== null) {
    window.clearTimeout(activeBehaviorTimer);
    activeBehaviorTimer = null;
  }
});

// 7. Speaking Motion Controller (MouthSync only — never overrides or owns character expression)
const speakingMotion = new SpeakingMotionController({
  manager,
  mouthSync,
});
lifecycle.track("resource", "speakingMotion", () => speakingMotion.dispose());

// 8. Speaking State -> Live2D Mouth Sync
if (window.firefly?.onSpeakingChanged) {
  const unsubSpeaking = window.firefly.onSpeakingChanged((isSpeaking) => {
    debugLog("[Firefly-Agent] Speaking state changed:", isSpeaking);
    speakingMotion.setSpeaking(isSpeaking);
  });
  lifecycle.track("subscription", "speakingChanged", unsubSpeaking);
}

// 9. Hook IPC Listeners
if (window.live2dAction?.onPlayAction) {
  const unsub = window.live2dAction.onPlayAction((target) => {
    debugLog("[Firefly-Agent] Received Action Target from Main Action Catalog:", target);
    manager.playTarget(target);
    if (target.kind === "expression") {
      if ((target as any).temporary) {
        // One-shot reaction expression: apply → duration → restore current Behavior expression
        expressionReset.trigger((target as any).durationMs);
      } else {
        // Active Behavior expression: becomes the active behavior expression
        const behaviorDuration = (target as any).behaviorDurationMs || (target as any).durationMs;
        setActiveBehavior(target.name, behaviorDuration);
      }
    }
    // Motion lifecycle: plays to its natural end or catalog duration, then Idle/0 resumes.
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
    debugLog("[Firefly-Agent] Window zoom updated:", scale);
    manager.applyZoom(scale);
  });
  lifecycle.track("subscription", "petZoom", unsubZoom);
}

// 12. Visibility Listener
if (window.firefly?.onPetVisibilityChanged) {
  const unsubVisibility = window.firefly.onPetVisibilityChanged((visible) => {
    debugLog("[Firefly-Agent] Visibility changed:", visible);
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

debugLog("[Firefly-Agent] Live2D Desktop Pet Renderer ready!");
