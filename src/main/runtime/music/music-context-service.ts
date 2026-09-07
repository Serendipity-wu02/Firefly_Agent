import type {
  MusicContextEvent,
  MusicContextObservation,
  MusicContextSnapshot,
  MusicContextSnapshotReader,
  MusicPlaybackState,
  MusicTrackObservation,
} from "../../../shared/music-context-types";
import { QQMUSIC_DESKTOP_SOURCE } from "../../../shared/music-context-types";
import { AgentEventBus } from "../../orchestrator/agent-events";
import {
  QQ_MUSIC_SESSION_ID,
  QQMusicDesktopBridge,
  isCanonicalQqMusicSessionId,
  type DesktopBridgeSnapshot,
} from "./qqmusic-desktop-bridge";

export interface MusicContextServiceOptions {
  readonly desktopBridge: QQMusicDesktopBridge;
  readonly eventBus: AgentEventBus;
  readonly now?: () => number;
}

function normalizeMetadata(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function normalizeTrack(track: DesktopBridgeSnapshot["track"]): MusicTrackObservation | undefined {
  if (!track) return undefined;
  const title = normalizeMetadata(track.name);
  const artist = normalizeMetadata(track.artists.join(", "));
  if (!title || !artist) return undefined;

  const album = normalizeMetadata(track.album);
  return Object.freeze({
    title,
    artist,
    ...(album ? { album } : {}),
  });
}

function normalizePlaybackState(snapshot: DesktopBridgeSnapshot): MusicPlaybackState {
  if (!snapshot.available) return "UNKNOWN";
  if (snapshot.playbackState.paused) return "PAUSED";
  if (snapshot.playbackState.loaded) return "PLAYING";
  return "STOPPED";
}

function trackEquals(
  left: MusicTrackObservation | undefined,
  right: MusicTrackObservation | undefined,
): boolean {
  return left?.title === right?.title &&
    left?.artist === right?.artist &&
    left?.album === right?.album;
}

function semanticEquals(left: MusicContextSnapshot, right: MusicContextSnapshot): boolean {
  return left.source === right.source &&
    left.playerId === right.playerId &&
    left.sessionId === right.sessionId &&
    left.playbackState === right.playbackState &&
    trackEquals(left.track, right.track);
}

function isAvailable(snapshot: MusicContextSnapshot): boolean {
  return snapshot.playbackState !== "UNKNOWN";
}

function freezeSnapshot(
  observation: MusicContextObservation,
  observedAt: number,
): MusicContextSnapshot {
  const title = normalizeMetadata(observation.track?.title);
  const artist = normalizeMetadata(observation.track?.artist);
  const album = normalizeMetadata(observation.track?.album);
  const track = title && artist
    ? Object.freeze({ title, artist, ...(album ? { album } : {}) })
    : undefined;

  return Object.freeze({
    source: observation.source,
    playerId: observation.playerId,
    ...(observation.sessionId ? { sessionId: observation.sessionId } : {}),
    playbackState: observation.playbackState,
    ...(track ? { track } : {}),
    observedAt,
  });
}

/**
 * Canonical owner of the latest passive desktop music observation.
 *
 * It subscribes to the existing QQMusicDesktopBridge state stream and owns no
 * timer, command execution, authorization, persistence, or presentation work.
 */
export class MusicContextService implements MusicContextSnapshotReader {
  private readonly desktopBridge: QQMusicDesktopBridge;
  private readonly eventBus: AgentEventBus;
  private readonly now: () => number;
  private unsubscribeBridgeState: (() => void) | null = null;
  private latestSnapshot: MusicContextSnapshot | undefined;
  private started = false;
  private disposed = false;

  constructor(options: MusicContextServiceOptions) {
    this.desktopBridge = options.desktopBridge;
    this.eventBus = options.eventBus;
    this.now = options.now ?? Date.now;
  }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.unsubscribeBridgeState = this.desktopBridge.onStateChange((snapshot) => {
      this.ingestDesktopBridgeSnapshot(snapshot);
    });
    this.ingestDesktopBridgeSnapshot(this.desktopBridge.getSnapshot());
  }

  /**
   * Accept one normalized QQ Music observation. This V1 source rejects every
   * non-QQ Music identity before it can update context or publish an event.
   */
  ingestObservation(observation: MusicContextObservation): void {
    if (this.disposed ||
      observation.source !== QQMUSIC_DESKTOP_SOURCE ||
      !isCanonicalQqMusicSessionId(observation.playerId)) {
      return;
    }

    const current = freezeSnapshot(
      {
        ...observation,
        playerId: QQ_MUSIC_SESSION_ID,
      },
      this.now(),
    );
    const previous = this.latestSnapshot;
    this.latestSnapshot = current;

    if (previous && semanticEquals(previous, current)) return;
    this.publishSemanticChanges(previous, current);
  }

  getSnapshot(): MusicContextSnapshot | undefined {
    return this.latestSnapshot;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeBridgeState?.();
    this.unsubscribeBridgeState = null;
    this.latestSnapshot = undefined;
  }

  private ingestDesktopBridgeSnapshot(snapshot: DesktopBridgeSnapshot): void {
    const track = normalizeTrack(snapshot.track);
    this.ingestObservation({
      source: QQMUSIC_DESKTOP_SOURCE,
      playerId: QQ_MUSIC_SESSION_ID,
      playbackState: normalizePlaybackState(snapshot),
      ...(track ? { track } : {}),
    });
  }

  private publishSemanticChanges(
    previous: MusicContextSnapshot | undefined,
    current: MusicContextSnapshot,
  ): void {
    const previousAvailable = previous !== undefined && isAvailable(previous);
    const currentAvailable = isAvailable(current);

    if (!previousAvailable && currentAvailable) {
      this.publish({
        type: "music.context.available",
        ...(previous ? { previous } : {}),
        current,
      });
      return;
    }

    if (previousAvailable && !currentAvailable) {
      this.publish({
        type: "music.context.unavailable",
        previous,
        current,
      });
      return;
    }

    if (!previous || !previousAvailable || !currentAvailable) return;

    if (!trackEquals(previous.track, current.track)) {
      this.publish({
        type: "music.track.changed",
        previous,
        current,
      });
    }

    if (previous.playbackState !== current.playbackState) {
      this.publish({
        type: "music.playback.changed",
        previous,
        current,
      });
    }
  }

  private publish(
    event: Omit<MusicContextEvent, "source" | "playerId" | "observedAt" | "timestamp">,
  ): void {
    const current = event.current;
    this.eventBus.emit({
      ...event,
      source: current.source,
      playerId: current.playerId,
      observedAt: current.observedAt,
      timestamp: current.observedAt,
    } as MusicContextEvent);
  }
}
