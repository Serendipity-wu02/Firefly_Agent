export type ProactiveTriggerReason =
  | "sick"
  | "tired"
  | "hungry"
  | "attention"
  | "ignored"
  | "special_dialogue"
  | "idle_presence"
  | "manual";

export interface ProactiveLinePayload {
  text: string;
  actionId: string;
  reason: ProactiveTriggerReason;
}

export type ProactiveEventKind =
  | "proactive_triggered"
  | "proactive_skipped"
  | "proactive_deferred"
  /** Agent generation completed; this is not receiver acknowledgement. */
  | "proactive_completed"
  | "proactive_cancelled"
  /** WindowManager accepted the broadcast submission; presentation is not acknowledged. */
  | "proactive_broadcast_submitted"
  | "proactive_failed";

export interface ProactiveEvent {
  kind: ProactiveEventKind;
  reason?: ProactiveTriggerReason;
  actionId?: string;
  runId?: string;
  lifecycleId?: number;
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
