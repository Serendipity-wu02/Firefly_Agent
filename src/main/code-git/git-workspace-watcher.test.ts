import { describe, expect, it, onTestFailed, vi } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { createCodeGitIgnoredPredicate, createGitWorkspaceWatcher, type NativeEventEvidence, type WorkspaceFsWatcher } from "./git-workspace-watcher";

function nativeEvidenceHarness(debounceMs: number) {
  const events: NativeEventEvidence[] = [];
  const callbacks: { fireId: number | undefined; sequences: number[]; sessions: readonly string[] }[] = [];
  let phase = "setup";
  const changed = vi.fn((sessions: readonly string[]) => {
    const fireId = events.at(-1)?.fireId;
    callbacks.push({ fireId, sequences: events.filter((event) => event.stage === "fire" && event.fireId === fireId).map((event) => event.sequence), sessions });
  });
  const errors = vi.fn();
  const watcher = createGitWorkspaceWatcher({
    onWorkspaceChanged: changed, onError: errors, debounceMs,
    diagnostics: { phase: () => phase, record: (event) => events.push(event) },
  });
  onTestFailed(() => console.error("[watcher-failure-provenance]", JSON.stringify({ phase, events, callbacks, errors: errors.mock.calls.map(([error]) => String(error)) }, null, 2)));
  return {
    watcher, changed, errors, events,
    phase: (value: string) => { phase = value; },
    async firedFor(filename: string) {
      await vi.waitFor(() => expect(events.some((event) => event.stage === "fire" && event.phase === phase && (event.candidate === filename || event.classification === "UNCLASSIFIED"))).toBe(true));
    },
    assertFiltered(directory: string) {
      const known = events.filter((event) => event.stage === "native" && event.candidate !== null && (event.candidate === directory || event.candidate.startsWith(`${directory}${path.sep}`)));
      expect(known.length > 0 || events.some((event) => event.stage === "native" && event.phase === phase && event.classification === "UNCLASSIFIED")).toBe(true);
      for (const event of known) {
        expect(event).toMatchObject({ classification: "IGNORED", ignored: true });
        expect(events.filter((entry) => entry.sequence === event.sequence)).toEqual([event]);
      }
    },
    assertChains() {
      expect(errors).not.toHaveBeenCalled();
      const fires = events.filter((event) => event.stage === "fire");
      expect(new Set(fires.map((event) => event.fireId)).size).toBe(changed.mock.calls.length);
      for (const event of fires) {
        const chain = events.filter((entry) => entry.sequence === event.sequence);
        expect(chain.map((entry) => entry.stage)).toEqual(["native", "schedule", "fire"]);
        expect(event.classification).not.toBe("IGNORED");
        expect(chain[1].scheduleId).toBe(event.scheduleId);
      }
      for (const callback of callbacks) {
        expect(callback.fireId).toBeDefined();
        expect(callback.sequences.length).toBeGreaterThan(0);
      }
    },
  };
}

function createWatcherHarness() {
  const listeners = new Map<string, (value?: unknown) => void>();
  const watcher: WorkspaceFsWatcher = {
    on: vi.fn((event: string, listener: (value?: unknown) => void) => {
      listeners.set(event, listener);
      return watcher;
    }),
    close: vi.fn(async () => undefined),
  };
  return { watcher, emit: (event: string, value?: unknown) => listeners.get(event)?.(value) };
}

describe("GitWorkspaceWatcher", () => {
  it("shares one watcher and broadcasts one debounced change to every session in a workspace", async () => {
    vi.useFakeTimers();
    const harness = createWatcherHarness();
    const createWatcher = vi.fn(() => harness.watcher);
    const changed = vi.fn();
    const watcher = createGitWorkspaceWatcher({ createWatcher, onWorkspaceChanged: changed, onError: vi.fn() });

    await watcher.subscribe({ sessionId: "s1", workspaceRoot: "C:\\repo", gitDir: "C:\\repo\\.git" });
    await watcher.subscribe({ sessionId: "s2", workspaceRoot: "C:\\repo", gitDir: "C:\\repo\\.git" });
    harness.emit("change", "C:\\repo\\src\\a.ts");
    harness.emit("change", "C:\\repo\\.git\\index");

    expect(createWatcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(299);
    expect(changed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(changed).toHaveBeenCalledWith(["s1", "s2"]);
    vi.useRealTimers();
  });

  it("keeps the shared watcher until the last session leaves", async () => {
    const harness = createWatcherHarness();
    const watcher = createGitWorkspaceWatcher({ createWatcher: () => harness.watcher, onWorkspaceChanged: vi.fn(), onError: vi.fn() });

    await watcher.subscribe({ sessionId: "s1", workspaceRoot: "C:\\repo", gitDir: "C:\\repo\\.git" });
    await watcher.subscribe({ sessionId: "s2", workspaceRoot: "C:\\repo", gitDir: "C:\\repo\\.git" });
    await watcher.unsubscribe("s1");
    expect(harness.watcher.close).not.toHaveBeenCalled();
    await watcher.unsubscribe("s2");
    expect(harness.watcher.close).toHaveBeenCalledTimes(1);
  });

  it("keeps a session watched until every consumer releases its subscription", async () => {
    const harness = createWatcherHarness();
    const watcher = createGitWorkspaceWatcher({ createWatcher: () => harness.watcher, onWorkspaceChanged: vi.fn(), onError: vi.fn() });

    await watcher.subscribe({ sessionId: "s1", workspaceRoot: "C:\\repo", gitDir: "C:\\repo\\.git" });
    await watcher.subscribe({ sessionId: "s1", workspaceRoot: "C:\\repo", gitDir: "C:\\repo\\.git" });
    await watcher.unsubscribe("s1");
    expect(harness.watcher.close).not.toHaveBeenCalled();
    await watcher.unsubscribe("s1");
    expect(harness.watcher.close).toHaveBeenCalledTimes(1);
  });

  it("keeps HEAD, index and refs while ignoring noisy git object paths", () => {
    const ignored = createCodeGitIgnoredPredicate({ workspaceRoot: "C:\\repo", gitDir: "C:\\repo\\.git" });

    expect(ignored("C:\\repo\\node_modules\\x.js")).toBe(true);
    expect(ignored("C:\\repo\\.git\\objects\\aa\\hash")).toBe(true);
    expect(ignored("C:\\repo\\.git\\HEAD")).toBe(false);
    expect(ignored("C:\\repo\\.git\\index")).toBe(false);
    expect(ignored("C:\\repo\\.git\\refs\\heads\\main")).toBe(false);
  });

  it("ignores release output and worktree directories that git does not track", () => {
    const ignored = createCodeGitIgnoredPredicate({ workspaceRoot: "C:\\repo", gitDir: "C:\\repo\\.git" });

    expect(ignored("C:\\repo\\release\\win-unpacked\\app.asar")).toBe(true);
    expect(ignored("C:\\repo\\release-verify\\win-unpacked\\app.asar")).toBe(true);
    expect(ignored("C:\\repo\\release-verify-fc\\win-unpacked\\app.asar")).toBe(true);
    expect(ignored("C:\\repo\\.worktrees\\task-todo-lsp\\src\\a.ts")).toBe(true);
    expect(ignored("C:\\repo\\tmp\\scratch.txt")).toBe(true);
  });
});

it("native assertions accept an attributed unknown fire but reject a misclassified known object", async () => {
  const evidence = nativeEvidenceHarness(80);
  const root = path.resolve("synthetic-workspace");
  evidence.phase("unknown-only");
  const event: NativeEventEvidence = {
    sequence: 1, timestamp: 1, recordedAt: 1, phase: "unknown-only", eventType: "change",
    filename: null, filenameType: "null", classification: "UNCLASSIFIED", candidate: null,
    ignored: null, watchRoot: root, stage: "native",
  };
  expect(() => evidence.assertFiltered(path.join(root, ".git", "objects"))).toThrow();
  evidence.events.push(event, { ...event, stage: "schedule", scheduleId: 1 }, { ...event, stage: "fire", scheduleId: 1, fireId: 1 });
  evidence.changed(["s1"]);
  await evidence.firedFor(path.join(root, "a.ts"));
  evidence.assertFiltered(path.join(root, ".git", "objects"));
  evidence.assertChains();
  evidence.events.push({ ...event, sequence: 2, filename: "hash", filenameType: "string", candidate: path.join(root, ".git", "objects", "hash"), ignored: false, classification: "MEANINGFUL" });
  expect(() => evidence.assertFiltered(path.join(root, ".git", "objects"))).toThrow();
  await evidence.watcher.dispose();
});

// 原生递归监视只在支持内核递归的平台上有效，其余平台跳过实盘验证
const itNative = process.platform === "win32" || process.platform === "darwin" ? it : it.skip;

describe("GitWorkspaceWatcher 原生递归监视（真实文件系统）", () => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it.runIf(process.platform === "win32")("8.3 路径监视工作区与外部 gitDir，保留忽略规则并关闭句柄", async (context) => {
    const base = mkdtempSync(path.join(tmpdir(), "firefly watcher long directory "));
    const evidence = nativeEvidenceHarness(20);
    const { changed, errors, watcher: activeWatcher } = evidence;
    let phase = "short-path-initialization";
    const started = performance.now();
    try {
      if (!process.env.ComSpec) throw new Error("ComSpec is required for the Windows short-path fixture");
      const { stdout } = await promisify(execFile)(process.env.ComSpec, ["/d", "/s", "/c", 'for %I in ("%FIREFLY_WATCH_TEST_ROOT%") do @echo %~fsI'], {
        env: { ...process.env, FIREFLY_WATCH_TEST_ROOT: base },
        encoding: "utf8",
        windowsHide: true,
        windowsVerbatimArguments: true,
        signal: context.signal,
        timeout: 5000,
      });
      const shortBase = stdout.trim();
      expect(realpathSync.native(shortBase)).toBe(realpathSync.native(base));
      if (shortBase === base) context.skip("测试卷未提供 8.3 短路径");
      phase = "subscribe";
      const root = path.join(shortBase, "workspace");
      const gitDir = path.join(shortBase, "metadata");
      mkdirSync(root);
      mkdirSync(gitDir);
      await activeWatcher.subscribe({ sessionId: "short-path", workspaceRoot: root, gitDir });
      phase = "workspace-event";
      evidence.phase(phase);
      writeFileSync(path.join(root, "file.txt"), "public fixture");
      await evidence.firedFor(path.join(root, "file.txt"));
      phase = "metadata-event";
      evidence.phase(phase);
      writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n");
      await evidence.firedFor(path.join(gitDir, "HEAD"));
      phase = "ignored-event";
      evidence.phase(phase);
      mkdirSync(path.join(root, "node_modules"));
      writeFileSync(path.join(root, "node_modules", "ignored.txt"), "ignored");
      await sleep(150);
      evidence.assertFiltered(path.join(root, "node_modules"));
      phase = "close";
      await activeWatcher.dispose();
      const callsAtClose = changed.mock.calls.length;
      writeFileSync(path.join(root, "after-close.txt"), "closed");
      await sleep(150);
      expect(changed).toHaveBeenCalledTimes(callsAtClose);
      evidence.assertChains();
      expect(errors).not.toHaveBeenCalled();
      phase = "complete";
    } finally {
      await activeWatcher.dispose();
      rmSync(base, { recursive: true, force: true });
      if (process.env.FIREFLY_VITEST_DIAGNOSTICS) console.info("[watch-fixture]", { phase, durationMs: performance.now() - started });
    }
  }, 15000);

  itNative("原生事件按路径分类并关联通知，未知事件保留保守通知", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "firefly-watch-"));
    const evidence = nativeEvidenceHarness(80);
    const tracePhase = evidence.phase;
    tracePhase("setup");
    const gitDir = path.join(root, ".git");
    mkdirSync(path.join(gitDir, "refs", "heads"), { recursive: true });
    writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n");
    const { watcher, changed } = evidence;

    try {
      await watcher.subscribe({ sessionId: "s1", workspaceRoot: root, gitDir });
      await sleep(200); // 等内核监视句柄完成注册

      tracePhase("source-write");
      writeFileSync(path.join(root, "a.ts"), "1");
      await sleep(400);
      await evidence.firedFor(path.join(root, "a.ts"));
      expect(changed).toHaveBeenCalledWith(["s1"]);

      // node_modules 里的写入经过忽略谓词过滤，不应触发刷新
      tracePhase("node_modules-write");
      mkdirSync(path.join(root, "node_modules", "x"), { recursive: true });
      writeFileSync(path.join(root, "node_modules", "x", "y.js"), "1");
      await sleep(400);
      evidence.assertFiltered(path.join(root, "node_modules"));

      // git objects 噪音同样不应触发
      tracePhase("git-object-mkdir");
      mkdirSync(path.join(gitDir, "objects", "aa"), { recursive: true });
      tracePhase("git-object-write");
      writeFileSync(path.join(gitDir, "objects", "aa", "hash"), "blob");
      await sleep(400);
      evidence.assertFiltered(path.join(gitDir, "objects"));

      // HEAD 变化属于元数据变更，应当触发
      tracePhase("head-write");
      writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/dev\n");
      await sleep(400);
      await evidence.firedFor(path.join(gitDir, "HEAD"));
      evidence.assertChains();
      tracePhase("dispose");
      await watcher.dispose();
      const callsAtClose = changed.mock.calls.length;
      writeFileSync(path.join(root, "after-close.txt"), "closed");
      await sleep(100);
      expect(changed).toHaveBeenCalledTimes(callsAtClose);
    } finally {
      await watcher.dispose();
      await sleep(100);
      rmSync(root, { recursive: true, force: true });
    }
  });

  itNative("worktree 场景：gitDir 在仓库外时元数据变化仍能触发", async () => {
    const base = mkdtempSync(path.join(tmpdir(), "firefly-worktree-"));
    const root = path.join(base, "worktree");
    const gitDir = path.join(base, "mainrepo", ".git");
    mkdirSync(root, { recursive: true });
    mkdirSync(path.join(gitDir, "refs", "heads"), { recursive: true });
    writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n");
    const evidence = nativeEvidenceHarness(80);
    const { watcher } = evidence;

    try {
      await watcher.subscribe({ sessionId: "s1", workspaceRoot: root, gitDir });
      await sleep(200);

      evidence.phase("head-write");
      writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/dev\n");
      await sleep(400);
      await evidence.firedFor(path.join(gitDir, "HEAD"));

      // worktree 内的文件变化也要触发
      evidence.phase("source-write");
      writeFileSync(path.join(root, "b.ts"), "1");
      await sleep(400);
      await evidence.firedFor(path.join(root, "b.ts"));
      evidence.assertChains();
    } finally {
      await watcher.dispose();
      await sleep(100);
      rmSync(base, { recursive: true, force: true });
    }
  });

  itNative("dispose 后句柄关闭，不再产生通知", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "firefly-watch-"));
    const gitDir = path.join(root, ".git");
    mkdirSync(gitDir, { recursive: true });
    const evidence = nativeEvidenceHarness(80);
    const { watcher, changed } = evidence;

    await watcher.subscribe({ sessionId: "s1", workspaceRoot: root, gitDir });
    await watcher.dispose();
    await sleep(100);

    writeFileSync(path.join(root, "c.ts"), "1");
    await sleep(400);
    expect(changed).not.toHaveBeenCalled();
    rmSync(root, { recursive: true, force: true });
  });
});
