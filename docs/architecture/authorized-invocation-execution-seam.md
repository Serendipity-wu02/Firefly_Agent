# Firefly Authorized Invocation → Tool Execution Seam V1

Status: FOUNDATION IMPLEMENTED; current production seam

## Owner

The only execution owner remains:

`src/main/runtime/execution/tool-execution-engine.ts`

The narrow adapter is:

`src/main/runtime/authorization/authorized-invocation-bridge.ts`

`AuthorizedInvocationBridge` accepts an `AuthorizedCapabilityInvocation` plus
runtime-only execution context. It does not accept a raw `CapabilityRequest`,
`ApprovalRequest`, or Sandbox request.

## Exact hand-off

```text
AuthorizedCapabilityInvocation
    ↓ validate identity, binding, provenance, scope shape
AuthorizedInvocationBridge
    ↓ binding.toolId → ToolCall.name; request.input → ToolCall.arguments
ToolExecutionEngine.executeToolCall()  [exactly once]
    ↓
FireflyToolRegistry → FireflyToolDispatcher → concrete ToolDefinition.execute()
```

The bridge never resolves a tool from a capability, creates a second registry,
or reimplements policy, retry, timeout, cancellation, concurrency, dispatch,
or result truncation. It uses the authorized binding's `toolId` directly.

## Authorization provenance

The bridge preserves capability ID, request ID, requester, binding/tool ID,
effective scope, authorized scope, approval requirement, approval provenance,
and serializable correlation. An approval-grant invocation carries its ONCE
approval request identity. A sandbox-only invocation carries no fabricated
approval metadata.

Approval-grant invocation identities are consumed once per bridge instance
before delegation. A second use is rejected before the canonical engine is
called. No persistent grant store or production authorization singleton is
introduced.

## ToolPolicy boundary

`ToolExecutionContext.upstreamAuthorization` is optional and is only populated
by the bridge. Calls from the existing Harness and legacy callers do not set
it, so their `confirmation_required` behavior remains unchanged.

When the bridge supplies a valid matching authorization context, ToolPolicy
may satisfy only its confirmation branch. Explicit deny/allow lists, timeout,
retry, concurrency, budget, dispatch, and result policy remain in their
existing owners. A binding/tool mismatch never satisfies confirmation.

## Typed outcomes

The bridge returns the preserved canonical `ToolCallResult` together with the
authorization identity. Failures remain distinct:

- `INVALID_AUTHORIZED_INVOCATION`
- `TOOL_NOT_FOUND`
- `AUTHORIZATION_BINDING_MISMATCH`
- `TOOL_POLICY_FAILURE`
- `TOOL_EXECUTION_FAILURE`
- `CANCELLED`

## Production wiring

The bridge is constructed once by `src/main/index.ts` and is used by the
existing Harness authorization adapter for `music_status`, `music_control`,
and the bounded Worker route. It remains outside renderer, Character,
Memory/RAG, TTS, and Live2D ownership.

Focused coverage is in:

`tools/test/runtime/authorized-invocation-execution.test.mjs`
