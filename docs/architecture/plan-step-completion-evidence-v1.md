# Plan Step Completion Evidence V1

## Scope

This record describes the implementation that prevents a plan step from being
marked complete solely because the assistant returned non-empty text and adds a
terminal gate for explicitly required execution plans. It keeps
the existing `FireflyHarness`, `BoundedPlanner`, and `StepVerifier` ownership;
it does not add a planner, an evaluator model, an execution loop, or a second
evidence store.

The implementation does not change permissions, Browser networking, Resume R2,
or any tool execution policy.

## Current production path

`BoundedPlanner.createPlan()` now accepts the new shared
`AgentPlanStepInput` contract. A structured definition may set
`completionRequirement` to `"tool"` or `"analysis"`. A legacy string and an
automatically split step have no requirement and therefore remain unverified;
the Harness does not infer their category from the next model response.

Plan activation and plan completion are separate contracts. The new
`AgentRunInput.planExecutionMode` field is Main-supplied and has the values
`"assist"` and `"required"`:

- absent or `"assist"` preserves the existing bounded-planning behavior;
  an automatically created plan is auxiliary and does not block an otherwise
  normal Chat completion;
- `"required"` explicitly requires a plan, forces plan creation through the
  existing `BoundedPlanner`, and enables the final completion gate.

The existing `planMode` field retains its prior planner enable/disable and
explicit-planner behavior; it was not assigned a new task-completion meaning.
The current Chat IPC remains an ordinary-message entry and never accepts this
field from Renderer.  The trusted Main-only entry is
`FireflyAgentCore.runRequiredPlan()` in
`src/main/orchestrator/planning/plan-execution-entry.ts` and
`src/main/orchestrator/firefly-agent-core.ts`.  It accepts only an explicit
`planExecutionMode: "required"` request with a bounded, non-empty structured
step list where every step declares `completionRequirement`.  Invalid mode,
prompt, or step data is rejected before the Harness starts, so it cannot fall
back to `"assist"`.  The default application currently has no user-facing
caller for this Main-only method; no IPC, Work page, or Chat keyword route was
added.  Ordinary Chat and auxiliary planning therefore retain their existing
behavior.

For a tool round, `FireflyHarness` creates the existing
`AgentToolCallEvidence` records while `ToolExecutionEngine` results are
processed. The Harness retains the complete run-level evidence and passes only
the evidence created in the current tool round to
`BoundedPlanner.advanceStep()`. `StepVerifier.verifyStep()` reads the
requirement already stored on the current `PlanStep`, then uses that transient
evidence only when the requirement is `"tool"`.

For a no-tool assistant response, the same verifier context contains an empty
current evidence array. A step explicitly declared as `"analysis"` may
complete from a non-empty analysis answer; the absence of a tool call cannot
change a tool step into an analysis step.

The context is not persisted as a second plan fact owner. The existing plan
and run evidence remain the durable/runtime owners. Historical evidence is not
silently reused for a later step.

## Completion rules

`AgentPlanStepDefinition.completionRequirement` is the new plan-creation field
in `src/shared/agent-types.ts`; `PlanStep.completionRequirement` carries the
stored decision into verification. `StepVerificationContext` in
`src/main/orchestrator/planning/step-verifier.ts` contains only the current
round evidence:

- `completionRequirement: "tool"` requires at least one current-round
  `AgentToolCallEvidence` record.
- Every current record must have `outcome: "success"` and `isError: false`.
- `failure`, `unknown`, `not_executed`, cancellation/timeout results represented
  as non-success evidence, and an empty current evidence set cannot produce
  step success.
- `executeToolRound()` preserves explicit unknown-submission, timeout, and
  cancellation markers as `AgentToolCallEvidence.outcome: "unknown"`; a
  restricted or deferred call remains `"not_executed"`.
- The assistant's text is observation text only in a tool step; it cannot
  override a failed or unknown execution result.
- `completionRequirement: "analysis"` permits a non-empty observation. It is
  selected before execution by the plan contract, not by whether this round
  happened to contain a tool call.
- An absent or unsupported requirement remains `uncertain`; the verifier does
  not use keyword matching to guess a category.

The evidence context is required by both `StepVerifier` and `BoundedPlanner`,
but it carries observations only. The step's completion requirement is read
from the plan itself. The existing `isError` and structured observation checks
remain in place for analysis observations, but a caller cannot omit the plan
requirement to turn arbitrary non-empty text into external-operation success.

For `planExecutionMode: "required"`, the final-answer branch additionally
requires every plan step to have `status: "completed"` and
`verification.status: "success"`. The gate runs only while the run is still
otherwise active; cancellation, timeout, budget exhaustion, no-progress, and
other established error paths retain priority. An incomplete required plan
settles the run with the new `AgentTerminationReason.kind: "plan_incomplete"`
and a structured reason of `plan_not_created`, `step_failed`,
`step_unverified`, or `step_not_executed`. It emits no `agent:final-answer`,
does not retry, resume, or request another tool round, and preserves the plan
and run evidence in the existing checkpoint. The same reason is returned in
`AgentRunResult`, `agent:finished`, and the checkpoint's existing
`terminationReason` field; the Checkpoint schema is unchanged.

## Event settlement

The Harness now emits `plan:step-completed` and `plan:completed` only when the
planner action is `next` or `complete`. A failed no-tool continuation emits
`plan:step-failed` and `plan:failed`; it cannot emit normal plan-completion
events merely because the final assistant message contains a success claim.

For an explicitly required plan, a successful `next` verification continues
through the same Harness loop to the next step. A successful `complete`
verification permits the normal assistant and final-answer events. A failed,
unverified, or not-executed required step instead settles the run as
`plan_incomplete`; the model's success claim remains transcript evidence only.
For absent or `"assist"` mode, the existing auxiliary-plan behavior remains
unchanged, so ordinary Chat is not blocked merely because a plan object exists.

## Main entry and R2 boundary

`runRequiredPlan()` fixes `source: "user"`, `planMode: true`,
`executionProfile: { kind: "MAIN", allowSubAgentDelegation: true }`, and a
defensive copy of the structured steps before calling the existing
`IAgentCore.run()` contract.  The lower-level `FireflyAgentCore.run()` also
performs the same runtime mode/step guard for malformed direct Main input.  It
returns a structured non-success result with zero Provider/tool calls and no
run events when the guard rejects.  Legacy string steps remain valid only for
advisory/unspecified planning and remain unverified; they cannot enter a
required plan.

R2 does not yet persist and reconstruct the required-plan contract.  Therefore
`FireflyHarness` excludes `planExecutionMode: "required"` from the internal
`stop_for_resume` boundary, while ordinary and assist R2 recovery is unchanged.
The optional `ResumeCheckpointFacts.planExecutionMode` marker is copied for
new assist facts; a snapshot explicitly marked `"required"` is rejected by
`ResumeProtocol` as missing the plan facts needed for safe restoration.  No
required plan is downgraded to assist, and no R2 resume entry is added.

## Contract limitation

`PlanStep` currently has no structured expected-tool, target URL, or operation
field. This implementation therefore binds proof to the current tool round and
does not invent a semantic target matcher. It prevents reuse of prior-step
evidence because only the current round is supplied, but it cannot prove that a
successful tool call semantically matches every natural-language step. Adding
that contract requires an explicit plan schema change and is outside V1.

## Verification

The planning suite covers:

1. non-empty text without current tool evidence;
2. a failed current tool result followed by a success claim;
3. evidence from another step not being reused;
4. successful current tool evidence;
5. a normal pure-analysis step;
6. a failed tool step not emitting plan-completion events after a later success
   claim;
7. `unknown` and `not_executed` evidence remaining unverified;
8. an explicitly tool-required step with zero tool calls remaining unverified;
9. legacy string steps without a completion requirement remaining unverified;
10. a required plan's zero-call tool step returning `plan_incomplete`, without a
    final-answer event;
11. a required plan with a successful analysis step completing normally;
12. failed required steps, cancellation, timeout, and round-budget termination
    retaining their existing terminal priority and checkpoint/result reason.
13. `FireflyAgentCore.runRequiredPlan()` accepting one explicit structured
    required plan and completing through the existing Harness loop;
14. invalid mode, missing completion requirements, and legacy string steps being
    rejected before Provider/tool execution.

These tests use the existing Harness/Planner path where integration behavior
is needed and use the existing `AgentToolCallEvidence` contract for direct
boundary cases. No real model, public network, Browser request, or Resume
entry is used.
