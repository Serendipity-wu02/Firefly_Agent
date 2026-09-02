import type { MusicTrack, MusicLoopMode } from "../../../shared/music-types";

export class PlaybackSession {
  private queue: MusicTrack[] = [];
  private currentIndex = -1;
  private loopMode: MusicLoopMode = "list";

  setQueue(tracks: MusicTrack[], startIndex = 0): MusicTrack | null {
    this.queue = [...tracks];
    if (this.queue.length === 0) {
      this.currentIndex = -1;
      return null;
    }
    this.currentIndex = Math.max(0, Math.min(startIndex, this.queue.length - 1));
    return this.queue[this.currentIndex] || null;
  }

  appendTrack(track: MusicTrack): void {
    this.queue.push(track);
    if (this.currentIndex === -1) {
      this.currentIndex = 0;
    }
  }

  getCurrentTrack(): MusicTrack | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
      return this.queue[this.currentIndex] || null;
    }
    return null;
  }

  getQueue(): MusicTrack[] {
    return [...this.queue];
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  getLoopMode(): MusicLoopMode {
    return this.loopMode;
  }

  setLoopMode(mode: MusicLoopMode): void {
    this.loopMode = mode;
  }

  nextTrack(): MusicTrack | null {
    if (this.queue.length === 0) return null;

    if (this.loopMode === "single") {
      return this.getCurrentTrack();
    }

    if (this.loopMode === "shuffle") {
      this.currentIndex = Math.floor(Math.random() * this.queue.length);
      return this.queue[this.currentIndex] || null;
    }

    // List mode
    if (this.currentIndex + 1 < this.queue.length) {
      this.currentIndex++;
      return this.queue[this.currentIndex] || null;
    } else {
      // Loop back to start
      this.currentIndex = 0;
      return this.queue[0] || null;
    }
  }

  prevTrack(): MusicTrack | null {
    if (this.queue.length === 0) return null;

    if (this.loopMode === "single") {
      return this.getCurrentTrack();
    }

    if (this.loopMode === "shuffle") {
      this.currentIndex = Math.floor(Math.random() * this.queue.length);
      return this.queue[this.currentIndex] || null;
    }

    if (this.currentIndex > 0) {
      this.currentIndex--;
      return this.queue[this.currentIndex] || null;
    } else {
      this.currentIndex = this.queue.length - 1;
      return this.queue[this.currentIndex] || null;
    }
  }

  setCurrentTrackById(trackId: string): MusicTrack | null {
    const idx = this.queue.findIndex((t) => t.id === trackId);
    if (idx >= 0) {
      this.currentIndex = idx;
      return this.queue[idx] || null;
    }
    return null;
  }

  clear(): void {
    this.queue = [];
    this.currentIndex = -1;
  }
}
