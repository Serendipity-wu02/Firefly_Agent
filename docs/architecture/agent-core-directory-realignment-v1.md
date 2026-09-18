# Firefly V1.1.1 — Agent Core Directory Realignment V1

## Baseline and scope

- Branch: `firefly-v1.1.0`
- Baseline HEAD: `30ac278cdf0f7419510ae575737ab0ee44d1d744`
- Product version: `1.1.1`
- The worktree already contained the application-composition and legacy-state changes. They remain in place.
- This round changes directory ownership and import paths only. It does not add an Agent loop, a tool executor, a Worker, a provider, a capability, or a new product behavior.

The migration table matched the actual source inventory before the move. All listed source files existed at the specified old locations and had active consumers. No alternate source path was substituted.

## Actual old path to canonical path

| Old source location | Canonical location | Scope |
| --- | --- | --- |
| `src/main/llm/providers/` | `src/main/orchestrator/providers/` | Provider factory, provider implementations, provider contracts, SSE parser |
| `src/main/tools/tool-registry.ts` | `src/main/orchestrator/tools/registry/tool-registry.ts` | The single `FireflyToolRegistry` and `globalToolRegistry` |
| `src/main/tools/tool-dispatcher.ts` | `src/main/orchestrator/tools/registry/tool-dispatcher.ts` | Registry-backed dispatch only |
| `src/main/runtime/execution/` | `src/main/orchestrator/tools/execution/` | `ToolExecutionEngine`, policy, batching, context, and result policy |
| `src/main/tools/music-tools.ts` | `src/main/orchestrator/tools/adapters/music-tools.ts` | Music domain tool adapters |
| `src/main/tools/play-live2d-action.ts` | `src/main/orchestrator/tools/adapters/play-live2d-action.ts` | Live2D action adapter; presentation ownership remains outside this module |
| `src/main/runtime/subagents/` | `src/main/orchestrator/subagents/` | Main delegation, task service, registry, Worker runtime, and errors |

The protected directories under `src/main/runtime/authorization/`, `capabilities/`, `sandbox/`, and `approval/` were not moved. Harness, Context, Planning, Recovery, Memory, RAG, Settings, Music, and TTS ownership was not moved.

## Production import and ownership graph

```text
default-dependencies.ts
  ├─ orchestrator/providers/provider-factory
  ├─ orchestrator/tools/registry/globalToolRegistry
  ├─ orchestrator/tools/adapters/*
  ├─ orchestrator/tools/execution/ToolExecutionEngine
  └─ orchestrator/subagents/*

FireflyAgentCore
  -> FireflyHarness
  -> ToolExecutionEngine
  -> FireflyToolDispatcher
  -> the same FireflyToolRegistry instance

AuthorizedInvocationBridge
  -> the canonical ToolExecutionEngine and ToolRegistry types

MainAgentDelegationService
  -> SubAgentTaskService
  -> SubAgentWorkerRuntime
  -> the existing IAgentCore/Harness path
```

The move preserved the existing construction in `src/main/application/default-dependencies.ts`. `FireflyHarness` remains the only Agent loop. `ToolExecutionEngine` remains the only tool execution owner. `FireflyToolRegistry` remains the shared registry; no replacement registry was constructed. Worker execution continues to call the existing AgentCore and does not create a second Harness or loop.

The two music authorization paths remain registered and consumed through the existing owners:

- `music.status.read` → `music_status`;
- `music.control` → `music_control`.

The adapter move does not change `MusicService` ownership or QQ Music target enforcement. The Live2D adapter still sends the existing IPC action through the existing interface. Proactive production registration remains disconnected, and the proactive no-tool boundary is unchanged.

## Consumers updated

Production consumers updated in this round:

- `src/main/application/default-dependencies.ts` — provider, registry, adapter, execution, and SubAgent construction imports;
- `src/main/orchestrator/firefly-agent-core.ts` — provider, registry, execution, policy, and delegation imports;
- `src/main/orchestrator/harness/firefly-harness.ts` — provider, registry, execution, policy, and delegation imports;
- `src/main/orchestrator/harness/tool-round.ts` — execution and delegation contracts;
- `src/main/orchestrator/recovery/execution-state.ts` — `ToolState` contract;
- `src/main/runtime/capabilities/capability-binding-resolver.ts` — registry type;
- `src/main/runtime/authorization/authorized-invocation-bridge.ts` — registry, execution engine, and execution-context contracts.

Moved modules were updated only for their new relative depth. Their exported symbols and call behavior were preserved.

## Tests, guards, and generated output

The first-party tests that imported moved `dist` entries were renamed from `.mjs` to `.ts`, their canonical `dist/main/main/orchestrator/...` imports were updated, and the default `npm test` command runs them with `node --experimental-strip-types`. No test coverage was removed. Tests that inspect source directories now inspect the canonical locations. The later Memory/RAG/Settings realignment adds the repository-wide strict `tsconfig.test.json` check and records its scope in `docs/architecture/memory-rag-settings-realignment-v1.md`.

`tools/verify/verify-architecture.mts` now:

- scans `src/main/orchestrator/subagents/`;
- asserts the canonical class paths for the Registry, Execution, and SubAgent owners;
- explicitly verifies every moved TypeScript source file exists and is included in the scan;
- rejects every old moved source file;
- preserves the authorization bridge exception for the canonical execution/registry dependency while retaining the authorization boundary checks.

The build generated the new output under `dist/main/main/orchestrator/`. The stale generated files under these exact old output roots were removed after the build:

- `dist/main/main/llm/providers/`;
- `dist/main/main/runtime/execution/`;
- `dist/main/main/runtime/subagents/`;
- the eight files directly under `dist/main/main/tools/` belonging to the moved registry, dispatcher, and adapters (JavaScript and source maps).

No other `dist` output, model resource, user data, or runtime resource was cleaned.

## Validation record

- `npm run typecheck`: PASS.
- `npm run build`: PASS. Existing Vite warnings for the external Cubism script and large chunks remain warnings only.
- Targeted Agent, tool, SubAgent, delegation, music, authorization, and integration tests: PASS after source-directory assertions were updated to the canonical paths.
- `npm run verify:typescript`: PASS. The production TypeScript guard reports only the two approved non-TypeScript assets under `src/`.
- `npm run verify:architecture`: PASS after the canonical path checks were added.
- `git diff --check`: PASS. Git emitted existing LF-to-CRLF conversion warnings only; no whitespace errors were reported.
- Full `npm test`: PASS, including distribution, core, moved Agent-adjacent modules, authorization, Worker/Main Delegation, music, memory/RAG, character, Live2D, presentation, and the new directory realignment contract.
- GUI/manual acceptance: NOT RUN; this directory round does not provide GUI acceptance evidence.

The repository production typecheck covers the configured `src/` TypeScript projects. Migrated first-party tests are executed as TypeScript through the default `npm test` command with Node's `--experimental-strip-types`; the current default `npm run typecheck` additionally runs `npm run typecheck:tests` from `tsconfig.test.json`.

No commit or push was performed.

## Current follow-on directory state

The later fourth directory round moved the lifecycle-only Proactive module to
`src/main/proactive/`, Music services and the QQMusic bridge to
`src/main/music/`, and the TTS session/dispatcher/engine/cache modules to
`src/main/tts/`. The Agent-adjacent ownership documented above is unchanged:
Music adapters remain under `src/main/orchestrator/tools/adapters/`, and no
new execution owner or automatic Proactive registration was introduced.
