# Music Context Event Model V1

## Scope

`MusicContextService` is the sole owner of the latest passive music observation. V1 is ephemeral runtime context only. It neither executes player commands nor authorizes a capability, writes Memory or RAG, calls an LLM, triggers TTS or Live2D, or initiates proactive chat. The downstream `MusicPreferenceService` now consumes selected typed events, but that separate domain owner does not change this service's observation-only responsibilities.

The validated V1 source is the QQ Music Windows GSMTC session:

- `source`: `QQMUSIC_DESKTOP`
- `playerId`: `QQMusic.exe`
- target identity: case-insensitive exact match of `SourceAppUserModelId`
- `sessionId`: omitted because the current GSMTC bridge does not expose a separate stable session identifier

The source identity is intentionally separate from Character meaning. Observation records facts; it never infers that the user likes, dislikes, or prefers an artist or track.

## Canonical flow

```text
QQMusic GSMTC observation
  -> QQMusicDesktopBridge (existing 1000 ms polling owner)
  -> MusicContextService
  -> typed MusicContextSnapshot and AgentEventBus events
  -> ContextManager MusicContextSlot
  -> Main Firefly transient runtime context
```

No second timer is introduced. `MusicContextService` subscribes to the existing bridge state stream, starts once during main-process composition, and removes its listener once during application shutdown. Its state is never persisted across a process restart.

The one-second interval remains owned by `QQMusicDesktopBridge`; it is the current value because the bridge already owns player availability, metadata, and playback observation. The context layer only consumes that established stream.

## Snapshot contract

Shared contract: `src/shared/music-context-types.ts`.

```ts
MusicContextSnapshot {
  source: string
  playerId: string
  sessionId?: string
  playbackState: "PLAYING" | "PAUSED" | "STOPPED" | "UNKNOWN"
  track?: { title: string; artist: string; album?: string }
  observedAt: number
}
```

`observedAt` is the runtime read time in epoch milliseconds. It is not a track start time, release time, or user-intent time. Snapshots and nested track metadata are frozen before exposure. V1 retains only player identity, playback state, title, artist, album when present, and observation time. It excludes lyrics, artwork blobs, account information, filesystem paths, cookies, tokens, and listening history.

## Events and deduplication

`AgentEventBus` remains the single runtime event transport. `MusicContextService` owns the snapshot; the bus does not own music state.

| Event | Meaning |
| --- | --- |
| `music.context.available` | A QQ Music session became available. |
| `music.track.changed` | Normalized title, artist, or album changed while a session remained available. |
| `music.playback.changed` | Playback state changed while a session remained available. |
| `music.context.unavailable` | A previously available QQ Music session disappeared. |

Every event carries `source`, `playerId`, `observedAt`, the current snapshot, and the previous snapshot where meaningful. A semantic comparison deliberately ignores polling position and `observedAt`, so unchanged polls update the latest observation time without sending events. Track identity uses normalized title, artist, and album because GSMTC currently provides no stronger stable track identifier. When both a track and playback state change in one observation, event order is track, then playback.

A playback-only transition does not create a track event. A session appearance or disappearance emits only its availability event. The QQ Music bridge rejects every non-exact `QQMusic.exe` media session before this service sees metadata.

## Main Firefly context seam

The composition root registers `MusicContextSlot` with the existing `ContextManager`. Main Firefly can read `getMusicContextSnapshot()` from that canonical context manager. The slot renders an empty string, so music facts are not injected into every LLM turn. A later task may define selective prompt projection when a task explicitly needs the transient fact.

`music_status` remains the explicit authorized, on-demand capability. Passive observation is not routed through `ToolExecutionEngine`; it only consumes the already-running local bridge stream. The two paths have distinct privacy and security roles.

## Ownership boundaries

- Memory write: none
- RAG write: none
- preference inference: none
- TTS, Live2D, pet overlay, and chat output: none
- proactive behavior: none
- SubAgent access: unchanged; a later Main Firefly projection may expose a task-relevant read-only fact

The implemented downstream preference chain remains deliberately separate:

```text
QQMusic observation
  -> MusicContextService
  -> MusicPreferenceSignal
  -> MusicPreferenceService aggregation
  -> MusicPreferenceConsolidationPolicy
  -> Main Firefly canonical Memory
```

Only `music.context.available` and `music.track.changed` feed neutral passive
exposure evidence. Playback transitions and control actions are not preference
signals. See `music-preference-memory-v1.md` for the epistemic, consolidation,
privacy, and persistence contracts. Selective prompt projection and proactive
music behavior remain unwired.
