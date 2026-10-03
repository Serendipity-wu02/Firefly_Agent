# Trusted Memory Sources Implementation Plan

For agentic workers: execute inline with executing-plans/TDD; independent whole-diff review before completion.

Goal: implement approved B1 in an isolated copy at 8b7c06bf37af11c443a79968f5b6a2be9b5488c5. No real chatsStore/userData, production writer, automatic activation policy or H.

Spec: parent review delivered 2026-10-01, six tightening points; prior repository specification remains applicable.

Architecture: a runtime Main provider capability supplies scoped immutable observations under a provider lease. Main reserves a durable pending ledger head before observing/publishing; the SQLite worker owns encrypted locator/version/role/trust/generation state. SourceRef gains optional binding for legacy compatibility, but managed sources always require the complete binding. Worker guards reject pending/deleted/stale managed sources for evidence/candidates/jobs. Confirmed M and revision history stay unchanged.

Global constraints: all commands set E TEMP/TMP/TMPDIR/cache/log roots; no original-tree writes, no network acquisition, no CI threshold/timeout/skip changes. Clone dependency files privately, never link node_modules back to the read-only tree.

Review focus: forged provider capability/role; capture race and same-version different content; pending crash across SQLite/provider storage; delete/recreate same locator; legacy registerSource bypass and late jobs; ciphertext/locator privacy; schema-v3 migration rollback/future-version refusal.

## Task 1: durable source head and worker guard
- Create memory-core/source-ledger.ts and source-ledger.test.ts; shared binding DTO; parser; schema v4 source_heads (AEAD payload, domain-separated locator HMAC); repository/sourceCommand/worker/client transport.
- Commands reserve, finish, pending, validate. Reserve sets pending before provider mutation/capture. Finish checks reservation ownership and monotonic observation identity, publishes source row and ledger atomically. Deleted heads retained; recreation uses a distinct generation and monotonic internal revision.
- RED: duplicate capture/version mismatch; pending/stale/tombstone guards; source binding mismatch; role/trust change; schema v3 upgrade/rollback/future version; wrong-key file invariance.
- GREEN then core regression/types. No current-facts/history mutation.

## Task 2: Main adapter and synthetic provider protocol
- Create memory-sources/main-source-provider.ts, source-registry.ts and source-registry.test.ts; synthetic provider under scripts/verify/memory-sources.
- Main provider token lives in WeakMap and authorizes exact scope/locator. withLease prevents controlled mutation during capture; read twice and compare complete observation to reject uncoordinated capture races. Provider origin/trust is Main-controlled; history user role grants no direct-user event.
- Registry exposes authority/capture/prepareChange/reconcile/readEvidence. Sync resolver consumes only successful captured snapshots; worker guard remains required. Recovery captures persisted pending operation after restart and reconciles under provider lease. Errors leave pending closed until explicit reconcile.
- UTF16 half-open spans reject broken surrogate boundaries and mismatched quotes. Source text stays at provider, ledger stores encrypted fingerprint/location metadata only.
- RED/GREEN: forged provider/access, scope crossing, duplicate captures, metadata-only change, content/role/trust invalidation, delete/recreate, read errors, capture race, crash/restart/reconcile and old-job refusal, mixed Chinese/English/emoji. Do not claim detection of unobserved external ABA.

## Task 3: integration, review and handoff
- Extend real worker round-trip with managed source commands and stale-job guards. Reuse current Windows protected key/worker recovery tests; source synthetic provider persists only in E temporary profile.
- Run relevant tests then main/preload/renderer types, build/storage boundary, SDK/schema/examples, packaging and full suite. Sequential heavy gates. Independent reviewer receives exact BASE..HEAD, scope/spec/plan and ledger.
- Commit local code/tests/plan only; artifacts under ignored output or E evidence. Report exact HEAD, RED/GREEN, remaining limits and minimal B2 policy decisions. PR/push/merge remain deferred.
