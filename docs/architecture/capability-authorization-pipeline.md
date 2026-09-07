# Firefly Capability Authorization Pipeline V1

Status: FOUNDATION IMPLEMENTED; historical foundation snapshot

This document describes the standalone V1 authorization owner. It ends at an
`AuthorizedCapabilityInvocation`; the current execution wiring is described in
`runtime-integration-v1.md` and uses the same owner for `music_status`,
`music_control`, and the bounded Worker route.

## Owner and dependencies

The only production owner is:

`src/main/runtime/authorization/capability-authorization-pipeline.ts`

`CapabilityAuthorizationPipeline` receives explicit constructor dependencies:

- `CapabilityRegistry`
- `CapabilityBindingResolver`
- `SandboxPolicyEvaluator`
- `ApprovalRequirementResolver`
- `ApprovalService`

There is no hidden global authorization singleton, second binding registry,
second ToolPolicy, or execution owner. The current Composition Root constructs
this pipeline once and injects it into the existing Harness authorization
adapter.

## Implemented graph

```text
CapabilityRequest
    ↓
CapabilityRegistry
    ↓
CapabilityBindingResolver
    ↓
SandboxPolicyEvaluator
    ↓
ApprovalRequirementResolver
    ├─ NONE ───────────────→ AuthorizedCapabilityInvocation
    └─ REQUIRED → ApprovalService → PENDING_APPROVAL
                                      ↓ resumeAfterApproval
                                  APPROVED → AuthorizedCapabilityInvocation
```

The pipeline returns exactly these typed outcomes:

- `AUTHORIZED` with a non-executing invocation object;
- `PENDING_APPROVAL` with the canonical `ApprovalRequest`;
- `DENIED` with a stage and stable failure code.

Capability registration means `KNOWN`, not authorized. Sandbox allow means the
resource is inside the profile, not that human approval exists. An approved
Approval request means a grant is available, not that a tool has executed.

## Scope and provenance invariants

The Sandbox evaluator supplies `effectiveScope`. The ApprovalService accepts a
grant only when its scope is contained by that effective scope. The invocation
contains both:

- `effectiveScope`: the Sandbox boundary;
- `authorizedScope`: the final scope available to a future execution adapter.

For `NONE`, these scopes are equal and no approval metadata is fabricated. For
`REQUIRED`, `authorizedScope` is the `ONCE` grant scope and cannot widen the
Sandbox boundary. The invocation also records whether its provenance is
`sandbox-only` or an `approval-grant`, including the ApprovalRequest ID for the
latter.

An approved request is consumed by the pipeline after one successful resume.
A second resume cannot produce another authorized invocation.

## Resume and cancellation

`authorize()` creates one pending ApprovalRequest only after Capability,
Binding, Sandbox, and approval-requirement checks succeed. It never blocks,
opens UI, auto-approves, or executes.

`resumeAfterApproval(approvalRequestId)` reads the canonical ApprovalService
record. It preserves `APPROVAL_DENIED`, `APPROVAL_CANCELLED`, and
`APPROVAL_EXPIRED` as distinct typed outcomes. `cancelPending()` cancels a
still-pending canonical request and returns the cancellation outcome. No
process or tool cancellation is implemented here.

## Boundaries that remain unchanged

The existing legacy `ToolPolicy` confirmation behavior remains the current
production owner. No migration or double-prompting path is introduced.

`ToolExecutionEngine`, `FireflyHarness`, LLM providers, renderer/TTS/Live2D,
and SubAgent execution are intentionally not imported or called. The future
execution adapter may consume an authorized invocation, but that adapter is
not part of V1.

Tests: `tools/test/runtime/capability-authorization-pipeline.test.mjs`
