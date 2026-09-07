import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FireflyMemoryService } from "../../../dist/main/main/character/memory/memory-service.js";
import { AgentEventBus } from "../../../dist/main/main/orchestrator/agent-events.js";
import {
  buildMusicPreferenceMemoryKey,
  MusicPreferenceService,
} from "../../../dist/main/main/runtime/music/music-preference-service.js";
import {
  registerMusicPreferenceSignalAdapter,
} from "../../../dist/main/main/runtime/music/music-preference-signals.js";
import {
  createMusicArtistSubject,
  createMusicTrackSubject,
} from "../../../dist/main/main/runtime/music/music-preference-subject.js";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testFileDir, "../../..");

function withMemory(run) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-music-preference-"));
  const memoryPath = path.join(tempDir, "memory.json");
  try {
    return run(new FireflyMemoryService(memoryPath), memoryPath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function trackSubject(title = "如果能成为萤火虫", artist = "流萤", album = "格拉默的余烬") {
  const subject = createMusicTrackSubject({ title, artist, album });
  assert.ok(subject);
  return subject;
}

function artistSubject(artist = "流萤") {
  const subject = createMusicArtistSubject(artist);
  assert.ok(subject);
  return subject;
}

function observed(id, subject, occurredAt) {
  return {
    id,
    kind: subject.type === "TRACK" ? "TRACK_EXPOSURE" : "ARTIST_EXPOSURE",
    epistemicLevel: "OBSERVED",
    polarity: "NEUTRAL",
    subject,
    source: "QQMUSIC_DESKTOP",
    occurredAt,
    evidence: {
      origin: "MUSIC_CONTEXT_EVENT",
      contextEventType: "music.track.changed",
      playerId: "QQMusic.exe",
      referenceId: `context-${id}`,
    },
  };
}

function inferred(id, subject, polarity, occurredAt, confidence = 0.8) {
  return {
    id,
    kind: "INFERRED_AFFINITY",
    epistemicLevel: "INFERRED",
    polarity,
    subject,
    source: "MAIN_FIREFLY_INFERENCE",
    occurredAt,
    confidence,
    evidence: {
      origin: "MAIN_FIREFLY_INFERENCE",
      referenceId: `inference-${id}`,
    },
  };
}

function explicit(id, subject, polarity, occurredAt) {
  return {
    id,
    kind: polarity === "POSITIVE" ? "EXPLICIT_LIKE" : "EXPLICIT_DISLIKE",
    epistemicLevel: "EXPLICIT",
    polarity,
    subject,
    source: "MAIN_FIREFLY_CHAT",
    occurredAt,
    evidence: {
      origin: "USER_EXPLICIT",
      referenceId: `utterance-${id}`,
    },
  };
}

test("A-C/F-G. passive facts remain distinct and require three observations", () => withMemory((memory) => {
  const service = new MusicPreferenceService({ memory, now: () => 1_000 });
  const track = trackSubject();
  const artist = artistSubject();

  const firstTrack = service.ingest(observed("track-1", track, 100));
  const firstArtist = service.ingest(observed("artist-1", artist, 100));
  assert.equal(firstTrack.assessment?.epistemicLevel, "OBSERVED");
  assert.equal(firstTrack.assessment?.status, "UNRESOLVED");
  assert.equal(firstArtist.assessment?.epistemicLevel, "OBSERVED");
  assert.equal(memory.list().length, 0);

  service.ingest(observed("artist-2", artist, 200));
  const third = service.ingest(observed("artist-3", artist, 300));
  assert.equal(third.assessment?.status, "LISTENING_PATTERN");
  assert.equal(third.assessment?.polarity, "NEUTRAL");
  assert.equal(third.consolidation?.action, "PERSIST_OBSERVATION_SUMMARY");
  assert.equal(memory.list().length, 1);
  assert.doesNotMatch(memory.list()[0].value, /喜欢/);
  assert.equal(memory.list()[0].metadata?.epistemicLevel, "OBSERVED");
}));

test("D-E/W. typed explicit like and dislike persist with explicit authority", () => withMemory((memory) => {
  const service = new MusicPreferenceService({ memory, now: () => 1_000 });
  const likeTrack = trackSubject("星间旅行");
  const dislikeTrack = trackSubject("坏掉的留声机");

  const liked = service.ingest(explicit("like", likeTrack, "POSITIVE", 100));
  const disliked = service.ingest(explicit("dislike", dislikeTrack, "NEGATIVE", 200));
  assert.equal(liked.assessment?.status, "EXPLICIT_PREFERENCE");
  assert.equal(liked.assessment?.confidence, 1);
  assert.equal(disliked.assessment?.polarity, "NEGATIVE");
  assert.equal(memory.get(buildMusicPreferenceMemoryKey(likeTrack.key))?.metadata?.epistemicLevel, "EXPLICIT");
  assert.match(memory.get(buildMusicPreferenceMemoryKey(likeTrack.key))?.value ?? "", /明确表示喜欢/);
  assert.match(memory.get(buildMusicPreferenceMemoryKey(dislikeTrack.key))?.value ?? "", /明确表示不喜欢/);
}));

test("H/T-U. duplicate identity and duplicate semantic replay do not reinforce or persist", () => withMemory((memory) => {
  const service = new MusicPreferenceService({ memory, now: () => 1_000 });
  const subject = artistSubject();
  const first = observed("same-id", subject, 100);
  assert.equal(service.ingest(first).accepted, true);
  assert.equal(service.ingest(first).reason, "DUPLICATE_SIGNAL");
  assert.equal(service.ingest({ ...first, id: "new-id" }).reason, "DUPLICATE_SIGNAL");
  assert.equal(service.getAssessment(subject.key)?.observationCount, 1);
  assert.equal(memory.list().length, 0);
}));

test("I/J/M/V. independent inference reinforces, stays bounded, and negative evidence reduces it", () => withMemory((memory) => {
  const service = new MusicPreferenceService({ memory, now: () => 1_000 });
  const subject = artistSubject();
  const one = service.ingest(inferred("positive-1", subject, "POSITIVE", 100));
  const two = service.ingest(inferred("positive-2", subject, "POSITIVE", 200));
  const three = service.ingest(inferred("positive-3", subject, "POSITIVE", 300));
  assert.ok(one.assessment.confidence < two.assessment.confidence);
  assert.ok(two.assessment.confidence < three.assessment.confidence);
  assert.equal(three.consolidation.action, "PERSIST_INFERRED_PREFERENCE");
  assert.ok(three.assessment.confidence <= 0.85);
  assert.equal(memory.list().length, 1);
  assert.equal(memory.list()[0].metadata?.epistemicLevel, "INFERRED");

  const reduced = service.ingest(inferred("negative-1", subject, "NEGATIVE", 400));
  assert.ok(reduced.assessment.confidence < three.assessment.confidence);
  assert.ok(reduced.assessment.confidence >= 0);
}));

test("K-L. lazy decay removes stale inferred memory but never weakens explicit truth", () => withMemory((memory) => {
  let now = 1_000;
  const service = new MusicPreferenceService({ memory, now: () => now });
  const inferredSubject = artistSubject("知更鸟");
  service.ingest(inferred("i1", inferredSubject, "POSITIVE", 100, 1));
  service.ingest(inferred("i2", inferredSubject, "POSITIVE", 200, 1));
  service.ingest(inferred("i3", inferredSubject, "POSITIVE", 300, 1));
  assert.ok(memory.get(buildMusicPreferenceMemoryKey(inferredSubject.key)));

  now = 300 + 180 * 24 * 60 * 60 * 1_000;
  const decayed = service.reconcile(inferredSubject.key, now);
  assert.ok((decayed?.confidence ?? 1) < 0.65);
  assert.equal(memory.get(buildMusicPreferenceMemoryKey(inferredSubject.key)), undefined);

  const explicitSubject = artistSubject("流萤");
  service.ingest(explicit("explicit-stable", explicitSubject, "POSITIVE", 400));
  const explicitAssessment = service.reconcile(explicitSubject.key, now + 365 * 24 * 60 * 60 * 1_000);
  assert.equal(explicitAssessment?.confidence, 1);
  assert.equal(explicitAssessment?.epistemicLevel, "EXPLICIT");
  assert.ok(memory.get(buildMusicPreferenceMemoryKey(explicitSubject.key)));
}));

test("N/O. explicit dislike supersedes inferred affinity and weak behavior cannot overwrite it", () => withMemory((memory) => {
  const service = new MusicPreferenceService({ memory, now: () => 1_000 });
  const subject = artistSubject();
  service.ingest(inferred("i1", subject, "POSITIVE", 100, 1));
  service.ingest(inferred("i2", subject, "POSITIVE", 200, 1));
  service.ingest(inferred("i3", subject, "POSITIVE", 300, 1));
  const override = service.ingest(explicit("explicit-no", subject, "NEGATIVE", 400));
  assert.equal(override.assessment?.epistemicLevel, "EXPLICIT");
  assert.equal(override.assessment?.polarity, "NEGATIVE");
  assert.equal(override.consolidation?.action, "SUPERSEDE_EXISTING_MEMORY");

  service.ingest(inferred("weak-positive", subject, "POSITIVE", 500, 0.2));
  const stored = memory.get(buildMusicPreferenceMemoryKey(subject.key));
  assert.equal(stored?.metadata?.epistemicLevel, "EXPLICIT");
  assert.equal(stored?.metadata?.polarity, "NEGATIVE");
}));

test("P/S/X. latest explicit statement is the sole current truth and updates one key", () => withMemory((memory) => {
  const service = new MusicPreferenceService({ memory, now: () => 1_000 });
  const subject = artistSubject();
  service.ingest(explicit("like-first", subject, "POSITIVE", 100));
  const latest = service.ingest(explicit("dislike-later", subject, "NEGATIVE", 200));
  assert.equal(latest.assessment?.polarity, "NEGATIVE");
  assert.equal(memory.list().length, 1);
  assert.equal(memory.list()[0].metadata?.polarity, "NEGATIVE");
  assert.match(memory.list()[0].value, /不喜欢/);

  const older = service.ingest(explicit("like-older", subject, "POSITIVE", 150));
  assert.equal(older.assessment?.polarity, "NEGATIVE");
  assert.equal(memory.list().length, 1);
}));

test("Q-R. track and artist identities stay separate with no explicit propagation", () => withMemory((memory) => {
  const service = new MusicPreferenceService({ memory, now: () => 1_000 });
  const track = trackSubject();
  const artist = artistSubject(track.artist);
  assert.notEqual(track.key, artist.key);

  service.ingest(explicit("track-like", track, "POSITIVE", 100));
  assert.ok(memory.get(buildMusicPreferenceMemoryKey(track.key)));
  assert.equal(memory.get(buildMusicPreferenceMemoryKey(artist.key)), undefined);
  assert.equal(service.getAssessment(artist.key), undefined);
}));

test("Y. consolidated preference survives restart through canonical memory.json", () => withMemory((memory, memoryPath) => {
  const subject = artistSubject();
  const firstService = new MusicPreferenceService({ memory, now: () => 1_000 });
  firstService.ingest(explicit("restart-like", subject, "POSITIVE", 100));

  const reloadedMemory = new FireflyMemoryService(memoryPath);
  const reloadedService = new MusicPreferenceService({ memory: reloadedMemory, now: () => 2_000 });
  const restored = reloadedService.getAssessment(subject.key);
  assert.equal(restored?.epistemicLevel, "EXPLICIT");
  assert.equal(restored?.polarity, "POSITIVE");
  assert.equal(reloadedMemory.list().length, 1);
}));

test("context adapter consumes only available/track-change facts; controls and playback are not evidence", () => withMemory((memory) => {
  const service = new MusicPreferenceService({ memory, now: () => 10_000 });
  const eventBus = new AgentEventBus();
  const dispose = registerMusicPreferenceSignalAdapter({ eventBus, preferenceService: service });
  const base = {
    source: "QQMUSIC_DESKTOP",
    playerId: "QQMusic.exe",
    observedAt: 100,
    timestamp: 100,
    current: {
      source: "QQMUSIC_DESKTOP",
      playerId: "QQMusic.exe",
      playbackState: "PLAYING",
      observedAt: 100,
      track: { title: "第一首", artist: "流萤", album: "星海" },
    },
  };
  eventBus.emit({ type: "music.context.available", ...base });
  const artist = artistSubject();
  assert.equal(service.getAssessment(artist.key)?.observationCount, 1);

  eventBus.emit({
    type: "music.playback.changed",
    ...base,
    observedAt: 200,
    timestamp: 200,
    previous: base.current,
    current: { ...base.current, playbackState: "PAUSED", observedAt: 200 },
  });
  assert.equal(service.getAssessment(artist.key)?.observationCount, 1);

  for (const [index, title] of [[300, "第二首"], [400, "第三首"]]) {
    eventBus.emit({
      type: "music.track.changed",
      ...base,
      observedAt: index,
      timestamp: index,
      previous: base.current,
      current: {
        ...base.current,
        observedAt: index,
        track: { title, artist: "流萤", album: "星海" },
      },
    });
  }
  assert.equal(service.getAssessment(artist.key)?.observationCount, 3);
  assert.equal(memory.list().length, 1);
  assert.equal(memory.list()[0].metadata?.status, "LISTENING_PATTERN");
  dispose();
}));

test("Z/AA-AJ. ownership stays in Main Memory with no direct RAG, tool, UI, or SubAgent dependency", () => {
  const serviceSource = fs.readFileSync(
    path.join(repoRoot, "src/main/runtime/music/music-preference-service.ts"),
    "utf8",
  );
  const adapterSource = fs.readFileSync(
    path.join(repoRoot, "src/main/runtime/music/music-preference-signals.ts"),
    "utf8",
  );
  const indexSource = fs.readFileSync(path.join(repoRoot, "src/main/index.ts"), "utf8");
  const memorySource = fs.readFileSync(
    path.join(repoRoot, "src/main/character/memory/memory-service.ts"),
    "utf8",
  );

  for (const forbidden of [
    "ToolExecutionEngine",
    "CapabilityAuthorizationPipeline",
    "TtsSessionService",
    "Live2D",
    "renderer",
    "SubAgent",
    "KnowledgeCoordinator",
    "Rag",
  ]) {
    assert.doesNotMatch(serviceSource, new RegExp(forbidden));
    assert.doesNotMatch(adapterSource, new RegExp(forbidden));
  }
  assert.match(indexSource, /new MusicPreferenceService\(\{ memory: memoryService \}\)/);
  assert.match(serviceSource, /this\.memory\.remember\(/);
  assert.doesNotMatch(serviceSource, /new FireflyMemoryService/);
  assert.doesNotMatch(serviceSource, /setInterval|setTimeout/);
  assert.match(memorySource, /MUSIC_PREFERENCE_MEMORY_DOMAIN/);
});

test("music preference records are excluded from general prompt projection", () => withMemory((memory) => {
  memory.remember("普通事实", "用户喜欢萤火虫。", "chat");
  const service = new MusicPreferenceService({ memory, now: () => 1_000 });
  const subject = artistSubject();
  service.ingest(explicit("projection-isolated", subject, "POSITIVE", 100));

  const general = memory.listForGeneralContext();
  assert.deepEqual(general.map((item) => item.key), ["普通事实"]);
  assert.doesNotMatch(memory.buildMemoryContextFromItems(general), /music\.preference/);
}));
