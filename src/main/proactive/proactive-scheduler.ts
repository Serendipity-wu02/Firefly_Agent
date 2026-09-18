import type {
  ProactiveEvent,
  ProactiveExecutionRequest,
  ProactiveLinePayload,
  ProactiveTriggerReason,
} from "../../shared/proactive-types";
import type { IAgentCore } from "../../shared/agent-core";

export interface ProactiveSchedulerDeps {
  agentCore: IAgentCore;
  isPetVisible?: () => boolean;
  isUserChatActive?: () => boolean;
  isSpeakingActive?: () => boolean;
  broadcastProactive?: (payload: ProactiveLinePayload) => void;
}

interface ActiveProactiveRun {
  readonly runId: string;
  readonly lifecycleId: number;
  readonly reason: ProactiveTriggerReason;
  readonly actionId: string;
  readonly controller: AbortController;
}

/**
 * Lifecycle-only boundary for future proactive sources.
 *
 * No timer or automatic trigger is registered in the current product. The
 * composition root intentionally does not instantiate this class. Keeping
 * the boundary here preserves cancellation, stale-result isolation and the
 * MAIN/toolSurface:none execution contract without keeping a meaningless
 * polling loop alive.
 */
export class FireflyProactiveScheduler {
  private readonly deps: ProactiveSchedulerDeps;
  private started = false;
  private lifecycleId = 0;
  private runSequence = 0;
  private activeRun: ActiveProactiveRun | null = null;
  private readonly eventListeners: Array<(event: ProactiveEvent) => void> = [];

  constructor(deps: ProactiveSchedulerDeps) {
    this.deps = deps;
  }

  onEvent(listener: (event: ProactiveEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      const index = this.eventListeners.indexOf(listener);
      if (index >= 0) this.eventListeners.splice(index, 1);
    };
  }

  private emit(event: ProactiveEvent): void {
    for (const listener of this.eventListeners) listener(event);
  }

  /** Marks the lifecycle boundary active without starting an automatic timer. */
  start(): void {
    if (this.activeRun) {
      this.invalidateActive("scheduler_restarted");
    } else {
      this.lifecycleId += 1;
    }
    this.started = true;
  }

  stop(): void {
    this.started = false;
    this.invalidateActive("scheduler_stopped");
  }

  getLifecycleId(): number {
    return this.lifecycleId;
  }

  /** Called by the owning Chat lifecycle before a user run starts. */
  invalidateForChatStart(): void {
    this.invalidateActive("chat_started");
  }

  /** Called when the owning Pet window becomes hidden. */
  invalidateForPetHidden(): void {
    this.invalidateActive("pet_hidden");
  }

  /** Called before the renderer enters speech playback. */
  invalidateForSpeakingStart(): void {
    this.invalidateActive("speaking_started");
  }

  private invalidateActive(detail: string): void {
    this.lifecycleId += 1;
    const activeRun = this.activeRun;
    this.activeRun = null;

    if (!activeRun) return;

    activeRun.controller.abort();
    // Cancellation is scoped to this proactive run. Application shutdown may
    // still use the global cancelAll path on the AgentCore owner.
    this.deps.agentCore.cancel(activeRun.runId);
    this.emit({
      kind: "proactive_cancelled",
      reason: activeRun.reason,
      actionId: activeRun.actionId,
      runId: activeRun.runId,
      lifecycleId: activeRun.lifecycleId,
      detail,
      timestamp: Date.now(),
    });
  }

  private isCurrentRun(activeRun: ActiveProactiveRun): boolean {
    return (
      this.activeRun === activeRun &&
      this.lifecycleId === activeRun.lifecycleId &&
      !activeRun.controller.signal.aborted
    );
  }

  private getDeliveryBlockReason(): string | null {
    if (this.deps.isUserChatActive?.()) return "User chat in-flight";
    if (this.deps.isSpeakingActive?.()) return "TTS speaking active";
    if (this.deps.isPetVisible && !this.deps.isPetVisible()) return "Pet window hidden";
    return null;
  }

  /**
   * Executes one already-authorized lifecycle request. This method is not a
   * manual IPC or UI entry point; no production caller is registered today.
   */
  async execute(request: ProactiveExecutionRequest): Promise<boolean> {
    if (!this.started) {
      this.emit({
        kind: "proactive_skipped",
        reason: request.reason,
        actionId: request.actionId,
        detail: "No proactive source is registered",
        timestamp: Date.now(),
      });
      return false;
    }

    if (this.activeRun) {
      this.emit({
        kind: "proactive_deferred",
        reason: request.reason,
        actionId: request.actionId,
        detail: "Another proactive run is already in flight",
        timestamp: Date.now(),
      });
      return false;
    }

    const preflightBlockReason = this.getDeliveryBlockReason();
    if (preflightBlockReason) {
      this.emit({
        kind: "proactive_deferred",
        reason: request.reason,
        actionId: request.actionId,
        detail: preflightBlockReason,
        timestamp: Date.now(),
      });
      return false;
    }

    const lifecycleRun: ActiveProactiveRun = {
      runId: request.runId ?? `proactive-${Date.now()}-${++this.runSequence}`,
      lifecycleId: this.lifecycleId,
      reason: request.reason,
      actionId: request.actionId,
      controller: new AbortController(),
    };
    this.activeRun = lifecycleRun;
    this.emit({
      kind: "proactive_triggered",
      reason: lifecycleRun.reason,
      actionId: lifecycleRun.actionId,
      runId: lifecycleRun.runId,
      lifecycleId: lifecycleRun.lifecycleId,
      timestamp: Date.now(),
    });

    try {
      const harnessResult = await this.deps.agentCore.run({
        runId: lifecycleRun.runId,
        source: "proactive",
        userPrompt: request.instruction,
        signal: lifecycleRun.controller.signal,
        executionProfile: { kind: "MAIN", toolSurface: "none" },
      });

      if (!this.isCurrentRun(lifecycleRun)) return false;

      if (harnessResult.status !== "completed") {
        this.activeRun = null;
        this.emit({
          kind: harnessResult.status === "cancelled" ? "proactive_cancelled" : "proactive_failed",
          reason: lifecycleRun.reason,
          actionId: lifecycleRun.actionId,
          runId: lifecycleRun.runId,
          lifecycleId: lifecycleRun.lifecycleId,
          detail: harnessResult.error || `agent status=${harnessResult.status}`,
          timestamp: Date.now(),
        });
        return false;
      }

      this.emit({
        kind: "proactive_completed",
        reason: lifecycleRun.reason,
        actionId: lifecycleRun.actionId,
        runId: lifecycleRun.runId,
        lifecycleId: lifecycleRun.lifecycleId,
        detail: harnessResult.finalText,
        timestamp: Date.now(),
      });

      const deliveryBlockReason =
        harnessResult.finalText.trim().length === 0
          ? "Agent returned empty proactive text"
          : this.getDeliveryBlockReason();
      if (deliveryBlockReason || !this.isCurrentRun(lifecycleRun)) {
        this.activeRun = null;
        this.emit({
          kind: "proactive_skipped",
          reason: lifecycleRun.reason,
          actionId: lifecycleRun.actionId,
          runId: lifecycleRun.runId,
          lifecycleId: lifecycleRun.lifecycleId,
          detail: deliveryBlockReason ?? "Proactive lifecycle is no longer current",
          timestamp: Date.now(),
        });
        return false;
      }

      // Release ownership before broadcast. A future renderer speaking event
      // caused by this line must not cancel an already-submitted run.
      this.activeRun = null;
      if (!this.deps.broadcastProactive) {
        this.emit({
          kind: "proactive_skipped",
          reason: lifecycleRun.reason,
          actionId: lifecycleRun.actionId,
          runId: lifecycleRun.runId,
          lifecycleId: lifecycleRun.lifecycleId,
          detail: "No proactive broadcast callback is registered",
          timestamp: Date.now(),
        });
        return false;
      }

      try {
        this.deps.broadcastProactive({
          text: harnessResult.finalText,
          actionId: lifecycleRun.actionId,
          reason: lifecycleRun.reason,
        });
      } catch (error: unknown) {
        this.emit({
          kind: "proactive_failed",
          reason: lifecycleRun.reason,
          actionId: lifecycleRun.actionId,
          runId: lifecycleRun.runId,
          lifecycleId: lifecycleRun.lifecycleId,
          detail: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        });
        return false;
      }

      this.emit({
        kind: "proactive_broadcast_submitted",
        reason: lifecycleRun.reason,
        actionId: lifecycleRun.actionId,
        runId: lifecycleRun.runId,
        lifecycleId: lifecycleRun.lifecycleId,
        detail: "WindowManager broadcast submitted; receiver presentation is not acknowledged.",
        timestamp: Date.now(),
      });
      return true;
    } catch (error: unknown) {
      if (!this.isCurrentRun(lifecycleRun)) return false;

      this.activeRun = null;
      this.emit({
        kind: "proactive_failed",
        reason: lifecycleRun.reason,
        actionId: lifecycleRun.actionId,
        runId: lifecycleRun.runId,
        lifecycleId: lifecycleRun.lifecycleId,
        detail: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      });
      return false;
    } finally {
      if (this.activeRun === lifecycleRun) this.activeRun = null;
    }
  }
}
