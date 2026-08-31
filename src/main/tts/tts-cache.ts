import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { TtsAudioFormat } from "../../shared/tts-session";

export class TtsCache {
  private cacheDir: string;

  constructor(customDir?: string) {
    if (customDir) {
      this.cacheDir = customDir;
    } else {
      try {
        this.cacheDir = path.join(app.getPath("userData"), "cache", "tts");
      } catch {
        this.cacheDir = path.join(process.cwd(), "config", "cache", "tts");
      }
    }
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  getFilePath(key: string, format: TtsAudioFormat): string {
    const ext = format === "wav" ? "wav" : format === "pcm" ? "pcm" : "mp3";
    return path.join(this.cacheDir, `${key}.${ext}`);
  }

  has(key: string, format: TtsAudioFormat): boolean {
    return fs.existsSync(this.getFilePath(key, format));
  }

  read(key: string, format: TtsAudioFormat): Buffer | null {
    try {
      const file = this.getFilePath(key, format);
      if (fs.existsSync(file)) {
        return fs.readFileSync(file);
      }
    } catch (err) {
      console.warn("[TtsCache] Failed to read cached audio:", err);
    }
    return null;
  }

  write(key: string, buffer: Buffer, format: TtsAudioFormat): void {
    try {
      this.ensureDir();
      const file = this.getFilePath(key, format);
      fs.writeFileSync(file, buffer);
    } catch (err) {
      console.warn("[TtsCache] Failed to write cache:", err);
    }
  }
}
