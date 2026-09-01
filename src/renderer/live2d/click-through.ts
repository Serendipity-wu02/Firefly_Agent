import type { FireflyLive2DManager } from "./manager";
import { debugLog } from "../debug-log";

export interface ClickThroughOptions {
  alphaThreshold?: number;
  onInteractive?: (interactive: boolean) => void;
  isDraggingCheck?: () => boolean;
}

export class ClickThroughController {
  private readonly canvas: HTMLCanvasElement;
  private readonly manager: FireflyLive2DManager;
  private readonly alphaThreshold: number;
  private readonly onInteractive?: (interactive: boolean) => void;
  private readonly isDraggingCheck?: () => boolean;

  private rafId: number | null = null;
  private pendingPoint: { x: number; y: number } | null = null;
  private currentState: boolean | null = null;
  private paused = false;
  private disposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    manager: FireflyLive2DManager,
    options: ClickThroughOptions = {},
  ) {
    this.canvas = canvas;
    this.manager = manager;
    this.alphaThreshold = options.alphaThreshold ?? 15;
    this.onInteractive = options.onInteractive;
    this.isDraggingCheck = options.isDraggingCheck;

    window.addEventListener("pointermove", this.handleMove);
  }

  pause(): void {
    this.paused = true;
    this.cancelPending();
  }

  resume(): void {
    if (this.disposed) return;
    this.paused = false;
    this.currentState = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelPending();
    window.removeEventListener("pointermove", this.handleMove);
  }

  private handleMove = (event: PointerEvent): void => {
    if (this.disposed || this.paused) return;
    if (this.isDraggingCheck?.()) return; // Don't forward while dragging

    this.pendingPoint = { x: event.clientX, y: event.clientY };
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(this.processPending);
    }
  };

  private processPending = (): void => {
    this.rafId = null;
    if (this.disposed || this.paused || !this.pendingPoint) return;
    if (this.isDraggingCheck?.()) return;

    const pt = this.pendingPoint;
    this.pendingPoint = null;

    const alpha = this.manager.getPixelAlpha(pt.x, pt.y);
    const interactive = alpha >= this.alphaThreshold;

    if (interactive !== this.currentState) {
      this.currentState = interactive;
      debugLog(`[ClickThrough] Pixel alpha at (${pt.x}, ${pt.y}) = ${alpha} -> Setting interactive = ${interactive}`);
      this.onInteractive?.(interactive);
    }
  };

  private cancelPending(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingPoint = null;
  }
}
