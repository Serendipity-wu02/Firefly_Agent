import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  FireflyApplication,
  type ApplicationRuntime,
} from "../../../src/main/application/application.ts";

const rootDir = path.resolve(import.meta.dirname, "../../..");

function createRuntime(events: string[], options: {
  readonly start?: (signal: AbortSignal) => Promise<void>;
  readonly hasTray?: boolean;
} = {}): ApplicationRuntime & { startCount: number; stopCount: number } {
  let startCount = 0;
  let stopCount = 0;
  return {
    get startCount() {
      return startCount;
    },
    get stopCount() {
      return stopCount;
    },
    async start(signal: AbortSignal): Promise<void> {
      startCount += 1;
      events.push("runtime:start");
      if (options.start) await options.start(signal);
    },
    async stop(): Promise<void> {
      stopCount += 1;
      events.push("runtime:stop");
    },
    activate(): void {
      events.push("runtime:activate");
    },
    hasTray(): boolean {
      return options.hasTray ?? true;
    },
  };
}

test("application starts one runtime and preserves activation ownership", async () => {
  const events: string[] = [];
  const runtime = createRuntime(events);
  let createCount = 0;
  const application = new FireflyApplication(() => {
    createCount += 1;
    events.push("runtime:create");
    return runtime;
  });

  await Promise.all([application.start(), application.start()]);
  application.activate();

  assert.equal(createCount, 1);
  assert.equal(runtime.startCount, 1);
  assert.equal(runtime.stopCount, 0);
  assert.equal(application.getPhase(), "running");
  assert.equal(application.hasTray(), true);
  assert.deepEqual(events, ["runtime:create", "runtime:start", "runtime:activate"]);
});

test("startup failure cleans the created runtime and prevents a second start", async () => {
  const events: string[] = [];
  const runtime = createRuntime(events, {
    start: async () => {
      throw new Error("startup fixture failure");
    },
  });
  let createCount = 0;
  const application = new FireflyApplication(() => {
    createCount += 1;
    return runtime;
  });

  await assert.rejects(() => application.start(), /startup fixture failure/);
  await application.start();

  assert.equal(createCount, 1);
  assert.equal(runtime.startCount, 1);
  assert.equal(runtime.stopCount, 1);
  assert.equal(application.getPhase(), "failed");
});

test("stop during startup invalidates the late result and cleans exactly once", async () => {
  const events: string[] = [];
  let releaseStart: (() => void) | undefined;
  const startGate = new Promise<void>((resolve) => {
    releaseStart = resolve;
  });
  const runtime = createRuntime(events, {
    start: async () => {
      await startGate;
      events.push("runtime:start-late-result");
    },
  });
  const application = new FireflyApplication(() => runtime);

  const startPromise = application.start();
  await Promise.resolve();
  const stopPromise = application.stop();
  releaseStart?.();
  await Promise.all([startPromise.catch(() => undefined), stopPromise]);
  await application.stop();

  assert.equal(runtime.startCount, 1);
  assert.equal(runtime.stopCount, 1);
  assert.equal(application.getPhase(), "stopped");
  assert.equal(application.hasTray(), false);
  assert.deepEqual(events, ["runtime:start", "runtime:start-late-result", "runtime:stop"]);
});

test("composition root delegates construction and lifecycle without restoring retired producers", () => {
  const indexSource = fs.readFileSync(path.join(rootDir, "src", "main", "index.ts"), "utf8");
  const dependenciesSource = fs.readFileSync(
    path.join(rootDir, "src", "main", "application", "default-dependencies.ts"),
    "utf8",
  );
  const applicationSource = fs.readFileSync(
    path.join(rootDir, "src", "main", "application", "application.ts"),
    "utf8",
  );

  assert.match(indexSource, /new FireflyApplication\(/);
  assert.doesNotMatch(indexSource, /new (SettingsManager|FireflyMemoryService|FireflyAgentCore|MusicService)\(/);
  assert.doesNotMatch(indexSource, /FireflyProactiveScheduler|CharacterStateManager|setInterval/);
  assert.match(dependenciesSource, /new SettingsManager\(/);
  assert.match(dependenciesSource, /new FireflyMemoryService\(/);
  assert.match(dependenciesSource, /new FireflyAgentCore\(/);
  assert.match(dependenciesSource, /new MusicService\(/);
  assert.match(applicationSource, /AbortController/);
  assert.doesNotMatch(applicationSource, /removeAllListeners\(/);
});
