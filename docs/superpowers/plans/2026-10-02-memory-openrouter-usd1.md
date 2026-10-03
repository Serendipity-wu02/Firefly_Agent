# OpenRouter USD 1 restricted probe implementation plan

> Executor: execute inline with superpowers:executing-plans and TDD; one independent Astra xhigh review before delivery.

Goal: let the user enter an OpenRouter key in a restricted local window, prepare an in-memory profile, then manually run the fixed H synthetic probe within a separate USD 1 budget.
Spec: parent delegation 2026-10-02, reporting this bounded design before implementation explicitly authorized. Existing production Responses profile and DeepSeek support remain unchanged.
Stack: Electron 43.1.0, existing TypeScript/Vitest; no new dependency or CI threshold.

## Fixed scope and sources

- OpenRouter model `deepseek/deepseek-v4.1-flash`, endpoint `https://openrouter.ai/api/v1/chat/completions`; pin provider tag `deepseek`. Public model/endpoints snapshots: output/openrouter-usd1/public-models.json and public-endpoints.json. DeepSeek official quick start identifies current Flash as V4.1 Flash.
- Two identical non-stream synthetic requests at most, max_tokens=256, reasoning disabled; no model/provider fallback, no retries, tools described but never executed, no user history.
- USD 1 = 1,000,000,000 nanoUSD reserved durably before any send; max_price prompt=0.30/completion=1.20 USD per million, request=0/image=0. Input upper bound 1,048,576; each attempt upper bound 314,880,000 nanoUSD; two <=629,760,000. No cache discount used for admission. Full USD 1 remains reserved on cancellation/uncertainty; no automatic reset.
- Separate fixed admission root and experiment ID. Existing CNY arm/boot/spent/ledger untouched. New arm is explicit authorization evidence, expires within 24h of price verification; app never creates or renews it.
- Balance-funded OpenRouter key only, no BYOK or top-up. UI states this and requires user acknowledgement; preparation performs no credential validation/network call. OpenRouter docs distinguish BYOK upstream billing and credit purchase fees from inference cost.
- Local trusted static form, dedicated sandboxed preload, exact sender/frame checks, deny navigation/popups/network in renderer, nonpersistent session. Only a bounded key string crosses one submission IPC; no key readback, logging, disk save or raw error output. Main owns all fixed model/host/budget fields.
- Main binds the preexisting one-boot permission after acquiring the single-instance lock and before displaying the form. An unused exit/cancel still prevents reuse on restart; a late arm is rejected.
- Billing settlement requires explicit is_byok=false; malformed or positive upstream billing details are uncertain and stop the second attempt.
- Form submission prepares only. Native tray action plus native confirmation starts runner; renderer has no send capability. Key is forgotten on cancel/finish/quit. Independent memory profile cannot refresh real settings or change default models.
- Original worktrees/process PID25632 are not changed during development. No real keys, real sends, userData access, production memory integration, push/merge.

## Tasks

1. `src/main/memory-openrouter-once/boundary.ts`, `session-profile.ts`, `runner.ts` and colocated tests. Interfaces: createSessionProfile(key,id) -> fixed profile; buildFixedRequest(profile) -> fixed HTTP request; sanitizeUsage(raw) -> numeric receipt; createProbeRunner({root,resolveProfile,fetch,now}) -> {start,cancel}. Write failing synthetic tests; run RED; implement smallest boundary and independent USD journal; run GREEN.
2. `controller.ts`, `configuration-window.ts`, `diagnostic-main.ts`, dedicated `src/preload/memory-openrouter-once.ts`, and static view in the new module. Modify `src/main/index.ts` to dispatch the new flag before ordinary startup. Tests pin prepare=0 fetch/0 spend (Main binds the one-boot permission before the form, without a credential resolver), sender identity, submit limits, cancellation/duplicate/restart, and no legacy configuration reads. RED then implementation then GREEN. Preserve old diagnostic route.
3. Add `scripts/verify/memory-openrouter-once` actual-entry harness with explicit E: fake appData and rejection of nonfixture settings access. Exercise dev and actual ASAR startup, visible input window/preload, synthetic submit, native send confirmation, success/refusal/abort/duplicate, price expiry, restart and unchanged old admission. All fetch injected; no real credential.
4. Run storage checks, main/preload/renderer types and full build, full npm test with E: bash/temp, native harness; independent review exact diff from 29eecec. Fix findings with RED/GREEN. Commit only after verification; no push/merge.
5. Prepare separate valid USD arm only once after verification; start reviewed restricted version to empty user input form without auto-submit/send. Keep old process unless safe normal exit is needed and verified. Deliver host/model/USD1 and manual steps, distinguishing synthetic verification from real model results.

## Review focus

- Provider price override and BYOK must not silently escape the requested currency/budget.
- Dirty/missing/corrupt admission, restart, duplicate IPC or late fetch never create a second allowance.
- Wrong renderer/frame/navigation cannot extract a key or trigger send.
- Cost/model/provider/usage mismatches stop after first attempted request and retain USD1.
- Both actual entry modes must avoid importing ordinary application, settings, migration, chat or plugin bootstrap.
