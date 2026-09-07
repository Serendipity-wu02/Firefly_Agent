import type { MusicContextSource } from "./music-context-types";

export type MusicPreferenceEpistemicLevel = "OBSERVED" | "INFERRED" | "EXPLICIT";
export type MusicPreferencePolarity = "POSITIVE" | "NEGATIVE" | "NEUTRAL";
export type MusicPreferenceSubjectType = "TRACK" | "ARTIST";

export type MusicPreferenceSignalKind =
  | "TRACK_EXPOSURE"
  | "ARTIST_EXPOSURE"
  | "TRACK_REPEAT"
  | "ARTIST_REPEAT"
  | "INFERRED_AFFINITY"
  | "EXPLICIT_LIKE"
  | "EXPLICIT_DISLIKE";

export interface MusicTrackPreferenceSubject {
  readonly type: "TRACK";
  readonly key: string;
  readonly title: string;
  readonly artist: string;
  readonly album?: string;
}

export interface MusicArtistPreferenceSubject {
  readonly type: "ARTIST";
  readonly key: string;
  readonly artist: string;
}

export type MusicPreferenceSubject =
  | MusicTrackPreferenceSubject
  | MusicArtistPreferenceSubject;

export interface MusicPreferenceEvidence {
  readonly origin: "MUSIC_CONTEXT_EVENT" | "USER_EXPLICIT" | "MAIN_FIREFLY_INFERENCE";
  readonly referenceId?: string;
  readonly contextEventType?:
    | "music.context.available"
    | "music.track.changed";
  readonly playerId?: string;
}

export interface MusicPreferenceSignal {
  readonly id: string;
  readonly kind: MusicPreferenceSignalKind;
  readonly epistemicLevel: MusicPreferenceEpistemicLevel;
  readonly polarity: MusicPreferencePolarity;
  readonly subject: MusicPreferenceSubject;
  readonly source: MusicContextSource | "MAIN_FIREFLY_CHAT" | "MAIN_FIREFLY_INFERENCE";
  readonly occurredAt: number;
  readonly confidence?: number;
  readonly evidence: MusicPreferenceEvidence;
}

export type MusicPreferenceStatus =
  | "UNRESOLVED"
  | "LISTENING_PATTERN"
  | "INFERRED_PREFERENCE"
  | "EXPLICIT_PREFERENCE";

export interface MusicPreferenceAssessment {
  readonly subject: MusicPreferenceSubject;
  readonly epistemicLevel: MusicPreferenceEpistemicLevel;
  readonly polarity: MusicPreferencePolarity;
  readonly status: MusicPreferenceStatus;
  readonly confidence: number;
  readonly evidenceCount: number;
  readonly observationCount: number;
  readonly inferredEvidenceCount: number;
  readonly positiveEvidenceCount: number;
  readonly negativeEvidenceCount: number;
  readonly explicitPositiveEvidenceCount: number;
  readonly explicitNegativeEvidenceCount: number;
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
  readonly lastReinforcedAt: number;
  readonly evidenceProvenance: readonly string[];
}

export type MusicPreferenceConsolidationAction =
  | "DO_NOT_PERSIST"
  | "PERSIST_OBSERVATION_SUMMARY"
  | "PERSIST_INFERRED_PREFERENCE"
  | "PERSIST_EXPLICIT_PREFERENCE"
  | "UPDATE_EXISTING_MEMORY"
  | "SUPERSEDE_EXISTING_MEMORY";

export interface MusicPreferenceStoredTruth {
  readonly epistemicLevel: MusicPreferenceEpistemicLevel;
  readonly polarity: MusicPreferencePolarity;
}

export interface MusicPreferenceConsolidationDecision {
  readonly action: MusicPreferenceConsolidationAction;
  readonly persist: boolean;
  readonly reason: string;
}

export interface MusicPreferenceIngestResult {
  readonly accepted: boolean;
  readonly reason: "ACCEPTED" | "DUPLICATE_SIGNAL" | "INVALID_SIGNAL";
  readonly assessment?: MusicPreferenceAssessment;
  readonly consolidation?: MusicPreferenceConsolidationDecision;
}
