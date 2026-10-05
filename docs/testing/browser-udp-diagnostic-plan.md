# UDP positive-control diagnosis

Baseline e191a965a3e0036e5999a5b9c0d7d70f2d79ea52. Latest explicit authority:
diagnose owned STUN/UDP only, repair QA fixture if causal evidence supports it;
no repeated TURN TCP/N6, OS/TUN/certificate changes, administrator capture or
other users' traffic. HTTPS SW facility proposal only, no deployment/accounts/keys.

Hypothesis H1: source-bound non-loopback UDP to a loopback target does not reach
the loopback sink on this host; WebRTC uses native interface-bound UDP sockets.
Do not label TUN as causal from adapter presence alone.

One diagnostic run: a minimal 20-byte Binding request/response transaction oracle, Node
unbound vs WLAN-source-bound loopback sends, then the identical direct/default
Chromium RTC probe against owned loopback vs actual WLAN IPv4/IPv6 endpoints.
Use an RFC8489-style XOR-MAPPED-ADDRESS reply in all native probes so endpoint
address is the only varying factor. Positive RTC starts before any restricted
guest, with policy/default and resolveProxy DIRECT recorded. No packet capture.

If owned-interface positive succeeds, one fix run adds the restricted side using
the same probe/sink/counter and exact compiled guest policy/fixed-proxy port.
Reject result.failure explicitly. Require real Binding messages from the same
native probe, never raw Node positive alone. Preserve loopback failures.

Diagnosis ruling: real own-interface Binding requests arrived6/3, but srflx was0
and host candidates10. An own-address server truthfully returns the client's
existing address/port; candidate exposure is not a required UDP sink calibration.
Do not fabricate a different mapped address to force srflx. Record candidate types
without making srflx a qualification criterion. Check the same direct guest again
after restricted probes to detect cross-guest policy residue; this remains UDP only.

Stop: one diagnosis and at most one evidence-supported fixture fix. If a second
actual same-cause technical fix fails, use agreed Astra-medium diagnosis before
any further attempt. No DNS/public STUN target, no changing TUN/routes, and no
zero-as-pass if the same native positive remains unreachable.

Facility proposal: exact account/domain remain unassigned placeholders, compare
an existing owned HTTPS origin with one temporary workers.dev origin, verify
official current free limits, scoped permissions, synthetic request/log contents
and rollback. Do not create deployment files, accounts, credentials or services.

Final field-level evidence request permits one calibration of the same UDP matrix:
record actual selected adapter facts, socket bind address identity/port and probe
configuration, then require identical metadata before/negative/after. No new
targets or families and no TURN TCP/N6 repeat. Literal IPs use per-process HMAC
equality tokens; the secret is discarded. Earlier runs did not capture these
runtime fields and cannot be upgraded retroactively.
