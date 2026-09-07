# Harness Authorization Pilot Audit and Freeze

## Decision

The first production authorization integration is semantically sound for the
single `music_status` path. The pilot is frozen. No second production tool is
migrated by this audit.

| Item | Frozen value |
| --- | --- |
| Product version | `1.1.1` |
| Harness tool | `music_status` |
| Capability | `music.status.read` |
| Binding | `music.status.read` → `music_status` |
| Sandbox profile | `firefly-music-status-read-v1` |
| Requested scope | `{ kind: "desktop", target: "QQMusic" }` |
| Requester | `{ type: "main-agent", id: "firefly-harness" }` |
| Execution owner | `ToolExecutionEngine` |
| Approval state owner | `ApprovalService` |

## Production trace and identity continuity

The production path is:

```text
LLM message.toolCalls[call]
  → FireflyHarness
  → executeToolRound
  → HarnessAuthorizationAdapter for music_status
  → CapabilityAuthorizationPipeline
  → AUTHORIZED or PENDING_APPROVAL
  → ApprovalService lifecycle when required
  → AuthorizedInvocationBridge
  → the one ToolExecutionEngine
  → FireflyToolDispatcher
  → music_status → MusicService.getSnapshot()
  → adapter result remap
  → Harness agent:tool-result event and transcript tool message
```

The original LLM `ToolCall.id` is retained by the Harness observation and
transcript. The adapter creates the capability request ID as:

```text
harness:{runId}:{step}:{toolCallsCount}:{toolCallId}
```

The authorization request carries `music.status.read`, the main-agent
requester, and the cloned tool input. Its runtime-only correlation contains
`runId`, optional `conversationId`, and the exact `toolCallId`. An approval
request receives its own `ApprovalRequestId` and stores the capability request
ID. The bridge passes the authorized request ID to the canonical engine as its
internal tool-call ID, then the adapter remaps the canonical result to the
original LLM tool-call ID before Harness writeback.

Approval resume requires the expected capability request ID, capability ID,
and correlation. A stale request from another run or tool call returns
`APPROVAL_CORRELATION_MISMATCH` and cannot resume the active invocation. The
bridge also rejects a correlation mismatch between the invocation and active
runtime context.

## Exactly-once and race model

Exactly-once is enforced at three boundaries:

1. The adapter settles its approval wait once and removes its listener and
   timer after settlement.
2. `CapabilityAuthorizationPipeline` consumes each approved
   `ApprovalRequestId` once.
3. `AuthorizedInvocationBridge` consumes each capability request ID once
   before submitting it to `ToolExecutionEngine`.

`ApprovalService` accepts a single terminal transition for a request. A second
renderer approval, a stale IPC approval, or a second pipeline resume cannot
create a second invocation. The bridge returns
`DUPLICATE_AUTHORIZED_INVOCATION` for a repeated request submission.

The audit covers these deterministic boundaries without real sleeps:

- cancellation before pending creation;
- cancellation while approval is pending;
- approval followed by cancellation before bridge dispatch;
- cancellation while the execution owner is running;
- expiration and cancellation ordered at the same control point;
- repeated approval resolution;
- stale run, tool-call, capability-request, and invocation correlation.

Cancellation is cooperative for a tool that has already entered execution.
The execution owner converts a parent cancellation observed after dispatcher
return into `tool_cancelled`, so the Harness cannot receive false success. A
future mutating tool may still have started an external action before a
cooperative cancellation is observed; cancellation is not rollback.

## Same-round barrier protocol

`executeToolRound` is ordered. When a pilot call waits for approval, no later
call in that original assistant tool-call message starts. Each later call gets
one ordered result with this model-visible payload shape:

```json
{
  "ok": false,
  "error": "deferred_after_approval",
  "outcome": "not_executed",
  "deferredByToolCallId": "<earlier call>",
  "approvalRequestId": "<approval request>",
  "message": "Tool call was deferred because an earlier tool call waited for user approval. The next LLM round may re-plan it."
}
```

The runtime observation also stores `ToolCallOutcome = "not_executed"`. This
preserves one result for every original tool-call ID and lets the next LLM
round re-plan explicitly. A deferred call is never reported as success and is
not counted as an executed tool call.

## Approval and permission semantics

The current resolver, rather than Harness-specific branching, produces the
four-scheme behavior. This four-scheme contract supersedes the earlier product
planning vocabulary and has no fifth project-read-only mode:

| Scheme | Read-only `music_status` | Side-effect `music_control` |
| --- | --- | --- |
| `READ_ONLY` | Sandbox-only authorization | Denied before Approval |
| `RESTRICTED_SCOPE` | Sandbox-only authorization | Declared Approval requirement |
| `ASK_EVERY_TIME` | Declared requirement | Per-request Approval |
| `FULL_ACCESS` | Declared requirement | Declared Approval requirement |

The scheme is read for each new authorization decision. A pending request is
re-evaluated on resume: switching to `READ_ONLY` cancels and denies a pending
side effect, while switching to `FULL_ACCESS` does not approve it. The
effective Sandbox scope never widens. Approved, denied, cancelled, and expired
requests cannot resume a second time.

Denial, cancellation, and expiration remain separate tool results:

| User/runtime outcome | Tool result error |
| --- | --- |
| User denial | `APPROVAL_DENIED` |
| Approval cancellation | `APPROVAL_CANCELLED` |
| Approval expiry | `APPROVAL_EXPIRED` |
| Run cancellation before an approval exists or before bridge dispatch | `CANCELLED` |

No renderer or approval presenter is required for authorization correctness.
Without a presentation, the request remains pending until the canonical
service receives a deny/cancel/expire transition; absence of a presenter never
approves it.

## ToolPolicy responsibility freeze

The responsibilities are fixed as follows:

- Capability registry and binding resolve what operation is being requested.
- Sandbox policy evaluates the requested external scope.
- Permission/profile policy decides whether human approval is required.
- ApprovalService owns the pending record and terminal decision.
- ToolPolicy retains tool eligibility, allow/deny, timeout, retry,
  concurrency, result limits, budget, and its legacy confirmation branch.
- `upstreamAuthorization` satisfies only the old confirmation branch when its
  tool ID and authorization provenance validate. It does not skip deny rules,
  budgets, timeouts, retries, concurrency, or result policy.
- ToolExecutionEngine remains the only production execution owner.

## `music_status` side-effect and Sandbox assessment

The tool implementation calls only `MusicService.getSnapshot()`. That method
reads the QQ Music Desktop Bridge snapshot when available and otherwise reads
the MPV state. It does not call play, pause, resume, next, previous, stop,
volume write, desktop input, or shell mutation. Application startup already
starts the bridge polling and MPV fallback as service lifecycle initialization;
the `music_status` tool call does not start or control playback.

The current desktop scope is semantically honest because the snapshot comes
from an external desktop-player boundary, including the QQ Music primary path
and MPV fallback. The Sandbox foundation requires one modeled resource scope
and currently supports filesystem, network, process, and desktop scopes. A
`{ kind: "none" }` scope is not recommended for this pilot: it would erase the
external-player boundary rather than describe it. A future no-resource scope
can be reviewed for capabilities that touch only in-process immutable data;
that future type must mean “no external authority required,” remain explicit
in profiles, and preserve default-deny. It is not added in this freeze.

## Existing tool inventory

The following inventory is classification only. No listed non-pilot tool is
migrated here. Capability IDs and scopes below are migration design labels, not
registrations.

| Tool ID | Class | Migration capability label | Sandbox boundary | Current ToolPolicy confirmation | Complexity |
| --- | --- | --- | --- | --- | --- |
| `music_status` | B. Read-only external | `music.status.read` | Desktop `QQMusic` | No; pilot approval/profile path applies | Frozen pilot |
| `music_search` | C. Network read | `music.search.read` | Provider network host, to be resolved from current provider configuration | No | Medium |
| `music_recommend` | C. Network read | `music.recommend.read` | Provider network host, to be resolved from current provider configuration | No | Medium |
| `music_play` | H. High-side-effect external action | `music.play` | Provider network plus player control boundary | No | High |
| `music_control` | H. High-side-effect external action | `music.control` | Player control boundary | No | High |
| `play_live2d_action` | G. Desktop/embodiment control | `live2d.action.execute` | Firefly Pet IPC/desktop presentation boundary | No | Medium |

The next migration wave is exactly one tool: `music_search`. It is the next
low-risk read operation after the frozen status pilot, but it must first bind
its actual provider network host and retain ToolPolicy coexistence. This is a
recommendation only; no implementation is included in this audit.

## Composition and presentation ownership

The composition root owns one production instance of the active event bus,
ToolExecutionEngine, ApprovalService, CapabilityRegistry,
CapabilityBindingResolver, SandboxPolicyEvaluator,
PermissionProfilePolicyResolver, ApprovalRequirementResolver,
CapabilityAuthorizationPipeline, and AuthorizedInvocationBridge. The existing
global Firefly tool registry remains the sole tool registry. Harness receives
the one adapter by dependency injection; SubAgent remains unwired and has no
parallel authorization adapter.

Approval presentation remains outside Harness:

- visible Chat uses the existing inline approval card;
- unavailable Chat uses the existing fallback approval window and Firefly
  hint;
- the service lifecycle, adapter, and tests do not import renderer or Electron
  presentation code.

## Frozen invariants and known gaps

- No second production tool is authorized by this round.
- TTS remains GPT-SoVITS V2ProPlus, seed 15, cut5, speed 0.9.
- Live2D, Character, Memory/RAG, and Chat permission semantics remain outside
  this audit; Chat outer radius remains 16px.
- SubAgent execution remains unwired.
- The deferred Pet speech-panel layout issue remains deferred.
- Native GUI/human approval flow was not exercised in this audit because no
  Firefly Electron session was available; runtime and architecture tests are
  the validation boundary here.

## Validation

The focused audit suite is
`tools/test/runtime/harness-authorization-pilot-audit.test.mjs`. It uses
injected clocks and Promise control points, not real sleeps. The existing pilot
integration, Harness, ToolExecutionEngine, Capability, Sandbox, Approval,
Permission Profile, SubAgent, and presentation tests remain in the full test
command.
