# Firefly V1.1.1 — Application Composition Root V1

## Baseline

- Branch: `firefly-v1.1.0`
- HEAD before this round: `30ac278cdf0f7419510ae575737ab0ee44d1d744`
- Product version: `1.1.1`
- The pre-existing legacy-state retirement worktree changes remain in place.
- This round does not restore the retired numeric state services or automatic proactive registration.

The composition-root change is limited to application startup, dependency construction, registration ownership, and shutdown coordination. Provider, tool, SubAgent, Memory, RAG, Settings, Music, TTS, Live2D, and renderer domain implementations remain in their owning modules; the Agent-adjacent Provider, Registry, execution, adapter, and SubAgent files now use the canonical `src/main/orchestrator/` locations documented in the directory realignment record.

## Production call graph

```text
src/main/index.ts
  -> app.whenReady()
  -> FireflyApplication.start()
  -> createDefaultApplicationRuntime({ isDev })
  -> DefaultApplicationRuntime.start(signal)
       -> knowledgeCoordinator.initialize()
       -> registerTools()
       -> registerMusicIpc()
       -> registerMusicPreferenceSignalAdapter()
       -> musicContextService.start()
       -> musicService.start()
       -> registerChatIpc(agentCore, ...)
       -> createTray(...)
       -> registerAssetsProtocol()
       -> registerWindowAndSettingsIpc(...)
       -> registerApprovalIpc(...)
       -> registerTtsIpc(...)
       -> windowManager.createPetWindow()
```

The Electron entry point owns only the process lifecycle listeners:

- `protocol.registerSchemesAsPrivileged(...)` is registered before readiness.
- `app.whenReady()` starts the application object.
- `activate` delegates to the application runtime.
- `before-quit` prevents a second quit path, awaits application cleanup, then quits.
- `window-all-closed` uses the application-owned tray state before deciding whether to quit.

The application object in `src/main/application/application.ts` owns the lifecycle phase and startup cancellation signal. It does not construct domain services or resolve services through a global locator.

## Construction ownership

`src/main/application/default-dependencies.ts` is the only current composition location for the existing application graph. It constructs and wires:

- `WindowManager`
- `FireflyMemoryService`
- `SettingsManager`
- `ApprovalService`
- the current global tool registrations and the Music tools
- `MusicService`, `MusicContextService`, and `MusicPreferenceService`
- capability, Sandbox, permission, approval, and authorized invocation services
- `KnowledgeCoordinator`, `MemorySlot`, `RagSlot`, and `ContextManager`
- `ToolExecutionEngine`, `HarnessAuthorizationAdapter`, and `FireflyAgentCore`
- `SubAgentRegistry`, `SubAgentTaskService`, `SubAgentWorkerRuntime`, and `MainAgentDelegationService`

The same `SettingsManager`, `MemorySlot`/Memory service, `ContextManager`, `FireflyAgentCore`, authorization pipeline, Worker runtime, and Main Delegation service are passed through the existing dependency graph. Settings provider changes still call `dependencies.agentCore.setProvider?.(...)` on that same AgentCore instance.

The Worker runtime retains its guarded reference to the same AgentCore. It is not a second Harness or execution loop. The existing tool registry remains the shared registry. During composition, `createApplicationToolRegistration()` registers the constructed tools exactly once, and `registerApplicationToolBindings()` resolves the capability bindings only after those registrations are present. The returned restore boundary is used for assembly failure, runtime startup failure, and shutdown so application-owned registrations do not remain behind.

## Registration and release ownership

| Resource | Registering owner | Release boundary |
| --- | --- | --- |
| Application tool definitions and Music tools | `createApplicationToolRegistration()` and `registerApplicationToolBindings()` in `tool-binding-assembly.ts` | The application-owned registration scope restores the previous entries on assembly failure or `DefaultApplicationRuntime.stop()`. |
| Window, pet, startup, settings, provider, and interaction IPC | `registerWindowAndSettingsIpc()` in `default-dependencies.ts` | Its returned disposer removes only the handlers/listeners installed by that call. |
| Chat IPC | `registerChatIpc()` in `chat-ipc.ts` | Its returned disposer removes `IPC.CHAT_SEND_MESSAGE`. |
| Music IPC and state subscription | `registerMusicIpc()` in `music-ipc.ts` | Its returned disposer unsubscribes state and removes the Music handlers. |
| Approval IPC | `registerApprovalIpc()` in `approval-ipc.ts` | `ApprovalIpcRegistration.dispose()` disposes the coordinator and removes Approval handlers. |
| Approval change listener | `DefaultApplicationRuntime` | The exact `ApprovalService.onChanged()` disposer is retained and called once. |
| TTS IPC, TTS session, playback ownership listener | `registerTtsIpc()` in `tts-ipc.ts` | `TtsIpcRegistration.dispose()` cancels sessions, removes its exact app/IPC listeners and handlers. |
| `assets://` protocol | `registerAssetsProtocol()` in `default-dependencies.ts` | The returned disposer unregisters only the `assets` protocol registered by the application. |
| Tray | `DefaultApplicationRuntime` | The runtime destroys its own tray once. |
| Agent and Worker in-flight work | `DefaultApplicationRuntime.stop()` | Calls the existing `cancelAll()` owners before awaiting other shutdown. |
| Music context and service | `DefaultApplicationRuntime` | Calls `dispose()` and then awaits `shutdown()`. |
| Memory persistence | `DefaultApplicationRuntime` | Calls the existing Memory save operation during cleanup. |

No cleanup path calls `removeAllListeners()`. Cleanup is idempotent at both the application and runtime layers. A failed registration is cleaned by the registration function when that function has already installed part of its own boundary; runtime cleanup then releases every successfully retained disposer.

## Startup and shutdown behavior

`FireflyApplication` transitions through `idle`, `starting`, `running`, `stopping`, `stopped`, and `failed`.

- A second start while starting or running shares the existing start promise and cannot create a second runtime.
- A stop request aborts the startup `AbortController` and waits for the in-flight start to settle before final cleanup.
- If a factory or runtime starts successfully and then observes the aborted signal, the late result is rejected and the runtime is stopped before the application can become `running`.
- Startup failure stops the partially initialized runtime and records the failed phase; it does not retry automatically.
- Normal stop first prevents new work through the existing Agent, Worker, and TTS cancellation owners, then releases registrations and services.
- Repeated stop requests share the same stop promise or return after the stopped phase; release operations are not repeated.
- Domain listener removal uses the exact listener references owned by this application. External listeners on the same event source are not globally removed.

The application assembles and registers the tool definitions before capability binding. `CapabilityBindingResolver` and `ToolExecutionEngine` receive the same `globalToolRegistry`. Runtime startup then awaits `KnowledgeCoordinator.initialize()`, starts domain services, and registers IPC before any business request can arrive. No new background timer or lifecycle service is introduced.

The existing `ELECTRON_SMOKE_TEST=1` path remains in the runtime. It starts only the pre-existing 2.5-second smoke verification timer after the Pet window is created, and the runtime clears that timer during cleanup.

## Extracted from the former index

The former `src/main/index.ts` contained service construction, all ready-time startup work, window/settings IPC, the assets protocol, and shutdown cleanup. These responsibilities now live in:

- `application.ts`: lifecycle state, startup cancellation, failure handling, activation delegation, and exit coordination.
- `default-dependencies.ts`: concrete service graph construction, IPC/protocol registration, cross-module callbacks, and runtime cleanup.
- Existing domain modules: the implementation and ownership of Chat, Music, TTS, Approval, authorization, Memory/RAG, tools, Character, WindowManager, and the Worker/Harness path.

The entry point was not copied wholesale into a single replacement file. Domain behavior remains owned by its original module.

## Retired paths kept disconnected

The current entry point does not construct or register:

- `CharacterStateManager` or the retired numeric state service;
- `STATE_GET`, `STATE_CHANGED`, or `CARE_ACTION` handlers;
- the retired automatic proactive `setInterval` producer;
- a second Agent, Harness, ContextManager, Memory owner, permission owner, or event bus.

The retained proactive module remains disconnected from application startup because the current product baseline has no approved automatic proactive trigger source. Its existing lifecycle and execution-boundary code is not re-registered by this round.

## Verification record

The new TypeScript test at `tools/test/core/application.test.ts` exercises:

1. duplicate start coalescing;
2. startup failure cleanup and no restart after failure;
3. stop during startup, late-result invalidation, and exactly-once runtime cleanup;
4. composition-root source ownership and retired producer non-restoration.

The TypeScript test at `tools/test/core/application-composition.test.ts` exercises the real tool registry, capability binding resolver, Music tool definitions, and ToolExecutionEngine boundary. It verifies registration-before-binding, both Music bindings, shared Registry execution, idempotent registration, explicit missing-tool failure, and restoration when later assembly fails. The default test command includes this test.

The default `npm test` command includes this test. Existing source-contract tests that inspect the former composition location now read the actual registration owner in `default-dependencies.ts`; ordinary renderer and domain ownership assertions remain unchanged.

GUI/manual acceptance is not part of this round and must be reported separately from automated validation.

## Current domain directory state

The later fourth directory round relocated the existing lifecycle-only
Proactive module to `src/main/proactive/`, Music services and the QQMusic
bridge to `src/main/music/`, and TTS runtime ownership to `src/main/tts/`.
The composition root still constructs the same service instances and retains
the same registration/disposer boundaries; no automatic Proactive source was
registered.

## Validation result

- `npm run typecheck`: PASS
- `npm run build`: PASS. Vite retains its existing external Cubism script and large-chunk warnings; neither is a build failure.
- `node --experimental-strip-types tools/test/core/application.test.ts`: PASS, 4 tests.
- `npm test --silent`: PASS, including the new application lifecycle test and existing domain regressions.
- `npm run verify:typescript`: PASS. The only source JavaScript exceptions remain the reviewed CLI launcher and Cubism runtime.
- `npm run verify:architecture`: PASS.
- `git diff --check`: PASS. Git emitted only the existing line-ending normalization warnings.
- GUI/manual acceptance: NOT RUN.

## Composition-root startup-order repair

The previous built runtime failed during composition because capability binding
ran before the application-owned tools had been registered. The repaired order
is now:

1. Construct the domain services and tool definitions.
2. Register those definitions once into the existing `globalToolRegistry`.
3. Resolve the `music.status.read` and `music.control` bindings against that
   same Registry.
4. Complete the remaining Agent, Worker, authorization, context, and runtime
   assembly.
5. Start domain services and register IPC before opening business requests.

`DefaultApplicationRuntime.start()` no longer registers the tools. The
registration scope is restored on binding/assembly failure and by runtime stop;
it is idempotent and does not create a second Registry. A missing required tool
still raises the existing `TOOL_NOT_FOUND` binding error.

The new `tools/test/core/application-composition.test.ts` uses the real Music
tool definitions, `FireflyToolRegistry`, `CapabilityBindingResolver`, and
`ToolExecutionEngine`. It verifies the order boundary, both Music bindings,
shared Registry execution, repeated registration protection, explicit missing
tool failure, and cleanup after later initialization failure.

This repair was validated with:

- `npm run typecheck`: PASS, including `tools/npm/npm.mts` through
  `tsconfig.tools.json`.
- `npm run build`: PASS.
- Composition test: PASS, 4/4.
- `npm test`: PASS.
- `npm run verify:typescript`: PASS.
- `npm run verify:architecture`: PASS.
- `git diff --check`: PASS; only the repository's existing line-ending
  normalization warnings were reported.

Real startup command:

```text
node --experimental-strip-types tools/npm/npm.mts run start
```

The built application started successfully after the repair. The main process
reported the Pet window as ready-to-show, the main window title was
`Firefly Agent - Desktop Pet`, and the renderer asset protocol resolved the
Live2D model resources with `exists: true`. The application was left running
for the separate GUI acceptance. Chat, Settings, ordinary Chat, permissions,
QQMusic, TTS, cancellation, and restart acceptance remain unexecuted.
