# Memory history one-time native online probe implementation

> Implement inline using executing-plans and TDD. Independent final review required.

**Goal:** An explicit native app action invokes a fixed synthetic DeepSeek Flash request through Main's cached saved-profile ID; this development round uses only simulated profiles/network.
**Spec:** output/memory-h-quality-next/ONLINE-ENTRY-DESIGN.md; latest approved user instruction authorizes implementation and simulated acceptance, no actual API/configuration/secret access.
**Base:** 55df89621cb47b7c90a321bfcda8f23998b95aa9.

## Global Constraints

All changes, temporary files and verification logs stay in this private E: clone. Original worktrees unchanged. No renderer IPC, arbitrary request parameters, formal chat activation, migration, settings cold read, actual credentials/network, push or merge. Reuse existing adapter; fail closed when global settings remove the output cap. Maximum two identical bodies, no retry. Reserve 4,198,400 microCNY before first send against 5,000,000 cumulative limit; retain full reservation on uncertain response. Persisted one-time admission survives cancellation/restart and never auto resets. Only sanitized numeric usage/status is shown or written. Fixed task identity and paths, no caller-chosen budgets/paths. No dependency/CI changes.

## Review Focus

Check cold-cache/config fallback, credential leakage through errors, concurrent clicks/processes, cancellation during fetch/read, redirect/body/usage/model confusion, reservation before sends and restart/damaged ledger behavior. Inspect actual native tray composition and immutable fixture digest. Simulated evidence cannot establish provider billing, cache hits, model injection resistance or power-loss durability.

## Task 1: Fixed request and usage boundary

Produces pure fixed synthetic ChatRequest and guarded HttpRequest plus numeric usage sanitizer. Consumers Task 2 runner and Task 3 native action.
1. Add failing tests for exact adapter body SHA, strict saved ID/profile endpoint/model/transport, removed max_tokens and usage constraints. Run focused Vitest: Expected RED (missing implementation).
2. Implement fixed request factory and allowlist using existing capability and adapter. Re-run: Expected GREEN, zero network/config I/O.
3. Commit tested boundary.

## Task 2: One-shot durable runner

Produces Main-only start(savedProfileId), cancel(), status and sanitized receipt. Consumes Task 1 boundary; Task 3 uses runner, never exports credential.
1. Write failing tests for exclusive persisted admission/reserve-before-send, same two bodies, duplicate clicks, cancellation/deadline, stream byte limit, malformed usage/uncertain cost, all errors without secrets. Expected RED.
2. Implement injectable fake-network runner with fixed production paths and one-use prearmed admission. Existing/damaged/missing spent ledger never resets. Expected GREEN.
3. Commit runner and tests.

## Task 3: Cache owner and native tray binding

1. Write failing cache-only tests and native dialog/menu tests, including concurrent UI and selected ID invalidation. Expected RED.
2. Add Main internal cached profile accessor and ID-only native dialogs; no renderer channel, profile label/title secrets or cold loading. Bind optional tray callbacks in composition root. Explicit arm is fixed task non-secret admission supplied only after current zero-call simulated acceptance; absent arm fails closed. Expected GREEN.
3. Commit entry and tests.

## Task 4: Verification and delivery

Run full Vitest with FIREFLY_TEST_BASH=E:\Git\bin\bash.exe, Main/preload/renderer types, full build, plugin schema/SDK/examples, Skills validation. Run real Electron synthetic-only callback/runner harness using E: profile and fake network. Expected no real config or real calls. Independent review base55..HEAD; address Important findings RED/GREEN and repeat relevant checks. Final report records exact commits/counts/limitations and future app trigger instructions; no actual online test in this round. Preserve old55 artifacts. Bundle from55 and supporting evidence under output/memory-online-once.
