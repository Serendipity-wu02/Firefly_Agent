import type {
  MusicTrack,
  MusicPlaylist,
  MusicPlaylistDetail,
  PlaybackResource,
} from "../../shared/music-types";

/**
 * IMusicProvider
 *
 * Platform-agnostic contract for music source providers.
 * Implementations (e.g. QQMusicProvider, MockMusicProvider) handle platform-specific
 * API communication, authentication, and URL resolving.
 */
export interface IMusicProvider {
  readonly id: string;
  readonly name: string;

  /** Check whether the provider has the required configuration/credentials. */
  isConfigured(): boolean;

  /** Initialize provider session/client if needed. */
  initialize?(): Promise<void>;

  /** Search tracks by keyword. */
  searchTracks(query: string, limit?: number): Promise<MusicTrack[]>;

  /** Get recommended or daily tracks. */
  getRecommendations(limit?: number): Promise<MusicTrack[]>;

  /** Get user or public playlists. */
  getPlaylists?(limit?: number): Promise<MusicPlaylist[]>;

  /** Get detailed playlist with tracks. */
  getPlaylistDetail?(playlistId: string): Promise<MusicPlaylistDetail>;

  /** Get single track metadata by ID. */
  getTrack?(trackId: string): Promise<MusicTrack | null>;

  /** Resolve an audio playback resource with direct stream URL. */
  resolvePlaybackResource(track: MusicTrack): Promise<PlaybackResource | null>;

  /** Cleanup resources on shutdown. */
  dispose?(): Promise<void>;
}
