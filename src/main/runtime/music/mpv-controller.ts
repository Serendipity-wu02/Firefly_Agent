import { spawn, type ChildProcess } from "node:child_process";
import * as net from "node:net";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { EventEmitter } from "node:events";
import type { PlaybackState, MusicTrack } from "../../../shared/music-types";

export interface MpvControllerOptions {
  binaryPath?: string;
  socketPath?: string;
  initialVolume?: number;
}

export function detectMpvBinary(): string {
  const platform = os.platform();
  if (platform === "win32") {
    const candidates = [
      path.join(process.cwd(), "resources", "bin", "mpv", "mpv.exe"),
      path.join(process.cwd(), "bin", "mpv.exe"),
      path.join(process.env.PROGRAMFILES ?? "C:\\Program Files", "mpv", "mpv.exe"),
      path.join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "mpv", "mpv.exe"),
      "mpv",
    ];
    for (const c of candidates) {
      try {
        if (c === "mpv" || fs.existsSync(c)) {
          return c;
        }
      } catch {}
    }
    return "mpv";
  }
  return "mpv";
}

function defaultSocketPath(): string {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\mpv-firefly-${process.pid}-${Date.now()}`;
  }
  const tmp = os.tmpdir();
  return path.join(tmp, `mpv-firefly-${process.pid}-${Date.now()}.sock`);
}

export class MpvController extends EventEmitter {
  private proc: ChildProcess | null = null;
  private socket: net.Socket | null = null;
  private connected = false;
  private disposed = false;
  private cmdId = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private state: PlaybackState = {
    connected: false,
    loaded: false,
    paused: false,
    position: 0,
    duration: 0,
    volume: 70,
    eofReached: false,
  };
  private readonly options: MpvControllerOptions;
  private readonly socketPath: string;
  private readonly binaryPath: string;

  constructor(options: MpvControllerOptions = {}) {
    super();
    this.options = options;
    this.binaryPath = options.binaryPath ?? detectMpvBinary();
    this.socketPath = options.socketPath ?? defaultSocketPath();
    this.state.volume = options.initialVolume ?? 70;
  }

  async start(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.proc) return true;

    try {
      const args = [
        "--idle",
        `--input-ipc-server=${this.socketPath}`,
        "--no-terminal",
        "--no-video",
        "--keep-open=yes",
        `--volume=${this.state.volume}`,
      ];

      this.proc = spawn(this.binaryPath, args, {
        stdio: ["ignore", "ignore", "ignore"],
        windowsHide: true,
      });

      let spawnError: Error | null = null;
      this.proc.on("error", (err) => {
        spawnError = err;
        this.handleDisconnect();
      });

      this.proc.on("exit", () => {
        this.handleDisconnect();
      });

      // Small tick to catch immediate spawn error (e.g. ENOENT)
      await new Promise((r) => setTimeout(r, 20));
      if (spawnError || !this.proc || this.proc.exitCode !== null) {
        return false;
      }

      // Connect to IPC socket
      await this.connectSocket(6, 50);
      this.connected = true;
      this.state.connected = true;
      this.observeProperties();
      this.emitState();
      return true;
    } catch (err: any) {
      this.handleDisconnect();
      return false;
    }
  }

  private async connectSocket(maxRetries: number, delayMs: number): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      if (this.disposed) return;
      try {
        await new Promise<void>((resolve, reject) => {
          const s = net.connect(this.socketPath);
          s.on("connect", () => {
            this.socket = s;
            this.setupSocketHandlers();
            resolve();
          });
          s.on("error", (err) => {
            s.destroy();
            reject(err);
          });
        });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw new Error(`Failed to connect to mpv socket at ${this.socketPath} after retries.`);
  }

  private setupSocketHandlers(): void {
    if (!this.socket) return;
    let buffer = "";

    this.socket.on("data", (data) => {
      buffer += data.toString("utf-8");
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          this.handleIpcMessage(msg);
        } catch {}
      }
    });

    this.socket.on("close", () => {
      this.handleDisconnect();
    });
  }

  private handleIpcMessage(msg: any): void {
    // Response to a command
    if (typeof msg.request_id === "number") {
      const p = this.pending.get(msg.request_id);
      if (p) {
        this.pending.delete(msg.request_id);
        if (msg.error && msg.error !== "success") {
          p.reject(new Error(`mpv error: ${msg.error}`));
        } else {
          p.resolve(msg.data);
        }
      }
      return;
    }

    // Property change event
    if (msg.event === "property-change") {
      this.handlePropertyChange(msg.name, msg.data);
    } else if (msg.event === "end-file") {
      if (msg.reason === "eof") {
        this.state.eofReached = true;
        this.emit("eof");
        this.emitState();
      }
    }
  }

  private handlePropertyChange(name: string, value: unknown): void {
    let changed = false;

    if (name === "time-pos" && typeof value === "number") {
      this.state.position = value;
      changed = true;
    } else if (name === "duration" && typeof value === "number") {
      this.state.duration = value;
      changed = true;
    } else if (name === "pause" && typeof value === "boolean") {
      this.state.paused = value;
      changed = true;
    } else if (name === "volume" && typeof value === "number") {
      this.state.volume = value;
      changed = true;
    } else if (name === "eof-reached" && typeof value === "boolean") {
      this.state.eofReached = value;
      if (value) this.emit("eof");
      changed = true;
    }

    if (changed) {
      this.emitState();
    }
  }

  private observeProperties(): void {
    const props = ["time-pos", "duration", "pause", "volume", "eof-reached"];
    for (const p of props) {
      this.sendCommand(["observe_property", ++this.cmdId, p]).catch(() => {});
    }
  }

  async sendCommand(args: (string | number | boolean)[]): Promise<unknown> {
    if (!this.socket || !this.connected) {
      return null;
    }
    const reqId = ++this.cmdId;
    const msg = JSON.stringify({ command: args, request_id: reqId }) + "\n";

    return new Promise((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject });
      this.socket?.write(msg, (err) => {
        if (err) {
          this.pending.delete(reqId);
          reject(err);
        }
      });
    });
  }

  async load(url: string, mode: "replace" | "append" = "replace"): Promise<void> {
    this.state.eofReached = false;
    this.state.loaded = true;
    this.state.position = 0;
    await this.sendCommand(["loadfile", url, mode]);
    this.emitState();
  }

  async pause(): Promise<void> {
    await this.sendCommand(["set_property", "pause", true]);
  }

  async resume(): Promise<void> {
    await this.sendCommand(["set_property", "pause", false]);
  }

  async stop(): Promise<void> {
    await this.sendCommand(["stop"]);
    this.state.loaded = false;
    this.state.position = 0;
    this.emitState();
  }

  async seek(seconds: number): Promise<void> {
    await this.sendCommand(["seek", seconds, "absolute"]);
  }

  async setVolume(volume: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, volume));
    this.state.volume = clamped;
    await this.sendCommand(["set_property", "volume", clamped]);
    this.emitState();
  }

  setTrack(track?: MusicTrack): void {
    this.state.track = track;
    this.emitState();
  }

  getState(): Readonly<PlaybackState> {
    return { ...this.state };
  }

  private emitState(): void {
    this.emit("state", { ...this.state });
  }

  private handleDisconnect(): void {
    this.connected = false;
    this.state.connected = false;
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch {}
      this.socket = null;
    }
    if (this.proc) {
      try {
        this.proc.kill();
      } catch {}
      this.proc = null;
    }
    this.emitState();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    try {
      await this.sendCommand(["quit"]);
    } catch {}
    this.handleDisconnect();
    this.removeAllListeners();
  }
}
