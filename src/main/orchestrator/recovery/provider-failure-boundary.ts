import type { ClassifiedError, ClassifiedErrorType } from "./error-classifier";
import type { RecoveryActionType, RecoveryBudget, RecoveryDecision } from "./recovery-manager";

/** Version of the pure Provider failure boundary contract. */
export const PROVIDER_FAILURE_BOUNDARY_VERSION = 1 as const;

export type ProviderFailureBoundaryErrorType =
  | "context_overflow"
  | "rate_limit"
  | "server_error";

export type ProviderFailureBoundaryAction =
  | "retry_with_compaction"
  | "retry_with_backoff"
  | "retry_immediate";

/**
 * Structured facts produced at the existing Provider catch/Recovery boundary.
 * This contract is not a Resume qualification result and does not authorize
 * or execute any work.
 */
export interface ProviderFailureBoundary {
  readonly version: typeof PROVIDER_FAILURE_BOUNDARY_VERSION;
  readonly source: "provider";
  readonly errorType: ProviderFailureBoundaryErrorType;
  readonly action: ProviderFailureBoundaryAction;
  /** The existing RecoveryManager delay that must be preserved on resume. */
  readonly delayMs: number;
  readonly retryable: true;
  readonly completedRecoveryAttempts: number;
  readonly maxRecoveryAttempts: number;
  readonly maxOverflowRetries: number;
  readonly timedOut: false;
  readonly cancelled: false;
  readonly budgetExhausted: false;
}

export type ProviderFailureBoundaryRejectionCode =
  | "invalid_format"
  | "unsupported_version"
  | "unsupported_source"
  | "unsupported_error_type"
  | "unsupported_action"
  | "action_mismatch"
  | "not_retryable"
  | "cancelled"
  | "timed_out"
  | "budget_exhausted"
  | "recovery_budget_exhausted"
  | "overflow_budget_exhausted"
  | "classification_mismatch";

export type ProviderFailureBoundaryValidation =
  | { readonly ok: true; readonly boundary: ProviderFailureBoundary }
  | {
      readonly ok: false;
      readonly code: ProviderFailureBoundaryRejectionCode;
      readonly message: string;
    };

export interface ProviderFailureBoundaryFactoryInput {
  readonly classifiedError: Pick<ClassifiedError, "type" | "retryable">;
  readonly recoveryDecision: Pick<RecoveryDecision, "action" | "classifiedError">;
  readonly delayMs: number;
  readonly completedRecoveryAttempts: number;
  readonly recoveryBudget: Pick<RecoveryBudget, "maxRecoveryAttempts" | "maxOverflowRetries">;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
  readonly budgetExhausted: boolean;
}

const ACTION_BY_ERROR_TYPE: Readonly<Record<ProviderFailureBoundaryErrorType, ProviderFailureBoundaryAction>> = {
  context_overflow: "retry_with_compaction",
  rate_limit: "retry_with_backoff",
  server_error: "retry_immediate",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function reject(
  code: ProviderFailureBoundaryRejectionCode,
  message: string,
): ProviderFailureBoundaryValidation {
  return { ok: false, code, message };
}

/**
 * Validate a serialized or otherwise untrusted boundary without consulting
 * clocks, storage, Provider, tools, Approval, or event infrastructure.
 */
export function validateProviderFailureBoundary(
  value: unknown,
): ProviderFailureBoundaryValidation {
  if (!isRecord(value)) {
    return reject("invalid_format", "Provider failure boundary must be an object.");
  }

  if (typeof value.version !== "number" || !Number.isInteger(value.version)) {
    return reject("invalid_format", "Provider failure boundary version is missing or invalid.");
  }
  if (typeof value.source !== "string") {
    return reject("invalid_format", "Provider failure boundary source is missing or invalid.");
  }
  if (typeof value.errorType !== "string") {
    return reject("invalid_format", "Provider failure boundary errorType is missing or invalid.");
  }
  if (typeof value.action !== "string") {
    return reject("invalid_format", "Provider failure boundary action is missing or invalid.");
  }
  if (!isNonNegativeInteger(value.delayMs)) {
    return reject("invalid_format", "Provider failure boundary delayMs must be a non-negative integer.");
  }
  if (typeof value.retryable !== "boolean") {
    return reject("invalid_format", "retryable is missing or invalid.");
  }
  if (!isNonNegativeInteger(value.completedRecoveryAttempts)) {
    return reject("invalid_format", "completedRecoveryAttempts must be a non-negative integer.");
  }
  if (!isNonNegativeInteger(value.maxRecoveryAttempts)) {
    return reject("invalid_format", "maxRecoveryAttempts must be a non-negative integer.");
  }
  if (!isNonNegativeInteger(value.maxOverflowRetries)) {
    return reject("invalid_format", "maxOverflowRetries must be a non-negative integer.");
  }

  if (typeof value.timedOut !== "boolean") {
    return reject("invalid_format", "timedOut is missing or invalid.");
  }
  if (typeof value.cancelled !== "boolean") {
    return reject("invalid_format", "cancelled is missing or invalid.");
  }
  if (typeof value.budgetExhausted !== "boolean") {
    return reject("invalid_format", "budgetExhausted is missing or invalid.");
  }

  if (value.version !== PROVIDER_FAILURE_BOUNDARY_VERSION) {
    return reject(
      "unsupported_version",
      `Provider failure boundary version ${String(value.version)} is not supported.`,
    );
  }
  if (value.source !== "provider") {
    return reject("unsupported_source", "Provider failure boundary source must be provider.");
  }

  if (value.cancelled) {
    return reject("cancelled", "Cancelled Provider failures cannot establish an R2 boundary.");
  }
  if (value.timedOut) {
    return reject("timed_out", "Timed-out Provider failures cannot establish an R2 boundary.");
  }
  if (value.budgetExhausted) {
    return reject("budget_exhausted", "Budget-exhausted runs cannot establish an R2 boundary.");
  }
  if (value.completedRecoveryAttempts >= value.maxRecoveryAttempts) {
    return reject("recovery_budget_exhausted", "The recovery budget is already exhausted.");
  }

  if (!Object.prototype.hasOwnProperty.call(ACTION_BY_ERROR_TYPE, value.errorType)) {
    return reject(
      "unsupported_error_type",
      `Provider failure type ${value.errorType} is not resumable by the R2 first batch.`,
    );
  }

  if (
    value.errorType === "context_overflow" &&
    value.completedRecoveryAttempts >= value.maxOverflowRetries
  ) {
    return reject("overflow_budget_exhausted", "The context-overflow recovery budget is already exhausted.");
  }

  if (!Object.values(ACTION_BY_ERROR_TYPE).includes(value.action as ProviderFailureBoundaryAction)) {
    return reject(
      "unsupported_action",
      `Provider recovery action ${value.action} is not resumable by the R2 first batch.`,
    );
  }
  if (ACTION_BY_ERROR_TYPE[value.errorType as ProviderFailureBoundaryErrorType] !== value.action) {
    return reject(
      "action_mismatch",
      `Provider failure type ${value.errorType} does not match action ${value.action}.`,
    );
  }
  if (value.retryable !== true) {
    return reject("not_retryable", "Provider failure boundary is not marked retryable.");
  }

  const boundary: ProviderFailureBoundary = {
    version: PROVIDER_FAILURE_BOUNDARY_VERSION,
    source: "provider",
    errorType: value.errorType as ProviderFailureBoundaryErrorType,
    action: value.action as ProviderFailureBoundaryAction,
    delayMs: value.delayMs,
    retryable: true,
    completedRecoveryAttempts: value.completedRecoveryAttempts,
    maxRecoveryAttempts: value.maxRecoveryAttempts,
    maxOverflowRetries: value.maxOverflowRetries,
    timedOut: false,
    cancelled: false,
    budgetExhausted: false,
  };

  return { ok: true, boundary: Object.freeze(boundary) };
}

/**
 * Build the boundary from the existing Provider classifier and RecoveryManager
 * decision. It never re-classifies text and has no runtime side effects.
 */
export function createProviderFailureBoundary(
  input: ProviderFailureBoundaryFactoryInput,
): ProviderFailureBoundaryValidation {
  if (
    input.recoveryDecision.classifiedError.type !== input.classifiedError.type ||
    input.recoveryDecision.classifiedError.retryable !== input.classifiedError.retryable
  ) {
    return reject(
      "classification_mismatch",
      "Provider classifier and RecoveryManager decision describe different failures.",
    );
  }

  const rawBoundary: Record<string, unknown> = {
    version: PROVIDER_FAILURE_BOUNDARY_VERSION,
    source: "provider",
    errorType: input.classifiedError.type as ClassifiedErrorType,
    action: input.recoveryDecision.action as RecoveryActionType,
    delayMs: input.delayMs,
    retryable: input.classifiedError.retryable,
    completedRecoveryAttempts: input.completedRecoveryAttempts,
    maxRecoveryAttempts: input.recoveryBudget.maxRecoveryAttempts,
    maxOverflowRetries: input.recoveryBudget.maxOverflowRetries,
    timedOut: input.timedOut,
    cancelled: input.cancelled,
    budgetExhausted: input.budgetExhausted,
  };

  return validateProviderFailureBoundary(rawBoundary);
}
