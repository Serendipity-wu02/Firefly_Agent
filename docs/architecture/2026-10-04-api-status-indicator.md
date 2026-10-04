# Renderer API status indicator — 2026-10-04

This bounded follow-up integrates the Main connection contract from `f92cbd113255bea270313ac4f460b8634dd90dbd`. It supersedes the pending API-lamp section of `2026-10-04-ui-settings-followup.md`; that earlier report records its own historical baseline. Workspace: `E:\Codex\2026-10-04\task-2\final-gui-9e967093`; branch: `feat/api-status-indicator`. Main/preload/shared, music and build configuration are unchanged by this follow-up.

## Behavior

- The persistent Firefly portrait has a native status button. Unverified and checking are gray; the last successful explicit test is green; the last failed explicit test is red. The label describes the last manual test in the current Main process, not continuous provider availability.
- `window.modelConfig.getConnectionSnapshot()` and `onConnectionChanged()` supply the state. The same selected profile ID is passed to the Composer and indicator, with effective-default/first-profile fallback matching ModelSelector. Missing or unknown state remains unverified; a stored key alone never turns the lamp green.
- Subscription precedes the initial read. A late initial response cannot overwrite a received event; cleanup unregisters the exact subscription and blocks updates after unmount. Main owns configuration invalidation, revisions and stale-result isolation.
- The tooltip exposes only translated status, timestamp and the two bounded public failure reasons. A translated accessible status remains available beyond color. The existing visible-focus styling applies to the native button. Clicking opens the existing API Settings action; General settings remains unchanged.
- No automatic test, network request, new IPC interface or second connection-state service was added. The existing single-model profile schema and actual model selection remain intact.

## Verification

- TDD: five indicator tests failed before production code, then passed with the existing navigation/page tests (4 files / 22 tests). Evidence: `output/api-status/red.log` and `green.log`.
- Complete renderer plus Main/preload connection-contract run passed: **114 files / 766 tests**, exit 0 (`related-suite.log`). These overlapping runs must not be added together. The coordinator's full-repository pass on the Main baseline is separate evidence; this thread did not rerun the whole repository.
- Independent read-only review found no blocker. Its renderer run passed 4 files / 26 tests (indicator, navigation, navigation layout and model-catalog load state); evidence: `review-tests.log`. Main/preload connection tests are covered by the separate 114-file run above.
- Main, preload and renderer TypeScript checks passed with no emit. Logs: `main-types.log`, `preload-types.log`, `renderer-types.log`.
- Isolated renderer build passed at `output/api-status/renderer-build`; the existing Vite chunk-size warning remains. The current `dist` was preserved.

No native Electron window was launched, closed, restarted or focused. No real userData or external provider was used. Fresh Windows pixels, keyboard/system tooltip behavior and final integrated interaction acceptance remain pending a coordinated isolated-profile run; earlier screenshots represent their earlier commits only. The GUI checklist in `output/ui-followup/gui-regression-checklist.md` records the actual `.cy-model-connection` selector and final contract. No push, PR, merge or deployment.
