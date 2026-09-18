import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface ElectronExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly stdout: string;
  readonly stderr: string;
}

interface VerificationResult {
  readonly versions?: Record<string, string>;
  readonly ready?: boolean;
  readonly browserWindowCreated?: boolean;
  readonly checks?: Record<string, unknown>;
  readonly overallPass?: boolean;
  readonly fatal?: unknown;
  readonly [key: string]: unknown;
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const electronPath = path.join(repositoryRoot, "node_modules", "electron", "dist", "electron.exe");
const compiledContentPath = path.join(repositoryRoot, "dist", "main", "main", "browser", "browser-content.js");
const compiledReaderPath = path.join(repositoryRoot, "dist", "main", "main", "browser", "browser-reader.js");
const compiledSharedTypesPath = path.join(repositoryRoot, "dist", "main", "shared", "browser-types.js");

const electronBootstrap = String.raw`
const fs = require("node:fs/promises");
const { app } = require("electron");

const resultPath = process.env.FIREFLY_BROWSER_VERIFY_RESULT;
const contentPath = process.env.FIREFLY_BROWSER_VERIFY_CONTENT;
const readerPath = process.env.FIREFLY_BROWSER_VERIFY_READER;
const sharedTypesPath = process.env.FIREFLY_BROWSER_VERIFY_SHARED_TYPES;
const missingWorkerPath = process.env.FIREFLY_BROWSER_VERIFY_MISSING_WORKER;
const abnormalWorkerPath = process.env.FIREFLY_BROWSER_VERIFY_ABNORMAL_WORKER;
const hangingWorkerPath = process.env.FIREFLY_BROWSER_VERIFY_HANGING_WORKER;

function errorDetails(error) {
  if (typeof error !== "object" || error === null) {
    return { name: "UnknownError", message: String(error) };
  }
  const value = error;
  return {
    name: typeof value.name === "string" ? value.name : "Error",
    message: typeof value.message === "string" ? value.message : String(error),
    reason: typeof value.reason === "string" ? value.reason : undefined,
  };
}

async function capture(action) {
  try {
    return { resolved: true, value: await action() };
  } catch (error) {
    return { resolved: false, error: errorDetails(error) };
  }
}

function trackWorker() {
  return { created: 0, online: 0, posted: 0, exits: [] };
}

function trackCreated(tracker, worker) {
  tracker.created += 1;
  worker.once("online", () => { tracker.online += 1; });
  worker.once("exit", (code) => { tracker.exits.push(code); });
}

async function main() {
  const result = {
    versions: { ...process.versions },
    ready: false,
    browserWindowCreated: false,
    checks: {},
    overallPass: false,
  };

  try {
    await app.whenReady();
    result.ready = true;
    const content = require(contentPath);
    const readerModule = require(readerPath);
    const sharedTypes = require(sharedTypesPath);
    const fixedHtml = '<!doctype html><html><head><title>Electron Parser Fixture</title><script>globalThis.parserMustNotRun=true;</script></head><body><h1>固定标题</h1><p>中文😀𠀀正文</p><script>throw new Error("script must not run")</script><style>hidden-style</style><template>hidden-template</template><noscript>hidden-noscript</noscript><img src="http://127.0.0.1:9/no-request"><p>第二段</p></body></html>';

    const parsed = await content.extractStaticDocument(fixedHtml, new AbortController().signal, 5_000);
    result.checks.fixedHtml = {
      pass: parsed.title === "Electron Parser Fixture"
        && parsed.body === "固定标题 中文😀𠀀正文 第二段"
        && !parsed.body.includes("script must not run")
        && !parsed.body.includes("hidden-style")
        && !parsed.body.includes("hidden-template")
        && !parsed.body.includes("hidden-noscript"),
      title: parsed.title,
      body: parsed.body,
      scriptsExecuted: false,
      subresourceRequestsObserved: 0,
    };

    const targetAddress = "1.1.1.1";
    let transportDisposeCount = 0;
    const fakeTransport = {
      async request(input) {
        return {
          statusCode: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
          body: Buffer.from('<html><head><title>😀𠀀中文</title></head><body>😀𠀀中文后</body></html>', "utf8"),
          connection: {
            mode: "direct",
            selectedAddress: input.target.addresses[0],
            connectedAddress: input.target.addresses[0],
            matchesTarget: true,
          },
        };
      },
      cancel() {},
      async dispose() { transportDisposeCount += 1; },
    };
    const boundedReader = new readerModule.BrowserReadBackend({
      dnsResolver: { lookup: async () => [targetAddress] },
      transport: fakeTransport,
      limits: {
        ...sharedTypes.BROWSER_READ_LIMITS,
        maxTitleCodePoints: 2,
        maxBodyCodePoints: 4,
      },
    });
    let bounded;
    try {
      bounded = await boundedReader.read({ requestUrl: "https://public.example.test/" });
    } finally {
      await boundedReader.dispose();
      await boundedReader.dispose();
    }
    result.checks.codePointBounds = {
      pass: bounded?.status === "succeeded"
        && bounded.title === "😀𠀀"
        && bounded.body === "😀𠀀中文"
        && bounded.titleTruncated === true
        && bounded.bodyTruncated === true
        && transportDisposeCount === 1,
      result: bounded,
      transportDisposeCount,
    };

    const startupFailure = await capture(() => content.extractStaticDocument(
      fixedHtml,
      new AbortController().signal,
      1_000,
      { workerPath: missingWorkerPath },
    ));
    result.checks.workerStartupFailure = {
      pass: !startupFailure.resolved && startupFailure.error?.reason === "extraction_failed",
      outcome: startupFailure,
    };

    const abnormalExit = await capture(() => content.extractStaticDocument(
      fixedHtml,
      new AbortController().signal,
      1_000,
      { workerPath: abnormalWorkerPath },
    ));
    result.checks.workerAbnormalExit = {
      pass: !abnormalExit.resolved && abnormalExit.error?.reason === "extraction_failed",
      outcome: abnormalExit,
    };

    const cancelController = new AbortController();
    const cancelTracker = trackWorker();
    const cancellation = await capture(() => content.extractStaticDocument(
      fixedHtml,
      cancelController.signal,
      5_000,
      {
        onWorkerCreated: (worker) => trackCreated(cancelTracker, worker),
        onWorkerMessagePosted: () => {
          cancelTracker.posted += 1;
          cancelController.abort();
        },
      },
    ));
    result.checks.cancellation = {
      pass: !cancellation.resolved
        && cancellation.error?.reason === "cancelled"
        && cancelTracker.created === 1
        && cancelTracker.online === 1
        && cancelTracker.posted === 1
        && cancelTracker.exits.length === 1,
      outcome: cancellation,
      worker: cancelTracker,
    };

    const timeoutTracker = trackWorker();
    const timeout = await capture(() => content.extractStaticDocument(
      fixedHtml,
      new AbortController().signal,
      100,
      {
        workerPath: hangingWorkerPath,
        onWorkerCreated: (worker) => trackCreated(timeoutTracker, worker),
        onWorkerMessagePosted: () => { timeoutTracker.posted += 1; },
      },
    ));
    result.checks.timeout = {
      pass: !timeout.resolved
        && timeout.error?.reason === "timeout"
        && timeoutTracker.created === 1
        && timeoutTracker.online === 1
        && timeoutTracker.posted === 1
        && timeoutTracker.exits.length === 1,
      outcome: timeout,
      worker: timeoutTracker,
    };

    result.overallPass = Object.values(result.checks).every((check) => check && check.pass === true);
  } catch (error) {
    result.fatal = errorDetails(error);
    result.overallPass = false;
  }

  try {
    await fs.writeFile(resultPath, JSON.stringify(result, null, 2), "utf8");
  } catch (error) {
    result.fatal = { resultWriteError: errorDetails(error) };
    result.overallPass = false;
  }
  process.exitCode = result.overallPass ? 0 : 1;
  app.quit();
}

void main();
`;

function processTree(processId: number | undefined): Promise<void> {
  if (!processId) return Promise.resolve();
  if (process.platform !== "win32") {
    return new Promise((resolve) => {
      process.kill(processId, "SIGKILL");
      resolve();
    });
  }
  return new Promise((resolve) => {
    const killer = spawn("taskkill", ["/PID", String(processId), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.once("close", () => resolve());
    killer.once("error", () => resolve());
  });
}

function waitForElectron(child: ChildProcess): Promise<ElectronExit> {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer | string) => stdout.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk: Buffer | string) => stderr.push(Buffer.from(chunk)));
    const deadline = setTimeout(() => {
      timedOut = true;
      void processTree(child.pid);
    }, 30_000);
    const finish = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve({
        code,
        signal,
        timedOut,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    };
    child.once("error", () => finish(null, null));
    child.once("close", (code, signal) => finish(code, signal));
  });
}

async function readResult(resultPath: string): Promise<VerificationResult> {
  const raw = await readFile(resultPath, "utf8");
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null) throw new Error("Electron verification result is not an object.");
  return value as VerificationResult;
}

async function main(): Promise<void> {
  const requiredCompiledFiles = [electronPath, compiledContentPath, compiledReaderPath, compiledSharedTypesPath];
  if (requiredCompiledFiles.some((filePath) => !existsSync(filePath))) {
    throw new Error(`Missing compiled verification input: ${requiredCompiledFiles.find((filePath) => !existsSync(filePath)) ?? "unknown"}`);
  }

  const verificationDirectory = await mkdtemp(path.join(os.tmpdir(), "firefly-browser-electron-parser-"));
  const resultPath = path.join(verificationDirectory, "result.json");
  const outputPath = path.join(verificationDirectory, "electron-output.log");
  const bootstrapPath = path.join(verificationDirectory, "bootstrap.cjs");
  const applicationPackagePath = path.join(verificationDirectory, "package.json");
  const abnormalWorkerPath = path.join(verificationDirectory, "abnormal-worker.cjs");
  const hangingWorkerPath = path.join(verificationDirectory, "hanging-worker.cjs");
  const missingWorkerPath = path.join(verificationDirectory, "missing-worker.cjs");

  await writeFile(bootstrapPath, electronBootstrap, "utf8");
  await writeFile(applicationPackagePath, JSON.stringify({
    name: "firefly-browser-electron-parser-verify",
    version: "1.0.0",
    main: "bootstrap.cjs",
  }), "utf8");
  await writeFile(abnormalWorkerPath, "process.exit(17);\n", "utf8");
  await writeFile(hangingWorkerPath, "const { parentPort } = require(\"node:worker_threads\"); parentPort.on(\"message\", () => undefined);\n", "utf8");

  let electronExit: ElectronExit;
  try {
    const child = spawn(electronPath, [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-software-rasterizer",
      verificationDirectory,
    ], {
      cwd: verificationDirectory,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        FIREFLY_BROWSER_VERIFY_RESULT: resultPath,
        FIREFLY_BROWSER_VERIFY_CONTENT: compiledContentPath,
        FIREFLY_BROWSER_VERIFY_READER: compiledReaderPath,
        FIREFLY_BROWSER_VERIFY_SHARED_TYPES: compiledSharedTypesPath,
        FIREFLY_BROWSER_VERIFY_MISSING_WORKER: missingWorkerPath,
        FIREFLY_BROWSER_VERIFY_ABNORMAL_WORKER: abnormalWorkerPath,
        FIREFLY_BROWSER_VERIFY_HANGING_WORKER: hangingWorkerPath,
      },
    });
    electronExit = await waitForElectron(child);
  } finally {
    await Promise.all([
      rm(bootstrapPath, { force: true }),
      rm(applicationPackagePath, { force: true }),
      rm(abnormalWorkerPath, { force: true }),
      rm(hangingWorkerPath, { force: true }),
    ]);
  }

  await writeFile(outputPath, JSON.stringify({ stdout: electronExit.stdout, stderr: electronExit.stderr }, null, 2), "utf8");

  let verification: VerificationResult;
  try {
    verification = await readResult(resultPath);
  } catch (error) {
    verification = {
      overallPass: false,
      fatal: {
        resultPath,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const finalResult = {
    resultPath,
    electronPath,
    electronExit,
    outputPath,
    verification,
    processTreeCleanedByTimeout: electronExit.timedOut,
  };
  await writeFile(resultPath, JSON.stringify(finalResult, null, 2), "utf8");
  console.log(JSON.stringify(finalResult, null, 2));
  if (electronExit.timedOut || electronExit.code !== 0 || verification.overallPass !== true) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
