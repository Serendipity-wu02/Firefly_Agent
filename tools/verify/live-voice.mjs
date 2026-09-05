import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

import { synthesizeGptsovits } from "../../dist/main/main/runtime/tts/engines/gptsovits-engine.js";
import { FireflyTtsDispatcher } from "../../dist/main/main/runtime/tts/tts-dispatcher.js";
import { TtsSessionService } from "../../dist/main/main/runtime/tts/tts-session-service.js";
import { DEFAULT_TTS_SETTINGS } from "../../dist/main/shared/tts-types.js";

function readCliValue(name) {
  const prefix = `${name}=`;
  const inline = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readFireflySettings() {
  const settingsPaths = [];
  if (process.env.APPDATA) {
    settingsPaths.push(path.join(process.env.APPDATA, "firefly-agent", "settings.json"));
  }
  settingsPaths.push(path.join(process.cwd(), "settings.json"));

  for (const settingsPath of settingsPaths) {
    if (!fs.existsSync(settingsPath)) continue;
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      return { settings, settingsPath };
    } catch (error) {
      throw new Error(`无法读取 Firefly 设置文件 ${settingsPath}: ${error.message}`);
    }
  }

  return { settings: {}, settingsPath: null };
}

function resolveTtsConfig() {
  const { settings, settingsPath } = readFireflySettings();
  const configured = settings.tts?.gptsovits || {};
  const baseUrl = readCliValue("--base-url") || process.env.FIREFLY_TTS_BASE_URL || configured.baseUrl || DEFAULT_TTS_SETTINGS.gptsovits.baseUrl;
  const refAudioPath = readCliValue("--ref-audio-path") || process.env.FIREFLY_TTS_REF_AUDIO_PATH || configured.refAudioPath || "";
  const promptText = readCliValue("--prompt-text") || configured.promptText || DEFAULT_TTS_SETTINGS.gptsovits.promptText;
  const speedValue = readCliValue("--speed") || configured.speed || DEFAULT_TTS_SETTINGS.gptsovits.speed;
  const speed = Number(speedValue);

  if (!Number.isFinite(speed) || speed <= 0) {
    throw new Error(`TTS speed must be a positive number: ${speedValue}`);
  }

  return {
    baseUrl,
    refAudioPath,
    promptText,
    format: "wav",
    speed,
    settingsPath,
  };
}

function createSessionSettings(config) {
  return {
    ...DEFAULT_TTS_SETTINGS,
    engine: "gptsovits",
    speed: config.speed,
    gptsovits: {
      baseUrl: config.baseUrl,
      refAudioPath: config.refAudioPath,
      promptText: config.promptText,
      format: config.format,
      speed: config.speed,
    },
  };
}

async function main() {
  const config = resolveTtsConfig();
  console.log("=== Firefly GPT-SoVITS Live Verification ===");
  console.log(`Endpoint: ${config.baseUrl}/tts`);
  if (config.settingsPath) console.log(`Settings: ${config.settingsPath}`);
  if (config.refAudioPath) {
    assert.ok(fs.existsSync(config.refAudioPath), `Configured reference audio does not exist: ${config.refAudioPath}`);
  }

  let probeResponse;
  try {
    probeResponse = await fetch(`${config.baseUrl}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch {
    console.log("BACKEND OFFLINE");
    process.exitCode = 1;
    return;
  }

  assert.ok(
    probeResponse.status === 422 || probeResponse.status === 400 || probeResponse.status === 200,
    `Unexpected /tts probe status: ${probeResponse.status}`,
  );
  console.log(`Backend reachable: HTTP ${probeResponse.status}`);

  const text = "开拓者，今天过得开心吗？流萤一直在这里陪着你呢。";
  const result = await synthesizeGptsovits(text, config);
  assert.equal(result.format, "wav");
  assert.ok(result.buffer.length > 44, `Audio buffer must be non-empty: ${result.buffer.length}`);
  assert.equal(result.buffer.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(result.buffer.subarray(8, 12).toString("ascii"), "WAVE");
  console.log(`POST /tts: WAV ${result.buffer.length} bytes`);

  const sessionSettings = createSessionSettings(config);
  const dispatcher = new FireflyTtsDispatcher();
  const dispatcherResult = await dispatcher.synthesize(
    { requestId: "live-voice-dispatch", speechText: text },
    sessionSettings,
  );
  assert.equal(dispatcherResult.status, "ready");
  console.log("Dispatcher: ready");

  const sessionService = new TtsSessionService(new FireflyTtsDispatcher());
  const sessionResult = await sessionService.start(
    { requestId: "live-voice-session", speechText: text },
    sessionSettings,
  );
  assert.equal(sessionResult.status, "ready");
  console.log("Session service: ready");

  const offlineEvents = [];
  const offlineResult = await new TtsSessionService().start(
    { requestId: "live-voice-offline", speechText: "离线降级测试" },
    {
      ...sessionSettings,
      gptsovits: { ...sessionSettings.gptsovits, baseUrl: "http://127.0.0.1:59998" },
    },
    (event) => offlineEvents.push(event),
  );
  assert.equal(offlineResult.status, "skipped");
  assert.ok(offlineEvents.length > 0);
  console.log("Offline fallback: skipped with observable error event");
  console.log("LIVE VOICE VERIFICATION PASSED");
}

main().catch((error) => {
  console.error("LIVE VOICE VERIFICATION FAILED:", error.message);
  process.exitCode = 1;
});
