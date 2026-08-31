import type { ToolCall, ToolCallResult, ToolContext } from "../../../shared/tool-types";
import type { ToolCallOutcome } from "../../../shared/harness-types";
import type { FireflyToolDispatcher } from "../../tools/tool-dispatcher";
import { truncateToolOutput } from "./tool-truncation";

export interface ToolRoundOptions {
  dispatcher: FireflyToolDispatcher;
  toolTimeoutMs: number;
  userQuery: string;
  conversationId?: string;
  signal?: AbortSignal;
}

export interface ExecutedToolObservation {
  call: ToolCall;
  result: ToolCallResult;
  outcome: ToolCallOutcome;
  preview: string;
  truncated: boolean;
}

export async function executeToolRound(
  toolCalls: ToolCall[],
  options: ToolRoundOptions,
): Promise<ExecutedToolObservation[]> {
  const observations: ExecutedToolObservation[] = [];

  for (const call of toolCalls) {
    if (options.signal?.aborted) {
      observations.push({
        call,
        result: {
          toolCallId: call.id,
          name: call.name,
          output: JSON.stringify({ ok: false, error: "cancelled", message: "Run was cancelled before tool execution" }),
          isError: true,
        },
        outcome: "not_executed",
        preview: "（用户取消）",
        truncated: false,
      });
      continue;
    }

    const toolAbortController = new AbortController();
    const timeoutTimer = setTimeout(() => {
      toolAbortController.abort();
    }, options.toolTimeoutMs);

    const mergedSignal = options.signal
      ? anySignal([options.signal, toolAbortController.signal])
      : toolAbortController.signal;

    const ctx: ToolContext = {
      userQuery: options.userQuery,
      conversationId: options.conversationId,
      signal: mergedSignal,
    };

    try {
      const rawResult = await options.dispatcher.executeToolCall(call, ctx);
      const { preview, truncated } = truncateToolOutput(rawResult.output);

      let outcome: ToolCallOutcome = rawResult.isError ? "failure" : "success";
      try {
        const parsed = JSON.parse(rawResult.output);
        if (parsed.ok === false) {
          outcome = "failure";
        }
      } catch {}

      observations.push({
        call,
        result: {
          ...rawResult,
          output: preview,
        },
        outcome,
        preview,
        truncated,
      });
    } catch (err: any) {
      const isTimeout = toolAbortController.signal.aborted;
      const isCancel = options.signal?.aborted;
      const errMsg = err?.message || String(err);
      const output = JSON.stringify({
        ok: false,
        error: isTimeout ? "timeout" : isCancel ? "cancelled" : "execution_error",
        message: errMsg,
      });

      observations.push({
        call,
        result: {
          toolCallId: call.id,
          name: call.name,
          output,
          isError: true,
        },
        outcome: isTimeout ? "unknown" : "failure",
        preview: output,
        truncated: false,
      });
    } finally {
      clearTimeout(timeoutTimer);
    }
  }

  return observations;
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort();
      return controller.signal;
    }
    sig.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}
