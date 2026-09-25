// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTtsPlaybackSnapshot, playTtsToCompletion, startTtsPlayback, stopTtsPlayback } from "./tts-playback";

const request = {
  conversationId: "conversation-1",
  messageId: "message-1",
  text: "你好，开拓者。",
  automatic: true,
};

describe("automatic TTS playback", () => {
  beforeEach(() => {
    stopTtsPlayback();
    Reflect.deleteProperty(window, "tts");
  });

  it("reports a missing session bridge instead of claiming playback", async () => {
    await startTtsPlayback(request);
    expect(getTtsPlaybackSnapshot()).toMatchObject({ messageId: request.messageId, status: "error" });
  });

  it("surfaces missing external service configuration and terminates the queue item", async () => {
    Object.assign(window, {
      tts: {
        startSession: vi.fn(async () => { throw new Error("GPT-SoVITS TTS 配置不完整"); }),
        cancelSession: vi.fn(async () => true),
        onSessionEvent: vi.fn(() => () => {}),
      },
    });

    expect(await playTtsToCompletion(request)).toBe("error");
    expect(getTtsPlaybackSnapshot()).toMatchObject({
      messageId: request.messageId,
      status: "error",
      error: "GPT-SoVITS TTS 配置不完整",
    });
  });

  it("ignores a late failure after playback is stopped", async () => {
    let rejectSession!: (error: Error) => void;
    const startSession = vi.fn(() => new Promise<never>((_resolve, reject) => { rejectSession = reject; }));
    Object.assign(window, {
      tts: {
        startSession,
        cancelSession: vi.fn(async () => true),
        onSessionEvent: vi.fn(() => () => {}),
      },
    });

    const pending = startTtsPlayback(request);
    expect(getTtsPlaybackSnapshot()).toMatchObject({ messageId: request.messageId, status: "synthesizing" });
    stopTtsPlayback();
    rejectSession(new Error("late error"));
    await pending;
    expect(getTtsPlaybackSnapshot()).toEqual({ messageId: null, status: "idle" });
    expect(startSession).toHaveBeenCalledTimes(1);
  });
});
