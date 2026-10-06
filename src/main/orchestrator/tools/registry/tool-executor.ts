import { getToolWriteEvidence } from "./file-write-evidence";
import { isAbortError } from "../../../abort-utils";
import type { ToolContext } from "./tool-context";
import type { ToolDefinition } from "./tool-registry";
import { normalizeToolExecutionOutcome } from "./tool-outcome-normalizer";
import {
  ToolExecutionError,
  type ToolEffectState,
  type ToolErrorCategory,
} from "./tool-execution-error";
import type { ToolExecutionOutcome } from "../../types";

function isCategory(value: unknown): value is ToolErrorCategory {
  return typeof value === "string" && [
    "transient", "timeout", "rate_limited", "not_found", "permission_denied",
    "invalid_arguments", "semantic_failure", "partial_failure", "fatal", "runtime_safety",
  ].includes(value);
}

function effectState(value: unknown): ToolEffectState {
  return value === "unknown" ? "unknown" : "not_applied";
}

function legacyFailure(output: string): ToolExecutionOutcome | undefined {
  const trimmed = output.trimStart();
  if (trimmed.startsWith("[错误]")) {
    return {
      status: "failed",
      output,
      errorCode: "E_LEGACY_TOOL_ERROR",
      category: "semantic_failure",
      effectState: "not_applied",
    };
  }
  if (trimmed.startsWith("[拒绝]")) {
    return {
      status: "failed",
      output,
      errorCode: "E_LEGACY_TOOL_REJECTED",
      category: "permission_denied",
      effectState: "not_applied",
    };
  }

  try {
    const parsed = JSON.parse(output) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") return undefined;
    // Explicit failure facts distinguish cancellation before launch from a started
    // command timeout. Keep the old timeout defaults for tools without those facts.
    if (parsed.timedOut === true) {
      const explicitFailure = parsed.success === false;
      return {
        status: "failed",
        output,
        errorCode: explicitFailure && typeof parsed.errorCode === "string" ? parsed.errorCode : "E_TOOL_TIMEOUT",
        category: explicitFailure && isCategory(parsed.category) ? parsed.category : "timeout",
        retryable: false,
        effectState: explicitFailure && parsed.effectState === "not_applied" ? "not_applied" : "unknown",
      };
    }
    if (parsed.success !== false) return undefined;
    const message = typeof parsed.error === "string"
      ? parsed.error
      : parsed.error === undefined ? output : JSON.stringify(parsed.error);
    return {
      status: "failed",
      output: message,
      errorCode: typeof parsed.errorCode === "string" ? parsed.errorCode : "E_TOOL_BUSINESS_FAILED",
      category: isCategory(parsed.category) ? parsed.category : "semantic_failure",
      retryable: parsed.retryable === true,
      effectState: effectState(parsed.effectState),
    };
  } catch {
    return undefined;
  }
}

/**
 * Single execution boundary for registered tools.
 *
 * The legacy return-value compatibility is temporary. It recognizes only an
 * explicit `success:false` JSON payload or a leading `[错误]` / `[拒绝]` marker.
 */
export async function executeToolDefinition(
  tool: ToolDefinition,
  args: Record<string, unknown>,
  context?: ToolContext,
): Promise<ReturnType<typeof normalizeToolExecutionOutcome>> {
  const normalize = (outcome: ToolExecutionOutcome) => {
    const writes = getToolWriteEvidence(context);
    return normalizeToolExecutionOutcome({ ...outcome, ...(writes.length ? { writes } : {}) });
  };
  try {
    const output = await tool.execute(args, context);
    const legacy = legacyFailure(output);
    return normalize(legacy ?? {
      status: "succeeded",
      output,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (error instanceof ToolExecutionError) {
      return normalize({
        status: "failed",
        output: error.message,
        errorCode: error.code,
        category: error.category,
        retryable: error.retryable,
        effectState: error.effectState,
      });
    }

    const message = error instanceof Error ? error.message : String(error);
    const explicitCode = typeof error === "object" && error !== null && "code" in error
      && typeof (error as { code?: unknown }).code === "string"
      ? String((error as { code: string }).code)
      : undefined;
    return normalize({
      status: "failed",
      output: message,
      errorCode: explicitCode ?? "E_TOOL_EXECUTION_FAILED",
      effectState: "not_applied",
    });
  }
}
