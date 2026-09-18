# Firefly V1.1.1 — Legacy State Retirement & TypeScript Convergence V1

## Baseline

- Repository: `E:\Codex\working\Firefly-Pet`
- Branch: `firefly-v1.1.0`
- HEAD before this round: `30ac278cdf0f7419510ae575737ab0ee44d1d744`
- Product version: `1.1.1`
- Reference repository commit read: `a435a7788360763796a319ecae118ef53a5170a8`

The worktree was clean before this round. No previous Proactive Policy,
Accounting, or System Lifecycle implementation was restored.

## Reference approach and Firefly adoption

| Reference approach at `a435a7788360763796a319ecae118ef53a5170a8` | Firefly current entrance | Adopted in this round |
| --- | --- | --- |
| `src/main/application/application.ts` separates composition and lifecycle stages | `src/main/index.ts` is the existing Electron composition root | Keep one composition root; remove retired state/proactive registrations from it without introducing a second application root |
| `src/main/application/default-dependencies.ts` owns construction wiring | `src/main/index.ts` constructs Settings, Memory, Context, Harness, permissions, music and workers | Preserve existing single owners and only remove obsolete state wiring |
| `src/main/orchestrator/runtime-state-service.ts` stores semantic runtime state | Firefly `CharacterPolicyEngine` and `SemanticStateInterpreter` already produce semantic state from the request | Use semantic Character state in prompt projection; do not add a second runtime state service |
| `src/main/channels/proactive-delivery.ts` returns a structured delivery result | Firefly retains `PET_PROACTIVE_LINE` as a renderer consumer contract | Keep the existing channel consumer and lifecycle execution boundary; no automatic producer or ACK claim is added |

The reference repository was read from the exact commit above. Firefly did not
copy its directory layout, memory system, model path, permissions, or event
bus.

## Production relationship after this round

```text
Electron main/index.ts
  ├─ SettingsManager ── settings, permissions, TTS, window configuration
  ├─ FireflyMemoryService ── Memory/RAG read and approved write paths
  ├─ ContextManager ── SystemPromptSlot / semantic Character state / Memory / RAG
  ├─ FireflyAgentCore → FireflyHarness ── one Agent execution path
  ├─ Capability / Sandbox / Approval ── existing tool authorization chain
  ├─ music-status-worker-v1 ── isolated worker capability
  └─ CharacterPolicyEngine ── PET_INTERACTION → EmbodimentPlan

Chat IPC → CharacterPolicyEngine → AgentCore → ContextManager → Harness
PET_INTERACTION → CharacterPolicyEngine → existing Live2D/summary presentation
renderer → PET_PROACTIVE_LINE consumer only
```

The old numeric Character state owner no longer participates in this graph.
Semantic emotion, cognitive context, mode, Persona, relationship, Memory/RAG
and request context remain available through the existing Character and
ContextManager path.

## Retired entry → replacement → disconnect evidence → remaining use

| Retired entry | Replacement | Disconnect evidence | Remaining use |
| --- | --- | --- | --- |
| `src/shared/firefly-state.ts` (`CharacterStateData`, `CareActionType`) | Semantic types under `src/main/character/` and existing interaction types | File removed; no production import remains; `AgentRunInput` no longer has `characterState` | None |
| `src/main/state/character-state.ts` | `SemanticStateInterpreter` and `CharacterPolicyEngine` | File removed; no decay, care, offline-time or numeric action consumer remains | None |
| `src/main/state/state-manager.ts` | `SettingsManager` continues to own settings; `CharacterPolicyEngine` owns interaction interpretation | File removed; main no longer constructs or disposes it; no timer or state broadcast remains | None |
| `IPC.STATE_GET`, `IPC.STATE_UPDATE`, `IPC.STATE_CHANGED`, `IPC.CARE_ACTION` | No replacement IPC; `PET_INTERACTION` remains the interaction contract | Removed from shared IPC and preload; no `ipcMain.handle` registration remains | None |
| `window.characterState` | `window.firefly.interact("click" | "touch")` and existing movement/drag APIs | Context bridge and `electron.d.ts` declaration removed | None |
| Chat `legacyState` / `AgentRunInput.characterState` | Semantic request-driven Character interpretation | Removed from `chat-ipc.ts`, shared Agent input, Context projection and Harness forwarding | None |
| Numeric prompt baseline | `SemanticInnerState` prompt section and `characterStateTokens` budget metric | `CharacterPolicyEngine.buildStateString()` formats only semantic state; `状态基线（兼容）` is gone | `characterStateTokens` remains the semantic state slot budget measurement |
| `FIREFLY_ACTIONS` care/stat actions: `eating`, `resting`, `treatment`, `hungry`, `tired`, `attention`, `ignored` | Existing interaction and semantic presentation actions | Entries removed from the shared action catalog and therefore from LLM/tool action descriptions | `sick` remains only for semantic self-entropy presentation in `EmbodimentAdapter`; it is not a numeric health state |
| Old automatic `FireflyProactiveScheduler` timer and numeric trigger selection | No current automatic proactive source | Main no longer instantiates/registers the scheduler; scheduler has no timer, `checkAndTrigger`, state manager, old trigger vocabulary, or manual IPC/UI entry | Lifecycle-only `execute()` boundary preserves cancellation, stale-result isolation and `MAIN + toolSurface:none` for a future approved source; `PET_PROACTIVE_LINE` remains renderer consumption |
| Example `character` defaults | No example numeric state | `src/settings/settings.example.json` no longer declares `character`; SettingsManager is not changed to clear user files | Existing user settings may retain unused legacy fields; they are not read or rewritten by a Character state service |

Cancellation and late-result isolation remain inside the lifecycle-only
proactive boundary. A current product trigger is intentionally absent, so no
45-second polling loop or replacement scene was introduced.

## TypeScript convergence

The following tests were migrated to TypeScript and are the only active copies
in the default test command:

- `tools/test/core/context.test.ts`
- `tools/test/character/persona-policy.test.ts`
- `tools/test/character/embodiment.test.ts`
- `tools/test/presentation/desktop-pet.test.ts`
- `tools/test/presentation/legacy-state-retirement.test.ts`

Node 24 executes these tests through `node --experimental-strip-types`. The
old `.mjs` copies were removed from the test tree and from `package.json`.
Production code remains TypeScript; no unrelated third-party JavaScript was
migrated.

## Scope retained and deferred

Retained:

- version `1.1.1` and branch baseline;
- one Harness, ContextManager, ToolExecutionEngine, permission and approval owners;
- four permission profiles and Main Delegation;
- one `music-status-worker-v1` with its existing isolation;
- Persona, relationship, semantic Character mode (`daily` / `work`), Memory/RAG and context budget accounting;
- click, touch, drag and existing renderer presentation contracts;
- TTS, Live2D, MouthSync, panel UI and Chat radius `16px` unchanged.

Deferred and not implemented here:

- new automatic proactive sources or proactive policy;
- global cooling, Chat quiet periods, unanswered-message policy and system lifecycle policy;
- lock/suspend/resume handling;
- selective Music Projection, Memory/RAG enhancements, Browser/files/process/desktop capabilities;
- SubAgent expansion and Chat/Work/Code product modes;
- TTS, Live2D, MouthSync and panel UI changes.

## Verification record

The final command results for this round are recorded in the task response.
The TypeScript retirement test asserts the removed production paths, preserved
interaction path, semantic prompt boundary, inactive proactive producer, and
the migrated test entry points. GUI acceptance remains separate from these
automated checks.
