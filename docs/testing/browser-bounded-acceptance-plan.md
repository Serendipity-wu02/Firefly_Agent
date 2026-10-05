# Bounded acceptance after N6

Baseline 138c5268a89e69e20ad7cc2e56cadb6f1fd9d592, same isolated E worktree.
User requested usability acceptance first. Preserve production gate off, SW policy,
all previous evidence and original worktree. No production source change planned.

1. Reuse existing N6 17 records and two-site usability evidence, do not rerun them.
2. One finite N7 round: IPv4/IPv6 owned loopback STUN UDP and TURN TCP sinks.
   For each target use the same Chromium RTCPeerConnection probe, sink and counter
   first in a direct/default-policy control, then in the exact compiled product
   guest preferences plus disable_non_proxied_udp and authenticated fixed proxy.
   Test-only control changes remain inside this anonymous QA process. No server
   deployment, public target, OS routing/trust change, all-interface capture or viewer.
   A control must actually reach its sink; otherwise its restricted zero observation
   cannot qualify. Fixed observation budgets are bounded observations, not proofs
   of unlimited/global absence. Record candidate counts; do not claim zero ICE.
3. N5/N9 trusted HTTPS main SW install/update/navigation-preload/late writer needs
   an owned origin with existing certificate trust, eligible DNS and controlled
   scripts. No such origin is supplied: explicitly retain this facility gap.
   Existing process-only protocol SW lifecycle evidence is reused, not relabeled TLS.
4. Syntax/native qualification, related existing guest/session tests, one read-only
   fresh review, exact-byte archive/manifest and local reversible commit.

Ruling: this is acceptance of existing behavior, not feature implementation. No
production code or fabricated product RED/GREEN. Use the direct/default native
probe as the positive discrimination control. Four endpoint pairs are the stop
boundary; if an IPv6/control path is unavailable, preserve it without changing OS
or expanding public infrastructure. Full N7 or E3 remains outside the conclusion.

Completed checkpoint: one n7-r1 native run, 8 records/exit0; IPv4/IPv6 TURN TCP
controls reached the same sink with2/3 STUN-magic messages, restricted counters0.
Both UDP controls0 therefore both unqualified; do not retry beyond the finite
four pairs. Existing guest/session regressions2 files/29 passed. Fresh Astra review
found no Critical/Important; future result.failure qualification robustness is a
deferred Minor, actual8 records have no failure. Pending manifest noted by reviewer
is completed in the final archive; author performs final exact-byte validation.
