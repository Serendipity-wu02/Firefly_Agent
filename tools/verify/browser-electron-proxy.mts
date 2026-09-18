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
  readonly overallPass?: boolean;
  readonly [key: string]: unknown;
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const electronPath = path.join(repositoryRoot, "node_modules", "electron", "dist", "electron.exe");
const compiledContentPath = path.join(repositoryRoot, "dist", "main", "main", "browser", "browser-content.js");
const compiledReaderPath = path.join(repositoryRoot, "dist", "main", "main", "browser", "browser-reader.js");
const compiledTransportPath = path.join(repositoryRoot, "dist", "main", "main", "browser", "http-proxy-browser-transport.js");
const compiledSharedTypesPath = path.join(repositoryRoot, "dist", "main", "shared", "browser-types.js");

const electronBootstrap = String.raw`
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { app } = require("electron");

const resultPath = process.env.FIREFLY_BROWSER_PROXY_VERIFY_RESULT;
const contentPath = process.env.FIREFLY_BROWSER_PROXY_VERIFY_CONTENT;
const readerPath = process.env.FIREFLY_BROWSER_PROXY_VERIFY_READER;
const transportPath = process.env.FIREFLY_BROWSER_PROXY_VERIFY_TRANSPORT;
const sharedTypesPath = process.env.FIREFLY_BROWSER_PROXY_VERIFY_SHARED_TYPES;

function errorDetails(error) {
  if (typeof error !== "object" || error === null) return { name: "UnknownError", message: String(error) };
  return {
    name: typeof error.name === "string" ? error.name : "Error",
    message: typeof error.message === "string" ? error.message : String(error),
    reason: typeof error.reason === "string" ? error.reason : undefined,
  };
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error && error.code !== "ERR_SERVER_NOT_RUNNING") reject(error);
      else resolve();
    });
  });
}

async function main() {
  const result = {
    versions: { ...process.versions },
    ready: false,
    browserWindowCreated: false,
    checks: {},
    overallPass: false,
  };
  let server;
  let backend;
  try {
    await app.whenReady();
    result.ready = true;
    const content = require(contentPath);
    const reader = require(readerPath);
    const transportModule = require(transportPath);
    const shared = require(sharedTypesPath);
    const requests = [];
    server = http.createServer((request, response) => {
      requests.push({ method: request.method, url: request.url, host: request.headers.host });
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.setHeader("Content-Length", String(Buffer.byteLength("<html><head><title>Electron proxy</title></head><body>代理读取成功</body></html>")));
      response.end("<html><head><title>Electron proxy</title></head><body>代理读取成功</body></html>");
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Electron proxy fixture did not expose a port.");
    const resolverCalls = [];
    backend = new reader.BrowserReadBackend({
      mode: "http_proxy",
      proxyEndpoint: { protocol: "http:", hostname: "127.0.0.1", port: address.port },
      dnsResolver: { lookup: async (hostname) => { resolverCalls.push(hostname); return ["127.0.0.1"]; } },
      transport: new transportModule.HttpProxyBrowserTransport(),
      limits: shared.BROWSER_READ_LIMITS,
    });
    const read = await backend.read({ requestUrl: "http://public.example.test/electron" });
    const workerPath = path.join(path.dirname(contentPath), "browser-content-worker.js");
    const parsed = await content.extractStaticDocument(
      "<html><head><title>worker</title></head><body>worker 中文😀𠀀</body></html>",
      new AbortController().signal,
      5_000,
    );
    result.checks.proxyRead = {
      pass: read.status === "succeeded"
        && read.title === "Electron proxy"
        && read.body === "代理读取成功"
        && read.connection?.mode === "http_proxy"
        && read.connection?.operation === "forward"
        && read.connection?.targetAddress === "not_observed"
        && read.connection?.proxyMatchesEndpoint === true,
      result: read,
      requests,
      resolverCalls,
    };
    result.checks.parserWorker = {
      pass: fsSyncExists(workerPath)
        && parsed.title === "worker"
        && parsed.body === "worker 中文😀𠀀",
      workerPath,
      parsed,
    };
    result.checks.noWindow = { pass: result.browserWindowCreated === false };
    result.overallPass = Object.values(result.checks).every((check) => check && check.pass === true);
    await backend.dispose();
    backend = undefined;
    await closeServer(server);
    server = undefined;
  } catch (error) {
    result.fatal = errorDetails(error);
    result.overallPass = false;
    if (backend) {
      try { await backend.dispose(); } catch (disposeError) { result.disposeError = errorDetails(disposeError); }
    }
    if (server) {
      try { await closeServer(server); } catch (closeError) { result.serverCloseError = errorDetails(closeError); }
    }
  }
  await fs.writeFile(resultPath, JSON.stringify(result, null, 2), "utf8");
  process.exitCode = result.overallPass ? 0 : 1;
  app.quit();
}

function fsSyncExists(filePath) {
  return require("node:fs").existsSync(filePath);
}

void main();
`;

function processTree(processId: number | undefined): Promise<void> {
  if (!processId) return Promise.resolve();
  if (process.platform !== "win32") {
    process.kill(processId, "SIGKILL");
    return Promise.resolve();
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
      resolve({ code, signal, timedOut, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
    };
    child.once("error", () => finish(null, null));
    child.once("close", (code, signal) => finish(code, signal));
  });
}

async function readVerificationResult(resultPath: string): Promise<VerificationResult> {
  const raw = await readFile(resultPath, "utf8");
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null) throw new Error("Electron Browser proxy result is not an object.");
  return value as VerificationResult;
}

async function main(): Promise<void> {
  const requiredFiles = [electronPath, compiledContentPath, compiledReaderPath, compiledTransportPath, compiledSharedTypesPath];
  const missing = requiredFiles.find((filePath) => !existsSync(filePath));
  if (missing) throw new Error(`Missing compiled Electron Browser proxy input: ${missing}`);

  const verificationDirectory = await mkdtemp(path.join(os.tmpdir(), "firefly-browser-electron-proxy-"));
  const resultPath = path.join(verificationDirectory, "result.json");
  const outputPath = path.join(verificationDirectory, "electron-output.log");
  const bootstrapPath = path.join(verificationDirectory, "bootstrap.cjs");
  const packagePath = path.join(verificationDirectory, "package.json");
  await writeFile(bootstrapPath, electronBootstrap, "utf8");
  await writeFile(packagePath, JSON.stringify({ name: "firefly-browser-electron-proxy-verify", version: "1.0.0", main: "bootstrap.cjs" }), "utf8");

  let electronExit: ElectronExit;
  try {
    const child = spawn(electronPath, ["--no-sandbox", "--disable-gpu", "--disable-software-rasterizer", verificationDirectory], {
      cwd: verificationDirectory,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        FIREFLY_BROWSER_PROXY_VERIFY_RESULT: resultPath,
        FIREFLY_BROWSER_PROXY_VERIFY_CONTENT: compiledContentPath,
        FIREFLY_BROWSER_PROXY_VERIFY_READER: compiledReaderPath,
        FIREFLY_BROWSER_PROXY_VERIFY_TRANSPORT: compiledTransportPath,
        FIREFLY_BROWSER_PROXY_VERIFY_SHARED_TYPES: compiledSharedTypesPath,
      },
    });
    electronExit = await waitForElectron(child);
  } finally {
    await Promise.all([
      rm(bootstrapPath, { force: true }),
      rm(packagePath, { force: true }),
    ]);
  }

  await writeFile(outputPath, JSON.stringify({ stdout: electronExit.stdout, stderr: electronExit.stderr }, null, 2), "utf8");
  let verification: VerificationResult;
  try {
    verification = await readVerificationResult(resultPath);
  } catch (error) {
    verification = { overallPass: false, fatal: { resultPath, error: error instanceof Error ? error.message : String(error) } };
  }
  const finalResult = { resultPath, outputPath, electronPath, electronExit, verification, processTreeCleanedByTimeout: electronExit.timedOut };
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
