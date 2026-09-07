# Firefly Approval UI V1

## Ownership

`ApprovalService` in `src/main/runtime/approval/approval-service.ts` is the
only owner of `ApprovalRecord` state. It validates request identity, expiry,
scope containment, terminal transitions, and the `ONCE` grant.

`ApprovalWindowCoordinator` owns only presentation coordination: the ID of the
request currently shown, the deterministic FIFO selection order, the expiry
timer, and the single-window lifecycle. It does not copy ApprovalRecords into
a second store.

The renderer component at
`src/renderer/ui/components/ApprovalView.tsx` presents the main-process
snapshot and submits only `approve` or `deny`. It does not infer policy,
change the effective Sandbox scope, create a grant, or execute a tool.

## IPC

The shared channels are:

- `approval:get` — fetch the record currently shown by the main process.
- `approval:resolve` — submit the current request ID and `approve`/`deny`.
- `approval:changed` — receive the resolved or expired record snapshot.

The preload exposes `getApprovalRequest`, `resolveApproval`, and
`onApprovalChanged`. No arbitrary IPC sender or ApprovalService object crosses
the preload boundary.

## Window and close behavior

`WindowManager.openApprovalWindow()` owns one compact, independent frameless
Approval window. If more than one request is pending, the coordinator keeps the
oldest `createdAt` first and uses the request ID as a deterministic tie-breaker.
The next request opens only after the current window has closed.

Closing the window while its request is pending resolves that request as
`CANCELLED`. A terminal resolution or expiry sends the terminal record to the
renderer and closes the window.

## Grant and integration boundary

Every approved UI action resolves to the existing `ONCE` grant. There are no
persistent grants, session trust, or permission-center actions.

The Capability → Sandbox → Approval pipeline and the
`AuthorizedInvocationBridge` remain available for isolated integration tests.
The new UI/IPC surface is not wired into FireflyHarness, FireflyAgentCore,
SubAgentTaskService, or user chat execution in this round. Legacy ToolPolicy
confirmation remains unchanged.
