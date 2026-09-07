# Firefly V1.1.1 — `music_search` Capability Migration Audit

## Status

**BLOCKED — production migration was not performed.**

The local worktree does not contain an executable music-search network
provider. The authorization boundary therefore cannot be bound to the same
network authority that would execute `music_search`.

This document records the blocker required by the migration contract. It does
not register `music.search.read`, add a binding, add a Sandbox profile, or
change the existing `music_status` path.

## Actual provider and composition

The production composition root creates exactly:

```ts
musicService = new MusicService({ provider: new QQMusicProvider() });
```

`QQMusicProvider` starts with `config = null`. The local source has no call to
`configure()` and no settings getter that supplies a `QQMusicConfig` to this
provider. The `QQMusicConfig` type declares `apiKey`, `cookie`, and `baseUrl`,
but declaring those fields does not resolve an endpoint or create a network
client.

The provider implementation explicitly states that the real API, SDK, or
local service endpoint is not specified. Its `searchTracks()` method:

1. returns an empty array and logs a warning when the provider is unconfigured;
2. throws `QQ 音乐接口尚未配置实际端点与协议。` when configured.

There is no `fetch`, Node HTTP client, URL construction, request timeout,
redirect handling, or provider-level cancellation in this search path.

`QQMusicDesktopBridge` is a separate Windows GSMTC status/control bridge. It
does not implement music search and is not a valid search network authority.

## Network authority result

| Item | Local result |
| --- | --- |
| Provider | `QQMusicProvider` |
| Resolved base URL | None |
| Resolved Origin | None |
| Resolved Host | None |
| Search HTTP client | None |
| Redirect behavior | Not applicable; no HTTP request exists |
| Network Sandbox scope | Cannot be constructed without guessing |

Using `*`, all HTTPS hosts, a QQ Music host inferred from the provider name,
or the desktop bridge target would weaken the Sandbox contract and would not
prove `authorized network target == executed provider target`.

## Search behavior audit

`music_search` accepts a required `query` and an optional numeric `limit`.
The tool trims the query, rejects an empty query, calls
`MusicService.search(query, limit)`, and returns JSON containing either:

- `ok: true` with `query`, `count`, and formatted `tracks`; or
- `ok: true` with an empty `tracks` list; or
- `ok: false` with `error: "empty_query"` or `error: "search_failed"`.

`MusicService.search()` also writes returned tracks into the in-memory
`SelectionSetCache`. This is a local selection-cache mutation needed by the
existing follow-up `music_play` flow; it is not a network side effect.

The tool does not declare its own timeout or retry policy and does not pass its
`ToolContext.signal` into `MusicService.search()` or `searchTracks()`. Generic
tool timeout/retry policy remains owned by `ToolExecutionEngine`; no new
network retry or cancellation behavior was added.

## Secret and redirect audit

The provider type contains names for `apiKey` and `cookie`, but no values are
loaded or used by the current production composition. No secret was copied
into a capability request, approval presentation, transcript, result, log, or
Sandbox scope.

Because no HTTP request is implemented, redirect safety is not established.
The migration remains blocked rather than claiming same-origin or
revalidated redirects.

## Production changes intentionally not made

- `music.search.read` was not registered.
- No `music.search.read → music_search` binding was added.
- No network Sandbox profile was added.
- `HarnessAuthorizationAdapter` was not generalized for `music_search`.
- `music_status` was not changed.
- `music_recommend`, `music_play`, `music_control`, `play_live2d_action`, and
  all other non-migrated tools were not changed.
- No TTS, Live2D, Character, Memory/RAG, Chat radius, or Pet speech-panel
  source was changed by this audit.

## Required information to unblock the migration

The next implementation round requires the concrete local provider contract:

1. the provider implementation or local service that actually performs search;
2. the exact configured base URL/Origin and its settings source;
3. the HTTP client redirect policy, including whether a redirect target is
   revalidated;
4. the provider request timeout and cancellation contract;
5. the safe mechanism that binds the authorization snapshot to the same
   execution target after a settings change.

Until those facts exist in the local source/configuration, the authorization
migration must remain stopped.

## Related capability

QQ Music background transport control is a separate desktop capability. It
uses the existing Windows GSMTC `QQMusicDesktopBridge`, not a search provider,
network host, or `music_search` route. See
`qqmusic-background-control-v1.md` for that control boundary. Discovery
remains blocked until the concrete search provider contract exists.
