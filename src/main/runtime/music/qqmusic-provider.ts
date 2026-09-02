import type { IMusicProvider } from "./provider-interface";
import type {
  MusicTrack,
  MusicPlaylist,
  MusicPlaylistDetail,
  PlaybackResource,
} from "../../../shared/music-types";

export interface QQMusicConfig {
  apiKey?: string;
  cookie?: string;
  baseUrl?: string;
}

/**
 * QQMusicProvider
 *
 * Architectural boundary for QQ Music integration.
 * Currently waiting for real QQ Music API / SDK / local service endpoint specifications.
 * Strictly adheres to non-guessing policy: does not fake any endpoints, tokens, cookies, or encryption.
 */
export class QQMusicProvider implements IMusicProvider {
  readonly id = "qqmusic";
  readonly name = "QQ 音乐";

  private config: QQMusicConfig | null = null;

  constructor(config?: QQMusicConfig) {
    if (config) {
      this.config = { ...config };
    }
  }

  configure(config: QQMusicConfig): void {
    this.config = { ...this.config, ...config };
  }

  isConfigured(): boolean {
    return !!(this.config?.baseUrl || this.config?.apiKey || this.config?.cookie);
  }

  async searchTracks(_query: string, _limit = 10): Promise<MusicTrack[]> {
    if (!this.isConfigured()) {
      console.warn("[QQMusicProvider] Search requested but QQ Music provider is unconfigured.");
      return [];
    }
    throw new Error("QQ 音乐接口尚未配置实际端点与协议。");
  }

  async getRecommendations(_limit = 10): Promise<MusicTrack[]> {
    if (!this.isConfigured()) {
      console.warn("[QQMusicProvider] Recommendations requested but QQ Music provider is unconfigured.");
      return [];
    }
    throw new Error("QQ 音乐接口尚未配置实际端点与协议。");
  }

  async getPlaylists?(_limit = 10): Promise<MusicPlaylist[]> {
    return [];
  }

  async getPlaylistDetail?(_playlistId: string): Promise<MusicPlaylistDetail> {
    throw new Error("QQ 音乐歌单接口尚未接入。");
  }

  async getTrack?(_trackId: string): Promise<MusicTrack | null> {
    return null;
  }

  async resolvePlaybackResource(_track: MusicTrack): Promise<PlaybackResource | null> {
    if (!this.isConfigured()) {
      console.warn("[QQMusicProvider] Playback resource requested but QQ Music provider is unconfigured.");
      return null;
    }
    throw new Error("QQ 音乐音频资源解析接口尚未接入。");
  }

  async dispose(): Promise<void> {
    this.config = null;
  }
}
