import { createHash } from "node:crypto";
import type { MemoryItem } from "../../../shared/memory-types";
import type {
  MusicPreferenceAssessment,
  MusicPreferenceConsolidationDecision,
  MusicPreferenceIngestResult,
  MusicPreferencePolarity,
  MusicPreferenceSignal,
  MusicPreferenceSignalKind,
  MusicPreferenceStoredTruth,
  MusicPreferenceSubject,
} from "../../../shared/music-preference-types";
import {
  MUSIC_PREFERENCE_MEMORY_DOMAIN,
} from "../../character/memory/memory-service";
import {
  MusicPreferenceConsolidationPolicy,
} from "./music-preference-consolidation-policy";
import { normalizeMusicPreferenceSubject } from "./music-preference-subject";

const MUSIC_PREFERENCE_SCHEMA_VERSION = 1;
const MUSIC_PREFERENCE_MEMORY_SOURCE = "music-preference-v1";
const DAY_MS = 24 * 60 * 60 * 1_000;
const LISTENING_PATTERN_HALF_LIFE_DAYS = 14;
const INFERRED_PREFERENCE_HALF_LIFE_DAYS = 30;
const RECENT_DIGEST_LIMIT = 32;

interface MusicPreferenceMemoryOwner {
  remember(
    key: string,
    value: string,
    source?: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): boolean;
  forget(key: string): boolean;
  get(key: string): MemoryItem | undefined;
  list(): readonly MemoryItem[];
}

interface ExplicitEvidenceSummary {
  readonly polarity: "POSITIVE" | "NEGATIVE";
  readonly occurredAt: number;
  readonly signalId: string;
  readonly source: string;
}

interface MusicPreferenceAggregate {
  subject: MusicPreferenceSubject;
  observationCount: number;
  positiveEvidenceCount: number;
  negativeEvidenceCount: number;
  explicitPositiveEvidenceCount: number;
  explicitNegativeEvidenceCount: number;
  inferredPositiveWeight: number;
  inferredNegativeWeight: number;
  inferredEvidenceCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  lastReinforcedAt: number;
  evidenceProvenance: Set<string>;
  signalKinds: Set<MusicPreferenceSignalKind>;
  latestExplicit?: ExplicitEvidenceSummary;
  recentSignalDigests: string[];
  recentFingerprintDigests: string[];
}

export interface MusicPreferenceServiceOptions {
  readonly memory: MusicPreferenceMemoryOwner;
  readonly policy?: MusicPreferenceConsolidationPolicy;
  readonly now?: () => number;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundConfidence(value: number): number {
  return Math.round(clamp(value) * 1_000_000) / 1_000_000;
}

function decayMultiplier(lastReinforcedAt: number, atTime: number, halfLifeDays: number): number {
  const elapsedDays = Math.floor(Math.max(0, atTime - lastReinforcedAt) / DAY_MS);
  return Math.pow(0.5, elapsedDays / halfLifeDays);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function signalFingerprint(signal: MusicPreferenceSignal): string {
  return JSON.stringify([
    signal.kind,
    signal.epistemicLevel,
    signal.polarity,
    signal.subject.key,
    signal.source,
    signal.occurredAt,
    signal.evidence.origin,
    signal.evidence.referenceId ?? "",
    signal.evidence.contextEventType ?? "",
    signal.evidence.playerId ?? "",
  ]);
}

function addBoundedDigest(target: string[], value: string): void {
  target.push(value);
  if (target.length > RECENT_DIGEST_LIMIT) {
    target.splice(0, target.length - RECENT_DIGEST_LIMIT);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFiniteNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readNonNegativeInteger(record: Record<string, unknown>, key: string): number | undefined {
  const value = readFiniteNumber(record, key);
  return value !== undefined && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function isSignalKind(value: string): value is MusicPreferenceSignalKind {
  return value === "TRACK_EXPOSURE" ||
    value === "ARTIST_EXPOSURE" ||
    value === "TRACK_REPEAT" ||
    value === "ARTIST_REPEAT" ||
    value === "INFERRED_AFFINITY" ||
    value === "EXPLICIT_LIKE" ||
    value === "EXPLICIT_DISLIKE";
}

function readSubject(value: unknown): MusicPreferenceSubject | undefined {
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.key !== "string") {
    return undefined;
  }
  if (value.type === "ARTIST" && typeof value.artist === "string") {
    return normalizeMusicPreferenceSubject({
      type: "ARTIST",
      key: value.key,
      artist: value.artist,
    });
  }
  if (value.type === "TRACK" &&
    typeof value.title === "string" &&
    typeof value.artist === "string") {
    return normalizeMusicPreferenceSubject({
      type: "TRACK",
      key: value.key,
      title: value.title,
      artist: value.artist,
      ...(typeof value.album === "string" ? { album: value.album } : {}),
    });
  }
  return undefined;
}

function validateSignal(signal: MusicPreferenceSignal): MusicPreferenceSubject | undefined {
  if (!signal || typeof signal.id !== "string" || !signal.id.trim() ||
    !Number.isFinite(signal.occurredAt) || signal.occurredAt < 0 ||
    typeof signal.source !== "string" || !signal.source.trim() ||
    !signal.evidence || typeof signal.evidence.origin !== "string") {
    return undefined;
  }

  const subject = normalizeMusicPreferenceSubject(signal.subject);
  if (!subject || subject.key !== signal.subject.key) return undefined;

  const observed = signal.kind === "TRACK_EXPOSURE" ||
    signal.kind === "ARTIST_EXPOSURE" ||
    signal.kind === "TRACK_REPEAT" ||
    signal.kind === "ARTIST_REPEAT";
  if (observed) {
    const subjectMatchesKind =
      ((signal.kind === "TRACK_EXPOSURE" || signal.kind === "TRACK_REPEAT") &&
        subject.type === "TRACK") ||
      ((signal.kind === "ARTIST_EXPOSURE" || signal.kind === "ARTIST_REPEAT") &&
        subject.type === "ARTIST");
    return signal.epistemicLevel === "OBSERVED" && signal.polarity === "NEUTRAL" &&
      signal.evidence.origin === "MUSIC_CONTEXT_EVENT" && subjectMatchesKind
      ? subject
      : undefined;
  }
  if (signal.kind === "INFERRED_AFFINITY") {
    return signal.epistemicLevel === "INFERRED" && signal.polarity !== "NEUTRAL" &&
      signal.evidence.origin === "MAIN_FIREFLY_INFERENCE" &&
      (signal.confidence === undefined || Number.isFinite(signal.confidence))
      ? subject
      : undefined;
  }
  if (signal.kind === "EXPLICIT_LIKE") {
    return signal.epistemicLevel === "EXPLICIT" && signal.polarity === "POSITIVE" &&
      signal.evidence.origin === "USER_EXPLICIT"
      ? subject
      : undefined;
  }
  if (signal.kind === "EXPLICIT_DISLIKE") {
    return signal.epistemicLevel === "EXPLICIT" && signal.polarity === "NEGATIVE" &&
      signal.evidence.origin === "USER_EXPLICIT"
      ? subject
      : undefined;
  }
  return undefined;
}

function createAggregate(subject: MusicPreferenceSubject, occurredAt: number): MusicPreferenceAggregate {
  return {
    subject,
    observationCount: 0,
    positiveEvidenceCount: 0,
    negativeEvidenceCount: 0,
    explicitPositiveEvidenceCount: 0,
    explicitNegativeEvidenceCount: 0,
    inferredPositiveWeight: 0,
    inferredNegativeWeight: 0,
    inferredEvidenceCount: 0,
    firstSeenAt: occurredAt,
    lastSeenAt: occurredAt,
    lastReinforcedAt: occurredAt,
    evidenceProvenance: new Set(),
    signalKinds: new Set(),
    recentSignalDigests: [],
    recentFingerprintDigests: [],
  };
}

function isLaterExplicit(
  incoming: ExplicitEvidenceSummary,
  current: ExplicitEvidenceSummary | undefined,
): boolean {
  if (!current) return true;
  return incoming.occurredAt > current.occurredAt ||
    (incoming.occurredAt === current.occurredAt && incoming.signalId > current.signalId);
}

function describeSubject(subject: MusicPreferenceSubject): string {
  return subject.type === "ARTIST"
    ? `歌手“${subject.artist}”`
    : `歌曲《${subject.title}》（${subject.artist}）`;
}

function renderMemoryValue(assessment: MusicPreferenceAssessment): string {
  const subject = describeSubject(assessment.subject);
  if (assessment.epistemicLevel === "EXPLICIT") {
    return assessment.polarity === "POSITIVE"
      ? `用户明确表示喜欢${subject}。`
      : `用户明确表示不喜欢${subject}。`;
  }
  if (assessment.epistemicLevel === "INFERRED") {
    return assessment.polarity === "POSITIVE"
      ? `用户近期的多次音乐行为显示，可能较偏好${subject}。`
      : `用户近期的多次音乐行为显示，可能不太偏好${subject}。`;
  }
  return `用户近期多次收听${subject}。`;
}

export function buildMusicPreferenceMemoryKey(subjectKey: string): string {
  return `music.preference:${subjectKey}`;
}

/**
 * Main-process owner of music preference evidence. Pending evidence is kept in
 * memory; only consolidated summaries are written through FireflyMemoryService.
 */
export class MusicPreferenceService {
  private readonly memory: MusicPreferenceMemoryOwner;
  private readonly policy: MusicPreferenceConsolidationPolicy;
  private readonly now: () => number;
  private readonly aggregates = new Map<string, MusicPreferenceAggregate>();
  private readonly processedSignalDigests = new Set<string>();
  private readonly processedFingerprintDigests = new Set<string>();

  constructor(options: MusicPreferenceServiceOptions) {
    this.memory = options.memory;
    this.policy = options.policy ?? new MusicPreferenceConsolidationPolicy();
    this.now = options.now ?? Date.now;
    this.hydrateConsolidatedState();
  }

  ingest(signal: MusicPreferenceSignal): MusicPreferenceIngestResult {
    const subject = validateSignal(signal);
    if (!subject) {
      return Object.freeze({ accepted: false, reason: "INVALID_SIGNAL" });
    }

    const signalIdDigest = digest(signal.id.trim());
    const fingerprintDigest = digest(signalFingerprint({ ...signal, subject }));
    if (this.processedSignalDigests.has(signalIdDigest) ||
      this.processedFingerprintDigests.has(fingerprintDigest)) {
      return Object.freeze({ accepted: false, reason: "DUPLICATE_SIGNAL" });
    }

    const aggregate = this.aggregates.get(subject.key) ??
      createAggregate(subject, signal.occurredAt);
    aggregate.subject = subject;
    aggregate.firstSeenAt = Math.min(aggregate.firstSeenAt, signal.occurredAt);
    aggregate.lastSeenAt = Math.max(aggregate.lastSeenAt, signal.occurredAt);
    aggregate.lastReinforcedAt = Math.max(aggregate.lastReinforcedAt, signal.occurredAt);
    aggregate.evidenceProvenance.add(`${signal.evidence.origin}:${signal.source}`);
    aggregate.signalKinds.add(signal.kind);

    if (signal.epistemicLevel === "OBSERVED") {
      aggregate.observationCount += 1;
    } else if (signal.epistemicLevel === "INFERRED") {
      const weight = clamp(signal.confidence ?? 0.5);
      aggregate.inferredEvidenceCount += 1;
      if (signal.polarity === "POSITIVE") {
        aggregate.positiveEvidenceCount += 1;
        aggregate.inferredPositiveWeight += weight;
      } else {
        aggregate.negativeEvidenceCount += 1;
        aggregate.inferredNegativeWeight += weight;
      }
    } else {
      const explicitSummary: ExplicitEvidenceSummary = {
        polarity: signal.polarity as "POSITIVE" | "NEGATIVE",
        occurredAt: signal.occurredAt,
        signalId: signal.id,
        source: signal.source,
      };
      if (signal.polarity === "POSITIVE") {
        aggregate.positiveEvidenceCount += 1;
        aggregate.explicitPositiveEvidenceCount += 1;
      } else {
        aggregate.negativeEvidenceCount += 1;
        aggregate.explicitNegativeEvidenceCount += 1;
      }
      if (isLaterExplicit(explicitSummary, aggregate.latestExplicit)) {
        aggregate.latestExplicit = explicitSummary;
      }
    }

    addBoundedDigest(aggregate.recentSignalDigests, signalIdDigest);
    addBoundedDigest(aggregate.recentFingerprintDigests, fingerprintDigest);
    this.processedSignalDigests.add(signalIdDigest);
    this.processedFingerprintDigests.add(fingerprintDigest);
    this.aggregates.set(subject.key, aggregate);

    const assessment = this.assessAggregate(aggregate, this.now());
    const memoryKey = buildMusicPreferenceMemoryKey(subject.key);
    const existing = this.readStoredTruth(this.memory.get(memoryKey));
    const consolidation = this.policy.evaluate({ assessment, ...(existing ? { existing } : {}) });
    this.applyConsolidation(memoryKey, aggregate, assessment, consolidation);

    return Object.freeze({
      accepted: true,
      reason: "ACCEPTED",
      assessment,
      consolidation,
    });
  }

  getAssessment(subjectKey: string, atTime: number = this.now()): MusicPreferenceAssessment | undefined {
    const aggregate = this.aggregates.get(subjectKey);
    return aggregate ? this.assessAggregate(aggregate, atTime) : undefined;
  }

  listAssessments(atTime: number = this.now()): readonly MusicPreferenceAssessment[] {
    return Array.from(this.aggregates.values(), (aggregate) =>
      this.assessAggregate(aggregate, atTime));
  }

  reconcile(subjectKey: string, atTime: number = this.now()): MusicPreferenceAssessment | undefined {
    const aggregate = this.aggregates.get(subjectKey);
    if (!aggregate) return undefined;
    const assessment = this.assessAggregate(aggregate, atTime);
    const memoryKey = buildMusicPreferenceMemoryKey(subjectKey);
    const existing = this.readStoredTruth(this.memory.get(memoryKey));
    const consolidation = this.policy.evaluate({ assessment, ...(existing ? { existing } : {}) });
    this.applyConsolidation(memoryKey, aggregate, assessment, consolidation);
    return assessment;
  }

  private assessAggregate(
    aggregate: MusicPreferenceAggregate,
    atTime: number,
  ): MusicPreferenceAssessment {
    let epistemicLevel: MusicPreferenceAssessment["epistemicLevel"] = "OBSERVED";
    let polarity: MusicPreferencePolarity = "NEUTRAL";
    let status: MusicPreferenceAssessment["status"] = "UNRESOLVED";
    let confidence = 0;

    if (aggregate.latestExplicit) {
      epistemicLevel = "EXPLICIT";
      polarity = aggregate.latestExplicit.polarity;
      status = "EXPLICIT_PREFERENCE";
      confidence = 1;
    } else if (aggregate.inferredEvidenceCount > 0 &&
      (aggregate.inferredEvidenceCount >= 3 || aggregate.observationCount < 3)) {
      const balance = aggregate.inferredPositiveWeight - aggregate.inferredNegativeWeight;
      epistemicLevel = "INFERRED";
      polarity = balance > 0 ? "POSITIVE" : balance < 0 ? "NEGATIVE" : "NEUTRAL";
      status = polarity === "NEUTRAL" ? "UNRESOLVED" : "INFERRED_PREFERENCE";
      const baseConfidence = Math.min(0.85, Math.abs(balance) / 3);
      confidence = baseConfidence * decayMultiplier(
        aggregate.lastReinforcedAt,
        atTime,
        INFERRED_PREFERENCE_HALF_LIFE_DAYS,
      );
    } else if (aggregate.observationCount >= 3) {
      status = "LISTENING_PATTERN";
      const baseConfidence = Math.min(0.75, 0.05 + aggregate.observationCount * 0.1);
      confidence = baseConfidence * decayMultiplier(
        aggregate.lastReinforcedAt,
        atTime,
        LISTENING_PATTERN_HALF_LIFE_DAYS,
      );
    } else {
      confidence = Math.min(0.25, 0.05 + aggregate.observationCount * 0.1);
    }

    return Object.freeze({
      subject: aggregate.subject,
      epistemicLevel,
      polarity,
      status,
      confidence: roundConfidence(confidence),
      evidenceCount: aggregate.observationCount + aggregate.inferredEvidenceCount +
        aggregate.explicitPositiveEvidenceCount + aggregate.explicitNegativeEvidenceCount,
      observationCount: aggregate.observationCount,
      inferredEvidenceCount: aggregate.inferredEvidenceCount,
      positiveEvidenceCount: aggregate.positiveEvidenceCount,
      negativeEvidenceCount: aggregate.negativeEvidenceCount,
      explicitPositiveEvidenceCount: aggregate.explicitPositiveEvidenceCount,
      explicitNegativeEvidenceCount: aggregate.explicitNegativeEvidenceCount,
      firstSeenAt: aggregate.firstSeenAt,
      lastSeenAt: aggregate.lastSeenAt,
      lastReinforcedAt: aggregate.lastReinforcedAt,
      evidenceProvenance: Object.freeze(Array.from(aggregate.evidenceProvenance).sort()),
    });
  }

  private applyConsolidation(
    memoryKey: string,
    aggregate: MusicPreferenceAggregate,
    assessment: MusicPreferenceAssessment,
    consolidation: MusicPreferenceConsolidationDecision,
  ): void {
    if (!consolidation.persist) {
      if (consolidation.action === "SUPERSEDE_EXISTING_MEMORY") {
        this.memory.forget(memoryKey);
      }
      return;
    }

    this.memory.remember(
      memoryKey,
      renderMemoryValue(assessment),
      MUSIC_PREFERENCE_MEMORY_SOURCE,
      this.buildMetadata(aggregate, assessment),
    );
  }

  private buildMetadata(
    aggregate: MusicPreferenceAggregate,
    assessment: MusicPreferenceAssessment,
  ): Readonly<Record<string, unknown>> {
    return Object.freeze({
      domain: MUSIC_PREFERENCE_MEMORY_DOMAIN,
      schemaVersion: MUSIC_PREFERENCE_SCHEMA_VERSION,
      subject: assessment.subject,
      epistemicLevel: assessment.epistemicLevel,
      polarity: assessment.polarity,
      status: assessment.status,
      confidence: assessment.confidence,
      evidenceCount: assessment.evidenceCount,
      observationCount: assessment.observationCount,
      inferredEvidenceCount: assessment.inferredEvidenceCount,
      positiveEvidenceCount: assessment.positiveEvidenceCount,
      negativeEvidenceCount: assessment.negativeEvidenceCount,
      explicitPositiveEvidenceCount: assessment.explicitPositiveEvidenceCount,
      explicitNegativeEvidenceCount: assessment.explicitNegativeEvidenceCount,
      inferredPositiveWeight: aggregate.inferredPositiveWeight,
      inferredNegativeWeight: aggregate.inferredNegativeWeight,
      firstSeenAt: assessment.firstSeenAt,
      lastSeenAt: assessment.lastSeenAt,
      lastReinforcedAt: assessment.lastReinforcedAt,
      evidenceProvenance: assessment.evidenceProvenance,
      signalKinds: Object.freeze(Array.from(aggregate.signalKinds).sort()),
      ...(aggregate.latestExplicit ? { latestExplicit: aggregate.latestExplicit } : {}),
      recentSignalDigests: Object.freeze([...aggregate.recentSignalDigests]),
      recentFingerprintDigests: Object.freeze([...aggregate.recentFingerprintDigests]),
    });
  }

  private readStoredTruth(item: MemoryItem | undefined): MusicPreferenceStoredTruth | undefined {
    const metadata = item?.metadata;
    if (metadata?.domain !== MUSIC_PREFERENCE_MEMORY_DOMAIN) return undefined;
    const epistemicLevel = metadata.epistemicLevel;
    const polarity = metadata.polarity;
    if ((epistemicLevel === "OBSERVED" || epistemicLevel === "INFERRED" || epistemicLevel === "EXPLICIT") &&
      (polarity === "POSITIVE" || polarity === "NEGATIVE" || polarity === "NEUTRAL")) {
      return { epistemicLevel, polarity };
    }
    return undefined;
  }

  private hydrateConsolidatedState(): void {
    for (const item of this.memory.list()) {
      const metadata = item.metadata;
      if (metadata?.domain !== MUSIC_PREFERENCE_MEMORY_DOMAIN ||
        metadata.schemaVersion !== MUSIC_PREFERENCE_SCHEMA_VERSION) {
        continue;
      }
      const subject = readSubject(metadata.subject);
      if (!subject || item.key !== buildMusicPreferenceMemoryKey(subject.key)) continue;

      const firstSeenAt = readFiniteNumber(metadata, "firstSeenAt");
      const lastSeenAt = readFiniteNumber(metadata, "lastSeenAt");
      const lastReinforcedAt = readFiniteNumber(metadata, "lastReinforcedAt");
      if (firstSeenAt === undefined || lastSeenAt === undefined || lastReinforcedAt === undefined) {
        continue;
      }

      const aggregate = createAggregate(subject, firstSeenAt);
      aggregate.observationCount = readNonNegativeInteger(metadata, "observationCount") ?? 0;
      aggregate.positiveEvidenceCount = readNonNegativeInteger(metadata, "positiveEvidenceCount") ?? 0;
      aggregate.negativeEvidenceCount = readNonNegativeInteger(metadata, "negativeEvidenceCount") ?? 0;
      aggregate.explicitPositiveEvidenceCount =
        readNonNegativeInteger(metadata, "explicitPositiveEvidenceCount") ?? 0;
      aggregate.explicitNegativeEvidenceCount =
        readNonNegativeInteger(metadata, "explicitNegativeEvidenceCount") ?? 0;
      aggregate.inferredPositiveWeight = readFiniteNumber(metadata, "inferredPositiveWeight") ?? 0;
      aggregate.inferredNegativeWeight = readFiniteNumber(metadata, "inferredNegativeWeight") ?? 0;
      aggregate.inferredEvidenceCount = readNonNegativeInteger(metadata, "inferredEvidenceCount") ?? 0;
      aggregate.firstSeenAt = firstSeenAt;
      aggregate.lastSeenAt = lastSeenAt;
      aggregate.lastReinforcedAt = lastReinforcedAt;
      aggregate.evidenceProvenance = new Set(readStringArray(metadata, "evidenceProvenance"));
      aggregate.signalKinds = new Set(
        readStringArray(metadata, "signalKinds").filter(isSignalKind),
      );
      aggregate.recentSignalDigests = readStringArray(metadata, "recentSignalDigests")
        .slice(-RECENT_DIGEST_LIMIT);
      aggregate.recentFingerprintDigests = readStringArray(metadata, "recentFingerprintDigests")
        .slice(-RECENT_DIGEST_LIMIT);

      const latestExplicit = metadata.latestExplicit;
      if (isRecord(latestExplicit) &&
        (latestExplicit.polarity === "POSITIVE" || latestExplicit.polarity === "NEGATIVE") &&
        typeof latestExplicit.signalId === "string" &&
        typeof latestExplicit.source === "string" &&
        typeof latestExplicit.occurredAt === "number" &&
        Number.isFinite(latestExplicit.occurredAt)) {
        aggregate.latestExplicit = {
          polarity: latestExplicit.polarity,
          signalId: latestExplicit.signalId,
          source: latestExplicit.source,
          occurredAt: latestExplicit.occurredAt,
        };
      }

      for (const entry of aggregate.recentSignalDigests) {
        this.processedSignalDigests.add(entry);
      }
      for (const entry of aggregate.recentFingerprintDigests) {
        this.processedFingerprintDigests.add(entry);
      }
      this.aggregates.set(subject.key, aggregate);
    }
  }
}
