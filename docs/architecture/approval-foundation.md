# Firefly Approval Foundation V1.1.1

Document status: historical foundation snapshot. The current production
approval integration is recorded in `approval-ui-v2.md` and
`runtime-integration-v1.md`; the current four permission schemes are recorded
in `permission-profile-v1.md`. This snapshot is retained for the foundation
round and is not a current production-status declaration.

Approval answers whether a user consents to one requested authority/action. It
is a typed lifecycle boundary, not a capability registry, Sandbox evaluator,
tool policy, or tool executor.

## Responsibility boundaries

- Capability answers **what authority or ability exists**.
- Sandbox answers **where and within what resource boundary it may operate**.
- Approval answers **whether the user consents to this requested action**.
- `ToolExecutionEngine` answers **how an already-authorized concrete tool
  operation executes** and remains the sole tool execution owner.
- SubAgent Foundation supplies requester/task metadata only; no SubAgent model
  or tool execution exists here.

The states remain separate:

```text
Capability registered  !=  authorized
Sandbox allowed        !=  user approved
User approved          !=  tool executed
```

Production tools are not routed through this unfinished foundation in V1.
Existing `ToolPolicy` and `ToolExecutionEngine` behavior remains unchanged.

## Contracts

`src/shared/approval-types.ts` owns serializable DTOs for:

- distinct `CapabilityRequestId` and `ApprovalRequestId` correlation values;
- requester identity reused from `CapabilityRequester`;
- semantic `summary` and `reason` fields;
- existing tool `risk` and `sideEffect` metadata for the approval presenter;
- the capability identity and the effective `SandboxScope`;
- `ApprovalDecision`, `ApprovalDenial`, `ApprovalGrant`, and lifecycle state;
- `CapabilityApprovalRequirement` with only `none` or `required`.

Approval requests contain the effective Sandbox scope, not an unchecked wider
requested scope. The human-readable summary helps a future UI present the
request, while the structured capability and scope fields remain canonical.

The DTOs contain no `BrowserWindow`, Electron event, `AgentSession`,
`ToolExecutionEngine`, callback, or `AbortSignal`, and can be serialized across
a future IPC boundary.

## Lifecycle owner

`src/main/runtime/approval/approval-service.ts` is the single main-process
approval lifecycle owner. `InMemoryApprovalStore` is its storage abstraction;
there is no renderer-side approval store.

```text
PENDING
  ├── APPROVED
  ├── DENIED
  ├── CANCELLED
  └── EXPIRED
```

Every terminal state is final. A second resolution returns the stable
`APPROVAL_ALREADY_RESOLVED` service error. Unknown IDs return
`APPROVAL_NOT_FOUND`. Expiration is evaluated through an injectable clock and
does not create a hidden timer per request. Cancellation is distinct from user
denial.

V1 grants support only the `ONCE` lifetime. A grant may narrow the effective
Sandbox scope, but the service rejects a grant wider than that scope with
`INVALID_APPROVAL_GRANT`. It never evaluates Sandbox profiles or expands a
scope.

## Future UI/IPC boundary

No polished approval UI, modal framework, notification system, or production
IPC handler is added in V1. A future renderer may display `ApprovalRequest`
records and send an `ApprovalDecision`; the main-process `ApprovalService`
remains the canonical owner.

Approval does not execute tools, call an LLM, open windows, mutate an
`AgentSession`, call `ToolExecutionEngine`, or implement Sandbox evaluation.
