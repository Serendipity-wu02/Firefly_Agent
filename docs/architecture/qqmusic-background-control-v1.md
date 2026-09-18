# Firefly V1.1.1 — QQ Music Background Control Capability V1

## Scope

This round migrates exactly one additional capability:

```text
music.control -> music_control
```

The capability controls an already running QQ Music desktop media session.
It does not search, resolve, download, or start a track. `music_search`,
`music_recommend`, and `music_play` remain outside this authorization route.

## Existing execution authority

The one production desktop authority is
`src/main/music/qqmusic-desktop-bridge.ts`. It uses Windows System
Media Transport Controls (GSMTC) through
`src/main/music/scripts/qqmusic_gsmtc.ps1`.

The script selects the first media session whose source identity is an exact,
case-insensitive match for the observed canonical QQ Music ID:

```powershell
$canonicalQqMusicSessionId = "QQMusic.exe"
$sessions | Where-Object {
  ([string]$_.SourceAppUserModelId) -ieq $canonicalQqMusicSessionId
}
```

The TypeScript bridge also rejects a reported media session unless its
`appId` is a case-insensitive exact match for `QQMusic.exe`. This is defense in
depth for the same target identity, not a second player selector.

The route does not accept an arbitrary application ID, does not activate a
window, and does not use foreground, mouse, keyboard, or renderer automation.
The bridge is reused; no second desktop controller or executor was added.

The bridge action names are:

```text
play | pause | toggle | next | prev
```

The authorized public action names are:

```text
play | pause | next | previous | toggle
```

`previous` maps to the existing bridge action `prev`. The authorized path
calls `MusicService.controlQQMusic()` and never falls back to MPV or the local
playback queue. If no matching QQ Music GSMTC session exists, the result is a
player-not-found failure and no alternate player is started.

## Authorization boundary

The composition root registers:

| Item | Value |
| --- | --- |
| Capability | `music.control` |
| Tool binding | `music.control -> music_control` |
| Sandbox kind | `desktop` |
| Sandbox target | `QQMusic` |
| Approval requirement | `required` |
| Tool safety level | `confirm_required` |
| Side effect | `external_action` |
| Retryable | `false` |
| Tool timeout | 5 seconds |

The same canonical `HarnessAuthorizationAdapter` route table handles
`music_status` and `music_control`. It does not create a second authorization
pipeline, approval service, sandbox evaluator, or execution engine.

The requested action is included in the approval summary using a fixed label
map. The adapter receives no secrets and the route scope contains only the
fixed desktop target `QQMusic`.

The current four-scheme resolver applies the declared Approval requirement to
this side-effect capability for `RESTRICTED_SCOPE`, `ASK_EVERY_TIME`, and
`FULL_ACCESS`. `READ_ONLY` rejects it before Approval. Under `FULL_ACCESS`,
the first approved request may create an in-memory, process-scoped grant only
for this exact capability, `music_control` tool, QQMusic Sandbox profile, and
desktop scope. Each later control still creates and consumes a distinct
capability request and `AuthorizedCapabilityInvocation`; the process grant is
not a bypass for Capability, Sandbox, current permission checks, or the
ToolExecutionEngine. Leaving `FULL_ACCESS` clears these process grants, and
they are never persisted across an application restart.

## Execution and cancellation contract

After approval, `AuthorizedInvocationBridge` is the only hand-off into the
existing `ToolExecutionEngine`. The engine owns timeout, cancellation,
dispatch, and result policy. `music_control` is non-retryable because a
transport command can have reached an external player before a cancellation
signal is observed.

Cancellation is reported honestly as `CANCELLED`; it does not claim that an
external command was rolled back. The same-round approval barrier remains in
force: calls after a pending approval are deferred and are not executed in that
round. Duplicate authorized invocations and stale correlation metadata remain
rejected by the existing bridge.

The generic, non-authorized `music_control` behavior remains available to its
legacy callers. Only an upstream authorization context with capability
`music.control`, tool `music_control`, and desktop target `QQMusic` selects the
new fixed QQ Music action set. Any other upstream context is rejected as a
target mismatch.

## Repeated controls and result truthfulness

An explicit transport request is classified in Main by
`src/main/orchestrator/tools/music-control-intent.ts`. Discussion, quotation,
questions, instructions, conditional wording, and negative wording are not
classified as control requests. Renderer does not infer control intent and
Chat IPC does not call the player directly.

Each accepted control request creates a new typed `requiredToolExecution`
requirement for the same `FireflyHarness` run. The requirement contains the
exact `music_control` tool name and action. Harness exposes only that tool for
the bounded control step. If the first model response omits the required call,
Harness performs at most one correction in the same run and sends an explicit
provider `tool_choice`. A matching call is marked as observed before
authorization or external execution, so duplicate model callbacks and an
unknown or timed-out submission cannot issue the same transport command a
second time.

Every independent request receives its own run and authorization decision.
For the `FULL_ACCESS` music-control rule, the first approval is a process-scoped
authorization decision, while every later request still receives a new
one-time execution authorization. Other capabilities and permission profiles
retain their existing one-time approval behavior. A prior tool result, restored
Chat message, or model claim is not evidence for a later request.

The visible result is derived from current-run structured evidence, not from
assistant wording. A successful result requires the current `runId`, the exact
tool and action, an executed tool outcome, and a canonical result containing
`ok: true`, the same action and target, and `commandSubmission: "accepted"`.
`toolCalled`, Approval permission, and model prose are insufficient.

An imperative request without a direction, such as `切换歌曲`, is not mapped
to `next` or `previous`. Main answers with a direction clarification before
Agent execution, so an unconstrained model reply cannot claim a control that
did not run.

QQ Music control now reports two separate facts:

| Field | Meaning |
| --- | --- |
| `commandSubmission` | Whether the GSMTC command call was accepted, rejected, not submitted, or has an unknown submission state |
| `playerStateObservation` | `changed`, `unchanged`, `failed`, or `not_observed` after one bounded state read |
| `observedState` | The QQMusic playback state and current track returned by that read when the session remains available |

After a successful command, the bridge waits the existing bounded 300 ms
settling delay for `next`/`prev` and performs one existing GSMTC `get-state`
read; the other transport actions perform the same read immediately after the
command. The executor's existing 4-second bound remains the read boundary.
No control command is retried. `changed` is reported only when the relevant
track or playback state differs from the pre-command snapshot. A successful
command with no observed difference remains a submission fact, not a claim of
successfully changing the player. A failed read is returned as `failed` and
the Chat reply explicitly says that the command was not repeated. Rejection,
denial, cancellation, expiration, zero tool calls, and mismatched tool calls
report non-completion. Timeout or an unknown external result explicitly
remains unknown and is never automatically replayed.

## Native smoke result

The local GSMTC script was run from a normal PowerShell environment while QQ
Music was playing. The observed source identity was:

```text
QQMusic.exe
```

The observed initial track was `あいつら全員同窓会 (那些家伙们的校友会)` and
the initial playback state was `Playing`. One `pause` command changed the
state to `Paused`; one `play` command restored `Playing`. One `next` command
changed the track to `名前のない怪物 (无名怪物)`, and one `prev` command restored
the original track.

The foreground probe reported the same `explorer` window handle and process
before and after the controls. The control path did not intentionally focus or
activate QQ Music. Native desktop smoke is **PASS**.

The negative identity test accepts `QQMusic.exe` and `qqmusic.EXE`, and rejects
`QQMusic.exe.preview`, `QQMusic`, `MPV`, and `Spotify.exe`. When no matching
session exists, the bridge preserves `QQ_MUSIC_SESSION_NOT_FOUND` and does not
fall back to MPV or launch another player.

## Deliberately unchanged

- `music_search` remains blocked because the local `QQMusicProvider` has no
  concrete search endpoint or network contract.
- TTS, Live2D, Chat radius, Character, Memory/RAG, and Pet speech-panel work
  were not changed by this capability round.
- No Firefly cache, seed, cut method, model, reference audio, or playback
  implementation was changed.

## Verification

The focused capability and truthfulness tests cover route registration, fixed QQMusic target,
the five authorized actions, approval profiles, denial, cancellation, stale
correlation, duplicate dispatch, same-round barrier, player absence without
MPV fallback, the absence of a second desktop control path, three sequential
independent controls, bounded zero-call correction, provider `tool_choice`,
current-run evidence grounding, Chat history isolation, and no replay after an
unknown or timed-out command submission.
