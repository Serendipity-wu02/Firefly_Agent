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
