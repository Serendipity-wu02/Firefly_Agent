# Bounded owned-interface STUN/UDP diagnosis and evidence correction

Baseline: `e191a965a3e0036e5999a5b9c0d7d70f2d79ea52`, isolated branch
`audit/browser-native-gaps-20261005`. Production browser gate remains off.
This change contains QA scripts, evidence and a facility proposal; product source
and CI are unchanged. No TURN TCP or N6 native probes were repeated.

## Observed boundary and completed local controls

An unbound Node Binding transaction reaches loopback on both families. Binding
that client to the assigned WLAN source while keeping loopback as the target
returns `EADDRNOTAVAIL` on both. The same source-bound client succeeds against
its own assigned-interface target. The direct/default native Chromium probe
runs before any restricted guest exists: loopback receives zero, while own WLAN
IPv4/IPv6 receive 6/3 valid 20-byte Binding requests and send truthful responses.
This supports a local source-bound-address/loopback incompatibility; it does not
identify the exact native socket binding or prove that TUN caused it.

| Run | PID / native exit | Records | Native IPv4 | Native IPv6 |
|---|---|---:|---|---|
| `udp-diagnosis-r1` | 4588 / 0 | 11 | loopback 0; assigned 6 | loopback 0; assigned 3 |
| `udp-own-interface-r1` | 30096 / 0 | 12 | 6 / 0 / 6 | 3 / 0 / 3 |
| `udp-calibration-r1` | 31296 / 0 | 12 | 6 / 0 / 6 | 3 / 0 / 3 |

Triplets mean direct positive, restricted negative, same original direct guest
positive again. All runs have empty top-level errors. Each native probe accepts
its configuration and creates its offer without `result.failure`. Node oracle
transactions use distinct random IDs and are excluded from native counters.

The restricted side uses the exact compiled `createElectronBrowserGuest`,
`disable_non_proxied_udp`, and `createElectronBrowserSessionPort().setProxy`
with a real authenticated CONNECT proxy. Direct controls use policy `default`
and `DIRECT`. HTTP/HTTPS request cancellation is identical in both guests.
The bounded differential concerns this combined session network policy; it
does not isolate which component caused the restricted result.

## Runtime fields and actual interface coverage

Calibration records physical **WLAN / interface index 15**, Intel Wi-Fi 6 AX201,
`Native 802.11`, hardware true, virtual false, status Up. Both the selected
private IPv4 and assigned non-link-local IPv6 belong to that interface.
Literal addresses are represented by per-process HMAC equality tokens; the
random secret is discarded, so tokens cannot compare different runs.

For each triplet, archived `actual.probe` is deeply identical: bound address
token, actual socket port (IPv4 54416; IPv6 50014), `dgram.bind(0,assigned-address)`,
interface facts, STUN/UDP URL configuration token, one ICE server, data channel,
default offer options and 3500ms observation budget. The actual bound address
is checked against the selected address, normalizing IPv6 bytes. Main execution
budget is 6000ms. The same direct Session is used before and after; only the
session network setup (handling policy and proxy) differs on the negative side.
Both native completion and the launcher independently require qualified pairs.

Residual interface coverage is explicit: Mihomo / Meta Tunnel index 11 is a
virtual IP interface Up; physical Realtek Ethernet index 10 is disconnected.
Wi-Fi Direct adapters are disconnected. WAN IP/IPv6/Network Monitor miniports
are Up and other WAN miniports are disconnected; Teredo, IP-HTTPS, 6to4 and the
kernel-debug adapter are NotPresent. None were used as additional probe targets.
The adapter inventory is read-only metadata, not packet capture or proof about
all traffic on those interfaces. No route, TUN, adapter, certificate or OS trust
settings were changed; no administrator capture or unrelated traffic collection.

The first fix run did not record the runtime address/port/configuration fields.
Source reuse and successful triplets support its limited arrival classification,
but it cannot retrospectively claim a runtime field comparison. Calibration is
the record that closes this specific metadata gap; it adds no matrix cases.

## Historical zero-count evidence correction

Old raw archives are preserved byte for byte; this table qualifies their use.

| Evidence | Correct classification |
|---|---|
| `browser-bounded-acceptance/evidence-n7-r1.json`, IPv4/IPv6 STUN UDP loopback | Positive and negative both 0. Already unqualified; cannot establish UDP blocking. |
| `browser-resolver-shared-integration/evidence-r8.json`, N7 loopback UDP/WebTransport | Counters stay at Node preflight 1. No same-native-probe positive. Restricted zero is observation only; STUN UDP and WebTransport/QUIC acceptance remain pending for those loopback probes. |
| Same r8 loopback TCP | Node preflight alone is insufficient native qualification. Independently qualified later n7-r1 TURN TCP records remain valid within their own finite scope. |
| n7-r1 TURN TCP IPv4/IPv6 | Native positives 2/3, restricted 0; preserved as bounded TCP arrival controls, not successful TURN allocation/relay. |
| `browser-native-n6/evidence-n6-r2.json` | Dedicated DNS and TCP cancellation controls concern distinct APIs and real own-sink positives; unaffected. No rerun. |
| Earlier phase2/SW lifecycle records | Local protocol, cleanup or negative import observations keep their existing limits. No trusted-HTTPS main SW or whole-interface N7 certification. |

An I1 invariant requiring the entire process tree to emit no UDP is invalid:
Main's dedicated DNS legitimately uses UDP. Socket polling can miss short-lived
connections and cannot certify global absence. Neither that invariant nor a
replacement global scanner was implemented.

## Evidence qualification, review and verification

Independent read-only review found Critical 0, Important 1, Minor 1. The Important
was an exit-0 receipt even when a pair failed or a family was missing. The shared
qualifier now requires both ordered positive-negative-positive families,
positive arrivals and responses, zero restricted arrivals/responses, successful
configuration/offer, no exception, matching pair counts, actual policies/proxy,
and identical runtime metadata in new acceptance. Native and launcher invoke it.
The same independent reviewer then confirmed the fix and actual calibration:
Critical 0, Important 0, Minor 1. No additional native or network operation was
performed during either review. The final manifest is implementer-verified.

The Minor is retained as a scope limit: the responder checks header/type/magic
and total length, and produces XOR-MAPPED-ADDRESS for this round's 20-byte
requests. It does not validate arbitrary attribute alignment/comprehension or
claim to be a complete RFC 8489 server. Candidate types remain truthful:
controls have 10 host candidates, no srflx; IPv4 gathering is incomplete. Arrival
and response-send observations do not prove native response acceptance, full
ICE completion, public reachability or universal zero candidates.

Fresh verification logs are archived: codec 3 passed; qualification initial
4 passed / 1 failed (changed port incorrectly accepted), then 5 passed;
final archived-data codec plus qualification 8 passed; existing guest regression
1 file / 7 passed. The negative CLI fixture is derived from calibration with
IPv6 records removed and must exit 1; calibration qualification exits 0 with
`runtimeMetadataVerified:true` and `fullN7:false`. Syntax checks cover CJS and
the PowerShell launcher. No full product tests/type/build were rerun for this
QA/document-only change. Earlier 288 browser tests/type/build success and the
14 inherited full-suite TEMP/history failures are historical, not current runs.

`inputs-diagnosis-r1.cjs` is reconstructed after diagnosis; its sole difference
from the first-fix snapshot is the fix-only qualification expression, which was
not executed in diagnostic mode. `inputs-own-interface-r1.cjs` was captured after
its run and before qualification-gate edits. Neither has a prelaunch hash receipt.
`inputs-calibration-r1.cjs` and `inputs-udp-calibration-r1.json` were captured
before calibration, including actual compiled inputs and adapter facts.
The manifest hashes current archived bytes; it does not invent earlier receipts.

## Remaining acceptance and facility dependency

Only selected-interface, bounded native STUN/UDP arrival controls are now
qualified. Full N7/QUIC/WebTransport, all-interface capture and trusted HTTPS
SW main-script install/update/preload remain unverified. Production gate is off.
The [owned HTTPS fixture proposal](../architecture/browser-trusted-https-fixture-proposal.md)
compares an existing owned origin with a temporary Cloudflare Worker, conditional
free-tier cost, synthetic payloads, complete logs and cleanup. Actual account,
domain and direct deployment authority remain unknown. No Cloudflare login,
account, keys, Worker, deployed file, external write or origin test was created.
