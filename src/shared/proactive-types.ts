export type ProactiveTriggerReason =
  | "sick"
  | "tired"
  | "hungry"
  | "attention"
  | "ignored"
  | "special_dialogue"
  | "idle_presence"
  | "manual";

export type ProactiveEventKind =
  | "proactive_triggered"
  | "proactive_skipped"
  | "proactive_deferred"
  | "proactive_completed"
  | "proactive_failed";

export interface ProactiveEvent {
  kind: ProactiveEventKind;
  reason?: ProactiveTriggerReason;
  actionId?: string;
  detail?: string;
  timestamp: number;
}

export interface ProactiveConfig {
  enabled: boolean;
  checkIntervalMs: number;
  actionCooldownMs: number;
  specialDialogueCooldownMs: number;
  specialDialogueChance: number;
}

export const DEFAULT_PROACTIVE_CONFIG: ProactiveConfig = {
  enabled: true,
  checkIntervalMs: 45_000, // 45 seconds (matches pet_window.py)
  actionCooldownMs: 180_000, // 3 minutes per specific condition
  specialDialogueCooldownMs: 300_000, // 5 minutes
  specialDialogueChance: 0.12, // 12% (matches pet_window.py)
};
