import type {
  WorkHistoryRecord,
  WorkHistorySnapshot,
} from "../../shared/work-history-types";
import { WORK_HISTORY_LIMITS } from "../../shared/work-history-types";
import { workStepOperationLabel } from "../../shared/work-markdown";
import type { WorkTaskSnapshot } from "../../shared/work-types";

interface StoredHistoryRecord {
  readonly record: WorkHistoryRecord;
  readonly byteLength: number;
}

function cloneRecord(record: WorkHistoryRecord): WorkHistoryRecord {
  return {
    ...record,
    ...(record.fileSelection === undefined
      ? {}
      : {
          fileSelection: {
            totalBytes: record.fileSelection.totalBytes,
            files: record.fileSelection.files.map((file) => ({ ...file })),
          },
        }),
    steps: record.steps.map((step) => ({ ...step })),
    ...(record.terminationReason === undefined
      ? {}
      : { terminationReason: { ...record.terminationReason } }),
  };
}

function recordByteLength(record: WorkHistoryRecord): number {
  return Buffer.byteLength(JSON.stringify(record), "utf8");
}

const SAFE_COORDINATOR_ERRORS = new Set([
  "The Work proposal contained an invalid tool binding.",
  "A file_read step requires an explicit file-read requirement.",
  "The Work proposal did not include a file_read step for every required file.",
  "The selected file scope could not be bound to this proposal.",
  "The selected file scope could not be bound to this execution run.",
  "required_file_read_evidence_missing: the run completed without successful evidence for every required file.",
]);

function safeHistoryError(error: string | undefined): string | undefined {
  if (error === undefined) return undefined;
  if (SAFE_COORDINATOR_ERRORS.has(error)) return error;
  return "任务未完成；详细执行错误未保留。";
}

/** Project a terminal Work snapshot without retaining execution-only data. */
export function projectWorkHistoryRecord(snapshot: WorkTaskSnapshot): WorkHistoryRecord {
  if (snapshot.phase !== "completed" && snapshot.phase !== "failed" && snapshot.phase !== "cancelled") {
    throw new Error("Only terminal Work snapshots can be stored in history.");
  }
  return {
    historyId: snapshot.taskId,
    taskId: snapshot.taskId,
    userPrompt: snapshot.userPrompt,
    fileReadMode: snapshot.fileReadMode,
    ...(snapshot.fileSelection === undefined
      ? {}
      : {
          fileSelection: {
            totalBytes: snapshot.fileSelection.totalBytes,
            files: snapshot.fileSelection.files.map((file) => ({
              displayName: file.displayName,
              fileKind: file.fileKind,
              byteLength: file.byteLength,
              symbolicLink: file.symbolicLink,
            })),
          },
        }),
    phase: snapshot.phase,
    steps: snapshot.steps.map((step) => ({
      index: step.index,
      description: step.description,
      completionRequirement: step.completionRequirement,
      ...(step.toolBinding === undefined ? {} : { toolName: step.toolBinding.toolName }),
      ...(workStepOperationLabel(step) === undefined
        ? {}
        : { plannedOperation: workStepOperationLabel(step) }),
      status: step.status,
      ...(step.verificationStatus === undefined ? {} : { verificationStatus: step.verificationStatus }),
      ...(step.verificationReason === undefined ? {} : { verificationReason: step.verificationReason }),
    })),
    ...(snapshot.finalText === undefined ? {} : { finalText: snapshot.finalText }),
    ...(snapshot.terminationReason === undefined ? {} : { terminationReason: snapshot.terminationReason }),
    ...(safeHistoryError(snapshot.error) === undefined
      ? {}
      : { error: safeHistoryError(snapshot.error) }),
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

/** In-process bounded history.  No record is written to disk or shared state. */
export class WorkHistoryStore {
  private readonly entries: StoredHistoryRecord[] = [];
  private totalBytes = 0;

  add(record: WorkHistoryRecord): boolean {
    const byteLength = recordByteLength(record);
    if (byteLength > WORK_HISTORY_LIMITS.maxTotalBytes) return false;

    const existingIndex = this.entries.findIndex((entry) => entry.record.historyId === record.historyId);
    if (existingIndex >= 0) {
      const [existing] = this.entries.splice(existingIndex, 1);
      if (existing !== undefined) this.totalBytes -= existing.byteLength;
    }

    while (
      this.entries.length >= WORK_HISTORY_LIMITS.maxRecords ||
      this.totalBytes + byteLength > WORK_HISTORY_LIMITS.maxTotalBytes
    ) {
      const removed = this.entries.shift();
      if (removed === undefined) break;
      this.totalBytes -= removed.byteLength;
    }

    this.entries.push({ record: cloneRecord(record), byteLength });
    this.totalBytes += byteLength;
    return true;
  }

  get(historyId: string): WorkHistoryRecord | undefined {
    const entry = this.entries.find((item) => item.record.historyId === historyId);
    return entry === undefined ? undefined : cloneRecord(entry.record);
  }

  getSnapshot(): WorkHistorySnapshot {
    return {
      records: this.entries.slice().reverse().map((entry) => cloneRecord(entry.record)),
      totalBytes: this.totalBytes,
      limits: WORK_HISTORY_LIMITS,
    };
  }

  clear(): void {
    this.entries.length = 0;
    this.totalBytes = 0;
  }
}
