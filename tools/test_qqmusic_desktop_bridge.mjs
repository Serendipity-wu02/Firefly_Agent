import test from "node:test";
import assert from "node:assert/strict";

import { QQMusicDesktopBridge } from "../dist/main/main/runtime/music/qqmusic-desktop-bridge.js";
import { MusicService } from "../dist/main/main/runtime/music/music-service.js";
import { createMusicTools } from "../dist/main/main/tools/music-tools.js";
import { FireflyToolRegistry } from "../dist/main/main/tools/tool-registry.js";
import { FireflyAgentCore } from "../dist/main/main/orchestrator/firefly-agent-core.js";

// Helper to create mock GSMTC executor
function createMockGsmtcExecutor(initialState = {}) {
  const state = {
    ok: true,
    found: true,
    appId: "QQMusic.exe",
    title: "如果能成为萤火虫",
    artist: "流萤 / 知更鸟",
    albumTitle: "格拉默的余烬",
    hasThumbnail: true,
    playbackStatus: "Playing",
    position: 45.5,
    duration: 215.0,
    canPlay: false,
    canPause: true,
    canNext: true,
    canPrev: true,
    ...initialState,
  };

  const executedActions = [];

  const executor = async (action) => {
    executedActions.push(action);
    if (action === "get-state") {
      return { ...state };
    }
    if (action === "play") {
      state.playbackStatus = "Playing";
      state.canPlay = false;
      state.canPause = true;
      return { ok: true, action: "play" };
    }
    if (action === "pause") {
      state.playbackStatus = "Paused";
      state.canPlay = true;
      state.canPause = false;
      return { ok: true, action: "pause" };
    }
    if (action === "next") {
      state.title = "星空下的橡木蛋糕卷";
      state.artist = "流萤";
      state.albumTitle = "星海巡游";
      state.position = 0.0;
      return { ok: true, action: "next" };
    }
    if (action === "prev") {
      state.title = "使一颗心免于哀伤";
      state.artist = "知更鸟";
      state.albumTitle = "匹诺康尼之声";
      state.position = 0.0;
      return { ok: true, action: "prev" };
    }
    return { ok: true, action };
  };

  return { executor, state, executedActions };
}

test("1. Session Discovery & Media Properties Mapping", async () => {
  const { executor } = createMockGsmtcExecutor({
    title: "サヨナラは言わないでさ (COVER版)",
    artist: "Kotoha",
    albumTitle: "サヨナラは言わないでさ (Cover)",
    duration: 228.8,
    hasThumbnail: true,
  });

  const bridge = new QQMusicDesktopBridge({ executor });
  const snapshot = await bridge.poll();

  assert.equal(snapshot.available, true);
  assert.equal(snapshot.playerState, "available");
  assert.ok(snapshot.track);
  assert.equal(snapshot.track.name, "サヨナラは言わないでさ (COVER版)");
  assert.equal(snapshot.track.artists[0], "Kotoha");
  assert.equal(snapshot.track.album, "サヨナラは言わないでさ (Cover)");
  assert.equal(snapshot.track.durationMs, 228800);
  assert.equal(snapshot.track.extra?.hasThumbnail, true);
});

test("2. Playback Status Mapping: Playing vs Paused vs Stopped", async () => {
  // Test Playing
  const { executor: playingExec } = createMockGsmtcExecutor({ playbackStatus: "Playing" });
  const playingBridge = new QQMusicDesktopBridge({ executor: playingExec });
  const playingSnap = await playingBridge.poll();
  assert.equal(playingSnap.playbackState.loaded, true);
  assert.equal(playingSnap.playbackState.paused, false);

  // Test Paused
  const { executor: pausedExec } = createMockGsmtcExecutor({ playbackStatus: "Paused" });
  const pausedBridge = new QQMusicDesktopBridge({ executor: pausedExec });
  const pausedSnap = await pausedBridge.poll();
  assert.equal(pausedSnap.playbackState.loaded, true);
  assert.equal(pausedSnap.playbackState.paused, true);

  // Test Closed/Stopped
  const { executor: closedExec } = createMockGsmtcExecutor({ playbackStatus: "Closed", found: false });
  const closedBridge = new QQMusicDesktopBridge({ executor: closedExec });
  const closedSnap = await closedBridge.poll();
  assert.equal(closedSnap.available, false);
  assert.equal(closedSnap.playerState, "unavailable");
  assert.equal(closedSnap.playbackState.connected, false);
});

test("3. Timeline Mapping: Position and Duration", async () => {
  const { executor } = createMockGsmtcExecutor({ position: 120.4, duration: 240.0 });
  const bridge = new QQMusicDesktopBridge({ executor });
  const snap = await bridge.poll();

  assert.equal(snap.playbackState.position, 120.4);
  assert.equal(snap.playbackState.duration, 240.0);
});

test("4. Playback Controls: Pause, Play, Next, Prev", async () => {
  const { executor, executedActions } = createMockGsmtcExecutor();
  const bridge = new QQMusicDesktopBridge({ executor });
  await bridge.poll();

  // Pause
  const pauseOk = await bridge.pause();
  assert.equal(pauseOk, true);
  assert.ok(executedActions.includes("pause"));
  assert.equal(bridge.getSnapshot().playbackState.paused, true);

  // Play
  const playOk = await bridge.play();
  assert.equal(playOk, true);
  assert.ok(executedActions.includes("play"));
  assert.equal(bridge.getSnapshot().playbackState.paused, false);

  // Next
  const nextOk = await bridge.next();
  assert.equal(nextOk, true);
  assert.ok(executedActions.includes("next"));

  // Prev
  const prevOk = await bridge.prev();
  assert.equal(prevOk, true);
  assert.ok(executedActions.includes("prev"));
});

test("5. Unavailable Session & Graceful Degradation", async () => {
  const executor = async () => ({ ok: true, found: false, error: "QQ_MUSIC_SESSION_NOT_FOUND" });
  const bridge = new QQMusicDesktopBridge({ executor });
  const snap = await bridge.poll();

  assert.equal(snap.available, false);
  assert.equal(snap.playerState, "unavailable");
  assert.equal(snap.track, undefined);
  assert.equal(snap.playbackState.connected, false);
});

test("6. Malformed Data & Execution Error Handling", async () => {
  const executor = async () => {
    throw new Error("PowerShell process timeout");
  };
  const bridge = new QQMusicDesktopBridge({ executor });
  const snap = await bridge.poll();

  assert.equal(snap.available, false);
  assert.equal(snap.playerState, "unavailable");
  assert.equal(snap.playbackState.connected, false);
});

test("7. MusicService Integration with QQMusicDesktopBridge", async () => {
  const { executor } = createMockGsmtcExecutor({
    title: "裁影为戏",
    artist: "三无Marblue/国风引力",
    albumTitle: "裁影为戏",
    playbackStatus: "Playing",
  });

  const desktopBridge = new QQMusicDesktopBridge({ executor });
  const service = new MusicService({ desktopBridge });
  await service.start();

  const snap = service.getSnapshot();
  assert.equal(snap.backendState, "ready");
  assert.equal(snap.playerState, "available");
  assert.equal(snap.currentTrack?.name, "裁影为戏");
  assert.equal(snap.currentTrack?.artists[0], "三无Marblue/国风引力");
  assert.equal(snap.playbackState.paused, false);

  // Pause via MusicService
  await service.pause();
  assert.equal(service.getSnapshot().playbackState.paused, true);

  // Resume via MusicService
  await service.resume();
  assert.equal(service.getSnapshot().playbackState.paused, false);

  await service.shutdown();
});

test("8. MusicTools Integration: Querying & Controlling QQ Music via Agent Tools", async () => {
  const { executor } = createMockGsmtcExecutor({
    title: "Pasta",
    artist: "New Rules",
    albumTitle: "Pasta",
    playbackStatus: "Playing",
  });

  const desktopBridge = new QQMusicDesktopBridge({ executor });
  const service = new MusicService({ desktopBridge });
  await service.start();

  const tools = createMusicTools(service);
  const statusTool = tools.find((t) => t.id === "music_status");
  const controlTool = tools.find((t) => t.id === "music_control");

  // Status tool query
  const statusRes = JSON.parse(await statusTool.execute({}));
  assert.equal(statusRes.ok, true);
  assert.equal(statusRes.isPlaying, true);
  assert.equal(statusRes.currentTrack.name, "Pasta");
  assert.equal(statusRes.currentTrack.artists, "New Rules");

  // Control tool pause
  const pauseRes = JSON.parse(await controlTool.execute({ action: "pause" }));
  assert.equal(pauseRes.ok, true);
  assert.equal(pauseRes.status, "paused");

  // Control tool resume
  const resumeRes = JSON.parse(await controlTool.execute({ action: "resume" }));
  assert.equal(resumeRes.ok, true);
  assert.equal(resumeRes.status, "playing");

  await service.shutdown();
});

test("9. FireflyAgentCore + QQ Music Desktop Bridge: End-to-End Chat Flow", async () => {
  const { executor } = createMockGsmtcExecutor({
    title: "如果能成为萤火虫",
    artist: "流萤",
    albumTitle: "格拉默的余烬",
    playbackStatus: "Playing",
  });

  const desktopBridge = new QQMusicDesktopBridge({ executor });
  const service = new MusicService({ desktopBridge });
  await service.start();

  const toolRegistry = new FireflyToolRegistry();
  for (const t of createMusicTools(service)) {
    toolRegistry.register(t);
  }

  // LLM decides to call music_status
  let round = 0;
  const mockLlm = {
    id: "mock",
    name: "Mock LLM",
    capabilities: { supportsNativeToolCalling: true, supportsStreaming: false },
    getConfig: () => ({ provider: "local", baseUrl: "", apiKey: "", model: "mock", temperature: 0.7, enableStreaming: false }),
    generateCompletion: async (request) => {
      round++;
      if (round === 1) {
        return {
          message: {
            role: "assistant",
            content: "好的开拓者，我来查看当前正在播放什么歌曲！",
            toolCalls: [{ id: "call_status_1", name: "music_status", arguments: {} }],
          },
        };
      }
      // Inspect tool result
      const toolMsg = request.messages.find((m) => m.role === "tool");
      const parsed = JSON.parse(toolMsg?.content || "{}");
      return {
        message: {
          role: "assistant",
          content: `开拓者，当前正在播放的是《${parsed.currentTrack?.name}》（歌手：${parsed.currentTrack?.artists}），旋律很优美呢！`,
        },
      };
    },
  };

  const core = new FireflyAgentCore({ provider: mockLlm, toolRegistry });
  const result = await core.run({ userPrompt: "现在在听什么？" });

  assert.equal(result.status, "completed");
  assert.equal(result.toolCallsCount, 1);
  assert.ok(result.finalText.includes("如果能成为萤火虫"));
  assert.ok(result.finalText.includes("流萤"));

  await service.shutdown();
});
