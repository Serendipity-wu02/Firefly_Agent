import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  BROWSER_READ_LIMITS,
  type BrowserDnsResolver,
  type BrowserReadLimits,
  type BrowserReadResult,
  type BrowserResolvedTarget,
} from "../../../dist/main/shared/browser-types.js";
import {
  isPublicBrowserAddress,
  normalizeBrowserIpAddress,
  normalizeBrowserUrl,
  resolveBrowserTarget,
} from "../../../dist/main/main/browser/browser-policy.js";
import {
  BrowserReadBackend,
  type BrowserContentExtractor,
} from "../../../dist/main/main/browser/browser-reader.js";
import {
  BrowserTransportError,
  type BrowserSingleHopRequest,
  type BrowserSingleHopResponse,
  type BrowserSingleHopTransport,
} from "../../../dist/main/main/browser/browser-transport.js";

const projectRoot = process.cwd();

function resolverFor(
  lookup: (hostname: string, signal?: AbortSignal) => readonly string[] | Promise<readonly string[]> =
    () => ["93.184.216.34"],
): BrowserDnsResolver {
  return { lookup: async (hostname, signal) => lookup(hostname, signal) };
}

function connection(selectedAddress = "93.184.216.34") {
  return {
    mode: "direct" as const,
    selectedAddress,
    connectedAddress: selectedAddress,
    matchesTarget: true as const,
  };
}

function response(
  overrides: Partial<BrowserSingleHopResponse> = {},
): BrowserSingleHopResponse {
  return {
    statusCode: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: Buffer.from("<html><body>Static body</body></html>", "utf8"),
    connection: connection(),
    ...overrides,
  };
}

class FakeTransport implements BrowserSingleHopTransport {
  public readonly calls: BrowserSingleHopRequest[] = [];
  public cancelCount = 0;
  public disposeCount = 0;
  private readonly run: (input: BrowserSingleHopRequest) => Promise<BrowserSingleHopResponse>;

  public constructor(run: (input: BrowserSingleHopRequest) => Promise<BrowserSingleHopResponse>) {
    this.run = run;
  }

  public request(input: BrowserSingleHopRequest): Promise<BrowserSingleHopResponse> {
    this.calls.push(input);
    return this.run(input);
  }

  public cancel(): void {
    this.cancelCount += 1;
  }

  public async dispose(): Promise<void> {
    this.disposeCount += 1;
  }
}

function extractorFor(
  extraction: BrowserContentExtractor["extract"],
): BrowserContentExtractor {
  return { extract: extraction };
}

function backendFor(
  run: (input: BrowserSingleHopRequest) => Promise<BrowserSingleHopResponse>,
  options: {
    lookup?: (hostname: string, signal?: AbortSignal) => readonly string[] | Promise<readonly string[]>;
    limits?: BrowserReadLimits;
    extractor?: BrowserContentExtractor;
  } = {},
): { backend: BrowserReadBackend; transport: FakeTransport } {
  const transport = new FakeTransport(run);
  return {
    transport,
    backend: new BrowserReadBackend({
      dnsResolver: resolverFor(options.lookup),
      transport,
      extractor: options.extractor,
      limits: options.limits,
      now: () => 1_700_000_000_000,
    }),
  };
}

function okExtraction(title = "Title", body = "Static body") {
  return extractorFor(async () => ({ title, body }));
}

test("URL normalization only permits HTTP(S) default ports and removes fragments", () => {
  const normalized = normalizeBrowserUrl("HTTPS://Example.com:443/path?q=1#section");
  assert.equal(normalized.allowed, true);
  if (normalized.allowed) {
    assert.equal(normalized.url.href, "https://example.com/path?q=1");
    assert.equal(normalized.url.origin, "https://example.com");
    assert.equal(normalized.url.port, 443);
  }
  for (const [url, reason] of [
    ["file:///C:/secret.txt", "protocol_not_allowed"],
    ["https://user:password@example.com", "credentials_not_allowed"],
    ["http://example.com:8080", "port_not_allowed"],
    ["https://example.com:8443", "port_not_allowed"],
  ] as const) {
    const decision = normalizeBrowserUrl(url);
    assert.equal(decision.allowed, false);
    if (!decision.allowed) assert.equal(decision.reason, reason);
  }
});

test("CIDR policy covers special-purpose boundaries, IPv6 transitions, and mapped IPv4", () => {
  const cases: readonly [string, boolean][] = [
    ["9.255.255.255", true], ["10.0.0.0", false], ["10.255.255.255", false], ["11.0.0.0", true],
    ["100.63.255.255", true], ["100.64.0.0", false], ["100.127.255.255", false], ["100.128.0.0", true],
    ["127.0.0.0", false], ["169.253.255.255", true], ["169.254.0.0", false], ["172.15.255.255", true], ["172.16.0.0", false],
    ["192.0.0.0", false], ["192.0.1.255", true], ["192.0.2.0", false], ["192.0.3.0", true],
    ["192.168.0.0", false], ["192.167.255.255", true], ["198.17.255.255", true], ["198.18.0.0", false],
    ["198.51.100.0", false], ["203.0.113.0", false], ["223.255.255.255", true], ["224.0.0.0", false], ["239.255.255.255", false], ["240.0.0.0", false],
    ["::1", false], ["::", false], ["2001:db7::1", true], ["2001:db8::1", false], ["2001:2::1", false], ["2002::1", false],
    ["64:ff9b::1", false], ["2001:4860:4860::8888", true], ["fc00::1", false], ["fe80::1", false], ["ff02::1", false],
    ["::ffff:10.0.0.1", false], ["::ffff:192.0.2.1", false], ["::ffff:8.8.8.8", true],
  ];
  for (const [address, expected] of cases) assert.equal(isPublicBrowserAddress(address), expected, address);
  assert.equal(normalizeBrowserIpAddress("2001:0db8:0:0:0:0:0:1"), "2001:db8::1");
  assert.equal(normalizeBrowserIpAddress("::ffff:8.8.8.8"), "8.8.8.8");
});

test("every DNS answer is checked before a transport request", async () => {
  const mixed = await resolveBrowserTarget("https://example.com", resolverFor(() => ["93.184.216.34", "192.168.1.10"]));
  assert.equal(mixed.allowed, false);
  if (!mixed.allowed) assert.equal(mixed.reason, "non_public_target");

  let transportCalls = 0;
  const { backend } = backendFor(async () => {
    transportCalls += 1;
    return response();
  }, { lookup: () => ["93.184.216.34", "203.0.113.1"] });
  const result = await backend.read({ requestUrl: "https://example.com" });
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "non_public_target");
  assert.equal(transportCalls, 0);
});

test("the validated address is passed to one single-hop transport without a second DNS lookup", async () => {
  let lookupCount = 0;
  const { backend, transport } = backendFor(async (input) => {
    assert.equal(input.target.mode, "direct");
    if (input.target.mode !== "direct") throw new Error("expected a direct target");
    assert.deepEqual(input.target.addresses, ["93.184.216.34"]);
    return response();
  }, {
    lookup: () => {
      lookupCount += 1;
      return ["93.184.216.34"];
    },
    extractor: okExtraction(),
  });
  const result = await backend.read({ requestUrl: "https://example.com/page" });
  assert.equal(result.status, "succeeded");
  assert.equal(lookupCount, 1);
  assert.equal(transport.calls.length, 1);
  const target = transport.calls[0]?.target;
  assert.equal(target?.mode, "direct");
  if (target?.mode === "direct") assert.deepEqual(target.addresses, ["93.184.216.34"]);
});

test("relative redirects are resolved from the current URL and revalidated", async () => {
  const seen: string[] = [];
  const { backend } = backendFor(async (input) => {
    seen.push(input.target.url.href);
    if (seen.length === 1) return response({ statusCode: 302, headers: { location: "/next", "content-length": "0" }, body: Buffer.alloc(0) });
    return response({ body: Buffer.from("<html><body>done</body></html>") });
  }, { extractor: okExtraction("Title", "done") });
  const result = await backend.read({ requestUrl: "https://example.com/start" });
  assert.equal(result.status, "succeeded");
  assert.equal(result.redirectCount, 1);
  assert.deepEqual(seen, ["https://example.com/start", "https://example.com/next"]);
});

test("redirect loops count every hop and cross-origin or DNS changes are blocked", async () => {
  const loop = backendFor(async () => response({ statusCode: 301, headers: { location: "/same" }, body: Buffer.alloc(0) }), { extractor: okExtraction() });
  const loopResult = await loop.backend.read({ requestUrl: "https://example.com/start" });
  assert.equal(loopResult.status, "blocked");
  assert.equal(loopResult.reason, "redirect_limit_exceeded");
  assert.equal(loopResult.redirectCount, 3);

  const cross = backendFor(async () => response({ statusCode: 302, headers: { location: "https://other.example/page" }, body: Buffer.alloc(0) }), { extractor: okExtraction() });
  const crossResult = await cross.backend.read({ requestUrl: "https://example.com/start" });
  assert.equal(crossResult.status, "blocked");
  assert.equal(crossResult.reason, "redirect_blocked");

  let lookupCount = 0;
  const rebound = backendFor(async () => response({ statusCode: 302, headers: { location: "/private" }, body: Buffer.alloc(0) }), {
    lookup: () => {
      lookupCount += 1;
      return lookupCount === 1 ? ["93.184.216.34"] : ["192.168.1.10"];
    },
    extractor: okExtraction(),
  });
  const reboundResult = await rebound.backend.read({ requestUrl: "https://example.com/start" });
  assert.equal(reboundResult.status, "blocked");
  assert.equal(reboundResult.reason, "non_public_target");
  assert.equal(lookupCount, 2);
});

test("status, content type, encoding, charset, and empty body have separate results", async () => {
  const status = backendFor(async () => response({ statusCode: 500 }));
  assert.equal((await status.backend.read({ requestUrl: "https://example.com" })).reason, "http_status_error");
  const binary = backendFor(async () => response({ headers: { "content-type": "application/octet-stream" } }));
  assert.equal((await binary.backend.read({ requestUrl: "https://example.com" })).reason, "unsupported_content_type");
  const compressed = backendFor(async () => response({ headers: { "content-type": "text/html", "content-encoding": "gzip" } }));
  assert.equal((await compressed.backend.read({ requestUrl: "https://example.com" })).reason, "unsupported_content_encoding");
  const charset = backendFor(async () => response({ headers: { "content-type": "text/html; charset=gbk" } }));
  assert.equal((await charset.backend.read({ requestUrl: "https://example.com" })).reason, "unsupported_charset");
  const empty = backendFor(async () => response({ body: Buffer.from("<html><body> </body></html>") }), { extractor: okExtraction("", " ") });
  assert.equal((await empty.backend.read({ requestUrl: "https://example.com" })).reason, "empty_body");

  const plain = backendFor(async () => response({
    headers: { "content-type": "text/plain; charset=utf-8" },
    body: Buffer.from("plain 😀 text", "utf8"),
  }));
  const plainResult = await plain.backend.read({ requestUrl: "https://example.com" });
  assert.equal(plainResult.status, "succeeded");
  assert.equal(plainResult.body, "plain 😀 text");
});

test("streaming response limits reject overflow and header limits are explicit", async () => {
  const { backend } = backendFor(async (input) => {
    assert.equal(input.remainingResponseBytes, BROWSER_READ_LIMITS.maxResponseBytes);
    throw new BrowserTransportError("response_too_large", "overflow", {
      statusCode: 200,
      connection: connection(),
    });
  });
  const result = await backend.read({ requestUrl: "https://example.com" });
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "response_too_large");

  const headers = backendFor(async () => {
    throw new BrowserTransportError("response_headers_too_large", "headers", {
      statusCode: 200,
      connection: connection(),
    });
  });
  assert.equal((await headers.backend.read({ requestUrl: "https://example.com" })).reason, "response_headers_too_large");
});

test("static extraction uses AST output, excludes script/style text, and truncates by code point", async () => {
  const { backend } = backendFor(async () => response({
    body: Buffer.from("<html><head><title>😀 title</title><script>ignore()</script></head><body><style>hidden</style><p>😀 visible text</p></body></html>"),
  }));
  const result = await backend.read({ requestUrl: "https://example.com" });
  assert.equal(result.status, "succeeded");
  assert.equal(result.title, "😀 title");
  assert.equal(result.body, "😀 visible text");
  assert.equal(result.untrustedContent, true);

  const limits: BrowserReadLimits = { ...BROWSER_READ_LIMITS, maxTitleCodePoints: 2, maxBodyCodePoints: 2 };
  const bounded = backendFor(async () => response(), { limits, extractor: okExtraction("😀中a", "😀中a") });
  const boundedResult = await bounded.backend.read({ requestUrl: "https://example.com" });
  assert.equal(boundedResult.title, "😀中");
  assert.equal(boundedResult.body, "😀中");
  assert.equal(boundedResult.titleTruncated, true);
  assert.equal(boundedResult.bodyTruncated, true);
});

test("DNS hang, response hang, parent cancellation, and timeout cannot produce a connection", async () => {
  let transportCalls = 0;
  const { backend: dnsBackend } = backendFor(async () => {
    transportCalls += 1;
    return response();
  }, {
    lookup: async (_hostname, signal) => await new Promise<readonly string[]>((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new Error("late DNS")), { once: true });
    }),
  });
  const dnsController = new AbortController();
  const dnsPromise = dnsBackend.read({ requestUrl: "https://example.com" }, dnsController.signal);
  dnsController.abort();
  const dnsResult = await dnsPromise;
  assert.equal(dnsResult.status, "cancelled");
  assert.equal(transportCalls, 0);

  const timeout = backendFor(async () => {
    transportCalls += 1;
    return response();
  }, {
    lookup: async () => await new Promise<readonly string[]>(() => undefined),
    limits: { ...BROWSER_READ_LIMITS, totalTimeoutMs: 10 },
  });
  const timeoutResult = await timeout.backend.read({ requestUrl: "https://example.com" });
  assert.equal(timeoutResult.status, "timed_out");
  assert.equal(timeoutResult.reason, "timeout");
  assert.equal(transportCalls, 0);

  let release: (() => void) | undefined;
  const hanging = backendFor(async (input) => await new Promise<BrowserSingleHopResponse>((resolve, reject) => {
    release = () => resolve(response());
    input.signal.addEventListener("abort", () => reject(new BrowserTransportError("cancelled", "cancelled")), { once: true });
  }));
  const controller = new AbortController();
  const pending = hanging.backend.read({ requestUrl: "https://example.com" }, controller.signal);
  controller.abort();
  const cancelled = await pending;
  assert.equal(cancelled.status, "cancelled");
  assert.equal(hanging.transport.cancelCount, 1);
  release?.();
});

test("late successful transport data cannot replace a terminal cancellation", async () => {
  let resolveLate: ((value: BrowserSingleHopResponse) => void) | undefined;
  const { backend, transport } = backendFor(async () => await new Promise<BrowserSingleHopResponse>((resolve) => {
    resolveLate = resolve;
  }), { extractor: okExtraction() });
  const controller = new AbortController();
  const pending = backend.read({ requestUrl: "https://example.com" }, controller.signal);
  controller.abort();
  const result = await pending;
  assert.equal(result.status, "cancelled");
  assert.equal(transport.cancelCount, 1);
  resolveLate?.(response());
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(result.reason, "cancelled");
});

test("dispose is idempotent, releases transport, and production Browser routing stays outside Harness", async () => {
  const { backend, transport } = backendFor(async () => response(), { extractor: okExtraction() });
  await backend.dispose();
  await backend.dispose();
  assert.equal(transport.disposeCount, 1);

  const defaultDependencies = fs.readFileSync(path.join(projectRoot, "src", "main", "application", "default-dependencies.ts"), "utf8");
  assert.match(defaultDependencies, /BrowserReadService/u);
  assert.match(defaultDependencies, /createBrowserReadTool/u);
  assert.match(defaultDependencies, /BROWSER_READ_TOOL_ID/u);
  const harness = fs.readFileSync(path.join(projectRoot, "src", "main", "orchestrator", "harness", "firefly-harness.ts"), "utf8");
  assert.doesNotMatch(harness, /BrowserRead|browserRead|browser_read/);
  assert.equal(fs.existsSync(path.join(projectRoot, "src", "main", "browser", "electron-read-session.ts")), false);
  assert.equal(fs.existsSync(path.join(projectRoot, "src", "main", "browser", "native-browser-backend.ts")), false);
});
