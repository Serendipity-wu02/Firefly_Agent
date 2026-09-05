export interface TtsPlaybackOwner {
  windowId: number;
  requestId: string;
}

export interface TtsPlaybackAcquireResult {
  granted: boolean;
  owner: TtsPlaybackOwner;
  previousOwner: TtsPlaybackOwner | null;
}

/**
 * Main-process source of truth for audible playback ownership.
 * Synthesis is intentionally outside this state machine; only playback is exclusive.
 */
export class TtsPlaybackOwnership {
  private owner: TtsPlaybackOwner | null = null;

  get playbackOwnerWindowId(): number | null {
    return this.owner?.windowId ?? null;
  }

  get playbackRequestId(): string | null {
    return this.owner?.requestId ?? null;
  }

  get currentOwner(): TtsPlaybackOwner | null {
    return this.owner ? { ...this.owner } : null;
  }

  acquire(windowId: number, requestId: string): TtsPlaybackAcquireResult {
    const nextOwner = { windowId, requestId };
    const previousOwner =
      this.owner && (this.owner.windowId !== windowId || this.owner.requestId !== requestId)
        ? { ...this.owner }
        : null;

    this.owner = nextOwner;
    return { granted: true, owner: { ...nextOwner }, previousOwner };
  }

  release(windowId: number, requestId: string): boolean {
    if (!this.owner || this.owner.windowId !== windowId || this.owner.requestId !== requestId) {
      return false;
    }
    this.owner = null;
    return true;
  }

  releaseWindow(windowId: number): TtsPlaybackOwner | null {
    if (!this.owner || this.owner.windowId !== windowId) {
      return null;
    }
    const released = { ...this.owner };
    this.owner = null;
    return released;
  }
}
