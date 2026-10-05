# Trusted Main browser resolver (approved implementation)

Baseline: `b061cacd6fcc739ac2c7a8af6b1701aa745113b8`. Isolated branch:
`feat/browser-trusted-resolver-20261005`. Existing dependencies only.

The user approved application-only router DNS `192.168.31.1:53`, with TUN
remaining enabled and browsing-domain disclosure to that resolver understood.
This is explicit trusted Main configuration, never an all-user default or IPC
capability. No OS DNS, Clash, renderer, shared settings, R1 or CI changes.

1. Probe that exact DNS endpoint using Node 24.19.0 independent Resolver.
2. RED: actual UDP DNS and authenticated CONNECT regressions for complete A/AAAA,
   ENODATA versus failures, mixed private answers with zero dial, cancellation,
   timeout, binding isolation and true pending admission; reject renderer config.
3. GREEN: Main-only numeric server config and proxy factory. Per-lookup independent
   Resolver, both native queries settled before budget is returned, owner/revoke
   cancellation, fixed query deadline, 32 pending lookups globally. No fallback.
4. Expose optional trusted Main factory configuration, preserving absent OS default
   and closed production gate. Supply small integrator wiring proposal only.
5. Fresh independent security review, browser tests, Main/preload/renderer/test
   types, build, full suite. Record inherited failures separately. Hidden fresh
   Electron QA profile: approved DNS + real numeric TCP + original hostname TLS,
   anonymous public HTTPS and certificate failure where reachable. No TLS bypass.
6. Record raw RED/GREEN/probe evidence and acceptance limits. Local rollbackable
   commit only; no push/PR/merge/restart or production gate opening.

DNS infrastructure can be private; webpage targets still require every returned
A/AAAA to be public and family-consistent. CONNECT still checks the numeric
socket peer. TLS remains end-to-end Chromium verification of the original host.
Default Node global resolver and Chromium resolver are never mutated.

Reference: https://nodejs.org/download/release/v24.19.0/docs/api/dns.html
The constructor timeout/retries are supplemented by an owned cancel deadline;
deadline/owner cancellation does not release admission before actual settlement.
