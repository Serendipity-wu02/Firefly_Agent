# Recall decay and recoverable archive proposal

Status: proposal for supervising architecture review; no implementation, scheduler, production installation or data migration is authorized by this document. Baseline is the isolated support-aware M policy and v7 S context increment. S remains recent context/source summaries, M remains valid long-term facts, H remains explicit historical conversation retrieval.

## Semantics to preserve

Eligibility is decided first by the existing actor-scoped policy, current fact revision, independent support validity, denial, correction and source/subject suppression. Ranking must never revive an ineligible fact. Time decay lowers retrieval priority only; it does not mean a fact became false, forgotten, deleted or unsupported. S trimming is independent of M archive. H ownership/search is unchanged.

Archive is a reversible retrieval visibility projection, separate from current_facts and fact revisions. Restoring requires the exact currently eligible revision and current valid support. A stale archive cannot undo forget/deny/correction/source deletion or automatically call remember. Facts with another valid independent support remain eligible according to current policy, without relying on archive metadata.

## Isolated first increment

1. Establish typed Main-only recall options and projection interfaces before any product caller. Add an actor/scope-owned encrypted auxiliary record with fact ID, expected revision, last successfully dispatched recall event, optional archive state/reason and audit event ID. Reuse opaque actor authority, worker transactions and receipts; no renderer-supplied actor or permission fields. Proposed additive schema v8 is reviewed before implementation.
2. Add a pure deterministic ranking function over already eligible facts and an explicit policy configuration. Inputs are the injected clock, scoped projection and a reviewed half-life. Return eligibility-independent scores/explanations. Unknown reference times are explicit and are not silently treated as ancient. No embedding/model/API/dependency is needed for this increment.
3. Record recall use only after a confirmed local invocation under the dispatch coordinator. Snapshot assembly, counting, failed validation and retries do not refresh use time. A result-unknown invocation needs a documented treatment; the recommendation is one deduplicated invocation event, since transport invocation already occurred, without claiming delivery.
4. Add manual preview/archive/restore commands guarded by expected fact revision, owner, generation and current eligibility. Preview lists the exact proposed effects. Archive writes only the projection plus receipt/audit event. Restore rechecks policy eligibility in the same transaction. Never mutate fact assertions, histories, support flags or suppression rules.
5. Expose separate queries for normal recall and explicit eligible archived inspection. Existing policy recall stays unchanged until a separately reviewed caller installs the new options. No automatic archive job or production writer is included.

## Required tests and review

Write RED/GREEN tests for deterministic clock/score, unknown/future times, equal-score stable ordering, score boundaries and configurable decay; archive/restore idempotence and receipt conflict; cross actor/scope/capability denial; old revision after correction; forget/deny during preview/restore; deleted or pending source; alternate valid support; archive record replay after generation change; encrypted metadata and reason-only errors; transaction fault rollback/reopen; v7-to-v8 fixture/future refusal/wrong-key and matching old-binary backup rollback. Repeat relevant tests/types/build and independent security/quality review at the exact final HEAD. Keep existing checks/thresholds/skips.

## Decisions needed before implementation

- Decay reference: last confirmed invocation, user update, or source event time; treatment of never-recalled/unknown/future events.
- Half-life, score floor and ranking weight; pinned/explicitly requested facts and quantity limits. Supply defaults only after product review.
- Archive visibility: exclude archived facts from automatic recall by default versus merely demote; explicit inspection surface and wording.
- Manual-only archive first (recommended) versus a later automatic threshold; retention and audit visibility. No automatic hard deletion.
- Whether a result-unknown invocation refreshes recall and how the UI describes it without implying successful delivery.

## Cutover and rollback boundary

Prototype runs only against E: synthetic data with an injected clock and no account/provider calls. Product installation needs a separate adapter and read-only comparison: current eligible results versus proposed ranking/archive visibility. Keep the existing reader until acceptance. Back up the exact pre-upgrade database and match it to the old binary; disable the new caller/projection before rollback. Never downgrade schema in place or open a newer database with the old writer. No copying/renaming of the active legacy Cyrene memory manager is part of this plan.

Known prerequisites remain the real provider count/framing/limit adapter, proven product source/transcript chronology and reserve-before-mutate coordination, precise provenance for arbitrary older prose, and independent production S/M/H cutover review. Physical power loss/reboot remain a separate validation item.
