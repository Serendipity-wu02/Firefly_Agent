# External Skills integration and security acceptance

## Automated checks and scope

`external-integration.test.ts` drives the production preload bridge through the real `createDefaultApplicationDependencies` composition, trusted Main IPC, external service, managed staging/commit, persisted provenance and real Skill registry. Only the Electron transport/host and unrelated application subsystems are replaced by test doubles. Official-source responses are generated locally from the synthetic text/license fixture. No upstream content, plugin code, vendor script, shell command, MCP server or channel adapter is executed by these flows.

Every fixture uses `isolatedStorageContext()` with a temporary `test` profile. Mutating filesystem calls are audited against that isolation root. A separate synthetic production sentinel is hashed before and after each flow. It is not a real production profile. No packaged/vendor Skill directory is scanned. The ordinary-Skill regression fixture is generated text under the same temporary root.

Spies cover child-process execution, native ZIP preparation/commit, PluginManager installation, MCP addition, channel subsystem creation/adapter registration, permission-level changes and browser authorization-domain creation. The current application has no named connector-creation API; its real channel creation/registration interfaces are the equivalent existing boundary. The tests do not invent a business API. Browser authorization/permission source hashes and native marketplace allowlist source hashes are locked to the approved pre-T9 snapshot. This is bounded integration evidence, not a proof against a malicious same-OS-user adversary.

Run only with already-installed dependencies and a reviewed execution boundary:

```sh
npm test -- src/main/skills/external-integration.test.ts src/main/skills/external-boundary.test.ts
npm run check:storage-boundary
node node_modules/typescript/bin/tsc -p tsconfig.main.json --noEmit
node node_modules/typescript/bin/tsc -p tsconfig.preload.json --noEmit
npm run check:renderer
npm run build
```

These commands do not authorize downloads, installing missing packages, starting the app, using production profiles or weakening any access restriction. Preserve the npm archive reporter, raw logs and each terminal status. A test-only acceptance suite may pass on its first run because T1–T8 already implemented the behavior; record that honestly, rather than manufacturing a RED failure. Never count filtered/skipped/not-run tests as passed.

## Current execution limitations

Real GUI acceptance is UNVERIFIED/BLOCKED in the current cloud environment. JSDOM component tests and the mock Electron bridge do not establish a launched Electron window, native dialog behavior or screenshot evidence.

The earlier T6 broader regression lost its terminal session after a tool-policy denial reporting an unexpected HTTPS connection to `github.com`. Its archive remains `running` with no cases or terminal result. Source inspection did not establish the cause. Do not rerun that denied group, all `src/main/skills`, or bare `npm test` that includes it by another route. The requested aggregate and full-suite rows remain BLOCKED. Earlier Electron binary download and Chromium socket routes were also denied; do not retry those routes, change sandbox/security settings or use the user's computer as a fallback.

Native marketplace/ZIP regression tests may be run only after confirming they are separate from the denied T6 group, use mock transport and synthetic temporary ZIP data, and do not run plugin/vendor code or install/download dependencies. Real network, Windows packaging and installer runtime acceptance remain NOTRUN unless separately authorized and available. `validate:skills` is unnecessary while all vendor hashes are unchanged.

## Manual isolated GUI procedure (not executed)

Use these steps only after an authorized, available GUI environment exists. Do not use `npm start` or `npm run dev`, because they do not specify the required isolated test profile. Use an already-built application with `--firefly-profile=test` and an explicit new `--firefly-isolation-root=<temporary directory>`. Main must receive mock official-source transport and an exact synthetic review fixture through the existing test setup; do not add Renderer fault switches or approve real upstream content to make the flow work. If that test setup is unavailable, stop and record the blocker.

1. Record the app/tool versions, time, isolated root, guard ownership, initial empty test state and independent synthetic production-sentinel hashes. Keep real production profiles inaccessible.
2. Open the Skills panel in Work and Code mode. Browse both fixed sources. Show source, repository/path/commit, bundle version, actual optional Skill version, license evidence and review blockers. Confirm no arbitrary URL, credentials, package installer, update or uninstall action appears.
3. Open a synthetic approved instruction-only detail. Cancel/back/close before preparing and while preparing. Confirm the status resolves without an import, temporary staging is removed, and no token is shown or logged.
4. Prepare again. Review the exact immutable snapshot and confirm import once. Attempt duplicate confirmation. Verify one formal directory and one committed record; every imported text/license/reference byte is preserved. Verify the imported entry is visibly disabled in both modes and absent from runtime-enabled lists.
5. Refresh, go back, reload/navigate or close/reopen with a ready confirmation. Confirm that the old approval cannot commit. Prepare afresh rather than extending the fixed ten-minute expiry.
6. Inject a temporary-test-only state-write failure. Click Enable. Capture the failure message and prove both persisted state and registry remain disabled. Remove the injection and explicitly Enable again. Verify body/top-level references and Work/Code availability now succeed.
7. Restart using the same isolated root and a fresh Main run identity. Confirm that an imported-but-never-enabled entry is still disabled, and a separately explicitly enabled entry retains its preference. Disable and restart once more to check persistence.
8. Browse synthetic unsupported scripts/binaries/nested references, unknown or out-of-scope licenses, missing exact reviews, and OpenAI URL/git-subdir origins. Confirm the whole item remains informational/blocked. No source URL is followed and no unsupported file is silently stripped before claiming a complete import.
9. Inject write/rename/transport failures into temporary fixtures. Check sanitized retryable errors, bounded cancellation, rollback, unchanged colliding target data and no staging/provenance leftovers. Recheck sentinel hashes and that all recorded writes remain inside the isolated root.
10. Compare browser permission/authorization and native executable marketplace allowlist hashes with the approved baseline. Show the unchanged ordinary-Skill mode/enable behavior using generated local text. Keep native PluginManager, ZIP installer, MCP addition and channel/connector creation spies at zero.

Attach screenshots of browse/detail, cancellation, confirmation, disabled list, failed enable, successful enable and post-restart state, plus the actual event/IPC log, complete filesystem manifest and sentinel comparison. Never include approval tokens in logs. Record each row PASS/FAIL/BLOCKED/NOTRUN. Missing screenshots or native runtime checks must remain explicitly unverified. Wait for user acceptance; do not enable a real third-party Skill, publish or package a release as a side effect of acceptance.
