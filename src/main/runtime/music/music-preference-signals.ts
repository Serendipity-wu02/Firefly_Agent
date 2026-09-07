import { createHash } from "node:crypto";
import type { MusicContextEvent } from "../../../shared/music-context-types";
import type { MusicPreferenceSignal } from "../../../shared/music-preference-types";
import type { AgentEventBus } from "../../orchestrator/agent-events";
import type { MusicPreferenceService } from "./music-preference-service";
import {
  createMusicArtistSubject,
  createMusicTrackSubject,
} from "./music-preference-subject";

export interface MusicPreferenceSignalAdapterOptions {
  readonly eventBus: AgentEventBus;
  readonly preferenceService: Pick<MusicPreferenceService, "ingest">;
}

function eventReference(event: MusicContextEvent): string {
  const track = event.current.track;
  return JSON.stringify([
    event.type,
    event.source,
    event.playerId,
    event.observedAt,
    track?.title ?? "",
    track?.artist ?? "",
    track?.album ?? "",
  ]);
}

function signalId(reference: string, subjectKey: string): string {
  return `music-context:${createHash("sha256")
    .update(`${reference}\n${subjectKey}`)
    .digest("hex")}`;
}

function ingestTrackObservation(
  event: Extract<MusicContextEvent, {
    type: "music.context.available" | "music.track.changed";
  }>,
  preferenceService: Pick<MusicPreferenceService, "ingest">,
): void {
  const track = event.current.track;
  if (!track) return;

  const trackSubject = createMusicTrackSubject(track);
  const artistSubject = createMusicArtistSubject(track.artist);
  const reference = eventReference(event);
  const evidence = Object.freeze({
    origin: "MUSIC_CONTEXT_EVENT" as const,
    contextEventType: event.type,
    playerId: event.playerId,
    referenceId: createHash("sha256").update(reference).digest("hex"),
  });

  const signals: MusicPreferenceSignal[] = [];
  if (trackSubject) {
    signals.push({
      id: signalId(reference, trackSubject.key),
      kind: "TRACK_EXPOSURE",
      epistemicLevel: "OBSERVED",
      polarity: "NEUTRAL",
      subject: trackSubject,
      source: event.source,
      occurredAt: event.observedAt,
      evidence,
    });
  }
  if (artistSubject) {
    signals.push({
      id: signalId(reference, artistSubject.key),
      kind: "ARTIST_EXPOSURE",
      epistemicLevel: "OBSERVED",
      polarity: "NEUTRAL",
      subject: artistSubject,
      source: event.source,
      occurredAt: event.observedAt,
      evidence,
    });
  }

  for (const signal of signals) {
    preferenceService.ingest(signal);
  }
}

/**
 * Adapts only passive track-bearing context events. Playback transitions and
 * control commands intentionally produce no preference evidence.
 */
export function registerMusicPreferenceSignalAdapter(
  options: MusicPreferenceSignalAdapterOptions,
): () => void {
  const offAvailable = options.eventBus.on("music.context.available", (event) => {
    ingestTrackObservation(event, options.preferenceService);
  });
  const offTrackChanged = options.eventBus.on("music.track.changed", (event) => {
    ingestTrackObservation(event, options.preferenceService);
  });

  return () => {
    offTrackChanged();
    offAvailable();
  };
}
