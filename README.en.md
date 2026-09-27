<h1 align="center">Firefly_Agent</h1>

<p align="center">
  <a href="./README.md">中文</a> | <strong>English</strong>
</p>

**Firefly_Agent 1.1.0** is a Windows Live2D AI desktop companion and multi-mode Agent workspace featuring Firefly from *Honkai: Star Rail*. Built with Electron, TypeScript and React, it brings character interaction, conversations, task execution and development tools into one application.

[Repository](https://github.com/Serendipity-wu02/Firefly_Agent) · [Issues](https://github.com/Serendipity-wu02/Firefly_Agent/issues) · [Documentation](./docs/README.md) · [Architecture](./docs/architecture/firefly-runtime.md)

## Features

| Area | Current implementation |
| --- | --- |
| Desktop character | Firefly Live2D model, click and double-click expressions, dragging, motion playback and reset. Chat actions use the existing tool and event chain. Twelve task characters have separate portraits and identities; Moments is disabled by default. |
| Chat | Character conversations, model profiles, streamed replies and history. An explicit preferred form of address takes priority over an existing nickname; the default is “开拓者” (Trailblazer). Canonical story events do not automatically become shared experiences with the current user. |
| Work | Tools, file and document processing, Skills, Task/Subagent, approvals and cancellation. Explicitly required file reads need evidence from the current run; budget limits require partial-range confirmation. Task completion and complete reading are reported separately. Finished tasks can be exported to Markdown through a native save dialog. |
| Learn | Learning conversations, materials and notes in an Obsidian workspace, progress tracking and Skills collaboration. Background progress updates depend on the workspace, reply content and service results; not every reply produces an update. |
| Code | Git, LSP, AST, file and command tools, and Code Skills, using the current Agent, tool permissions and approvals. External language servers require their own environment. |
| Skills | Thirty-nine inherited Skills and eight project-maintained built-in Skills: discovery, registration, mode filtering, on-demand body and attachment reading, user overrides, and managed updates with hash recognition, backups and user-edit protection. |
| Plugins | Local installation, lifecycle and isolated panels; a locally buildable SDK, manifest/schema contracts and four examples. No project-hosted online marketplace or published SDK package is promised. |
| Memory / RAG | Original conversations and vector indexes are stored separately, with existing memory and history retrieval paths. Unavailable vector models produce explicit feedback; raw Chat is still saved and failed indexing is not reported as success. |
| Voice / Channels | Existing integrations for GPT-SoVITS, ASR, QQ Music, Feishu, WeChat and QQ. Users configure services, clients, channel credentials and resources. Integration code does not establish complete testing of external services. |

Models, tools, Skills and plugins share the current runtime and permission mechanism. Skill text and portraits do not grant additional tool permissions; existing configuration controls enabled state and allowed modes.

## Current status

The current source tree is Firefly's independently maintained product baseline. Original projects serve as provenance and historical compatibility references; runtime and builds do not need their working directories.

**Verified scope:** independent source builds; Main/Preload/Renderer TypeScript and build checks; isolated Main and Renderer startup; Chat / Work / Learn / Code entry points; registration of 39+8 Skills; malicious and normal ZIP regressions; managed upgrades from a real old Skills archive and user-file protection; targeted automated tests; basic XLSX `find-label` Smoke; and local plugin SDK/example compilation and Mock checks.

**Not fully accepted:** real-model end-to-end execution, deep GUI interaction, complete external Office/LibreOffice/.NET workflows, real-user environments, installer upgrades, cross-platform behavior, the complete TTS / QQ Music approval chain, sustained frame rate, and redistribution permission for every asset required for a public release.

Recorded maintenance issues include process-wide attachment-page deduplication; reading across sessions needs further validation. The original cause of the first empty-history-list incident remains unknown. Read failures being presented as empty lists and subsequent file overwrites have been fixed; successful restarts do not establish the original cause.

Current boundaries are described in the [reliability guide](docs/architecture/firefly-reliability-boundaries.md); historical commands, input hashes and results are available through the [archive index](docs/archive/README.md). Targeted results do not establish a full test-suite pass or completion of every feature. No public installer or automatic update is promised; automatic updates remain disabled.

## Development environment and startup

Requirements are Windows, Node.js `>=24 <25`, and npm `>=10`; the declared package-manager version is npm `11.17.0`. From the repository root:

```powershell
npm ci
npm run dev
```

To start built output:

```powershell
npm run build
npm start
```

`npm start` loads this repository's `dist`; rebuild after source changes. Development and built instances share the production data identity, so quit the current instance normally before opening another.

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

Main and Preload TypeScript checks are included in `build:main` / `build:preload`. `npm test` runs the suite defined by `vitest.config.ts`, not Node script tests, Rust tests, installers or live external-service checks. See [scripts/README.md](./scripts/README.md) for script entry points. Windows Bash integration tests require `FIREFLY_TEST_BASH` to point to an existing Git Bash `bash.exe` using its actual absolute path.

When the distributed Skills snapshot changes, run `npm run prepare:skills` first to synchronize the ZIP, manifest and notices. The screenshot helper needs a Rust/Cargo Windows MSVC toolchain and C++ build prerequisites. Local unpacked preparation is:

```powershell
npm run prepare:skills
npm run package:win:dir
```

This script builds the application and screenshot helper, prepares verified MinGit, and produces a Windows unpacked directory. It does not establish installer acceptance or public release readiness. This work publishes no Release, SDK or installer. Keep user data, model weights, voice resources and test logs out of source and artifacts.

## External-service prerequisites

- **GPT-SoVITS:** prepare and start your own service, then configure its address, reference audio and matching text in TTS settings. Missing configuration is reported explicitly while text replies remain available. The project includes no local voice environment, weights, audio or cache. Real synthesis, playback and stopping remain unverified.
- **QQ Music:** requires a running, accessible desktop session. Status and controls use the existing tool-permission chain; command submission and observed state changes are reported separately. Controls affect current playback; the full application approval chain remains unverified. There is no automatic NetEase fallback.
- **BGE-M3:** requires complete vector-model resources configured by the user. Without them, vector retrieval/writes report unavailable and raw history is retained. The application does not automatically download a model or reuse the main Chat profile as vector configuration. Backfilling historical vectors remains pending.
- **Office and channels:** prepare the Python modules, LibreOffice, .NET, language servers, channel services and permissions required by each actual workflow. Static instructions or a basic Smoke check do not prove every external program works.

## Architecture and directories

The application starts at `src/main/index.ts`, compiled to `dist/main/main/index.js`. Preload provides controlled IPC; React and Live2D render the windows and desktop character. All four modes use the existing Firefly Agent execution chain, with distinct owners for tools, Tasks, approvals and cancellation.

| Path | Responsibility |
| --- | --- |
| `src/main/`, `src/preload/`, `src/renderer/` | Application services, controlled bridge, React interface and Live2D |
| `src/main/orchestrator/` | Firefly Agent orchestration, tool execution, Task/Subagent and permission integration |
| `src/main/skills/`, `skills/` | Skill discovery, registration, reading and project built-ins |
| `vendor/firefly-skills/`, `scripts/packaging/` | Distributed inherited snapshot, provenance/licenses, controlled adaptations and package preparation |
| `src/plugins/`, `packages/plugin-sdk/`, `examples/` | Plugin host, local SDK, schema and development examples |
| `src/shared/` | IPC, data/event contracts and ZIP security boundaries |
| `prompts/`, `assets/` | Layered character prompts, world knowledge and product assets |
| `native/`, `electron-builder.yml` | Native helper source and application packaging configuration |
| `docs/architecture/` | Current responsibilities, entry points and maintenance boundaries; historical records are separated in the documentation index |

See the [runtime architecture](./docs/architecture/firefly-runtime.md) and [maintenance boundaries](./docs/architecture/firefly-maintenance.md) for dependency directions.

## Data and upgrade protection

The default data directory is `%APPDATA%\Firefly`. The technical package name `firefly-agent`, display name `Firefly_Agent`, runtime data identity `Firefly`, and appId `com.serendipitywu02.firefly` have distinct roles; changing the display name does not recreate the data directory.

Settings, model profiles, Chat / Work history, run records and user Skills do not belong in Git or the application package. Quit normally and back up before manual changes, preserving old directories. Do not overwrite an existing destination or simply combine directories. Central migration handles old formats and credential decryption; current data takes priority, conflicts are retained and diagnosed, and read errors do not trigger empty-data writes. Skills updates only modify recognized managed content and preserve user edits and same-name custom files.

## Development workflow

Commit and validate development on `firefly-mini-v1.1.x`, then use a PR to merge into `main`. Run checks appropriate to the change and state what remains unverified. Read the [contribution guide](./.github/CONTRIBUTING.md) and [AGENTS.md](./AGENTS.md). Do not include credentials, private conversations or user data in Issues or PRs.

## Upstream and licensing

Firefly_Agent is independently maintained. Portions of its source originated from Cyrene-Agent and remain subject to the preserved MIT notice. This does not mean all code was written from scratch.

Source licensing is documented in the complete [MIT License](./LICENSE). Third-party Skills, dependencies, Live2D models, portraits, character IP and other assets have their own licenses or permissions; the source MIT license does not automatically grant asset redistribution rights. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md), [MODEL_LICENSE.md](./MODEL_LICENSE.md) and the [contributors record](./docs/CONTRIBUTORS.md) for provenance and boundaries. Public asset redistribution review remains pending.

Firefly and *Honkai: Star Rail* intellectual property belongs to its respective rightsholders. This is an unofficial project.
