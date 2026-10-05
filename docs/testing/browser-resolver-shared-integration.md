# Trusted resolver shared integration checkpoint

Resolver commit `cc874dfac7ec2b60051f84aa1491f8e31217edcb` was integrated as
`5bfa4464a96ba154c32a3105a4b0744224f98243` after clean `16385aa`. The sole conflict
was two imports in browser-service-ipc.ts: both shared IPC constants and the
one-time certificate refusal helper are retained. Normal Main now uses the small
startup composition described in [the resolver contract](../architecture/browser-trusted-resolver.md).

The complete ordinary suite after current Main integration is **646 files,
6526 passed /2 existing skips, exit0** (`resolver-final-full.log` in the original
E evidence directory). The owner branch's14 inherited H failures are not waived:
this run uses the original exact H TEMP/helper prerequisites and verified Git Bash.
Browser direct regression:14 files/287 passed. Main official noEmit and isolated
emit passed; the new startup tests' strict type check passed. Unchanged shared,
preload and renderer retain their earlier formal checks/builds. Production dist
and the already running isolated candidate are preserved; no clean/build of
production dist occurred. Native H12/12 remains a separate existing acceptance.

The owned E native probe `r5` exited0 with actual anonymous example.com/GitHub
navigation through selected DNS192.168.31.1, numeric TCP and normal original-host
Chromium TLS. Expired.badssl failed with ERR_CERT_DATE_INVALID; no TLS override
or system resolver/TUN/proxy/certificate change was introduced. The actual shared
UI/preload/IPC path then passed24 cases/9 screenshots across Chat/Work/Code
welcome/existing, resize, tab detach/restore, close/reopen and inspector revoke,
with9 observed GET requests and no renderer errors. Trusted visible/focused host
ports are synthetic for this geometry test; actual host focus stayed false with
zero focus events. Public transport is real; OS foreground/tray is not certified.
The initial public UI failure was an outdated page-content assertion, not network
failure: requests were allowed, no native failure occurred, and the observed
multilingual IANA page differed from the former heading. Its RED evidence is kept.

Extended `r8` exited0,17 recorded cases and no errors. `r6` timed out observing an
unloaded CDP target; `r7` correctly reported that the destroyed original-origin
frame was unavailable to DOMStorage. Both failures are retained. Final storage
readback is explicitly a fixed local protocol fixture at the original origin,
allowed only to a newly Main-created observer after ordinary old guests were
destroyed and worker count was zero. Every other old-session request remains
denied; the observer restores deny-all and destroys itself. It does not prove
TLS or revive any old service capability. Actual old-session localStorage0,
IndexedDB[],CacheStorage[],cookie0,cache0 and worker0 were observed.

## N1–N10 evidence boundary

| Gate | Current evidence | Remaining native gap |
|---|---|---|
| N1 | Actual IPC denies IPv4/IPv6 loopback, link-local, fake-IP without extra guest allocation; complete-answer address regressions pass. | Full Windows interface/bypass sink coverage. |
| N2 | Fixed authenticated proxy route, native load failure paths and retirement denial; ordinary no-fallback tests pass. | Actual proxy-failure/direct-fallback origin instrumentation across all transports. |
| N3 | Actual native proxy authentication; existing real CONNECT wrong/missing/stale/foreign credential regressions pass. | Complete hostile native Session/challenge matrix. |
| N4 | Independent A/AAAA DNS, native public TCP/default TLS; actual renderer resolver forgery denied; mixed/fake/mapped and peer-mismatch regressions pass. | Full native redirect/reconnect/rebinding fault matrix. |
| N5 | Native HEAD200; actual POST/PUT/DELETE/beacon/WSS hooks deny against reserved .invalid targets, without public writes. | Full native iframe/dedicated/shared/SW HTTPS request matrix. |
| N6 | Actual owner switch destroys old guest, blocks late fetch, creates fresh Session; precise cancellation/late-resource regressions pass. | All native DNS/CONNECT/open-tunnel timing windows. |
| N7 | Actual RTCPeerConnection/WebTransport with preflight-verified owned IPv4 UDP/TCP sinks: no additional STUN/TURN-TCP/transport traffic. | IPv6/public/all-interface QUIC/HTTP3/WebTransport/WebRTC packet evidence; bounded sinks are not global egress proof. |
| N8 | Native microphone NotAllowedError, notifications denied, geolocation code1; expired cert refused once and no Firefly preload/Node. | All native device/download/client-cert/site-login denial paths. |
| N9 | Actual seeded localStorage/IDB/CacheStorage/cookie erased on old Session; cache/worker0; new owner receives fresh Session. | Controlled trusted HTTPS SW install/update/late-writer lifecycle; the storage observer is a local fixture. |
| N10 | Existing coordinator quiesce/dispose then actual before-quit/will-quit/quit after cleanup and native exit0. | Native cleanup failure/timeouts in every shutdown phase and platform shutdown variants. |

**Production gate remains closed.** These results do not authorize a production
restart or reduce the accepted N1–N10 gate. A future controlled trial must carry
the current explicit Main DNS selection and await the remaining evidence; no
renderer/config/URL field may enable it. Voice/TTS and table-prop changes are
separate subsequent commits. Streaming/model semantic owner files remain untouched.

Local raw evidence is `E:/Codex/2026-10-03/task-10/browser-resolver-integration-20261005`;
ordinary/build/RED/GREEN receipts are in the earlier `browser-integration-20261005`
directory. Selected reproducible native scripts/receipts and public UI summary
are archived in [fixtures/browser-resolver-shared-integration](fixtures/browser-resolver-shared-integration).
Screenshots stay only in E and are not uploaded or tracked. External Codex post-correction review has not been run. The prior request was
rejected before process launch and was not retried; explicit payload approval
is still pending. Local review is supplementary and is not a built-in review.
