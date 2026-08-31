import { execFile } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { EventEmitter } from "node:events";
import type { MusicTrack, PlaybackState, MusicPlayerState } from "../../shared/music-types";

export interface GsmtcRawState {
  ok: boolean;
  found: boolean;
  appId?: string;
  title?: string;
  artist?: string;
  albumTitle?: string;
  hasThumbnail?: boolean;
  playbackStatus?: string;
  position?: number;
  duration?: number;
  canPlay?: boolean;
  canPause?: boolean;
  canNext?: boolean;
  canPrev?: boolean;
  error?: string;
}

export interface DesktopBridgeSnapshot {
  available: boolean;
  playerState: MusicPlayerState;
  track?: MusicTrack;
  playbackState: PlaybackState;
}

export type GsmtcExecutor = (action: "get-state" | "play" | "pause" | "toggle" | "next" | "prev") => Promise<GsmtcRawState>;

export function defaultGsmtcExecutor(scriptPath: string): GsmtcExecutor {
  return (action) => {
    return new Promise((resolve) => {
      const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-Action", action];
      execFile("powershell.exe", args, { timeout: 4000, windowsHide: true }, (err, stdout) => {
        if (err) {
          resolve({ ok: false, found: false, error: err.message });
          return;
        }
        try {
          const trimmed = stdout.trim();
          const parsed = JSON.parse(trimmed) as GsmtcRawState;
          resolve(parsed);
        } catch (parseErr: any) {
          resolve({ ok: false, found: false, error: parseErr.message });
        }
      });
    });
  };
}

export interface QQMusicDesktopBridgeOptions {
  scriptPath?: string;
  executor?: GsmtcExecutor;
  pollIntervalMs?: number;
}

/**
 * QQMusicDesktopBridge
 *
 * Connects to the running official QQ Music desktop client via Windows
 * GlobalSystemMediaTransportControlsSession (GSMTC).
 *
 * Responsibilities:
 * - Session discovery (detecting QQMusic.exe)
 * - Media properties reading (Title, Artist, AlbumTitle)
 * - Playback status tracking (Playing / Paused / Stopped / Closed)
 * - Timeline tracking (Position, Duration)
 * - Transport controls (Play, Pause, Next, Previous)
 * - Safe fallback when QQ Music is closed or unconfigured
 */
function resolveGsmtcScript(customPath?: string): string {
  if (customPath && fs.existsSync(customPath)) return customPath;
  const candidates = [
    path.join(__dirname, "scripts", "qqmusic_gsmtc.ps1"),
    path.join(process.cwd(), "src", "main", "music", "scripts", "qqmusic_gsmtc.ps1"),
    path.join(process.cwd(), "dist", "main", "main", "music", "scripts", "qqmusic_gsmtc.ps1"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(process.cwd(), "src", "main", "music", "scripts", "qqmusic_gsmtc.ps1");
}

export class QQMusicDesktopBridge extends EventEmitter {
  private readonly executor: GsmtcExecutor;
  private readonly pollIntervalMs: number;
  private pollTimer: NodeJS.Timeout | null = null;
  private activePollPromise: Promise<DesktopBridgeSnapshot> | null = null;

  private currentTrack: MusicTrack | null = null;
  private playbackState: PlaybackState = {
    connected: false,
    loaded: false,
    paused: false,
    position: 0,
    duration: 0,
    volume: 100,
    eofReached: false,
  };
  private isAvailable = false;

  constructor(options: QQMusicDesktopBridgeOptions = {}) {
    super();
    if (options.executor) {
      this.executor = options.executor;
    } else {
      const resolvedScript = resolveGsmtcScript(options.scriptPath);
      this.executor = defaultGsmtcExecutor(resolvedScript);
    }
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
  }

  startPolling(intervalMs?: number): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    const interval = intervalMs ?? this.pollIntervalMs;
    // Initial immediate poll
    void this.poll();
    this.pollTimer = setInterval(() => {
      void this.poll();
    }, interval);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async poll(): Promise<DesktopBridgeSnapshot> {
    if (this.activePollPromise) return this.activePollPromise;

    this.activePollPromise = (async () => {
      try {
        const raw = await this.executor("get-state");
        this.applyRawState(raw);
      } catch (err: any) {
        this.applyRawState({ ok: false, found: false, error: err?.message || String(err) });
      } finally {
        this.activePollPromise = null;
      }
      return this.getSnapshot();
    })();

    return this.activePollPromise;
  }

  private applyRawState(raw: GsmtcRawState): void {
    let changed = false;

    if (!raw.ok || !raw.found) {
      if (this.isAvailable || this.playbackState.connected) {
        this.isAvailable = false;
        this.currentTrack = null;
        this.playbackState = {
          connected: false,
          loaded: false,
          paused: false,
          position: 0,
          duration: 0,
          volume: 100,
          eofReached: false,
        };
        changed = true;
      }
    } else {
      this.isAvailable = true;
      const status = raw.playbackStatus || "Closed";
      const isPlaying = status === "Playing";
      const isPaused = status === "Paused";
      const isLoaded = isPlaying || isPaused;

      // Update Track
      const trackTitle = (raw.title || "").trim();
      const trackArtist = (raw.artist || "").trim();
      const trackAlbum = (raw.albumTitle || "").trim();

      if (trackTitle || trackArtist) {
        const newTrack: MusicTrack = {
          id: `qqmusic-desktop-${trackTitle}-${trackArtist}`,
          name: trackTitle || "未知曲目",
          artists: trackArtist ? [trackArtist] : ["未知歌手"],
          album: trackAlbum || undefined,
          durationMs: raw.duration ? Math.round(raw.duration * 1000) : undefined,
          extra: {
            source: "QQMusicDesktop",
            hasThumbnail: !!raw.hasThumbnail,
          },
        };

        if (
          !this.currentTrack ||
          this.currentTrack.name !== newTrack.name ||
          this.currentTrack.artists[0] !== newTrack.artists[0]
        ) {
          this.currentTrack = newTrack;
          changed = true;
        }
      } else {
        if (this.currentTrack) {
          this.currentTrack = null;
          changed = true;
        }
      }

      // Update PlaybackState
      const newPlaybackState: PlaybackState = {
        connected: true,
        loaded: isLoaded,
        paused: isPaused,
        position: Math.max(0, raw.position || 0),
        duration: Math.max(0, raw.duration || 0),
        volume: 100,
        eofReached: false,
        track: this.currentTrack || undefined,
      };

      if (
        this.playbackState.connected !== newPlaybackState.connected ||
        this.playbackState.loaded !== newPlaybackState.loaded ||
        this.playbackState.paused !== newPlaybackState.paused ||
        Math.abs(this.playbackState.position - newPlaybackState.position) > 2
      ) {
        this.playbackState = newPlaybackState;
        changed = true;
      }
    }

    if (changed) {
      this.emitState();
    }
  }

  async play(): Promise<boolean> {
    const res = await this.executor("play");
    if (res.ok) {
      this.playbackState.paused = false;
      this.playbackState.loaded = true;
      this.emitState();
      return true;
    }
    return false;
  }

  async pause(): Promise<boolean> {
    const res = await this.executor("pause");
    if (res.ok) {
      this.playbackState.paused = true;
      this.emitState();
      return true;
    }
    return false;
  }

  async toggle(): Promise<boolean> {
    const res = await this.executor("toggle");
    if (res.ok) {
      this.playbackState.paused = !this.playbackState.paused;
      this.emitState();
      return true;
    }
    return false;
  }

  async next(): Promise<boolean> {
    const res = await this.executor("next");
    if (res.ok) {
      // Force quick poll to get new track info
      setTimeout(() => void this.poll(), 300);
      return true;
    }
    return false;
  }

  async prev(): Promise<boolean> {
    const res = await this.executor("prev");
    if (res.ok) {
      // Force quick poll to get new track info
      setTimeout(() => void this.poll(), 300);
      return true;
    }
    return false;
  }

  getSnapshot(): DesktopBridgeSnapshot {
    return {
      available: this.isAvailable,
      playerState: this.isAvailable ? "available" : "unavailable",
      track: this.currentTrack || undefined,
      playbackState: { ...this.playbackState },
    };
  }

  onStateChange(listener: (snapshot: DesktopBridgeSnapshot) => void): () => void {
    this.on("state", listener);
    return () => {
      this.off("state", listener);
    };
  }

  private emitState(): void {
    this.emit("state", this.getSnapshot());
  }

  async dispose(): Promise<void> {
    this.stopPolling();
    this.isAvailable = false;
    this.currentTrack = null;
    this.removeAllListeners();
  }
}
