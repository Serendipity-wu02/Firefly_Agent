import type { IMusicProvider } from "./provider-interface";
import { MpvController } from "./mpv-controller";
import { SelectionSetCache } from "./selection-set-cache";
import { PlaybackSession } from "./playback-session";
import { QQMusicProvider } from "./qqmusic-provider";
import { QQMusicDesktopBridge } from "./qqmusic-desktop-bridge";
import type {
  MusicTrack,
  MusicBackendState,
  MusicPlayerState,
  MusicAccountState,
  MusicStatusSnapshot,
  PlaybackState,
} from "../../shared/music-types";

export interface MusicServiceOptions {
  provider?: IMusicProvider;
  desktopBridge?: QQMusicDesktopBridge;
  mpv?: MpvController;
  selectionCache?: SelectionSetCache;
  playbackSession?: PlaybackSession;
}

export class MusicService {
  private provider: IMusicProvider;
  private readonly desktopBridge: QQMusicDesktopBridge;
  private readonly mpv: MpvController;
  private readonly selectionCache: SelectionSetCache;
  private readonly playbackSession: PlaybackSession;

  private backendState: MusicBackendState = "stopped";
  private playerState: MusicPlayerState = "unknown";
  private accountState: MusicAccountState = "unconfigured";
  private shuttingDown = false;

  private readonly stateListeners = new Set<(snapshot: MusicStatusSnapshot) => void>();

  constructor(options: MusicServiceOptions = {}) {
    this.provider = options.provider || new QQMusicProvider();
    this.desktopBridge = options.desktopBridge || new QQMusicDesktopBridge();
    this.mpv = options.mpv || new MpvController();
    this.selectionCache = options.selectionCache || new SelectionSetCache();
    this.playbackSession = options.playbackSession || new PlaybackSession();

    // Bind desktop bridge events
    this.desktopBridge.onStateChange(() => {
      this.syncServiceState();
      this.emitStatus();
    });

    // Bind mpv events (as secondary / fallback player)
    this.mpv.on("state", () => {
      if (!this.desktopBridge.getSnapshot().available) {
        this.syncServiceState();
        this.emitStatus();
      }
    });

    this.mpv.on("eof", () => {
      void this.handleEof();
    });
  }

  setProvider(provider: IMusicProvider): void {
    this.provider = provider;
    this.updateProviderState();
    this.emitStatus();
  }

  getProvider(): IMusicProvider {
    return this.provider;
  }

  getDesktopBridge(): QQMusicDesktopBridge {
    return this.desktopBridge;
  }

  async start(): Promise<void> {
    if (this.shuttingDown) return;

    this.updateProviderState();

    // 1. Start QQ Music Desktop Bridge polling (primary desktop player)
    this.desktopBridge.startPolling();

    // 2. Start MPV Controller (secondary / local player)
    try {
      await this.mpv.start();
    } catch {
      // Graceful fallback: mpv may not be installed on user machine
    }

    this.syncServiceState();
    this.emitStatus();
  }

  private updateProviderState(): void {
    if (this.provider.isConfigured()) {
      this.accountState = "logged_in";
    } else {
      this.accountState = "unconfigured";
    }
  }

  private syncServiceState(): void {
    const bridgeSnap = this.desktopBridge.getSnapshot();
    if (bridgeSnap.available) {
      this.backendState = "ready";
      this.playerState = "available";
    } else {
      const mpvState = this.mpv.getState();
      if (mpvState.connected) {
        this.backendState = "ready";
        this.playerState = "available";
      } else {
        this.backendState = this.provider.isConfigured() ? "degraded" : "stopped";
        this.playerState = "unavailable";
      }
    }
  }

  async search(query: string, limit = 10): Promise<MusicTrack[]> {
    if (!this.provider.isConfigured()) {
      throw new Error(`音乐源 [${this.provider.name}] 尚未配置在线曲库接口。请通过 QQ 音乐官方客户端播放歌曲。`);
    }

    const tracks = await this.provider.searchTracks(query, limit);
    this.selectionCache.setTracks(tracks);
    return tracks;
  }

  async getRecommendations(limit = 10): Promise<MusicTrack[]> {
    if (!this.provider.isConfigured()) {
      throw new Error(`音乐源 [${this.provider.name}] 尚未配置在线曲库接口。请通过 QQ 音乐官方客户端播放歌曲。`);
    }

    const tracks = await this.provider.getRecommendations(limit);
    this.selectionCache.setTracks(tracks);
    return tracks;
  }

  async playTrack(track: MusicTrack): Promise<boolean> {
    if (!this.provider.isConfigured()) {
      throw new Error(`音乐源 [${this.provider.name}] 尚未配置在线曲库。`);
    }

    const resource = await this.provider.resolvePlaybackResource(track);
    if (!resource || !resource.playUrl) {
      throw new Error(`无法获取歌曲《${track.name}》的播放链接。`);
    }

    // Append / set current in playback session
    this.playbackSession.appendTrack(track);
    this.playbackSession.setCurrentTrackById(track.id);

    // Load into fallback player (MPV)
    this.mpv.setTrack(track);
    await this.mpv.load(resource.playUrl);
    this.emitStatus();
    return true;
  }

  async playSelection(selection: number | string): Promise<boolean> {
    let track: MusicTrack | null = null;

    if (typeof selection === "number") {
      track = this.selectionCache.getByIndex(selection);
    } else {
      const parsedNum = parseInt(selection, 10);
      if (!isNaN(parsedNum) && String(parsedNum) === selection.trim()) {
        track = this.selectionCache.getByIndex(parsedNum);
      } else {
        track = this.selectionCache.getById(selection);
        if (!track && this.provider.getTrack) {
          track = await this.provider.getTrack(selection);
        }
      }
    }

    if (!track) {
      throw new Error(`未找到指定的曲目编号或ID [${selection}]，请先搜索或获取推荐。`);
    }

    return this.playTrack(track);
  }

  async playQueue(tracks: MusicTrack[], startIndex = 0): Promise<boolean> {
    if (tracks.length === 0) return false;
    this.selectionCache.setTracks(tracks);
    const startTrack = this.playbackSession.setQueue(tracks, startIndex);
    if (startTrack) {
      return this.playTrack(startTrack);
    }
    return false;
  }

  private async handleEof(): Promise<void> {
    const next = this.playbackSession.nextTrack();
    if (next) {
      try {
        await this.playTrack(next);
      } catch (err) {
        console.warn("[MusicService] Auto advance EOF failed:", err);
      }
    }
  }

  async pause(): Promise<void> {
    const bridgeSnap = this.desktopBridge.getSnapshot();
    if (bridgeSnap.available) {
      await this.desktopBridge.pause();
    } else {
      await this.mpv.pause();
    }
  }

  async resume(): Promise<void> {
    const bridgeSnap = this.desktopBridge.getSnapshot();
    if (bridgeSnap.available) {
      await this.desktopBridge.play();
    } else {
      await this.mpv.resume();
    }
  }

  async next(): Promise<boolean> {
    const bridgeSnap = this.desktopBridge.getSnapshot();
    if (bridgeSnap.available) {
      return await this.desktopBridge.next();
    }

    const next = this.playbackSession.nextTrack();
    if (next) {
      return this.playTrack(next);
    }
    return false;
  }

  async prev(): Promise<boolean> {
    const bridgeSnap = this.desktopBridge.getSnapshot();
    if (bridgeSnap.available) {
      return await this.desktopBridge.prev();
    }

    const prev = this.playbackSession.prevTrack();
    if (prev) {
      return this.playTrack(prev);
    }
    return false;
  }

  async stop(): Promise<void> {
    const bridgeSnap = this.desktopBridge.getSnapshot();
    if (bridgeSnap.available) {
      await this.desktopBridge.pause();
    } else {
      await this.mpv.stop();
    }
  }

  async setVolume(vol: number): Promise<void> {
    await this.mpv.setVolume(vol);
  }

  getCurrentTrack(): MusicTrack | undefined {
    const bridgeSnap = this.desktopBridge.getSnapshot();
    if (bridgeSnap.available && bridgeSnap.track) {
      return bridgeSnap.track;
    }
    return this.playbackSession.getCurrentTrack() || undefined;
  }

  getSnapshot(): MusicStatusSnapshot {
    const bridgeSnap = this.desktopBridge.getSnapshot();
    if (bridgeSnap.available) {
      return {
        backendState: "ready",
        playerState: "available",
        accountState: "logged_in",
        playbackState: bridgeSnap.playbackState,
        currentTrack: bridgeSnap.track,
        queueLength: bridgeSnap.track ? 1 : 0,
        loopMode: this.playbackSession.getLoopMode(),
      };
    }

    return {
      backendState: this.backendState,
      playerState: this.playerState,
      accountState: this.accountState,
      playbackState: this.mpv.getState(),
      currentTrack: this.playbackSession.getCurrentTrack() || undefined,
      queueLength: this.playbackSession.getQueue().length,
      loopMode: this.playbackSession.getLoopMode(),
    };
  }

  onStateChange(listener: (snapshot: MusicStatusSnapshot) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private emitStatus(): void {
    const snapshot = this.getSnapshot();
    for (const l of this.stateListeners) {
      try {
        l(snapshot);
      } catch {}
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    this.backendState = "stopped";
    await this.desktopBridge.dispose();
    this.selectionCache.clear();
    this.playbackSession.clear();
    await this.mpv.dispose();
    if (this.provider.dispose) {
      await this.provider.dispose();
    }
    this.stateListeners.clear();
  }
}
