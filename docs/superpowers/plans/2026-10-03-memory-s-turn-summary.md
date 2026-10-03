# S turn provenance and summary continuation

**Goal:** Offline per-turn canonical S selection and full-turn extractive summary continuation.
**Base:** 9b0aabd46417ae0f1fba4ced9b6e935944decf2c, refactor/skills-source-layout; initially clean.
**Spec:** 2026-10-01-memory-s-context-budget.md authoritative amendment plus delegated task on 2026-10-03.
**Execution:** Inline, single source writer. Parent arranges independent read-only review.

## Constraints and decisions
- No clone/worktree, dependency/Electron copy, real data/API, push, production activation, M/H/UI/sender changes or CI/dependency/threshold changes.
- Preserve complete canonical tool pairs, actual event envelopes, active rewind semantics, encrypted metadata-only persistence and exact prepared request counting.
- Transcript provenance remains in the canonical transcript ledger. History user and tool messages never mint direct-user M authority. Unknown historical origin is generation zero; recapture/edit/reopen cannot refresh it.
- Content dependencies are per turn. A separate whole-session view dependency invalidates snapshots and summary leases on any mutation; committed summaries retain all input turn dependencies, including omitted turns, and may continue after a pure append when unchanged turns are recaptured.
- Summary proposals select full canonical turns by exact transcript dependency, in source order. No text generation or raw-ref/canonical mixing. Old selected summary turns precede complete recent turns; overlap/order conflicts are refused.
- Scratch/logs/TEMP/TMP/TMPDIR/cache fixed at E:/Codex/2026-10-03/task-5/s-validation; no dist/release writes. Main and Renderer tsc --noEmit, relevant Vitest regression and storage boundary are existing gates.

## Task 1: ordered turn provenance
- [x] RED: multiple real turns are separate budget units; provenance preserves entryId/turnId/revision/seq/time and active rewinds; all captured turns/permits close on mutation or disposal.
- [x] GREEN: expose message origins from existing materializer; capture all complete turns within one store lease; map every published locator and invalidate unique content/view heads.
- [x] Verify adapter, transcript and context tests. No missing tool result is fabricated.

## Task 2: canonical summary continuation
- [x] RED: prepareSummary/commitSummary full-turn selection, old summary plus later recent ordering, exact budget/no benefit, omitted source mutation, append/edit/regenerate/delete/forget/reopen/count races, no M or plaintext body persistence.
- [x] GREEN: extend existing summary lease/receipt metadata and transcript validation; materialize summary from fresh canonical capabilities, never substitute raw refs.
- [x] Verify related context/source/policy tests, Main/Renderer types and storage boundary; scoped self-review, local commit and evidence handoff.

## Review focus
All published locators (not just latest); per-turn versus whole-view lifetime; forgotten unknown derived content; summary omitted dependencies and overlap/order; asynchronous counts versus mutations; capability/metadata-only boundary. Tests belong to the task owning each behavior.

## Verified completion and handoff
- New observed append envelopes record the current Worker suppression generation; replacements retain the original user event epoch. Unknown existing history is zero, with Worker preservation on recapture.
- All content/view invalidations share one Worker transaction; the second-write rollback/retry test passes. Batch parsing includes up to 2000 heads so the permitted 1000 turns plus view/full capture fit.
- Canonical summary before/after framing matches actual old-summary/recent and stored-summary grouping; source order, omitted dependencies and no-benefit are verified.
- Relevant regression: 27 files / 627 passed; existing Worker output permission failure was resolved by a test-only output override, then 13 real Worker tests passed. Final memory-context suite: 229 passed; final canonical cases: 21 passed.
- Main and Renderer noEmit and existing storage boundary passed. Logs and scoped self-review: E:/Codex/2026-10-03/task-5/s-validation/outcome.md.
- No production activation; no live provider count/send proof. A new Main adapter/context invalidates old canonical capabilities/summaries and requires rebuilding. Independent review remains the parent's task.