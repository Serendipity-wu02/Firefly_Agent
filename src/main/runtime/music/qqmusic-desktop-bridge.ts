import { execFile } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { EventEmitter } from "node:events";
import type { MusicTrack, PlaybackState, MusicPlayerState } from "../../../shared/music-types";

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

export type GsmtcControlAction = "play" | "pause" | "toggle" | "next" | "prev";
export type GsmtcAction = "get-state" | GsmtcControlAction;

export const QQ_MUSIC_SESSION_ID = "QQMusic.exe";

export function isCanonicalQqMusicSessionId(value: unknown): value is string {
  return typeof value === "string" && value.toLowerCase() === QQ_MUSIC_SESSION_ID.toLowerCase();
}

export type GsmtcExecutor = (action: GsmtcAction, signal?: AbortSignal) => Promise<GsmtcRawState>;

export function defaultGsmtcExecutor(scriptPath: string): GsmtcExecutor {
  return (action, signal) => {
    return new Promise((resolve) => {
      if (signal?.aborted) {
        resolve({ ok: false, found: false, error: "CANCELLED" });
        return;
      }
      const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-Action", action];
      execFile("powershell.exe", args, { timeout: 4000, windowsHide: true, signal }, (err, stdout) => {
        if (err) {
          resolve({ ok: false, found: false, error: signal?.aborted ? "CANCELLED" : err.message });
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
  const scriptName = "qqmusic_gsmtc.ps1";
  const scriptPaths = [
    path.join(__dirname, "scripts", scriptName),
    path.join(process.cwd(), "dist", "main", "main", "runtime", "music", "scripts", scriptName),
    path.join(process.cwd(), "src", "main", "runtime", "music", "scripts", scriptName),
  ];
  for (const c of scriptPaths) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(process.cwd(), "src", "main", "runtime", "music", "scripts", scriptName);
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
        this.applyRawState(
          raw.ok && raw.found && !isCanonicalQqMusicSessionId(raw.appId)
            ? { ok: true, found: false, error: "QQ_MUSIC_SESSION_NOT_FOUND" }
            : raw,
        );
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

  async control(action: GsmtcControlAction, signal?: AbortSignal): Promise<GsmtcRawState> {
    if (signal?.aborted) {
      return { ok: false, found: false, error: "CANCELLED" };
    }
    if (!this.isAvailable) {
      return { ok: false, found: false, error: "QQ_MUSIC_SESSION_NOT_FOUND" };
    }

    const res = await this.executor(action, signal);
    if (signal?.aborted) {
      return {
        ...res,
        ok: false,
        error: "CANCELLED",
      };
    }
    if (!res.ok) return res;

    switch (action) {
      case "play":
        this.playbackState.paused = false;
        this.playbackState.loaded = true;
        this.emitState();
        break;
      case "pause":
        this.playbackState.paused = true;
        this.playbackState.loaded = true;
        this.emitState();
        break;
      case "toggle":
        this.playbackState.paused = !this.playbackState.paused;
        this.playbackState.loaded = true;
        this.emitState();
        break;
      case "next":
      case "prev":
        setTimeout(() => void this.poll(), 300);
        break;
      default:
        break;
    }
    return res;
  }

  async play(signal?: AbortSignal): Promise<boolean> {
    return (await this.control("play", signal)).ok;
  }

  async pause(signal?: AbortSignal): Promise<boolean> {
    return (await this.control("pause", signal)).ok;
  }

  async toggle(signal?: AbortSignal): Promise<boolean> {
    return (await this.control("toggle", signal)).ok;
  }

  async next(signal?: AbortSignal): Promise<boolean> {
    return (await this.control("next", signal)).ok;
  }

  async prev(signal?: AbortSignal): Promise<boolean> {
    return (await this.control("prev", signal)).ok;
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
