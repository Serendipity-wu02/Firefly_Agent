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
`src/main/runtime/music/qqmusic-desktop-bridge.ts`. It uses Windows System
Media Transport Controls (GSMTC) through
`src/main/runtime/music/scripts/qqmusic_gsmtc.ps1`.

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
`FULL_ACCESS`. `READ_ONLY` rejects it before Approval. Capability, Sandbox,
and the existing Approval lifecycle remain the only authorization chain.

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

The focused capability test covers route registration, fixed QQMusic target,
the five authorized actions, approval profiles, denial, cancellation, stale
correlation, duplicate dispatch, same-round barrier, player absence without
MPV fallback, and the absence of a second desktop control path.
