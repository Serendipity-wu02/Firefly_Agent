# Next isolated increment: S context budget and sourced compression

Plan only. No S implementation, decay, archive, production ingress/writer/consumer switch, or real-data migration is delivered here. Continue from the verified B3/B4 local commit pair recorded in the handoff evidence. S = recent context and sourced summaries; M = long-term effective facts; H = historical conversation retrieval. Compression never promotes S to M; H is not expired S/M storage.

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
2. A conservative first implementation requires automatic S inputs/derived summaries to belong to the current generation, with live exact source bindings and no suppression origins. Any forget invalidates old-generation automatic context/summary plans globally. This avoids an old, never-extracted message or untracked assistant paraphrase bypassing forget. It reduces unrelated retained context after forget; preserve manual history/raw reads. Any later finer-grained partial retention requires trustworthy derivation metadata and separate semantic review.
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

## Pending facts to resolve before production or model evaluation

Choose the exact configured provider tokenizer/message-framing adapter and input-limit source from actual runtime configuration; no new dependency is preapproved. Define dispatch coordination with the actual harness caller before installation. The conservative global forget invalidation default can be implemented in isolation; preserving unaffected older raw context would require a separate narrower provenance design. Real-LLM Chinese evaluation, production actor/source provisioning, real-data migration/cutover, real Electron recovery for these new increments, OS reboot and physical power loss remain outside this delivered plan.
