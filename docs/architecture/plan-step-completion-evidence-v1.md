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

For a tool step, the V1 `toolBinding` field is also fixed before confirmation.
It reuses `AgentRequiredToolExecution` and contains the exact enabled tool name,
the arguments to compare, the existing URL matching mode, and the existing
`json_ok_true`/`once` contract. Main validates the binding against the enabled
`FireflyToolRegistry` schemas. A Browser binding must additionally match one
of the normalized URLs extracted from the original user message; plan text
cannot add a target. Analysis steps cannot carry a binding. A legacy tool step
without a binding remains unverified rather than being relaxed.

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

`AgentPlanStepDefinition.completionRequirement` and its V1 `toolBinding` are
the plan-creation fields in `src/shared/agent-types.ts`; `PlanStep` carries
both immutable decisions into verification. `StepVerificationContext` in
`src/main/orchestrator/planning/step-verifier.ts` contains only the current
round evidence and the current Harness run identity:

- `completionRequirement: "tool"` requires a current-round
  `AgentToolCallEvidence` record whose `runId`, tool name, and arguments match
  the stored binding through the existing `matchesRequiredToolExecution`
  matcher.
- Every current record must have `outcome: "success"` and `isError: false`.
- `failure`, `unknown`, `not_executed`, cancellation/timeout results represented
  as non-success evidence, and an empty current evidence set cannot produce
  step success.
- `executeToolRound()` preserves explicit unknown-submission, timeout, and
  cancellation markers as `AgentToolCallEvidence.outcome: "unknown"`; a
  restricted or deferred call remains `"not_executed"`.
- The assistant's text is observation text only in a tool step; it cannot
  override a failed or unknown execution result.
- A valid `json_ok_true` result proves only the declared operation. When a
  music result reports `commandSubmission: "accepted"` without an observed
  state change, the verifier records submission-only evidence and does not
  claim that the player state changed.
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

## Binding scope and limitations

The V1 binding is intentionally structural. Main checks the tool's current
enabled schema and the binding's parameters before the run; the verifier then
checks the actual current-run evidence with the existing exact or normalized
URL matcher. Different tools, URLs, paths, query parameters, or operations do
not substitute for the declared binding. This does not infer a natural-language
meaning for arbitrary descriptions. It also does not turn a command submission
into proof of an external state change. Tool steps from old plans that lack a
binding remain unverified.

Work confirmation renders known bindings as human-readable operations. The
execution context also includes the fixed operation so the Provider can emit
the declared tool call; the raw binding remains Main-owned execution data and
is not a new permission or authorization source.

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
14. invalid mode, missing completion requirements, missing/unknown tool bindings,
    schema-mismatched arguments, and out-of-scope Browser targets being rejected
    before Provider/tool execution;
15. different tools, different parameters, historical evidence, unknown results,
    and submission-only music results not being upgraded into the declared
    operation or an external state change.

These tests use the existing Harness/Planner path where integration behavior
is needed and use the existing `AgentToolCallEvidence` contract for direct
boundary cases. No real model, public network, Browser request, or Resume
entry is used.

## Tool-target binding V1 verification

The binding-specific implementation and regression tests add the following
Main-owned contract:

- `AgentPlanStepDefinition.toolBinding` is copied into the immutable runtime
  `PlanStep` and the Work snapshot before confirmation;
- Main rejects an unavailable tool, schema-mismatched arguments, an analysis
  step carrying a binding, and a Browser URL outside the original user target
  set before Provider or tool execution;
- `StepVerifier` accepts only current-run evidence matching the declared tool
  and parameters. A different tool, different URL, prior-run evidence,
  failure, or unknown result cannot satisfy the step;
- Work confirmation and the plan context render the declared operation in
  readable form. A `commandSubmission` result is not presented as proof that
  a player state changed.

The affected checks passed in this worktree: planning `37/37`, Work `6/6`,
and Harness `43/43`. The current round also passed `npm run typecheck`,
`npm run build:main`, and `git diff --check`. The full test suite, public
network, and the final GUI recheck were not run in this round.

The final GUI recheck was blocked before any app input: the Computer Use
inventory returned no native application surface, while the existing Electron
process was independently observed as PID `28020` with window title
`Firefly Agent - Desktop Pet` and window handle `6817234`. The available
Computer Use API could not bind that returned window. The process was not
force-terminated, and its existing state was not treated as a new-build
verification. The latest `build:main` output was generated, but the running
process was not restarted and therefore is not evidence that it loaded the
latest tool-surface implementation.

Controlled Harness tests prove that a required Work tool step sends only its
bound schema, that analysis and final-summary rounds send no schema and reject
unexpected calls before dispatch, and that ordinary Chat keeps its existing
tool surface. They do not prove that a real model will always emit the
declared binding or that a real external side effect occurred.

## Work final manual evidence boundary

The prior Firefly process PID `28020` was closed through the normal application
exit path; its Electron child processes also disappeared. The latest compiled
`dist/main/main/orchestrator/harness/firefly-harness.js` was written at
`2026-09-19 14:59:57`, and `dist/main/main/index.js` at `14:59:58`. The
verified `npm.cmd start` command uses `electron .` and the package entry
`dist/main/main/index.js`.

The replacement process PID `28172` started at `2026-09-19 15:00:04`, with
Electron children `23724`, `33740`, and `30056`. It therefore started after
the latest Main build. Diagnostic output showed the tool registry and window
ready events before the run.

The correlated Work run was
`work-run-1789801399401-f8zt7b`:

1. Plan generation sent no tool schema and returned a structured proposal.
2. The required tool step sent exactly one schema, `music_status`; the
   Provider returned `toolCalls=music_status`.
3. The next summary request sent `schemas=0`, `toolNames=none`, and the
   Provider returned `toolCalls=none` with final text.

The user-provided Work screenshot shows the same task with the QQMusic step
`completed`, verification `success`, and terminal state `completed`. The
console trace does not print the tool result body, but the Harness emits the
`agent:tool-result` event and the UI displayed the matching successful step.
No extra summary-stage tool execution occurred, and no unexpected model tool
call required rejection in this run.

The ordinary Chat regression used run
`run-1789801452441-evjs5`. It retained the normal MAIN surface with eight
schemas, returned no tool call, and completed with a normal short reply. This
confirms the required-plan tool restriction did not affect ordinary Chat.
