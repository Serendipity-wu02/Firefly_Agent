import type { Live2DModel } from "pixi-live2d-display/cubism4";

const MOUTH_TICK_MS = 80;
export const MOUTH_SYNC_FAILSAFE_DURATION_MS = 5 * 60 * 1000;
const MAX_MOUTH_DURATION_MS = MOUTH_SYNC_FAILSAFE_DURATION_MS;
const MIN_MOUTH_VALUE = 0.15;
const MAX_MOUTH_VALUE = 0.85;

type CoreModelWithParameters = {
  setParameterValueById?: (id: string, value: number) => void;
  setParameterValueByIndex?: (index: number, value: number) => void;
  getParameterIndex?: (id: string) => number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class MouthSyncController {
  private readonly modelGetter: () => Live2DModel | null;
  private intervalId: number | null = null;
  private timeoutId: number | null = null;
  private disposed = false;
  private mouthOpen = false;

  constructor(modelGetter: () => Live2DModel | null) {
    this.modelGetter = modelGetter;
  }

  start(durationMs: number = MOUTH_SYNC_FAILSAFE_DURATION_MS): void {
    if (this.disposed) return;
    this.stop();
    const safeDuration = clamp(Number.isFinite(durationMs) ? durationMs : 0, 0, MAX_MOUTH_DURATION_MS);
    if (safeDuration <= 0) {
      this.setMouth(0);
      return;
    }

    this.tick();
    this.intervalId = window.setInterval(() => this.tick(), MOUTH_TICK_MS);
    this.timeoutId = window.setTimeout(() => this.stop(), safeDuration);
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
    try {
      const model = this.modelGetter();
      if (!model) return;
      const coreModel = (model.internalModel as unknown as { coreModel?: CoreModelWithParameters }).coreModel;
      if (!coreModel) return;
      if (typeof coreModel.setParameterValueById === "function") {
        coreModel.setParameterValueById("ParamMouthOpenY", value);
        return;
      }
      if (typeof coreModel.getParameterIndex === "function" && typeof coreModel.setParameterValueByIndex === "function") {
        const index = coreModel.getParameterIndex("ParamMouthOpenY");
        if (index >= 0) coreModel.setParameterValueByIndex(index, value);
      }
    } catch (err) {
      console.warn("[Firefly] mouth sync failed", err);
      if (this.intervalId !== null) {
        window.clearInterval(this.intervalId);
        this.intervalId = null;
      }
      if (this.timeoutId !== null) {
        window.clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
      this.mouthOpen = false;
    }
  }
}
