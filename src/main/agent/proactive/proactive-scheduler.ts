import type {
  ProactiveConfig,
  ProactiveEvent,
  ProactiveTriggerReason,
} from "../../../shared/proactive-types";
import { DEFAULT_PROACTIVE_CONFIG } from "../../../shared/proactive-types";
import type { CharacterStateManager } from "../../state/state-manager";
import type { IAgentCore } from "../../../shared/agent-core";
import type { FireflyMemoryService } from "../../memory/memory-service";

export interface ProactiveSchedulerDeps {
  stateManager: CharacterStateManager;
  agentCore: IAgentCore;
  memoryService?: FireflyMemoryService;
  isPetVisible?: () => boolean;
  isUserChatActive?: () => boolean;
  isSpeakingActive?: () => boolean;
  broadcastProactive?: (payload: { text: string; actionId: string; reason: ProactiveTriggerReason }) => void;
  speakProactive?: (text: string) => void;
}

export class FireflyProactiveScheduler {
  private readonly config: ProactiveConfig;
  private readonly deps: ProactiveSchedulerDeps;
  private timer: NodeJS.Timeout | null = null;
  private isEvaluating = false;
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
    for (const l of this.eventListeners) {
      l(event);
    }
  }

  start(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.checkAndTrigger();
    }, this.config.checkIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getCooldowns(): ReadonlyMap<string, number> {
    return this.cooldowns;
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
    if (this.isEvaluating) return false;
    if (!this.config.enabled && !forceReason) return false;

    // 1. Visibility Check
    if (this.deps.isPetVisible && !this.deps.isPetVisible() && !forceReason) {
      this.emit({ kind: "proactive_skipped", detail: "Pet window hidden", timestamp: Date.now() });
      return false;
    }

    // 2. Chat In-flight conflict check
    if (this.deps.isUserChatActive && this.deps.isUserChatActive()) {
      this.emit({ kind: "proactive_deferred", detail: "User chat in-flight", timestamp: Date.now() });
      return false;
    }

    // 3. TTS Speech In-flight conflict check
    if (this.deps.isSpeakingActive && this.deps.isSpeakingActive()) {
      this.emit({ kind: "proactive_deferred", detail: "TTS speaking active", timestamp: Date.now() });
      return false;
    }

    const state = this.deps.stateManager.getState();
    let triggerReason: ProactiveTriggerReason | null = forceReason || null;
    let targetActionId = "idle";

    if (!triggerReason) {
      // Check condition rules from CharacterState
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
        // Ignored check (idleMinutes >= 8 & attention < 60)
        const lastInteract = state.last_interaction ? new Date(state.last_interaction).getTime() : 0;
        const silentMins = (Date.now() - lastInteract) / (60 * 1000);
        if (silentMins >= 8 && state.attention < 60) {
          triggerReason = "ignored";
          targetActionId = "ignored";
        }
      }

      // Check special dialogue (affection >= 90 & 12% probability)
      if (!triggerReason && state.affection >= 90 && Math.random() < this.config.specialDialogueChance) {
        triggerReason = "special_dialogue";
        targetActionId = "touched";
      }
    }

    if (!triggerReason) {
      return false;
    }

    // Check cooldown
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

    // Execute Proactive Behavior through IAgentCore (FireflyAgentCore)!
    this.isEvaluating = true;
    this.setCooldown(cooldownKey);
    this.emit({ kind: "proactive_triggered", reason: triggerReason, actionId: targetActionId, timestamp: Date.now() });

    try {
      const promptInstruction = this.buildProactiveInstruction(triggerReason, targetActionId);

      const harnessResult = await this.deps.agentCore.run({
        userPrompt: promptInstruction,
        characterState: state,
      });

      // A failed agent run must never be spoken or broadcast as a persona
      // line — report the real failure and skip this proactive round.
      if (harnessResult.status !== "completed") {
        this.emit({
          kind: "proactive_failed",
          reason: triggerReason,
          detail: harnessResult.error || `agent status=${harnessResult.status}`,
          timestamp: Date.now(),
        });
        return false;
      }

      this.emit({
        kind: "proactive_completed",
        reason: triggerReason,
        actionId: targetActionId,
        detail: harnessResult.finalText,
        timestamp: Date.now(),
      });

      // Broadcast proactive line to Pet Window & UI
      if (this.deps.broadcastProactive && harnessResult.finalText) {
        this.deps.broadcastProactive({
          text: harnessResult.finalText,
          actionId: targetActionId,
          reason: triggerReason,
        });
      }

      // Trigger TTS Speech if available
      if (this.deps.speakProactive && harnessResult.finalText) {
        this.deps.speakProactive(harnessResult.finalText);
      }

      return true;
    } catch (err: any) {
      this.emit({
        kind: "proactive_failed",
        reason: triggerReason,
        detail: err?.message || String(err),
        timestamp: Date.now(),
      });
      return false;
    } finally {
      this.isEvaluating = false;
    }
  }

  private buildProactiveInstruction(reason: ProactiveTriggerReason, actionId: string): string {
    switch (reason) {
      case "hungry":
        return "【桌宠主动自发行为】流萤现在感到有些饥饿，想吃橡木蛋糕卷。请温柔地向开拓者小声倾诉并调用 play_live2d_action 表现动作。";
      case "tired":
        return "【桌宠主动自发行为】流萤现在精力较低、感到有些疲惫。请向开拓者轻声倾诉并调用 play_live2d_action 表现动作。";
      case "sick":
        return "【桌宠主动自发行为】流萤现在身体感到轻微不适。请以坚强又温柔的语气向开拓者表达并调用 play_live2d_action 表现动作。";
      case "attention":
        return "【桌宠主动自发行为】流萤在呼唤开拓者。请轻柔地问候开拓者并调用 play_live2d_action 表现动作。";
      case "ignored":
        return "【桌宠主动自发行为】开拓者已经有一阵子没有和流萤互动了。请流萤略带害羞或关切地问问开拓者在忙什么并调用 play_live2d_action 表现动作。";
      case "special_dialogue":
        return "【桌宠主动自发行为】因为好感度很高，流萤想向开拓者倾诉一段关于星空与相遇的专属温馨话语。请真诚倾诉并调用 play_live2d_action 表现动作。";
      default:
        return `【桌宠主动自发行为】流萤主动与开拓者互动。请调用 play_live2d_action 展现「${actionId}」动作并温柔问候。`;
    }
  }
}
