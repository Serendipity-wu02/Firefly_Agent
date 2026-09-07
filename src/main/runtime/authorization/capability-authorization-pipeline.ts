import type {
  ApprovalRecord,
  ApprovalRequestId,
} from "../../../shared/approval-types";
import type {
  CapabilityBinding,
  CapabilityJsonValue,
  CapabilityId,
  CapabilityRequestId,
  CapabilityRequest,
} from "../../../shared/capability-types";
import {
  createAuthorizedCapabilityInvocation,
  type AllowedSandboxDecision,
  type AuthorizedCapabilityCorrelation,
  type CapabilityAuthorizationFailureCode,
  type CapabilityAuthorizationInput,
  type CapabilityAuthorizationOutcome,
  type ApprovalRequirementResolver,
} from "../../../shared/runtime-integration-types";
import type { SandboxEvaluationInput } from "../../../shared/sandbox-types";
import type { PermissionProfile } from "../../../shared/permission-profile-types";
import type { ToolSideEffect } from "../../../shared/tool-types";
import { ApprovalService } from "../approval/approval-service";
import {
  ApprovalRequirementPolicyError,
} from "../approval/approval-requirement-resolver";
import { CapabilityBindingResolver } from "../capabilities/capability-binding-resolver";
import { CapabilityRegistry } from "../capabilities/capability-registry";
import { PermissionProfilePolicyResolver } from "./permission-profile-policy-resolver";
import { SandboxPolicyEvaluator } from "../sandbox/sandbox-policy";

export interface CapabilityAuthorizationPipelineDependencies {
  readonly capabilityRegistry: CapabilityRegistry;
  readonly bindingResolver: CapabilityBindingResolver;
  readonly sandboxPolicy: SandboxPolicyEvaluator;
  readonly approvalRequirementResolver: ApprovalRequirementResolver;
  readonly approvalService: ApprovalService;
  readonly permissionPolicyResolver?: PermissionProfilePolicyResolver;
  readonly getPermissionProfile?: () => PermissionProfile;
}

interface PendingCapabilityAuthorization {
  readonly request: CapabilityRequest;
  readonly binding: CapabilityBinding;
  readonly sandboxDecision: AllowedSandboxDecision;
  readonly correlation?: AuthorizedCapabilityCorrelation;
  readonly sideEffect?: ToolSideEffect;
  readonly permissionProfile?: PermissionProfile;
}

export interface CapabilityAuthorizationResumeExpectation {
  readonly capabilityRequestId: CapabilityRequestId;
  readonly capabilityId: CapabilityId;
  readonly correlation?: AuthorizedCapabilityCorrelation;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCapabilityRequestShape(value: unknown): value is CapabilityRequest {
  if (typeof value !== "object" || value === null) return false;
  const request = value as Record<string, unknown>;
  const requester = request.requester;
  if (typeof requester !== "object" || requester === null) return false;
  const typedRequester = requester as Record<string, unknown>;
  if (!isNonEmptyString(typedRequester.type) || !isNonEmptyString(typedRequester.id)) {
    return false;
  }
  if (
    typedRequester.type === "subagent" &&
    (!isNonEmptyString(typedRequester.subAgentId) || !isNonEmptyString(typedRequester.taskId))
  ) {
    return false;
  }
  return isNonEmptyString(request.requestId) &&
    isNonEmptyString(request.capabilityId) &&
    Object.prototype.hasOwnProperty.call(request, "input");
}

function correlationFromRuntimeContext(
  runtimeContext: CapabilityAuthorizationInput["runtimeContext"],
): AuthorizedCapabilityCorrelation | undefined {
  if (runtimeContext === undefined) return undefined;
  return {
    runId: runtimeContext.runId,
    ...(runtimeContext.conversationId !== undefined
      ? { conversationId: runtimeContext.conversationId }
      : {}),
    ...(runtimeContext.toolCallId !== undefined
      ? { toolCallId: runtimeContext.toolCallId }
      : {}),
  };
}

function sameCorrelation(
  actual: AuthorizedCapabilityCorrelation | undefined,
  expected: AuthorizedCapabilityCorrelation | undefined,
): boolean {
  if (actual?.runId !== expected?.runId) return false;
  if (actual?.conversationId !== expected?.conversationId) return false;
  return actual?.toolCallId === expected?.toolCallId;
}

function denied(
  stage: "CAPABILITY" | "BINDING" | "SANDBOX" | "APPROVAL",
  code: CapabilityAuthorizationFailureCode,
  message: string,
  approvalRequestId?: ApprovalRequestId,
  details?: CapabilityJsonValue,
): Extract<CapabilityAuthorizationOutcome, { status: "DENIED" }> {
  return {
    status: "DENIED",
    stage,
    reason: {
      code,
      message,
      ...(approvalRequestId !== undefined ? { approvalRequestId } : {}),
      ...(details !== undefined ? { details } : {}),
    },
  };
}

function approvalTerminalOutcome(
  record: ApprovalRecord,
): Extract<CapabilityAuthorizationOutcome, { status: "DENIED" }> {
  const approvalRequestId = record.request.approvalRequestId;
  if (record.state === "denied") {
    return denied(
      "APPROVAL",
      "APPROVAL_DENIED",
      record.decision?.approved === false
        ? record.decision.reason.message
        : "The approval request was denied.",
      approvalRequestId,
    );
  }
  if (record.state === "cancelled") {
    return denied(
      "APPROVAL",
      "APPROVAL_CANCELLED",
      record.decision?.approved === false
        ? record.decision.reason.message
        : "The approval request was cancelled.",
      approvalRequestId,
    );
  }
  if (record.state === "expired") {
    return denied(
      "APPROVAL",
      "APPROVAL_EXPIRED",
      record.decision?.approved === false
        ? record.decision.reason.message
        : "The approval request expired before it was resolved.",
      approvalRequestId,
    );
  }
  return denied(
    "APPROVAL",
    "APPROVAL_RUNTIME_ERROR",
    `Approval request "${approvalRequestId}" is not in a resumable terminal state.`,
    approvalRequestId,
  );
}

/**
 * The single V1 owner for Capability → Sandbox → Approval authorization.
 * It produces data for a future execution adapter and never runs a tool.
 */
export class CapabilityAuthorizationPipeline {
  private readonly pending = new Map<ApprovalRequestId, PendingCapabilityAuthorization>();
  private readonly consumedApprovals = new Set<ApprovalRequestId>();

  constructor(private readonly dependencies: CapabilityAuthorizationPipelineDependencies) {}

  authorize<TInput extends CapabilityJsonValue>(
    input: CapabilityAuthorizationInput<TInput>,
  ): CapabilityAuthorizationOutcome<TInput> {
    if (
      typeof input !== "object" ||
      input === null ||
      !isCapabilityRequestShape(input.request) ||
      typeof input.sandbox !== "object" ||
      input.sandbox === null ||
      !isNonEmptyString(input.sandbox.profileId) ||
      typeof input.sandbox.requestedScope !== "object" ||
      input.sandbox.requestedScope === null
    ) {
      return denied(
        "CAPABILITY",
        "INVALID_AUTHORIZATION_CONTEXT",
        "Capability authorization input is not a valid serializable request and Sandbox context.",
      ) as CapabilityAuthorizationOutcome<TInput>;
    }

    if (
      input.runtimeContext !== undefined &&
      (typeof input.runtimeContext !== "object" ||
        input.runtimeContext === null ||
        !isNonEmptyString(input.runtimeContext.runId) ||
        (input.runtimeContext.conversationId !== undefined &&
          !isNonEmptyString(input.runtimeContext.conversationId)) ||
        (input.runtimeContext.toolCallId !== undefined &&
          !isNonEmptyString(input.runtimeContext.toolCallId)))
    ) {
      return denied(
        "CAPABILITY",
        "INVALID_AUTHORIZATION_CONTEXT",
        "Runtime authorization context must contain a non-empty runId.",
      ) as CapabilityAuthorizationOutcome<TInput>;
    }

    const capability = this.dependencies.capabilityRegistry.get(input.request.capabilityId);
    if (capability === undefined) {
      return denied(
        "CAPABILITY",
        "CAPABILITY_NOT_FOUND",
        `Capability "${input.request.capabilityId}" is not registered.`,
      ) as CapabilityAuthorizationOutcome<TInput>;
    }

    const binding = this.dependencies.bindingResolver.resolve(input.request.capabilityId);
    if (binding === undefined) {
      return denied(
        "BINDING",
        "BINDING_NOT_FOUND",
        `Capability "${input.request.capabilityId}" has no registered tool binding.`,
      ) as CapabilityAuthorizationOutcome<TInput>;
    }

    let sandboxDecision: ReturnType<SandboxPolicyEvaluator["evaluate"]>;
    try {
      const sandboxInput: SandboxEvaluationInput = {
        requestId: input.request.requestId,
        capabilityId: input.request.capabilityId,
        requester: input.request.requester,
        profileId: input.sandbox.profileId,
        requestedScope: input.sandbox.requestedScope,
        ...(input.runtimeContext
          ? {
              context: {
                runId: input.runtimeContext.runId,
                ...(input.runtimeContext.conversationId !== undefined
                  ? { conversationId: input.runtimeContext.conversationId }
                  : {}),
              },
            }
          : {}),
      };
      sandboxDecision = this.dependencies.sandboxPolicy.evaluate(sandboxInput);
    } catch (error) {
      return denied(
        "SANDBOX",
        "INVALID_AUTHORIZATION_CONTEXT",
        error instanceof Error ? error.message : String(error),
      ) as CapabilityAuthorizationOutcome<TInput>;
    }

    if (sandboxDecision.allowed !== true) {
      return denied(
        "SANDBOX",
        "SANDBOX_DENIED",
        sandboxDecision.reason.message,
        undefined,
        { sandboxCode: sandboxDecision.reason.code },
      ) as CapabilityAuthorizationOutcome<TInput>;
    }

    let approvalRequirement: "none" | "required";
    try {
      approvalRequirement = this.dependencies.approvalRequirementResolver({
        capabilityId: input.request.capabilityId,
        requester: input.request.requester,
        binding,
        permissionProfile: input.permissionProfile,
        sideEffect: capability.sideEffect,
      });
    } catch (error) {
      if (
        error instanceof ApprovalRequirementPolicyError &&
        error.code === "PERMISSION_PROFILE_DENIED"
      ) {
        return denied(
          "CAPABILITY",
          "PERMISSION_PROFILE_DENIED",
          error.message,
        ) as CapabilityAuthorizationOutcome<TInput>;
      }
      return denied(
        "APPROVAL",
        "APPROVAL_RUNTIME_ERROR",
        error instanceof Error ? error.message : String(error),
      ) as CapabilityAuthorizationOutcome<TInput>;
    }

    const correlation = correlationFromRuntimeContext(input.runtimeContext);
    if (approvalRequirement === "none") {
      try {
        const invocation = createAuthorizedCapabilityInvocation({
          request: input.request,
          binding,
          sandboxDecision,
          approvalRequirement,
          correlation,
        });
        return { status: "AUTHORIZED", invocation };
      } catch (error) {
        return denied(
          "APPROVAL",
          "APPROVAL_RUNTIME_ERROR",
          error instanceof Error ? error.message : String(error),
        ) as CapabilityAuthorizationOutcome<TInput>;
      }
    }

    if (
      input.approval === undefined ||
      !isNonEmptyString(input.approval.summary) ||
      !isNonEmptyString(input.approval.reason) ||
      !isFiniteNumber(input.approval.expiresAt)
    ) {
      return denied(
        "APPROVAL",
        "INVALID_AUTHORIZATION_CONTEXT",
        "Approval-required authorization needs summary, reason, and a finite expiresAt.",
      ) as CapabilityAuthorizationOutcome<TInput>;
    }

    try {
      const pendingRecord = this.dependencies.approvalService.createPending({
        capabilityRequestId: input.request.requestId,
        capabilityId: input.request.capabilityId,
        requester: input.request.requester,
        summary: input.approval.summary,
        reason: input.approval.reason,
        risk: capability.risk,
        sideEffect: capability.sideEffect,
        effectiveScope: sandboxDecision.effectiveScope,
        expiresAt: input.approval.expiresAt,
      });
      this.pending.set(pendingRecord.request.approvalRequestId, {
        request: input.request,
        binding,
        sandboxDecision,
        correlation,
        sideEffect: capability.sideEffect,
        permissionProfile: input.permissionProfile ?? this.dependencies.getPermissionProfile?.(),
      });
      return {
        status: "PENDING_APPROVAL",
        approvalRequest: pendingRecord.request,
      };
    } catch (error) {
      return denied(
        "APPROVAL",
        "APPROVAL_RUNTIME_ERROR",
        error instanceof Error ? error.message : String(error),
      ) as CapabilityAuthorizationOutcome<TInput>;
    }
  }

  resumeAfterApproval(
    approvalRequestId: ApprovalRequestId,
    expected?: CapabilityAuthorizationResumeExpectation,
  ): CapabilityAuthorizationOutcome {
    if (this.consumedApprovals.has(approvalRequestId)) {
      return denied(
        "APPROVAL",
        "APPROVAL_RUNTIME_ERROR",
        `Approval request "${approvalRequestId}" has already authorized one invocation.`,
        approvalRequestId,
      );
    }

    const pending = this.pending.get(approvalRequestId);
    if (pending === undefined) {
      return denied(
        "APPROVAL",
        "APPROVAL_RUNTIME_ERROR",
        `Approval request "${approvalRequestId}" is not owned by this authorization pipeline.`,
        approvalRequestId,
      );
    }

    if (
      expected !== undefined &&
      (pending.request.requestId !== expected.capabilityRequestId ||
        pending.request.capabilityId !== expected.capabilityId ||
        !sameCorrelation(pending.correlation, expected.correlation))
    ) {
      return denied(
        "APPROVAL",
        "APPROVAL_CORRELATION_MISMATCH",
        `Approval request "${approvalRequestId}" does not belong to the expected capability invocation.`,
        approvalRequestId,
      );
    }

    let record: ApprovalRecord | undefined;
    try {
      record = this.dependencies.approvalService.get(approvalRequestId);
    } catch (error) {
      return denied(
        "APPROVAL",
        "APPROVAL_RUNTIME_ERROR",
        error instanceof Error ? error.message : String(error),
        approvalRequestId,
      );
    }

    if (record === undefined) {
      this.pending.delete(approvalRequestId);
      return denied(
        "APPROVAL",
        "APPROVAL_RUNTIME_ERROR",
        `Approval request "${approvalRequestId}" cannot be resumed because it is missing.`,
        approvalRequestId,
      );
    }

    const currentProfile = this.dependencies.getPermissionProfile?.() ?? pending.permissionProfile;
    if (currentProfile !== undefined) {
      const policyResolver = this.dependencies.permissionPolicyResolver ?? new PermissionProfilePolicyResolver();
      const currentPolicy = policyResolver.resolve({
        profile: currentProfile,
        capabilityKnown: true,
        declaredApprovalRequirement: "required",
        sideEffect: pending.sideEffect,
      });
      if (!currentPolicy.capabilityAllowed) {
        if (record.state === "pending") {
          try {
            this.dependencies.approvalService.cancel(
              approvalRequestId,
              "The current permission scheme no longer allows this capability.",
            );
          } catch (error) {
            return denied(
              "APPROVAL",
              "APPROVAL_RUNTIME_ERROR",
              error instanceof Error ? error.message : String(error),
              approvalRequestId,
            );
          }
        }
        this.pending.delete(approvalRequestId);
        if (record.state === "approved") this.consumedApprovals.add(approvalRequestId);
        return denied(
          "CAPABILITY",
          "PERMISSION_PROFILE_DENIED",
          `Permission scheme "${currentPolicy.profile}" no longer allows this capability's side effects.`,
          approvalRequestId,
        );
      }
    }
    if (record.state === "pending") {
      return { status: "PENDING_APPROVAL", approvalRequest: record.request };
    }
    if (record.state !== "approved" || record.decision?.approved !== true) {
      this.pending.delete(approvalRequestId);
      return approvalTerminalOutcome(record);
    }

    try {
      const invocation = createAuthorizedCapabilityInvocation({
        request: pending.request,
        binding: pending.binding,
        sandboxDecision: pending.sandboxDecision,
        approvalRequirement: "required",
        approvalDecision: record.decision,
        approvalRequestId,
        correlation: pending.correlation,
      });
      this.pending.delete(approvalRequestId);
      this.consumedApprovals.add(approvalRequestId);
      return { status: "AUTHORIZED", invocation };
    } catch (error) {
      this.pending.delete(approvalRequestId);
      this.consumedApprovals.add(approvalRequestId);
      return denied(
        "APPROVAL",
        "APPROVAL_RUNTIME_ERROR",
        error instanceof Error ? error.message : String(error),
        approvalRequestId,
      );
    }
  }

  cancelPending(
    approvalRequestId: ApprovalRequestId,
    message = "The capability authorization request was cancelled.",
    expected?: CapabilityAuthorizationResumeExpectation,
  ): CapabilityAuthorizationOutcome {
    try {
      const record = this.dependencies.approvalService.get(approvalRequestId);
      if (record?.state === "pending") {
        this.dependencies.approvalService.cancel(approvalRequestId, message);
      }
    } catch (error) {
      return denied(
        "APPROVAL",
        "APPROVAL_RUNTIME_ERROR",
        error instanceof Error ? error.message : String(error),
        approvalRequestId,
      );
    }
    return this.resumeAfterApproval(approvalRequestId, expected);
  }
}
