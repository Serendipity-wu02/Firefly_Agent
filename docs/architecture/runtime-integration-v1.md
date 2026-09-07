# Firefly Runtime Integration V1.1.1 — Design Freeze

Status labels in this document are deliberate:

- **FOUNDATION IMPLEMENTED** means the typed foundation already exists and is
  covered by tests.
- **DESIGNED** means the ownership or contract is frozen here.
- **NOT YET WIRED** means no production path currently invokes that stage.
- **FUTURE** means a later implementation round must make the decision real.

## 1. Ownership matrix

| Component | Owns | May call/use | Must not own | Runtime-connected today |
| --- | --- | --- | --- | --- |
| `FireflyHarness` | The one canonical Agent Loop, run lifecycle, context/planning/recovery coordination | `ContextManager`, `HarnessAuthorizationAdapter`, `ToolExecutionEngine`, existing orchestrator services, provider boundary | A second loop, Character presentation, a second executor | Yes |
| `FireflyAgentCore` | Public Agent facade and dependency composition | `FireflyHarness` | Loop logic, direct tool calls, renderer/Character ownership | Yes |
| `AgentSession` | Conversation/run transcript state | Harness-owned lifecycle | Tool policy, approval, presentation | Yes |
| `ContextManager` | Canonical context slots, projection, budget/compaction input | Memory/RAG/context slots | Agent loop, execution, Character output | Yes |
| `ToolExecutionEngine` | Existing policy-gated tool execution, timeout, retry, concurrency, result policy | `ToolPolicy`, `FireflyToolRegistry`, dispatcher, canonical `AgentEventBus` | Capability registry, Sandbox, Approval lifecycle, a second executor | Yes |
| `ToolPolicy` | Legacy allow/deny, risk, confirmation, timeout, retry, result and concurrency decisions | Tool metadata and policy config | Becoming a second Approval owner | Yes |
| `FireflyToolRegistry` | Concrete tool definitions and lookup | Tool consumers and the execution engine | Capability authorization or a second registry | Yes |
| `CapabilityRegistry` | Declarative capability descriptor lookup | Capability metadata consumers | Authorization, Sandbox evaluation, Approval, execution | Two production descriptors wired: `music.status.read`, `music.control` |
| `SandboxPolicyEvaluator` | Pure resource-scope evaluation and effective scope | Serializable Sandbox contracts | File/network/process execution, Approval, tool execution | Two production profiles wired for the `QQMusic` desktop status/control boundary |
| `ApprovalService` | Main-process pending/approved/denied/cancelled/expired lifecycle | Serializable Approval DTOs, lifecycle observers, and injected clock/store | Policy inference, Sandbox evaluation, tool execution, UI ownership | Approval IPC/UI and one main-agent authorization path wired |
| `CapabilityAuthorizationPipeline` | Ordered Capability → Binding → Sandbox → Approval authorization and resume | `CapabilityRegistry`, `CapabilityBindingResolver`, `SandboxPolicyEvaluator`, `ApprovalRequirementResolver`, `ApprovalService` | Tool execution, Harness, LLM, SubAgent runtime, UI | `music_status` and `music_control` consumers wired |
| `HarnessAuthorizationAdapter` | Translate one Harness tool call to/from the authorization contracts and wait for Approval lifecycle | `CapabilityAuthorizationPipeline`, `ApprovalService`, `AuthorizedInvocationBridge` | Tool execution, ToolPolicy, timeout/retry/concurrency, UI ownership, a second pending store | Both migrated music routes wired |
| `SubAgentRegistry` | Declarative SubAgent profile lookup | Task foundation and worker runtime | LLM calls, tools, Harness, Character | One `music-status-worker-v1` descriptor wired |
| `SubAgentTaskService` | Serializable task creation and deterministic lifecycle | `SubAgentRegistry`, task contracts | LLM calls, tools, Capability authorization, Sandbox, Approval, Agent Loop | Main delegation and Worker runtime wired |

The future Main Firefly remains the owner of persona, relationship,
memory interpretation, final response, TTS, Live2D, and user-facing
embodiment.

## 2. Canonical graph

The frozen future graph is:

```text
Main Firefly
    ↓ delegation request
SubAgentTaskService
    ↓ SubAgent runtime boundary
CapabilityRequest
    ↓ declarative registry + binding resolver
CapabilityRegistry / CapabilityBindingResolver
    ↓ resource check
SandboxPolicyEvaluator
    ↓ separate policy decision
ApprovalRequirementResolver
    ↓ when required
ApprovalService
    ↓ AuthorizedCapabilityInvocation
CapabilityBinding → existing FireflyToolRegistry
    ↓ execution
ToolExecutionEngine
    ↓
Concrete Tool
    ↓ structured tool observation
SubAgentResult
    ↓
Main Firefly → characterful final response / TTS / Live2D
```

The Capability → Binding → Sandbox → Approval segment remains an explicitly
constructed authorization pipeline. The two production main-agent paths now
wired are:

```text
FireflyHarness tool call: music_status
    ↓ HarnessAuthorizationAdapter
Capability: music.status.read
    ↓ binding: music_status
Sandbox profile: firefly-music-status-read-v1
    ↓ desktop target: QQMusic (read status boundary only)
CapabilityAuthorizationPipeline
    ↓ AUTHORIZED or PENDING_APPROVAL
AuthorizedInvocationBridge
    ↓
ToolExecutionEngine → existing music_status tool
    ↓
canonical Harness tool-result transcript writeback
```

`music_control` uses the same graph with capability `music.control`, binding
`music_control`, control Sandbox profile `firefly-music-control-v1`, and the
same `QQMusic` desktop target. Main delegation creates only the existing
`music-status-worker-v1` task; the Worker uses the same Harness, authorization
pipeline, bridge, and execution engine. No parallel or recursive worker is
enabled.

## 3. Integration contracts

**FOUNDATION IMPLEMENTED:**

- `CapabilityRequest` remains the serializable request identity/input
  contract.
- `SandboxEvaluationInput` and the `allowed` decision carry the effective
  resource scope.
- `ApprovalRequest`/`ApprovalDecision` carry the human-consent lifecycle.
- `CapabilityBindingResolver` is the single binding owner. V1 is conservative:
  one registered capability maps to one registered tool, and a tool cannot be
  registered under a second capability through this resolver.
- `ApprovalRequirementResolver` is a separate pure policy function. It reads
  explicit capability requirements; `ApprovalService` does not infer policy.
- `CapabilityAuthorizationPipeline` is the single ordered authorization owner.
  It returns `AUTHORIZED`, `PENDING_APPROVAL`, or typed `DENIED` outcomes and
  supports explicit resume/cancellation after the ApprovalService lifecycle.
- `AuthorizedCapabilityInvocation` is the typed, non-executing hand-off
  object. Its factory requires a matching binding, an allowed Sandbox decision,
  and an approved `ONCE` decision when the resolver says `required`. It carries
  both the effective Sandbox scope and the final authorized scope; approval may
  narrow but never widen that boundary.

The invocation contract preserves the original `CapabilityRequest`, including
requester, capability identity, request identity, and input. It carries the
Sandbox effective scope and, when required, the `ONCE` Approval grant. It does
not contain an executor, callback, BrowserWindow, session, or LLM object.

The opt-in seam at
`src/main/runtime/authorization/authorized-invocation-bridge.ts` validates the
completed invocation, uses its binding `toolId` directly, and delegates one
canonical `ToolCall` to `ToolExecutionEngine`. It carries authorization
provenance and authorized scope into the engine through an optional typed
runtime context. The existing engine still owns policy, confirmation handling,
timeout, cancellation, retry, concurrency, dispatch, and result policy.

**PRODUCTION INTEGRATION WIRED:** `src/main/index.ts` constructs one bridge
with the same `ToolExecutionEngine` supplied to `FireflyAgentCore`. The Harness
routes only `music_status` and `music_control` through
`HarnessAuthorizationAdapter`; all other tools continue to use the legacy
`ToolCall`/`ToolExecutionContext` route directly.

## 4. Legacy ToolPolicy and Approval migration

### CURRENT

`ToolPolicyEvaluator` decides legacy `allow`, `deny`, or
`require_confirmation` actions using tool registration, configured allow/deny
lists, safety/risk metadata, timeout, retry, result, and concurrency settings.
`ToolExecutionEngine` consumes that decision and currently returns a structured
`confirmation_required` result for legacy confirmation blocks.

### MIGRATED ROUTES

The two migrated production routes resolve:

```text
Capability → Binding → Sandbox effective scope → Approval requirement
→ ApprovalService lifecycle → AuthorizedCapabilityInvocation
→ ToolExecutionEngine
```

ApprovalService is the single owner of human consent for both paths. The
legacy ToolPolicy confirmation behavior remains active for calls without
upstream authorization. The opt-in bridge supplies a validated, typed upstream
authorization context; only the confirmation branch may be satisfied by that
context. Explicit deny/allow lists and all execution policies remain active,
so the new seam does not create a second confirmation prompt while preserving
legacy behavior for existing callers.

ToolPolicy responsibilities that remain permanent are tool-level allow/deny,
risk/safety metadata, timeout, retry, concurrency, and result-size policy.
Its human-confirmation behavior is the responsibility planned for eventual
migration; it must not be duplicated by SubAgent, Sandbox, CapabilityRegistry,
or ApprovalService.

## 5. SubAgent execution strategy

**IMPLEMENTED:** Main delegation uses `MainAgentDelegationService`,
`SubAgentTaskService`, and `SubAgentWorkerRuntime` beneath the same
`FireflyHarness`. The only Worker profile is `music-status-worker-v1`; it is
bounded to one declared read capability, finite steps/tool calls/time, and
depth zero. No `SubAgentLoop`, `SubAgentHarness`, second Agent Loop, or worker
pool exists.

The future worker context must provide functional instructions, structured
worker output, cancellation, finite task budgets, and capability gating while
excluding CharacterPolicy, relationship/presentation state, TTS, Live2D,
proactive behavior, and Pet UI. This choice preserves one loop owner and gives
the smallest blast radius: extraction beneath the existing loop can be tested
without copying the Harness.

Worker execution uses the configured Firefly provider through the existing
facade. Main delegation is visible only to MAIN execution, and Worker
execution cannot delegate again. Browser, Files, PowerShell, Desktop
Automation, and `music_search` remain outside this authorization graph.

## 6. Character and Memory/RAG isolation

**DESIGNED:** Main Firefly owns persona, relationship, memory interpretation,
embodiment, TTS, Live2D, proactive behavior, and the final user-facing reply.
SubAgents receive no implicit Character/Relationship/TTS/Live2D/Pet state.

Memory/RAG access is **NOT YET WIRED** and defaults to none. In a future round,
Main Firefly may project a task-specific, read-only context slice or explicitly
gate retrieval through a capability. Direct unrestricted Character Memory or
RAG access is prohibited.

## 7. Budget, depth, and cancellation

**IMPLEMENTED:** every `SubAgentTask` carries finite `maxSteps`,
`maxToolCalls`, `timeoutMs`, `maxDepth`, and `depth`. Root tasks start at depth
0; child tasks reference a parent and advance exactly one level. Child budgets
must not exceed the parent task budget. Main delegation reserves remaining
parent budget before creating the one Worker task. The Worker inherits parent
cancellation and requester lineage; the parent remains the only continuation
owner. No scheduler, parallel worker, or recursion is added.

Current cancellation capabilities are separate, with one active Harness link:

- `SubAgentTaskService.cancel()` changes task state and records structured
  cancellation; it does not kill a process.
- `ApprovalService.cancel()` cancels a pending Approval request. The
  `HarnessAuthorizationAdapter` waits on this lifecycle without holding a
  second record store.
- `ToolExecutionEngine` already accepts `AbortSignal` through
  `ToolExecutionContext` and propagates it to supported concrete tools.
- The current production Harness owns the Agent run signal.

The current pilot chain is:

```text
Main Harness run signal → pending Approval cancellation
→ CapabilityAuthorizationPipeline terminal outcome
→ AuthorizedInvocationBridge → ToolExecutionEngine AbortSignal
```

The adapter does not create a second AbortController. Approval wait cancellation
uses the existing run signal; once authorized, the same signal is passed through
the bridge to the existing execution owner.

## 8. Failure model

Failures remain typed and cross boundaries without collapsing into one message:

| Boundary | Meaning | Current contract |
| --- | --- | --- |
| Capability failure | Unknown/invalid capability metadata or binding | `CapabilityBindingError` / capability registry errors |
| Sandbox denial | Requested resource is outside the profile or invalid | `SandboxDecision.allowed: false` with stable denial code |
| Approval denial | User denied, request expired, or was cancelled | `ApprovalDecision.approved: false` with denial code |
| Approval service error | Missing, resolved, invalid, or colliding Approval request | `ApprovalServiceError.code` |
| Tool execution failure | Policy, timeout, cancellation, dispatcher, or tool failure | Existing `ToolCallResult` structured output and events |
| SubAgent task failure | Worker task lifecycle failure | `SubAgentResult.ok: false` and `SubAgentFailure` |
| Main Agent cancellation | User/main run cancellation | Existing Agent run status/events |

The active Harness adapter maps pipeline and bridge failures to structured
Harness tool results. It preserves `CAPABILITY_NOT_FOUND`, `BINDING_NOT_FOUND`,
`SANDBOX_DENIED`, `PERMISSION_PROFILE_DENIED`, `APPROVAL_DENIED`, `APPROVAL_CANCELLED`,
`APPROVAL_EXPIRED`, `TOOL_NOT_FOUND`, `TOOL_POLICY_FAILURE`,
`TOOL_EXECUTION_FAILURE`, and `CANCELLED` without stack output.

## 9. Event model

The canonical `AgentEventBus` remains the only event bus. This pilot adds no
second authorization event stream. If a later integration needs events, extend
the existing typed
`AgentEvent` union with names such as `subagent:created`,
`subagent:started`, `capability:requested`, `sandbox:denied`,
`approval:requested`, `approval:resolved`, and `subagent:completed`.

Existing Harness and ToolExecutionEngine events remain unchanged. The explicit
waiting state is stored in existing Harness checkpoint state as
`waiting_permission`; the Approval card remains the user interaction surface.

## 10. Composition root

The current main composition root owns one `ApprovalService`,
`CapabilityRegistry`, `CapabilityBindingResolver`, `SandboxPolicyEvaluator`,
`ApprovalRequirementResolver`, `PermissionProfilePolicyResolver`,
`CapabilityAuthorizationPipeline`, `AgentEventBus`, `ToolExecutionEngine`,
`AuthorizedInvocationBridge`, and `HarnessAuthorizationAdapter` for the two
migrated music routes and one bounded Worker profile. These are explicit
constructor dependencies; no service locator
or hidden mutable singleton is introduced.

`ApprovalService.onChanged()` connects its existing lifecycle to the existing
Approval IPC coordinator in the composition root. The adapter has no renderer
or Electron import and knows no presentation surface.

## 11. Unimplemented items

The following remain **FUTURE/BLOCKED**: Browser/Files/PowerShell
capabilities, Desktop Automation, additional production Sandbox profiles,
`music_search` until a concrete provider exists, broad legacy ToolPolicy
confirmation migration, autonomous recursion, worker pools, and any SubAgent
personality or voice.

## 12. Next smallest implementation step

The next scope must remain one explicitly selected tool path at a time. Any
future migration must retain the existing single Harness, single execution
engine, single tool registry, and ApprovalService state ownership.

## 13. RAG embedding test entry

`tools/test/rag/embedding.test.mjs` is included in the default `npm test`
script. Its provider-discovery assertions deliberately expect the current
local production embedding state to be `unconfigured`; they do not require a
model file, API key, network service, or external embedding process. The
remaining cases use `DeterministicEmbeddingProvider`, local checked-in JSON
knowledge data, and temporary test directories. This makes the suite
independent of production model availability while still keeping the
production-provider diagnostic contract covered. A future configured-provider
test must be an explicitly separate environment-gated check and must not be
reported as a default-test pass when the model or service is absent.
