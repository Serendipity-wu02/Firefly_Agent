export enum HealthStatus {
  HEALTHY = "healthy",
  TIRED = "tired",
  SICK = "sick",
  TREATMENT = "treatment",
  RECOVERED = "recovered",
}

export interface CharacterStateData {
  energy: number; // 0 - 100
  hunger: number; // 0 - 100
  mood: string;
  affection: number; // 0 - 100
  attention: number; // 0 - 100
  current_action: string;
  health: HealthStatus;
  last_state_update: string | null;
  last_interaction: string | null;
}

export type CareActionType =
  | "feed"
  | "rest"
  | "treatment"
  | "touch"
  | "click"
  | "drag";

export const DEFAULT_CHARACTER_STATE: CharacterStateData = {
  energy: 72,
  hunger: 25,
  mood: "calm",
  affection: 50,
  attention: 70,
  current_action: "idle",
  health: HealthStatus.HEALTHY,
  last_state_update: null,
  last_interaction: null,
};
