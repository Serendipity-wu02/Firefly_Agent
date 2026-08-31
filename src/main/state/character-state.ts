import {
  HealthStatus,
  type CharacterStateData,
  DEFAULT_CHARACTER_STATE,
} from "../../shared/firefly-state";

function weightedChoice<T extends string>(weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
  if (total <= 0) return entries[0][0];

  let randomVal = Math.random() * total;
  for (const [key, weight] of entries) {
    if (weight <= 0) continue;
    if (randomVal < weight) return key;
    randomVal -= weight;
  }
  return entries[0][0];
}

export class CharacterState {
  energy: number;
  hunger: number;
  mood: string;
  affection: number;
  attention: number;
  current_action: string;
  health: HealthStatus;
  last_state_update: Date | null;
  last_interaction: Date | null;

  constructor(data: Partial<CharacterStateData> = {}) {
    this.energy = data.energy ?? DEFAULT_CHARACTER_STATE.energy;
    this.hunger = data.hunger ?? DEFAULT_CHARACTER_STATE.hunger;
    this.mood = data.mood ?? DEFAULT_CHARACTER_STATE.mood;
    this.affection = data.affection ?? DEFAULT_CHARACTER_STATE.affection;
    this.attention = data.attention ?? DEFAULT_CHARACTER_STATE.attention;
    this.current_action = data.current_action ?? DEFAULT_CHARACTER_STATE.current_action;
    this.health = (data.health as HealthStatus) ?? DEFAULT_CHARACTER_STATE.health;
    this.last_state_update = data.last_state_update ? new Date(data.last_state_update) : null;
    this.last_interaction = data.last_interaction ? new Date(data.last_interaction) : null;
  }

  toJSON(): CharacterStateData {
    return {
      energy: this.energy,
      hunger: this.hunger,
      mood: this.mood,
      affection: this.affection,
      attention: this.attention,
      current_action: this.current_action,
      health: this.health,
      last_state_update: this.last_state_update ? this.last_state_update.toISOString() : null,
      last_interaction: this.last_interaction ? this.last_interaction.toISOString() : null,
    };
  }

  tick(): void {
    this.applyElapsed(15);
  }

  applyElapsed(minutes: number): void {
    const elapsedMinutes = Math.max(0, Math.floor(minutes));
    const decaySteps = Math.floor(elapsedMinutes / 15);
    if (decaySteps > 0) {
      this.energy = Math.max(0, this.energy - decaySteps);
      this.hunger = Math.min(100, this.hunger + decaySteps);
      this.attention = Math.max(0, this.attention - decaySteps * 2);
      this._refreshHealth();
    }
    this.last_state_update = new Date();
  }

  applyOfflineTime(now: Date = new Date()): number {
    const previousTime = this.last_state_update || now;
    const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - previousTime.getTime()) / (60 * 1000)));
    this.applyElapsed(elapsedMinutes);
    this.last_state_update = now;
    return elapsedMinutes;
  }

  feed(): string {
    this.hunger = Math.max(0, this.hunger - 28);
    this.energy = Math.min(100, this.energy + 5);
    this.affection = Math.min(100, this.affection + 2);
    this.attention = Math.min(100, this.attention + 5);
    this.mood = "eating";
    this.last_interaction = new Date();
    this._refreshHealth();
    return "eating";
  }

  rest(): string {
    this.energy = Math.min(100, this.energy + 35);
    this.attention = Math.min(100, this.attention + 8);
    this.mood = "resting";
    this.last_interaction = new Date();
    this._refreshHealth();
    return "resting";
  }

  treatment(): string {
    this.health = HealthStatus.TREATMENT;
    this.energy = Math.min(100, this.energy + 12);
    this.hunger = Math.min(100, this.hunger + 3);
    this.mood = "treatment";
    this.last_interaction = new Date();
    this.health = HealthStatus.RECOVERED;
    return "treatment";
  }

  reactToClick(): string {
    const wasAttentionLow = this.attention < 35;
    const wasEnergyLow = this.energy < 30;
    this.affection = Math.min(100, this.affection + 3);
    this.attention = Math.min(100, this.attention + 15);
    this.last_interaction = new Date();

    if (this.health === HealthStatus.SICK) {
      this.mood = "sick";
      return "sick";
    }
    if (wasEnergyLow) {
      this.mood = "sleepy";
      return "sleepy";
    }
    if (wasAttentionLow) {
      this.mood = "surprised";
      return "surprised";
    }
    if (this.affection >= 75 && Math.random() < 0.35) {
      this.mood = "touched";
      return "touched";
    }
    if (this.health === HealthStatus.TIRED && Math.random() < 0.4) {
      this.mood = "tired";
      return "tired";
    }
    this.mood = "happy";
    return "happy";
  }

  reactToPet(): string {
    const wasStranger = this.affection < 60;
    this.affection = Math.min(100, this.affection + 2);
    this.attention = Math.min(100, this.attention + 18);
    this.last_interaction = new Date();

    if (this.health === HealthStatus.SICK) {
      this.mood = "sick";
      return "sick";
    }
    if (wasStranger) {
      this.mood = "surprised";
      return "surprised";
    }
    if (Math.random() < 0.5) {
      this.mood = "shy";
      return "shy";
    }
    this.mood = "touched";
    return "touched";
  }

  reactToMessage(actionId: string): string {
    this.affection = Math.min(100, this.affection + 1);
    this.attention = Math.min(100, this.attention + 25);
    this.mood = actionId;
    this.last_interaction = new Date();
    return actionId;
  }

  reactToDragFinished(): string {
    this.energy = Math.max(0, this.energy - 4);
    this.mood = "dragged";
    this.last_interaction = new Date();
    return "dragged";
  }

  chooseIdleAction(): string {
    const weightedActions: Record<string, number> = {
      idle: 42,
      thinking: 16,
      happy: 12,
      sleepy: 8,
      surprised: 6,
    };
    if (this.energy < 30) {
      weightedActions.sleepy += 28;
    }
    if (this.attention < 35) {
      weightedActions.surprised += 20;
    }
    if (this.affection > 70) {
      weightedActions.happy += 12;
    }
    if (this.hunger > 75) {
      weightedActions.hungry = (weightedActions.hungry ?? 0) + 18;
    } else if (this.hunger > 55) {
      weightedActions.hungry = (weightedActions.hungry ?? 0) + 8;
    }
    if (this.health === HealthStatus.SICK) {
      weightedActions.sick = (weightedActions.sick ?? 0) + 26;
    } else if (this.health === HealthStatus.TIRED) {
      weightedActions.tired = (weightedActions.tired ?? 0) + 16;
    }
    if (this.mood === "sad" || this.health === HealthStatus.RECOVERED) {
      weightedActions.thinking += 8;
    }
    if (this.affection >= 85 && Math.random() < 0.25) {
      weightedActions.waving = (weightedActions.waving ?? 0) + 10;
    }

    return weightedChoice(weightedActions);
  }

  unlockedFeatures(): string[] {
    const unlocked = ["basic_care"];
    if (this.affection >= 90) unlocked.push("special_dialogue");
    return unlocked;
  }

  proactiveAction(): string | null {
    if (this.health === HealthStatus.SICK) return "sick";
    if (this.energy <= 20) return "tired";
    if (this.hunger >= 85) return "hungry";
    if (this.attention <= 20) return "attention";
    if (this.isIgnored()) return "ignored";
    return null;
  }

  isIgnored(now: Date = new Date(), idleMinutes: number = 8): boolean {
    if (!this.last_interaction) return false;
    const silentMinutes = (now.getTime() - this.last_interaction.getTime()) / (60 * 1000);
    return silentMinutes >= idleMinutes && this.attention < 60;
  }

  _refreshHealth(): void {
    if (this.health === HealthStatus.TREATMENT) return;
    if (this.energy <= 15 || this.hunger >= 92) {
      this.health = HealthStatus.SICK;
    } else if (this.energy <= 35 || this.hunger >= 75) {
      this.health = HealthStatus.TIRED;
    } else if (
      this.health === HealthStatus.TIRED ||
      this.health === HealthStatus.SICK ||
      this.health === HealthStatus.RECOVERED
    ) {
      this.health = HealthStatus.RECOVERED;
    } else {
      this.health = HealthStatus.HEALTHY;
    }
  }
}
