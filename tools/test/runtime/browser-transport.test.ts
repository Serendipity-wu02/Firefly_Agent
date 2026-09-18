import test from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import * as https from "node:https";

import {
  BROWSER_READ_LIMITS,
  type BrowserConnectionEvidence,
  type BrowserResolvedTarget,
} from "../../../dist/main/shared/browser-types.js";
import { normalizeBrowserUrl } from "../../../dist/main/main/browser/browser-policy.js";
import {
  BrowserTransportError,
  NodeBrowserTransport,
  type BrowserSingleHopRequest,
} from "../../../dist/main/main/browser/browser-transport.js";

const CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIDPTCCAiWgAwIBAgIUZrlSTAomSSkGKulUy8bLggs0f7IwDQYJKoZIhvcNAQEL
BQAwHjEcMBoGA1UEAwwTcHVibGljLmV4YW1wbGUudGVzdDAeFw0yNjA5MTQwNTU5
MDNaFw0zNjA5MTEwNTU5MDNaMB4xHDAaBgNVBAMME3B1YmxpYy5leGFtcGxlLnRl
c3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDdvC3DjEWe8/JNDMP/
ez/C0y6MUVbbovR6oc8PQZZ5UoMkC9sDCQMmNDPjfWtX9jUGMbUpTs9xtoyINakK
UhUQveIZfHVKpjjM0ZJ2TrjHtOkOel5+8aWbzK5d/RamEEoIb4QoqcFIFi0U9+kE
3UNxmFiKeafRQK8LxGkf5IetgoRtRpNorsKRfxXBYH9h1C0jip0tdqNxcfOt/iMM
TksfVSis4dzAw2rc0I92BoORRgQDfKOycVRZOvo3G2b2yKesznF6BrK1I4To+M1T
ntNYzedNS8XeqXiAtlaX0vD0/5p2NooA19uDwEj+csxjNZMMDemGJDO2uymVM2To
AKlDAgMBAAGjczBxMB0GA1UdDgQWBBQhjWw4mVUfkPPpkUhZXrD7xYcj4jAfBgNV
HSMEGDAWgBQhjWw4mVUfkPPpkUhZXrD7xYcj4jAPBgNVHRMBAf8EBTADAQH/MB4G
A1UdEQQXMBWCE3B1YmxpYy5leGFtcGxlLnRlc3QwDQYJKoZIhvcNAQELBQADggEB
ABQ8r2GCFQHyYIj+Yv2x4cvQuW9p2sDN7AXCESY+jY9uAHAiY/e7xOfZfx7PBksA
4ONrF4TCVHx20t9ix77X3F7pcWvp+hWHvjYRQ1R6LJgaGniZQpd/CXgydpzrrQ3v
8uDi5Fz//FBRZt/jmgKzhUVsJsEGff6861YXe0Dw3hOdsICA0kHRL014IVk1QUpT
Pov91YEeVhtwPg1sYbGEBnV0U4FD0M3qBfbXUHWZmbMAfFSg1+pPtCPdRts4v40k
G0ZJ0TfbeVPrdD68K65oTMzx7idT7u1MnX4ViFcCiYRib/ZpeiCPJxaxzuFEG+BA
uKge1BbyYZO8fonInCTt+AY=
-----END CERTIFICATE-----`;

const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDdvC3DjEWe8/JN
DMP/ez/C0y6MUVbbovR6oc8PQZZ5UoMkC9sDCQMmNDPjfWtX9jUGMbUpTs9xtoyI
NakKUhUQveIZfHVKpjjM0ZJ2TrjHtOkOel5+8aWbzK5d/RamEEoIb4QoqcFIFi0U
9+kE3UNxmFiKeafRQK8LxGkf5IetgoRtRpNorsKRfxXBYH9h1C0jip0tdqNxcfOt
/iMMTksfVSis4dzAw2rc0I92BoORRgQDfKOycVRZOvo3G2b2yKesznF6BrK1I4To
+M1TntNYzedNS8XeqXiAtlaX0vD0/5p2NooA19uDwEj+csxjNZMMDemGJDO2uymV
M2ToAKlDAgMBAAECggEAV9lPVFNF3hUOYYJ2QMkm2Nxsa8FqJTipndBvxb6ZjFWp
iWV9DvXKHp++ExpEpiPwnBSjjssfmxDVGr4Py/v7RpfEdY5+teWnSVaarW7A/LZr
Q4Yt3COHFnQAfVJhX8fCXRc5iBbBcfr/P3h9BKVZLC9MnQhX+aqj74iQkccsDgyT
iE68wNFuvUU+5mMgWI3QomxnDydLQyfk2zeMjgAJDGfMK/Ant0o7tm9mdVH2j/Rc
1rP2MvnrZCmfRsA/5ZdIOSfkUqYwOrSPrnkCL2j1w851d3VIqoOoT7g5OSlK/MmK
RAk4HQ6wWgJEkJSSgTjrHZpqXhMR3u2/PF4FajMlKQKBgQD/Pv6iaVs0t8i6/BlV
WXG7modQqAhZZOTqjUw3tSbIj9y5qL1r2lC7ANEKgYS4qw0msLc2az8hrLh1Re9F
CfitkFISUMU4+u+lw8WdpCXxEuhORwHesKHKSvs0GbGmUlSZ7E8e+8qLLlbJ1ADt
Gi+d/DlGEYXuSmX+U23AghRfXQKBgQDeY9g5QGqeolUCwlbxIJZ9UyF5Tp5otRil
H1mhYSVeuhghhhEPkERqqMmCriprZFCoSfBqOOiagzVlAPO/+6s2iQ6DZimJuvGz
hFs4CsdnEmspI/9iYBVHQ475lQdFY7DMhkfhliKqUFGK4+EqIVM2YBnQAWWM6fSV
nANJE/TBHwKBgDrDVfwuJUFNzni98Vck8HowaVa4WLO79rfJL/LjUbp65GYZ4wIh
kNR8q6Ovjc62EqEFrihpKG+oRA87uoo6cXYD8+Ejl0Q3AVU4bRaN4+5MXA8padTK
9XSNLqggAjY4XiHRtaV8cnT4hiKRHGV50dydZNIs1pi1qCWVL39Scz5BAoGAJL1j
/FlbA+gXmUQX7vAOTJgOQKcvXmcEskrSmOmerd6am/c1HFgeJWzLFa7GTUWeWZ8V
e8b5DoW8rXoRyta9+117K1QWaq2avqiQFVsahDmzwHE1AMCU41gS58KqF9mXXMKW
X3tZML/iKMrq6PXmdGY9/XItn7EK+ihzFoCYf8sCgYEAxcW5vcW2vm8UuwnODs5q
sXaAB6VgSJyd99xGbq0MXOsVdOS2Hzfc9zfIIFxIIbIwdCEA6SrD4HZl+HX0Z3uI
cifZLeUeuxT6Q7s//9EQPecWVSrSSieUU4xzZ3mta5RTv1xLE0cL1aOXeoRUHBJ9
dXzXPBbOzNyFFnreDBAdmag=
-----END PRIVATE KEY-----`;

function targetFor(protocol: "http:" | "https:", hostname: string): BrowserResolvedTarget {
  const normalized = normalizeBrowserUrl(`${protocol}//${hostname}/page`);
  assert.equal(normalized.allowed, true);
  if (!normalized.allowed) throw new Error("test target should normalize");
  return { mode: "direct", url: normalized.url, addresses: ["127.0.0.1"] };
}

function requestFor(target: BrowserResolvedTarget, maxBytes = BROWSER_READ_LIMITS.maxResponseBytes): BrowserSingleHopRequest {
  return {
    target,
    signal: new AbortController().signal,
    remainingMs: 5_000,
    remainingResponseBytes: maxBytes,
    maxResponseHeaderBytes: BROWSER_READ_LIMITS.maxResponseHeaderBytes,
  };
}

async function listen(server: http.Server | https.Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not expose a port");
  return address.port;
}

function directEvidenceOf(value: BrowserConnectionEvidence) {
  assert.equal(value.mode, "direct");
  if (value.mode !== "direct") throw new Error("expected direct connection evidence");
  return value;
}

test("HTTP transport binds the selected address, preserves Host, and uses identity encoding", async () => {
  let observedHeaders: http.IncomingHttpHeaders | undefined;
  let lookupCount = 0;
  let requestCount = 0;
  const server = http.createServer((request, response) => {
    requestCount += 1;
    observedHeaders = request.headers;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.write("<html><body>");
    response.end("chunked</body></html>");
  });
  const port = await listen(server);
  const transport = new NodeBrowserTransport({
    endpointForTest: () => ({ port }),
    onLookupForTest: () => { lookupCount += 1; },
  });
  try {
    const result = await transport.request(requestFor(targetFor("http:", "public.example.test")));
    assert.equal(result.statusCode, 200);
    assert.match(Buffer.from(result.body).toString("utf8"), /chunked/);
    const evidence = directEvidenceOf(result.connection);
    assert.equal(evidence.selectedAddress, "127.0.0.1");
    assert.equal(evidence.connectedAddress, "127.0.0.1");
    assert.equal(evidence.matchesTarget, true);
    assert.equal(observedHeaders?.host, "public.example.test");
    assert.equal(observedHeaders?.["accept-encoding"], "identity");
    assert.equal(observedHeaders?.cookie, undefined);
    assert.equal(lookupCount, 1);
    assert.equal(requestCount, 1);
  } finally {
    await transport.dispose();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("streaming response limit rejects chunked overflow and header overflow", async () => {
  const server = http.createServer((request, response) => {
    if (request.url === "/headers") {
      response.setHeader("X-Large", "x".repeat(2_000));
      response.end("small");
      return;
    }
    response.write(Buffer.alloc(4, 1));
    response.end(Buffer.alloc(4, 2));
  });
  const port = await listen(server);
  const transport = new NodeBrowserTransport({ endpointForTest: () => ({ port }) });
  try {
    await assert.rejects(
      transport.request(requestFor(targetFor("http:", "public.example.test"), 5)),
      (error: unknown) => error instanceof BrowserTransportError && error.reason === "response_too_large",
    );
    await assert.rejects(
      transport.request({ ...requestFor(targetFor("http:", "public.example.test")), target: { ...targetFor("http:", "public.example.test"), url: { ...targetFor("http:", "public.example.test").url, href: "http://public.example.test/headers" }, }, maxResponseHeaderBytes: 256 }),
      (error: unknown) => error instanceof BrowserTransportError && error.reason === "response_headers_too_large",
    );
  } finally {
    await transport.dispose();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("HTTPS keeps certificate verification and SNI identity", async () => {
  const server = https.createServer({ key: PRIVATE_KEY, cert: CERTIFICATE }, (_request, response) => {
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end("tls ok");
  });
  const port = await listen(server);
  const transport = new NodeBrowserTransport({
    endpointForTest: () => ({ port }),
    caForTest: CERTIFICATE,
  });
  try {
    const valid = await transport.request(requestFor(targetFor("https:", "public.example.test")));
    assert.equal(Buffer.from(valid.body).toString("utf8"), "tls ok");
    assert.equal(directEvidenceOf(valid.connection).matchesTarget, true);

    await assert.rejects(
      transport.request(requestFor(targetFor("https:", "mismatch.example.test"))),
      (error: unknown) => error instanceof BrowserTransportError && error.reason === "tls_certificate_invalid",
    );
  } finally {
    await transport.dispose();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("transport cancellation destroys a pending local response", async () => {
  const server = http.createServer((_request, _response) => {
    // The client must cancel this request instead of waiting for the server.
  });
  const port = await listen(server);
  const transport = new NodeBrowserTransport({ endpointForTest: () => ({ port }) });
  const controller = new AbortController();
  try {
    const pending = transport.request(requestFor(targetFor("http:", "public.example.test"), 1024));
    controller.abort();
    // The request uses its own signal in requestFor; cancel the owner directly.
    transport.cancel();
    await assert.rejects(pending, (error: unknown) => error instanceof BrowserTransportError);
  } finally {
    await transport.dispose();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
