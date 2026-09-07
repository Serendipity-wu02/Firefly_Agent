# Main Agent Delegation Integration V1

## Scope and audited baseline

Firefly V1.1.1 has two independent concepts:

1. Agent execution identity is represented by `AgentExecutionProfile`:
   `MainExecutionProfile` has `kind: "MAIN"`; `WorkerExecutionProfile` has
   `kind: "WORKER"` plus task identity, requester identity, a read-only context
   projection, capability/tool allowlists, and `SubAgentTaskConstraints`.
2. The local product does not define a Chat/Codex/Work execution-mode enum or
   router. The production conversational entry is `CHAT_SEND_MESSAGE` in
   `src/main/chat/chat-ipc.ts`. `RendererView` represents windows (`chat`,
   `settings`, `summary`, `approval`), while `CharacterMode` (`daily`, `work`)
   controls character presentation. Neither type is an agent product-mode
   router. There is no local Codex-mode or product Work-mode execution entry.

The distinction prevents the character `work` presentation state from being
treated as the product Work execution mode.

## Production graph

```text
Chat renderer
  │ CHAT_SEND_MESSAGE
  ▼
chat-ipc.ts
  │ executionProfile = MAIN + explicit delegation access
  ▼
FireflyAgentCore facade
  ▼
FireflyHarness (the only Agent Loop)
  │
  ├─ ordinary registry tool ───────────────► ToolExecutionEngine
  │
  └─ delegate_subagent runtime operation
       ▼
     MainAgentDelegationService
       │ validates descriptor, arguments, correlation, remaining budget
       ▼
     SubAgentTaskService (existing task state owner)
       ▼
     SubAgentWorkerRuntime (existing worker owner)
       ▼
     FireflyAgentCore.run(executionProfile = WORKER)
       ▼
     same FireflyHarness implementation
       │ music_status
       ▼
     HarnessAuthorizationAdapter
       ▼
     CapabilityAuthorizationPipeline → Sandbox → Approval when required
       ▼
     AuthorizedInvocationBridge → same ToolExecutionEngine
       ▼
     structured SubAgentResult
       ▼
     normalized delegate_subagent tool observation
       ▼
     original parent AgentSession
       ▼
     original MAIN provider continuation → final MAIN answer
```

No renderer or business module owns or calls `SubAgentWorkerRuntime`.

## Delegation model surface and owner

`delegate_subagent` is a Harness runtime operation. It is not placed in
`FireflyToolRegistry` because delegation is orchestration, not a concrete
capability invocation. Its schema is added only when a `MAIN` execution carries
`allowSubAgentDelegation: true`. A `WORKER` execution receives only tool schemas
derived from its declared capability bindings, so recursive delegation is not
visible and cannot pass the Worker allowlist.

The schema exposes the exact registered worker IDs and descriptions. Its fields
are:

- `subAgentId`: exact registered `SubAgentId`.
- `objective`: bounded functional work objective.
- `input`: small JSON-serializable task projection.

Unknown fields, empty identifiers/objectives, non-serializable values, and
unregistered workers are rejected before task creation.

`MainAgentDelegationService` owns only the MAIN-to-task bridge. It validates the
request, calls the existing `SubAgentTaskService`, invokes the existing
`SubAgentWorkerRuntime`, and normalizes the terminal result. It does not run an
Agent loop or execute an underlying tool.

## V1 target and context isolation

The only descriptor remains `music-status-worker-v1`, declaring only
`music.status.read`. The capability binding resolves that declaration to
`music_status`. `music.control` and every undeclared tool remain absent from the
Worker schema and are rejected by the Worker allowlist before execution.

Worker input consists only of the task objective and the explicit `task_input`
projection. Worker runs do not execute Context slots and receive no Character,
relationship, Memory, RAG, MusicPreference, TTS, Live2D, or proactive state.
Their `AgentSession` is separate from the parent session. Worker assistant
messages and Worker final-answer events are not emitted as MAIN presentation.

## Parent correlation and continuation

Every root task records the exact parent `runId` in `parentRunId`. The
`CapabilityRequester` is `{ type: "main-agent", id: parentRunId }`. The
normalized observation returns:

- `parentRunId`;
- `parentConversationId` when the caller supplied `conversationId`;
- `taskId`;
- `subAgentId`;
- terminal task state;
- successful structured output/summary, or typed failure information.

The service never returns the Worker system prompt, Worker transcript, or tool
transcript. `FireflyHarness` appends only this normalized value as the tool
message matching the original delegation call. The existing next loop iteration
therefore sends it to the same parent provider/session. An awaited call cannot
attach a task result to another run.

Worker output is never returned directly from Chat IPC. Chat policy,
embodiment, TTS, and Live2D process only the final completed MAIN result.

## Budget and cancellation

V1 reserves a finite Worker budget of two steps, one tool call, 30 seconds, and
depth zero. Effective timeout is capped by the parent wall-clock time remaining.
Delegation is rejected unless the parent retains:

- two Worker steps;
- one Worker tool call after counting the delegation operation;
- one additional MAIN step for final continuation;
- positive wall-clock time.

The full reserved Worker step/tool budget is charged conservatively to the
parent run. The parent cannot gain free rounds or tool calls through delegation.
Later calls in the same model response are deferred until MAIN consumes the
Worker observation.

The parent `AbortSignal` flows through the delegation service into
`SubAgentWorkerRuntime`, the Worker Harness, approval waits, the authorized
bridge, and `ToolExecutionEngine`. The parent checks cancellation again before
appending a returned observation. A completion/cancellation race can leave an
already terminal Worker task succeeded, but it cannot resume or complete the
cancelled parent.

## Failure and events

Worker `succeeded`, `failed`, and `cancelled` states remain distinct. Success
contains only safe structured output. Failure carries the existing typed
`SubAgentFailure`. Cancellation is always an error observation and never a
success value.

The existing `AgentEventBus` remains the only event bus. Existing
`subagent:started`, `subagent:completed`, `subagent:failed`, and
`subagent:cancelled` events represent task lifecycle. No duplicate delegation
event family or task state store was added. Rich task cards remain a future
presentation seam; correctness does not require a new UI framework.

## Product entry restrictions

Chat is the only local user product execution entry and explicitly enables this
operation. Proactive MAIN runs omit the grant and retain their existing tool
surface. Local Codex and product Work execution entries do not exist, so this
round does not fabricate their identifiers, workspaces, sessions, permissions,
or tool surfaces. A future real entry can opt into the same `MAIN` Harness seam
without adding another Worker framework or Agent Loop.

## Frozen boundaries

- One `FireflyHarness` Agent Loop.
- One `FireflyAgentCore` facade.
- One `FireflyToolRegistry` and `ToolExecutionEngine`.
- One `AgentEventBus`, `ApprovalService`, authorization pipeline, and Sandbox.
- One production `SubAgentRegistry`, `SubAgentTaskService`, and
  `SubAgentWorkerRuntime` instance.
- No recursive or parallel delegation.
- No coding, research, search, document, browser, shell, or general worker.
- No Memory, RAG, Character, MusicPreference, proactive, presentation, TTS, or
  Live2D redesign.
- `music_search` remains blocked by the missing discovery provider.
- Selective Music Preference projection and proactive music behavior remain
  deferred.
