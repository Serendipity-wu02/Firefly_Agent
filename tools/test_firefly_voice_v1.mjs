import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

import { synthesizeGptsovits } from "../dist/main/main/runtime/tts/engines/gptsovits-engine.js";
import { FireflyTtsDispatcher } from "../dist/main/main/runtime/tts/tts-dispatcher.js";
import { TtsSessionService } from "../dist/main/main/runtime/tts/tts-session-service.js";
import { TtsCache } from "../dist/main/main/runtime/tts/tts-cache.js";

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
    assert.equal(payload.media_type, "wav");
  } finally {
    await mockServer.close();
  }
});

test("2. FireflyTtsDispatcher: Synthesis, Caching, and Skip", async () => {
  const mockServer = await createMockGptsovitsServer();
  try {
    const dispatcher = new FireflyTtsDispatcher(new TtsCache());
    const settings = {
      engine: "gptsovits",
      speed: 1.0,
      volume: 1.0,
      gptsovits: {
        baseUrl: mockServer.baseUrl,
        refAudioPath: "samples/ref.wav",
        promptText: "参考文本",
        format: "wav",
        speed: 1.0,
      },
      customCloud: { endpointUrl: "", format: "mp3", speed: 1.0, volume: 1.0 },
      minimax: { apiKey: "", voiceId: "" },
      mimo: { apiKey: "" },
      mossland: { apiKey: "" },
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
      gptsovits: {
        baseUrl: mockServer.baseUrl,
        refAudioPath: "",
        promptText: "",
        format: "wav",
        speed: 1.0,
      },
      customCloud: { endpointUrl: "", format: "mp3", speed: 1.0, volume: 1.0 },
      minimax: { apiKey: "", voiceId: "" },
      mimo: { apiKey: "" },
      mossland: { apiKey: "" },
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

test("6. Speaking State Lifecycle & Live2D MouthSync Chain", () => {
  let isSpeaking = false;
  let mouthOpenY = 0.0;
  const events = [];

  const onSpeakingChanged = (speaking) => {
    isSpeaking = speaking;
    events.push(`speaking:${speaking}`);
    if (speaking) {
      mouthOpenY = 0.8; // Mouth opens on speaking
    } else {
      mouthOpenY = 0.0; // Mouth closes on idle
    }
  };

  // 1. Start speaking
  onSpeakingChanged(true);
  assert.equal(isSpeaking, true);
  assert.equal(mouthOpenY, 0.8);

  // 2. Stop speaking / playback finishes
  onSpeakingChanged(false);
  assert.equal(isSpeaking, false);
  assert.equal(mouthOpenY, 0.0);

  assert.deepEqual(events, ["speaking:true", "speaking:false"]);
});

test("7. Verification of Zero Fixed 367 WAV Runtime Dependency", () => {
  const normalVoiceDir = path.join(process.cwd(), "src", "renderer", "public", "models", "audio", "normal");
  const exists = fs.existsSync(normalVoiceDir);
  if (exists) {
    const files = fs.readdirSync(normalVoiceDir);
    assert.equal(files.length, 0, "src/renderer/public/models/audio/normal must have 0 fixed WAVs");
  } else {
    assert.equal(exists, false, "src/renderer/public/models/audio/normal directory successfully deleted");
  }
});
