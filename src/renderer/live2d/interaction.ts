import type { Live2DModel } from "pixi-live2d-display/cubism4";
import type { Live2DTarget } from "../../shared/live2d-actions";

export const FIREFLY_DOUBLE_CLICK_TARGET = { kind: "expression", name: "expression2" } as const satisfies Live2DTarget;

/**
 * Resolved description of a single hit area and the motion/expression it triggers.
 *
 * The model's HitAreas use a "group:motionName" trigger string. Some entries
 * point at real motion files, while others are expression-only pseudo motions,
 * so both paths are resolved here.
 */
export interface HitAreaDef {
  name: string;
  id: string;
  target: Live2DTarget;
}

export interface InteractionOptions {
  /**
   * Max pointer travel (in CSS pixels) between pointerdown and pointerup
   * for the gesture to still count as a click.
   */
  clickThreshold?: number;
  onTrigger?: (area: HitAreaDef) => void;
  onMiss?: (area: HitAreaDef) => void;
  playAction?: (target: Live2DTarget) => Promise<boolean>;
  doubleClickTarget?: Live2DTarget;
}

/**
 * Maps pointer clicks on the Live2D canvas to model hit-area actions.
 */
export class InteractionController {
  private readonly canvas: HTMLCanvasElement;
  private readonly model: Live2DModel;
  private readonly hitAreaByName: Map<string, HitAreaDef>;
  private readonly clickThreshold: number;
  private readonly onTrigger?: (area: HitAreaDef) => void;
  private readonly onMiss?: (area: HitAreaDef) => void;
  private readonly playAction?: (target: Live2DTarget) => Promise<boolean>;
  private readonly doubleClickTarget?: Live2DTarget;

  private downHits: HitAreaDef[] = [];
  private downPointerId: number | null = null;
  private downScreenX = 0;
  private downScreenY = 0;
  private playing = false;
  private pendingClick: { hits: HitAreaDef[]; screenX: number; screenY: number; timer: ReturnType<typeof setTimeout> } | null = null;
  private disposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    model: Live2DModel,
    hitAreaDefs: HitAreaDef[],
    options: InteractionOptions = {},
  ) {
    this.canvas = canvas;
    this.model = model;
    this.clickThreshold = options.clickThreshold ?? 5;
    this.onTrigger = options.onTrigger;
    this.onMiss = options.onMiss;
    this.playAction = options.playAction;
    this.doubleClickTarget = options.doubleClickTarget;
    this.hitAreaByName = new Map(hitAreaDefs.map((a) => [a.name, a]));

    canvas.addEventListener("pointerdown", this.handleDown);
    canvas.addEventListener("pointerup", this.handleUp);
    canvas.addEventListener("pointercancel", this.handleCancel);
  }

  private handleDown = (e: PointerEvent): void => {
    if (this.disposed || e.button !== 0) return;
    this.downPointerId = e.pointerId;
    this.downScreenX = e.screenX;
    this.downScreenY = e.screenY;
    this.downHits = this.resolveHits(e.clientX, e.clientY);
  };

  private handleUp = (e: PointerEvent): void => {
    if (this.disposed || e.pointerId !== this.downPointerId) return;
    this.downPointerId = null;
    const dx = e.screenX - this.downScreenX;
    const dy = e.screenY - this.downScreenY;
    const dist = Math.hypot(dx, dy);
    const hits = this.downHits;
    this.downHits = [];
    if (dist > this.clickThreshold || this.resolveHits(e.clientX, e.clientY).every((area) => !hits.includes(area))) return;
    if (!this.doubleClickTarget || hits.length === 0) {
      void this.fire(hits);
      return;
    }
    const pending = this.pendingClick;
    if (pending && pending.hits.some((previous) => hits.some((current) => current.name === previous.name))
      && Math.hypot(e.screenX - pending.screenX, e.screenY - pending.screenY) <= this.clickThreshold) {
      clearTimeout(pending.timer);
      this.pendingClick = null;
      void this.fire([{ ...hits[0], target: this.doubleClickTarget }]);
      return;
    }
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingClick = null;
      void this.fire(pending.hits);
    }
    const timer = setTimeout(() => {
      this.pendingClick = null;
      void this.fire(hits);
    }, 300);
    this.pendingClick = { hits, screenX: e.screenX, screenY: e.screenY, timer };
  };

  private handleCancel = (): void => {
    this.downPointerId = null;
    this.downHits = [];
  };

  private resolveHits(x: number, y: number): HitAreaDef[] {
    const names = this.model.hitTest(x, y);
    if (!names || names.length === 0) return [];
    const defs: HitAreaDef[] = [];
    for (const name of names) {
      const def = this.hitAreaByName.get(name);
      if (def) defs.push(def);
    }
    return defs;
  }

  private async fire(hits: HitAreaDef[]): Promise<void> {
    if (hits.length === 0 || this.playing) return;
    this.playing = true;

    try {
      for (let i = 0; i < hits.length; i++) {
        const def = hits[i];
        if (await this.playAction?.(def.target)) {
          this.onTrigger?.(def);
          return;
        }
        if (i === 0) this.onMiss?.(def);
      }
    } finally {
      this.playing = false;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.pendingClick) clearTimeout(this.pendingClick.timer);
    this.pendingClick = null;
    this.canvas.removeEventListener("pointerdown", this.handleDown);
    this.canvas.removeEventListener("pointerup", this.handleUp);
    this.canvas.removeEventListener("pointercancel", this.handleCancel);
  }
}
