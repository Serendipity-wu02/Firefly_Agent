# AgentRuntime default-disabled Main S entry

Base: 295e1918946a3d668d94070fd67ba4d6706eb4e1, refactor/skills-source-layout; clean.

Scope: add a lazy injectable Main-only AgentRuntime entry. Legacy buildOptions/chat/harness remain unchanged. No production registration, database/Worker creation by default, UI/settings, M/H, writer or network calls. Existing stream wrappers rebuild/retry requests, so this increment supports only explicit stream:false and returns the direct SDK result; stream:true is refused before source reads.

1. RED: exercise actual AgentRuntime lazy/default-off behavior and synthetic canonical transcript -> exact count -> permit -> direct frozen Responses send.
2. Implement a serialized persistent Main port around existing context/binding/adapter. Snapshot caller request before awaits; canonical turns supply conversation messages. Tools/schema/output/stream are fixed before preparing. No silent fallback. Propagate cancellation through count/permit/claim/send, with a final synchronous pre-send check.
3. GREEN: cancellation before/during count and claim/send; mutation during count, stale sources, configuration drift, one invocation, failure without legacy fallback, request mutation/accessor rejection, default-off no new reads/provisioning. Existing related regressions, Main/Renderer types and a bounded actual Main entry bundle in the fixed E validation directory.
4. Review changed diff against existing contracts, record evidence and remaining online/stream/UI boundaries; local commit only. Parent performs independent review.

Primary SDK source: installed openai 7.5.0 resources/responses/responses.d.ts and internal/request-options.d.ts (direct create and AbortSignal RequestOptions). No dependency/quality-gate changes.

Completed: lazy default-off AgentRuntime.runSContext + canonical Main port and cancellation propagation. RED 20 new failures with 19 legacy passes; additional REDs reproduced empty capture and last synchronous cancellation gaps. Related regression 323 passed; final targeted 237 passed after fixes. Main/Renderer types, existing storage gate and bounded actual entry bundles passed. Production remains PMRS: no registration, streaming/UI/tool loop/writer/summary policy, M/H or live API. Parent independent review follows local commit.

Independent review follow-up (base 5bc08e9): reproduce the pre-port lazy-factory request/signal race in actual Runtime; take a shared pure descriptor-safe request snapshot and fix the original signal before the first await, after default-off/pre-abort guards. Keep snapshot serialization/limits unchanged and typed binding errors intact, with no SDK/storage initialization import. Verify getter/toJSON non-execution, delayed-factory E2E, related regressions/types/build and commit the narrow fix for re-review.
