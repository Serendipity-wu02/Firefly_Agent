import test from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import * as net from "node:net";
import * as https from "node:https";

import {
  BROWSER_READ_LIMITS,
  type BrowserConnectionEvidence,
  type BrowserProxyEndpoint,
  type BrowserReadResult,
  type BrowserResolvedProxyEndpoint,
} from "../../../dist/main/shared/browser-types.js";
import {
  isAllowedBrowserProxyEndpointAddress,
  normalizeBrowserProxyEndpoint,
  normalizeBrowserUrl,
  resolveBrowserProxyEndpoint,
  resolveBrowserProxyTarget,
} from "../../../dist/main/main/browser/browser-policy.js";
import { BrowserReadBackend } from "../../../dist/main/main/browser/browser-reader.js";
import {
  HttpProxyBrowserTransport,
} from "../../../dist/main/main/browser/http-proxy-browser-transport.js";
import {
  BrowserTransportError,
  type BrowserSingleHopRequest,
} from "../../../dist/main/main/browser/browser-transport.js";
import {
  BROWSER_TEST_CERTIFICATE,
  BROWSER_TEST_PRIVATE_KEY,
} from "./browser-tls-fixture.ts";

function listen(server: net.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("test server did not expose a port"));
        return;
      }
      resolve(address.port);
    });
  });
}

async function closeServer(server: net.Server, sockets: Set<net.Socket> = new Set()): Promise<void> {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
      if (error && code !== "ERR_SERVER_NOT_RUNNING") reject(error);
      else resolve();
    });
  });
}

function endpointAt(hostname: string, port: number): BrowserProxyEndpoint {
  const normalized = normalizeBrowserProxyEndpoint(`http://${hostname}:${port}`);
  assert.equal(normalized.allowed, true);
  if (!normalized.allowed) throw new Error("test proxy endpoint should normalize");
  return normalized.endpoint;
}

function proxyTarget(
  url: string,
  endpoint: BrowserProxyEndpoint,
  addresses = ["127.0.0.1"],
): BrowserResolvedProxyEndpoint {
  return { endpoint, addresses };
}

function extractor(body = "proxy body", title = "Proxy title") {
  return { extract: async () => ({ title, body }) };
}

function makeBackend(
  endpoint: BrowserProxyEndpoint,
  transport: HttpProxyBrowserTransport,
  lookup: (hostname: string) => readonly string[] | Promise<readonly string[]> = () => ["127.0.0.1"],
) {
  return new BrowserReadBackend({
    mode: "http_proxy",
    proxyEndpoint: endpoint,
    dnsResolver: { lookup: async (hostname) => lookup(hostname) },
    transport,
    extractor: extractor(),
    now: () => 1_800_000_000_000,
  });
}

function proxyEvidenceOf(value: BrowserConnectionEvidence) {
  assert.equal(value.mode, "http_proxy");
  if (value.mode !== "http_proxy") throw new Error("expected HTTP proxy evidence");
  return value;
}

function requireConnection(value: BrowserConnectionEvidence | undefined): BrowserConnectionEvidence {
  assert.ok(value, "Browser result should include connection evidence");
  return value;
}

test("proxy policy separates web target validation from local proxy endpoint validation", async () => {
  const endpoint = endpointAt("127.0.0.1", 18_080);
  const resolvedEndpoint = proxyTarget("http://public.example.test/", endpoint);

  assert.equal(isAllowedBrowserProxyEndpointAddress("127.0.0.1"), true);
  assert.equal(isAllowedBrowserProxyEndpointAddress("10.0.0.1"), true);
  assert.equal(isAllowedBrowserProxyEndpointAddress("::1"), true);
  assert.equal(isAllowedBrowserProxyEndpointAddress("fc00::1"), true);
  assert.equal(isAllowedBrowserProxyEndpointAddress("198.18.0.1"), false);
  assert.equal(isAllowedBrowserProxyEndpointAddress("0.0.0.0"), false);
  assert.equal(isAllowedBrowserProxyEndpointAddress("224.0.0.1"), false);
  assert.equal(isAllowedBrowserProxyEndpointAddress("169.254.1.1"), false);

  for (const value of [
    "https://127.0.0.1:8080",
    "http://127.0.0.1",
    "http://user:password@127.0.0.1:8080",
    "http://127.0.0.1:8080/?token=secret",
    "http://127.0.0.1:8080/proxy",
    "http://127.0.0.1:0",
  ]) {
    const invalid = normalizeBrowserProxyEndpoint(value);
    assert.equal(invalid.allowed, false, value);
    if (!invalid.allowed) assert.equal(invalid.reason, "proxy_endpoint_invalid", value);
  }

  const resolverHosts: string[] = [];
  const endpointDecision = await resolveBrowserProxyEndpoint(
    endpointAt("proxy.test", 18_081),
    { lookup: async (hostname) => { resolverHosts.push(hostname); return ["127.0.0.1"]; } },
  );
  assert.equal(endpointDecision.allowed, true);
  assert.deepEqual(resolverHosts, ["proxy.test"]);

  const publicTarget = resolveBrowserProxyTarget("HTTPS://PUBLIC.Example.Test./", resolvedEndpoint);
  assert.equal(publicTarget.allowed, true);
  if (publicTarget.allowed) {
    assert.equal(publicTarget.target.mode, "http_proxy");
    assert.equal(publicTarget.target.url.hostname, "public.example.test.");
    assert.deepEqual(publicTarget.target.proxyEndpoint.addresses, ["127.0.0.1"]);
  }

  for (const value of [
    "http://localhost/",
    "http://child.localhost/",
    "http://printer.local/",
    "http://router.home.arpa/",
    "http://single-label/",
    "http://127.0.0.1/",
    "http://[::1]/",
  ]) {
    const blocked = resolveBrowserProxyTarget(value, resolvedEndpoint);
    assert.equal(blocked.allowed, false, value);
    if (!blocked.allowed) {
      assert.equal(
        blocked.reason,
        value.includes("127.0.0.1") || value.includes("::1") ? "non_public_target" : "proxy_target_hostname_not_allowed",
        value,
      );
    }
  }
});

test("HTTP proxy uses absolute-form GET, target Host, and no target DNS", async () => {
  let observedMethod: string | undefined;
  let observedUrl: string | undefined;
  let observedHeaders: http.IncomingHttpHeaders | undefined;
  let requestCount = 0;
  const lookupHosts: string[] = [];
  const server = http.createServer((request, response) => {
    requestCount += 1;
    observedMethod = request.method;
    observedUrl = request.url;
    observedHeaders = request.headers;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end("<html><head><title>Proxy</title></head><body>body</body></html>");
  });
  const port = await listen(server);
  const transport = new HttpProxyBrowserTransport();
  const backend = makeBackend(endpointAt("proxy.test", port), transport, (hostname) => {
    lookupHosts.push(hostname);
    return ["127.0.0.1"];
  });
  try {
    const result = await backend.read({ requestUrl: "http://public.example.test/path?q=1" });
    assert.equal(result.status, "succeeded");
    assert.equal(observedMethod, "GET");
    assert.equal(observedUrl, "http://public.example.test/path?q=1");
    assert.equal(observedHeaders?.host, "public.example.test");
    assert.equal(observedHeaders?.["accept-encoding"], "identity");
    assert.equal(observedHeaders?.cookie, undefined);
    assert.equal(observedHeaders?.authorization, undefined);
    assert.equal(observedHeaders?.["proxy-authorization"], undefined);
    assert.equal(requestCount, 1);
    assert.deepEqual(lookupHosts, ["proxy.test"]);
    const evidence = proxyEvidenceOf(requireConnection(result.connection));
    assert.equal(evidence.operation, "forward");
    assert.equal(evidence.proxyMatchesEndpoint, true);
    assert.equal(evidence.targetAddress, "not_observed");
    assert.equal(evidence.tls, undefined);
  } finally {
    await backend.dispose();
    await closeServer(server);
  }
});

test("proxy redirects stay on the original Origin and do not resolve the web target locally", async () => {
  const seen: string[] = [];
  const lookupHosts: string[] = [];
  const server = http.createServer((request, response) => {
    seen.push(request.url ?? "");
    if (seen.length === 1) {
      response.statusCode = 302;
      response.setHeader("Location", "/next");
      response.end();
      return;
    }
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end("redirected");
  });
  const port = await listen(server);
  const backend = makeBackend(endpointAt("proxy.test", port), new HttpProxyBrowserTransport(), (hostname) => {
    lookupHosts.push(hostname);
    return ["127.0.0.1"];
  });
  try {
    const result = await backend.read({ requestUrl: "http://public.example.test/start" });
    assert.equal(result.status, "succeeded");
    assert.equal(result.redirectCount, 1);
    assert.deepEqual(seen, ["http://public.example.test/start", "http://public.example.test/next"]);
    assert.deepEqual(lookupHosts, ["proxy.test"]);
  } finally {
    await backend.dispose();
    await closeServer(server);
  }

  const crossServer = http.createServer((_request, response) => {
    response.statusCode = 302;
    response.setHeader("Location", "http://other.example.test/");
    response.end();
  });
  const crossPort = await listen(crossServer);
  const crossBackend = makeBackend(endpointAt("proxy.test", crossPort), new HttpProxyBrowserTransport());
  try {
    const cross = await crossBackend.read({ requestUrl: "http://public.example.test/start" });
    assert.equal(cross.status, "blocked");
    assert.equal(cross.reason, "redirect_blocked");
  } finally {
    await crossBackend.dispose();
    await closeServer(crossServer);
  }
});

test("proxy authentication and forwarding rejection are not retried or converted to success", async () => {
  const server = http.createServer((_request, response) => {
    response.statusCode = 407;
    response.setHeader("Proxy-Authenticate", "Basic realm=proxy");
    response.end("auth required");
  });
  const port = await listen(server);
  const backend = makeBackend(endpointAt("proxy.test", port), new HttpProxyBrowserTransport());
  try {
    const result = await backend.read({ requestUrl: "http://public.example.test/" });
    assert.equal(result.status, "failed");
    assert.equal(result.reason, "proxy_auth_required");
  } finally {
    await backend.dispose();
    await closeServer(server);
  }

  const rejectingSockets = new Set<net.Socket>();
  const rejecting = net.createServer((socket) => {
    rejectingSockets.add(socket);
    socket.once("data", () => socket.destroy());
  });
  const rejectingPort = await listen(rejecting);
  const rejectingBackend = makeBackend(endpointAt("proxy.test", rejectingPort), new HttpProxyBrowserTransport());
  try {
    const result = await rejectingBackend.read({ requestUrl: "http://public.example.test/" });
    assert.equal(result.status, "failed");
    assert.equal(result.reason, "proxy_rejected");
  } finally {
    await rejectingBackend.dispose();
    await closeServer(rejecting, rejectingSockets);
  }
});

function connectProxy(targetPort: number, rejectConnect = false): { server: net.Server; sockets: Set<net.Socket> } {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    let buffered = Buffer.alloc(0);
    const onData = (chunk: Buffer): void => {
      buffered = Buffer.concat([buffered, chunk]);
      const headerEnd = buffered.indexOf(Buffer.from("\r\n\r\n"));
      if (headerEnd < 0) return;
      socket.off("data", onData);
      const requestHead = buffered.subarray(0, headerEnd).toString("latin1");
      const remainder = buffered.subarray(headerEnd + 4);
      if (!requestHead.startsWith("CONNECT ")) {
        socket.destroy();
        return;
      }
      if (rejectConnect) {
        socket.end("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        return;
      }
      const upstream = net.connect(targetPort, "127.0.0.1", () => {
        socket.write("HTTP/1.1 200 Connection Established\r\nProxy-Agent: Firefly-Test\r\n\r\n");
        if (remainder.byteLength > 0) upstream.write(remainder);
        socket.pipe(upstream);
        upstream.pipe(socket);
      });
      upstream.once("error", () => socket.destroy());
      socket.once("close", () => upstream.destroy());
    };
    socket.on("data", onData);
  });
  return { server, sockets };
}

test("HTTPS proxy CONNECT validates target TLS and keeps target IP unobserved", async () => {
  let targetHost: string | undefined;
  const target = https.createServer({ key: BROWSER_TEST_PRIVATE_KEY, cert: BROWSER_TEST_CERTIFICATE }, (request, response) => {
    targetHost = request.headers.host;
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end("tls through proxy");
  });
  const targetPort = await listen(target);
  const proxy = connectProxy(targetPort);
  const proxyPort = await listen(proxy.server);
  const lookupHosts: string[] = [];
  const transport = new HttpProxyBrowserTransport({ caForTest: BROWSER_TEST_CERTIFICATE });
  const backend = makeBackend(endpointAt("proxy.test", proxyPort), transport, (hostname) => {
    lookupHosts.push(hostname);
    return ["127.0.0.1"];
  });
  try {
    const result = await backend.read({ requestUrl: "https://public.example.test/secure" });
    assert.equal(result.status, "succeeded", `${JSON.stringify(result)} targetHost=${targetHost ?? "<none>"}`);
    assert.equal(result.body, "proxy body");
    assert.equal(targetHost, "public.example.test");
    assert.deepEqual(lookupHosts, ["proxy.test"]);
    const evidence = proxyEvidenceOf(requireConnection(result.connection));
    assert.equal(evidence.operation, "connect");
    assert.equal(evidence.targetAddress, "not_observed");
    assert.equal(evidence.tls?.verified, true);
    assert.equal(evidence.tls?.serverName, "public.example.test");
  } finally {
    await backend.dispose();
    await closeServer(proxy.server, proxy.sockets);
    await closeServer(target);
  }
});

test("CONNECT target certificate mismatch and non-success CONNECT are explicit failures", async () => {
  const target = https.createServer({ key: BROWSER_TEST_PRIVATE_KEY, cert: BROWSER_TEST_CERTIFICATE }, (_request, response) => {
    response.end("should not be trusted");
  });
  const targetPort = await listen(target);
  const proxy = connectProxy(targetPort);
  const proxyPort = await listen(proxy.server);
  const mismatchBackend = makeBackend(
    endpointAt("proxy.test", proxyPort),
    new HttpProxyBrowserTransport({ caForTest: BROWSER_TEST_CERTIFICATE }),
  );
  try {
    const mismatch = await mismatchBackend.read({ requestUrl: "https://mismatch.example.test/" });
    assert.equal(mismatch.status, "failed");
    assert.equal(mismatch.reason, "tls_certificate_invalid");
    if (mismatch.connection) {
      const evidence = proxyEvidenceOf(mismatch.connection);
      assert.equal(evidence.tls, undefined);
    }

    const ipMismatch = await mismatchBackend.read({ requestUrl: "https://93.184.216.34/" });
    assert.equal(ipMismatch.status, "failed");
    assert.equal(ipMismatch.reason, "tls_certificate_invalid");
    if (ipMismatch.connection) {
      const evidence = proxyEvidenceOf(ipMismatch.connection);
      assert.equal(evidence.tls, undefined);
    }
  } finally {
    await mismatchBackend.dispose();
  }

  const rejectingProxy = connectProxy(targetPort, true);
  const rejectingPort = await listen(rejectingProxy.server);
  const rejectingBackend = makeBackend(endpointAt("proxy.test", rejectingPort), new HttpProxyBrowserTransport());
  try {
    const rejected = await rejectingBackend.read({ requestUrl: "https://public.example.test/" });
    assert.equal(rejected.status, "failed");
    assert.equal(rejected.reason, "proxy_connect_rejected");
    assert.equal(rejected.httpStatus, 403);
  } finally {
    await rejectingBackend.dispose();
    await closeServer(rejectingProxy.server, rejectingProxy.sockets);
    await closeServer(proxy.server, proxy.sockets);
    await closeServer(target);
  }
});

test("proxy cancellation and total timeout release a pending CONNECT without fallback", async () => {
  const sockets = new Set<net.Socket>();
  let connectedResolve: (() => void) | undefined;
  const connected = new Promise<void>((resolve) => { connectedResolve = resolve; });
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    connectedResolve?.();
    socket.on("data", () => undefined);
  });
  const port = await listen(server);
  const transport = new HttpProxyBrowserTransport();
  const backend = makeBackend(endpointAt("proxy.test", port), transport);
  const controller = new AbortController();
  const pending = backend.read({ requestUrl: "https://public.example.test/" }, controller.signal);
  await connected;
  controller.abort();
  const cancelled = await pending;
  assert.equal(cancelled.status, "cancelled");
  await backend.dispose();
  await backend.dispose();
  await closeServer(server, sockets);

  const timeoutSockets = new Set<net.Socket>();
  const timeoutServer = net.createServer((socket) => {
    timeoutSockets.add(socket);
    socket.once("close", () => timeoutSockets.delete(socket));
    socket.on("data", () => undefined);
  });
  const timeoutPort = await listen(timeoutServer);
  const timeoutBackend = new BrowserReadBackend({
    mode: "http_proxy",
    proxyEndpoint: endpointAt("proxy.test", timeoutPort),
    dnsResolver: { lookup: async () => ["127.0.0.1"] },
    transport: new HttpProxyBrowserTransport(),
    extractor: extractor(),
    limits: { ...BROWSER_READ_LIMITS, totalTimeoutMs: 50 },
  });
  try {
    const timedOut = await timeoutBackend.read({ requestUrl: "https://public.example.test/" });
    assert.equal(timedOut.status, "timed_out");
    assert.equal(timedOut.reason, "timeout");
  } finally {
    await timeoutBackend.dispose();
    await closeServer(timeoutServer, timeoutSockets);
  }
});

test("proxy transport rejects direct targets instead of silently falling back", async () => {
  const endpoint = proxyTarget("http://public.example.test/", endpointAt("127.0.0.1", 18_082));
  const transport = new HttpProxyBrowserTransport();
  const normalized = normalizeBrowserUrl("http://public.example.test/page");
  assert.equal(normalized.allowed, true);
  if (!normalized.allowed) throw new Error("test target should normalize");
  const directRequest: BrowserSingleHopRequest = {
    target: { mode: "direct", url: normalized.url, addresses: ["93.184.216.34"] },
    signal: new AbortController().signal,
    remainingMs: 5_000,
    remainingResponseBytes: BROWSER_READ_LIMITS.maxResponseBytes,
    maxResponseHeaderBytes: BROWSER_READ_LIMITS.maxResponseHeaderBytes,
  };
  await assert.rejects(
    transport.request(directRequest),
    (error: unknown) => error instanceof BrowserTransportError && error.reason === "transport_unavailable",
  );
  await transport.dispose();
  assert.equal(endpoint.addresses.length, 1);
});

test("successful CONNECT is not confused with a page response", async () => {
  const server = net.createServer((socket) => {
    socket.once("data", () => {
      socket.end("HTTP/1.1 200 Connection Established\r\n\r\n");
    });
  });
  const port = await listen(server);
  const backend = makeBackend(endpointAt("proxy.test", port), new HttpProxyBrowserTransport());
  try {
    const result: BrowserReadResult = await backend.read({ requestUrl: "https://public.example.test/" });
    assert.equal(result.status, "failed");
    assert.notEqual(result.reason, "read_complete");
  } finally {
    await backend.dispose();
    await closeServer(server);
  }
});
