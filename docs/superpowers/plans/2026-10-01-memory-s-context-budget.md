# Next isolated increment: S context budget and sourced compression

Approved plan with isolated TypeScript implementation in the private branch. The original proposal below is preserved for traceability; the authoritative amendment and implementation-boundary sections describe the delivered interfaces and restrictions, with source contracts as the exact export reference. Final acceptance evidence is recorded separately at its exact HEAD. No decay, archive, production ingress/writer/consumer switch or real-data migration is installed. S = recent context and sourced summaries; M = long-term effective facts; H = historical conversation retrieval. Compression never promotes S to M; H is not expired S/M storage.

## Verified seams and boundaries

- `src/main/memory-policy/main-policy.ts`: private opaque actor capability, `recall`, text-free `audit`, `reconcileSupports`, `integrate`, explicit Main lifecycle events. `recall` evaluates current support sets transactionally; raw core `current/history` are diagnostic, not automatic product recall.
- `src/main/memory-sources/source-registry.ts`: `capture`, `prepareChange`, `reconcile`, `readEvidence`, exact BoundSourceRef and UTF16 half-open spans. Provider-owned `occurredAt` is optional; absence stays unknown. `src/main/memory-core/source-ledger.ts` persists content/version/incarnation and suppression observation epoch.
- `src/main/memory-core/suppression.ts`: subject/source origins plus global suppression generation. B3 forget includes every assertion support and denial source; old claimed/new source-blocked jobs cannot reopen them.
- `src/main/memory/memory-types.ts` still defines active legacy L0Profile/L1Profile/L2Memory. `memory-manager.ts`, `memory-compressor.ts`, `memory-compression-transaction.ts` remain the legacy product path. These are not S/M/H interfaces and must not be renamed or used as a source of truth for this new implementation.
- `createMainPolicy` still has no production import/caller. Build output inclusion is not activation. Host Codex development Skills are separate from Firefly application Skills; this increment changes neither registry nor application Skill distribution.

## Proposed module and interface contract (not existing exports)

Create `src/main/memory-context/` with `context-contracts.ts`, `token-budget.ts`, `context-repository.ts`, `main-context.ts` and adjacent tests. Add the narrowly reviewed shared actor-capability helper described below and its injection into `main-policy.ts`; current policy actorContext is closure-private and cannot be reused implicitly. Reuse existing repository codec/transaction/source/suppression implementations. Do not add another writer, JSON store, scheduler or RAG database.

```ts
interface ContextBudget {
  tokenizerId: string; // exact injected model/provider tokenizer identity
  maxContextTokens: number; // supplied total context limit
  maxInputTokens: number; // supplied provider/request input cap
  reservedOutputTokens: number;
  maxSTokens: number;
  maxSummaryTokens: number;
  minRecentCompleteTurns: number;
}
interface PromptTokenizer {
  id: string;
  countSerializedPrompt(parts: readonly PromptPart[]): Promise<number>;
}
interface ContextRequest {
  sessionId: string; // must match the actor's bound session
  budget: ContextBudget;
  fixedParts: readonly PromptPart[]; // Main-owned current user turn/system/tools/M/H portions
}
interface SummaryProposal {
  jobId: string; leaseToken: string;
  generation: number;
  inputRefs: readonly BoundSourceRef[];
  segments: readonly {sourceRef: BoundSourceRef; span: {start: number; end: number}}[];
}
interface ContextSnapshot {
  snapshotId: string; generation: number;
  tokenizerId: string; promptTokens: number; sTokens: number;
  sourceRefs: readonly BoundSourceRef[];
  factRefs: readonly {factId: string; revision: number}[];
  parts: readonly PromptPart[];
}
// Private Main functions; opaque capabilities, never renderer-provided actor/scope fields.
createMainContext({registry, policy, transport, tokenizer, resolveBudget, actorAuthority})
  .assemble(actorToken, request): Promise<ContextSnapshot>
  .prepareSummary(actorToken, refs): Promise<OpaqueSummaryLease>
  .commitSummary(actorToken, lease, proposal): Promise<SummaryReceipt>
  .validateForDispatch(actorToken, snapshotId): Promise<OpaqueDispatchPermit>
```

Before context assembly, introduce a private Main-owned actor authority (proposed `src/main/memory-core/main-actor-authority.ts`): a WeakMap keyed by the same opaque policy actor token, with verified access/adapter/scopeKey/actorKey/providerId/sessionId as its internal value. Inject the **same instance** into createMainPolicy and createMainContext. Only createMainPolicy.bindActor may register after its existing provider authorization + resolveActor checks; context lookup accepts a known token and rejects forged, serialized or other-authority tokens. No lookup/registration is exposed to renderer IPC or model DTOs. `request.sessionId` is only a checked constraint against that verified binding, never an identity source. Review this shared authority change and cross-authority tests in slice 2; passing the current closure-private token alone is insufficient.

`PromptPart`, `OpaqueSummaryLease`, `SummaryReceipt` and `OpaqueDispatchPermit` are proposed internal types. Define their exact serialized representation in the first TDD slice; do not infer provider message overhead from text length. Renderer cannot create leases, summaries, source trust, actor identities or dispatch permits. No model field chooses sources or normalized M identities.

Budgets must be safe integers >= 0 with explicit upper bounds. Compute effectivePromptLimit = min(maxInputTokens, maxContextTokens - reservedOutputTokens), then subtract fixed-part costs before selecting S. Count the final complete serialized prompt, including roles, tool schemas, framing and citations. If fixed mandatory content exceeds the model limit, return a typed budget error for the existing caller to handle; never silently trim current user input/system/tool definitions. If protected recent turns cannot fit, return the exact deficit instead of breaking a turn. No characters/4 token estimate and no tokenizer chosen merely from a display name. Test tokenizer is an injected deterministic fixture and is not evidence of real provider token accuracy.

## Eligibility and compression behavior

1. Capture actor/scope/session and suppression generation before awaiting provider reads or summarization. Read exact sources under provider leases, then verify all heads and suppression epoch in a single worker snapshot transaction. Source role/trust permits recent assistant context but never makes it M evidence.
2. Global suppression generation invalidates old snapshots/permits, not all old source content. Rebuild validates original locator epoch plus source/subject suppression and complete derivation dependencies. Provably unrelated live original user sources can return; related never-extracted sources and untraceable old derivations cannot. Unclassified old content is unavailable pending precise provenance, never marked permanently forgotten. Recapture/editing cannot reset original event epoch; manual history/raw reads remain separate.
3. Scan full sources for existing labelled credential/secret patterns before automatic selection or summary materialization; reject them with reason-only metadata and no copied secret transport/log body. This guard does not claim to detect every unlabelled secret. Keep the newest complete current-session turns first, preserve message ordering and user/tool/assistant relationships, and cite exact source versions. Never borrow another session's raw tail. The active user turn is a Main-owned fixed request part, not permission to re-inject older suppressed S.
4. Compress earlier eligible turns into an **extractive sourced summary** first: complete selected sentences/segments with exact validated UTF16 spans and original source refs. Do not synthesize facts. This provides real compression by dropping redundant/less relevant material while retaining verifiable text. A future paraphrasing/model adapter must keep the same lease/source contract, be independently evaluated, and never set acceptance/support flags.
5. Summary commit revalidates every input source/version/incarnation, session/actor, generation and lease. Pending, deleted, edited or recreated input invalidates the whole derived summary. Store encrypted summary metadata/spans and source refs; avoid another arbitrary raw-message copy. Dispatch materializes exact cited text through the registry, filters invalid summaries and recomputes the final token count.
6. M is separately retrieved via support-aware policy recall, and H only through an explicitly requested scoped retrieval path. Carry exact M revision/support dependencies in the snapshot. A summary never calls `ingest`, `integrate`, `remember` or a legacy memory manager.
7. `validateForDispatch` rechecks the complete snapshot (generation, source heads, fact revisions and support eligibility) at the last Main dispatch boundary. Use an application-owned dispatch coordination lease/cancellation signal so source edits/forget invalidate queued sends. Define the linearization point honestly: a request already transmitted cannot be retroactively unsent. Do not claim an atomic SQLite/network transaction.

## Worker persistence and rollback

Propose additive schema v7 tables for scoped encrypted context summaries, summary leases/receipts and context snapshots. Their indexes contain opaque IDs/scope/generation only; bodies, locators and spans remain authenticated/encrypted. Use existing transaction receipts and worker serialization. Old v6 binary must refuse v7; rollback uses matching pre-upgrade synthetic database backup and old binary. No schema downgrade and no old writer opening the newer DB. Future-version, wrong-key and injected migration failure leave files/version unchanged.

## Four implementable TDD slices

1. **Budget accounting, no DB writes:** injected serialized-prompt tokenizer; max/reserved validation; fixed content, whole-turn selection, exact final recount, deterministic selection and deficits. No new dependency/tool/CI threshold without the existing project review process.
2. **Scoped context snapshot:** private Main actor/session access; worker transactional sources/generation/M dependency snapshot; edited/deleted/recreated sources, suppression and dispatch invalidation. Use E-only synthetic providers; retain manual raw-read behavior.
3. **Extractive summary lifecycle:** lease/claim/commit, exact spans, encrypted metadata-only persistence, fault rollback, receipt retry/reopen, old-generation/expired-lease rejection and dispatch text materialization. No automatic promotion to M.
4. **Isolation verification and handoff:** relevant/full/types/build, independent differential/quality review at exact HEAD; additive migration + rollback fixtures, no production caller or real userData. Provide the separately reviewed future production adapter/cutover plan only after this passes.

## Meaningful acceptance cases

- Chinese/English/emoji, combining characters, surrogate split, zero/full/tight budgets and serialization overhead; whole-turn selection and repeatable ordering; final prompt never exceeds supplied budget.
- Missing/unsupported tokenizer or model limit => explicit error; asynchronous tokenizer cancellation does not commit a partial snapshot. Fixture tokenizer tests do not count as real-tokenizer validation.
- Cross-actor/scope/session capability denial; assistant/model context never becomes a trusted M confirmation; partial span cannot omit negation and auto-promote anything.
- Source pending/edit/delete/recreate; multiple-source summary loses any source => unavailable. Independent M support survives unrelated invalid source according to B3 policy, rather than the summary granting support.
- Summary prepared before forget, even from a previously un-ingested captured source, cannot commit or dispatch. Forgotten alternate support/denial sources and untracked old-generation assistant paraphrases cannot re-enter automatic S.
- Concurrent summary/forget/correction/source edit, expired lease, worker crash before/after commit and durable receipt replay; failure leaves no partial summary/snapshot. Last dispatch validation rejects stale revisions/supports and over-budget recomputation.
- M forget versus manual raw H/history read remains separate; summary trimming affects S context availability and never truth, hard deletion, M archive or H ownership.
- Actual v6 fixture migration, failed-v7 transaction rollback, future refusal, authenticated encryption and absence of labelled secret canaries in transport/log bodies.

## Approved implementation amendment (2026-10-01, authoritative)

The supervising thread approved implementation from `5676a55cf5d851310d52d0d6b6923547736f35d5`. The following replaces conflicting earlier proposals, especially global content exclusion. Implement in TypeScript, in the existing E: private clone, with no production caller, real userData, account request, dependency installation, push or merge.

### Constraints and interfaces

- Strict dispatch accepts only an explicitly matching exact counter capability; estimates are declared and rejected as BUDGET_UNPROVEN, not falsely called over budget. Unknown context limits have no 256k fallback. Count the immutable final provider request, including tools/cache/framing and supported input types. Reserve at least its declared output bound (the existing Anthropic request uses 32768, not the legacy 8192 assumption); include safety margin. Whole-request recount is authoritative, never subtraction or monotonicity assumptions.
- Shared Main actor authority preserves existing access/provider/session/resolveActor checks and private WeakMap issuance. A foreign/JSON capability fails. Context writes remain scoped worker transactions; M queries reuse support-aware policy eligibility inside the same transaction.
- Global suppression generation invalidates old snapshots, leases and permits; it does NOT permanently forget unrelated old source content. Rebuild checks original source incarnation/version and source-level/subject suppression. Unrelated, provably classified live original user sources can re-enter. Related pre-forget sources, including never-extracted sources, cannot. Untracked old assistant paraphrases and unresolved older content are unavailable pending precise provenance, not marked forgotten. Recapture preserves original observation epoch; never relabel old history as a new event. Report the bounded grammar limitation rather than pretending general semantic provenance is solved.
- Add a separate Main-only canonical tool/transcript capability and encrypted dependency head. Do not change SourceRole or M trust. Preserve actual roles and complete call/result units. First implementation uses synthetic Main provisioning, not ConversationTranscriptStore installation; uncertain old tool derivation is excluded after forget. Persist metadata/digests only, never duplicate tool bodies.
- First summary is exact full-source/complete sentence extraction with source/role/order/Unicode boundaries. Every input dependency is registered, including inputs not selected. No paraphrase, M promotion, scheduler, historical legacy compressor or source-body storage.
- Temporary session uses no persistent context path: reject before any source/worker/provider access. A later memory-only temporary adapter is outside this increment. Test zero writes and no source/job/lease/transcript persistence.
- Dispatch binds immutable body+model+transport+tools/cache digest, exact count, actor/session, source/transcript heads, suppression generation, M revisions/support eligibility and one-use permit. Main coordination serializes invalidations and invokes the send function without intervening await after worker validation. A queued invalidated send fails; an already invoked send is sent/result-unknown, never automatically retried. No claim of DB/network atomicity. Fallback is a fresh prepare/count/permit. New path never calls prompt dump or logs plaintext.
- Add encrypted context rows with additive v7 migration, shared worker receipts and rollback. Reopening invalidates process capabilities and leases; durable successful receipts replay the original result. v6 fixture upgrade, migration fault, future schema and wrong key are required. Rollback is pre-upgrade backup+matching old binary, never schema downgrade.

### Four commits and RED/GREEN gates

1. Budget: capability/typed error contracts, frozen prepared request, complete-unit tail selection and final recount. Tests: multilingual/Unicode, framing non-additivity, exact boundary, fixed/protected overflow, malformed/unknown budgets, mismatched/estimated counter, unsupported image, output reserve 32768, mutation/cancellation/count failure.
2. Snapshot/dispatch: shared actor capability, scoped worker context commands and dependency metadata; separate transcript provisioning; original-source suppression classification; atomic M/source baselines; one-use coordinated dispatch. Critical RED/GREEN: old global-generation snapshot fails, unrelated old source rebuilds, related/untracked derived content cannot, recapture does not launder. Also test cross-actor, source pending/edit/delete/recreate, M multi-support/correction/deny/remember, tools/cache/body/transport change, queued invalidation, replay and temporary zero-write rejection.
3. Extractive lifecycle: v7 persisted leases, immutable source/span metadata, input dependency closure, commit receipts/reopen and dispatch materialization. Tests: omitted dependency invalidation, expired/foreign/old-boot lease, fault rollback, secret and plaintext absence, full sentences/negation/speaker/order/Unicode, no compression benefit and no M writes, durable receipt replay.
4. Isolation verification: exact-HEAD related/full/types/build, one independent quality/security differential review, relevant real Electron synthetic worker reopen if existing driver can be safely reused, supporting E: artifacts, and a concrete recall decay/recoverable archive proposal. Real provider tokenizer accuracy, production integration and physical power loss are explicitly unverified.

### Pre-flight and threat model

Counter -> snapshot: prepared immutable body is reused, not reserialized differently. Snapshot -> summary: retain every examined source and original observation epoch. Summary -> dispatch: materialize then recount then atomically validate all dependency heads. Shared policy -> context: same actor authority and transaction-safe eligible fact query, no nested transaction. Transcript -> context: separate capability/head preserves tool role and event order, never M source trust.

Abuse cases: fake actor/lease/permit, cross-scope source, changed final body, stale async count/summary, forgotten source recapture, assistant paraphrase laundering, persisted temporary content, raw secret/error logging and duplicate network dispatch. Bound command/array/payload sizes and use existing encrypted parameterized SQLite/receipt mechanisms. Existing quality thresholds, effective tests, skips and CI remain unchanged.

## Pending facts to resolve before production or model evaluation

### Slice 3 implementation boundary

The first extractive implementation accepts only entire source messages (`start=0`, `end=text.length`), in original input order and with provider-verified speaker. Partial sentences are explicitly refused; no NLP sentence splitter or claim of semantic completeness is introduced. An ordered subset reduces context size only when the matching exact synthetic counter proves the complete selected S request is smaller and within the supplied S limit. Empty or non-beneficial selection completes the lease with no summary row and no M mutation.

Every examined input and provenance root is persisted as encrypted references, including omitted inputs. Active leases are boot-bound, generation-bound and expire under the repository clock. Exact completed receipts remain diagnostic after invalidation; reuse of the summary still requires current source eligibility. Committed summaries can reopen and rehydrate owned source references through the trusted registry. Old-generation summaries with precisely unrelated inputs can rebuild; old leases/snapshots/permits cannot. Main re-materializes all inputs after count continuations and checks the prepared S request/configuration before committing; this still relies on the approved reserve-before-mutate provider contract at the final coordination boundary.

### Independent-review corrections and ordering contract

Canonical transcript bodies now pass the existing labelled-secret guard before publication/counting, and all source roots must be eligible even at generation zero. Ordered raw recent refs are grouped as one user plus its following assistant messages, protecting and trimming the entire turn. Eligible leading assistant refs have no proven complete-turn boundary and are refused; excluded old derivations remain excluded for their existing provenance reason. Source-role contracts remain unchanged. Whole-message summary excerpts retain their original speaker and never become M evidence.

Main supplies chronological arrays: older summary IDs first, followed by ordered recent refs or ordered canonical complete transcript units. Mixing raw recent refs and canonical units is refused with ORDER_REQUIRED until the product adapter provides one authoritative ordered transcript. The isolated factory does not infer event chronology from opaque IDs, capture order, database insertion order or optional timestamps; production provisioning must verify it. Summary spans/input ordering are immutable, but order among separate summaries remains a trusted Main caller contract.

Choose real provider tokenizer/framing and limit sources before installation; no new dependency is preapproved. All product source/transcript writers must reserve before mutation under the shared coordinator or an equivalent verified provider lease. Dispatch rereads input providers before counting and checks metadata at invocation; uncontrolled external writes during the final lease gap are outside this isolated adapter contract. The bounded maintenance grammar cannot prove unrelatedness of arbitrary older prose; report this provenance adapter gap. Real provider accuracy, production integration/migration, real Electron recovery for each new increment, reboot and physical power loss remain unverified unless explicitly recorded.
