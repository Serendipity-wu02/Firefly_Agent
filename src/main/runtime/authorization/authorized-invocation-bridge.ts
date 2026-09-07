import type {
  CapabilityBinding,
  CapabilityJsonValue,
  CapabilityRequestId,
  CapabilityRequester,
  CapabilityId,
} from "../../../shared/capability-types";
import type {
  AllowedSandboxDecision,
  AuthorizedCapabilityCorrelation,
  AuthorizedCapabilityInvocation,
  AuthorizedCapabilityProvenance,
  UpstreamAuthorizationContext,
} from "../../../shared/runtime-integration-types";
import type { ToolCall, ToolCallResult } from "../../../shared/tool-types";
import type { ToolExecutionContext } from "../execution/tool-execution-context";
import { ToolExecutionEngine } from "../execution/tool-execution-engine";
import type { FireflyToolRegistry } from "../../tools/tool-registry";

export type AuthorizedInvocationRuntimeContext = Omit<
  ToolExecutionContext,
  "upstreamAuthorization"
> & {
  /** Present for the orchestrated path to validate exact tool-call correlation. */
  readonly toolCallId?: string;
  /** Optional requester override; absent means the Main Firefly requester. */
  readonly requester?: CapabilityRequester;
};

export interface AuthorizedInvocationExecutionRequest<
  TInput extends CapabilityJsonValue = CapabilityJsonValue,
> {
  readonly invocation: AuthorizedCapabilityInvocation<TInput>;
  readonly context: AuthorizedInvocationRuntimeContext;
}

export type AuthorizedInvocationExecutionFailureCode =
  | "INVALID_AUTHORIZED_INVOCATION"
  | "TOOL_NOT_FOUND"
  | "AUTHORIZATION_BINDING_MISMATCH"
  | "AUTHORIZATION_CORRELATION_MISMATCH"
  | "DUPLICATE_AUTHORIZED_INVOCATION"
  | "TOOL_POLICY_FAILURE"
  | "TOOL_EXECUTION_FAILURE"
  | "CANCELLED";

export interface AuthorizedInvocationExecutionIdentity {
  readonly capabilityId: CapabilityId;
  readonly requestId: CapabilityRequestId;
  readonly requester: CapabilityRequester;
  readonly binding: CapabilityBinding;
  readonly toolId: string;
  readonly effectiveScope: AllowedSandboxDecision["effectiveScope"];
  readonly authorizedScope: AllowedSandboxDecision["effectiveScope"];
  readonly approvalRequirement: AuthorizedCapabilityInvocation["approvalRequirement"];
  readonly authorization: AuthorizedCapabilityProvenance;
  readonly correlation?: AuthorizedCapabilityCorrelation;
}

export interface AuthorizedInvocationExecutionError {
  readonly code: AuthorizedInvocationExecutionFailureCode;
  readonly message: string;
}

export type AuthorizedInvocationExecutionResult =
  | (AuthorizedInvocationExecutionIdentity & {
      readonly ok: true;
      readonly status: "succeeded";
      readonly canonicalResult: ToolCallResult;
    })
  | (Partial<AuthorizedInvocationExecutionIdentity> & {
      readonly ok: false;
      readonly status: "failed";
      readonly error: AuthorizedInvocationExecutionError;
      readonly canonicalResult?: ToolCallResult;
    });

interface ValidatedInvocation {
  readonly invocation: AuthorizedCapabilityInvocation;
  readonly identity: AuthorizedInvocationExecutionIdentity;
}

interface ValidationFailure {
  readonly code: "INVALID_AUTHORIZED_INVOCATION" | "AUTHORIZATION_BINDING_MISMATCH";
  readonly message: string;
}

type ValidationResult = ValidatedInvocation | ValidationFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRequester(value: unknown): value is CapabilityRequester {
  if (!isRecord(value) || !isNonEmptyString(value.type) || !isNonEmptyString(value.id)) {
    return false;
  }
  if (value.type === "subagent") {
    return isNonEmptyString(value.subAgentId) && isNonEmptyString(value.taskId);
  }
  return value.type === "main-agent" || value.type === "system-runtime";
}

function isScope(value: unknown): value is AllowedSandboxDecision["effectiveScope"] {
  if (!isRecord(value) || !isNonEmptyString(value.kind)) return false;
  switch (value.kind) {
    case "filesystem":
      return isNonEmptyString(value.path) && (value.access === "read" || value.access === "write");
    case "network":
      return isNonEmptyString(value.host) &&
        (value.port === undefined || (typeof value.port === "number" && Number.isInteger(value.port)));
    case "process":
      return isNonEmptyString(value.executable);
    case "desktop":
      return isNonEmptyString(value.target);
    default:
      return false;
  }
}

function isSignal(value: unknown): value is AbortSignal {
  return isRecord(value) && typeof value.aborted === "boolean" &&
    typeof value.addEventListener === "function";
}

function isRuntimeContext(value: unknown): value is AuthorizedInvocationRuntimeContext {
  if (!isRecord(value) || !isNonEmptyString(value.runId)) return false;
  if (!isFiniteNumber(value.step) || !isFiniteNumber(value.toolCallsCount)) return false;
  if (value.conversationId !== undefined && !isNonEmptyString(value.conversationId)) return false;
  if (value.toolCallId !== undefined && !isNonEmptyString(value.toolCallId)) return false;
  if (value.userQuery !== undefined && typeof value.userQuery !== "string") return false;
  if (value.signal !== undefined && !isSignal(value.signal)) return false;
  if (value.maxToolCallsPerRun !== undefined && !isFiniteNumber(value.maxToolCallsPerRun)) return false;
  if (value.metadata !== undefined && !isRecord(value.metadata)) return false;
  return true;
}

function isProvenance(value: unknown): value is AuthorizedCapabilityProvenance {
  if (!isRecord(value)) return false;
  if (value.type === "sandbox-only") return true;
  return value.type === "approval-grant" &&
    value.grantLifetime === "once" &&
    isNonEmptyString(value.approvalRequestId);
}

function validateInvocation(value: unknown): ValidationResult {
  if (!isRecord(value) || !isRecord(value.request) || !isRecord(value.binding)) {
    return {
      code: "INVALID_AUTHORIZED_INVOCATION",
      message: "Execution requires an AuthorizedCapabilityInvocation with request and binding metadata.",
    };
  }

  const request = value.request;
  const binding = value.binding;
  if (
    !isNonEmptyString(request.requestId) ||
    !isNonEmptyString(request.capabilityId) ||
    !isRequester(request.requester) ||
    !Object.prototype.hasOwnProperty.call(request, "input") ||
    !isRecord(request.input) ||
    !isNonEmptyString(binding.capabilityId) ||
    !isNonEmptyString(binding.toolId)
  ) {
    return {
      code: "INVALID_AUTHORIZED_INVOCATION",
      message: "Authorized invocation identity and object-shaped tool input are required.",
    };
  }

  if (binding.capabilityId !== request.capabilityId) {
    return {
      code: "AUTHORIZATION_BINDING_MISMATCH",
      message: "Authorized binding capabilityId does not match the capability request.",
    };
  }

  if (
    !isScope(value.effectiveScope) ||
    !isScope(value.authorizedScope) ||
    (value.approvalRequirement !== "none" && value.approvalRequirement !== "required") ||
    !isProvenance(value.authorization)
  ) {
    return {
      code: "INVALID_AUTHORIZED_INVOCATION",
      message: "Authorized invocation scope, approval requirement, or provenance is invalid.",
    };
  }

  if (value.approvalRequirement === "none") {
    if (value.authorization.type !== "sandbox-only" || value.approvalGrant !== undefined) {
      return {
        code: "INVALID_AUTHORIZED_INVOCATION",
        message: "A no-approval invocation must carry sandbox-only provenance without a grant.",
      };
    }
  } else {
    if (
      value.authorization.type !== "approval-grant" ||
      !isRecord(value.approvalGrant) ||
      value.approvalGrant.lifetime !== "once" ||
      !isScope(value.approvalGrant.scope)
    ) {
      return {
        code: "INVALID_AUTHORIZED_INVOCATION",
        message: "An approval-required invocation must carry an ONCE approval grant.",
      };
    }
  }

  if (
    value.correlation !== undefined &&
    (!isRecord(value.correlation) || !isNonEmptyString(value.correlation.runId) ||
      (value.correlation.conversationId !== undefined && !isNonEmptyString(value.correlation.conversationId)) ||
      (value.correlation.toolCallId !== undefined && !isNonEmptyString(value.correlation.toolCallId)))
  ) {
    return {
      code: "INVALID_AUTHORIZED_INVOCATION",
      message: "Authorization correlation metadata is invalid.",
    };
  }

  const invocation = value as unknown as AuthorizedCapabilityInvocation;
  const identity: AuthorizedInvocationExecutionIdentity = {
    capabilityId: request.capabilityId as CapabilityId,
    requestId: request.requestId as CapabilityRequestId,
    requester: request.requester,
    binding: binding as unknown as CapabilityBinding,
    toolId: binding.toolId,
    effectiveScope: value.effectiveScope,
    authorizedScope: value.authorizedScope,
    approvalRequirement: value.approvalRequirement,
    authorization: value.authorization,
    ...(value.correlation
      ? { correlation: value.correlation as unknown as AuthorizedCapabilityCorrelation }
      : {}),
  };
  return { invocation, identity };
}

function failure(
  code: AuthorizedInvocationExecutionFailureCode,
  message: string,
  identity?: AuthorizedInvocationExecutionIdentity,
  canonicalResult?: ToolCallResult,
): AuthorizedInvocationExecutionResult {
  return {
    ...(identity ?? {}),
    ok: false,
    status: "failed",
    error: { code, message },
    ...(canonicalResult ? { canonicalResult } : {}),
  };
}

function canonicalError(result: ToolCallResult): string | undefined {
  try {
    const parsed: unknown = JSON.parse(result.output);
    return isRecord(parsed) && typeof parsed.error === "string" ? parsed.error : undefined;
  } catch {
    return undefined;
  }
}

function classifyCanonicalFailure(
  result: ToolCallResult,
  signal: AbortSignal | undefined,
): AuthorizedInvocationExecutionFailureCode {
  const error = canonicalError(result);
  if (signal?.aborted || error === "tool_cancelled") return "CANCELLED";
  if (error === "tool_not_found") return "TOOL_NOT_FOUND";
  if (
    error === "policy_denied" ||
    error === "confirmation_required" ||
    error === "budget_exceeded" ||
    error === "tool_disabled"
  ) {
    return "TOOL_POLICY_FAILURE";
  }
  return "TOOL_EXECUTION_FAILURE";
}

/**
 * Narrow execution seam from a completed AuthorizedCapabilityInvocation to
 * the existing ToolExecutionEngine. This class owns no policy or execution
 * behavior; it validates the hand-off and delegates exactly once.
 */
export class AuthorizedInvocationBridge {
  private readonly consumedApprovalRequestIds = new Set<string>();
  private readonly consumedRequestIds = new Set<CapabilityRequestId>();

  constructor(
    private readonly executionEngine: ToolExecutionEngine,
    private readonly toolRegistry: FireflyToolRegistry,
  ) {}

  async execute(
    input: AuthorizedInvocationExecutionRequest | AuthorizedCapabilityInvocation,
    runtimeContext?: AuthorizedInvocationRuntimeContext,
  ): Promise<AuthorizedInvocationExecutionResult> {
    const invocationValue = runtimeContext === undefined && isRecord(input) && "invocation" in input
      ? input.invocation
      : input;
    const contextValue = runtimeContext === undefined && isRecord(input) && "invocation" in input
      ? input.context
      : runtimeContext;

    if (!isRuntimeContext(contextValue)) {
      return failure(
        "INVALID_AUTHORIZED_INVOCATION",
        "Authorized execution requires runtime context with runId, step, and tool call budget metadata.",
      );
    }

    const validated = validateInvocation(invocationValue);
    if ("code" in validated) {
      return failure(validated.code, validated.message);
    }

    const { invocation, identity } = validated;
    if (
      identity.correlation !== undefined &&
      (identity.correlation.runId !== contextValue.runId ||
        (identity.correlation.conversationId !== undefined &&
          identity.correlation.conversationId !== contextValue.conversationId) ||
        (contextValue.toolCallId !== undefined &&
          identity.correlation.toolCallId !== contextValue.toolCallId))
    ) {
      return failure(
        "AUTHORIZATION_CORRELATION_MISMATCH",
        "Authorized invocation correlation does not match the active runtime context.",
        identity,
      );
    }
    if (!this.toolRegistry.get(identity.toolId)) {
      return failure(
        "TOOL_NOT_FOUND",
        `Authorized binding tool "${identity.toolId}" is not registered.`,
        identity,
      );
    }
    if (this.consumedRequestIds.has(identity.requestId)) {
      return failure(
        "DUPLICATE_AUTHORIZED_INVOCATION",
        `Capability request "${identity.requestId}" has already been submitted for execution.`,
        identity,
      );
    }
    this.consumedRequestIds.add(identity.requestId);

    if (
      identity.authorization.type === "approval-grant" &&
      this.consumedApprovalRequestIds.has(identity.authorization.approvalRequestId)
    ) {
      return failure(
        "INVALID_AUTHORIZED_INVOCATION",
        `Approval request "${identity.authorization.approvalRequestId}" has already been consumed.`,
        identity,
      );
    }
    if (identity.authorization.type === "approval-grant") {
      this.consumedApprovalRequestIds.add(identity.authorization.approvalRequestId);
    }

    if (contextValue.signal?.aborted) {
      return failure(
        "CANCELLED",
        "Authorized tool execution was cancelled before dispatch.",
        identity,
      );
    }

    const upstreamAuthorization: UpstreamAuthorizationContext = {
      capabilityId: identity.capabilityId,
      requestId: identity.requestId,
      requester: identity.requester,
      toolId: identity.toolId,
      authorizedScope: identity.authorizedScope,
      approvalRequirement: identity.approvalRequirement,
      authorization: identity.authorization,
    };
    const toolCall: ToolCall = {
      id: identity.requestId,
      name: identity.toolId,
      arguments: Object.fromEntries(Object.entries(invocation.request.input as Record<string, unknown>)),
    };

    let canonicalResult: ToolCallResult;
    try {
      canonicalResult = await this.executionEngine.executeToolCall(toolCall, {
        ...contextValue,
        upstreamAuthorization,
      });
    } catch (error) {
      return failure(
        contextValue.signal?.aborted ? "CANCELLED" : "TOOL_EXECUTION_FAILURE",
        error instanceof Error ? error.message : String(error),
        identity,
      );
    }

    if (canonicalResult.isError) {
      return failure(
        classifyCanonicalFailure(canonicalResult, contextValue.signal),
        canonicalResult.output,
        identity,
        canonicalResult,
      );
    }

    return {
      ...identity,
      ok: true,
      status: "succeeded",
      canonicalResult,
    };
  }
}
