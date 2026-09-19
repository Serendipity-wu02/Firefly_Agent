# Harness Cross-Round No-Progress Detection V1

## Scope

This change adds a run-local guard in the existing `FireflyHarness`. It does
not add an Agent loop, a retry policy, a permission path, a Browser path, an
R2 recovery path, or a second state owner. The production budget values,
Provider Recovery, cancellation, timeout, and tool retry policies remain
unchanged.

## Existing execution evidence used

`FireflyHarness.runInternal()` already owns the single loop and appends one
`AgentToolCallEvidence` entry for each model tool call after
`executeToolRound()` returns. `ToolExecutionEngine` owns internal retries and
returns one final `ToolCallResult` for that model call; its `tool:retry` events
are not converted into additional `AgentToolCallEvidence` entries. The new
detector therefore observes the real post-engine evidence, not Provider text,
assistant wording, or individual internal retry attempts.

The detector reads the registered tool's explicit `ToolDefinition.sideEffect`.
The first batch covers only:

- `read_only`: stable successful read results and stable failed read results;
- `external_network_read`: the same two result classes for static external
  reads such as `browser_read`.

`external_action`, `state_mutation`, `idempotent`, missing side-effect metadata,
`unknown`, and `not_executed` observations are outside this V1 gate. In
particular, repeated music control calls are never stopped because their
success text happens to be equal.

## New run-owned contract

`src/main/orchestrator/harness/no-progress-detector.ts` defines the new
`NoProgressDetector` and the new `NO_PROGRESS_THRESHOLD` value of `3`.
`FireflyHarness.runInternal()` constructs one detector per run. MAIN and Worker
invocations use their own `runInternal()` state, and a later `run()` call does
not reuse the previous detector.

For each qualifying observation, the detector compares:

1. the exact tool name;
2. a deterministic structural serialization of the complete arguments object
   (object key order is normalized, arrays and all argument values are kept);
3. the evidence outcome class and error bit; and
4. the complete result output. JSON output is parsed only to normalize object
   key order; no result field is removed. Non-JSON output is compared as the
   exact text.

The evidence correlation fields (`runId`, round, call ID, and transcript
message IDs) identify an execution and are not business arguments or result
payload. They are not used to decide semantic equality. No generic timestamp,
ID, URL, or error-field deletion is performed. Consequently, a contract that
puts a changing observation value into the result output is treated as a
changed result, not silently normalized away.

Only consecutive rounds count. A repeated call in the same round is one round
of evidence. A missing round, changed arguments, or changed result resets that
call's consecutive count. The third consecutive identical read observation
produces `AgentNoProgressInfo` with the tool name, current tool-call ID, step,
count, threshold, and one of:

- `repeated_read_result`;
- `repeated_read_failure`.

The new `AgentRunResult.noProgress` field carries that structured fact and
`error` is `agent_no_progress`. The result remains `status: "error"` with the
existing `{ kind: "error" }` termination shape, so no new checkpoint or Resume
schema is introduced.

## Decision order and terminal boundary

The detector is evaluated after the complete tool round has been recorded and
task facts have been refreshed, but before another Provider request. Existing
checks retain priority:

1. cancellation and total timeout;
2. task-facts, compaction, input, and existing budget termination;
3. the cross-round no-progress gate;
4. the next normal Harness round.

When the gate fires, the Harness stops with the structured non-success result,
keeps all actual tool evidence and transcript messages, emits one existing
`agent:error`, and does not emit `agent:final-answer`. It does not call the
Provider again, retry a tool, create approval, or alter authorization. If a
round budget or cancellation becomes terminal at the same boundary, the
existing budget/cancellation result wins and `noProgress` is not reported.

## Tests

`tools/test/core/harness.test.ts` covers the real Harness path for:

- repeated successful read results and repeated read failures;
- different URL arguments and changed read results;
- repeated external-action calls remaining legal;
- internal tool retry collapsing to one cross-round evidence entry;
- separate sequential runs not sharing detector state;
- cancellation and round-budget precedence over a matching repeated read.

The tests use a controlled Provider and registered tools. They do not start the
application, request a real model, or access the network.

## Limits

This V1 does not infer task completion, compare natural-language responses,
compare arbitrary unknown tool payloads, or detect progress in side-effecting
operations. It also does not inspect model intent or plan text. These limits
avoid treating a legitimate repeated external action, an unknown submission,
or a volatile result contract as a proven no-progress state.
