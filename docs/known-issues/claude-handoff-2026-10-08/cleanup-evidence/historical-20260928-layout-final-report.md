# Skills canonical source layout — final local verification

## Result and scope

The approved three stages are complete in `E:\Codex\Firefly_Agent-skills-layout`, branch `refactor/skills-source-layout`. No push, PR creation/edit, main merge, upstream Skill upgrade, effectKind/permission change, workflow rewrite or real userData operation was performed. The original checkout `E:\Codex\Firefly_Agent` remains clean on `chore/project-structure-finalize` at `7c03afb705bf92010d3913c73ddbf1d0fc8dddfa`.

Local checkpoints:

1. `0eaff82fe76280e5953862e7b29505334cb9840a` — `refactor(skills): materialize canonical vendor skill sources` (256 files).
2. `501da821c8c5abab15ed8fce7ca6d5390c6913c1` — `build(skills): generate snapshot from canonical vendor sources` (5 files).

There are 260 distinct changed paths relative to the approved baseline: 253 canonical files, subtree-only Git attributes, vendor README, canonical invariant test, generator, generator tests, packaging config and packaging tests. README belongs to both checkpoints. `final-changed-paths.txt` contains the complete path list. The final branch has a clean working tree. Ignored design/plan/constraints remain local; `.gitignore` was not changed.

## Materialization and Git byte preservation

- Actual initial archive SHA-256: `667740966cf7f06139ab4cf65bb41489b207e3ab54627c1e2d0cfc297b9a5e72`; actual size: 819507 bytes.
- Safely extracted using the existing `src/shared/zip-extraction.ts` implementation, outside the repository. `baseline.json` records every runtime ID, path, size, file/body hash and line-ending classification.
- Exactly 39 vendor directories and 253 files. Missing=0, extra=0, byte mismatch=0; symlinks=0, unsupported entries=0. Scanner metadata matches the distributed tree.
- EOL inventory: LF=99, CRLF=150, mixed=4, binary=0. No source text, scripts, references, license/notice, frontmatter or line endings changed.
- `.gitattributes` adds only `vendor/firefly-skills/skills/** -text`. With actual `core.autocrlf=true`, temporary index and checkout verification made 506 working-tree/checkout hash comparisons for 253 files: mismatch=0 (`roundtrip.json`).
- Root `skills/` retains exactly the eight existing built-ins. Runtime still scans only builtin/user roots; canonical sources are not another runtime scan root.

## Generator and manifest

`scripts/packaging/build-skills-snapshot.mjs` now validates and reads only `vendor/firefly-skills/skills/` for current content. Root built-ins are checked, not packed. Source/upstream reconstruction, historical adaptation verification, and migration recognition remain in the existing adaptation assets/tests; none is applied as a hidden overlay during ordinary generation.

The archive uses sorted paths, fixed `2000-01-01T00:00:00Z` dates, JSZip DEFLATE level 9, DOS platform, no synthetic directory entries, and safe-extraction/full-byte verification before publication. Unsafe paths, junctions/symlinks, invalid ID sets and missing bodies fail without replacing the previous archive. A simulated manifest publication error verifies restoration of the previous archive and manifest.

Both actual `npm run prepare:skills` runs exited 0:

| Run | Archive SHA-256 | Bytes | Result |
| --- | --- | --- | --- |
| First | `667740966cf7f06139ab4cf65bb41489b207e3ab54627c1e2d0cfc297b9a5e72` | 819507 | unchanged |
| Second | `667740966cf7f06139ab4cf65bb41489b207e3ab54627c1e2d0cfc297b9a5e72` | 819507 | unchanged |

The baseline archive is reproduced exactly. Manifest SHA-256 stays `92a5174263dbaae63f288cd2b53f0968c841730030d7dc7799cd1feaa156c449`; generatedAt, sourceSha256, historical adaptation/prior/recognized hashes and provenance are unchanged. Canonical file bytes remain unchanged. Preparation stays manual and is not added to build/dev/start/package:win:dir.

## Packaging and migration

The existing vendor extraResources fileset excludes `skills{,/**/*}`. A test uses the installed electron-builder `FileMatcher` and `builder-util.copyDir` to perform the real resource copy into a temporary directory: ZIP, manifest, LICENSE-NOTICES and license-provenance are present; canonical `skills/` is absent. Runtime continues using `resources/firefly-skills/skills-snapshot.zip`. This is a real copy-filter verification, not an installer build or installer Smoke.

ZIP, manifest, dependency/lock files, runtime scanner/registry, installation/managed-migration implementation and shared ZIP extraction implementation have no content changes. Existing tests exercise historical hashes, user-modified bodies/attachments, conflict protection, repeated installation and failure isolation. No real installed Skills were updated.

## Executed verification

Environment: Windows, Node 24.19.0, npm 11.17.0, JSZip 3.10.1, Vitest 4.1.11. Bash path verified as `E:\Git\usr\bin\bash.exe` and supplied only to test processes; no global configuration change.

| Command / check | Actual result | Evidence |
| --- | --- | --- |
| `npm ci --foreground-scripts` in the isolated worktree | Exit 0, 1197 packages installed, installation audit reported 0 vulnerabilities; package/lock unchanged | npm-ci.log |
| Canonical invariant red→green | Missing-root failure before materialization; then complete bytes/IDs/scanner metadata passed | materialization-red.log, materialization-green.log |
| `node --test scripts/packaging/build-skills-snapshot.test.mjs scripts/packaging/electron-builder-config.test.mjs` | Exit 0, 16 passed, 0 failed/skipped; generator exports and missing filter failures observed before implementation | generator-red.log, packaging-red.log, generator-final.log |
| `node --test scripts/packaging/adapt-skills-snapshot.test.mjs scripts/packaging/skill-replacement.test.mjs scripts/packaging/xlsx-workspace.test.mjs` | Exit 0, 10 passed, 0 failed/skipped | adaptation-regression.log |
| `npx vitest run src/main/skills src/main/migration/skill-snapshot.test.ts src/main/migration/managed-skill-update.test.ts src/shared/zip-extraction.test.ts` | Exit 0, 18 files / 136 tests passed | skills-regression.log |
| `npm test` | Exit 0, 522 files passed; 4497 tests passed, 1 existing test skipped, total 4498; 243.80 seconds | full-test.log |
| `npm run check:renderer` | Exit 0 | renderer.log |
| `npm run build` | Exit 0; Main, Preload, CLI and Renderer built; existing Vite chunk-size warnings remain | build.log |
| Isolated Electron Smoke | Exit 0; result details below | runtime-smoke-active-modes.log, runtime-smoke-result.json |
| Checkpoint 2 `git diff --cached --check`; final working/index diff checks | Exit 0 | staging command output and final Git checks |

The targeted and Node-runner counts are separate, overlapping evidence; they are not added to the full-suite total. The one existing skip is the plugin-panel static-resource file-symlink escape test (`src/main/plugin-panel-protocol.test.ts`), gated by Windows file-symlink capability. A focused check confirmed 18 passed / 1 skipped (`skip-boundary.log`). No skip, timeout or assertion was relaxed. New generator junction rejection tests passed without a platform skip.

### Preserved-byte whitespace exception

Checkpoint 1/baseline-to-final `git diff --check` exits 2 because exact imported distribution bytes contain CRLF and existing whitespace. A CR-at-EOL diagnostic, used only to understand the output and not as a persistent policy change, leaves two actual inherited trailing-whitespace lines: `skill-creator/scripts/improve_description.py:140` and `skill-creator/scripts/quick_validate.py:100`. They were deliberately not normalized because the user required every distributed byte unchanged. See checkpoint1-whitespace.log, checkpoint1-cr-diagnostic.log and cumulative-whitespace.log. Authored-only checkpoint-1 checks, checkpoint-2 staged checks, and final working/index checks pass. No claim is made that the cumulative imported diff passes the whitespace checker.

## Isolated runtime evidence

The temporary test-only wrapper redirects appData/userData/sessionData/temp/logs/crashDumps before loading this worktree's built Main. Normal Windows Known Folder support remains intact. Controller and wrapper are preserved outside the repository; the temporary in-repository wrapper was removed before checkpoint 2. No test hook entered production.

Final run loaded `E:\Codex\Firefly_Agent-skills-layout`, isolated userData `E:\Codex\Firefly-skills-layout-validation-20260928\runtime-hOBHUJ\appData\Firefly`. Actual Main registry: 47 registrations, 47 unique IDs, 1 hidden; actual Renderer list: 46 visible. No registration points to the canonical source subtree. Chat→Work→Learn→Code clicks each verified exactly one active button with the expected mode, not merely visibility. Renderer loaded and normal `app.quit()` exited code 0/signal null. No model request, Office operation, TTS or music control was performed.

The first controller failed because `require` is not available inside Playwright's Main evaluation context; the app still exited normally. Only the temporary test wrapper/controller was corrected; production code was unchanged. The corrected Smoke passed, then the stronger active-mode assertion also passed. The failed harness evidence is retained rather than counted as a product defect.

Runtime limitations actually observed: no configured vector/reranker models; screenshot native helper prewarm reports ENOENT for this isolated worktree's unbuilt helper. Standard `npm run build` does not build that helper. These did not prevent the requested startup/Skills/navigation/normal-exit Smoke, but screenshot/native functionality is not certified. No old canonical/source-path error was found in the Skills initialization evidence.

## Review, boundaries and stop

Applied installed development Skills: using-superpowers, writing-plans, executing-plans, source-driven-development, constraint-driven-development, test-driven-development, systematic-debugging for actual test/harness failures, security-and-hardening for archive/path handling, code-review-and-quality for correctness/architecture/security/performance, and verification-before-completion for evidence/staging/checkpoint checks. No broad simplification was warranted; code-simplification was not used.

Final review found no additional required code changes within this layout-only scope. Byte preservation and the whitespace exception are explicit. No third-party content was upgraded/relicensed, and no dependency/permission/runtime contract changed. Real model E2E, external Office, TTS, QQ Music, deep GUI interactions, installer, cross-platform and public redistribution remain unverified boundaries. Screenshot native-helper availability is also unverified in this isolated build. This closes only canonical layout, deterministic generation, packaging-filter and the recorded regression/Smoke scope. No further feature work follows.
