# Bounded N6 continuation

Base 2cf8eb93d4a227f5b46dc1e4c30b93720c3ece19; same isolated E worktree.
Reuse prior resolver/owner/late-resource regressions, do not replay N3/N10 faults.
No product gate, R1, shared/renderer, OS network, trust, external service or CI change.

Finite matrix: P0 CONNECT receipt before admission; P1 actual dedicated c-ares
A/AAAA UDP held by owned DNS stub; P2 native answers held before proxy delivery;
P3 actual connected socket's connect event delivery held; P5 peer observes200;
P6 active bytes; P7 repeat revoke with injected close failure. Every negative uses
the same raw CONNECT/nonce probe and owned origin counters as its positive control.
Record real remote peer, local destroy and remote EOF/reset separately, retaining
both test peers until product revoke observations complete. Only then reclaim
fixture peers. Post-revoke fresh nonce must never be forwarded; prior writes may
arrive later and do not count as a violation.

P4 peer check,200 initiation and initial pipe setup are one synchronous source
continuation with no await. Record their sequence, do not manufacture an async
native window by rewriting product code or a reentrant getter. P2 is accurately
before proxy answer validation, not a claim of pausing after the final predicate.
This finite E1/E2 matrix is not all native OS/Chromium DNS/connect timing windows.

Add native guest DNS-wait cancellation/control and actual independent sibling
resolver cancellation. Address classification/port mapping only in owned QA
process; realSocket/realPeer retained. Restore real policy for optional one-site
example.com anonymous GET/defaultTLS/revoke observation via existing approved
Main resolver. No originlogs: never label this full E3. Failed optional route is
retained as a limitation, not replaced by another route or TLS exception.

N10 identity only: two actual quit requests supply distinguishable first/second
final callbacks; first executes once and second never executes. Existing N3/N10
fixture scripts/manifest remain immutable; new artifacts live separately.

Verify fixture syntax, native runs, related existing tests; independent read-only
review and exact evidence/hash/local commit. No repeat full build/test needed
unless a production change or unresolved failure calls for it.

Completed checkpoint: local n6-r2 has 17 records, native exit0; its 14 raw
proxy records qualify with one revoke marker each and no forbidden initiation
after that marker. n6-r1's whole matrix is superseded by the P0 marker check
(qualification exit1); only its independently valid single public TLS observation
is accepted. Distinct native N10 callback identity passes first1/second0.
Existing targeted regressions: 4 files/95 passed. Independent read-only review
found no Critical/Important; one raw classification-label Minor is disclosed.
Final classifications, immutable inputs, qualification logs and hashes are in
browser-native-n6.md and fixtures/browser-native-n6/manifest.json. No production
source change, complete E3 or OS resolver certification is claimed.
