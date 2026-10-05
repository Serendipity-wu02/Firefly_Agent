# Manual browser shared integration verification

The manual browser is connected to shared IPC/preload, the Main chat host lifecycle, and the right inspector. Production BrowserService construction omits `gateOpen`; the default gate remains closed. Commands carry only addresses, Main-minted browser IDs, history actions and viewport bounds. Private actor/profile/top-frame/owner authority stays in Main.

Chat shell creation registers the exact host before renderer loading. Active session set/clear refreshes its private binding synchronously. Exact managed native guests are routed before the global external-link guard; retired guests remain denied without an external-browser fallback. Renderer subscribes/unsubscribes exact DTO listeners, rejects foreign/older/closed-page updates, closes pending opens and old sessions, detaches inactive tabs and resends geometry after focus/resize. Welcome pages never fabricate a conversation.

Evidence from the 2026-10-05 integration is in `E:/Codex/2026-10-03/task-10/browser-integration-20261005`:

- Behavioral RED/GREEN: navigation routing and renderer lifecycle. Focused integration: 21 files/319 passed; preload/screenshot: 6 files/34 passed.
- Actual complete ordinary suite after verified E Git Bash and original H TEMP prerequisites: 640 files, 6417 passed/2 existing skips, exit0 (`full-recovery-bash.log`). No H assertion or skip changed. This ordinary suite is not native history zero-write acceptance.
- Main/preload/renderer noEmit checks passed; isolated Main/preload/Vite builds passed. Existing Vite size warning retained. Production dist and12 protected source hashes unchanged before SMH merge.
- Final no-desktop-prewarm QA:14 ordinary UI screenshots/25 cases and9 synthetic native screenshots/24 cases, all3 welcome/existing modes. Native case uses a local exact HTTPS Session protocol fixture and synthetic trusted host-state ports. Actual OS host focus remains false/0 focus events. Real WebContentsView geometry follows stable Main-clamped viewport bounds and tab/close/collapse disposal. Public network and OS foreground acceptance are not claimed.
- Actual Codex CLI0.155.0/gpt-5.5 readonly review completed. Its only P2 was an outdated status-only preload test; the approved3-method surface, closed availability, command payload and exact unsubscribe regressions now pass, as does the ordinary full suite.
- Existing screenshot helper build script produced matching647168-byte release/staged binaries: SHA256 `4eb9fbf628aee7052659cc7b708268f284280e669630d983d85916013badf297`. Native protocol/geometry/display/request contracts29 passed. The unchanged GDI smoke initially failed2 capture cases under restricted execution; all5 pass with normal execution permissions (`gdi-recovery-unrestricted.log`), without desktop-setting changes or saved/exported screen images. Broad native GUI/clipboard/foreground smoke is not claimed.

`launch-ui-candidate.ps1` in that evidence directory starts an offline smoke candidate from isolated compiled artifacts and a new E profile, without OS activation or screenshot prewarm. It does not overwrite production dist, existing user input, or user data.

Remaining release gates: app-specific trusted DNS injection and real public HTTPS acceptance (network owner work), full native OS foreground/egress/storage gates, and complete SMH streaming/hybrid semantic integration. Do not enable production or infer those gates from synthetic and ordinary suite results.

## Dormant native-history cleanup checkpoint

The SMH core was integrated as `3d2ce62c8599bb888d218e80dad271c27553766a` without enabling a production provider. Two reproduced invalidation failures are corrected: a captured-head cleanup rejection no longer returns before pending endpoint factories/operations finish, and one rejected captured head no longer prevents cleanup of later heads. Both cleanup barriers settle every exact participant before reporting failure; only successfully cleaned exact captures are removed.

The stable `npm run test:memory-history-zero-write -- --configLoader runner` entry selects only the explicit native acceptance file through `vitest.memory-history-zero-write.config.ts`. The ordinary configuration and existing quality settings are unchanged. Main excludes acceptance-only fixtures from production compilation.

Final evidence in the same E directory:

- `smh-product-cleanup-red.log` and `smh-all-heads-red.log` reproduce the two failures. `smh-all-heads-green.log` passes all26 provider tests, including the held second-head cleanup and actual Worker rejection of its old ref as `MEMORY_CONTEXT_TRANSCRIPT_PENDING`.
- `final-browser-smh-corrected-full.log` and its exit receipt:643 files,6470 passed/2 existing skips, exit0. This supersedes the earlier643-file6469-pass run for this checkpoint.
- `smh-corrected-official-acceptance.log`:12/12 real-helper acceptance, exit0, using the exact E debug/release helpers and synthetic NTFS root. It is separate from ordinary regression.
- `smh-corrected-main-exit.json`:official Main noEmit and isolated Main build both exit0. Previously verified unchanged preload/renderer/CLI builds and storage boundary remain in the core handoff; production dist was not overwritten.
- `smh-corrected-preservation.json`:all protected paths match the approved core baseline, including the intentionally committed native history parser change; all7 production dist files,4 reserved streaming shared files and4 helper binaries are preserved. The existing isolated candidate remains frozen.

The completed native Codex review raised the later-head cleanup P2; its reproduction and correction are retained. Automatic approval rejected the external post-correction re-review because it could disclose local source/tests/logs to the external CLI without explicit destination authorization. No retry or alternate remote review was used. Local review of the correction is recorded in `smh-corrected-local-review.md`; a clean external post-correction review is not claimed.

Streaming owner changes, browser trusted DNS delivery and real hybrid/model semantic validation remain separate pending batches. Production gates remain closed; no model download/cleanup, system-network change, production restart, push or PR is part of this checkpoint.
