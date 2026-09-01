import type { MouthSyncController } from "./mouth-sync";
import type { FireflyLive2DManager } from "./manager";

export interface SpeakingMotionOptions {
  manager: FireflyLive2DManager;
  mouthSync: MouthSyncController;
}

export class SpeakingMotionController {
  private readonly manager: FireflyLive2DManager;
  private readonly mouthSync: MouthSyncController;
  private isSpeaking = false;
  private disposed = false;

  constructor(options: SpeakingMotionOptions) {
    this.manager = options.manager;
    this.mouthSync = options.mouthSync;
  }

  setSpeaking(speaking: boolean, durationMs: number = 10000): void {
    if (this.disposed) return;
    this.isSpeaking = speaking;

    if (speaking) {
      this.manager.playActionId("talking");
      this.mouthSync.start(durationMs);
    } else {
      this.mouthSync.stop();
    }
  }

  getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.isSpeaking) {
      this.mouthSync.stop();
    }
  }
}
