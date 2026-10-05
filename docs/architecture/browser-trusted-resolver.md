# Browser trusted resolver: Main integration

This change adds optional `trustedResolver: {server, port}` to
`createElectronBrowserService`. The factory snapshots this trusted Main input and
passes a private `BrowserProxyFactory` to the existing Session/domain controller.
Configuration is not accepted by the browser IPC or renderer command parser.

The approved current-user endpoint is `192.168.31.1:53`. The integrator owns app
config/schema/UI and should carry that explicit user selection into Main only:

```ts
// Main composition: value comes from the explicit approved trusted selection.
// Omit trustedResolver when no selection exists; do not default every user here.
createElectronBrowserService({
  profile: runtimeProfile,
  trustedResolver: approvedBrowserDnsSelection,
  onChanged: existingBrowserChangedPublisher,
  // Production gate stays closed until complete native/egress acceptance.
});
```

The named selection/publisher above describe integrator inputs, not new product
identifiers or existing settings fields. This branch does not create a settings
field, read renderer configuration, change system DNS, edit Clash/TUN or install
certificate roots. Existing callers without the option retain OS resolution.

Each admitted hostname lookup has its own independent Node `Resolver` with one
configured numeric unicast DNS endpoint, timeout 1000ms and two tries. Both A and
AAAA are collected concurrently; only `ENODATA` means an empty family. NXDOMAIN,
SERVFAIL, refusal and other DNS errors fail the entire lookup. The owned 5000ms
deadline cancels that lookup's channel, without cancelling siblings. Owner abort
or explicit proxy revoke cancels all channels belonging to the binding and stops
further queries. No DNS, proxy, fake-IP or DIRECT fallback exists.

Admission is shared across all trusted bindings: at most 32 unresolved lookups
(up to 64 native A/AAAA operations). A cancelled or timed-out waiter retains its
slot until both native operations actually settle. The original CONNECT budget
also remains unchanged. This avoids growing unresolved work through repeated
cancellation and binding recreation.

The configured DNS infrastructure may be private. Webpage destinations still
pass the unchanged complete-answer public-address and family validation before
any dial; mixed private, mapped and fake-IP answers deny the entire destination.
The socket connects to a validated numeric IP and verifies its real remote peer.
Chromium sees the original hostname and verifies ordinary end-to-end TLS through
the tunnel. No TLS interception or verification override is introduced.

Native certificate denial is shared by guest and App via
`rejectBrowserCertificate`: Electron forwards the same one-time callback to the
guest before application listeners, so both boundaries prevent default but answer
false once. The weak callback identity set retains no finished requests. This
fix was required by actual expired-certificate acceptance of the trusted route.

Use the existing owner/host lifecycle and shutdown wiring from
[browser-service-integration.md](browser-service-integration.md). DNS-domain
disclosure to the chosen resolver is part of the user's explicit approval.

Exact Node API reference:
[Node 24.19.0 DNS](https://nodejs.org/download/release/v24.19.0/docs/api/dns.html).
Acceptance evidence and remaining gate limitations are in
[browser-trusted-resolver.md](../testing/browser-trusted-resolver.md).

## Explicit Main startup selection

`src/main/browser/browser-startup-config.ts` is now used by the normal Main
composition in `application/default-dependencies.ts`. It reads only the launch
process's `FIREFLY_BROWSER_DNS_SERVER` and optional `FIREFLY_BROWSER_DNS_PORT`.
No selection returns `undefined`; no router address is a default for other users.
An explicitly selected numeric IP uses port53 when the port is omitted. Malformed
addresses/ports reject before constructing the service; the trusted proxy factory
also enforces its unchanged unicast infrastructure validation. The config is
snapshotted and frozen. Additional fields cannot grant a gate or change the
renderer/URL/IPC contract. Existing settings and user data are not rewritten.

The current user's approved selection is server `192.168.31.1`, port `53`, set
only on the isolated QA process for this verification. DNS-domain disclosure is
covered by that explicit approval. The production gate remains omitted: these
variables do not enable browsing, and no production instance was restarted.

Numeric parsing follows the pinned [Node24.19.0 net.isIP contract](https://nodejs.org/download/release/v24.19.0/docs/api/net.html#netisipinput).
Integrated verification: [shared resolver checkpoint](../testing/browser-resolver-shared-integration.md).
