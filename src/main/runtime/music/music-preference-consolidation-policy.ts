import type {
  MusicPreferenceAssessment,
  MusicPreferenceConsolidationDecision,
  MusicPreferenceStoredTruth,
} from "../../../shared/music-preference-types";

export interface MusicPreferenceConsolidationInput {
  readonly assessment: MusicPreferenceAssessment;
  readonly existing?: MusicPreferenceStoredTruth;
}

function decision(
  action: MusicPreferenceConsolidationDecision["action"],
  persist: boolean,
  reason: string,
): MusicPreferenceConsolidationDecision {
  return Object.freeze({ action, persist, reason });
}

/**
 * Pure, deterministic policy for converting an assessment into one canonical
 * long-term Memory operation. It owns no persistence and performs no I/O.
 */
export class MusicPreferenceConsolidationPolicy {
  evaluate(input: MusicPreferenceConsolidationInput): MusicPreferenceConsolidationDecision {
    const { assessment, existing } = input;

    if (assessment.epistemicLevel === "EXPLICIT" &&
      assessment.status === "EXPLICIT_PREFERENCE" &&
      assessment.polarity !== "NEUTRAL") {
      if (!existing) {
        return decision(
          "PERSIST_EXPLICIT_PREFERENCE",
          true,
          "Explicit user preference qualifies immediately.",
        );
      }
      if (existing.epistemicLevel === "EXPLICIT" &&
        existing.polarity === assessment.polarity) {
        return decision(
          "UPDATE_EXISTING_MEMORY",
          true,
          "The current explicit preference was reinforced.",
        );
      }
      return decision(
        "SUPERSEDE_EXISTING_MEMORY",
        true,
        "The latest explicit statement supersedes the stored truth.",
      );
    }

    if (existing?.epistemicLevel === "EXPLICIT") {
      return decision(
        "DO_NOT_PERSIST",
        false,
        "Behavioral evidence cannot weaken or replace explicit preference.",
      );
    }

    const inferredQualifies = assessment.epistemicLevel === "INFERRED" &&
      assessment.status === "INFERRED_PREFERENCE" &&
      assessment.polarity !== "NEUTRAL" &&
      assessment.inferredEvidenceCount >= 3 &&
      assessment.confidence >= 0.65;

    if (inferredQualifies) {
      if (!existing) {
        return decision(
          "PERSIST_INFERRED_PREFERENCE",
          true,
          "Repeated independent inferred evidence crossed the conservative threshold.",
        );
      }
      if (existing.epistemicLevel === "INFERRED" &&
        existing.polarity === assessment.polarity) {
        return decision(
          "UPDATE_EXISTING_MEMORY",
          true,
          "The stored inferred preference was reinforced.",
        );
      }
      return decision(
        "SUPERSEDE_EXISTING_MEMORY",
        true,
        "Stronger current evidence supersedes the non-explicit stored truth.",
      );
    }

    const listeningPatternQualifies = assessment.epistemicLevel === "OBSERVED" &&
      assessment.status === "LISTENING_PATTERN" &&
      assessment.observationCount >= 3 &&
      assessment.confidence >= 0.35;

    if (listeningPatternQualifies) {
      if (!existing) {
        return decision(
          "PERSIST_OBSERVATION_SUMMARY",
          true,
          "Repeated passive observations qualify only as a listening pattern.",
        );
      }
      if (existing.epistemicLevel === "OBSERVED") {
        return decision(
          "UPDATE_EXISTING_MEMORY",
          true,
          "The stored listening pattern was reinforced.",
        );
      }
      return decision(
        "DO_NOT_PERSIST",
        false,
        "A listening pattern cannot downgrade a stored inferred preference.",
      );
    }

    if (existing) {
      return decision(
        "SUPERSEDE_EXISTING_MEMORY",
        false,
        "The decayed non-explicit assessment no longer meets persistence thresholds.",
      );
    }

    return decision(
      "DO_NOT_PERSIST",
      false,
      "Evidence remains below the long-term Memory threshold.",
    );
  }
}
