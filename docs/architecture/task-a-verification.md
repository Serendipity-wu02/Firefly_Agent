# Firefly Task A — implementation and verification ledger

Status: all Task A acceptance gates and two final unpacked smoke runs passed; reviewer findings closed. Two authorized logical local commits record this work (see git log). No push, PR, merge or Task B. Manifest retirement remains intentionally paused because native installer consumers are current.

## Baseline and authority

Workspace E:/Codex/Firefly_Agent-skills-layout. Initial clean worktree, branch refactor/skills-source-layout, HEAD 1258af43686ce76c2665bce539e69678df117a11. Baseline HEAD was preserved until the two final local commits. Resume preserved all Task A changes; no reset/stash/checkout/history rewrite. Existing current repository architecture and approved directory Skills plan are the target, not main. No original-product source trees used by runtime/build/tests/packaging. The original Firefly conversation/thread could not be independently identified; architecture history was derived only from current repository plans, architecture and git timestamps.

Actual skills applied: using-superpowers, context-engineering, source-driven-development, constraint-driven-development, executing-plans, test-driven-development, systematic-debugging, security-and-hardening, code-review-and-quality, requesting/receiving-code-review, differential-review, code-simplification, verification-before-completion. One fresh reviewer reviewed current worktree read-only; no parallel implementation agents.

## Incident evidence — production modification NO

Real userData C:/Users/w1558/AppData/Roaming/Firefly was only read for authorized evidence/metadata/hash. Restricted evidence directory E:/Codex/Firefly-userdata-incident-20260929 contains metadata.json, readonly restricted mcp-servers.current.readonly.json and backup-audit.json. Current source bytes and mtime are unchanged; no restoration, deletion or real secret migration.

| File | Size | Mtime UTC | SHA256 |
|---|---:|---|---|
| mcp-servers.json | 489 | 2026-09-29T13:44:26.4701683Z | D27FA954FC2607707A422DE214AEA504A991645810045720EB34D3769A7A788E |
| content-manifest.json | 6052 | 2026-09-29T13:44:22.5624063Z | 639B8DB94964BFF3703D1608A69C84D47F99F2266C07BA06266DDD9CF1C2A6EC |
| token-usage.json | 1078 | 2026-09-29T14:19:06.2626832Z | 8A75D269613A7326FD51A4698A6813F5CF359C571873DD1D13D5DEAFF21C4B25 |
| logs/firefly.log | 5794 | 2026-09-29T13:44:26.7808336Z | 0240CEA526EC49E338FCC2B59994DD055550D9B82D4F7B83EA9AAF1C0C7EB70E |

Creation timestamps are recorded in restricted metadata with reliability explicitly limited to filesystem creation times, not independently established incident chronology. Host timezone was Singapore Standard Time UTC+08:00; this is consistent with the requested 21:44–22:19 window, but the original incident timezone remains unconfirmed.

Backup result: NO_RELIABLE_PRE_INCIDENT_COPY. Filename inventory under real userData found other settings/relationship historical backups, but no reliable prior MCP configuration. Searches do not prove that no backup exists elsewhere. Current MCP metadata: serverId playwright-mcp; enabled ABSENT; command present; args count5; env key ELECTRON_RUN_AS_NODE. Without a reliable prior copy, changes to IDs/enabled/command/args/env keys are UNKNOWN. Sensitive values/arguments/chat content were not reported.

## Implemented boundary and retained manifest

Main first side-effect import is identity-preflight. Sequence: resolve/normalize/validate -> apply Electron appData/userData/sessionData/logs -> install StorageContext -> service imports and init. Preflight imports no logger/settings/MCP/plugin/Skills/Memory writers. Production retains appData/Firefly, sessionData=userData, logs=userData/logs.

CLI equals flags: --firefly-profile=production|development|test|smoke and --firefly-isolation-root=absolute-existing-directory. Environment equivalents FIREFLY_RUNTIME_PROFILE / FIREFLY_ISOLATION_ROOT; legacy FIREFLY_ISOLATED_SMOKE_APPDATA is supported. Arguments win; malformed/duplicate/unknown/missing/relative/nonexistent/production equal, nested or ancestor roots fail closed. Development tooling passes its identity and requires an explicit root. No NODE_OPTIONS dependency. Windows realpath/junction/case/.. and path.relative containment are checked before path application, then Electron paths verified.

StorageContext config/data/state=userData, cache=userData/cache, logs/profile.logs, session/profile.sessionData. Central filenames: mcp-servers.json, token-usage.json, content-manifest.json, logs/firefly.log. Memory future contracts only: memory/data, memory/index, memory/temp; canonical roots must be disjoint, including junction ancestry. No existing Memory layout is relocated.

Manifest retirement PAUSED: build/installer.nsh creates native .Firefly.content-preserve staging (45/48/52,102/105/109); default-dependencies passes the owner to core-bootstrap; startCore calls migrateStagedExternalContent before Skills init. Migration reads previous shipped hashes and merges native user content; packaged startup refreshes manifest. No shutdown consumer found. Existing five migration tests retained, four owner/failure/nonproduction regressions added. Nonproduction never consumes/deletes installer staging; real old files retained.

Direct-access inventory: 99 call sites,53 files,62 ownership rows. BOOTSTRAP_ALLOWED15, MIGRATE_LATER84. MIGRATE_NOW completed four owners (MCP/token/logger/manifest); two literal direct userData lookups removed. The AST/build gate rejects new source files, larger call budgets and unapproved dynamic path queries. It is a source regression gate, not proof against arbitrary JavaScript or a malicious concurrent local process.

AtomicJsonStore validates incoming and serialized shape plus existing JSON. ENOENT defaults remain in memory. Same-directory unique exclusive temp write, Node flush/fsync, bounded single .bak of previous valid bytes, rename without deleting primary first. Backup write/replace failure prevents primary replacement; primary replace failure preserves old valid bytes; only owned temps are cleaned. Malformed existing JSON remains unchanged and blocks replacement. Directory power-loss durability and multiprocess concurrency are not promised. MCP disconnects a newly connected server if save fails. token usage also uses the store. MCP safeStorage/OS protection and scoped secretRef are design audit only; no real secret change.

## RED/GREEN and executed gates

RED observed before implementation: runtime13, apply/storage5, preflight2, Atomic6, MCP3, token3, logger/manifest4, manifest2, Memory2, CLI1; AST bypass and classification cases failed before fixes. Review regressions additionally demonstrated serialized-shape1, MCP disconnect1, Memory containment2 and transport type1 failures. The tests were not skipped, timeouts increased or assertions removed.

| Gate | Actual result |
|---|---|
| Comprehensive targeted before review | 11 files /64 passed /2.76s |
| Latest targeted after review fixes | 9 files /56 passed /2.63s |
| First full npm test | 540 files:538 passed2 failed;4730 tests:4727 passed2 failed1 skipped;255.97s |
| After logger test harness repair | 540 files passed;4730 passed1 skipped;270.74s |
| Full npm test after review fixes | 540 files passed;4738 tests:4737 passed0 failed1 pre-existing skipped;267.35s |
| Latest full npm test, workspace TEMP/cache | 540 files passed;4738 tests:4737 passed0 failed1 pre-existing skipped;229.67s (command wall231.351s) |
| Main noEmit | latest workspace run exit0 |
| Preload noEmit | latest workspace run exit0 |
| check:renderer | latest workspace run exit0 |
| npm run build | latest workspace run exit0;1159 Main/Preload/Renderer/CLI runtime files byte-identical to final unpacked artifact |
| check:plugin-sdk / check:plugin-schema | latest workspace runs exit0 /exit0 |
| test:plugin-examples | latest workspace run exit0; four examples compiled and contract smoke passed |
| packaging + AST regression | latest workspace run25 passed0 failed0 skipped;2.0856s |
| package:win:dir | exit0 after final code fixes; release/win-unpacked/Firefly_Agent.exe |
| storage static gate | 99 allowlisted accesses /53files PASS |
| git diff --check | exit0; only existing CRLF normalization notices |

First full failures were old logger tests: obsolete explicit-path API and a VM require loader treating node:fs as a relative TS file. The harness now initializes a validated profile and loads actual Node builtins; original log-content and CommonJS ordering assertions remain. Fresh final read-only review closed all1 Important and2 Minor findings and found no new code blocker; its final approval condition (latest full gates) is now met. Review found no Critical; Important Memory containment fixed with actual Windows junction RED/GREEN; Minor transport coercion fixed; backup/replace/durable-write flush fault injection added. Node's internal fsync cannot be intercepted by exported fsyncSync spy, so flush failure is injected at write boundary with flush:true asserted. Local simplification removed temporary facade exports and any wrappers.

Earlier logs are in .cache/task-a/*.log (individual log files ignored). Latest complete gate results/logs and smoke evidence/helper scripts are in ignored output/task-a/; gates-workspace.json records all10 commands with exit0. Full test FIREFLY_TEST_BASH was the verified E:/Git/bin/bash.exe.

## Executable smoke and diagnosed harness failure

Before launch: actual compiled Main entry rejected seven lost-root/invalid/production-overlap cases with0 writer calls,0 service imports and no StorageContext installation. Final asar's index/preflight/profile/storage/atomic modules matched compiled bytes exactly. Evidence: output/task-a/preflight-proof.json and packaged-entry-proof.json.

Earlier attempts PID35592 and PID35096 failed at the original30s bound and were force-stopped after owned executable/arguments were verified; they are failures, not normal-exit successes. The previous inference that Main had not begun was incorrect. A workspace diagnostic build wrote safe stage markers and established the precise seam: entry/Electron/profile module loaded, then app.getPath('appData') began but did not return. Removing only the process-local USERPROFILE override from the diagnostic harness completed GET_APPDATA_END -> PROFILE_RESOLVED -> PATHS_APPLIED -> APP_READY -> WILL_QUIT, natural code0/signalnull. This isolates the harness environment override as the trigger; the internal Windows native implementation was not independently traced. No product-code workaround, timeout increase, profile weakening or retry-until-green was used. Evidence: output/task-a/smoke-root-cause.json.

The corrected harness preserves inherited USERPROFILE for native directory lookup. TEMP/TMP/TMPDIR, LOCALAPPDATA, XDG_CACHE_HOME/HF_HOME/npm cache remain workspace-local; formal RuntimeProfile flags redirect every Electron persistent/session/log root. No NODE_OPTIONS, global environment/config changes or production root reuse. Read-only startup model audit found no installed project/HF embedding model; actual Main provider was absent in both runs, so legacy home model cache writers were inactive. Prompt dumping was disabled. This does not claim all deferred legacy writers have been migrated.

Final executable release/win-unpacked/Firefly_Agent.exe ran twice consecutively in E:/Codex/Firefly_Agent-skills-layout/output/task-a/smoke-root. Run1 PID23092, run2 PID32620, both normal exit0/signalnull. Main inspector measured Firefly-smoke, packaged=true, appData=isolationRoot, userData=root/Firefly-smoke, sessionData=userData/session, logs=userData/logs, installed StorageContext kind=smoke and NODE_OPTIONS absent. Renderer bridges loaded; Chat/Work/Code switched; settings IPC returned44 unique Skills. There were39 installed vendor skill directories plus5 shipped maintained skills. Second-run installed SKILL.md hashes/mtimes matched the first run: no duplicate installation or body rewrites.

Main exposed memory/data, memory/index and memory/temp below that profile, mutually disjoint. An isolated contract fixture rebuilt/deleted only index and preserved the data sentinel hash in both runs. This verifies the new future directory contract, not a migration of existing Memory storage. Production mcp-servers/content-manifest/token-usage/firefly.log hashes,size,mtime matched before and after each run. Real production modification NO. No orphan task app remains. Evidence: output/task-a/smoke-summary.json, smoke-1.json, smoke-2.json, production-before-smoke.json, production-after-smoke-1.json and production-after-smoke-2.json and production-final-exact.json (full filesystem mtime precision and original incident comparison,4/4 equal); screenshots contain only fresh isolated UI.

## Workspace constraint and next safe step

The user's later explicit workspace-only rule arrived while final tests/package commands were running. Earlier tests used os.tmpdir() on C: and tools may have used their default C: caches. This was disclosed; no extra cleanup of external locations was performed. Those commands finished before any cancellation was applied. Subsequent helper scripts, TEMP/TMP/cache and smoke Electron roots are under workspace output/task-a; only the previously authorized E:/Codex/Firefly-userdata-incident-20260929 is an external write exception. Personal skills were read, never modified.

Smoke blocker resolved by the single-variable diagnostic above. Latest workspace-only full gates and final review passed. Authorized local commits:

1. refactor(storage): establish Firefly runtime profile boundary
2. refactor(storage): centralize persistent paths and safe config writes

Two logical commits only; no manifest retirement commit, push/PR/merge or Task B. Exact final IDs/HEAD/status are recorded in output/task-a/commits-final.json and final-git-status.txt after commit creation. No remaining Task A acceptance blocker. The known scope limits are unchanged: real model/chat depth is not exercised by smoke; Memory roots are a future contract, legacy84 accesses are explicitly deferred, Atomic writes do not promise multiprocess or directory power-loss durability, and a malicious local concurrent junction swap is outside the regression boundary. Git commit metadata uses the existing linked worktree/common git directory on E:; code and new validation artifacts remain in this workspace.
