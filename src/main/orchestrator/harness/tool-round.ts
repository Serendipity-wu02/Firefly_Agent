import type { ToolCall, ToolCallResult } from "../../../shared/tool-types";
import type { CapabilityRequester } from "../../../shared/capability-types";
import type { ToolCallOutcome } from "../../../shared/agent-types";
import type { ApprovalRequest } from "../../../shared/approval-types";
import type { CapabilityAuthorizationOutcome } from "../../../shared/runtime-integration-types";
import type { ToolExecutionEngine } from "../../runtime/execution/tool-execution-engine";
import type {
  MainAgentDelegationBudget,
  MainAgentDelegationService,
} from "../../runtime/subagents/main-agent-delegation";
import type { HarnessAuthorizationAdapter } from "./harness-authorization-adapter";

export interface ToolRoundOptions {
  executionEngine: ToolExecutionEngine;
  runId: string;
  step: number;
  userQuery: string;
  conversationId?: string;
  signal?: AbortSignal;
  toolCallsCount: number;
  maxToolCallsPerRun: number;
  authorizationAdapter?: HarnessAuthorizationAdapter;
  allowedToolIds?: ReadonlySet<string>;
  requireAuthorizationForAllTools?: boolean;
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

  for (let index = 0; index < toolCalls.length; index++) {
    const call = toolCalls[index];
    options.onCallStart?.(call, index);

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
