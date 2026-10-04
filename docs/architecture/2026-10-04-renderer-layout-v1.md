# Renderer layout v1 verification — 2026-10-04

## Scope and baseline

Approved renderer-only first pass, based on `9660c584c0c191def41906a62802a4ca932bd809` (`firefly-mini-v1.1.x`). Independent worktree: `E:\Codex\2026-10-04\task-2\renderer-layout`, branch `feat/renderer-layout-v1`. Original working directory and its existing modifications were preserved.

No Main, preload, shared backend, build config, dependencies, CI policy, permissions implementation, or historical storage changes. No push, PR, merge, or deployment. Backend Moments cleanup is a separate change; the integrator must combine and recheck it.

## Result

- 48px navigation rail: Workbench, existing Plugins, More, bottom Settings. More contains existing Tools, Skills, Models. Settings opens General by default.
- 240px collapsible mounted context sidebar: Firefly, Chat/Work/Code, New, pinned/recent Chat groups, original Work/Code project groups. Full long titles remain available in tooltips. Project grouping includes pinned sessions.
- Centered 770px chat/input column. Existing attachments, model profiles, genuine reasoning, plan, permissions, stop, queue, and session logic remain in place.
- One resizable Inspector hosts the existing Files, Preview, Diff and Plan tabs. Below 720px available dock width, it stacks vertically and does not overwrite saved desktop widths. Actual app minimum width is still 960px.
- Existing Git/Todo controls use collapsible inline rows to avoid obscuring chat actions or Inspector tabs. Actual status/watch/branch/commit/push/plan operations remain intact. Collapsed bodies are inert. Expanded low-height content scrolls.
- Standalone Settings: left categories, bounded right grouped row forms, existing real save/error behavior. Unknown section defaults to General; existing nested music route still selects Plugins.
- Removed Moments button, panel host references, feature directory, renderer bridge declaration, translations, setting bindings and six removed fields. Removed feature-specific tests with the removed feature. Shared avatar material, social context, channels, TTS/ASR, stickers, Work learning, RAG, Worldbook, search_text, scheduler threadId compatibility and genuine history were retained.

## Verification

Failed-first tests observed for navigation, compact dock, pinned project grouping, default General and docked controls before their corresponding fixes. Native low-height QA also reproduced clipped composer/footer and floating Git interception before the layout fix.

| Check | Evidence |
|---|---|
| `npm run build` | PASS: storage boundary 99 accesses / 53 files; Main, preload, CLI and renderer built. Existing Vite >500kB chunk warnings remain. |
| `npm run check:renderer` | PASS. |
| Related renderer/UI/settings suite | 91 files / 649 tests PASS. |
| Final Sender transition/shared avatar tests | 2 files / 19 tests PASS, including the added Work long-draft/focus/Stop transition. Existing busy-stop/queue tests retained. |
| Final layout/Stop follow-up | 4 suites / 22 tests PASS after final CSS. |
| Final `npm run build:renderer` | PASS after final layout CSS. |
| Independent review | 8 suites / 22 tests PASS; no outstanding blocking findings. Initial pinned-project regression and General route issue fixed and rechecked. |
| Exact renderer Moments symbol audit | Zero matches for `window.moments`, `IPC.MOMENTS_*`, `shared/moments-types`, `buildMomentMediaUrl` and all six removed settings fields. |
| `git diff --check` | PASS. |
| Actual Windows Electron smoke | `node scripts/verify/renderer-layout-smoke.cjs`: PASS; result and screenshots in `output/renderer-layout-qa`. |

The final extra suite adds one test after the 649-test run; totals above describe distinct executions and are not summed as unique tests. Logs: `tests.log`, `final-extra-tests.log`, `typecheck.log`, `build-renderer.log`, `native-smoke.log`, `final-layout-tests.log`, `result.json`, `geometry.json` under the QA output directory.

## Native UI evidence

The smoke uses only `--firefly-profile=smoke --firefly-isolation-root=<QA output>/profile`. Actual userData/appData/sessionData paths in `result.json` all point inside that isolated directory. No genuine userData was opened. Window minimum sizes are lowered only on the QA BrowserWindow to probe 600px behavior; production Main minimum sizes are unchanged.

Windows screenshots were opened with actual pixel inspection, including wide chat, collapsed sidebar, More, 960×540 Inspector/long draft, file preview, narrow chat/settings, General, Preferences, Appearance, save error, expanded Git/Todo and new Work. Native checks cover legacy fixtures, draft preservation on collapse, keyboard focus, default General, actual General save/readback, injected IPC failure presentation, project A/B switch, file preview, last Inspector tab close, and long drafts with expanded cards.

`chat-streaming-stop.png` shows a simulated AGUI fixture delivered through native IPC to the actual chat window, with real renderer streaming state and an unobstructed Stop button. Clicking Stop invoked the isolated cancellation handler exactly once; fixture terminal delivery returned the UI to idle. This does not verify a live external model, real Git push, real TTS/ASR provider or installer.

## Reference and limitations

Current [ChatGPT app guide](https://learn.chatgpt.com/docs/app) and [Settings guide](https://learn.chatgpt.com/docs/reference/settings) were consulted. Layout decisions primarily follow the explicitly approved Firefly specification and this repository's existing behavior, rather than importing unrelated ChatGPT product features.

The eight supplied Library references resolved, but supported Windows materialization failed while applying file metadata (`os.setxattr` unavailable); supported Library direct reading returned text and explicitly no native image pixels. No helper error was bypassed and no reference pixel inspection is claimed. Parent cloud task owns reference-to-output pixel alignment and final visual acceptance. The CI email image was not used as a UI reference.

Baseline supports `pearl-white` only. Dark-theme visual acceptance is not covered. Existing English/Chinese renderer resources remain, including translated new labels; standalone Settings retains its existing Chinese-only language selection. No experimental memory, browser, accounts/billing, cloud computer, parental controls, password manager, Call or PR inbox was enabled or invented.

Final screenshot delivery: 14 final Windows captures were staged as regular readable PNG files under `E:\Codex\2026-10-04\task-2\screenshots`. The supported Library prepared-upload helper stopped at tools discovery due restricted network, before any upload. Its network escalation was rejected by automatic approval review because external screenshot upload authorization was not recognized. No Library IDs or successful upload are claimed; no alternate transfer bypass was attempted. Parent task must obtain approval for this transfer or inspect the retained local screenshots.
