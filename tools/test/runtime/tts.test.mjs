import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeGptsovitsText, synthesizeGptsovits } from "../../../dist/main/main/runtime/tts/engines/gptsovits-engine.js";
import { FireflyTtsDispatcher } from "../../../dist/main/main/runtime/tts/tts-dispatcher.js";
import { TtsSessionService } from "../../../dist/main/main/runtime/tts/tts-session-service.js";
import { TtsCache } from "../../../dist/main/main/runtime/tts/tts-cache.js";
import { TtsPlaybackOwnership } from "../../../dist/main/main/runtime/tts/playback-owner.js";
import { getTtsTextIntegrity } from "../../../dist/main/shared/tts-text-integrity.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// Helper to create a local Mock GPT-SoVITS HTTP Server
function createMockGptsovitsServer(options = {}) {
  let requestCount = 0;
  let lastPayload = null;

  // Generate a minimal valid RIFF WAV header (44 bytes)
  const sampleWav = Buffer.alloc(44);
  sampleWav.write("RIFF", 0);
  sampleWav.writeUInt32LE(36, 4);
  sampleWav.write("WAVE", 8);
  sampleWav.write("fmt ", 12);
  sampleWav.writeUInt32LE(16, 16);
  sampleWav.writeUInt16LE(1, 20); // PCM
  sampleWav.writeUInt16LE(1, 22); // Mono
  sampleWav.writeUInt32LE(24000, 24); // 24kHz
  sampleWav.writeUInt32LE(48000, 28);
  sampleWav.writeUInt16LE(2, 32);
  sampleWav.writeUInt16LE(16, 34);
  sampleWav.write("data", 36);
  sampleWav.writeUInt32LE(0, 40);

  const server = http.createServer((req, res) => {
    requestCount++;
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        lastPayload = body ? JSON.parse(body) : {};
      } catch {
        lastPayload = {};
      }

      if (options.shouldFail) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Model Inference Error");
        return;
      }

      if (options.delayMs) {
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "audio/wav" });
          res.end(sampleWav);
        }, options.delayMs);
        return;
      }

      res.writeHead(200, { "Content-Type": "audio/wav" });
      res.end(sampleWav);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const baseUrl = `http://127.0.0.1:${port}`;
      resolve({
        baseUrl,
        server,
        getRequestCount: () => requestCount,
        getLastPayload: () => lastPayload,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

test("1. GPT-SoVITS Provider Config & Request Construction", async () => {
  const mockServer = await createMockGptsovitsServer();
  try {
    const config = {
      baseUrl: mockServer.baseUrl,
      refAudioPath: "src/renderer/public/voice_reference/sample.wav",
      promptText: "在梦里，我见到了焦土……",
      format: "wav",
      speed: 1.1,
      seed: 5,
    };

    const res = await synthesizeGptsovits("你好，开拓者！", config);

    assert.equal(res.format, "wav");
    assert.ok(res.buffer.length >= 44);
    assert.equal(res.buffer.subarray(0, 4).toString(), "RIFF");

    const payload = mockServer.getLastPayload();
    assert.equal(payload.text, "你好，开拓者！");
    assert.equal(payload.text_lang, "zh");
    assert.equal(payload.ref_audio_path, "src/renderer/public/voice_reference/sample.wav");
    assert.equal(payload.prompt_text, "在梦里，我见到了焦土……");
    assert.equal(payload.prompt_lang, "zh");
    assert.equal(payload.speed_factor, 1.1);
    assert.equal(payload.seed, 5);
    assert.equal(payload.media_type, "wav");
    assert.equal(payload.streaming_mode, false);
  } finally {
    await mockServer.close();
  }
});
test("1a. GPT-SoVITS Chinese pronunciation normalization keeps visible text unchanged", () => {
  assert.equal(normalizeGptsovitsText("失熵症的身体会慢性解离。"), "失商症的身体会慢性解离。");
  assert.equal(normalizeGptsovitsText("今天的天气很好。"), "今天的天气很好。");
});

test("2. FireflyTtsDispatcher: Synthesis, Caching, and Skip", async () => {
  const mockServer = await createMockGptsovitsServer();
  try {
    const dispatcher = new FireflyTtsDispatcher(new TtsCache());
    const settings = {
      engine: "gptsovits",
      speed: 1.0,
      volume: 1.0,
      voiceProfile: "firefly-v2proplus",
      gptsovits: {
        baseUrl: mockServer.baseUrl,
        refAudioPath: "samples/ref.wav",
        promptText: "参考文本",
        format: "wav",
        speed: 1.0,
      },
    };

    // 1st request -> Network call
    const res1 = await dispatcher.synthesize({ requestId: "r1", speechText: "第一句测试" }, settings);
    assert.equal(res1.status, "ready");
    assert.equal(res1.cached, false);
    assert.equal(res1.format, "wav");
    assert.ok(res1.base64);
    assert.equal(mockServer.getRequestCount(), 1);

    // 2nd request with same text -> Cached
    const res2 = await dispatcher.synthesize({ requestId: "r2", speechText: "第一句测试" }, settings);
    assert.equal(res2.status, "ready");
    assert.equal(res2.cached, true);
    assert.equal(mockServer.getRequestCount(), 1); // No new network call

    // Empty text -> Skipped
    const res3 = await dispatcher.synthesize({ requestId: "r3", speechText: "   " }, settings);
    assert.equal(res3.status, "skipped");
  } finally {
    await mockServer.close();
  }
});

test("3. TtsSessionService: Session Queue & Cancellation", async () => {
  const mockServer = await createMockGptsovitsServer({ delayMs: 40 });
  try {
    const dispatcher = new FireflyTtsDispatcher();
    const service = new TtsSessionService(dispatcher);
    const settings = {
      engine: "gptsovits",
      speed: 1.0,
      volume: 1.0,
      voiceProfile: "firefly-v2proplus",
      gptsovits: {
        baseUrl: mockServer.baseUrl,
        refAudioPath: "",
        promptText: "",
        format: "wav",
        speed: 1.0,
      },
    };

    const startPromise = service.start(
      { requestId: "req-1", speechText: "异步音频测试" },
      settings,
    );

    // Cancel in-flight session
    const cancelOk = service.cancel("req-1");
    assert.equal(cancelOk, true);

    const result = await startPromise;
    assert.equal(result.status, "cancelled");
  } finally {
    await mockServer.close();
  }
});

test("4. Service Unavailable / Model Failure & Graceful Degradation", async () => {
  // Point to a non-existent port (e.g. 59999)
  const deadConfig = {
    baseUrl: "http://127.0.0.1:59999",
    refAudioPath: "",
    promptText: "",
    format: "wav",
    speed: 1.0,
  };

  await assert.rejects(
    async () => {
      await synthesizeGptsovits("测试失败", deadConfig);
    },
    (err) => {
      assert.ok(err.message.includes("GPT-SoVITS 服务连接失败"));
      return true;
    },
  );
});

test("5. Server Error 500 Diagnosis", async () => {
  const mockServer = await createMockGptsovitsServer({ shouldFail: true });
  try {
    const config = {
      baseUrl: mockServer.baseUrl,
      refAudioPath: "",
      promptText: "",
      format: "wav",
      speed: 1.0,
    };

    await assert.rejects(
      async () => {
        await synthesizeGptsovits("500错误测试", config);
      },
      (err) => {
        assert.ok(err.message.includes("HTTP 500"));
        return true;
      },
    );
  } finally {
    await mockServer.close();
  }
});

test("6. UTF-8 text integrity is preserved through GPT-SoVITS request serialization", async () => {
  const text = "开拓者，今天也辛苦了。我会一直陪在你身边，所以不用担心。";
  const integrity = await getTtsTextIntegrity(text);
  const expectedHash = crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
  assert.equal(integrity.utf16Length, text.length);
  assert.equal(integrity.utf8ByteLength, Buffer.byteLength(text, "utf8"));
  assert.equal(integrity.sha256, expectedHash);

  const mockServer = await createMockGptsovitsServer();
  try {
    await synthesizeGptsovits(
      text,
      {
        baseUrl: mockServer.baseUrl,
        refAudioPath: "samples/ref.wav",
        promptText: "参考文本",
        format: "wav",
        speed: 0.9,
        seed: 5,
      },
      undefined,
      "text-integrity-1",
    );
    const payload = mockServer.getLastPayload();
    assert.equal(payload.text, text);
    assert.equal(crypto.createHash("sha256").update(Buffer.from(payload.text, "utf8")).digest("hex"), expectedHash);
  } finally {
    await mockServer.close();
  }
});

test("7. Global playback ownership transfers and ignores stale releases", () => {
  const ownership = new TtsPlaybackOwnership();

  const first = ownership.acquire(101, "request-a");
  assert.equal(first.granted, true);
  assert.equal(first.previousOwner, null);
  assert.equal(ownership.playbackOwnerWindowId, 101);
  assert.equal(ownership.playbackRequestId, "request-a");

  const second = ownership.acquire(202, "request-b");
  assert.deepEqual(second.previousOwner, { windowId: 101, requestId: "request-a" });
  assert.equal(ownership.release(101, "request-a"), false);
  assert.equal(ownership.playbackOwnerWindowId, 202);
  assert.equal(ownership.playbackRequestId, "request-b");
  assert.equal(ownership.release(202, "request-a"), false);
  assert.equal(ownership.release(202, "request-b"), true);
  assert.equal(ownership.playbackRequestId, null);
});

test("8. Playback lifecycle guards, cleanup, MouthSync failsafe, and ownership IPC are canonical", () => {
  const playbackSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "tts", "tts-playback.ts"), "utf8");
  const ttsIpcSource = fs.readFileSync(path.join(rootDir, "src", "main", "runtime", "tts", "tts-ipc.ts"), "utf8");
  const sharedIpcSource = fs.readFileSync(path.join(rootDir, "src", "shared", "ipc-channels.ts"), "utf8");
  const preloadSource = fs.readFileSync(path.join(rootDir, "src", "preload", "index.ts"), "utf8");
  const mouthSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "live2d", "mouth-sync.ts"), "utf8");
  const speakingSource = fs.readFileSync(path.join(rootDir, "src", "renderer", "live2d", "speaking-motion.ts"), "utf8");
  const mainSource = fs.readFileSync(path.join(rootDir, "src", "main", "index.ts"), "utf8");

  assert.ok(playbackSource.includes("this.isCurrent(requestId, audio)"), "Audio callbacks must be request/audio scoped");
  assert.ok(playbackSource.includes("this.currentPlaybackResolve"), "Stopping must resolve the internal playback promise");
  assert.ok(playbackSource.includes('audio.removeAttribute("src")'), "Cleanup must remove src without assigning an empty src");
  assert.ok(!playbackSource.includes('audio.src = ""'), "Cleanup must not create Empty src media errors");
  assert.ok(playbackSource.includes("await completion"), "speak must wait for playback completion");
  assert.ok(!playbackSource.includes("setExpression"), "TTS playback must not own Expression");
  assert.ok(!playbackSource.includes("playActionId"), "TTS playback must not own Motion");

  for (const channel of ["TTS_ACQUIRE_PLAYBACK", "TTS_RELEASE_PLAYBACK", "TTS_STOP_PLAYBACK"]) {
    assert.ok(sharedIpcSource.includes(channel), `${channel} must exist in shared IPC`);
    assert.ok(preloadSource.includes(channel), `${channel} must exist in the sandbox-safe preload mirror`);
  }
  assert.ok(ttsIpcSource.includes("new TtsPlaybackOwnership()"), "Main must own playback arbitration");
  assert.ok(ttsIpcSource.includes("playbackOwnerWindowId"), "Main must track owner window identity");
  assert.ok(ttsIpcSource.includes("playbackRequestId"), "Main must track owner request identity");
  assert.ok(ttsIpcSource.includes("TTS_STOP_PLAYBACK"), "Previous owner must receive an exact stop request");
  assert.ok(mainSource.includes("onSpeakingChanged"), "Main speaking state must come from the TTS owner");

  assert.ok(mouthSource.includes("MOUTH_SYNC_FAILSAFE_DURATION_MS"), "MouthSync must use a long failsafe duration");
  assert.ok(!speakingSource.includes("durationMs: number = 10000"), "Speaking must not use a fixed ten-second cutoff");
});
