/**
 * @file runtime-integration-types.ts
 * @description Shared contracts for the Capability → Sandbox → Approval
 * authorization boundary. These values describe authorization provenance;
 * they never execute a tool.
 */

import type {
  ApprovalDecision,
  ApprovalGrant,
  ApprovalRequest,
  ApprovalRequestId,
  ApprovalRequirement,
} from "./approval-types";
import type {
  CapabilityBinding,
  CapabilityContext,
  CapabilityId,
  CapabilityJsonValue,
  CapabilityRequest,
  CapabilityRequestId,
  CapabilityRequester,
} from "./capability-types";
import {
  isSandboxScopeWithin,
  type SandboxDecision,
  type SandboxProfileId,
  type SandboxScope,
} from "./sandbox-types";
import type { PermissionProfile } from "./permission-profile-types";
import type { ToolSideEffect } from "./tool-types";

export interface ApprovalRequirementInput {
  readonly capabilityId: CapabilityId;
  readonly requester: CapabilityRequester;
  readonly binding: CapabilityBinding;
  readonly permissionProfile?: PermissionProfile;
  readonly sideEffect?: ToolSideEffect;
}

/** A narrow policy function; it decides only whether the approval gate applies. */
export type ApprovalRequirementResolver = (
  input: ApprovalRequirementInput,
) => ApprovalRequirement;

export interface CapabilityAuthorizationSandboxInput {
  readonly profileId: SandboxProfileId;
  readonly requestedScope: SandboxScope;
}

export interface CapabilityAuthorizationApprovalInput {
  readonly summary: string;
  readonly reason: string;
  readonly expiresAt: number;
}

/**
 * Serializable request data and optional runtime-only context are separated at
 * the boundary. The runtime context is never copied into the capability input.
 */
export interface CapabilityAuthorizationInput<
  TInput extends CapabilityJsonValue = CapabilityJsonValue,
> {
  readonly request: CapabilityRequest<TInput>;
  readonly sandbox: CapabilityAuthorizationSandboxInput;
  readonly permissionProfile?: PermissionProfile;
  readonly runtimeContext?: CapabilityContext;
  /** Required only if ApprovalRequirementResolver returns "required". */
  readonly approval?: CapabilityAuthorizationApprovalInput;
}

export type ApprovedApprovalDecision = Extract<ApprovalDecision, { approved: true }>;
export type AllowedSandboxDecision = Extract<SandboxDecision, { allowed: true }>;

export interface AuthorizedCapabilityCorrelation {
  readonly runId: string;
  readonly conversationId?: string;
  /** The exact logical Harness tool call that created this authorization. */
  readonly toolCallId?: string;
}

export type AuthorizedCapabilityProvenance =
  | { readonly type: "sandbox-only" }
  | {
      readonly type: "approval-grant";
      readonly approvalRequestId: ApprovalRequestId;
      readonly grantLifetime: "once";
    };

/**
 * The provenance-only context carried into the existing execution owner.
 * It contains no executor, callback, approval service, or Sandbox evaluator.
 */
export interface UpstreamAuthorizationContext {
  readonly capabilityId: CapabilityId;
  readonly requestId: CapabilityRequestId;
  readonly requester: CapabilityRequester;
  readonly toolId: string;
  readonly authorizedScope: AllowedSandboxDecision["effectiveScope"];
  readonly approvalRequirement: ApprovalRequirement;
  readonly authorization: AuthorizedCapabilityProvenance;
}

export interface AuthorizedCapabilityInvocation<
  TInput extends CapabilityJsonValue = CapabilityJsonValue,
> {
  /** The original capability request remains the identity and input source. */
  readonly request: CapabilityRequest<TInput>;
  /** The one resolved capability-to-tool binding selected by the resolver. */
  readonly binding: CapabilityBinding;
  /** Effective scope returned by the Sandbox evaluator. */
  readonly effectiveScope: AllowedSandboxDecision["effectiveScope"];
  /** Final scope available to a future execution adapter. */
  readonly authorizedScope: AllowedSandboxDecision["effectiveScope"];
  readonly approvalRequirement: ApprovalRequirement;
  readonly authorization: AuthorizedCapabilityProvenance;
  /** Present only when the separate requirement policy required approval. */
  readonly approvalGrant?: ApprovalGrant;
  /** Serializable correlation only; no signal, session, callback, or executor. */
  readonly correlation?: AuthorizedCapabilityCorrelation;
}

export interface AuthorizedCapabilityInvocationInput<
  TInput extends CapabilityJsonValue = CapabilityJsonValue,
> {
  readonly request: CapabilityRequest<TInput>;
  readonly binding: CapabilityBinding;
  readonly sandboxDecision: SandboxDecision;
  readonly approvalRequirement: ApprovalRequirement;
  readonly approvalDecision?: ApprovedApprovalDecision;
  readonly approvalRequestId?: ApprovalRequestId;
  readonly correlation?: AuthorizedCapabilityCorrelation;
}

export type AuthorizedInvocationErrorCode =
  | "INVALID_REQUEST"
  | "BINDING_MISMATCH"
  | "SANDBOX_NOT_ALLOWED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_REQUEST_REQUIRED"
  | "APPROVAL_NOT_APPROVED"
  | "INVALID_APPROVAL_DECISION"
  | "APPROVAL_SCOPE_WIDENED"
  | "UNEXPECTED_APPROVAL_GRANT";

export class AuthorizedInvocationError extends Error {
  readonly code: AuthorizedInvocationErrorCode;

  constructor(code: AuthorizedInvocationErrorCode, message: string) {
    super(message);
    this.name = "AuthorizedInvocationError";
    this.code = code;
  }
}

export type CapabilityAuthorizationStage =
  | "CAPABILITY"
  | "BINDING"
  | "SANDBOX"
  | "APPROVAL";

export type CapabilityAuthorizationFailureCode =
  | "CAPABILITY_NOT_FOUND"
  | "BINDING_NOT_FOUND"
  | "SANDBOX_DENIED"
  | "PERMISSION_PROFILE_DENIED"
  | "APPROVAL_DENIED"
  | "APPROVAL_CANCELLED"
  | "APPROVAL_EXPIRED"
  | "APPROVAL_CORRELATION_MISMATCH"
  | "APPROVAL_RUNTIME_ERROR"
  | "INVALID_AUTHORIZATION_CONTEXT";

export interface CapabilityAuthorizationDenial {
  readonly code: CapabilityAuthorizationFailureCode;
  readonly message: string;
  readonly approvalRequestId?: ApprovalRequestId;
  readonly details?: CapabilityJsonValue;
}

export type CapabilityAuthorizationOutcome<
  TInput extends CapabilityJsonValue = CapabilityJsonValue,
> =
  | {
      readonly status: "AUTHORIZED";
      readonly invocation: AuthorizedCapabilityInvocation<TInput>;
    }
  | {
      readonly status: "PENDING_APPROVAL";
      readonly approvalRequest: ApprovalRequest;
    }
  | {
      readonly status: "DENIED";
      readonly stage: CapabilityAuthorizationStage;
      readonly reason: CapabilityAuthorizationDenial;
    };

function cloneCapabilityJson<T extends CapabilityJsonValue>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneCapabilityJson(entry)) as unknown as T;
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneCapabilityJson(entry)]),
    ) as T;
  }
  return value;
}

function cloneRequest<TInput extends CapabilityJsonValue>(
  request: CapabilityRequest<TInput>,
): CapabilityRequest<TInput> {
  return Object.freeze({
    ...request,
    requester: Object.freeze({ ...request.requester }),
    input: cloneCapabilityJson(request.input),
  });
}

function cloneScope(scope: SandboxScope): SandboxScope {
  return Object.freeze({ ...scope });
}

function cloneApprovalGrant(grant: ApprovalGrant): ApprovalGrant {
  return Object.freeze({
    lifetime: grant.lifetime,
    scope: cloneScope(grant.scope),
  });
}

function cloneCorrelation(
  correlation: AuthorizedCapabilityCorrelation | undefined,
): AuthorizedCapabilityCorrelation | undefined {
  return correlation === undefined
    ? undefined
    : Object.freeze({ ...correlation });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Build the typed hand-off object after upstream stages have completed.
 * ApprovalService and this factory share the same scope-containment rule;
 * this factory never evaluates a profile and never executes a tool.
 */
export function createAuthorizedCapabilityInvocation<
  TInput extends CapabilityJsonValue,
>(
  input: AuthorizedCapabilityInvocationInput<TInput>,
): AuthorizedCapabilityInvocation<TInput> {
  if (
    typeof input !== "object" ||
    input === null ||
    typeof input.request !== "object" ||
    input.request === null ||
    typeof input.binding !== "object" ||
    input.binding === null ||
    typeof input.sandboxDecision !== "object" ||
    input.sandboxDecision === null
  ) {
    throw new AuthorizedInvocationError(
      "INVALID_REQUEST",
      "Authorized capability invocation requires a capability request.",
    );
  }
  if (input.binding.capabilityId !== input.request.capabilityId) {
    throw new AuthorizedInvocationError(
      "BINDING_MISMATCH",
      "Capability binding must match the capability request.",
    );
  }
  if (input.sandboxDecision.allowed !== true) {
    throw new AuthorizedInvocationError(
      "SANDBOX_NOT_ALLOWED",
      "A denied Sandbox decision cannot produce an authorized invocation.",
    );
  }
  if (input.approvalRequirement !== "none" && input.approvalRequirement !== "required") {
    throw new AuthorizedInvocationError(
      "INVALID_REQUEST",
      "Approval requirement must be none or required.",
    );
  }
  if (
    input.correlation !== undefined &&
    (!isNonEmptyString(input.correlation.runId) ||
      (input.correlation.conversationId !== undefined &&
        !isNonEmptyString(input.correlation.conversationId)) ||
      (input.correlation.toolCallId !== undefined &&
        !isNonEmptyString(input.correlation.toolCallId)))
  ) {
    throw new AuthorizedInvocationError(
      "INVALID_REQUEST",
      "Authorization correlation requires non-empty run and tool identities.",
    );
  }

  const approvalGrant = input.approvalDecision?.grant;
  if (input.approvalRequirement === "required" && input.approvalDecision === undefined) {
    throw new AuthorizedInvocationError(
      "APPROVAL_REQUIRED",
      "An approval decision is required before this invocation can proceed.",
    );
  }
  if (input.approvalRequirement === "required" && !isNonEmptyString(input.approvalRequestId)) {
    throw new AuthorizedInvocationError(
      "APPROVAL_REQUEST_REQUIRED",
      "An approval request ID is required for an approved invocation.",
    );
  }
  if (input.approvalRequirement === "required" && input.approvalDecision?.approved !== true) {
    throw new AuthorizedInvocationError(
      "APPROVAL_NOT_APPROVED",
      "A non-approved decision cannot produce an authorized invocation.",
    );
  }
  if (
    input.approvalRequirement === "required" &&
    (approvalGrant === undefined || approvalGrant.lifetime !== "once" || typeof approvalGrant.scope !== "object")
  ) {
    throw new AuthorizedInvocationError(
      "INVALID_APPROVAL_DECISION",
      "An approved invocation requires a valid ONCE approval grant.",
    );
  }
  if (
    input.approvalRequirement === "required" &&
    approvalGrant !== undefined &&
    !isSandboxScopeWithin(input.sandboxDecision.effectiveScope, approvalGrant.scope)
  ) {
    throw new AuthorizedInvocationError(
      "APPROVAL_SCOPE_WIDENED",
      "Approval grant scope must be contained by the effective Sandbox scope.",
    );
  }
  if (
    input.approvalRequirement === "none" &&
    (input.approvalDecision !== undefined || input.approvalRequestId !== undefined)
  ) {
    throw new AuthorizedInvocationError(
      "UNEXPECTED_APPROVAL_GRANT",
      "Approval metadata cannot be attached when the requirement is none.",
    );
  }

  const frozenGrant = approvalGrant === undefined ? undefined : cloneApprovalGrant(approvalGrant);
  const authorizedScope = frozenGrant?.scope ?? input.sandboxDecision.effectiveScope;
  const authorization: AuthorizedCapabilityProvenance = frozenGrant
    ? {
        type: "approval-grant",
        approvalRequestId: input.approvalRequestId as ApprovalRequestId,
        grantLifetime: frozenGrant.lifetime,
      }
    : { type: "sandbox-only" };

  return Object.freeze({
    request: cloneRequest(input.request),
    binding: Object.freeze({ ...input.binding }),
    effectiveScope: cloneScope(input.sandboxDecision.effectiveScope),
    authorizedScope: cloneScope(authorizedScope),
    approvalRequirement: input.approvalRequirement,
    authorization,
    ...(frozenGrant ? { approvalGrant: frozenGrant } : {}),
    ...(input.correlation ? { correlation: cloneCorrelation(input.correlation) } : {}),
  });
}
