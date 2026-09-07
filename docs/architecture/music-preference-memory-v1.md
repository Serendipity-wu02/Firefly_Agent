# Firefly V1.1.1 — Music Preference Memory V1

## Status and scope

Music Preference Memory V1 is implemented in the Main process. It turns a
small set of typed music evidence into bounded assessments and writes only
qualified summaries through the production `FireflyMemoryService`. It is not
a listening-history logger, recommendation engine, music UI, discovery
provider, proactive policy, or SubAgent feature.

Implemented flow:

```text
QQMusic.exe
  -> QQMusicDesktopBridge
  -> MusicContextService
  -> MusicPreferenceSignal
  -> MusicPreferenceService
  -> evidence aggregation
  -> MusicPreferenceConsolidationPolicy
  -> FireflyMemoryService
  -> memory.json
```

`AgentEventBus` remains the only event bus. `ContextManager` remains the
runtime context owner. `FireflyMemoryService` remains the only production
long-term Memory owner.

## Epistemic model

The shared contract in `src/shared/music-preference-types.ts` preserves three
levels:

| Level | Meaning | Long-term wording |
| --- | --- | --- |
| `OBSERVED` | A passive runtime fact, with no preference claim | “用户近期多次收听……” |
| `INFERRED` | A bounded hypothesis from repeated independent evidence | “可能较偏好……” or “可能不太偏好……” |
| `EXPLICIT` | A preference directly stated by the user | “用户明确表示喜欢/不喜欢……” |

The levels are never interchangeable. One track observation cannot create a
like. A listening pattern remains neutral. An inferred state remains
qualified in metadata and wording. The latest explicit statement is the
current truth and outranks all behavioral evidence.

## Signal schema and ingestion

`MusicPreferenceSignal` contains an ID, kind, epistemic level, polarity,
typed subject, source, occurrence time, optional confidence, and typed
evidence provenance. V1 accepts:

- passive `TRACK_EXPOSURE`, `ARTIST_EXPOSURE`, `TRACK_REPEAT`, and
  `ARTIST_REPEAT` as `OBSERVED` + `NEUTRAL`;
- `INFERRED_AFFINITY` as positive or negative `INFERRED` evidence;
- `EXPLICIT_LIKE` and `EXPLICIT_DISLIKE` as typed `EXPLICIT` evidence.

The production adapter subscribes only to `music.context.available` and
`music.track.changed`. It emits separate neutral exposure signals for the
observed track and artist. It does not consume `music.playback.changed`,
`music.context.unavailable`, or `music.control` commands as preference.

The existing chat memory extractor is broad text matching and does not expose
reliable typed music subject identity. V1 therefore provides a validated
typed explicit-ingestion seam but does not add a second conversational
extractor or new regex-only production path. Production chat ingestion of
typed explicit music semantics is the next wiring task.

## Subject identity

V1 supports `TRACK` and `ARTIST` as separate subjects.

- Artist key: normalized artist display text.
- Track key: normalized tuple of artist, title, and album when present.
- Display fields retain normalized user-facing spelling.
- Normalization uses NFC, trims boundaries, and collapses whitespace.

QQ Music does not provide a stronger stable track identifier in the current
GSMTC path, so V1 does not invent one. A track preference never becomes an
explicit artist preference. A track dislike never becomes an artist dislike.

## Aggregation, idempotence, and reinforcement

`MusicPreferenceService` owns process-local aggregation by subject. It tracks
observation count, positive and negative evidence counts, explicit counts,
inferred weights, first and last observation times, last reinforcement time,
provenance, signal kinds, and the latest explicit truth.

Signal IDs and full semantic fingerprints are SHA-256 digested. Replaying the
same ID or the same semantic signal does not reinforce confidence. The most
recent 32 digests of each form are retained in the consolidated Memory
metadata so immediate process retries remain idempotent across restart. Raw
utterances and raw listening events are not retained.

Confidence rules are deterministic:

- one or two passive observations remain `UNRESOLVED` and are not persisted;
- three passive observations become a neutral `LISTENING_PATTERN` with base
  confidence `min(0.75, 0.05 + observationCount * 0.1)`;
- inferred weight is the supplied confidence clamped to `[0, 1]`, defaulting
  to `0.5`;
- inferred balance is positive weight minus negative weight;
- inferred confidence is `min(0.85, abs(balance) / 3)`;
- inferred persistence requires at least three inferred signals and confidence
  of at least `0.65`;
- explicit confidence is exactly `1`.

Confidence is bounded. Independent evidence reinforces with a cap. Negative
inferred weight reduces positive inferred affinity. Behavioral evidence
cannot weaken an explicit truth.

## Lazy decay

No timer or polling loop was added. Effective confidence is evaluated lazily
using complete elapsed days since the last reinforcement:

- listening-pattern half-life: 14 days;
- inferred-preference half-life: 30 days;
- explicit preference: no time decay.

When a non-explicit stored summary falls below its persistence threshold,
reconciliation removes only that domain-owned summary. Explicit state remains
until a later explicit contradiction supersedes it.

## Consolidation and contradiction handling

`MusicPreferenceConsolidationPolicy` is pure and performs no I/O. It returns
one of:

```text
DO_NOT_PERSIST
PERSIST_OBSERVATION_SUMMARY
PERSIST_INFERRED_PREFERENCE
PERSIST_EXPLICIT_PREFERENCE
UPDATE_EXISTING_MEMORY
SUPERSEDE_EXISTING_MEMORY
```

`MusicPreferenceService` applies the decision through
`FireflyMemoryService.remember()` or `forget()`. The deterministic key is
`music.preference:<subject-key>`, so reinforcement and contradiction update
one record instead of creating simultaneously active like/dislike entries.
The latest explicit statement is selected by occurrence time, then signal ID
for an exact deterministic tie-break.

## Persistence and privacy

Only consolidated summaries are persisted in the existing `memory.json`.
Their metadata includes the subject, epistemic level, polarity, status,
confidence, aggregate counts, reinforcement times, provenance classes,
signal kinds, latest explicit summary, and bounded idempotence digests.

Pending evidence below a consolidation threshold remains process-local and
does not survive restart. Consolidated state is hydrated from the canonical
Memory metadata and does survive restart. There is no `MusicMemoryDatabase`,
music vector store, startup cleanup, or second general Memory file.

V1 does not persist complete listening history, every-song timestamps,
lyrics, artwork, QQ account data, cookies, tokens, or unrelated media
sessions.

## Memory, RAG, and context projection

The current production `FireflyMemoryService` does not automatically index
records into RAG. Music Preference V1 therefore performs no RAG write and
adds no music-specific indexing path.

Selective music-preference projection is not wired. Domain-tagged music
preference records are excluded from the existing general Memory prompt
projection, preventing the full profile from appearing in every LLM turn.
`MusicContextSlot` remains presentation-empty and unchanged. A later task may
read only relevant music facts or preferences through a selective projection
seam.

## Ownership boundaries and future seams

- Main Firefly owns interpretation, consolidation, and Memory writes.
- SubAgent preference access and writes are not wired.
- Tool execution, capability authorization, sandbox, and Approval are not
  dependencies of this domain service.
- TTS, Live2D, renderer UI, QQ Music control, and proactive output are not
  called.
- Proactive music behavior is not wired; it requires a later Character policy.
- Music discovery remains blocked until a concrete provider contract exists.

Current status:

| Area | Status |
| --- | --- |
| Music Context Event Model | Implemented |
| Music Preference Memory | Implemented for passive accumulation, typed explicit input, consolidation, and canonical persistence |
| Selective preference projection | Not wired |
| Proactive music behavior | Not wired |
| SubAgent preference access | Not wired |
| Music Discovery Provider | Blocked / future |
