import type { ToolCall, ToolCallResult } from "../../../shared/tool-types";
import type { CapabilityRequester } from "../../../shared/capability-types";
import type {
  AgentRequiredToolExecution,
  ToolCallOutcome,
} from "../../../shared/agent-types";
import type { ApprovalRequest } from "../../../shared/approval-types";
import type { CapabilityAuthorizationOutcome } from "../../../shared/runtime-integration-types";
import type { ToolExecutionEngine } from "../tools/execution/tool-execution-engine";
import type {
  MainAgentDelegationBudget,
  MainAgentDelegationService,
} from "../subagents/main-agent-delegation";
import type { HarnessAuthorizationAdapter } from "./harness-authorization-adapter";

export interface ToolRoundOptions {
  executionEngine: ToolExecutionEngine;
  runId: string;
  step: number;
  userQuery: string;
  /** Main-owned normalized URLs extracted from this user turn. */
  browserRequestTargets?: readonly string[];
  conversationId?: string;
  signal?: AbortSignal;
  toolCallsCount: number;
  maxToolCallsPerRun: number;
  authorizationAdapter?: HarnessAuthorizationAdapter;
  allowedToolIds?: ReadonlySet<string>;
  requireAuthorizationForAllTools?: boolean;
  /** Rejects model tool calls before authorization or ToolExecutionEngine. */
  rejectAllToolCalls?: boolean;
  /** Restricts a typed execution-intent run to one exact required tool operation. */
  requiredToolExecution?: AgentRequiredToolExecution;
  /** True after this run has already observed its required tool call. */
  requiredToolCallAlreadyObserved?: boolean;
  requester?: CapabilityRequester;
  mainDelegationService?: MainAgentDelegationService;
  getMainDelegationBudget?: () => MainAgentDelegationBudget;
  onDelegationBudgetReserved?: (budget: {
    readonly maxSteps: number;
    readonly maxToolCalls: number;
  }) => void;
  onCallStart?: (call: ToolCall, index: number) => void;
  onPermissionWaiting?: (
    call: ToolCall,
    approvalRequest: ApprovalRequest,
  ) => void | Promise<void>;
  onPermissionResolved?: (
    call: ToolCall,
    approvalRequest: ApprovalRequest,
    outcome: CapabilityAuthorizationOutcome,
  ) => void | Promise<void>;
}

export interface ExecutedToolObservation {
  call: ToolCall;
  result: ToolCallResult;
  outcome: ToolCallOutcome;
  preview: string;
}

interface ApprovalBarrier {
  readonly originatingToolCallId: string;
  readonly approvalRequestId: string;
}

interface DelegationBarrier {
  readonly originatingToolCallId: string;
  readonly taskId?: string;
}

function deferredAfterApprovalResult(
  call: ToolCall,
  barrier: ApprovalBarrier,
): ToolCallResult {
  return {
    toolCallId: call.id,
    name: call.name,
    output: JSON.stringify({
      ok: false,
      error: "deferred_after_approval",
      outcome: "not_executed",
      message:
        "Tool call was deferred because an earlier tool call waited for user approval. " +
        "The next LLM round may re-plan it.",
      deferredByToolCallId: barrier.originatingToolCallId,
      approvalRequestId: barrier.approvalRequestId,
    }),
    isError: true,
  };
}

function deferredAfterDelegationResult(
  call: ToolCall,
  barrier: DelegationBarrier,
): ToolCallResult {
  return {
    toolCallId: call.id,
    name: call.name,
    output: JSON.stringify({
      ok: false,
      error: "deferred_after_delegation",
      outcome: "not_executed",
      message:
        "Tool call was deferred because a delegated worker completed earlier in this round. " +
        "The next MAIN LLM round must consume that observation before taking more action.",
      deferredByToolCallId: barrier.originatingToolCallId,
      ...(barrier.taskId !== undefined ? { taskId: barrier.taskId } : {}),
    }),
    isError: true,
  };
}

function workerToolRejectionResult(call: ToolCall, error: string, message: string): ToolCallResult {
  return {
    toolCallId: call.id,
    name: call.name,
    output: JSON.stringify({ ok: false, error, message }),
    isError: true,
  };
}

function restrictedToolRejectionResult(call: ToolCall): ToolCallResult {
  return {
    toolCallId: call.id,
    name: call.name,
    output: JSON.stringify({
      ok: false,
      error: "tool_surface_empty",
      outcome: "not_executed",
      message: "This Agent run has no tool execution surface.",
    }),
    isError: true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownExecutionOutput(output: string): boolean {
  try {
    const parsed: unknown = JSON.parse(output);
    if (!isRecord(parsed)) return false;
    if (parsed.commandSubmission === "unknown" || parsed.outcome === "unknown") return true;
    const error = parsed.error;
    return error === "tool_timeout" ||
      error === "tool_cancelled" ||
      error === "CANCELLED" ||
      error === "execution_exception" ||
      error === "engine_internal_error";
  } catch {
    return false;
  }
}

function requiredValueMatches(expected: unknown, actual: unknown): boolean {
  if (Object.is(expected, actual)) return true;
  if (Array.isArray(expected)) {
    return Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((value, index) => requiredValueMatches(value, actual[index]));
  }
  if (!isRecord(expected) || !isRecord(actual)) return false;
  const entries = Object.entries(expected);
  return entries.every(([key, value]) =>
    Object.prototype.hasOwnProperty.call(actual, key) && requiredValueMatches(value, actual[key])
  );
}

function normalizeRequiredUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    if ((parsed.protocol === "http:" && parsed.port === "80") ||
      (parsed.protocol === "https:" && parsed.port === "443")) {
      parsed.port = "";
    }
    parsed.hash = "";
    return parsed.href;
  } catch {
    return undefined;
  }
}

function requiredArgumentsMatch(
  expected: Readonly<Record<string, unknown>>,
  actual: Readonly<Record<string, unknown>>,
  argumentMatching: AgentRequiredToolExecution["argumentMatching"],
): boolean {
  if (argumentMatching !== "normalized_url") {
    return requiredValueMatches(expected, actual);
  }

  const expectedUrl = normalizeRequiredUrl(expected.requestUrl);
  const actualUrl = normalizeRequiredUrl(actual.requestUrl);
  if (expectedUrl === undefined || actualUrl === undefined || expectedUrl !== actualUrl) {
    return false;
  }

  const { requestUrl: _expectedRequestUrl, ...expectedRest } = expected;
  const { requestUrl: _actualRequestUrl, ...actualRest } = actual;
  return requiredValueMatches(expectedRest, actualRest);
}

export function matchesRequiredToolExecution(
  call: ToolCall,
  requirement: AgentRequiredToolExecution,
): boolean {
  return call.name === requirement.toolName &&
    requiredArgumentsMatch(requirement.arguments, call.arguments, requirement.argumentMatching);
}

function requiredToolRejectionResult(
  call: ToolCall,
  error: "required_tool_mismatch" | "required_tool_already_submitted",
  message: string,
): ToolCallResult {
  return {
    toolCallId: call.id,
    name: call.name,
    output: JSON.stringify({ ok: false, error, outcome: "not_executed", message }),
    isError: true,
  };
}

/**
 * Tool-round orchestration only.
 *
 * The optional authorization adapter only handles its registered routes
 * path. ToolExecutionEngine remains the owner of tool policy, timeout, retry,
 * concurrency, dispatch, and result policy. This helper preserves call order
 * and aggregates observations for the Harness loop.
 */
export async function executeToolRound(
  toolCalls: ToolCall[],
  options: ToolRoundOptions,
): Promise<ExecutedToolObservation[]> {
  const observations: ExecutedToolObservation[] = [];
  let approvalBarrier: ApprovalBarrier | undefined;
  let delegationBarrier: DelegationBarrier | undefined;
  let requiredToolCallObserved = options.requiredToolCallAlreadyObserved === true;

  for (let index = 0; index < toolCalls.length; index++) {
    const call = toolCalls[index];
    options.onCallStart?.(call, index);

    if (options.rejectAllToolCalls === true) {
      const result = restrictedToolRejectionResult(call);
      observations.push({
        call,
        result,
        outcome: "not_executed",
        preview: result.output.slice(0, 100),
      });
      continue;
    }

    if (options.requiredToolExecution !== undefined) {
      if (!matchesRequiredToolExecution(call, options.requiredToolExecution)) {
        const result = requiredToolRejectionResult(
          call,
          "required_tool_mismatch",
          "This call does not match the typed tool operation required for the current user request.",
        );
        observations.push({
          call,
          result,
          outcome: "not_executed",
          preview: result.output.slice(0, 100),
        });
        continue;
      }
      if (requiredToolCallObserved) {
        const result = requiredToolRejectionResult(
          call,
          "required_tool_already_submitted",
          "The required tool operation was already submitted once for this Agent run.",
        );
        observations.push({
          call,
          result,
          outcome: "not_executed",
          preview: result.output.slice(0, 100),
        });
        continue;
      }
      // Mark before authorization/execution so timeout or unknown submission
      // can never cause this run to submit the external operation again.
      requiredToolCallObserved = true;
    }

    if (options.allowedToolIds !== undefined && !options.allowedToolIds.has(call.name)) {
      const result = workerToolRejectionResult(
        call,
        "worker_capability_not_declared",
        `Worker tool "${call.name}" is outside the declared capability surface.`,
      );
      observations.push({
        call,
        result,
        outcome: "failure",
        preview: result.output.slice(0, 100),
      });
      continue;
    }

    if (options.requireAuthorizationForAllTools &&
      options.authorizationAdapter?.handles(call) !== true) {
      const result = workerToolRejectionResult(
        call,
        "worker_authorization_route_missing",
        `Worker tool "${call.name}" has no canonical authorization route.`,
      );
      observations.push({
        call,
        result,
        outcome: "failure",
        preview: result.output.slice(0, 100),
      });
      continue;
    }

    const context = {
      runId: options.runId,
      step: options.step,
      toolCallId: call.id,
      conversationId: options.conversationId,
      userQuery: options.userQuery,
      browserRequestTargets: options.browserRequestTargets,
      signal: options.signal,
      toolCallsCount: options.toolCallsCount + index + 1,
      maxToolCallsPerRun: options.maxToolCallsPerRun,
      ...(options.requester ? { requester: options.requester } : {}),
    };

    let result: ToolCallResult;
    if (options.mainDelegationService?.handles(call)) {
      const execution = await options.mainDelegationService.execute(call, {
        parentRunId: options.runId,
        ...(options.conversationId !== undefined
          ? { parentConversationId: options.conversationId }
          : {}),
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
        budget: options.getMainDelegationBudget?.() ?? {
          availableWorkerSteps: 0,
          availableWorkerToolCalls: 0,
          remainingTimeoutMs: 0,
        },
      });
      result = execution.result;
      if (execution.reservedBudget !== undefined) {
        options.onDelegationBudgetReserved?.(execution.reservedBudget);
      }
      delegationBarrier = {
        originatingToolCallId: call.id,
        ...(execution.taskId !== undefined ? { taskId: execution.taskId } : {}),
      };
    } else if (options.authorizationAdapter?.handles(call)) {
      result = await options.authorizationAdapter.execute(call, context, {
          onPendingApproval: async (approvalRequest) => {
            approvalBarrier = {
              originatingToolCallId: call.id,
              approvalRequestId: approvalRequest.approvalRequestId,
            };
            await options.onPermissionWaiting?.(call, approvalRequest);
          },
          onApprovalResolved: async (approvalRequest, outcome) => {
            await options.onPermissionResolved?.(call, approvalRequest, outcome);
          },
        });
    } else {
      result = await options.executionEngine.executeToolCall(call, context);
    }

    let outcome: ToolCallOutcome = isUnknownExecutionOutput(result.output)
      ? "unknown"
      : result.isError
        ? "failure"
        : "success";
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

    if (approvalBarrier !== undefined) {
      for (let deferredIndex = index + 1; deferredIndex < toolCalls.length; deferredIndex++) {
        const deferredCall = toolCalls[deferredIndex];
        const deferredResult = deferredAfterApprovalResult(deferredCall, approvalBarrier);
        observations.push({
          call: deferredCall,
          result: deferredResult,
          outcome: "not_executed",
          preview: deferredResult.output.slice(0, 100),
        });
      }
      break;
    }
    if (delegationBarrier !== undefined) {
      for (let deferredIndex = index + 1; deferredIndex < toolCalls.length; deferredIndex++) {
        const deferredCall = toolCalls[deferredIndex];
        const deferredResult = deferredAfterDelegationResult(deferredCall, delegationBarrier);
        observations.push({
          call: deferredCall,
          result: deferredResult,
          outcome: "not_executed",
          preview: deferredResult.output.slice(0, 100),
        });
      }
      break;
    }
  }

  return observations;
}
