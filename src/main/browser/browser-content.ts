import { Worker } from "node:worker_threads";
import path from "node:path";

export interface BrowserDocumentExtraction {
  readonly title: string;
  readonly body: string;
}

export class BrowserContentExtractionError extends Error {
  public readonly reason: "extraction_failed" | "timeout" | "cancelled";

  public constructor(
    reason: "extraction_failed" | "timeout" | "cancelled",
    message: string,
  ) {
    super(message);
    this.name = "BrowserContentExtractionError";
    this.reason = reason;
  }
}

interface WorkerSuccess {
  readonly ok: true;
  readonly value: BrowserDocumentExtraction;
}

interface WorkerFailure {
  readonly ok: false;
  readonly message: string;
}

type WorkerMessage = WorkerSuccess | WorkerFailure;

/** Test-only lifecycle hooks; production callers use the default worker path. */
export interface BrowserContentExtractionOptions {
  readonly workerPath?: string;
  readonly onWorkerCreated?: (worker: Worker) => void;
  readonly onWorkerMessagePosted?: (worker: Worker) => void;
}

function isWorkerMessage(value: unknown): value is WorkerMessage {
  if (typeof value !== "object" || value === null || !("ok" in value)) return false;
  return value.ok === true || value.ok === false;
}

export async function extractStaticDocument(
  html: string,
  signal: AbortSignal,
  remainingMs: number,
  options: BrowserContentExtractionOptions = {},
): Promise<BrowserDocumentExtraction> {
  if (signal.aborted) {
    throw new BrowserContentExtractionError("cancelled", "The Browser document extraction was cancelled.");
  }
  if (remainingMs <= 0) {
    throw new BrowserContentExtractionError("timeout", "The Browser document extraction budget is exhausted.");
  }

  const worker = new Worker(options.workerPath ?? path.join(__dirname, "browser-content-worker.js"));
  let timer: NodeJS.Timeout | undefined;
  let onAbort: () => void = () => undefined;
  let onOnline: () => void = () => undefined;
  const extraction = new Promise<BrowserDocumentExtraction>((resolve, reject) => {
    let settled = false;
    const finish = (error?: BrowserContentExtractionError, value?: BrowserDocumentExtraction): void => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else if (value) resolve(value);
    };
    onAbort = (): void => finish(new BrowserContentExtractionError("cancelled", "The Browser document extraction was cancelled."));
    onOnline = (): void => {
      if (settled || signal.aborted) return;
      try {
        worker.postMessage(html);
        options.onWorkerMessagePosted?.(worker);
      } catch (error: unknown) {
        finish(new BrowserContentExtractionError(
          signal.aborted ? "cancelled" : "extraction_failed",
          error instanceof Error ? error.message : "The HTML parser worker could not receive the document.",
        ));
      }
    };
    signal.addEventListener("abort", onAbort, { once: true });
    worker.once("online", onOnline);
    worker.once("error", (error) => finish(new BrowserContentExtractionError(
      "extraction_failed",
      error instanceof Error ? error.message : "The HTML parser worker failed.",
    )));
    worker.once("exit", (code) => {
      if (code !== 0) finish(new BrowserContentExtractionError("extraction_failed", "The HTML parser worker exited unexpectedly."));
    });
    worker.on("message", (message: unknown) => {
      if (!isWorkerMessage(message)) {
        finish(new BrowserContentExtractionError("extraction_failed", "The HTML parser worker returned an invalid result."));
      } else if (message.ok) {
        finish(undefined, message.value);
      } else {
        finish(new BrowserContentExtractionError("extraction_failed", message.message));
      }
    });
    timer = setTimeout(() => finish(new BrowserContentExtractionError("timeout", "The Browser document extraction timed out.")), remainingMs);
    options.onWorkerCreated?.(worker);
  });

  try {
    return await extraction;
  } finally {
    if (timer) clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
    worker.removeListener("online", onOnline);
    await Promise.race([
      worker.terminate(),
      new Promise<void>((resolve) => setTimeout(resolve, 100)),
    ]);
  }
}
