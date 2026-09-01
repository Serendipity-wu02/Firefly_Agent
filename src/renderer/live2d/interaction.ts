import type { FireflyLive2DManager } from "./manager";
import { debugLog } from "../debug-log";

export type HitAreaType = "head" | "body" | "special";

export interface HitAreaAbstraction {
  /**
   * Evaluates which logical hit area is targeted at canvas relative coordinates
   */
  hitTest(x: number, y: number, canvasWidth: number, canvasHeight: number): HitAreaType;
}

export class DefaultHitAreaAbstraction implements HitAreaAbstraction {
  constructor(private managerGetter?: () => FireflyLive2DManager) {}

  hitTest(x: number, y: number, canvasWidth: number, canvasHeight: number): HitAreaType {
    const manager = this.managerGetter?.();
    if (manager?.getIsLive2DAvailable()) {
      const model = manager.getModel();
      if (model) {
        try {
          const hitNames = model.hitTest(x, y);
          if (Array.isArray(hitNames) && hitNames.length > 0) {
            const lowerNames = hitNames.map((h: string) => h.toLowerCase());
            if (lowerNames.some((h: string) => h.includes("head") || h.includes("hair") || h.includes("face"))) {
              return "head";
            }
            if (lowerNames.some((h: string) => h.includes("special"))) {
              return "special";
            }
            return "body";
          }
        } catch {
          // Fallback to proportional calculation
        }
      }
    }

    const relY = y / canvasHeight;
    // Top 38% represents head (摸头), remainder is body (点击)
    if (relY < 0.38) {
      return "head";
    }
    return "body";
  }
}

export interface InteractionOptions {
  hitArea?: HitAreaAbstraction;
  alphaThreshold?: number;
  dragDistanceThreshold?: number;
  onPetClick?: () => void;
  onPetPet?: () => void;
  onPetDragStart?: () => void;
  onPetDragEnd?: () => void;
  onContextMenu?: () => void;
}

export class InteractionController {
  private readonly canvas: HTMLCanvasElement;
  private readonly manager: FireflyLive2DManager;
  private readonly hitArea: HitAreaAbstraction;
  private readonly alphaThreshold: number;
  private readonly dragThreshold: number;
  private readonly options: InteractionOptions;

  private isPotentialDrag = false;
  private isDragging = false;
  private startScreenX = 0;
  private startScreenY = 0;
  private lastScreenX = 0;
  private lastScreenY = 0;
  private startClientX = 0;
  private startClientY = 0;
  private startTime = 0;
  private disposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    manager: FireflyLive2DManager,
    options: InteractionOptions = {},
  ) {
    this.canvas = canvas;
    this.manager = manager;
    this.hitArea = options.hitArea ?? new DefaultHitAreaAbstraction();
    this.alphaThreshold = options.alphaThreshold ?? 15;
    this.dragThreshold = options.dragDistanceThreshold ?? 5;
    this.options = options;

    window.addEventListener("pointerdown", this.handleDown);
    window.addEventListener("pointermove", this.handleMove);
    window.addEventListener("pointerup", this.handleUp);
    window.addEventListener("pointercancel", this.handleCancel);
    window.addEventListener("contextmenu", this.handleContextMenu);
  }

  public getIsDragging(): boolean {
    return this.isDragging;
  }

  private handleContextMenu = (e: MouseEvent): void => {
    if (this.disposed) return;
    const alpha = this.manager.getPixelAlpha(e.clientX, e.clientY);
    debugLog(`[Interaction] contextmenu at (${e.clientX}, ${e.clientY}), alpha = ${alpha}`);
    if (alpha >= this.alphaThreshold) {
      e.preventDefault();
      debugLog("[Interaction] Context menu triggered on character silhouette!");
      this.options.onContextMenu?.();
    }
  };

  private handleDown = (e: PointerEvent): void => {
    if (this.disposed) return;
    if (e.button !== 0) return; // Left button only

    const alpha = this.manager.getPixelAlpha(e.clientX, e.clientY);
    debugLog(`[Interaction] pointerdown (left) at (${e.clientX}, ${e.clientY}), alpha = ${alpha}`);
    if (alpha < this.alphaThreshold) return;

    this.isPotentialDrag = true;
    this.isDragging = false;
    this.startScreenX = e.screenX;
    this.startScreenY = e.screenY;
    this.lastScreenX = e.screenX;
    this.lastScreenY = e.screenY;
    this.startClientX = e.clientX;
    this.startClientY = e.clientY;
    this.startTime = Date.now();
  };

  private handleMove = (e: PointerEvent): void => {
    if (this.disposed || !this.isPotentialDrag) return;

    const totalDist = Math.hypot(e.screenX - this.startScreenX, e.screenY - this.startScreenY);

    if (!this.isDragging && totalDist >= this.dragThreshold) {
      this.isDragging = true;
      debugLog(`[Interaction] Drag started (totalDist=${totalDist.toFixed(1)}px >= threshold=${this.dragThreshold}px)`);
      window.firefly?.setDragging(true);
      this.options.onPetDragStart?.();
    }

    if (this.isDragging) {
      const dx = e.screenX - this.lastScreenX;
      const dy = e.screenY - this.lastScreenY;
      this.lastScreenX = e.screenX;
      this.lastScreenY = e.screenY;
      window.firefly?.moveBy(dx, dy);
    }
  };

  private handleUp = (e: PointerEvent): void => {
    if (this.disposed || !this.isPotentialDrag) return;
    this.isPotentialDrag = false;

    if (this.isDragging) {
      this.isDragging = false;
      window.firefly?.setDragging(false);
      this.options.onPetDragEnd?.();
      return;
    }

    // It was a click/touch interaction
    const totalDist = Math.hypot(e.screenX - this.startScreenX, e.screenY - this.startScreenY);
    const duration = Date.now() - this.startTime;

    if (totalDist < this.dragThreshold && duration < 600) {
      const targetArea = this.hitArea.hitTest(
        this.startClientX,
        this.startClientY,
        this.canvas.width,
        this.canvas.height,
      );

      if (targetArea === "head") {
        this.options.onPetPet?.();
      } else {
        this.options.onPetClick?.();
      }
    }
  };

  private handleCancel = (): void => {
    if (this.isDragging) {
      this.isDragging = false;
      window.firefly?.setDragging(false);
      this.options.onPetDragEnd?.();
    }
    this.isPotentialDrag = false;
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener("pointerdown", this.handleDown);
    window.removeEventListener("pointermove", this.handleMove);
    window.removeEventListener("pointerup", this.handleUp);
    window.removeEventListener("pointercancel", this.handleCancel);
    window.removeEventListener("contextmenu", this.handleContextMenu);
  }
}
