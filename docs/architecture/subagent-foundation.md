# Firefly SubAgent Foundation V1.1.1

This foundation defines a serializable functional-worker boundary. It does not
execute a model, create a second Agent loop, or delegate a production tool.

## Ownership boundaries

- Main Firefly owns personality, relationship, final response, TTS, Live2D, and
  user-facing embodiment.
- SubAgent owns only a declarative profile identity and a bounded delegated-task
  lifecycle. Its objective is functional work, not a character prompt.
- Capability answers what authority a worker may request.
- Sandbox answers where a requested resource may operate.
- Approval answers whether the user consents to a requested authority/action.
- `ToolExecutionEngine` remains the sole owner of concrete tool execution.

The intended future relationship is:

```text
User
  ↓
Main Firefly
  ↓ delegation decision
SubAgent task
  ↓ may request
Capability
  ↓ resource boundary
Sandbox
  ↓ human consent
Approval
  ↓ execution owner
ToolExecutionEngine
  ↓ structured work result
Main Firefly
  ↓ presentation
characterful answer / TTS / Live2D
```

SubAgent descriptor capability declarations are metadata only. They do not
authorize a capability, create an Approval grant, or broaden a Sandbox scope.

## Contracts and owners

- `src/shared/subagent-types.ts` owns `SubAgentId`, `SubAgentTaskId`, the
  declarative descriptor, serializable task/lineage/constraint contracts,
  lifecycle states, budget containment helper, and discriminated result/failure
  types.
- `src/main/runtime/subagents/subagent-registry.ts` is the one declarative
  profile registry.
- `src/main/runtime/subagents/subagent-task-service.ts` is the one in-memory
  task lifecycle owner for this foundation. It creates tasks and records
  `PENDING → RUNNING → SUCCEEDED / FAILED / CANCELLED`; it does not perform the
  work represented by a task.
- `src/main/runtime/subagents/subagent-errors.ts` owns stable service errors.

`CapabilityRequester` carries explicit `SubAgentId` and `SubAgentTaskId` fields
for the subagent requester variant. Main-agent and system-runtime requester
shapes remain unchanged. Profile identity, task identity, capability request
identity, approval request identity, and main Agent run identity remain
distinct.

Every task carries finite `maxSteps`, `maxToolCalls`, `timeoutMs`, and
`maxDepth` constraints plus a `depth`. Root tasks are depth `0`; child tasks
reference a parent task and must be exactly one level deeper. A child budget
cannot exceed the parent budget. This is a contract and deterministic
validation rule only; no scheduler or recursive delegation engine is included.

Cancellation is a lifecycle transition, not process killing. A second
transition from any terminal state returns the stable
`TASK_ALREADY_TERMINAL` service error.

## Deliberate omissions

This round does not implement a SubAgent model call, a second Agent loop, a
worker pool, tool invocation, Capability authorization, Sandbox evaluation,
Approval integration/UI, Browser/Files/Shell capabilities, autonomous
background agents, or SubAgent personality/voice/Live2D.

`FireflyHarness` remains the canonical Agent loop. `ToolExecutionEngine`
remains the canonical execution owner. The registry and task service remain
tested foundation components and are not threaded through the existing
composition root until a real consumer exists.
