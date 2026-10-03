# Approved M recall decay and recoverable archive implementation

Base: 3639ec7a7863f64f08a1fdc8a908e19fbff57d16. Five local TypeScript commits in the existing private E: clone; no production caller/userData/accounts/model/PR/push/merge. Parent approved the complete design and explicitly selected inline execution. This amendment supersedes the earlier manual-only proposal: trusted Main maintenance supports disabled/dry-run/enabled synthetic modes and bounded cancellable batches; production maintenance remains uninstalled. S changes only for M visibility/use dependencies; H and application Skills unchanged.

## Contract and defaults

Eligibility first: reuse PolicyRepository.eligibleFactsWithinTransaction and valid FactSupports. State visibility normal/archived is independent from M truth and immutable assertion revision. Strength in[0,1] does not grant confirmation. Defaults are versioned first parameters, not optimal or user-original rules: 30day half-life; strength<=0.125 and idle>=90days candidate; maintenance dry-run; no hard deletion. Valid Main pin, current valid independent explicit confirmation and request-scoped explicit requirement protect from maintenance. Explicit user archive remains allowed.

Actual lastAccessAt is nullable; lastCalculatedAt is a separate checkpoint. Initial/new-revision/explicit-restore anchor starts a fresh calculation interval without inventing access. Incremental strength = priorStrength*2^(-(now-lastCalculatedAt)/halfLife); scans/rank/preview do not refresh access. Real local send invocation restores strength1/access exactly once; no delivered claim. Future/regressed times fail closed, including candidate evaluation. Policy transition calculates with old policy up to transition before installing new version; same version/different body conflicts.

Projection revision advances metadata changes; visibility revision advances archive/restore only. Source support validity and fact revision remain authoritative. Old preview/use cannot overwrite forget/correct/support changes. Archive->restore must not revive an old S permit. Strength scans must not invalidate a still-visible S snapshot. Unknown invocation tickets never refresh usage or trigger network replay.

## Modules and interfaces

- New src/main/memory-recall/recall-contracts.ts: policy/state/dependency/transport, strict reason errors and bounded fields.
- New recall-decay.ts: validate policy/state clocks, checkpoint/change-policy/access/restore helpers and candidate/protection math, no IO.
- New recall-repository.ts: scoped encrypted policy/state/use records; transaction-safe projection and eligible-fact helpers; receipts for lifecycle/use writes, no assertion text in recall receipts/logs. Rank/inspect use current transactions and never receipt-cache fact bodies.
- New main-recall.ts: opaque actor/user-action/preview/maintenance capabilities under shared authority coordinate; configure/rank/preview/archive/restore/pin/maintenance/cancel/recover/use, no model or IPC export.
- Existing schema/repository/worker/client gain additive v8 and recall command. Context contracts/repository/main gain verified M visibility baseline/snapshot checks and pending-use confirmation around invocation. Shared actor authority supplies a Main-only process boot identity for tickets; individual context capabilities remain closure-private.

Proposed v8 uses a dedicated encrypted metadata table recall_records(kind policy/state/use), scoped opaque id and kind index, following existing context_records codec pattern. It is not added to raw ENTITY_TABLES and never mixed into policy_records. Existing fact/support/history rows are not rewritten. Current subject uniqueness stays intact. No embedding/vector store added. Any later index emits IDs/revisions and must pass canonical eligibility+visibility validation; current increment queries canonical rows.

## RED matrix and five commits

1. Pure engine: initialize without access, 30/90day boundaries, split/single equivalence, scan noaccess, real-use reset, restore notfakeaccess, invalid/future/backward clocks, protections, policy version changes, finite bounded inputs. Observe RED missing module, implement, GREEN and main types/diffcheck, commit.
2. Worker projection: actual old v7 writer fixture ->v8; all version guards explicit; wrongkey/future/migrationfault unchanged; policy/state encrypted and metadata-only; sameversion conflict; current support-only eligible lookup; archived/normal/revision visibility identity; faults/reopen. GREEN related/types, commit.
3. Main lifecycle/maintenance: fake/crossactor/temp/oldboot/expired caps; archive/restore/pin truth separation; forget/correct/last-support invalidation/alternate-support; candidate recheck after real use/policychange; dryrun zero archive; enabled bounded/cancelled/idempotent protected maintenance. GREEN related/types, commit.
4. S/use linkage: worker-produced fact+visibility deps, archive->restore old permit blocked, strength scan permit intact, queue archive/send ordering, pending-ticket claim atomic, invoked sync/async failure recorded only once, confirm failure cannot say unsent, process restart pending->unknown, no raw/canary logs. No eligibility-only automatic bypass. GREEN related/types, commit.
5. One fresh whole-branch review and verified fixes, safe E-only actualElectron v8 use/unknown/reopen and v7migration/backup rollback; exactfinalHEAD related/full/main+preload+renderer types/build/related packaging. Final bundle/report plus executable H/hybrid retrieval plan in task reply, including actual local jieba/vector interfaces and future real-provider counter evaluation.

## Pre-flight and decision ledger

Pure policy -> repository: validate/freeze values once; old-policy checkpoint on transition. Repository -> Main: worker derives ownership/eligibility and metadata; no model authorization fields. Main -> Context: one coordinator and process identity, context gates before external count/send. Claim -> confirm: pending ticket in same transaction, callback invocation before confirmation; failure/close preserve unknown and never resend. Visibility -> snapshots: capture worker canonical revision, not caller defaults; do not invalidate on mere strength/projection revision.

Implementation evidence/ledger: E:/Codex/2026-10-01/task/memory-m-recall-evidence. Existing cloud skill shell helpers are unavailable in this Windows executor; use explicit native commands and record every RED/GREEN/commit/ruling. Preserve S evidence and protected original trees. Do not delete evidence under the skill's generic cleanup step; the user explicitly requires supporting deliverables.
