# Trusted Main resolver verification

Baseline `b061cacd6fcc739ac2c7a8af6b1701aa745113b8`, isolated E task-4
worktree, branch `feat/browser-trusted-resolver-20261005`. Scope is Main browser
resolver/factory, related tests and documentation. No shared settings/renderer,
OS DNS, Clash/TUN, R1/backend, dependency, CI or production gate modification.

The approved route was probed before implementation using independent Node
24.19.0 Resolver and only `192.168.31.1:53`. The sandboxed process timed out;
formal escalation of the exact same read-only route succeeded. No automatic
approval rejection occurred and no alternate route was used. Example.com,
www.wikipedia.org and github.com returned public A records and `ENODATA` AAAA.
This is DNS reachability evidence, not website authenticity or TLS success.

Behavioral RED preserved: synchronous second-family exception released admission
before the first native query settled. GREEN wraps each native call into a
settled promise and waits for both. Tests also cover real UDP A/AAAA completeness,
ENODATA, NXDOMAIN/SERVFAIL/refusal, native timeout, owner cancel, explicit proxy
revoke, binding independence, immutable Main config snapshot, invalid endpoint
configuration, and actual authenticated TCP CONNECT denial with zero dial for
mixed private, fake-IP and mapped AAAA answers. Native boundary mocks specifically
cover delayed cancellation and the owned 5s deadline retaining all 32 slots until
actual native settlement. Existing pin/peer/TLS and permissions regressions remain.

Renderer forgery is exercised through the actual service/controller for closed
gate, private URL and public URL commands; supplied config/functions cannot
replace the trusted factory. Native QA additionally sends forged configuration
via actual renderer IPC during anonymous public navigation.

Fresh-context independent Astra medium review found no Critical/Important/Minor
implementation defect. Its three initial test coverage gaps were addressed and
read-only closure verified. Review does not certify real TUN transport or full
N1-N10 isolation; native evidence and explicit limits below remain authoritative.

Final commands, original bytes, exit results and SHA-256 inventory are archived
under [fixtures/browser-trusted-resolver](fixtures/browser-trusted-resolver).
Integration contract: [Main proposal](../architecture/browser-trusted-resolver.md).

## Actual native route and TLS

Native `r4` uses the existing QA framework, compiled Main code and explicit trusted
factory config in a fresh owned smoke profile. Electron 43.1.0 embeds Node
24.18.0; CLI/tests use Node 24.19.0. No normal product userData is read. Actual
appData/userData/sessionData/logs/crashDumps paths were checked beneath the QA
root. The hidden host is unfocusable: zero focus events and zero attached views.

The actual renderer IPC → Main owner → private domain → dedicated nonpersistent
Session → native guest → authenticated CONNECT → independent DNS → numeric TCP
→ ordinary original-host Chromium TLS path loaded `https://example.com/` and
`https://github.com/` successfully. OS lookup simultaneously still returned the
denied `198.18.0.162` for example.com; trusted resolution returned public
`104.20.23.154` and `172.66.147.243`. No alternative dialer, peer spoofing, root
installation, verification bypass or system proxy fallback was used. Public
navigation with renderer-supplied resolver fields retained Main configuration;
private router webpage navigation was blocked. Read-only metadata confirmed the
Mihomo Meta Tunnel adapter remains Up with DNS `198.18.0.2`.

`https://expired.badssl.com/` reached native certificate verification and failed
with `ERR_CERT_DATE_INVALID` (-201), service `load_failed`. The first native run
`r3` found an inherited denial bug: guest and App both consumed the same one-time
certificate callback. The native failure and forwarded-chain unit RED are
retained. A small Main helper keeps both refusal boundaries and answers false
once per callback identity; no trust policy is weakened. The actual forwarding
is confirmed in [Electron 43.1.0 app.ts](https://github.com/electron/electron/blob/v43.1.0/lib/browser/api/app.ts#L103-L109).
Independent review confirmed the fix; `r4` completed with exit 0, nine recorded
checks, no errors, normal positive TLS and explicit expired-certificate rejection.

Owner switch destroyed the actual old native guest; retired Session.fetch was
`ERR_BLOCKED_BY_CLIENT`; the next owner received a fresh Session, explicit close
destroyed it, and native cookie/cache cleanup reported zero. Existing shutdown
coordination completed. The QA fixture supplies its own narrow host preload and
the exact routing consumer. The integrator owns production composition/settings
selection/shared/preload/renderer wiring.

Visible screenshots, foreground/tray behavior, cross-protocol egress, comprehensive
remote storage/worker scenarios and complete N1-N10 acceptance remain unverified.
This successful anonymous HTTPS path does not authorize opening the production
gate; the gate stays closed until that separate full acceptance is complete.

## Validation record

Final browser plus existing IPC contract suite: 14 files / 278 tests passed,
exit 0. Main, browser test, preload and renderer strict TypeScript checks passed.
Final `npm run build` passed (storage-boundary, Main, preload, CLI and renderer);
the existing large-chunk warning remains unchanged, with no threshold adjustment.
The final native r4 fixture above passed after compiling the exact final Main
sources; the subsequent full build uses the same compiler/config/source.

Two earlier full-suite records are retained as intermediate evidence, not final
GREEN: the first predates the last public-forgery regression; the second overlaps
the new certificate callback RED and therefore records that expected extra
failure. The final frozen-source run is separate, with SHA-256 source inventory
checked before and after so no intermediate source state is presented as final.

The inherited H file `src/main/memory-sources/native-history-presence-process.test.ts`
hardcodes `E:\Codex\2026-10-03\task-10\h-presence-synthetic-20261004` and a helper
from a different task. Its beforeEach requires that exact TEMP; the approved
task-4 TEMP fails that prerequisite and afterEach then receives undefined root.
This branch changes neither H nor external fixtures, and does not skip tests or
alter CI. Any resulting full-suite failure is explicitly reported below.

Final frozen-source full suite: **640 files, 639 passed / 1 failed; 6425 tests
passed / 14 failed / 2 skipped (6441 total)**, exit 1, 384.93s. The sole failing
file is that unchanged H process fixture; all browser regressions, including the
certificate forwarding fix, passed. The nine changed source/test files matched
the frozen SHA-256 inventory after the run. Full-suite GREEN is not claimed.

Commands use existing Vitest 4.1.11 and TypeScript 5.9.3. Tests set TEMP/TMP and
RUNNER_TEMP to `E:\Codex\2026-10-04\task-4\tmp`; existing process tests use
`FIREFLY_TEST_BASH=E:\Git\bin\bash.exe`. No new checks/dependencies or CI policy.
