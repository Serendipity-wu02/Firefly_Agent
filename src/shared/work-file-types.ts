/**
 * Main-owned contracts for the Work local-file read boundary.
 *
 * A renderer receives metadata and opaque identities only.  Absolute paths,
 * resolved paths and operating-system file identities remain in Main.
 */

declare const workFileSelectionIdBrand: unique symbol;
declare const workFileIdBrand: unique symbol;

export type WorkFileSelectionId = string & {
  readonly [workFileSelectionIdBrand]: true;
};

export type WorkFileId = string & {
  readonly [workFileIdBrand]: true;
};

export const MAX_FILE_COUNT = 8 as const;
export const MAX_FILE_BYTES = 1 * 1024 * 1024;
export const MAX_SELECTION_BYTES = 4 * 1024 * 1024;
export const MAX_FILE_BODY_CODE_POINTS = 4_096 as const;
export const MAX_TOTAL_BODY_CODE_POINTS = 16_384 as const;

export type WorkFileKind = "text" | "markdown";

/** The same opaque value is exposed under both names for IPC/tool contracts. */
export interface WorkFileSelectionIdentity {
  readonly selectionId: WorkFileSelectionId;
  readonly fileSelectionId: WorkFileSelectionId;
}

export interface WorkFileMetadata {
  readonly fileId: WorkFileId;
  readonly displayName: string;
  readonly fileKind: WorkFileKind;
  readonly byteLength: number;
  readonly symbolicLink: boolean;
}

export interface WorkFileSelectionSnapshot extends WorkFileSelectionIdentity {
  readonly files: readonly WorkFileMetadata[];
  readonly totalBytes: number;
}

/** Main-created reference copied into a proposal and then one execution run. */
export interface WorkFileSelectionBinding extends WorkFileSelectionIdentity {
  readonly fileIds: readonly WorkFileId[];
}

/**
 * Main-owned execution requirement.  A selection is only an available scope;
 * this separate contract says exactly which selected identities the current
 * Work task must read before it may be reported complete.
 */
export interface WorkFileReadRequirement extends WorkFileSelectionBinding {}

export function createWorkFileReadRequirement(
  selection: WorkFileSelectionSnapshot,
): WorkFileReadRequirement {
  return Object.freeze({
    selectionId: selection.selectionId,
    fileSelectionId: selection.fileSelectionId,
    fileIds: Object.freeze(selection.files.map((file) => file.fileId)),
  });
}

export type WorkFileReadErrorCode =
  | "selection_not_found"
  | "selection_not_bound"
  | "file_not_in_selection"
  | "file_missing"
  | "file_replaced"
  | "file_changed"
  | "not_regular_file"
  | "unsupported_file_type"
  | "permission_denied"
  | "file_size_limit_exceeded"
  | "selection_size_limit_exceeded"
  | "body_code_point_limit_exceeded"
  | "run_body_code_point_limit_exceeded"
  | "unsupported_encoding"
  | "cancelled"
  | "read_failed";

export interface WorkFileReadSuccess {
  readonly ok: true;
  readonly selectionId: WorkFileSelectionId;
  readonly fileSelectionId: WorkFileSelectionId;
  readonly fileId: WorkFileId;
  readonly displayName: string;
  readonly fileKind: WorkFileKind;
  readonly byteLength: number;
  readonly bytesRead: number;
  readonly bodyCodePoints: number;
  readonly complete: true;
  readonly contentTruncated: false;
  readonly integrity: "verified";
  readonly encoding: "utf-8";
  readonly untrustedContent: true;
  readonly body: string;
}

export interface WorkFileReadFailure {
  readonly ok: false;
  readonly error: WorkFileReadErrorCode;
  readonly message: string;
  readonly selectionId: WorkFileSelectionId;
  readonly fileSelectionId: WorkFileSelectionId;
  readonly fileId: WorkFileId;
  readonly displayName: string;
  readonly fileKind: WorkFileKind;
  readonly byteLength: number;
  readonly bytesRead: number;
  readonly bodyCodePoints: number;
  readonly complete: false;
  readonly contentTruncated: boolean;
  readonly integrity: "unverified" | "changed" | "failed";
  readonly encoding: "utf-8";
  readonly untrustedContent: true;
  readonly body?: never;
}

export type WorkFileReadResult = WorkFileReadSuccess | WorkFileReadFailure;

export interface WorkFileReadRequest {
  readonly runId: string;
  readonly selectionId: WorkFileSelectionId;
  readonly fileId: WorkFileId;
  readonly signal?: AbortSignal;
}

export type WorkFileSelectionOperationResult =
  | {
      readonly ok: true;
      readonly selection?: WorkFileSelectionSnapshot;
      readonly cancelled?: boolean;
    }
  | {
      readonly ok: false;
      readonly code: "selection_failed" | "selection_busy";
      readonly message: string;
      readonly selection?: WorkFileSelectionSnapshot;
    };

export function createWorkFileSelectionIdentity(value: string): WorkFileSelectionIdentity {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("Work file selection identity must be a non-empty string.");
  }
  const id = value as WorkFileSelectionId;
  return Object.freeze({ selectionId: id, fileSelectionId: id });
}

export function isWorkFileSelectionIdentity(value: unknown): value is WorkFileSelectionIdentity {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.selectionId === "string"
    && record.selectionId.length > 0
    && record.fileSelectionId === record.selectionId;
}
