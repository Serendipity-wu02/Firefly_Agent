import type { Live2DModel } from "pixi-live2d-display/cubism4";
import type { Live2DActionReceipt, Live2DTarget } from "../../shared/live2d-actions";
import type { Live2DManager } from "./manager";
import type { FireflyExpressionState } from "./expression-state";

export class FireflyActionController {
  private readonly manager: Pick<Live2DManager, "getModel" | "hasAction" | "playAction">;
  private readonly expressions: Pick<FireflyExpressionState, "trigger" | "suspend" | "resume">;
  private busy = false;
  private timer: number | null = null;
  private disposed = false;

  constructor(manager: Pick<Live2DManager, "getModel" | "hasAction" | "playAction">, expressions: Pick<FireflyExpressionState, "trigger" | "suspend" | "resume">) {
    this.manager = manager;
    this.expressions = expressions;
  }

  isBusy(): boolean {
    return this.busy;
  }

  async play(target: Live2DTarget, durationMs: number, report?: (receipt: Omit<Live2DActionReceipt, "requestId">) => void): Promise<boolean> {
    if (this.disposed || this.busy) {
      report?.({ stage: "failed", reason: this.disposed ? "model_unavailable" : "playback_refused" });
      return false;
    }
    const model = this.manager.getModel();
    if (!model) {
      report?.({ stage: "failed", reason: "model_unavailable" });
      return false;
    }
    report?.({ stage: "model_loaded" });
    if (!this.manager.hasAction(target)) {
      report?.({ stage: "failed", reason: "resource_unavailable" });
      return false;
    }
    this.busy = true;
    this.expressions.suspend();
    const started = await this.manager.playAction(target);
    if (this.disposed) return false;
    if (!started) {
      await this.expressions.resume();
      this.busy = false;
      report?.({ stage: "failed", reason: "playback_refused" });
      return false;
    }
    report?.({ stage: "started" });
    if (target.kind === "expression") {
      this.expressions.trigger(durationMs, (restored) => {
        this.busy = false;
        report?.(restored ? { stage: "completed" } : { stage: "failed", reason: "reset_failed" });
      });
      return true;
    }
    if (target.group === "Idle" && target.motionName === "0") {
      await this.expressions.resume();
      this.busy = false;
      return true;
    }
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.finishMotion(model, report);
    }, durationMs);
    return true;
  }

  private async finishMotion(model: Live2DModel, report?: (receipt: Omit<Live2DActionReceipt, "requestId">) => void): Promise<void> {
    if (this.disposed) return;
    try {
      model.internalModel.motionManager.stopAllMotions();
      const idleStarted = await this.manager.playAction({ kind: "motion", group: "Idle", motionName: "0" });
      const expressionRestored = await this.expressions.resume();
      if (!this.disposed) report?.(idleStarted && expressionRestored
        ? { stage: "completed" }
        : { stage: "failed", reason: "reset_failed" });
    } catch (error) {
      console.warn("[Firefly] motion finish failed", error);
      if (!this.disposed) report?.({ stage: "failed", reason: "playback_refused" });
    } finally {
      this.busy = false;
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.busy = false;
  }
}
