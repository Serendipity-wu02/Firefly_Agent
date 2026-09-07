import type {
  ProactiveConfig,
  ProactiveLinePayload,
  ProactiveEvent,
  ProactiveTriggerReason,
} from "../../../shared/proactive-types";
import { DEFAULT_PROACTIVE_CONFIG } from "../../../shared/proactive-types";
import type { CharacterStateManager } from "../../state/state-manager";
import type { IAgentCore } from "../../../shared/agent-core";

export interface ProactiveSchedulerDeps {
  stateManager: CharacterStateManager;
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

export class FireflyProactiveScheduler {
  private readonly config: ProactiveConfig;
  private readonly deps: ProactiveSchedulerDeps;
  private timer: NodeJS.Timeout | null = null;
  private started = false;
  private lifecycleId = 0;
  private runSequence = 0;
  private activeRun: ActiveProactiveRun | null = null;
  private readonly cooldowns = new Map<string, number>();
  private readonly eventListeners: Array<(event: ProactiveEvent) => void> = [];

  constructor(deps: ProactiveSchedulerDeps, config: Partial<ProactiveConfig> = {}) {
    this.deps = deps;
    this.config = { ...DEFAULT_PROACTIVE_CONFIG, ...config };
  }

  onEvent(listener: (event: ProactiveEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      const idx = this.eventListeners.indexOf(listener);
      if (idx >= 0) this.eventListeners.splice(idx, 1);
    };
  }

  private emit(event: ProactiveEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  start(): void {
    if (this.timer) clearInterval(this.timer);

    if (this.activeRun) {
      this.invalidateActive("scheduler_restarted");
    } else {
      this.lifecycleId += 1;
    }

    this.started = true;
    this.timer = setInterval(() => {
      void this.checkAndTrigger();
    }, this.config.checkIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.started = false;
    this.invalidateActive("scheduler_stopped");
  }

  getCooldowns(): ReadonlyMap<string, number> {
    return this.cooldowns;
  }

  getLifecycleId(): number {
    return this.lifecycleId;
  }

  /** Called by the existing Chat IPC lifecycle before a user run starts. */
  invalidateForChatStart(): void {
    this.invalidateActive("chat_started");
  }

  /** Called by the owning Pet window event when the Pet becomes hidden. */
  invalidateForPetHidden(): void {
    this.invalidateActive("pet_hidden");
  }

  /** Called by the main TTS speaking transition before renderer playback. */
  invalidateForSpeakingStart(): void {
    this.invalidateActive("speaking_started");
  }

  private invalidateActive(detail: string): void {
    this.lifecycleId += 1;
    const activeRun = this.activeRun;
    this.activeRun = null;

    if (!activeRun) return;

    activeRun.controller.abort();
    // This is deliberately scoped to the proactive run. The global
    // cancelAll() path remains reserved for application shutdown.
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

  private isUnderCooldown(key: string, cooldownMs: number): boolean {
    const last = this.cooldowns.get(key);
    if (!last) return false;
    return Date.now() - last < cooldownMs;
  }

  private setCooldown(key: string): void {
    this.cooldowns.set(key, Date.now());
  }

  async checkAndTrigger(forceReason?: ProactiveTriggerReason): Promise<boolean> {
    if (this.activeRun) return false;
    if (!this.started && !forceReason) return false;
    if (!this.config.enabled && !forceReason) return false;

    // These are the existing pre-generation gates. A force reason preserves
    // the former bypass for disabled/hidden/cooldown checks, while Chat and
    // active speech remain hard conflicts.
    if (this.deps.isPetVisible && !this.deps.isPetVisible() && !forceReason) {
      this.emit({ kind: "proactive_skipped", detail: "Pet window hidden", timestamp: Date.now() });
      return false;
    }

    if (this.deps.isUserChatActive && this.deps.isUserChatActive()) {
      this.emit({ kind: "proactive_deferred", detail: "User chat in-flight", timestamp: Date.now() });
      return false;
    }

    if (this.deps.isSpeakingActive && this.deps.isSpeakingActive()) {
      this.emit({ kind: "proactive_deferred", detail: "TTS speaking active", timestamp: Date.now() });
      return false;
    }

    const state = this.deps.stateManager.getState();
    let triggerReason: ProactiveTriggerReason | null = forceReason || null;
    let targetActionId = "idle";

    if (!triggerReason) {
      // Existing CharacterState trigger rules and thresholds remain unchanged.
      if (state.health === "sick") {
        triggerReason = "sick";
        targetActionId = "sick";
      } else if (state.energy <= 20) {
        triggerReason = "tired";
        targetActionId = "tired";
      } else if (state.hunger >= 85) {
        triggerReason = "hungry";
        targetActionId = "hungry";
      } else if (state.attention <= 20) {
        triggerReason = "attention";
        targetActionId = "attention";
      } else {
        const lastInteract = state.last_interaction ? new Date(state.last_interaction).getTime() : 0;
        const silentMins = (Date.now() - lastInteract) / (60 * 1000);
        if (silentMins >= 8 && state.attention < 60) {
          triggerReason = "ignored";
          targetActionId = "ignored";
        }
      }

      if (!triggerReason && state.affection >= 90 && Math.random() < this.config.specialDialogueChance) {
        triggerReason = "special_dialogue";
        targetActionId = "touched";
      }
    }

    if (!triggerReason) return false;

    const cooldownKey = `proactive:${triggerReason}`;
    const cooldownDuration =
      triggerReason === "special_dialogue"
        ? this.config.specialDialogueCooldownMs
        : this.config.actionCooldownMs;

    if (this.isUnderCooldown(cooldownKey, cooldownDuration) && !forceReason) {
      this.emit({
        kind: "proactive_skipped",
        reason: triggerReason,
        detail: `Under cooldown (${cooldownKey})`,
        timestamp: Date.now(),
      });
      return false;
    }

    const lifecycleRun: ActiveProactiveRun = {
      runId: `proactive-${Date.now()}-${++this.runSequence}`,
      lifecycleId: this.lifecycleId,
      reason: triggerReason,
      actionId: targetActionId,
      controller: new AbortController(),
    };
    this.activeRun = lifecycleRun;
    this.setCooldown(cooldownKey);
    this.emit({
      kind: "proactive_triggered",
      reason: triggerReason,
      actionId: targetActionId,
      runId: lifecycleRun.runId,
      lifecycleId: lifecycleRun.lifecycleId,
      timestamp: Date.now(),
    });
    if (!this.isCurrentRun(lifecycleRun)) return false;

    try {
      const promptInstruction = this.buildProactiveInstruction(triggerReason);
      const harnessResult = await this.deps.agentCore.run({
        runId: lifecycleRun.runId,
        source: "proactive",
        userPrompt: promptInstruction,
        characterState: state,
        signal: lifecycleRun.controller.signal,
        executionProfile: { kind: "MAIN", toolSurface: "none" },
      });

      if (!this.isCurrentRun(lifecycleRun)) return false;

      if (harnessResult.status !== "completed") {
        this.activeRun = null;
        this.emit({
          kind: harnessResult.status === "cancelled" ? "proactive_cancelled" : "proactive_failed",
          reason: triggerReason,
          actionId: targetActionId,
          runId: lifecycleRun.runId,
          lifecycleId: lifecycleRun.lifecycleId,
          detail: harnessResult.error || `agent status=${harnessResult.status}`,
          timestamp: Date.now(),
        });
        return false;
      }

      this.emit({
        kind: "proactive_completed",
        reason: triggerReason,
        actionId: targetActionId,
        runId: lifecycleRun.runId,
        lifecycleId: lifecycleRun.lifecycleId,
        detail: harnessResult.finalText,
        timestamp: Date.now(),
      });
      if (!this.isCurrentRun(lifecycleRun)) return false;

      const deliveryBlockReason =
        harnessResult.finalText.trim().length === 0
          ? "Agent returned empty proactive text"
          : this.getDeliveryBlockReason();
      if (deliveryBlockReason) {
        this.activeRun = null;
        this.emit({
          kind: "proactive_skipped",
          reason: triggerReason,
          actionId: targetActionId,
          runId: lifecycleRun.runId,
          lifecycleId: lifecycleRun.lifecycleId,
          detail: deliveryBlockReason,
          timestamp: Date.now(),
        });
        return false;
      }
      if (!this.isCurrentRun(lifecycleRun)) return false;

      // Clear ownership before submitting the broadcast. The renderer's own
      // TTS start event must not cancel the proactive run that caused it.
      this.activeRun = null;
      if (this.deps.broadcastProactive) {
        try {
          this.deps.broadcastProactive({
            text: harnessResult.finalText,
            actionId: targetActionId,
            reason: triggerReason,
          });
        } catch (err: unknown) {
          this.emit({
            kind: "proactive_failed",
            reason: triggerReason,
            actionId: targetActionId,
            runId: lifecycleRun.runId,
            lifecycleId: lifecycleRun.lifecycleId,
            detail: err instanceof Error ? err.message : String(err),
            timestamp: Date.now(),
          });
          return false;
        }
        this.emit({
          kind: "proactive_broadcast_submitted",
          reason: triggerReason,
          actionId: targetActionId,
          runId: lifecycleRun.runId,
          lifecycleId: lifecycleRun.lifecycleId,
          detail: "WindowManager broadcast submitted; receiver presentation is not acknowledged.",
          timestamp: Date.now(),
        });
      }

      return true;
    } catch (err: unknown) {
      // Invalidation emits the factual cancellation event. Do not emit a
      // second failure after an abort or allow a stale result to broadcast.
      if (!this.isCurrentRun(lifecycleRun)) return false;

      this.activeRun = null;
      const detail = err instanceof Error ? err.message : String(err);
      this.emit({
        kind: "proactive_failed",
        reason: triggerReason,
        actionId: targetActionId,
        runId: lifecycleRun.runId,
        lifecycleId: lifecycleRun.lifecycleId,
        detail,
        timestamp: Date.now(),
      });
      return false;
    } finally {
      if (this.activeRun === lifecycleRun) this.activeRun = null;
    }
  }

  private buildProactiveInstruction(reason: ProactiveTriggerReason): string {
    const outputBoundary =
      "请只返回流萤直接说出的简短口语内容；当前主动运行没有工具执行面，不调用工具，不输出动作调用指令。";
    switch (reason) {
      case "hungry":
        return `【桌宠内部主动触发】流萤现在感到有些饥饿，想吃橡木蛋糕卷。请温柔地向开拓者小声倾诉。${outputBoundary}`;
      case "tired":
        return `【桌宠内部主动触发】流萤现在精力较低、感到有些疲惫。请向开拓者轻声倾诉。${outputBoundary}`;
      case "sick":
        return `【桌宠内部主动触发】流萤现在身体感到轻微不适。请以坚强又温柔的语气向开拓者表达。${outputBoundary}`;
      case "attention":
        return `【桌宠内部主动触发】流萤在呼唤开拓者。请轻柔地问候开拓者。${outputBoundary}`;
      case "ignored":
        return `【桌宠内部主动触发】开拓者已经有一阵子没有和流萤互动了。请流萤略带害羞或关切地问问开拓者在忙什么。${outputBoundary}`;
      case "special_dialogue":
        return `【桌宠内部主动触发】因为好感度很高，流萤想向开拓者倾诉一段关于星空与相遇的专属温馨话语。请真诚倾诉。${outputBoundary}`;
      default:
        return `【桌宠内部主动触发】流萤主动与开拓者互动。请温柔问候。${outputBoundary}`;
    }
  }
}
