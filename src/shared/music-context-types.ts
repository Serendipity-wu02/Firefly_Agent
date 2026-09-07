/**
 * Serializable, presentation-neutral contracts for passive music observation.
 * These facts are ephemeral runtime context; they are not preference or memory.
 */

export const QQMUSIC_DESKTOP_SOURCE = "QQMUSIC_DESKTOP" as const;

/**
 * The V1 source is QQMUSIC_DESKTOP. The open string portion lets later source
 * adapters use the same snapshot and event semantics without changing them.
 */
export type MusicContextSource = typeof QQMUSIC_DESKTOP_SOURCE | (string & {});

export type MusicPlaybackState = "PLAYING" | "PAUSED" | "STOPPED" | "UNKNOWN";

export interface MusicTrackObservation {
  readonly title: string;
  readonly artist: string;
  readonly album?: string;
}

export interface MusicContextObservation {
  readonly source: MusicContextSource;
  readonly playerId: string;
  readonly sessionId?: string;
  readonly playbackState: MusicPlaybackState;
  readonly track?: MusicTrackObservation;
}

export interface MusicContextSnapshot extends MusicContextObservation {
  /** Runtime time at which this observation was read, expressed as epoch milliseconds. */
  readonly observedAt: number;
}

export interface MusicContextSnapshotReader {
  getSnapshot(): MusicContextSnapshot | undefined;
}

interface MusicContextEventBase {
  readonly source: MusicContextSource;
  readonly playerId: string;
  readonly observedAt: number;
  /** Kept consistent with the existing AgentEventBus timestamp convention. */
  readonly timestamp: number;
  readonly current: MusicContextSnapshot;
}

export type MusicContextEvent =
  | (MusicContextEventBase & {
      readonly type: "music.context.available";
      readonly previous?: MusicContextSnapshot;
    })
  | (MusicContextEventBase & {
      readonly type: "music.track.changed";
      readonly previous: MusicContextSnapshot;
    })
  | (MusicContextEventBase & {
      readonly type: "music.playback.changed";
      readonly previous: MusicContextSnapshot;
    })
  | (MusicContextEventBase & {
      readonly type: "music.context.unavailable";
      readonly previous: MusicContextSnapshot;
    });
