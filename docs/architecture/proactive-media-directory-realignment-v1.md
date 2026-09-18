# Firefly V1.1.1 — Proactive / Media Directory Realignment V1

## Baseline and scope

- Branch: `firefly-v1.1.0`
- Baseline HEAD: `30ac278cdf0f7419510ae575737ab0ee44d1d744`
- Product version: `1.1.1`
- The legacy-state retirement and first three directory rounds remain in the
  worktree. No reset or overwrite was performed.
- This round changes repository directory ownership, imports, resource
  resolution, build output cleanup, and related test paths only.
- No TTS model, voice parameter, text rule, cache invalidation rule, Music
  behavior, Proactive policy, or renderer behavior was changed.

## Actual old path to canonical path

| Old path | Canonical path | Preserved owner |
| --- | --- | --- |
| `src/main/orchestrator/proactive/` | `src/main/proactive/` | `FireflyProactiveScheduler` lifecycle-only boundary |
| `src/main/runtime/music/` | `src/main/music/` | `MusicService`, `MusicContextService`, `MusicPreferenceService`, QQMusic bridge/provider |
| `src/main/runtime/tts/` | `src/main/tts/` | TTS session, dispatcher, engine, cache, playback ownership, and TTS IPC |

The old source roots were physically moved and are not retained as forwarding
modules or active implementations. The architecture guard scans the three
canonical roots and rejects all three retired roots.

## Production consumers and ownership

`src/main/application/default-dependencies.ts` remains the only composition
root for the existing instances. Its imports now point to `../music/` and
`../tts/`; the moved modules retain their exported symbols and registration
interfaces.

The Music tool adapters remain at
`src/main/orchestrator/tools/adapters/music-tools.ts`. They call the single
Music domain service and do not own playback state. The two existing
authorization routes remain unchanged:

- `music.status.read` → `music_status`;
- `music.control` → `music_control`.

The QQMusic target identity remains the exact case-insensitive
`QQMusic.exe` check in the moved bridge and its GSMTC script. `music_search`
remains in its existing blocked/unavailable state; this round does not add a
provider or alter that boundary.

The renderer continues to consume the existing TTS IPC/session and playback
contracts. The moved TTS code still owns the same session, dispatcher, engine,
cache-key, cache, cancellation, stop, and playback-ownership behavior. TTS
configuration is still supplied by the existing Settings snapshot and
`configPath`; external GPT-SoVITS models, reference audio, and user cache are
not repository resources and were not moved.

Proactive remains a lifecycle-only module. The application composition root
does not construct or register `FireflyProactiveScheduler`, does not restore a
timer or automatic trigger source, and does not add a manual entry point. The
existing `MAIN + toolSurface: "none"` and stale-result cancellation boundary
remains in the moved scheduler.

## Resources and build/distribution paths

The QQMusic script moved with the Music source to
`src/main/music/scripts/qqmusic_gsmtc.ps1`. The bridge resolves it in this
order:

1. compiled `__dirname/scripts`;
2. `dist/main/main/music/scripts` during repository/build execution;
3. the same compiled directory as the final fallback.

`tools/build/copy-runtime-resources.mts` copies the script directory to
`dist/main/main/music/scripts/` and precisely removes stale generated roots:

- `dist/main/main/orchestrator/proactive/`;
- `dist/main/main/runtime/music/`;
- `dist/main/main/runtime/tts/`.

The earlier Memory/RAG/Settings cleanup remains in the same script. No model,
voice reference, user settings, Memory data, RAG index, cache, or unrelated
build output is removed.

`package.json` publishes `dist` as the runtime source of the QQMusic script; the
repository source directory is not a package fallback. The build contract test
verifies the canonical compiled roots and the copied script.

## TypeScript tests and guards

The touched first-party tests were kept under the strict test configuration:

- `tools/test/runtime/tts.test.ts` (migrated from `.mjs`);
- `tools/test/presentation/chat-shell.test.ts` (migrated from `.mjs`);
- existing Music and Memory/Music Preference TypeScript tests now use the new
  compiled/source paths;
- proactive source-contract tests now read `src/main/proactive/`.

`tools/test/core/proactive-media-directory-realignment.test.ts` verifies:

- canonical source and build roots exist;
- retired source and generated roots are absent;
- the QQMusic script is available from the compiled location;
- production TypeScript contains no retired domain path;
- Proactive is not registered automatically;
- the npm publish list contains the canonical script path.

`tools/verify/verify-architecture.mts` explicitly scans the three canonical
roots and rejects the three retired roots while retaining the previous
single-owner checks.

## Validation record

- `npm run typecheck`: PASS, including strict `tsconfig.test.json` checks.
- `npm run build`: PASS; three runtime resource roots copied. Existing Vite
  external Cubism and large-chunk messages remain warnings only.
- Targeted TTS test: PASS, 12/12.
- Targeted Chat shell test: PASS, 19/19.
- Targeted Proactive/Media directory contract: PASS, 5/5.
- Full `npm test`: PASS, including the new Proactive/Media directory contract and the migrated TTS/Chat shell tests.
- `npm run verify:typescript`: PASS; only the two previously approved source non-TypeScript assets remain.
- `npm run verify:architecture`: PASS.
- `git diff --check`: PASS; Git emitted only LF-to-CRLF normalization warnings.
- Real QQMusic playback and human TTS listening: NOT RUN; automated tests do
  not constitute real-device or human listening acceptance.

No commit or push was performed. The fifth batch was not started.
