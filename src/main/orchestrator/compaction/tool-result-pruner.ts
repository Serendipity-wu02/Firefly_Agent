import type { ChatMessage } from "../../../shared/chat-types";

export interface PruningConfig {
  maxResultChars: number;
  headChars: number;
  tailChars: number;
  middleMarker: string;
  preserveErrors: boolean;
}

export type ToolResultPruneFailureReason =
  | "structured_result_required_fields_exceed_budget"
  | "structured_result_unknown_fields_exceed_budget"
  | "structured_result_shape_exceeds_budget"
  | "unstructured_error_exceeds_budget";

export interface ToolResultPruneResult {
  text: string;
  pruned: boolean;
  failed?: boolean;
  reason?: ToolResultPruneFailureReason;
}

export const DEFAULT_PRUNING_CONFIG: PruningConfig = {
  maxResultChars: 4_096,
  headChars: 2_048,
  tailChars: 512,
  middleMarker: "\n\n[... 工具输出过长，中间内容已自动修剪 ...]\n\n",
  preserveErrors: true,
};

const PRUNING_MARKER_KEY = "_fireflyResultPruned";

/*
 * These fields carry result identity or state. They are copied exactly; the
 * pruning pass never turns a status/error code or URL into a partial string.
 * The two nested objects are connection/execution evidence and are therefore
 * also retained as complete JSON values or cause an explicit failure.
 */
const EXACT_RESULT_KEYS = new Set([
  "ok",
  "error",
  "status",
  "reason",
  "outcome",
  "commandSubmission",
  "requestUrl",
  "sourceUrl",
  "finalUrl",
  "httpStatus",
  "redirectCount",
  "contentType",
  "titleTruncated",
  "bodyTruncated",
  "bodyPreviewTruncated",
  "messageTruncated",
  "untrustedContent",
  "toolCallId",
  "runId",
  "step",
  "requestId",
  "operationId",
  "executionId",
  "correlationId",
  "connection",
  "selectionId",
  "fileSelectionId",
  "fileId",
  "fileKind",
  "byteLength",
  "bytesRead",
  "bodyCodePoints",
  "complete",
  "contentTruncated",
  "integrity",
  "encoding",
  "displayName",
  "displayNameTruncated",
]);

const OPTIONAL_RESULT_KEYS = new Set([
  "message",
  "title",
  "body",
  "bodyPreview",
  "action",
  "target",
  "playerStateObservation",
  "alias",
]);

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function boundedText(value: string, maxCodePoints: number, marker: string): string {
  const codePoints = Array.from(value);
  if (codePoints.length <= maxCodePoints) return value;
  if (maxCodePoints <= 0) return "";

  const markerCodePoints = Array.from(marker);
  if (markerCodePoints.length >= maxCodePoints) {
    return codePoints.slice(0, maxCodePoints).join("");
  }

  const available = maxCodePoints - markerCodePoints.length;
  const headCount = Math.ceil(available / 2);
  const tailCount = available - headCount;
  return [
    codePoints.slice(0, headCount).join(""),
    marker,
    tailCount > 0 ? codePoints.slice(-tailCount).join("") : "",
  ].join("");
}

function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => cloneJsonValue(entry));
  if (isJsonRecord(value)) {
    const copy: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      copy[key] = cloneJsonValue(child);
    }
    return copy;
  }
  return value;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serializedCodePointLength(value: Record<string, unknown>): number {
  return codePointLength(JSON.stringify(value));
}

function setFieldTruncated(result: Record<string, unknown>, key: string): void {
  if (key === "title") result.titleTruncated = true;
  if (key === "body") {
    result.bodyTruncated = true;
    if (Object.prototype.hasOwnProperty.call(result, "fileId") ||
        Object.prototype.hasOwnProperty.call(result, "fileSelectionId")) {
      result.contentTruncated = true;
      result.complete = false;
    }
  }
  if (key === "bodyPreview") result.bodyPreviewTruncated = true;
  if (key === "message") result.messageTruncated = true;
}

function removeOptionalField(result: Record<string, unknown>, key: string): void {
  delete result[key];
  setFieldTruncated(result, key);
}

function buildStructuredResult(parsed: Record<string, unknown>): {
  result: Record<string, unknown>;
  optionalStrings: Map<string, string>;
  unknownKeys: readonly string[];
} {
  const result: Record<string, unknown> = {};
  const optionalStrings = new Map<string, string>();
  const unknownKeys: string[] = [];

  for (const [key, value] of Object.entries(parsed)) {
    if (key === PRUNING_MARKER_KEY) {
      if (value === true) {
        result[key] = true;
      } else {
        unknownKeys.push(key);
      }
      continue;
    }
    if (EXACT_RESULT_KEYS.has(key)) {
      result[key] = cloneJsonValue(value);
      continue;
    }
    if (OPTIONAL_RESULT_KEYS.has(key) && typeof value === "string") {
      result[key] = value;
      optionalStrings.set(key, value);
      continue;
    }
    unknownKeys.push(key);
  }

  result[PRUNING_MARKER_KEY] = true;
  return { result, optionalStrings, unknownKeys };
}

function pruneStructuredJson(text: string, config: PruningConfig): ToolResultPruneResult | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isJsonRecord(parsed)) {
    return {
      text,
      pruned: false,
      failed: true,
      reason: "structured_result_shape_exceeds_budget",
    };
  }

  const { result, optionalStrings, unknownKeys } = buildStructuredResult(parsed);
  if (unknownKeys.length > 0) {
    return {
      text,
      pruned: false,
      failed: true,
      reason: "structured_result_unknown_fields_exceed_budget",
    };
  }
  const requiredKeys = new Set<string>([
    ...Object.keys(result).filter((key) =>
      key !== PRUNING_MARKER_KEY && !OPTIONAL_RESULT_KEYS.has(key),
    ),
  ]);

  // Required values are never shortened. If these alone cannot fit, returning
  // a marker-only object would erase the meaning of the tool result.
  const requiredOnly: Record<string, unknown> = {};
  for (const key of requiredKeys) requiredOnly[key] = result[key];
  if (serializedCodePointLength(requiredOnly) > config.maxResultChars) {
    return {
      text: JSON.stringify(requiredOnly),
      pruned: false,
      failed: true,
      reason: "structured_result_required_fields_exceed_budget",
    };
  }

  const optionalKeys = [...optionalStrings.keys()];
  let serializedLength = serializedCodePointLength(result);
  while (serializedLength > config.maxResultChars && optionalKeys.length > 0) {
    const key = optionalKeys
      .filter((entry) => typeof result[entry] === "string")
      .sort((left, right) =>
        codePointLength(String(result[right])) - codePointLength(String(result[left])),
      )[0];
    if (key === undefined) break;

    const current = String(result[key]);
    const excess = serializedLength - config.maxResultChars;
    const targetLength = Math.max(0, codePointLength(current) - Math.max(1, excess));
    const next = boundedText(
      optionalStrings.get(key) ?? current,
      targetLength,
      config.middleMarker,
    );
    if (next === current) {
      removeOptionalField(result, key);
    } else {
      result[key] = next;
      if (next !== current) setFieldTruncated(result, key);
    }
    serializedLength = serializedCodePointLength(result);
  }

  // Optional content may be omitted completely, but its corresponding
  // truncation fact remains explicit. This loop never touches required data.
  for (const key of optionalKeys) {
    if (serializedLength <= config.maxResultChars) break;
    if (!(key in result)) continue;
    removeOptionalField(result, key);
    serializedLength = serializedCodePointLength(result);
  }

  if (serializedLength > config.maxResultChars) {
    return {
      text: JSON.stringify(requiredOnly),
      pruned: false,
      failed: true,
      reason: "structured_result_required_fields_exceed_budget",
    };
  }

  return { text: JSON.stringify(result), pruned: true };
}

/**
 * ToolResultPruner (工具结果上下文级修剪器)
 *
 * Structured results are pruned by field. Unstructured errors are never
 * head/tail shortened because that could remove their error identity; they
 * produce an explicit pruning failure instead.
 */
export class ToolResultPruner {
  static pruneText(
    text: string,
    customConfig?: Partial<PruningConfig>,
    isError?: boolean,
  ): ToolResultPruneResult {
    if (!text) return { text: "", pruned: false };

    const config: PruningConfig = { ...DEFAULT_PRUNING_CONFIG, ...customConfig };
    const chars = Array.from(text);
    if (chars.length <= config.maxResultChars) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
      if (isJsonRecord(parsed) && parsed[PRUNING_MARKER_KEY] === true) {
        const { unknownKeys } = buildStructuredResult(parsed);
        if (unknownKeys.length > 0) {
          return {
            text,
            pruned: false,
            failed: true,
            reason: "structured_result_unknown_fields_exceed_budget",
          };
        }
      }
      return { text, pruned: false };
    }

    const structured = pruneStructuredJson(text, config);
    if (structured !== undefined) return structured;

    if (isError) {
      return {
        text,
        pruned: false,
        failed: true,
        reason: "unstructured_error_exceeds_budget",
      };
    }

    const requestedText = [
      chars.slice(0, config.headChars).join(""),
      config.middleMarker,
      chars.slice(-config.tailChars).join(""),
    ].join("");
    const prunedText = codePointLength(requestedText) < config.maxResultChars
      ? requestedText
      : boundedText(text, Math.max(0, config.maxResultChars - 1), config.middleMarker);

    return { text: prunedText, pruned: true };
  }

  static pruneMessage(
    message: ChatMessage,
    customConfig?: Partial<PruningConfig>,
  ): ToolResultPruneResult & { message: ChatMessage } {
    if (message.role !== "tool") {
      return { message, text: message.content, pruned: false };
    }

    const content = message.content || "";
    let isError = false;
    try {
      const parsed: unknown = JSON.parse(content);
      isError = isJsonRecord(parsed) && parsed.ok === false;
    } catch {}

    const outcome = this.pruneText(content, customConfig, isError);
    if (!outcome.pruned) return { ...outcome, message };

    return {
      ...outcome,
      message: { ...message, content: outcome.text },
    };
  }

  static pruneMessages(
    messages: ChatMessage[],
    customConfig?: Partial<PruningConfig>,
  ): {
    messages: ChatMessage[];
    prunedCount: number;
    failedCount: number;
    failureReasons: readonly ToolResultPruneFailureReason[];
  } {
    let prunedCount = 0;
    let failedCount = 0;
    const failureReasons = new Set<ToolResultPruneFailureReason>();
    const result: ChatMessage[] = [];

    for (const message of messages) {
      if (message.role !== "tool") {
        result.push(message);
        continue;
      }
      const outcome = this.pruneMessage(message, customConfig);
      if (outcome.pruned) prunedCount++;
      if (outcome.failed) {
        failedCount++;
        if (outcome.reason !== undefined) failureReasons.add(outcome.reason);
      }
      result.push(outcome.message);
    }

    return {
      messages: result,
      prunedCount,
      failedCount,
      failureReasons: [...failureReasons],
    };
  }
}
