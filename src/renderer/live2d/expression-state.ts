import type { Live2DModel } from "pixi-live2d-display/cubism4";

export class FireflyExpressionState {
  private readonly model: Live2DModel;
  private moodExpression = "expression00";
  private moodUpdatedAt = -1;
  private temporaryTimer: number | null = null;
  private resetTimer: number | null = null;
  private manualActive = false;
  private disposed = false;

  constructor(model: Live2DModel) {
    this.model = model;
    this.restart();
  }

  async setMood(expressionName: string, updatedAt: number): Promise<boolean> {
    if (this.disposed || !Number.isFinite(updatedAt) || updatedAt <= this.moodUpdatedAt) return false;
    this.moodUpdatedAt = updatedAt;
    if (expressionName === this.moodExpression) return false;
    this.moodExpression = expressionName;
    return this.temporaryTimer === null && !this.manualActive ? this.resetNow() : false;
  }

  suspend(): void {
    this.manualActive = true;
  }

  async resume(): Promise<boolean> {
    this.manualActive = false;
    return this.resetNow();
  }

  trigger(durationMs: number, onFinished: (restored: boolean) => void): void {
    if (this.disposed) return;
    this.manualActive = true;
    if (this.temporaryTimer !== null) window.clearTimeout(this.temporaryTimer);
    this.temporaryTimer = window.setTimeout(() => {
      this.temporaryTimer = null;
      void this.resume().then(onFinished);
    }, durationMs);
    this.restart();
  }

  async resetNow(): Promise<boolean> {
    if (this.disposed || this.temporaryTimer !== null || this.manualActive) return false;
    try {
      return await this.model.expression(this.moodExpression);
    } catch (error) {
      console.warn("[Firefly] expression restore failed", error);
      return false;
    }
  }

  restart(): void {
    if (this.disposed) return;
    if (this.resetTimer !== null) window.clearInterval(this.resetTimer);
    this.resetTimer = window.setInterval(() => {
      if (this.temporaryTimer === null && !this.manualActive) void this.resetNow();
    }, 3 * 60 * 1000);
  }

  dispose(): void {
    this.disposed = true;
    if (this.temporaryTimer !== null) window.clearTimeout(this.temporaryTimer);
    if (this.resetTimer !== null) window.clearInterval(this.resetTimer);
    this.temporaryTimer = null;
    this.resetTimer = null;
  }
}
