# Native acceptance gap closure (Windows, approved)

Base: c98cceb54402481f70840371a8cc8d2ca141b460, isolated existing E task-4
worktree, branch audit/browser-native-gaps-20261005. Preserve production gate off,
shared/renderer ownership, normal TLS, trusted DNS192.168.31.1 and TUN unchanged.
Do not replay accepted two-site/TLS/UI matrices. Each native run uses a fresh owned
smoke profile, hidden unfocusable host, actual Main ownership/Session/guest/IPC.

| Gate | Independent work now | User impact / necessity |
|---|---|---|
| N1/N7 | Owned active IPv4/IPv6 interface sinks, positive controls, native fetch/frame/RTC/WebTransport attempts; own fresh process Session netLog metadata only. | Prevent page access to local services and bypass traffic; distinguish reachable sink from absent observations. |
| N3 | Native foreign unregistered Session using the real authenticated proxy, denied credential route; no recording auth values. | Prevent borrowing another conversation's network capability. |
| N6 | Hold proxy/setup/native DNS-answer delivery, cancel exact owner, release late work; actual old native sockets/views must close with no late dial. | A closed/switched page must not continue starting requests. |
| N8 | Native owned-profile download refusal and documented public anonymous Basic/client-cert challenges where reachable. | No unexpected files, credential prompts or certificate identity disclosure. |
| N10 | Real native resource setup with injected SDK cleanup rejection/never-completion; coordinator phase/finalization observations. | Bounded exit and visible cleanup failure rather than silent resource reuse. |
| N4/N5/N9 | Inspect official WPT/httpbin resources before bounded read-only use; HTTPS workers, update and late-writer need an actually controllable script. | Workers must not escape method/owner policy or repopulate erased state. |

Own Session/default-capture-mode netLog is application metadata, not all-machine
packet evidence. No driver, roots, OS settings or other application traffic capture.
All-interface/private sinks do not certify arbitrary public QUIC destinations.
Public scripts must be inspected before execution; no accounts or public writes.
If official resources cannot provide controllable late writes/update/rebinding,
record precise missing inputs and a minimal already-owned normal-TLS endpoint
request, rather than lower the gate or offer an indefinite generic blocker.

Use TDD for a discovered product defect, read-only independent review for any
production change, related types/tests/build and raw receipts before local commit.
No push, PR, merge, deployment or production restart. Local fixture additions
and evidence do not modify product IPC or provide renderer testing capabilities.

## Checkpoint 2026-10-05

The parent's bounded follow-up prioritizes N3/N10; do not expand N7/N9 while
awaiting technical feedback. N3 n3-r4: native exit0,12 records,real owned socket
positive controls and local native401 challenge; address/port/exact GET substitutes
are explicitly E2, not E3. N10 five owned native runs: actual rejection, timeout,
seven-phase rejection, coordinator deadline and quit reentry; errors/results retain
cleanup_failed independently of exit0. Details and remaining conditions are in
browser-native-n3-n10.md. Native host destruction also reproduced one browser-only
owner invalidation defect; direct RED/GREEN and cached registered identity fix.
Browser288 and types/build passed; full run6513passed/14inherited H TEMP failures/
2skips, not GREEN. Fresh independent review no Critical/Important; N10 first-action
identity label is explicitly limited to single invocation rather than native
distinct-callback selection. N7/N9 capabilities and all production gate decisions
remain with the integrator/user.
