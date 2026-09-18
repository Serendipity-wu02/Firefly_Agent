import type { IMusicProvider } from "./provider-interface";
import type {
  MusicTrack,
  MusicPlaylist,
  MusicPlaylistDetail,
  PlaybackResource,
} from "../../shared/music-types";

export class MockMusicProvider implements IMusicProvider {
  readonly id = "mock";
  readonly name = "Mock 音乐测试源";

  private readonly tracks: MusicTrack[] = [
    {
      id: "mock-track-1",
      name: "如果能成为萤火虫 (If I Could Be A Firefly)",
      artists: ["流萤", "知更鸟"],
      album: "格拉默的余烬",
      durationMs: 215000,
      coverUrl: "assets://firefly/cover1.png",
      playUrl: "http://127.0.0.1:9000/mock-firefly-song-1.mp3",
    },
    {
      id: "mock-track-2",
      name: "星空下的橡木蛋糕卷",
      artists: ["流萤"],
      album: "星海巡游",
      durationMs: 184000,
      coverUrl: "assets://firefly/cover2.png",
      playUrl: "http://127.0.0.1:9000/mock-firefly-song-2.mp3",
    },
    {
      id: "mock-track-3",
      name: "使一颗心免于哀伤",
      artists: ["知更鸟"],
      album: "匹诺康尼之声",
      durationMs: 240000,
      coverUrl: "assets://firefly/cover3.png",
      playUrl: "http://127.0.0.1:9000/mock-robin-song.mp3",
    },
  ];

  isConfigured(): boolean {
    return true;
  }

  async searchTracks(query: string, limit = 10): Promise<MusicTrack[]> {
    const q = query.trim().toLowerCase();
    if (!q) return this.tracks.slice(0, limit);
    return this.tracks
      .filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.artists.some((a) => a.toLowerCase().includes(q)) ||
          t.album?.toLowerCase().includes(q),
      )
      .slice(0, limit);
  }

  async getRecommendations(limit = 10): Promise<MusicTrack[]> {
    return this.tracks.slice(0, limit);
  }

  async getPlaylists(limit = 10): Promise<MusicPlaylist[]> {
    return [
      {
        id: "mock-playlist-1",
        name: "流萤精选歌单",
        coverUrl: "assets://firefly/cover1.png",
        trackCount: this.tracks.length,
        description: "流萤最喜欢的歌曲列表",
      },
    ].slice(0, limit);
  }

  async getPlaylistDetail(playlistId: string): Promise<MusicPlaylistDetail> {
    return {
      id: playlistId,
      name: "流萤精选歌单",
      coverUrl: "assets://firefly/cover1.png",
      trackCount: this.tracks.length,
      description: "流萤最喜欢的歌曲列表",
      tracks: [...this.tracks],
    };
  }

  async getTrack(trackId: string): Promise<MusicTrack | null> {
    return this.tracks.find((t) => t.id === trackId) || null;
  }

  async resolvePlaybackResource(track: MusicTrack): Promise<PlaybackResource | null> {
    const found = this.tracks.find((t) => t.id === track.id) || track;
    return {
      kind: "song",
      playUrl: found.playUrl || `http://127.0.0.1:9000/${found.id}.mp3`,
      track: found,
    };
  }
}
