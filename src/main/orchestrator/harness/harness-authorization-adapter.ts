import {
  createCapabilityRequestId,
  type CapabilityRequestId,
  type CapabilityId,
  type CapabilityJsonValue,
} from "../../../shared/capability-types";
import type {
  ApprovalRequest,
} from "../../../shared/approval-types";
import type { PermissionProfile } from "../../../shared/permission-profile-types";
import type {
  AuthorizedCapabilityCorrelation,
  CapabilityAuthorizationOutcome,
} from "../../../shared/runtime-integration-types";
import type { CapabilityAuthorizationResumeExpectation } from "../../runtime/authorization/capability-authorization-pipeline";
import type {
  SandboxProfileId,
  SandboxScope,
} from "../../../shared/sandbox-types";
import type { ToolCall, ToolCallResult } from "../../../shared/tool-types";
import { ApprovalService } from "../../runtime/approval/approval-service";
import { CapabilityAuthorizationPipeline } from "../../runtime/authorization/capability-authorization-pipeline";
import {
  AuthorizedInvocationBridge,
  type AuthorizedInvocationRuntimeContext,
} from "../../runtime/authorization/authorized-invocation-bridge";

export type HarnessAuthorizationText =
  | string
  | ((input: Readonly<Record<string, CapabilityJsonValue>>) => string);

export interface HarnessAuthorizationRoute {
  readonly toolId: string;
  readonly capabilityId: CapabilityId;
  readonly sandboxProfileId: SandboxProfileId;
  readonly requestedScope: SandboxScope;
  readonly approvalSummary: HarnessAuthorizationText;
  readonly approvalReason: HarnessAuthorizationText;
  readonly approvalTtlMs: number;
}

export interface HarnessAuthorizationAdapterOptions {
  readonly routes: readonly HarnessAuthorizationRoute[];
  readonly pipeline: CapabilityAuthorizationPipeline;
  readonly bridge: AuthorizedInvocationBridge;
  readonly approvalService: ApprovalService;
  readonly getPermissionProfile: () => PermissionProfile;
  readonly now?: () => number;
}

export interface HarnessAuthorizationLifecycleHooks {
  readonly onPendingApproval?: (approvalRequest: ApprovalRequest) => void | Promise<void>;
  readonly onApprovalResolved?: (
    approvalRequest: ApprovalRequest,
    outcome: CapabilityAuthorizationOutcome,
  ) => void | Promise<void>;
}

function cloneCapabilityValue(value: unknown): CapabilityJsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const entries: CapabilityJsonValue[] = [];
    for (const entry of value) {
      const cloned = cloneCapabilityValue(entry);
      if (cloned === undefined) return undefined;
      entries.push(cloned);
    }
    return entries;
  }

  if (typeof value === "object" && value !== null) {
    const copied: Record<string, CapabilityJsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      const cloned = cloneCapabilityValue(entry);
      if (cloned === undefined) return undefined;
      copied[key] = cloned;
    }
    return copied;
  }

  return undefined;
}

function cloneToolArguments(
  argumentsValue: Record<string, unknown>,
): Record<string, CapabilityJsonValue> | undefined {
  const copied: Record<string, CapabilityJsonValue> = {};
  for (const [key, value] of Object.entries(argumentsValue)) {
    const cloned = cloneCapabilityValue(value);
    if (cloned === undefined) return undefined;
    copied[key] = cloned;
  }
  return copied;
}

function errorResult(
  call: ToolCall,
  error: string,
  message: string,
): ToolCallResult {
  return {
    toolCallId: call.id,
    name: call.name,
    output: JSON.stringify({ ok: false, error, message }),
    isError: true,
  };
}

function remapCanonicalResult(call: ToolCall, result: ToolCallResult): ToolCallResult {
  return {
    ...result,
    toolCallId: call.id,
    name: call.name,
  };
}

function resolveAuthorizationText(
  value: HarnessAuthorizationText,
  input: Readonly<Record<string, CapabilityJsonValue>>,
): string {
  const resolved = typeof value === "function" ? value(input) : value;
  if (typeof resolved !== "string" || resolved.trim().length === 0) {
    throw new TypeError("Harness authorization presentation text must be non-empty.");
  }
  return resolved;
}

/**
 * Canonical Harness adapter for the small declarative set of migrated tools.
 * It authorizes and waits, then delegates completed invocations to the existing
 * AuthorizedInvocationBridge. Tool execution remains outside this class.
 */
export class HarnessAuthorizationAdapter {
  private readonly now: () => number;
  private readonly routes: readonly HarnessAuthorizationRoute[];

  constructor(private readonly options: HarnessAuthorizationAdapterOptions) {
    if (options.routes.length === 0) {
      throw new TypeError("Harness authorization requires at least one route.");
    }
    const routeToolIds: string[] = [];
    for (const route of options.routes) {
      if (routeToolIds.includes(route.toolId)) {
        throw new TypeError(`Harness authorization route for tool "${route.toolId}" is duplicated.`);
      }
      routeToolIds.push(route.toolId);
      if (route.approvalTtlMs <= 0 || !Number.isFinite(route.approvalTtlMs)) {
        throw new TypeError("Harness authorization approvalTtlMs must be a positive finite number.");
      }
    }
    this.routes = Object.freeze([...options.routes]);
    this.now = options.now ?? (() => Date.now());
  }

  handles(call: ToolCall): boolean {
    return this.routes.some((route) => route.toolId === call.name);
  }

  async execute(
    call: ToolCall,
    context: AuthorizedInvocationRuntimeContext,
    hooks: HarnessAuthorizationLifecycleHooks = {},
  ): Promise<ToolCallResult> {
    const route = this.routes.find((entry) => entry.toolId === call.name);
    if (route === undefined) {
      return errorResult(call, "UNMIGRATED_TOOL", "Tool is not registered in the authorization route table.");
    }

    if (context.signal?.aborted) {
      return errorResult(call, "CANCELLED", "The Harness run was cancelled before authorization.");
    }

    const input = cloneToolArguments(call.arguments);
    if (input === undefined) {
      return errorResult(
        call,
        "INVALID_AUTHORIZATION_CONTEXT",
        "Harness tool arguments must be serializable Capability input.",
      );
    }

    const requestId = createCapabilityRequestId(
      `harness:${context.runId}:${context.step}:${context.toolCallsCount}:${call.id}`,
    );
    let outcome: CapabilityAuthorizationOutcome = this.options.pipeline.authorize({
      request: {
        requestId,
        capabilityId: route.capabilityId,
        requester: context.requester ?? { type: "main-agent", id: "firefly-harness" },
        input,
      },
      sandbox: {
        profileId: route.sandboxProfileId,
        requestedScope: route.requestedScope,
      },
      permissionProfile: this.options.getPermissionProfile(),
      runtimeContext: {
        runId: context.runId,
        ...(context.conversationId !== undefined
          ? { conversationId: context.conversationId }
          : {}),
        toolCallId: call.id,
        ...(context.signal !== undefined ? { signal: context.signal } : {}),
      },
      approval: {
        summary: resolveAuthorizationText(route.approvalSummary, input),
        reason: resolveAuthorizationText(route.approvalReason, input),
        expiresAt: this.now() + route.approvalTtlMs,
      },
    });

    if (outcome.status === "PENDING_APPROVAL") {
      const approvalRequest = outcome.approvalRequest;
      await hooks.onPendingApproval?.(approvalRequest);
      outcome = await this.waitForApproval(approvalRequest, context, call.id, context.signal);
      await hooks.onApprovalResolved?.(approvalRequest, outcome);
    }

    if (outcome.status === "DENIED") {
      return errorResult(call, outcome.reason.code, outcome.reason.message);
    }
    if (outcome.status === "PENDING_APPROVAL") {
      return errorResult(
        call,
        "APPROVAL_RUNTIME_ERROR",
        "Approval request remained pending after the Harness wait completed.",
      );
    }

    if (context.signal?.aborted) {
      return errorResult(call, "CANCELLED", "The Harness run was cancelled before tool execution.");
    }

    const execution = await this.options.bridge.execute(outcome.invocation, context);
    if (execution.ok) {
      return remapCanonicalResult(call, execution.canonicalResult);
    }

    return errorResult(call, execution.error.code, execution.error.message);
  }

  private waitForApproval(
    approvalRequest: ApprovalRequest,
    context: AuthorizedInvocationRuntimeContext,
    toolCallId: string,
    signal: AbortSignal | undefined,
  ): Promise<CapabilityAuthorizationOutcome> {
    return new Promise((resolve) => {
      let settled = false;
      let expiryTimer: ReturnType<typeof setTimeout> | undefined;
      let removeAbortListener: (() => void) | undefined;
      let unsubscribe = () => {};
      const correlation: AuthorizedCapabilityCorrelation = {
        runId: context.runId,
        ...(context.conversationId !== undefined
          ? { conversationId: context.conversationId }
          : {}),
        toolCallId,
      };
      const expected: CapabilityAuthorizationResumeExpectation = {
        capabilityRequestId: approvalRequest.capabilityRequestId as CapabilityRequestId,
        capabilityId: approvalRequest.capabilityId,
        correlation,
      };

      const finish = (outcome: CapabilityAuthorizationOutcome): void => {
        if (settled) return;
        settled = true;
        if (expiryTimer !== undefined) clearTimeout(expiryTimer);
        removeAbortListener?.();
        unsubscribe();
        resolve(outcome);
      };

      const resume = (): void => {
        if (settled) return;
        const outcome = this.options.pipeline.resumeAfterApproval(
          approvalRequest.approvalRequestId,
          expected,
        );
        if (outcome.status !== "PENDING_APPROVAL") finish(outcome);
      };

      unsubscribe = this.options.approvalService.onChanged((record) => {
        if (
          record.request.approvalRequestId === approvalRequest.approvalRequestId &&
          record.state !== "pending"
        ) {
          queueMicrotask(resume);
        }
      });

      if (signal !== undefined) {
        const onAbort = (): void => {
          const outcome = this.options.pipeline.cancelPending(
            approvalRequest.approvalRequestId,
            "The Harness run was cancelled while waiting for approval.",
            expected,
          );
          finish(outcome);
        };
        signal.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => signal.removeEventListener("abort", onAbort);
        if (signal.aborted) {
          onAbort();
          return;
        }
      }

      const delayMs = Math.max(0, approvalRequest.expiresAt - this.now());
      expiryTimer = setTimeout(resume, delayMs);
      resume();
    });
  }
}
