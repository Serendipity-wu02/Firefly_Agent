# UI and settings follow-up — 2026-10-04

This approved bounded follow-up continues the renderer layout in `2026-10-04-renderer-layout-v1.md`. Workspace: `E:\Codex\2026-10-04\task-2\final-gui-9e967093`; branch: `feat/mode-dropdown`; starting commit: `8876bc0b19f683ad115306bbcc79c881ceec942b`. Music files belong to a separate thread and are unchanged in this follow-up.

## Implemented

- The persistent 48px rail has the existing Firefly portrait at its top. The bottom local-user menu reads the existing avatar/nickname bridge, follows profile-change events and opens the existing General settings action. It supports keyboard opening, Escape/focus restoration and dismissal on Tab or outside focus/pointer actions. It adds no account service.
- The independent Today Schedule window uses native details/summary to fold only its scheduled-task list. Token usage, weekly chart, task data and the existing polling/event subscriptions remain active. The initial expanded state preserves the existing view.
- Tray no longer offers the standalone status panel or QQ Music status entry. Chat, Settings, pet toggle and Quit retain their existing activation behavior.
- Saved model profiles appear as compact rows with name/model, truthful configuration completeness and Edit/Delete actions. Configuration completeness explicitly does not claim verified connectivity. Add/Edit opens the original form on demand. Preset and Custom API tabs select existing supported provider types; preset shows the key first with the other original inputs under Advanced. Custom exposes name, URL, key, existing protocol selection and manual model name. Original input nodes/listeners and save/error behavior are retained.
- Editing an existing profile hides new-provider tabs. Selecting the current new-provider tab preserves its draft. Edit focuses its visible input; successful deletion focuses another row or Add; rejection preserves the current row/focus. English and Chinese labels are present.
- A single initially closed role-override group contains the existing 12 specialists. The six default-route rows are no longer displayed. Their stored mappings, backend default resolution and specialist inheritance remain intact.
- General no longer exposes the standalone-status toggle. General saves omit `sidebarVisible`, preserving legacy stored data rather than silently resetting it.

## Compatibility limits and coordinated Main work

Storage remains the existing single-model `modelProfile` schema. A manual model-name input is available; a new provider-owned multi-model catalog and model enumeration API are not implemented. There is no automatic network request, new dependency, new workspace, changed build configuration, history migration or music change.

The API lamp requires a real public result boundary. Existing `settings.testConnection(config)` returns only to its settings caller and executes inference. Existing `getPublicModelConfig().connected` in `src/main/settings/model-settings.ts:500` means a saved model/key exists; it is not a verified connection result and must not drive the new green indicator. Proposed minimal state is `{ profileId, revision, state: unverified|checking|connected|failed, checkedAt?, reason? }`, with a read and change subscription on the public model bridge. Main must match the explicitly tested config snapshot to a current saved profile, invalidate on changes, reject stale/out-of-order results, and expose bounded redacted reasons. Configured keys and unrelated run events do not prove connection health. This task adds no invented IPC or fake green lamp.

Coordinator-owned files for that boundary: `src/main/settings/settings-ipc.ts`, configuration invalidation in `general-settings-lifecycle.ts` as needed, `src/shared/ipc-channels.ts`, a public shared type and `src/preload/index.ts`. Renderer indicator integration can follow the agreed contract and the same effective profile selection as ModelSelector.

Retiring status-window creation requires coordinator changes in `src/main/application/core-bootstrap.ts`, `src/main/application/shell-bootstrap.ts`, `src/main/settings/settings-ipc.ts` and assessment of `src/main/windows/create-aux-windows.ts`. Keep runtime/token statistics, the independent tasks window and `window.sidebar.openSettings`, which Chat and Today Schedule currently consume. Dormant sidebar assets/build entry are retained pending that coordinated cleanup.

## Verification

- Failed-first tests for tray removal, persistent portrait/menu, folded live task refresh, English UI, editor tab reset and edit/delete focus. Logs: `output/ui-followup/` and `output/settings-followup/`.
- Final complete renderer plus tray suite: **112 files / 733 tests passed** (`renderer-suite-complete.log`). Settings owner final suite: **28 files / 166 tests passed** (`final-tests.log`); these are overlapping runs, not totals to sum.
- Main `tsc --noEmit` and `npm run check:renderer`: passed.
- `npm run build:renderer -- --outDir E:/Codex/2026-10-04/task-2/final-gui-9e967093/output/ui-followup/renderer-build`: passed. Existing Vite chunk-size warnings remain. Existing `dist` was not overwritten; a full `npm run build` was not run in this follow-up because it cleans the current app's artifacts.
- Fresh independent review closed the tab-reset and focus findings; its real settings integration/provider tests passed, 2 files / 11 tests, with no remaining blocker. `git diff --check` passed.
- An earlier full repository run had 5989 passed / 11 failed / 2 skipped. Failures were one `self-improvement-source.test.ts` plus two `built-in-tools-shell.test.ts` cases requiring `FIREFLY_TEST_BASH`, and eight `builtin-tools/shell-job.test.ts` process-termination assertions. The integration thread owns diagnosis; this report does not claim the full repository is green.

No native app was launched, reloaded, closed or focused in this follow-up. New native screenshots and interaction acceptance require a coordinated restart with the isolated smoke profile; this follow-up does not claim new pixel verification. Earlier layout/mode screenshots document their earlier commits only. No push, PR, merge or deployment.
