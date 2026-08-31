import type { Live2DModel } from "pixi-live2d-display/cubism4";

const MOUTH_TICK_MS = 80;
const MIN_MOUTH_VALUE = 0.15;
const MAX_MOUTH_VALUE = 0.85;

export class MouthSyncController {
  private readonly modelGetter: () => Live2DModel | null;
  private intervalId: number | null = null;
  private timeoutId: number | null = null;
  private disposed = false;
  private mouthOpen = false;

  constructor(modelGetter: () => Live2DModel | null) {
    this.modelGetter = modelGetter;
  }

  start(durationMs: number): void {
    if (this.disposed) return;
    this.stop();
    if (durationMs <= 0) return;

    this.tick();
    this.intervalId = window.setInterval(() => this.tick(), MOUTH_TICK_MS);
    this.timeoutId = window.setTimeout(() => this.stop(), durationMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.mouthOpen = false;
    this.setMouth(0);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
  }

  private tick(): void {
    this.mouthOpen = !this.mouthOpen;
    const random = Math.random() * 0.15;
    const value = this.mouthOpen ? MAX_MOUTH_VALUE - random : MIN_MOUTH_VALUE + random;
    this.setMouth(value);
  }

  private setMouth(value: number): void {
    const model = this.modelGetter();
    if (!model) return;
    try {
      const coreModel = (model.internalModel as unknown as { coreModel?: { setParameterValueById?: (id: string, val: number) => void } }).coreModel;
      coreModel?.setParameterValueById?.("ParamMouthOpenY", value);
    } catch {
      // Ignore if parameter not present on fallback/current model
    }
  }
}
