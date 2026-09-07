# Harness Authorization Integration V1

## Scope

This document records the first real production authorization path in
Firefly 1.1.1. It is deliberately limited to one existing canonical tool:

| Field | Value |
| --- | --- |
| Harness tool | `music_status` |
| Capability | `music.status.read` |
| Binding | `music.status.read` → `music_status` |
| Sandbox profile | `firefly-music-status-read-v1` |
| Requested scope | `{ kind: "desktop", target: "QQMusic" }` |
| Adapter | `HarnessAuthorizationAdapter` |

`music_status` is defined in `src/main/tools/music-tools.ts`. Its tool function
only obtains `MusicService.getSnapshot()` and serializes that snapshot; it does
not call play, pause, next, previous, stop, or volume controls. `MusicService`
starts the QQ Music desktop bridge as its primary desktop player and starts MPV
as its existing fallback; `getSnapshot()` returns the bridge snapshot when it
is available and the MPV state otherwise. The current Sandbox contracts do not
define a no-resource scope. The `QQMusic` target is the exact current primary
desktop-app boundary from the bridge script's `SourceAppUserModelId` match. It
does not add Desktop Automation or player input.

## Production path

```text
LLM message.toolCalls
    ↓
FireflyHarness / executeToolRound
    ↓ only when tool name is music_status
HarnessAuthorizationAdapter
    ↓
CapabilityAuthorizationPipeline
    ├─ AUTHORIZED ───────────────────────────────┐
    └─ PENDING_APPROVAL → ApprovalService wait ──┤
                                                   ↓
AuthorizedInvocationBridge
    ↓
the existing ToolExecutionEngine
    ↓
the existing FireflyToolDispatcher / music_status definition
    ↓
canonical Harness agent:tool-result event and transcript tool message
```

The main composition root constructs one `AgentEventBus` and one
`ToolExecutionEngine`, then injects that exact engine into both
`FireflyAgentCore` and `AuthorizedInvocationBridge`. There is no second
executor, dispatcher, registry, Harness, Agent Loop, Approval store, or event
bus.

## Legacy coexistence

`executeToolRound` checks only whether the call is `music_status` before using
the adapter. Every other tool continues directly to the existing
`ToolExecutionEngine.executeToolCall()` path. No non-pilot tool is partially
authorized through the new pipeline.

The adapter never calls a tool implementation, dispatcher, retry policy,
timeout policy, result truncation policy, or concurrency planner. The bridge
remains the only narrow hand-off to the canonical execution owner.

## Permission profile and approval

The composition root supplies `SettingsManager.getPermissionProfile()` to the
existing `ApprovalRequirementResolver` through
`PermissionProfilePolicyResolver`. The adapter reads the current scheme for
every authorization request; it does not hardcode scheme behavior.

The pilot's declared approval requirement is `none` and its capability is
explicitly `sideEffect: "read_only"`. The current four-scheme policy therefore
produces these semantics:

| Permission scheme | Pilot result before execution |
| --- | --- |
| `READ_ONLY` | Sandbox-only authorization |
| `RESTRICTED_SCOPE` | Sandbox-only authorization |
| `ASK_EVERY_TIME` | Sandbox-only authorization because the pilot is read-only |
| `FULL_ACCESS` | Sandbox-only authorization within the configured scope |

The second migrated production route is `music.control`, which is declared
`sideEffect: "external_action"` and `risk: "side_effect"`. It requires an
Approval request under the current route declaration and remains bounded to
the `QQMusic` desktop scope; `READ_ONLY` rejects it before Approval.

When approval is required, `CapabilityAuthorizationPipeline` creates the one
record in `ApprovalService`. The adapter subscribes to that service lifecycle,
does not keep a second pending map, and resumes the same logical tool call when
the record becomes terminal. The main composition root connects the same
lifecycle to the existing Approval presentation coordinator:

- visible Chat uses the existing inline card;
- hidden Chat uses the existing fallback approval window and hint;
- the Harness and adapter import neither renderer modules nor Electron.

Approval terminal behavior is structured and does not invoke the tool when the
record is denied, cancelled, or expired. A scheme switch is also checked at
resume, so an Approval record cannot release a newly prohibited side effect:

| Terminal state | Harness tool-result error |
| --- | --- |
| denied | `APPROVAL_DENIED` |
| cancelled | `APPROVAL_CANCELLED` |
| expired | `APPROVAL_EXPIRED` |

The existing Harness run `AbortSignal` is also attached to the approval wait.
Run cancellation invokes `CapabilityAuthorizationPipeline.cancelPending()` and
the existing service lifecycle clears the pending presentation. Once approved,
the same signal flows through `AuthorizedInvocationBridge` into
`ToolExecutionEngine`.

## Same-round barrier

`executeToolRound` is already serial. When the pilot returns
`PENDING_APPROVAL`, it records `waiting_permission` in the existing Harness
checkpoint state and waits before starting any later call in that round.

After the terminal outcome for the pilot:

1. The pilot receives its canonical success or structured error result.
2. Every later call from that original LLM tool-call message is written in its
   original order as a structured `deferred_after_approval` result with
   `ToolCallOutcome = not_executed`.
3. The next LLM round receives every tool result and can explicitly re-plan any
   deferred work.

No sibling tool is silently dropped or started while a human decision is
pending. This also prevents an original-round side-effect call from proceeding
solely because an earlier tool was awaiting approval.

## ToolPolicy coexistence

The bridge attaches validated `upstreamAuthorization` to the one canonical
engine call. Existing `ToolPolicy` still evaluates allow/deny, timeout, retry,
concurrency, and result policy. A valid upstream authorization satisfies only
the existing confirmation branch, so the approval path does not show a second
confirmation. Explicit ToolPolicy denial continues to block execution.

## Failure mapping

The adapter turns authorization and bridge failures into structured Harness
tool results without an internal stack trace. These exact error distinctions
are retained:

`CAPABILITY_NOT_FOUND`, `BINDING_NOT_FOUND`, `SANDBOX_DENIED`,
`PERMISSION_PROFILE_DENIED`,
`APPROVAL_DENIED`, `APPROVAL_CANCELLED`, `APPROVAL_EXPIRED`,
`TOOL_NOT_FOUND`, `TOOL_POLICY_FAILURE`, `TOOL_EXECUTION_FAILURE`, and
`CANCELLED`.

Successful bridge results are remapped to the original LLM `toolCallId` before
the normal Harness event and transcript writeback, preserving assistant/tool
message continuity.

## Deliberately not wired

This round does not add Browser, Files, PowerShell, Desktop Automation, a bulk
tool migration, TTS changes,
Live2D changes, Character/Memory/RAG changes, or a redesign of Approval UI.
SubAgent remains unwired by design.

## Test coverage

`tools/test/runtime/harness-authorization-integration.test.mjs` covers the
production-shaped path, approval wait/resume/deny/cancel/expire, same-round
barrier and re-planning, profile changes, structured failures, no double
confirmation, execution count, message/result association, and architecture
ownership. Existing Harness, ToolExecutionEngine, Capability, Sandbox,
Approval, Permission Profile, SubAgent foundation, and bridge tests remain in
the full test command.
