import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AgentEventBus } from "../../../dist/main/main/orchestrator/agent-events.js";
import { ContextManager } from "../../../dist/main/main/orchestrator/context/context-manager.js";
import { MusicContextSlot } from "../../../dist/main/main/orchestrator/context/context-slots.js";
import { FireflyAgentCore } from "../../../dist/main/main/orchestrator/firefly-agent-core.js";
import { MusicContextService } from "../../../dist/main/main/music/music-context-service.js";
import {
  QQ_MUSIC_SESSION_ID,
  QQMusicDesktopBridge,
} from "../../../dist/main/main/music/qqmusic-desktop-bridge.js";
import { FireflyToolRegistry } from "../../../dist/main/main/orchestrator/tools/registry/tool-registry.js";
import type { AgentEvent } from "../../../dist/main/shared/agent-types.js";
import type { MusicContextEvent } from "../../../dist/main/shared/music-context-types.js";

function isMusicEvent(event: AgentEvent): event is MusicContextEvent {
  return event.type.startsWith("music.");
}

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testFileDir, "../../..");

function createFixture(initialState = {}) {
  const state = {
    ok: true,
    found: true,
    appId: QQ_MUSIC_SESSION_ID,
    title: "如果能成为萤火虫",
    artist: "流萤 / 知更鸟",
    albumTitle: "格拉默的余烬",
    playbackStatus: "Playing",
    position: 12,
    duration: 240,
    ...initialState,
  };
  const bridge = new QQMusicDesktopBridge({
    executor: async (action) => {
      if (action === "get-state") return { ...state };
      return { ok: true, found: true, appId: QQ_MUSIC_SESSION_ID };
    },
    pollIntervalMs: 60_000,
  });
  const eventBus = new AgentEventBus();
  const events: AgentEvent[] = [];
  eventBus.onAny((event) => {
    if (isMusicEvent(event)) events.push(event);
  });
  let currentTime = 10_000;
  const service = new MusicContextService({
    desktopBridge: bridge,
    eventBus,
    now: () => ++currentTime,
  });

  return { state, bridge, eventBus, events, service };
}

test("1. QQ Music observation is normalized, serializable, immutable, and timestamped", async () => {
  const { bridge, service } = createFixture({
    title: "  如果能   成为萤火虫  ",
    artist: "  流萤   / 知更鸟 ",
    albumTitle: "  格拉默的余烬 ",
  });
  service.start();
  await bridge.poll();

  const snapshot = service.getSnapshot();
  assert.equal(snapshot?.source, "QQMUSIC_DESKTOP");
  assert.equal(snapshot?.playerId, QQ_MUSIC_SESSION_ID);
  assert.equal(snapshot?.sessionId, undefined);
  assert.equal(snapshot?.playbackState, "PLAYING");
  assert.deepEqual(snapshot?.track, {
    title: "如果能 成为萤火虫",
    artist: "流萤 / 知更鸟",
    album: "格拉默的余烬",
  });
  assert.ok((snapshot?.observedAt ?? 0) > 10_000);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot?.track));
  const frozenTrack = snapshot?.track;
  assert.ok(frozenTrack);
  assert.throws(() => {
    Object.assign(frozenTrack, { title: "不应修改" });
  }, TypeError);
});

test("2. Exact QQMusic identity is required before any context is ingested", async () => {
  const { bridge, events, service } = createFixture({ appId: "QQMusic.exe.preview" });
  service.start();
  await bridge.poll();

  const snapshot = service.getSnapshot();
  assert.equal(snapshot?.playbackState, "UNKNOWN");
  assert.equal(snapshot?.track, undefined);
  assert.equal(events.length, 0);
});

test("3. Repeated semantic snapshots refresh observation time without event spam", async () => {
  const { state, bridge, events, service } = createFixture();
  service.start();
  await bridge.poll();
  assert.deepEqual(events.map((event) => event.type), ["music.context.available"]);
  const firstObservedAt = service.getSnapshot()?.observedAt;

  events.length = 0;
  state.position += 5;
  await bridge.poll();

  assert.equal(events.length, 0);
  assert.ok((service.getSnapshot()?.observedAt ?? 0) > (firstObservedAt ?? 0));
});

test("4. Track and playback transitions publish one event each in deterministic order", async () => {
  const { state, bridge, events, service } = createFixture();
  service.start();
  await bridge.poll();
  events.length = 0;

  state.title = "星空下的橡木蛋糕卷";
  state.artist = "流萤";
  state.albumTitle = "星海巡游";
  state.playbackStatus = "Paused";
  await bridge.poll();

  assert.deepEqual(events.map((event) => event.type), [
    "music.track.changed",
    "music.playback.changed",
  ]);
  const trackChanged = events[0];
  const playbackChanged = events[1];
  assert.ok(trackChanged && trackChanged.type === "music.track.changed");
  assert.ok(playbackChanged && playbackChanged.type === "music.playback.changed");
  assert.equal(trackChanged.previous.track?.title, "如果能成为萤火虫");
  assert.equal(trackChanged.current.track?.title, "星空下的橡木蛋糕卷");
  assert.equal(playbackChanged.previous.playbackState, "PLAYING");
  assert.equal(playbackChanged.current.playbackState, "PAUSED");

  events.length = 0;
  await bridge.poll();
  assert.equal(events.length, 0);
});

test("5. Session appearance and disappearance use only availability events", async () => {
  const { state, bridge, events, service } = createFixture({ found: false });
  service.start();
  await bridge.poll();
  assert.equal(events.length, 0);

  state.found = true;
  await bridge.poll();
  assert.deepEqual(events.map((event) => event.type), ["music.context.available"]);

  events.length = 0;
  state.found = false;
  await bridge.poll();
  assert.deepEqual(events.map((event) => event.type), ["music.context.unavailable"]);
  const unavailable = events[0];
  assert.ok(unavailable && unavailable.type === "music.context.unavailable");
  assert.equal(unavailable.current.playbackState, "UNKNOWN");
});

test("6. The service uses the existing bridge stream once and disposes without a timer", async () => {
  const { state, bridge, events, service } = createFixture();
  service.start();
  service.start();
  assert.equal(bridge.listenerCount("state"), 1);

  await bridge.poll();
  service.dispose();
  assert.equal(bridge.listenerCount("state"), 0);
  const eventCountBeforePoll = events.length;
  state.title = "不会被读取";
  await bridge.poll();
  assert.equal(events.length, eventCountBeforePoll);
  assert.equal(service.getSnapshot(), undefined);

  const source = fs.readFileSync(
    path.join(repoRoot, "src", "main", "music", "music-context-service.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /setInterval|setTimeout/);
});

test("7. A bridge read failure stays contained and produces no fabricated fact", async () => {
  const bridge = new QQMusicDesktopBridge({
    executor: async () => {
      throw new Error("GSMTC temporary read failure");
    },
  });
  const eventBus = new AgentEventBus();
  const events: MusicContextEvent[] = [];
  eventBus.onAny((event) => {
    if (isMusicEvent(event)) events.push(event);
  });
  const service = new MusicContextService({ desktopBridge: bridge, eventBus });
  service.start();

  await assert.doesNotReject(() => bridge.poll());
  assert.equal(service.getSnapshot()?.playbackState, "UNKNOWN");
  assert.equal(events.length, 0);
});

test("8. Main Firefly reads the transient snapshot through ContextManager without prompt injection", async () => {
  const { bridge, service } = createFixture();
  service.start();
  await bridge.poll();

  const contextManager = new ContextManager({
    customSlots: [new MusicContextSlot(service)],
  });
  const core = new FireflyAgentCore({
    toolRegistry: new FireflyToolRegistry(),
    contextManager,
  });
  assert.equal(
    core.getContextManager().getMusicContextSnapshot()?.track?.title,
    "如果能成为萤火虫",
  );

  const messages = await contextManager.buildInitialMessagesWithSlots({
    userPrompt: "你好",
  });
  assert.equal(messages.some((message) => message.content.includes("如果能成为萤火虫")), false);
});

test("9. Passive observation has no execution, memory, RAG, TTS, Live2D, or SubAgent ownership", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "src", "main", "music", "music-context-service.ts"),
    "utf8",
  );
  assert.match(source, /AgentEventBus/);
  assert.doesNotMatch(source, /ToolExecutionEngine|memoryService|rag|tts|live2d|SubAgent/i);
});
