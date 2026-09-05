import type { ToolCall, ToolCallResult } from "../../../shared/tool-types";
import type { ToolCallOutcome } from "../../../shared/agent-types";
import type { ToolExecutionEngine } from "../../runtime/execution/tool-execution-engine";

export interface ToolRoundOptions {
  executionEngine: ToolExecutionEngine;
  runId: string;
  step: number;
  userQuery: string;
  conversationId?: string;
  signal?: AbortSignal;
  toolCallsCount: number;
  maxToolCallsPerRun: number;
  onCallStart?: (call: ToolCall, index: number) => void;
}

export interface ExecutedToolObservation {
  call: ToolCall;
  result: ToolCallResult;
  outcome: ToolCallOutcome;
  preview: string;
}

/**
 * Tool-round orchestration only.
 *
 * Permission, timeout, retry, concurrency, and result policy stay inside the
 * canonical ToolExecutionEngine. This helper preserves call order and
 * aggregates observations for the Harness loop.
 */
export async function executeToolRound(
  toolCalls: ToolCall[],
  options: ToolRoundOptions,
): Promise<ExecutedToolObservation[]> {
  const observations: ExecutedToolObservation[] = [];

  for (let index = 0; index < toolCalls.length; index++) {
    const call = toolCalls[index];
    options.onCallStart?.(call, index);

    const result = await options.executionEngine.executeToolCall(call, {
      runId: options.runId,
      step: options.step,
      conversationId: options.conversationId,
      userQuery: options.userQuery,
      signal: options.signal,
      toolCallsCount: options.toolCallsCount + index + 1,
      maxToolCallsPerRun: options.maxToolCallsPerRun,
    });

    let outcome: ToolCallOutcome = result.isError ? "failure" : "success";
    try {
      const parsed = JSON.parse(result.output);
      if (parsed && parsed.ok === false) {
        outcome = "failure";
      }
    } catch {
      // Plain-text tool output is a successful observation when the engine
      // did not mark it as an error.
    }

    observations.push({
      call,
      result,
      outcome,
      preview: result.output.slice(0, 100),
    });
  }

  return observations;
}
