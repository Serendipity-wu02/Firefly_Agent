import type { FireflyAction } from "../../shared/firefly-actions";
import { findFireflyAction } from "../../shared/firefly-actions";

export interface PngActionSequence {
  actionId: string;
  frames: readonly string[];
  frameMs: number;
  durationMs: number;
  priority: number;
  interruptible: boolean;
  loop: boolean;
}

// In Electron: assets:// protocol serves from app root assets/ directory
// In dev mode: falls back to relative path (served via Vite dev server if publicDir set)
const BASE_PATH = "assets://firefly/normal";

export const FIREFLY_PNG_ACTIONS: Record<string, PngActionSequence> = {
  idle: {
    actionId: "idle",
    frames: [
      `${BASE_PATH}/idle/idle_01.png`,
      `${BASE_PATH}/idle/idle_02.png`,
    ],
    frameMs: 600,
    durationMs: 5200,
    priority: 0,
    interruptible: true,
    loop: true,
  },
  happy: {
    actionId: "happy",
    frames: [
      `${BASE_PATH}/happy/happying_001.png`,
      `${BASE_PATH}/happy/happying_002.png`,
      `${BASE_PATH}/happy/happying_003.png`,
      `${BASE_PATH}/happy/happying_004.png`,
    ],
    frameMs: 600,
    durationMs: 5000,
    priority: 3,
    interruptible: true,
    loop: false,
  },
  thinking: {
    actionId: "thinking",
    frames: [
      `${BASE_PATH}/thinking/thinking_001.png`,
      `${BASE_PATH}/thinking/thinking_002.png`,
      `${BASE_PATH}/thinking/thinking_003.png`,
      `${BASE_PATH}/thinking/thinking_004.png`,
    ],
    frameMs: 600,
    durationMs: 5000,
    priority: 2,
    interruptible: true,
    loop: false,
  },
  sleepy: {
    actionId: "sleepy",
    frames: [
      `${BASE_PATH}/sleepy/sleepy_001.png`,
      `${BASE_PATH}/sleepy/sleepy_002.png`,
      `${BASE_PATH}/sleepy/sleepy_003.png`,
      `${BASE_PATH}/sleepy/sleepy_004.png`,
    ],
    frameMs: 600,
    durationMs: 5000,
    priority: 1,
    interruptible: true,
    loop: false,
  },
  surprised: {
    actionId: "surprised",
    frames: [
      `${BASE_PATH}/surprised/special_001.png`,
      `${BASE_PATH}/surprised/special_002.png`,
      `${BASE_PATH}/surprised/special_003.png`,
      `${BASE_PATH}/surprised/special_004.png`,
    ],
    frameMs: 600,
    durationMs: 5000,
    priority: 4,
    interruptible: true,
    loop: false,
  },
  dragged: {
    actionId: "dragged",
    frames: [
      `${BASE_PATH}/dragged/dragged_001.png`,
      `${BASE_PATH}/dragged/dragged_002.png`,
      `${BASE_PATH}/dragged/dragged_003.png`,
      `${BASE_PATH}/dragged/dragged_004.png`,
    ],
    frameMs: 600,
    durationMs: 5000,
    priority: 5,
    interruptible: false,
    loop: false,
  },
  touched: {
    actionId: "touched",
    frames: [
      `${BASE_PATH}/touched/touched_001.png`,
      `${BASE_PATH}/touched/touched_002.png`,
      `${BASE_PATH}/touched/touched_003.png`,
      `${BASE_PATH}/touched/touched_004.png`,
    ],
    frameMs: 600,
    durationMs: 5000,
    priority: 3,
    interruptible: true,
    loop: false,
  },
  shy: {
    actionId: "shy",
    frames: [
      `${BASE_PATH}/shy/shy_001.png`,
      `${BASE_PATH}/shy/shy_002.png`,
      `${BASE_PATH}/shy/shy_003.png`,
      `${BASE_PATH}/shy/shy_004.png`,
    ],
    frameMs: 600,
    durationMs: 5000,
    priority: 3,
    interruptible: true,
    loop: false,
  },
  waving: {
    actionId: "waving",
    frames: [
      `${BASE_PATH}/waving/waving_01.png`,
      `${BASE_PATH}/waving/waving_02.png`,
      `${BASE_PATH}/waving/waving_03.png`,
      `${BASE_PATH}/waving/waving_04.png`,
    ],
    frameMs: 600,
    durationMs: 5000,
    priority: 2,
    interruptible: true,
    loop: false,
  },
  reading: {
    actionId: "reading",
    frames: [
      `${BASE_PATH}/reading/reading_001.png`,
      `${BASE_PATH}/reading/reading_002.png`,
      `${BASE_PATH}/reading/reading_003.png`,
      `${BASE_PATH}/reading/reading_004.png`,
    ],
    frameMs: 600,
    durationMs: 4200,
    priority: 2,
    interruptible: true,
    loop: true,
  },
  talking: {
    actionId: "talking",
    frames: [`${BASE_PATH}/talking/talking_01.png`],
    frameMs: 600,
    durationMs: 5000,
    priority: 3,
    interruptible: true,
    loop: false,
  },
  eating: {
    actionId: "eating",
    frames: [
      `${BASE_PATH}/eating/eating_01.png`,
      `${BASE_PATH}/eating/eating_02.png`,
      `${BASE_PATH}/eating/eating_03.png`,
      `${BASE_PATH}/eating/eating_04.png`,
    ],
    frameMs: 600,
    durationMs: 8000,
    priority: 4,
    interruptible: true,
    loop: false,
  },
  resting: {
    actionId: "resting",
    frames: [
      `${BASE_PATH}/resting/rest_001.png`,
      `${BASE_PATH}/resting/rest_002.png`,
      `${BASE_PATH}/resting/rest_003.png`,
      `${BASE_PATH}/resting/rest_004.png`,
    ],
    frameMs: 600,
    durationMs: 8000,
    priority: 2,
    interruptible: true,
    loop: false,
  },
  treatment: {
    actionId: "treatment",
    frames: [
      `${BASE_PATH}/treatment/treatment_001.png`,
      `${BASE_PATH}/treatment/treatment_002.png`,
      `${BASE_PATH}/treatment/treatment_003.png`,
      `${BASE_PATH}/treatment/treatment_004.png`,
      `${BASE_PATH}/treatment/treatment_005.png`,
      `${BASE_PATH}/treatment/treatment_006.png`,
      `${BASE_PATH}/treatment/treatment_007.png`,
      `${BASE_PATH}/treatment/treatment_008.png`,
    ],
    frameMs: 600,
    durationMs: 8000,
    priority: 4,
    interruptible: true,
    loop: false,
  },
  hungry: {
    actionId: "hungry",
    frames: [
      `${BASE_PATH}/hungry/hungry_001.png`,
      `${BASE_PATH}/hungry/hungry_002.png`,
      `${BASE_PATH}/hungry/hungry_003.png`,
      `${BASE_PATH}/hungry/hungry_004.png`,
    ],
    frameMs: 600,
    durationMs: 5000,
    priority: 2,
    interruptible: true,
    loop: false,
  },
  // NOTE: "tired" has no dedicated PNG assets on disk (assets/firefly/normal/tired/ does not exist).
  // It reuses "sleepy" frames as a graceful fallback. Add tired/*.png to provide distinct animation.
  tired: {
    actionId: "tired",
    frames: [
      `${BASE_PATH}/sleepy/sleepy_001.png`,
      `${BASE_PATH}/sleepy/sleepy_002.png`,
      `${BASE_PATH}/sleepy/sleepy_003.png`,
      `${BASE_PATH}/sleepy/sleepy_004.png`,
    ],
    frameMs: 600,
    durationMs: 5000,
    priority: 2,
    interruptible: true,
    loop: false,
  },
  sick: {
    actionId: "sick",
    frames: [
      `${BASE_PATH}/sick/sick_001.png`,
      `${BASE_PATH}/sick/sick_002.png`,
      `${BASE_PATH}/sick/sick_003.png`,
      `${BASE_PATH}/sick/sick_004.png`,
    ],
    frameMs: 600,
    durationMs: 5000,
    priority: 3,
    interruptible: true,
    loop: false,
  },
  attention: {
    actionId: "attention",
    frames: [
      `${BASE_PATH}/attention/attention_001.png`,
      `${BASE_PATH}/attention/attention_002.png`,
      `${BASE_PATH}/attention/attention_003.png`,
      `${BASE_PATH}/attention/attention_004.png`,
    ],
    frameMs: 600,
    durationMs: 5000,
    priority: 3,
    interruptible: true,
    loop: false,
  },
  ignored: {
    actionId: "ignored",
    frames: [
      `${BASE_PATH}/ignored/ignored_001.png`,
      `${BASE_PATH}/ignored/ignored_002.png`,
      `${BASE_PATH}/ignored/ignored_003.png`,
      `${BASE_PATH}/ignored/ignored_004.png`,
    ],
    frameMs: 600,
    durationMs: 5000,
    priority: 3,
    interruptible: true,
    loop: false,
  },
};

export class PngFallbackController {
  private container: HTMLElement;
  private imgElement: HTMLImageElement;
  private currentAction: PngActionSequence;
  private currentFrameIndex = 0;
  private frameTimerId: number | null = null;
  private returnTimerId: number | null = null;
  private isDisposed = false;

  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D | null;

  constructor(container: HTMLElement, imgElement: HTMLImageElement) {
    this.container = container;
    this.imgElement = imgElement;
    this.currentAction = FIREFLY_PNG_ACTIONS.idle;

    this.offscreenCanvas = document.createElement("canvas");
    this.offscreenCanvas.width = 380;
    this.offscreenCanvas.height = 480;
    this.offscreenCtx = this.offscreenCanvas.getContext("2d", { willReadFrequently: true });

    this.playAction("idle");
  }

  show(): void {
    this.container.style.display = "block";
  }

  hide(): void {
    this.container.style.display = "none";
  }

  playAction(actionId: string, force: boolean = false): boolean {
    if (this.isDisposed) return false;

    const action = FIREFLY_PNG_ACTIONS[actionId] ?? FIREFLY_PNG_ACTIONS.idle;

    if (!force && !this.currentAction.interruptible && action.priority < this.currentAction.priority) {
      console.log(`[PngFallback] Cannot interrupt active action "${this.currentAction.actionId}" with lower priority "${actionId}"`);
      return false;
    }

    this.clearTimers();
    this.currentAction = action;
    this.currentFrameIndex = 0;

    this.renderFrame();

    // Start frame loop
    this.frameTimerId = window.setInterval(() => {
      this.nextFrame();
    }, action.frameMs);

    // Return to idle after durationMs if not looping
    if (!action.loop) {
      this.returnTimerId = window.setTimeout(() => {
        this.playAction("idle", true);
      }, action.durationMs);
    }

    return true;
  }

  private nextFrame(): void {
    if (this.isDisposed) return;
    this.currentFrameIndex = (this.currentFrameIndex + 1) % this.currentAction.frames.length;
    this.renderFrame();
  }

  private renderFrame(): void {
    const frameSrc = this.currentAction.frames[this.currentFrameIndex];
    if (!frameSrc) return;

    this.imgElement.src = frameSrc;

    this.imgElement.onload = () => {
      if (this.offscreenCtx && this.imgElement.naturalWidth > 0) {
        this.offscreenCtx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
        this.offscreenCtx.drawImage(
          this.imgElement,
          0,
          0,
          this.offscreenCanvas.width,
          this.offscreenCanvas.height
        );
      }
    };
  }

  getPixelAlpha(clientX: number, clientY: number): number {
    if (!this.offscreenCtx) return 255;
    try {
      const rect = this.imgElement.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      if (x < 0 || y < 0 || x >= this.offscreenCanvas.width || y >= this.offscreenCanvas.height) {
        return 0;
      }

      const pixel = this.offscreenCtx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
      return pixel[3]; // Alpha channel (0 - 255)
    } catch {
      return 255;
    }
  }

  private clearTimers(): void {
    if (this.frameTimerId !== null) {
      clearInterval(this.frameTimerId);
      this.frameTimerId = null;
    }
    if (this.returnTimerId !== null) {
      clearTimeout(this.returnTimerId);
      this.returnTimerId = null;
    }
  }

  dispose(): void {
    this.isDisposed = true;
    this.clearTimers();
  }
}
