import type { Live2DModel } from "pixi-live2d-display/cubism4";

export interface FocusOptions {
  pollIntervalMs?: number;
}

export class MouseFocusController {
  private readonly canvas: HTMLCanvasElement;
  private readonly modelGetter: () => Live2DModel | null;
  private readonly pollIntervalMs: number;

  private paused = false;
  private disposed = false;
  private pollTimer: number | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    modelGetter: () => Live2DModel | null,
    options: FocusOptions = {},
  ) {
    this.canvas = canvas;
    this.modelGetter = modelGetter;
    this.pollIntervalMs = options.pollIntervalMs ?? 50;

    canvas.addEventListener("pointermove", this.handleMove);
    this.startPolling();
  }

  pause(reset = false): void {
    this.paused = true;
    this.stopPolling();
    if (reset) this.focusCenter();
  }

  resume(): void {
    if (this.disposed) return;
    this.paused = false;
    this.startPolling();
  }

  focusCenter(): void {
    const model = this.modelGetter();
    if (!model) return;
    const rect = this.canvas.getBoundingClientRect();
    model.focus(rect.width / 2, rect.height / 2, false);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopPolling();
    this.canvas.removeEventListener("pointermove", this.handleMove);
  }

  private handleMove = (event: PointerEvent): void => {
    if (this.disposed || this.paused) return;
    const model = this.modelGetter();
    if (!model) return;
    model.focus(event.clientX, event.clientY, false);
  };

  private startPolling(): void {
    if (this.pollTimer !== null) return;
    this.pollTimer = window.setInterval(async () => {
      if (this.disposed || this.paused) return;
      const model = this.modelGetter();
      if (!model) return;
      const pos = await window.firefly?.getCursorPosition?.();
      if (pos) {
        const rect = this.canvas.getBoundingClientRect();
        model.focus(pos.x - rect.left, pos.y - rect.top, false);
      }
    }, this.pollIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
