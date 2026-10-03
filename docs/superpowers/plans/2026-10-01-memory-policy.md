# Isolated B2 Memory Policy Implementation Plan

Approved by parent on 2026-10-01 after review of B2-REVIEW-INPUT.md. Baseline 34850803bef14715f4fff24331b27a6bd1a1131c. Execute inline, TDD, without another design gate.

## Contract and exclusions

S = recent context and sourced summaries; M = durable valid facts; H = historical conversation retrieval. This batch implements a synthetic Main policy pipeline only. No production ingress, S/H consumer, writer switch, real userData, migration, LLM request, PR/push/merge. Preserve B1 stale source/job guards and both original clean trees. Source edit/delete recall policy for confirmed M is explicitly unresolved; do not change current() or choose a default policy. Automatic consumers must later install an approved integration policy.

Latest product clarification: session-only temporary content belongs in S, never automatically M. “This is wrong” is not a forget command; correction and forget use different trusted event kinds. Parent subsequently selected source-support validity, clear-change integration and recall decay/archive rules under user authorization; these are sequenced in 2026-10-01-memory-maintenance-increments.md, not silently added to B2 current(). Earlier unresolved-policy wording describes the B2 boundary, not a request to reopen the now-selected follow-up semantics.

Opaque Main actor capability binds access/scope/provider/session. A trusted Main actor resolver supplies a stable opaque ID; displayName/role/null identityId are never authentication. Extraction owns no authority. Main derives subjectKey from actor plus normalized attribute. Policy version and distinct activation reason are durable. Unknown, uncertain, third-party, inferred, imported/history/system and sensitive input stays candidate; secret-bearing input yields reason-only refusal, no evidence/candidate body/log.

Privacy tightening within that contract: unresolved free-form candidates persist only source reference/category/reason, with empty assertion/body; their original text remains exclusively at the provider and they cannot be confirmed as facts. This prevents an unlabelled credential from being duplicated merely because the deterministic scanner does not recognize its label. Recognized preference candidates retain exact evidence for manual confirmation. No invented assertion replaces an empty source.

## Steps and files

1. Write semantic matrix and RED tests in memory-policy/*.test.ts. First create an extractor contract stub so RED tests fail on missing behavior rather than imports. Cover at least 60 named Chinese/English/emoji rows. Keep deterministic rule evaluation distinct from real-model evaluation.
2. Implement conservative deterministic extraction in memory-policy/extractor.ts, private Main actors/events in main-policy.ts. Main synthetic events bind scope/actor/target ID/revision/nonce. Tokens never enter shared DTO or renderer IPC. Exact nonce-bound commands are idempotent; changed target/action/payload is denied.
3. Add worker-internal PolicyRepository and policyCommand routing. Schema v5 adds encrypted policy_records only; payload includes actor/attribute/source/generation/state. Candidate edits/rejection/activation increment expected revision. Pagination cursors are opaque Main tokens bound to actor/scope/generation. Repository transaction rechecks source/generation/conflict before evidence/candidate/fact writes and invokes existing semantic FactRepository transaction operations. Keep immutable corrections and existing deletion markers.
4. Confirm eligible parsed preferences only from a synthetic Main event; reject unresolved/third-party/sensitive classes (no blanket confirmation override). Correction uses existing correctFact with expectedRevision, never last writer wins. Forget invalidates pending pipeline candidates, evidence use and jobs via generation/source/subject barriers. Repeated input is suppressed before evidence storage. Remember requires a fresh direct source and new trusted event after forget; never reuses or releases old candidate/job generations. Raw provider chat remains readable. Decay has no forget entrypoint.
5. Review whole diff independently. Run relevant semantic/security/concurrency/schema/worker tests, existing full suite, main/preload/renderer types and build; report final HEAD evidence. Local commit only.

## Acceptance matrix

| Axis | Observable requirement |
|---|---|
| Semantics | >=60 named rule rows: direct preference, mixed text, negation, hypothesis, quote, sensitive, secret, third-party, import/inference |
| Authority | Forged actor/event/access fails; display alias does not alter actor; scope/session/provider crossings fail |
| Lifecycle | Policy/manual provenance differ; reject/revise invalidates stale confirmation; nonce cannot act on another target |
| Conflict | Actor+attribute normalization; conflict stays candidate; explicit correction appends revision |
| Suppression | Pending old candidates/evidence/jobs and captured generation fail after forget; duplicate old source never resurrects; new remember event only |
| Transactions | Fault rollback, idempotent retry, concurrent edit/forget/late commit, durable reopen |
| Privacy | Secret input never reaches stored evidence/candidate/log; payload/actor text encrypted; no true-user data |
| Integration | Real worker protocol exercised; S/H/production remain disconnected; confirmed-M source policy unresolved |

## Cutover and rollback boundary

Production adapter and authenticated ingress require separate reviewed integration. B2's schema upgrade is additive and transactional; backward opening by a v4-only binary fails closed. Rollback must use an isolated pre-B2 database backup and v4 binary together; never point an older writer at v5. This is not a production switch plan. Source edit/delete semantics and production actor provisioning remain decisions for the parent/user; deterministic coverage is not the requested real-model Chinese assessment.

## Verification record

Pending implementation. Every shell explicitly uses E workdir and E TEMP/TMP/TMPDIR. No thresholds, test timeouts or skip policy changes.
