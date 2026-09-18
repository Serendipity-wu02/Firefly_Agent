/**
 * A structured reason supplied by a future, product-approved proactive source.
 * This type deliberately carries no automatic trigger vocabulary.
 */
export type ProactiveTriggerReason = string;

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

/**
 * Lifecycle-only execution request. Creating this value does not create a
 * production trigger; a product-approved source must be wired explicitly.
 */
export interface ProactiveExecutionRequest {
  runId?: string;
  reason: ProactiveTriggerReason;
  actionId: string;
  instruction: string;
}
