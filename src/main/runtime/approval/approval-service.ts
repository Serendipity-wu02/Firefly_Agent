import { randomUUID } from "node:crypto";
import type {
  ApprovalDecision,
  ApprovalRecord,
  ApprovalRequest,
  ApprovalRequestId,
  ApprovalRequestInput,
  ApprovalState,
} from "../../../shared/approval-types";
import {
  createApprovalRequestId,
  type ApprovalGrant,
} from "../../../shared/approval-types";
import {
  isSandboxScopeWithin,
  type SandboxScope,
} from "../../../shared/sandbox-types";
import { ApprovalServiceError } from "./approval-errors";
import { InMemoryApprovalStore, type ApprovalRecordStore } from "./approval-store";

export interface ApprovalServiceOptions {
  readonly store?: ApprovalRecordStore;
  readonly now?: () => number;
  readonly createRequestId?: () => ApprovalRequestId;
}

/**
 * Observes immutable ApprovalRecord lifecycle changes without owning or
 * duplicating Approval state.
 */
export type ApprovalRecordListener = (record: ApprovalRecord) => void;

function defaultNow(): number {
  return Date.now();
}

function defaultCreateRequestId(): ApprovalRequestId {
  return createApprovalRequestId(`approval-${randomUUID()}`);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

function isScopeShape(scope: unknown): scope is SandboxScope {
  if (typeof scope !== "object" || scope === null || !isNonEmptyString((scope as { kind?: unknown }).kind)) {
    return false;
  }

  const typedScope = scope as Record<string, unknown>;
  switch (typedScope.kind) {
    case "filesystem":
      return (
        isNonEmptyString(typedScope.path) &&
        (typedScope.access === "read" || typedScope.access === "write")
      );
    case "network":
      return (
        isNonEmptyString(typedScope.host) &&
        (typedScope.port === undefined ||
          (typeof typedScope.port === "number" && isValidPort(typedScope.port)))
      );
    case "process":
      return isNonEmptyString(typedScope.executable);
    case "desktop":
      return isNonEmptyString(typedScope.target);
    default:
      return false;
  }
}

function cloneScope(scope: SandboxScope): SandboxScope {
  return Object.freeze({ ...scope });
}

function cloneRequester(requester: ApprovalRequest["requester"]): ApprovalRequest["requester"] {
  return Object.freeze({ ...requester });
}

function validateRequester(requester: ApprovalRequest["requester"]): boolean {
  if (typeof requester !== "object" || requester === null || !isNonEmptyString(requester.id)) {
    return false;
  }
  if (requester.type === "subagent" && requester.parentRunId !== undefined) {
    return isNonEmptyString(requester.parentRunId);
  }
  return requester.type === "main-agent" || requester.type === "system-runtime" || requester.type === "subagent";
}

function validateRequestInput(input: ApprovalRequestInput): void {
  if (typeof input !== "object" || input === null) {
    throw new ApprovalServiceError(
      "INVALID_APPROVAL_REQUEST",
      "Approval request must be an object.",
    );
  }
  if (!isNonEmptyString(input.capabilityRequestId)) {
    throw new ApprovalServiceError(
      "INVALID_APPROVAL_REQUEST",
      "Approval request must contain a capability request ID.",
    );
  }
  if (!isNonEmptyString(input.capabilityId)) {
    throw new ApprovalServiceError(
      "INVALID_APPROVAL_REQUEST",
      "Approval request must contain a capability ID.",
    );
  }
  if (!validateRequester(input.requester)) {
    throw new ApprovalServiceError(
      "INVALID_APPROVAL_REQUEST",
      "Approval request requester metadata is invalid.",
    );
  }
  if (!isNonEmptyString(input.summary) || !isNonEmptyString(input.reason)) {
    throw new ApprovalServiceError(
      "INVALID_APPROVAL_REQUEST",
      "Approval request summary and reason must be non-empty.",
    );
  }
  if (!isScopeShape(input.effectiveScope)) {
    throw new ApprovalServiceError(
      "INVALID_APPROVAL_REQUEST",
      "Approval request effective scope is invalid.",
    );
  }
  if (input.createdAt !== undefined && !isFiniteTimestamp(input.createdAt)) {
    throw new ApprovalServiceError(
      "INVALID_APPROVAL_REQUEST",
      "Approval request createdAt must be a finite timestamp.",
    );
  }
  if (!isFiniteTimestamp(input.expiresAt)) {
    throw new ApprovalServiceError(
      "INVALID_APPROVAL_REQUEST",
      "Approval request expiresAt must be a finite timestamp.",
    );
  }
}

function freezeDecision(decision: ApprovalDecision): ApprovalDecision {
  if (decision.approved) {
    return Object.freeze({
      approved: true,
      grant: Object.freeze({
        lifetime: decision.grant.lifetime,
        scope: cloneScope(decision.grant.scope),
      }),
    });
  }
  return Object.freeze({
    approved: false,
    reason: Object.freeze({ ...decision.reason }),
  });
}

function freezeRecord(record: ApprovalRecord): ApprovalRecord {
  return Object.freeze({
    request: Object.freeze({
      ...record.request,
      requester: cloneRequester(record.request.requester),
      effectiveScope: cloneScope(record.request.effectiveScope),
    }),
    state: record.state,
    ...(record.decision ? { decision: freezeDecision(record.decision) } : {}),
    ...(record.resolvedAt !== undefined ? { resolvedAt: record.resolvedAt } : {}),
  });
}

export class ApprovalService {
  private readonly store: ApprovalRecordStore;
  private readonly now: () => number;
  private readonly createRequestId: () => ApprovalRequestId;
  private readonly listeners = new Set<ApprovalRecordListener>();

  constructor(options: ApprovalServiceOptions = {}) {
    this.store = options.store ?? new InMemoryApprovalStore();
    this.now = options.now ?? defaultNow;
    this.createRequestId = options.createRequestId ?? defaultCreateRequestId;
  }

  createPending(input: ApprovalRequestInput): ApprovalRecord {
    validateRequestInput(input);
    const createdAt = input.createdAt ?? this.now();
    if (!isFiniteTimestamp(createdAt) || input.expiresAt <= createdAt) {
      throw new ApprovalServiceError(
        "INVALID_APPROVAL_REQUEST",
        "Approval request expiresAt must be later than createdAt.",
      );
    }

    const approvalRequestId = this.createRequestId();
    if (this.store.get(approvalRequestId)) {
      throw new ApprovalServiceError(
        "APPROVAL_ID_COLLISION",
        `Approval request "${approvalRequestId}" already exists.`,
      );
    }

    const request: ApprovalRequest = Object.freeze({
      ...input,
      approvalRequestId,
      createdAt,
      requester: cloneRequester(input.requester),
      effectiveScope: cloneScope(input.effectiveScope),
    });
    const record = freezeRecord({ request, state: "pending" });
    this.store.set(record);
    this.notify(record);
    return record;
  }

  /** Subscribe to immutable lifecycle updates from the one Approval owner. */
  onChanged(listener: ApprovalRecordListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get(id: ApprovalRequestId): ApprovalRecord | undefined {
    this.expireExpired();
    return this.store.get(id);
  }

  listPending(): readonly ApprovalRecord[] {
    this.expireExpired();
    return Object.freeze(this.store.values().filter((record) => record.state === "pending"));
  }

  approve(id: ApprovalRequestId, scope?: SandboxScope): ApprovalRecord {
    const record = this.requirePending(id);
    const grantScope = scope ?? record.request.effectiveScope;
    if (!isScopeShape(grantScope) || !isSandboxScopeWithin(record.request.effectiveScope, grantScope)) {
      throw new ApprovalServiceError(
        "INVALID_APPROVAL_GRANT",
        "Approval grant scope must be contained within the effective Sandbox scope.",
      );
    }

    const grant: ApprovalGrant = {
      lifetime: "once",
      scope: cloneScope(grantScope),
    };
    return this.transition(
      record,
      "approved",
      { approved: true, grant },
    );
  }

  deny(id: ApprovalRequestId, message = "The user denied this approval request."): ApprovalRecord {
    const record = this.requirePending(id);
    return this.transition(record, "denied", {
      approved: false,
      reason: { code: "USER_DENIED", message },
    });
  }

  cancel(id: ApprovalRequestId, message = "The approval request was cancelled."): ApprovalRecord {
    const record = this.requirePending(id);
    return this.transition(record, "cancelled", {
      approved: false,
      reason: { code: "CANCELLED", message },
    });
  }

  expireExpired(now = this.now()): readonly ApprovalRecord[] {
    if (!isFiniteTimestamp(now)) {
      throw new ApprovalServiceError("INVALID_APPROVAL_REQUEST", "Approval clock must return a finite timestamp.");
    }

    const expired: ApprovalRecord[] = [];
    for (const record of this.store.values()) {
      if (record.state !== "pending" || record.request.expiresAt > now) continue;
      expired.push(
        this.transition(record, "expired", {
          approved: false,
          reason: {
            code: "EXPIRED",
            message: "The approval request expired before it was resolved.",
          },
        }, now),
      );
    }
    return Object.freeze(expired);
  }

  private requirePending(id: ApprovalRequestId): ApprovalRecord {
    this.expireExpired();
    const record = this.store.get(id);
    if (!record) {
      throw new ApprovalServiceError(
        "APPROVAL_NOT_FOUND",
        `Approval request "${id}" was not found.`,
      );
    }
    if (record.state !== "pending") {
      throw new ApprovalServiceError(
        "APPROVAL_ALREADY_RESOLVED",
        `Approval request "${id}" is already ${record.state}.`,
      );
    }
    return record;
  }

  private transition(
    record: ApprovalRecord,
    state: Exclude<ApprovalState, "pending">,
    decision: ApprovalDecision,
    resolvedAt = this.now(),
  ): ApprovalRecord {
    const next = freezeRecord({
      request: record.request,
      state,
      decision,
      resolvedAt,
    });
    this.store.set(next);
    this.notify(next);
    return next;
  }

  private notify(record: ApprovalRecord): void {
    for (const listener of this.listeners) {
      try {
        listener(record);
      } catch {
        // An observer must not change ApprovalService state transitions.
      }
    }
  }
}
