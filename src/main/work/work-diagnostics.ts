import fs from "node:fs";
import path from "node:path";

export type WorkDiagnosticType =
  | "selection_created"
  | "plan_started"
  | "plan_finished"
  | "run_started"
  | "tool_call"
  | "authorization"
  | "file_read_result"
  | "run_finished";

export interface WorkDiagnosticEvent {
  readonly type: WorkDiagnosticType;
  readonly timestamp?: number;
  readonly taskId?: string;
  readonly runId?: string;
  readonly selectionId?: string;
  readonly fileIds?: readonly string[];
  readonly fileCount?: number;
  readonly totalBytes?: number;
  readonly fileReadMode?: "optional" | "required";
  readonly toolName?: string;
  readonly toolCallCount?: number;
  readonly toolNames?: readonly string[];
  readonly approvalStatus?: "pending" | "resolved";
  readonly authorizationStatus?: string;
  readonly outcome?: string;
  readonly ok?: boolean;
  readonly errorCode?: string;
  readonly bytesRead?: number;
  readonly bodyCodePoints?: number;
  readonly complete?: boolean;
  readonly contentTruncated?: boolean;
  readonly integrity?: string;
  readonly untrustedContent?: boolean;
  readonly status?: string;
}

export interface WorkDiagnosticSink {
  record(event: WorkDiagnosticEvent): void;
}

export const WORK_DIAGNOSTIC_LOG_FILE = "work-file-runs.jsonl" as const;

export class FileWorkDiagnosticSink implements WorkDiagnosticSink {
  readonly filePath: string;
  private enabled = true;

  constructor(logDirectory: string) {
    this.filePath = path.join(logDirectory, WORK_DIAGNOSTIC_LOG_FILE);
    try {
      fs.mkdirSync(logDirectory, { recursive: true });
    } catch {
      this.enabled = false;
    }
  }

  record(event: WorkDiagnosticEvent): void {
    if (!this.enabled) return;
    try {
      fs.appendFileSync(
        this.filePath,
        `${JSON.stringify({ ...event, timestamp: event.timestamp ?? Date.now() })}\n`,
        { encoding: "utf8" },
      );
    } catch {
      // Diagnostics must never change the Work execution result.
    }
  }
}

export class InMemoryWorkDiagnosticSink implements WorkDiagnosticSink {
  readonly events: WorkDiagnosticEvent[] = [];

  record(event: WorkDiagnosticEvent): void {
    this.events.push({ ...event, ...(event.fileIds === undefined ? {} : { fileIds: [...event.fileIds] }) });
  }
}

export function summarizeFileReadOutput(
  output: string,
): Pick<WorkDiagnosticEvent, "ok" | "errorCode" | "bytesRead" | "bodyCodePoints" | "complete" | "contentTruncated" | "integrity" | "untrustedContent"> {
  try {
    const parsed: unknown = JSON.parse(output);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ok: false, errorCode: "invalid_result_shape" };
    }
    const record = parsed as Record<string, unknown>;
    return {
      ...(typeof record.ok === "boolean" ? { ok: record.ok } : { ok: false }),
      ...(typeof record.error === "string" ? { errorCode: record.error } : {}),
      ...(typeof record.bytesRead === "number" ? { bytesRead: record.bytesRead } : {}),
      ...(typeof record.bodyCodePoints === "number" ? { bodyCodePoints: record.bodyCodePoints } : {}),
      ...(typeof record.complete === "boolean" ? { complete: record.complete } : {}),
      ...(typeof record.contentTruncated === "boolean" ? { contentTruncated: record.contentTruncated } : {}),
      ...(typeof record.integrity === "string" ? { integrity: record.integrity } : {}),
      ...(typeof record.untrustedContent === "boolean" ? { untrustedContent: record.untrustedContent } : {}),
    };
  } catch {
    return { ok: false, errorCode: "invalid_result_json" };
  }
}
