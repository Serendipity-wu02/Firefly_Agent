export type ApplicationPhase =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "failed";

export interface ApplicationRuntime {
  start(signal: AbortSignal): Promise<void>;
  stop(): Promise<void>;
  activate(): void;
  hasTray(): boolean;
}

export type ApplicationRuntimeFactory = (
  signal: AbortSignal,
) => ApplicationRuntime | Promise<ApplicationRuntime>;

/**
 * Owns the application lifecycle state without owning any domain service.
 * The Electron entry point supplies a runtime factory; the runtime itself
 * owns the concrete service graph and its registrations.
 */
export class FireflyApplication {
  private phase: ApplicationPhase = "idle";
  private runtime: ApplicationRuntime | null = null;
  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;
  private startController: AbortController | null = null;
  private stopRequested = false;
  private readonly createRuntime: ApplicationRuntimeFactory;

  constructor(createRuntime: ApplicationRuntimeFactory) {
    this.createRuntime = createRuntime;
  }

  getPhase(): ApplicationPhase {
    return this.phase;
  }

  async start(): Promise<void> {
    if (this.phase === "running" || this.phase === "starting") {
      await this.startPromise;
      return;
    }

    if (this.phase === "stopping" || this.phase === "stopped" || this.phase === "failed") {
      return;
    }

    this.stopRequested = false;
    this.phase = "starting";
    const controller = new AbortController();
    this.startController = controller;
    const startPromise = this.startInternal(controller);
    this.startPromise = startPromise;

    try {
      await startPromise;
    } finally {
      if (this.startPromise === startPromise) this.startPromise = null;
      if (this.startController === controller) this.startController = null;
    }
  }

  async stop(): Promise<void> {
    if (this.stopPromise) {
      await this.stopPromise;
      return;
    }

    if (this.phase === "stopped") return;

    this.stopRequested = true;
    this.startController?.abort();
    this.phase = this.phase === "idle" ? "stopped" : "stopping";

    const stopPromise = this.stopInternal();
    this.stopPromise = stopPromise;
    try {
      await stopPromise;
    } finally {
      if (this.stopPromise === stopPromise) this.stopPromise = null;
    }
  }

  activate(): void {
    if (this.phase !== "running") return;
    this.runtime?.activate();
  }

  hasTray(): boolean {
    return this.runtime?.hasTray() ?? false;
  }

  private async startInternal(controller: AbortController): Promise<void> {
    let runtime: ApplicationRuntime | null = null;
    try {
      runtime = await this.createRuntime(controller.signal);
      this.runtime = runtime;
      this.throwIfStopping(controller.signal);

      await runtime.start(controller.signal);
      this.throwIfStopping(controller.signal);

      this.phase = "running";
    } catch (error: unknown) {
      controller.abort();
      if (runtime) await this.disposeRuntime(runtime);
      this.runtime = null;
      this.phase = "failed";
      throw error;
    }
  }

  private async stopInternal(): Promise<void> {
    try {
      await this.startPromise;
    } catch {
      // Startup failure has already performed its own runtime cleanup.
    }

    const runtime = this.runtime;
    this.runtime = null;
    if (runtime) await this.disposeRuntime(runtime);

    this.phase = "stopped";
  }

  private throwIfStopping(signal: AbortSignal): void {
    if (this.stopRequested || signal.aborted) {
      throw new Error("Firefly application startup was cancelled.");
    }
  }

  private async disposeRuntime(runtime: ApplicationRuntime): Promise<void> {
    try {
      await runtime.stop();
    } catch (error: unknown) {
      console.error("[FireflyApplication] Runtime cleanup failed:", error);
    }
  }
}
