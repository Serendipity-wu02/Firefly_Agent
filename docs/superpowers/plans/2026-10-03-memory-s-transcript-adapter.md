# S conversation transcript adapter implementation plan

**Goal:** Adapt the existing Main conversation transcript to the S canonical transcript boundary, with mutation invalidation and no production activation.
**Base:** `9b4eac04b4993c14c59f34ac5648524bf1f8e6d4`.
**Spec:** `2026-10-01-memory-s-context-budget.md`, authoritative amendment and provider lease/ordering sections; user-approved bounded continuation on 2026-10-03.

## Constraints
- Only this existing source tree; one writer, no clone/worktree/runtime copy.
- Adapter defaults disabled and has no application/IPC registration.
- No real userData, chat/memory reads, API, migration, M/H production activation, dist/release write or application restart.
- Keep existing quality gates, dependencies and CI unchanged. Use installed Vitest and Main tsc --noEmit.
- Synthetic artifacts only under E:/Codex/2026-10-02/task-2/firefly-s-transcript/validation.
- Preserve canonical text/roles/tool IDs, names and argument strings. Reject unsupported rich provider payloads or incomplete tool results rather than silently stripping/reconstructing them.
- First adapter exposes the complete active transcript as one indivisible S unit. Per-turn budget selection and real provider serialization/counting remain deferred.

## Tasks and acceptance
1. Extend the existing store queue with a Main-only read lease and a single per-session before-mutation observer. Cover append, rewind (edit/regenerate), deletion and tail repair; observer failure prevents the write. A lease reader cannot escape its lifetime. Existing callers without an observer keep their behavior.
2. Hold the canonical provider lease through context reservation, reading and publication. Notify its optional Main-only onCaptured hook before releasing the lease, so the adapter always invalidates the latest published dependency, including recounts.
3. Add conversation-transcript-adapter.ts and adjacent tests. Bind the actor's fixed session/scope, reject temporary before any store access, default disabled, reuse materializeTranscript and validateUnit. Use no inferred source trust or M writes. Invalidate before controlled mutation; deletion changes incarnation; disposal invalidates before releasing observation.
4. Verify real store + real synthetic SQLite context integration: full tool pairs/arguments, active edit/regenerate view, old snapshot/permit rejection after append/edit/regenerate/delete, no send invocation, no foreign/temporary access, no lease/publication gap, fail-closed mutation, dispose/recreation, labelled-secret refusal. Verify existing transcript and S tests, then Main types.
5. Targeted self-review of authority, queue ordering, lifetime, error privacy and default-off boundaries. Independent review remains a later parent task; leave a precise result and verification evidence.

## Verification
- RED first: existing context publication occurs outside provider lease; new test must fail on the observed lease state.
- GREEN: publication and notification occur while leased.
- Adapter tests start RED for missing adapter, then pass against existing store/repository implementations.
- Regression: memory-context, transcript store/context/coordinator and relevant source/policy boundaries as dictated by changes, not repeated full suite.
- No build: current dist is in use and explicitly protected. Main noEmit verifies compilation.
- No real-counter or real-send completion claim.
