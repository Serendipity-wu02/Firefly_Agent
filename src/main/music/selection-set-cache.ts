import type { MusicTrack } from "../../shared/music-types";

export interface SelectionItem {
  index: number;
  track: MusicTrack;
}

export class SelectionSetCache {
  private items: SelectionItem[] = [];
  private updatedAt = 0;
  private readonly ttlMs: number;

  constructor(ttlMs = 30 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  setTracks(tracks: MusicTrack[]): void {
    this.items = tracks.map((track, idx) => ({
      index: idx + 1,
      track,
    }));
    this.updatedAt = Date.now();
  }

  getByIndex(index: number): MusicTrack | null {
    if (this.isExpired()) {
      this.clear();
      return null;
    }
    const found = this.items.find((item) => item.index === index);
    return found ? found.track : null;
  }

  getById(trackId: string): MusicTrack | null {
    if (this.isExpired()) {
      this.clear();
      return null;
    }
    const found = this.items.find((item) => item.track.id === trackId);
    return found ? found.track : null;
  }

  getAll(): MusicTrack[] {
    if (this.isExpired()) {
      this.clear();
      return [];
    }
    return this.items.map((i) => i.track);
  }

  isExpired(): boolean {
    if (this.items.length === 0) return false;
    return Date.now() - this.updatedAt > this.ttlMs;
  }

  clear(): void {
    this.items = [];
    this.updatedAt = 0;
  }

  size(): number {
    if (this.isExpired()) {
      this.clear();
      return 0;
    }
    return this.items.length;
  }
}
