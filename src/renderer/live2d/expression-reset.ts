export interface ExpressionResetOptions {
  defaultDurationMs?: number;
  onReset?: () => void;
}

export class ExpressionResetController {
  private timerId: number | null = null;
  private readonly defaultDurationMs: number;
  private readonly onReset?: () => void;
  private disposed = false;

  constructor(options: ExpressionResetOptions = {}) {
    this.defaultDurationMs = options.defaultDurationMs ?? 5000;
    this.onReset = options.onReset;
  }

  /**
   * Schedule resetting the expression back to default after durationMs
   */
  trigger(durationMs?: number): void {
    if (this.disposed) return;
    this.cancel();

    const timeout = durationMs ?? this.defaultDurationMs;
    if (timeout <= 0) return;

    this.timerId = window.setTimeout(() => {
      this.timerId = null;
      if (!this.disposed) {
        this.onReset?.();
      }
    }, timeout);
  }

  cancel(): void {
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
  }
}
