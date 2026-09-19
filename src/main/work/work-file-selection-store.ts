import fs from "node:fs/promises";
import type { Stats } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { TextDecoder } from "node:util";
import path from "node:path";
import {
  MAX_FILE_BODY_CODE_POINTS,
  MAX_FILE_BYTES,
  MAX_FILE_COUNT,
  MAX_SELECTION_BYTES,
  MAX_TOTAL_BODY_CODE_POINTS,
  createWorkFileSelectionIdentity,
  type WorkFileId,
  type WorkFileKind,
  type WorkFileMetadata,
  type WorkFileReadFailure,
  type WorkFileReadRequest,
  type WorkFileReadResult,
  type WorkFileReadSuccess,
  type WorkFileSelectionId,
  type WorkFileSelectionBinding,
  type WorkFileSelectionSnapshot,
} from "../../shared/work-file-types";

interface FileIdentity {
  readonly persistent: string;
  readonly metadata: string;
}

interface InternalFile {
  readonly fileId: WorkFileId;
  readonly selectedPath: string;
  readonly resolvedPath: string;
  readonly identity: FileIdentity;
  readonly displayName: string;
  readonly fileKind: WorkFileKind;
  readonly byteLength: number;
  readonly symbolicLink: boolean;
}

interface InternalSelection {
  readonly selectionId: WorkFileSelectionId;
  readonly files: Map<WorkFileId, InternalFile>;
  readonly totalBytes: number;
  proposalId?: string;
  runId?: string;
  bodyCodePoints: number;
  readQueue: Promise<void>;
}

export class WorkFileSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkFileSelectionError";
  }
}

function createOpaqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function fileKindForPath(filePath: string): WorkFileKind {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".md" || extension === ".markdown") return "markdown";
  if (extension === ".txt") return "text";
  throw new WorkFileSelectionError(
    "Only .txt, .md, and .markdown files can be selected for Work read access.",
  );
}

function isRegularFile(stats: Stats): boolean {
  return stats.isFile();
}

function statIdentity(stats: Stats): FileIdentity {
  const persistent = `${String(stats.dev)}:${String(stats.ino)}`;
  const metadata = [
    persistent,
    String(stats.size),
    String(stats.mtimeMs),
    String(stats.ctimeMs),
  ].join(":");
  return { persistent, metadata };
}

function cloneMetadata(file: InternalFile): WorkFileMetadata {
  return {
    fileId: file.fileId,
    displayName: file.displayName,
    fileKind: file.fileKind,
    byteLength: file.byteLength,
    symbolicLink: file.symbolicLink,
  };
}

function cloneSnapshot(selection: InternalSelection): WorkFileSelectionSnapshot {
  const identity = createWorkFileSelectionIdentity(selection.selectionId);
  return Object.freeze({
    ...identity,
    files: Object.freeze(Array.from(selection.files.values()).map(cloneMetadata)),
    totalBytes: selection.totalBytes,
  });
}

function mapFsError(error: unknown): "file_missing" | "permission_denied" | "read_failed" {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  if (code === "ENOENT" || code === "ENOTDIR") return "file_missing";
  if (code === "EACCES" || code === "EPERM") return "permission_denied";
  return "read_failed";
}

function failure(
  request: WorkFileReadRequest,
  file: InternalFile | undefined,
  error: WorkFileReadFailure["error"],
  message: string,
  overrides: Partial<Pick<WorkFileReadFailure, "bytesRead" | "bodyCodePoints" | "contentTruncated" | "integrity">> = {},
): WorkFileReadFailure {
  const identity = createWorkFileSelectionIdentity(request.selectionId);
  return {
    ok: false,
    error,
    message,
    ...identity,
    fileId: request.fileId,
    displayName: file?.displayName ?? "unknown",
    fileKind: file?.fileKind ?? "text",
    byteLength: file?.byteLength ?? 0,
    bytesRead: overrides.bytesRead ?? 0,
    bodyCodePoints: overrides.bodyCodePoints ?? 0,
    complete: false,
    contentTruncated: overrides.contentTruncated ?? false,
    integrity: overrides.integrity ?? "unverified",
    encoding: "utf-8",
    untrustedContent: true,
  };
}

function success(
  request: WorkFileReadRequest,
  file: InternalFile,
  body: string,
  bytesRead: number,
): WorkFileReadSuccess {
  const identity = createWorkFileSelectionIdentity(request.selectionId);
  return {
    ok: true,
    ...identity,
    fileId: file.fileId,
    displayName: file.displayName,
    fileKind: file.fileKind,
    byteLength: file.byteLength,
    bytesRead,
    bodyCodePoints: Array.from(body).length,
    complete: true,
    contentTruncated: false,
    integrity: "verified",
    encoding: "utf-8",
    untrustedContent: true,
    body,
  };
}

function samePersistentIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.persistent === right.persistent;
}

function sameMetadataIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.metadata === right.metadata;
}

async function inspectSelectedPath(file: InternalFile): Promise<{
  resolvedPath: string;
  identity: FileIdentity;
}> {
  const selectedStats = await fs.lstat(file.selectedPath);
  const selectedIsSymbolicLink = selectedStats.isSymbolicLink();
  if (selectedIsSymbolicLink !== file.symbolicLink) {
    throw new WorkFileSelectionError("The selected file target was replaced.");
  }
  const resolvedPath = await fs.realpath(file.selectedPath);
  const resolvedStats = await fs.stat(resolvedPath);
  if (!isRegularFile(resolvedStats)) {
    throw new WorkFileSelectionError("The selected target is no longer a regular file.");
  }
  return { resolvedPath, identity: statIdentity(resolvedStats) };
}

export class WorkFileSelectionStore {
  private readonly selections = new Map<WorkFileSelectionId, InternalSelection>();
  private disposed = false;

  async createSelection(filePaths: readonly string[]): Promise<WorkFileSelectionSnapshot> {
    if (this.disposed) throw new WorkFileSelectionError("Work file selection is disposed.");
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      throw new WorkFileSelectionError("At least one file must be selected.");
    }
    if (filePaths.length > MAX_FILE_COUNT) {
      throw new WorkFileSelectionError(`A selection may contain a maximum of ${MAX_FILE_COUNT} files.`);
    }

    const selectionId = createWorkFileSelectionIdentity(createOpaqueId("file-selection")).selectionId;
    const files = new Map<WorkFileId, InternalFile>();
    const identities = new Set<string>();
    let totalBytes = 0;

    for (const selectedPathValue of filePaths) {
      if (typeof selectedPathValue !== "string" || !path.isAbsolute(selectedPathValue)) {
        throw new WorkFileSelectionError("Selected file paths must be absolute paths.");
      }
      const selectedPath = path.normalize(selectedPathValue);
      const fileKind = fileKindForPath(selectedPath);
      let lstat: Stats;
      try {
        lstat = await fs.lstat(selectedPath);
      } catch (error) {
        const code = mapFsError(error);
        throw new WorkFileSelectionError(`Unable to select file (${code}).`);
      }
      const symbolicLink = lstat.isSymbolicLink();
      let resolvedPath: string;
      let targetStats: Stats;
      try {
        resolvedPath = await fs.realpath(selectedPath);
        targetStats = await fs.stat(resolvedPath);
      } catch (error) {
        throw new WorkFileSelectionError(`Unable to resolve selected file (${mapFsError(error)}).`);
      }
      if (!isRegularFile(targetStats)) {
        throw new WorkFileSelectionError("Only regular files can be selected.");
      }
      if (targetStats.size > MAX_FILE_BYTES) {
        throw new WorkFileSelectionError("Selected file exceeds the single-file byte limit.");
      }
      totalBytes += targetStats.size;
      if (totalBytes > MAX_SELECTION_BYTES) {
        throw new WorkFileSelectionError("Selected files exceed the total byte limit.");
      }

      const identity = statIdentity(targetStats);
      if (identities.has(identity.persistent)) {
        throw new WorkFileSelectionError("The same file cannot be selected more than once.");
      }
      identities.add(identity.persistent);
      const fileId = createOpaqueId("file") as WorkFileId;
      files.set(fileId, {
        fileId,
        selectedPath,
        resolvedPath,
        identity,
        displayName: path.basename(selectedPath),
        fileKind,
        byteLength: targetStats.size,
        symbolicLink,
      });
    }

    const selection: InternalSelection = {
      selectionId,
      files,
      totalBytes,
      bodyCodePoints: 0,
      readQueue: Promise.resolve(),
    };
    this.selections.set(selectionId, selection);
    return cloneSnapshot(selection);
  }

  getSelection(selectionId: WorkFileSelectionId): WorkFileSelectionSnapshot | undefined {
    const selection = this.selections.get(selectionId);
    return selection === undefined ? undefined : cloneSnapshot(selection);
  }

  bindProposal(selectionId: WorkFileSelectionId, proposalId: string): boolean {
    const selection = this.selections.get(selectionId);
    if (selection === undefined || selection.runId !== undefined || selection.proposalId !== undefined) {
      return false;
    }
    selection.proposalId = proposalId;
    return true;
  }

  bindRun(selectionId: WorkFileSelectionId, proposalId: string, runId: string): boolean {
    const selection = this.selections.get(selectionId);
    if (
      selection === undefined ||
      selection.proposalId !== proposalId ||
      selection.runId !== undefined ||
      typeof runId !== "string" ||
      runId.trim().length === 0
    ) {
      return false;
    }
    selection.runId = runId;
    selection.proposalId = undefined;
    return true;
  }

  releaseProposal(selectionId: WorkFileSelectionId, proposalId: string): void {
    const selection = this.selections.get(selectionId);
    if (selection?.proposalId === proposalId) selection.proposalId = undefined;
  }

  releaseRun(runId: string): void {
    for (const [selectionId, selection] of this.selections) {
      if (selection.runId !== runId) continue;
      this.selections.delete(selectionId);
    }
  }

  validateBinding(runId: string, selectionId: WorkFileSelectionId, fileId: WorkFileId): boolean {
    const selection = this.selections.get(selectionId);
    return selection?.runId === runId && selection.files.has(fileId) || false;
  }

  validateSelectionBinding(runId: string, binding: WorkFileSelectionBinding): boolean {
    if (binding.selectionId !== binding.fileSelectionId || binding.fileIds.length === 0) return false;
    const selection = this.selections.get(binding.selectionId);
    return selection?.runId === runId &&
      binding.fileIds.every((fileId) => selection.files.has(fileId));
  }

  getBoundFile(
    runId: string,
    selectionId: WorkFileSelectionId,
    fileId: WorkFileId,
  ): { readonly path: string; readonly displayName: string } | undefined {
    const selection = this.selections.get(selectionId);
    const file = selection?.files.get(fileId);
    if (selection?.runId !== runId || file === undefined) return undefined;
    return { path: file.resolvedPath, displayName: file.displayName };
  }

  releaseSelection(selectionId: WorkFileSelectionId): void {
    const selection = this.selections.get(selectionId);
    if (selection?.runId === undefined) this.selections.delete(selectionId);
  }

  async readFile(request: WorkFileReadRequest): Promise<WorkFileReadResult> {
    const selection = this.selections.get(request.selectionId);
    if (selection === undefined) return this.readFileInternal(request);

    const previous = selection.readQueue;
    let releaseQueue!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    selection.readQueue = previous.then(() => current);

    if (request.signal === undefined) {
      await previous;
    } else {
      let removeAbortListener: (() => void) | undefined;
      const cancelled = new Promise<"cancelled">((resolve) => {
        const onAbort = (): void => resolve("cancelled");
        if (request.signal?.aborted) {
          resolve("cancelled");
          return;
        }
        request.signal?.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => request.signal?.removeEventListener("abort", onAbort);
      });
      const ready = previous.then(() => "ready" as const);
      const turn = await Promise.race([ready, cancelled]);
      removeAbortListener?.();
      if (turn === "cancelled") {
        void previous.then(() => releaseQueue());
        const file = selection.files.get(request.fileId);
        return failure(request, file, "cancelled", "File reading was cancelled before opening the file.");
      }
    }

    try {
      return await this.readFileInternal(request);
    } finally {
      releaseQueue();
    }
  }

  private async readFileInternal(request: WorkFileReadRequest): Promise<WorkFileReadResult> {
    const selection = this.selections.get(request.selectionId);
    const file = selection?.files.get(request.fileId);
    if (selection === undefined) {
      return failure(request, undefined, "selection_not_found", "The file selection is no longer available.");
    }
    if (selection.runId !== request.runId) {
      return failure(request, file, "selection_not_bound", "The file selection is not bound to this run.");
    }
    if (file === undefined) {
      return failure(request, undefined, "file_not_in_selection", "The file is not part of the bound selection.");
    }
    if (request.signal?.aborted) {
      return failure(request, file, "cancelled", "File reading was cancelled before opening the file.");
    }
    if (selection.bodyCodePoints >= MAX_TOTAL_BODY_CODE_POINTS) {
      return failure(
        request,
        file,
        "run_body_code_point_limit_exceeded",
        "The Work run has reached its total file body limit.",
        { contentTruncated: true },
      );
    }

    let inspection: { resolvedPath: string; identity: FileIdentity };
    try {
      inspection = await inspectSelectedPath(file);
    } catch (error) {
      const mapped = error instanceof WorkFileSelectionError
        ? error.message.includes("regular file")
          ? "not_regular_file"
          : "file_replaced"
        : mapFsError(error);
      return failure(
        request,
        file,
        mapped,
        error instanceof Error ? error.message : "The selected file could not be inspected.",
        { integrity: mapped === "file_replaced" ? "changed" : "unverified" },
      );
    }
    if (!samePersistentIdentity(file.identity, inspection.identity)) {
      return failure(request, file, "file_replaced", "The selected file target changed before it was opened.", {
        integrity: "changed",
      });
    }
    if (!sameMetadataIdentity(file.identity, inspection.identity)) {
      return failure(request, file, "file_changed", "The selected file metadata changed before it was opened.", {
        integrity: "changed",
      });
    }

    let handle: FileHandle | undefined;
    let bytesRead = 0;
    let bodyCodePoints = 0;
    let decoder: TextDecoder;
    const chunks: string[] = [];
    try {
      handle = await fs.open(inspection.resolvedPath, "r");
      const openedStats = await handle.stat();
      const openedIdentity = statIdentity(openedStats);
      if (!samePersistentIdentity(file.identity, openedIdentity)) {
        return failure(request, file, "file_replaced", "The selected file was replaced before the handle was opened.", {
          integrity: "changed",
        });
      }
      if (!sameMetadataIdentity(file.identity, openedIdentity)) {
        return failure(request, file, "file_changed", "The selected file changed before reading began.", {
          integrity: "changed",
        });
      }

      decoder = new TextDecoder("utf-8", { fatal: true });
      const buffer = Buffer.allocUnsafe(64 * 1024);
      let position = 0;
      while (true) {
        if (request.signal?.aborted) {
          return failure(request, file, "cancelled", "File reading was cancelled.", {
            bytesRead,
            bodyCodePoints,
            contentTruncated: true,
          });
        }
        const read = await handle.read(buffer, 0, buffer.length, position);
        if (read.bytesRead === 0) break;
        position += read.bytesRead;
        bytesRead += read.bytesRead;
        if (bytesRead > MAX_FILE_BYTES) {
          return failure(request, file, "file_size_limit_exceeded", "The file exceeded the byte limit while reading.", {
            bytesRead,
            bodyCodePoints,
            contentTruncated: true,
          });
        }
        const decoded = decoder.decode(buffer.subarray(0, read.bytesRead), { stream: true });
        bodyCodePoints += Array.from(decoded).length;
        if (bodyCodePoints > MAX_FILE_BODY_CODE_POINTS) {
          return failure(request, file, "body_code_point_limit_exceeded", "The file body exceeded the Unicode code point limit.", {
            bytesRead,
            bodyCodePoints,
            contentTruncated: true,
          });
        }
        if (selection.bodyCodePoints + bodyCodePoints > MAX_TOTAL_BODY_CODE_POINTS) {
          return failure(request, file, "run_body_code_point_limit_exceeded", "The Work run exceeded its total file body limit.", {
            bytesRead,
            bodyCodePoints,
            contentTruncated: true,
          });
        }
        chunks.push(decoded);
      }
      const finalDecoded = decoder.decode();
      bodyCodePoints += Array.from(finalDecoded).length;
      if (bodyCodePoints > MAX_FILE_BODY_CODE_POINTS) {
        return failure(request, file, "body_code_point_limit_exceeded", "The file body exceeded the Unicode code point limit.", {
          bytesRead,
          bodyCodePoints,
          contentTruncated: true,
        });
      }
      if (selection.bodyCodePoints + bodyCodePoints > MAX_TOTAL_BODY_CODE_POINTS) {
        return failure(request, file, "run_body_code_point_limit_exceeded", "The Work run exceeded its total file body limit.", {
          bytesRead,
          bodyCodePoints,
          contentTruncated: true,
        });
      }
      chunks.push(finalDecoded);

      const afterStats = await handle.stat();
      const afterIdentity = statIdentity(afterStats);
      if (!samePersistentIdentity(file.identity, afterIdentity)) {
        return failure(request, file, "file_replaced", "The selected file target changed while it was being read.", {
          bytesRead,
          bodyCodePoints,
          integrity: "changed",
        });
      }
      if (!sameMetadataIdentity(file.identity, afterIdentity) || bytesRead !== file.byteLength) {
        return failure(request, file, "file_changed", "The selected file changed while it was being read.", {
          bytesRead,
          bodyCodePoints,
          integrity: "changed",
        });
      }

      const afterPathInspection = await inspectSelectedPath(file);
      if (afterPathInspection.resolvedPath !== inspection.resolvedPath ||
          !samePersistentIdentity(file.identity, afterPathInspection.identity)) {
        return failure(request, file, "file_replaced", "The selected file target changed while it was being read.", {
          bytesRead,
          bodyCodePoints,
          integrity: "changed",
        });
      }
      if (!sameMetadataIdentity(file.identity, afterPathInspection.identity)) {
        return failure(request, file, "file_changed", "The selected file changed while it was being read.", {
          bytesRead,
          bodyCodePoints,
          integrity: "changed",
        });
      }

      const body = chunks.join("");
      selection.bodyCodePoints += bodyCodePoints;
      return success(request, file, body, bytesRead);
    } catch (error) {
      if (request.signal?.aborted) {
        return failure(request, file, "cancelled", "File reading was cancelled.", {
          bytesRead,
          bodyCodePoints,
          contentTruncated: true,
        });
      }
      if (error instanceof TypeError && /decode|encoding|encoded data/i.test(error.message)) {
        return failure(request, file, "unsupported_encoding", "The file is not valid UTF-8.", {
          bytesRead,
          bodyCodePoints,
          integrity: "failed",
        });
      }
      const mapped = mapFsError(error);
      return failure(request, file, mapped, "The selected file could not be read.", {
        bytesRead,
        bodyCodePoints,
        integrity: "failed",
      });
    } finally {
      if (handle !== undefined) {
        try {
          await handle.close();
        } catch {
          // The read result is already determined; the handle is still closed
          // by Node's FileHandle finalizer if the OS close reports an error.
        }
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.selections.clear();
  }
}

export {
  MAX_FILE_BODY_CODE_POINTS,
  MAX_FILE_BYTES,
  MAX_FILE_COUNT,
  MAX_SELECTION_BYTES,
  MAX_TOTAL_BODY_CODE_POINTS,
};
