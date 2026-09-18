import type {
  AgentRequiredToolExecution,
  AgentRunResult,
  AgentToolCallEvidence,
} from "../../shared/agent-types";
import { BROWSER_READ_TOOL_ID } from "./browser-tool";
import { normalizeBrowserUrl } from "./browser-policy";

export interface BrowserReadIntent {
  readonly kind: "current_read";
  /** Empty when the user asked for a new read but did not provide a URL. */
  readonly targetUrls: readonly string[];
}

export type BrowserReadExecutionState =
  | "succeeded"
  | "failed"
  | "unknown"
  | "not_executed";

export interface BrowserReadExecutionResolution {
  readonly state: BrowserReadExecutionState;
  readonly runId: string;
  readonly targetUrls: readonly string[];
  readonly toolCallId?: string;
  readonly replyText: string;
}

const EXPLICIT_CURRENT_READ_PATTERNS: readonly RegExp[] = [
  /重新读取/u,
  /再次读取/u,
  /重新读/u,
  /再次读/u,
  /再读/u,
  /只根据本次(?:读取)?结果回答/u,
  /本次读取/u,
  /读取(?:一下|网页|页面|刚才那个)/u,
  /打开(?:一下|网页|页面|刚才那个)/u,
  /查看(?:一下|网页|页面|刚才那个)/u,
];

const HISTORY_REVIEW_PATTERNS: readonly RegExp[] = [
  /回顾/u,
  /上次(?:读取|读到|结果)/u,
  /此前(?:读取|读到|结果)/u,
  /之前(?:读取|读到|结果)/u,
  /历史(?:读取|结果)/u,
];

function hasMatch(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Main-owned intent boundary. It only decides whether the current user turn
 * asks for a fresh Browser observation; it never calls the Browser reader.
 */
export function resolveBrowserReadIntent(
  userMessage: string,
  targetUrls: readonly string[],
): BrowserReadIntent | undefined {
  const normalizedTargets = Object.freeze([...targetUrls]);
  const explicitCurrentRead = hasMatch(userMessage, EXPLICIT_CURRENT_READ_PATTERNS);
  const historyReview = hasMatch(userMessage, HISTORY_REVIEW_PATTERNS);

  if (historyReview && !explicitCurrentRead) return undefined;
  if (normalizedTargets.length > 0 || explicitCurrentRead) {
    return { kind: "current_read", targetUrls: normalizedTargets };
  }
  return undefined;
}

export function createBrowserReadExecutionRequirement(
  targetUrl: string,
): AgentRequiredToolExecution {
  return {
    toolName: BROWSER_READ_TOOL_ID,
    arguments: { requestUrl: targetUrl },
    argumentMatching: "normalized_url",
    successContract: "json_ok_true",
    correction: "once",
  };
}

function parseRecord(output: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(output);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeEvidenceUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeBrowserUrl(value);
  return normalized.allowed ? normalized.url.href : undefined;
}

function evidenceTarget(evidence: AgentToolCallEvidence): string | undefined {
  return evidence.toolName === BROWSER_READ_TOOL_ID
    ? normalizeEvidenceUrl(evidence.arguments.requestUrl)
    : undefined;
}

function isCurrentTargetEvidence(
  evidence: AgentToolCallEvidence,
  result: AgentRunResult,
  targetUrls: readonly string[],
): boolean {
  if (evidence.runId !== result.runId || evidence.toolName !== BROWSER_READ_TOOL_ID) {
    return false;
  }
  const target = evidenceTarget(evidence);
  if (target === undefined || !targetUrls.includes(target)) return false;
  const output = parseRecord(evidence.output);
  return output?.ok === true && normalizeEvidenceUrl(output.sourceUrl) === target;
}

function hasCurrentEvidence(
  result: AgentRunResult,
  targetUrls: readonly string[],
): AgentToolCallEvidence | undefined {
  return result.toolCallEvidence?.find((evidence) =>
    evidence.outcome === "success" &&
    evidence.isError === false &&
    isCurrentTargetEvidence(evidence, result, targetUrls)
  );
}

function hasMatchingEvidence(
  evidence: AgentToolCallEvidence,
  result: AgentRunResult,
  targetUrls: readonly string[],
): boolean {
  if (evidence.runId !== result.runId || evidence.toolName !== BROWSER_READ_TOOL_ID) {
    return false;
  }
  const target = evidenceTarget(evidence);
  return target !== undefined && targetUrls.includes(target);
}

function isUnknownEvidence(evidence: AgentToolCallEvidence): boolean {
  const output = parseRecord(evidence.output);
  const error = output?.error;
  return evidence.outcome === "unknown" ||
    error === "tool_timeout" ||
    error === "tool_cancelled" ||
    error === "CANCELLED" ||
    error === "execution_exception" ||
    error === "engine_internal_error";
}

/**
 * Resolves the visible Browser outcome only from this run's evidence. A
 * previous transcript entry is intentionally never an input to this result.
 */
export function resolveBrowserReadExecution(
  intent: BrowserReadIntent,
  result: AgentRunResult,
): BrowserReadExecutionResolution {
  const currentEvidence = hasCurrentEvidence(result, intent.targetUrls);
  if (currentEvidence !== undefined) {
    return {
      state: "succeeded",
      runId: result.runId,
      targetUrls: intent.targetUrls,
      toolCallId: currentEvidence.toolCallId,
      replyText: result.finalText.trim() || "本次网页读取已完成。",
    };
  }

  const matchingEvidence = result.toolCallEvidence?.filter((evidence) =>
    hasMatchingEvidence(evidence, result, intent.targetUrls)
  ) ?? [];
  const hasUnknown = matchingEvidence.some(isUnknownEvidence);
  const hasFailure = matchingEvidence.some((evidence) =>
    evidence.outcome === "failure" || evidence.isError
  );

  if (hasUnknown || result.status === "timeout" || result.status === "cancelled") {
    return {
      state: "unknown",
      runId: result.runId,
      targetUrls: intent.targetUrls,
      ...(matchingEvidence[0] === undefined ? {} : { toolCallId: matchingEvidence[0].toolCallId }),
      replyText:
        "这次网页读取的结果无法确认；为了避免把之前的结果当成本次结果，我没有自动重试。",
    };
  }

  if (hasFailure) {
    return {
      state: "failed",
      runId: result.runId,
      targetUrls: intent.targetUrls,
      toolCallId: matchingEvidence[0]?.toolCallId,
      replyText: "这次网页读取没有完成，我没有使用之前的读取结果代替本次结果。",
    };
  }

  return {
    state: "not_executed",
    runId: result.runId,
    targetUrls: intent.targetUrls,
    replyText: intent.targetUrls.length === 0
      ? "这次请求没有提供可读取的网页地址，所以没有执行新的网页读取。"
      : "这次没有完成新的网页读取，所以不能把之前的结果当作本次结果。",
  };
}
