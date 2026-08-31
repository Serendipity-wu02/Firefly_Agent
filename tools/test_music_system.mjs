import test from "node:test";
import assert from "node:assert/strict";

import { MusicService } from "../dist/main/main/music/music-service.js";
import { MockMusicProvider } from "../dist/main/main/music/mock-music-provider.js";
import { QQMusicProvider } from "../dist/main/main/music/qqmusic-provider.js";
import { SelectionSetCache } from "../dist/main/main/music/selection-set-cache.js";
import { PlaybackSession } from "../dist/main/main/music/playback-session.js";
import { createMusicTools } from "../dist/main/main/tools/music-tools.js";
import { FireflyToolRegistry } from "../dist/main/main/tools/tool-registry.js";
import { FireflyAgentCore } from "../dist/main/main/agent/firefly-agent-core.js";

// Mock MPV player for testing that simulates IPC events without spawning external mpv binary
class MockMpvPlayer {
  constructor() {
    this.listeners = new Map();
    this.state = {
      connected: true,
      loaded: false,
      paused: false,
      position: 0,
      duration: 200,
      volume: 70,
      eofReached: false,
    };
    this.loadedUrl = null;
  }

  on(event, listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(listener);
  }

  emit(event, ...args) {
    const list = this.listeners.get(event) || [];
    for (const l of list) l(...args);
  }

  async start() {
    this.state.connected = true;
    this.emit("state", { ...this.state });
    return true;
  }

  async load(url) {
    this.loadedUrl = url;
    this.state.loaded = true;
    this.state.position = 0;
    this.state.eofReached = false;
    this.emit("state", { ...this.state });
  }

  async pause() {
    this.state.paused = true;
    this.emit("state", { ...this.state });
  }

  async resume() {
    this.state.paused = false;
    this.emit("state", { ...this.state });
  }

  async stop() {
    this.state.loaded = false;
    this.state.position = 0;
    this.emit("state", { ...this.state });
  }

  async setVolume(vol) {
    this.state.volume = vol;
    this.emit("state", { ...this.state });
  }

  setTrack(track) {
    this.state.track = track;
    this.emit("state", { ...this.state });
  }

  getState() {
    return { ...this.state };
  }

  async dispose() {
    this.state.connected = false;
    this.listeners.clear();
  }
}

test("1. 搜索与推荐标准化: Mock Provider returns standardized MusicTrack", async () => {
  const provider = new MockMusicProvider();
  const searchResults = await provider.searchTracks("萤火虫");
  assert.ok(searchResults.length >= 1);
  assert.equal(searchResults[0].name, "如果能成为萤火虫 (If I Could Be A Firefly)");
  assert.ok(Array.isArray(searchResults[0].artists));
  assert.equal(searchResults[0].artists[0], "流萤");

  const recs = await provider.getRecommendations(2);
  assert.equal(recs.length, 2);
});

test("2. QQMusicProvider 明确边界与未配置 Fallback: returns empty or graceful warning without throwing unexpected errors", async () => {
  const qqProvider = new QQMusicProvider();
  assert.equal(qqProvider.isConfigured(), false);
  assert.equal(qqProvider.id, "qqmusic");
  assert.equal(qqProvider.name, "QQ 音乐");

  const tracks = await qqProvider.searchTracks("测试");
  assert.deepEqual(tracks, [], "Unconfigured QQ provider returns empty search results gracefully");

  const recs = await qqProvider.getRecommendations();
  assert.deepEqual(recs, [], "Unconfigured QQ provider returns empty recommendations gracefully");

  const res = await qqProvider.resolvePlaybackResource({ id: "123", name: "test", artists: [] });
  assert.equal(res, null, "Unconfigured QQ provider returns null playback resource");
});

test("3. SelectionSetCache: Numbered alias indexing & expiration", () => {
  const cache = new SelectionSetCache(1000); // 1s TTL
  const mockTracks = [
    { id: "t1", name: "Song 1", artists: ["A"] },
    { id: "t2", name: "Song 2", artists: ["B"] },
  ];

  cache.setTracks(mockTracks);
  assert.equal(cache.size(), 2);
  assert.equal(cache.getByIndex(1)?.id, "t1");
  assert.equal(cache.getByIndex(2)?.id, "t2");
  assert.equal(cache.getByIndex(3), null);
  assert.equal(cache.getById("t1")?.name, "Song 1");
});

test("4. PlaybackSession: Queue navigation and loop modes", () => {
  const session = new PlaybackSession();
  const mockTracks = [
    { id: "t1", name: "Song 1", artists: ["A"] },
    { id: "t2", name: "Song 2", artists: ["B"] },
    { id: "t3", name: "Song 3", artists: ["C"] },
  ];

  const first = session.setQueue(mockTracks, 0);
  assert.equal(first?.id, "t1");
  assert.equal(session.getCurrentIndex(), 0);

  // Next in list mode
  const second = session.nextTrack();
  assert.equal(second?.id, "t2");
  assert.equal(session.getCurrentIndex(), 1);

  const third = session.nextTrack();
  assert.equal(third?.id, "t3");

  // Loop back to start in list mode
  const looped = session.nextTrack();
  assert.equal(looped?.id, "t1");
  assert.equal(session.getCurrentIndex(), 0);

  // Single loop mode
  session.setLoopMode("single");
  assert.equal(session.nextTrack()?.id, "t1");
});

test("5. MusicService -> Provider -> Player: Complete search, cache, play cycle", async () => {
  const provider = new MockMusicProvider();
  const mpv = new MockMpvPlayer();
  const service = new MusicService({ provider, mpv });
  await service.start();

  const tracks = await service.search("星空");
  assert.ok(tracks.length >= 1);

  // Play selection by numeric index 1
  const played = await service.playSelection(1);
  assert.equal(played, true);
  assert.ok(mpv.loadedUrl.includes("mock-firefly-song-2.mp3"));

  const snap = service.getSnapshot();
  assert.equal(snap.currentTrack?.name, "星空下的橡木蛋糕卷");
  assert.equal(snap.playbackState.loaded, true);

  // Pause & resume
  await service.pause();
  assert.equal(service.getSnapshot().playbackState.paused, true);
  await service.resume();
  assert.equal(service.getSnapshot().playbackState.paused, false);

  // Volume
  await service.setVolume(85);
  assert.equal(service.getSnapshot().playbackState.volume, 85);

  await service.shutdown();
});

test("6. EOF auto advance: When player reaches EOF, next track in session is loaded", async () => {
  const provider = new MockMusicProvider();
  const mpv = new MockMpvPlayer();
  const service = new MusicService({ provider, mpv });
  await service.start();

  const tracks = await service.getRecommendations();
  await service.playQueue(tracks, 0);

  assert.equal(service.getSnapshot().currentTrack?.id, "mock-track-1");

  // Simulate MPV reaching EOF
  mpv.emit("eof");
  // Allow promise to settle
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(service.getSnapshot().currentTrack?.id, "mock-track-2");
  await service.shutdown();
});

test("7. Music Tools: ToolDefinition execution via MusicService", async () => {
  const provider = new MockMusicProvider();
  const mpv = new MockMpvPlayer();
  const service = new MusicService({ provider, mpv });
  await service.start();

  const tools = createMusicTools(service);
  const searchTool = tools.find((t) => t.id === "music_search");
  const playTool = tools.find((t) => t.id === "music_play");
  const statusTool = tools.find((t) => t.id === "music_status");
  const controlTool = tools.find((t) => t.id === "music_control");

  // Execute search tool
  const searchRes = JSON.parse(await searchTool.execute({ query: "萤火虫" }));
  assert.equal(searchRes.ok, true);
  assert.ok(searchRes.tracks.length >= 1);
  assert.equal(searchRes.tracks[0].index, 1);

  // Execute play tool with selection="1"
  const playRes = JSON.parse(await playTool.execute({ selection: "1" }));
  assert.equal(playRes.ok, true);
  assert.equal(playRes.action, "playing");

  // Execute status tool
  const statusRes = JSON.parse(await statusTool.execute({}));
  assert.equal(statusRes.ok, true);
  assert.equal(statusRes.isPlaying, true);

  // Execute control tool pause
  const pauseRes = JSON.parse(await controlTool.execute({ action: "pause" }));
  assert.equal(pauseRes.ok, true);
  assert.equal(pauseRes.status, "paused");

  await service.shutdown();
});

test("8. FireflyAgentCore calling Music Tools: End-to-end multi-turn chat with music tool", async () => {
  const provider = new MockMusicProvider();
  const mpv = new MockMpvPlayer();
  const musicService = new MusicService({ provider, mpv });
  await musicService.start();

  const toolRegistry = new FireflyToolRegistry();
  for (const t of createMusicTools(musicService)) {
    toolRegistry.register(t);
  }

  // Mock LLM provider that decides to search music, then play music
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
            content: "好的开拓者，我来帮你搜索萤火虫相关的歌曲！",
            toolCalls: [{ id: "call_search_1", name: "music_search", arguments: { query: "萤火虫" } }],
          },
        };
      } else if (round === 2) {
        return {
          message: {
            role: "assistant",
            content: "找到歌曲了，现在为你播放第 1 首！",
            toolCalls: [{ id: "call_play_1", name: "music_play", arguments: { selection: "1" } }],
          },
        };
      }
      return {
        message: {
          role: "assistant",
          content: "（音乐已响起）开拓者，《如果能成为萤火虫》正在为你播放中，希望你能喜欢！",
        },
      };
    },
  };

  const core = new FireflyAgentCore({ provider: mockLlm, toolRegistry });
  const result = await core.run({ userPrompt: "放一首流萤的歌" });

  assert.equal(result.status, "completed");
  assert.equal(result.toolCallsCount, 2);
  assert.equal(result.roundsCount, 3);
  assert.ok(result.finalText.includes("如果能成为萤火虫"));
  assert.equal(musicService.getSnapshot().currentTrack?.name, "如果能成为萤火虫 (If I Could Be A Firefly)");
  assert.equal(musicService.getSnapshot().playbackState.loaded, true);

  await musicService.shutdown();
});
