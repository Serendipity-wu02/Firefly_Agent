<h1 align="center">Firefly_Agent</h1>

<p align="center">
  <a href="./README.md">中文</a> | <strong>English</strong>
</p>

**Firefly_Agent 1.1.0** is a Windows Live2D AI desktop companion and multi-mode Agent workspace featuring Firefly from *Honkai: Star Rail*. Built with Electron, TypeScript and React, it brings character interaction, conversations, task execution and development tools into one application.

[Repository](https://github.com/Serendipity-wu02/Firefly_Agent) · [Issues](https://github.com/Serendipity-wu02/Firefly_Agent/issues) · [Documentation](./docs/README.md) · [Architecture](./docs/architecture/firefly-runtime.md)

## Features

| Area | Current implementation |
| --- | --- |
| Desktop character | Firefly Live2D model, click and double-click expressions, dragging, motion playback and reset. Chat actions use the existing tool and event chain. Twelve task characters retain separate portraits and have explicitly configured persistent specialist roles. Moments is disabled by default. |
| Chat | Character conversations, model profiles, streamed replies and history. An explicit preferred form of address takes priority over an existing nickname; the default is “开拓者” (Trailblazer). Canonical story events do not automatically become shared experiences with the current user. |
| Work | Tools, file and document processing, Skills, Task/Subagent, approvals and cancellation. Explicitly required file reads need evidence from the current run; budget limits require partial-range confirmation. Task completion and complete reading are reported separately. Finished tasks can be exported to Markdown through a native save dialog. |
| Work knowledge workspace | Learning, quizzes, notes and progress remain available in Work. Bind a workspace, then explicitly confirm “添加学习结构” (add learning structure), or bind an initialized Vault. Ordinary Work does not automatically create a Vault or maintain progress. See the [knowledge workspace guide](docs/user-guide/knowledge-workspace.md). |
| Code | Git, LSP, AST, file and command tools, and Code Skills, using the current Agent, tool permissions and approvals. External language servers require their own environment. |
| Skills | 39 third-party Skills plus five project Skills (`diagram`, `assessment`, `tutoring`, `knowledge-workspace`, and `plugin-development`), for 44 total. Persona and planning/file protocols move to `prompts/persona-support/` and `prompts/workflow-support/`, outside Skill discovery. Existing mechanisms include discovery, registration, mode filtering, on-demand body and attachment reading, user overrides, and managed updates with hash recognition, backups and user-edit protection. |
| Plugins | Local installation, lifecycle and isolated panels; a locally buildable SDK, manifest/schema contracts and four examples. No project-hosted online marketplace or published SDK package is promised. |
| Memory / RAG | Original conversations and vector indexes are stored separately, with existing memory and history retrieval paths. Unavailable vector models produce explicit feedback; raw Chat is still saved and failed indexing is not reported as success. |
| Voice / Channels | Existing integrations for GPT-SoVITS, ASR, QQ Music, Feishu, WeChat and QQ. Users configure services, clients, channel credentials and resources. The separate Call window, loop and interfaces are retired; shared ASR/TTS, Chat playback and channel speech remain. Integration code does not establish complete testing of external services. |

Models, tools, Skills and plugins share the current runtime and permission mechanism. Skill text and portraits do not grant additional tool permissions; existing configuration controls enabled state and allowed modes.

## Current status

The current source tree is Firefly's independently maintained product baseline. Original projects serve as provenance and historical compatibility references; runtime and builds do not need their working directories.

**Historical verified scope (before the vNext changes, not acceptance of the current version):** independent source builds; Main/Preload/Renderer TypeScript and build checks; isolated Main and Renderer startup; Chat / Work / Learn / Code entry points; registration of 39+8 Skills; malicious and normal ZIP regressions; managed upgrades from a real old Skills archive and user-file protection; targeted automated tests; basic XLSX `find-label` Smoke; and local plugin SDK/example compilation and Mock checks.

**Current vNext verification:** after freezing source changes, the full suite passed 538 files and 4766 tests, with one test skipped because Windows symbolic-link permission was unavailable. Main/Preload/Renderer typechecks, the full build, plugin SDK and four examples passed. An isolated user directory verified Main/Renderer startup, Chat / Work / Code switching, 44 registered Skills and normal exit. Persisted Learn sessions migrate to Work after backup; new Learn requests are rejected. Migration of real user data was not performed.

**Current vNext boundaries:** Main uses twelve persistent specialist Agents with explicit saved-model routing. Chat does not delegate; Work/Code expose their supported specialists. Existing saved profiles can be assigned in settings; missing configuration fails explicitly. The old public task tool is retired; schema1 history remains readable. Offline automation does not replace real-model, complete GUI or external-service acceptance.

**Not fully accepted:** real-model end-to-end execution, deep GUI interaction, complete external Office/LibreOffice/.NET workflows, real-user environments, installer upgrades, cross-platform behavior, the complete TTS / QQ Music approval chain, sustained frame rate, and redistribution permission for every asset required for a public release.

Recorded maintenance issues include process-wide attachment-page deduplication; reading across sessions needs further validation. The original cause of the first empty-history-list incident remains unknown. Read failures being presented as empty lists and subsequent file overwrites have been fixed; successful restarts do not establish the original cause.

Current boundaries are described in the [reliability guide](docs/architecture/firefly-reliability-boundaries.md); historical commands, input hashes and results are available through the [archive index](docs/archive/README.md). Targeted results do not establish a full test-suite pass or completion of every feature. No public installer or automatic update is promised; automatic updates remain disabled.

## Development environment and startup

Requirements are Windows, Node.js `>=24 <25`, and npm `>=10`; the declared package-manager version is npm `11.17.0`. From the repository root:

```powershell
npm ci
$isolationRoot = Join-Path (Get-Location).Path "output\development-profile"
New-Item -ItemType Directory -Force -Path $isolationRoot | Out-Null
$env:FIREFLY_RUNTIME_PROFILE = "development"
$env:FIREFLY_ISOLATION_ROOT = (Resolve-Path -LiteralPath $isolationRoot).Path
npm run dev
```

`npm run dev` explicitly selects `development`. The isolation root must be an existing absolute directory and must not equal, contain, or be inside production appData. Startup rejects a missing or invalid root. This example creates the root only inside the current workspace.

To start this checkout’s built output in the same PowerShell session with the environment variables above already set:

```powershell
npm run build
npm start
```

`npm start` loads this repository's `dist`; rebuild after source changes. Running `electron .` from the checkout remains unpackaged; the variables above explicitly select `development` and supply its isolation root. An isolation root without an explicit profile is rejected. Set both variables again in a new PowerShell session. Both launch methods in this example use the `Firefly-development` identity and `$isolationRoot\Firefly-development` data directory; quit the current instance normally before opening another against that same development directory. The packaged application defaults to `production` and does not use this development isolation directory.

Create a model profile in application settings, supply the protocol, address, model and credentials supported by your service, then select the profile. The repository contains no real credentials or ready-to-use model configuration. Conversations, selected materials and tool results sent to a model may leave your computer, depending on the service and operation you choose.

## Checks and local packaging

These commands come from the current [package.json](./package.json):

```powershell
npm run check:renderer
npm test
npm run build
npm run check:plugin-sdk
npm run test:plugin-examples
```

Main and Preload TypeScript checks are included in `build:main` / `build:preload`. Windows is the current primary acceptance platform. Screenshot path and default `cmd` integration cases run only on Windows; cross-platform process-manager cases remain enabled. Partial Linux passes do not establish Linux product support. `npm test` runs the suite defined by `vitest.config.ts`, not Node script tests, Rust tests, installers or live external-service checks. See [scripts/README.md](./scripts/README.md) for script entry points. Windows Bash integration tests require `FIREFLY_TEST_BASH` to point to an existing Git Bash `bash.exe` using its actual absolute path.

When the distributed Skills directories change, review `vendor/firefly-skills/skills-manifest.json` and the source notices, then run `npm run validate:skills`. Packaging copies the validated directories directly; it does not generate a Skills ZIP. The screenshot helper needs a Rust/Cargo Windows MSVC toolchain and C++ build prerequisites. Local unpacked preparation is:

```powershell
npm run validate:skills
npm run package:win:dir
```

This script builds the application and screenshot helper, prepares verified MinGit, and produces a Windows unpacked directory. It does not establish installer acceptance or public release readiness. This work publishes no Release, SDK or installer. Keep user data, model weights, voice resources and test logs out of source and artifacts.

## External-service prerequisites

- **GPT-SoVITS:** prepare and start your own service, then configure its address, reference audio and matching text in TTS settings. Missing configuration is reported explicitly while text replies remain available. The project includes no local voice environment, weights, audio or cache. Real synthesis, playback and stopping remain unverified.
- **QQ Music:** requires a running, accessible desktop session. Status and controls use the existing tool-permission chain; command submission and observed state changes are reported separately. Controls affect current playback; the full application approval chain remains unverified. There is no automatic NetEase fallback.
- **BGE-M3:** requires complete vector-model resources configured by the user. Without them, vector retrieval/writes report unavailable and raw history is retained. The application does not automatically download a model or reuse the main Chat profile as vector configuration. Backfilling historical vectors remains pending.
- **Office and channels:** prepare the Python modules, LibreOffice, .NET, language servers, channel services and permissions required by each actual workflow. Static instructions or a basic Smoke check do not prove every external program works.

## Architecture and directories

The application starts at `src/main/index.ts`, compiled to `dist/main/main/index.js`. Preload provides controlled IPC; React and Live2D render the windows and desktop character. The three modes, Chat / Work / Code, use the existing Firefly Agent execution chain, with distinct owners for tools, Tasks, approvals and cancellation.

| Path | Responsibility |
| --- | --- |
| `src/main/`, `src/preload/`, `src/renderer/` | Application services, controlled bridge, React interface and Live2D |
| `src/main/orchestrator/` | Firefly Agent orchestration, tool execution, Task/Subagent and permission integration |
| `src/main/skills/`, `skills/` | Skill discovery, registration, reading and project built-ins |
| `vendor/firefly-skills/`, `scripts/packaging/` | Distributed inherited Skills directories, provenance/licenses, historical adaptation evidence and package validation |
| `src/plugins/`, `packages/plugin-sdk/`, `examples/` | Plugin host, local SDK, schema and development examples |
| `src/shared/` | IPC, data/event contracts and ZIP security boundaries |
| `prompts/`, `assets/` | Layered character prompts, world knowledge and product assets |
| `native/`, `electron-builder.yml` | Native helper source and application packaging configuration |
| `docs/architecture/` | Current responsibilities, entry points and maintenance boundaries; historical records are separated in the documentation index |

See the [runtime architecture](./docs/architecture/firefly-runtime.md) and [maintenance boundaries](./docs/architecture/firefly-maintenance.md) for dependency directions.

## Data and upgrade protection

The default `production` data directory is `%APPDATA%\Firefly`. The technical package name `firefly-agent`, display name `Firefly_Agent`, runtime data identity `Firefly`, and appId `com.serendipitywu02.firefly` have distinct roles; changing the display name does not recreate the data directory.

Settings, model profiles, Chat / Work history, run records and user Skills do not belong in Git or the application package. Quit normally and back up before manual changes, preserving old directories. Do not overwrite an existing destination or simply combine directories. Central migration handles old formats and credential decryption; current data takes priority, conflicts are retained and diagnosed, and read errors do not trigger empty-data writes. Skills updates only modify recognized managed content and preserve user edits and same-name custom files.

## Development workflow

Commit and validate development on `firefly-mini-v1.1.x`, then use a PR to merge into `main`. Run checks appropriate to the change and state what remains unverified. Read the [contribution guide](./.github/CONTRIBUTING.md) and [AGENTS.md](./AGENTS.md). Do not include credentials, private conversations or user data in Issues or PRs.

## Upstream and licensing

Firefly_Agent is independently maintained. Portions of its source originated from Cyrene-Agent and remain subject to the preserved MIT notice. This does not mean all code was written from scratch.

Source licensing is documented in the complete [MIT License](./LICENSE). Third-party Skills, dependencies, Live2D models, portraits, character IP and other assets have their own licenses or permissions; the source MIT license does not automatically grant asset redistribution rights. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md), [MODEL_LICENSE.md](./MODEL_LICENSE.md) and the [contributors record](./docs/CONTRIBUTORS.md) for provenance and boundaries. Public asset redistribution review remains pending.

Firefly and *Honkai: Star Rail* intellectual property belongs to its respective rightsholders. This is an unofficial project.
