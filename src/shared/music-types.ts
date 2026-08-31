export interface MusicTrack {
  id: string;
  name: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  coverUrl?: string;
  playUrl?: string;
  extra?: Record<string, unknown>;
}

export interface MusicPlaylist {
  id: string;
  name: string;
  coverUrl?: string;
  trackCount?: number;
  description?: string;
}

export interface MusicPlaylistDetail extends MusicPlaylist {
  tracks: MusicTrack[];
}

export interface PlaybackResource {
  kind: "song" | "playlist";
  playUrl: string;
  track?: MusicTrack;
  tracks?: MusicTrack[];
}

export interface PlaybackState {
  connected: boolean;
  loaded: boolean;
  paused: boolean;
  position: number;
  duration: number;
  volume: number;
  eofReached: boolean;
  track?: MusicTrack;
}

export type MusicBackendState = "stopped" | "ready" | "incompatible" | "degraded" | "error";
export type MusicPlayerState = "unknown" | "available" | "unavailable";
export type MusicAccountState = "unconfigured" | "logged_in" | "anonymous" | "error";
export type MusicLoopMode = "list" | "single" | "shuffle";

export interface MusicStatusSnapshot {
  backendState: MusicBackendState;
  playerState: MusicPlayerState;
  accountState: MusicAccountState;
  playbackState: PlaybackState;
  currentTrack?: MusicTrack;
  queueLength: number;
  loopMode: MusicLoopMode;
}
