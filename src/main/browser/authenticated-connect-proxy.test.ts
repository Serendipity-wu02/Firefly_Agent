import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, connect, Socket, type Server } from "node:net";
import { once } from "node:events";
import { startAuthenticatedConnectProxy, type ConnectProxy, type PinnedTarget, type ProxyDependencies } from "./authenticated-connect-proxy";

const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
const publicAnswer = [{ address: "93.184.216.34", family: 4 as const }];
function unresolvedLookups() {
  const entries: Array<{ resolve: () => void; reject: () => void; settled: boolean }> = [];
  let peak = 0;
  const pending = () => entries.filter((entry) => !entry.settled).length;
  const resolve = (_host: string) => {
    let done!: (answers: typeof publicAnswer) => void; let fail!: (error: Error) => void;
    const promise = new Promise<typeof publicAnswer>((yes, no) => { done = yes; fail = no; });
    const entry = { settled: false, resolve: () => { entry.settled = true; done(publicAnswer); }, reject: () => { entry.settled = true; fail(new Error("synthetic lookup rejection")); } };
    entries.push(entry); peak = Math.max(peak, pending()); return promise;
  };
  cleanups.push(async () => { entries.filter((entry) => !entry.settled).forEach((entry) => entry.resolve()); await new Promise<void>((done) => setImmediate(done)); });
  return { resolve, entries, pending, peak: () => peak };
}

async function cancelledLookups(proxy: ConnectProxy, lookups: ReturnType<typeof unresolvedLookups>, attempts: number) {
  const auth = authorization(proxy); let rejected = 0;
  for (let i = 0; i < attempts; i++) {
    const started = lookups.entries.length; let reply: string | undefined;
    const r = await request(proxy, { auth });
    const response = r.response.then((text) => { reply = text; return text; }, () => "closed");
    await vi.waitFor(() => expect(lookups.entries.length > started || reply !== undefined).toBe(true));
    if (reply) { expect(reply).toContain("503"); rejected++; }
    r.socket.resetAndDestroy(); await response; // Force actual server-side close, not only a peer FIN.
    // Real TCP round trip lets the server consume the close/cancellation before
    // the next CONNECT; no mock of server admission or DNS completion.
    const barrier = await request(proxy); expect(await barrier.response).toContain("407"); barrier.socket.destroy();
  }
  return rejected;
}

async function fixture(resolve: ProxyDependencies["resolve"] = vi.fn(async (_host: string) => publicAnswer), transport: { connect?: ProxyDependencies["connect"]; remoteAddress?: string } = {}) {
  let hits = 0; const peers = new Set<Socket>(); const bytes: Buffer[] = [];
  const origin: Server = createServer((socket) => {
    hits++; peers.add(socket); socket.on("error", () => {}); socket.on("close", () => peers.delete(socket));
    socket.on("data", (data) => { bytes.push(data); socket.write(data); });
  });
  origin.listen(0, "127.0.0.1"); await once(origin, "listening");
  const originAddress = origin.address(); if (!originAddress || typeof originAddress === "string") throw new Error("fixture address missing");
  cleanups.push(async () => { peers.forEach((socket) => socket.destroy()); await new Promise<void>((done) => origin.close(() => done())); });
  const targets: PinnedTarget[] = [];
  // Test transport ONLY: records the public numeric pin and routes it to a local
  // echo sink. Production classification is unchanged; no localhost exception.
  const dial = vi.fn((target: PinnedTarget, _signal: AbortSignal) => {
    targets.push(target);
    const socket = connect({ host: "127.0.0.1", port: originAddress.port });
    Object.defineProperty(socket, "remoteAddress", { get: () => transport.remoteAddress ?? target.address });
    return socket;
  });
  const owner = new AbortController();
  const binding = { webContentsId: 19, signal: owner.signal };
  const proxy = await startAuthenticatedConnectProxy(binding, { resolve, connect: transport.connect ?? dial });
  cleanups.push(() => proxy.revoke());
  return { proxy, owner, binding, resolve, dial, targets, bytes, hits: () => hits };
}
function challenge(proxy: ConnectProxy) {
  return { isProxy: true, host: proxy.endpoint.host, port: proxy.endpoint.port, realm: proxy.endpoint.realm, scheme: "basic", webContentsId: 19 };
}
function authorization(proxy: ConnectProxy) {
  const credentials = proxy.credentialsFor(challenge(proxy));
  if (!credentials) throw new Error("fixture credentials unavailable");
  return `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`;
}
async function request(proxy: ConnectProxy, options: { auth?: string; authority?: string; extra?: string; method?: string; allowHalfOpen?: boolean } = {}) {
  const socket = connect({ port: proxy.endpoint.port, host: proxy.endpoint.host, allowHalfOpen: options.allowHalfOpen });
  cleanups.push(async () => { socket.destroy(); });
  socket.on("error", () => {});
  await once(socket, "connect");
  const authority = options.authority ?? "example.com:443";
  const response = new Promise<string>((done, reject) => {
    let text = "";
    socket.on("data", (bytes) => { text += bytes.toString(); if (text.includes("\r\n\r\n")) done(text); });
    socket.once("close", () => { if (!text) reject(new Error("closed without response")); });
  });
  const host = options.method === "GET" ? "example.com" : authority;
  socket.write(`${options.method ?? "CONNECT"} ${authority} HTTP/1.1\r\nHost: ${host}\r\n${options.auth ? `Proxy-Authorization: ${options.auth}\r\n` : ""}${options.extra ?? ""}\r\n`);
  return { socket, response };
}

describe("authenticated CONNECT proxy: actual local TCP + injected public pin", () => {
  it.each([undefined, "Basic wrong", "Bearer wrong"])("rejects credentials %s without DNS or upstream socket", async (auth) => {
    const f = await fixture(); const r = await request(f.proxy, { auth });
    expect(await r.response).toContain("407"); expect(f.resolve).not.toHaveBeenCalled(); expect(f.dial).not.toHaveBeenCalled(); expect(f.hits()).toBe(0);
  });
  it("does not accept another binding's token", async () => {
    const a = await fixture(); const b = await fixture(); const r = await request(a.proxy, { auth: authorization(b.proxy) });
    expect(await r.response).toContain("407"); expect(a.hits()).toBe(0);
  });
  it("reclaims rejected half-open CONNECT slots before the next authorized request", async () => {
    const f = await fixture();
    for (let i = 0; i < 64; i++) {
      const denied = await request(f.proxy, { allowHalfOpen: true });
      expect(await denied.response).toContain("407");
      denied.socket.write("x"); // Keep the peer's write half open after server FIN.
    }
    const allowed = await request(f.proxy, { auth: authorization(f.proxy) });
    expect(await allowed.response.catch(() => "closed")).toContain("200 Connection Established");
    expect(f.hits()).toBe(1);
  });
  it("rejects duplicate authorization and conflicting Host before DNS", async () => {
    const f = await fixture(); const auth = authorization(f.proxy);
    for (const extra of [`Proxy-Authorization: ${auth}\r\n`, "Host: foreign.com:443\r\n"]) {
      const r = await request(f.proxy, { auth, extra }); expect(await r.response).not.toContain("200");
    }
    expect(f.resolve).not.toHaveBeenCalled(); expect(f.hits()).toBe(0);
  });
  it.each(["127.0.0.1:443", "[::1]:443", "user@example.com:443", "example.com:80", "example.com:443/path"])("rejects target %s without dial", async (authority) => {
    const f = await fixture(); const r = await request(f.proxy, { auth: authorization(f.proxy), authority });
    expect(await r.response).toContain("403"); expect(f.dial).not.toHaveBeenCalled(); expect(f.hits()).toBe(0);
  });
  it("only handles CONNECT, not ordinary HTTP forwarding", async () => {
    const f = await fixture(); const r = await request(f.proxy, { method: "GET", authority: "https://example.com/page", auth: authorization(f.proxy) });
    expect(await r.response).toContain("403"); expect(f.hits()).toBe(0);
  });
  it("pins one validated numeric address without a second hostname lookup and forwards tunnel bytes", async () => {
    const f = await fixture(); const r = await request(f.proxy, { auth: authorization(f.proxy) });
    expect(await r.response).toContain("200 Connection Established");
    const echoed = once(r.socket, "data"); r.socket.write("synthetic-tunnel-byte");
    expect((await echoed)[0].toString()).toBe("synthetic-tunnel-byte");
    expect(f.targets).toEqual([{ address: "93.184.216.34", family: 4, port: 443 }]);
    expect(f.resolve).toHaveBeenCalledExactlyOnceWith("example.com"); expect(f.hits()).toBe(1);
    expect(Buffer.concat(f.bytes).toString()).not.toContain("Proxy-Authorization");
  });
  it.each([
    { answers: [] }, { answers: [{ address: "127.0.0.1", family: 4 }] }, { answers: [...publicAnswer, { address: "10.0.0.1", family: 4 }] },
    { answers: [{ address: "::ffff:8.8.8.8", family: 6 }] }, { answers: [{ address: "93.184.216.34", family: 6 }] },
  ])("rejects empty, mixed or mismatched DNS answers %#", async ({ answers }) => {
    const f = await fixture(vi.fn(async () => answers));
    const r = await request(f.proxy, { auth: authorization(f.proxy) });
    expect(await r.response).toContain("403"); expect(f.dial).not.toHaveBeenCalled(); expect(f.hits()).toBe(0);
  });
  it("revokes during delayed DNS with no late dial", async () => {
    const lookup = deferred<typeof publicAnswer>(); const entered = deferred<void>();
    const f = await fixture(vi.fn(() => { entered.resolve(); return lookup.promise; }));
    const r = await request(f.proxy, { auth: authorization(f.proxy) }); const response = r.response.catch(() => "closed");
    await entered.promise; await f.proxy.revoke(); lookup.resolve(publicAnswer);
    await response; await Promise.resolve();
    expect(f.dial).not.toHaveBeenCalled(); expect(f.hits()).toBe(0); expect(f.proxy.credentialsFor(challenge(f.proxy))).toBeNull();
  });
  it("keeps actual unresolved DNS bounded after 100 authenticated CONNECT cancellations", async () => {
    const lookups = unresolvedLookups(); const f = await fixture(lookups.resolve);
    const rejected = await cancelledLookups(f.proxy, lookups, 100);
    expect(lookups.pending()).toBe(32); expect(lookups.peak()).toBe(32); expect(rejected).toBe(68);
    expect(f.targets).toHaveLength(0); expect(f.hits()).toBe(0);
    await f.proxy.revoke(); expect(lookups.pending()).toBe(32); // revoke is not OS DNS cancellation.
    lookups.entries.forEach((entry) => entry.resolve()); await new Promise<void>((done) => setImmediate(done));
    expect(lookups.pending()).toBe(0); expect(f.targets).toHaveLength(0); expect(f.hits()).toBe(0);
  }, 20000);
  it("preserves unresolved DNS admission across revoked and recreated bindings until settlement", async () => {
    const lookups = unresolvedLookups(); const first = await fixture(lookups.resolve);
    await cancelledLookups(first.proxy, lookups, 32); await first.proxy.revoke();
    const next = await fixture(lookups.resolve);
    const denied = await request(next.proxy, { auth: authorization(next.proxy) });
    const response = denied.response.catch(() => "closed");
    const observed = await Promise.race([response, new Promise<string>((done) => setTimeout(() => done("no rejection"), 200))]);
    denied.socket.destroy(); await response;
    expect(observed).toContain("503"); expect(lookups.pending()).toBe(32);
    lookups.entries[0].reject(); await new Promise<void>((done) => setImmediate(done));
    const resumed = await request(next.proxy, { auth: authorization(next.proxy) }); const resumedResponse = resumed.response.catch(() => "closed");
    await vi.waitFor(() => expect(lookups.entries).toHaveLength(33));
    lookups.entries[32].resolve(); expect(await resumedResponse).toContain("200"); expect(next.hits()).toBe(1);
    lookups.entries.slice(1, 32).forEach((entry) => entry.resolve()); await new Promise<void>((done) => setImmediate(done));
    expect(first.targets).toHaveLength(0); expect(next.targets).toHaveLength(1); expect(lookups.pending()).toBe(0);
  }, 15000);
  it("holds the DNS budget through the actual 10-second preparation timeout", async () => {
    const lookups = unresolvedLookups(); const f = await fixture(lookups.resolve);
    await cancelledLookups(f.proxy, lookups, 31);
    const timed = await request(f.proxy, { auth: authorization(f.proxy) });
    await vi.waitFor(() => expect(lookups.pending()).toBe(32));
    const started = Date.now(); expect(await timed.response).toContain("403");
    expect(Date.now() - started).toBeGreaterThanOrEqual(9000);
    const denied = await request(f.proxy, { auth: authorization(f.proxy) });
    const response = denied.response.catch(() => "closed");
    const observed = await Promise.race([response, new Promise<string>((done) => setTimeout(() => done("no rejection"), 200))]);
    denied.socket.destroy(); await response;
    expect(observed).toContain("503"); expect(lookups.pending()).toBe(32); expect(f.targets).toHaveLength(0);
  }, 20000);
  it.each(["synchronous", "promise"])("returns DNS capacity on %s resolver failure", async (failure) => {
    const failing = await fixture(() => {
      if (failure === "synchronous") throw new Error("synthetic sync error");
      return Promise.reject(new Error("synthetic async error"));
    });
    for (let i = 0; i < 40; i++) {
      const r = await request(failing.proxy, { auth: authorization(failing.proxy) });
      expect(await r.response).toContain("403"); r.socket.destroy();
    }
    const healthy = await fixture(); const r = await request(healthy.proxy, { auth: authorization(healthy.proxy) });
    expect(await r.response).toContain("200"); expect(healthy.hits()).toBe(1); expect(failing.hits()).toBe(0);
  });
  it("owner abort tears down an already established tunnel and prevents credentials reuse", async () => {
    const f = await fixture(); const r = await request(f.proxy, { auth: authorization(f.proxy) });
    expect(await r.response).toContain("200"); const closed = once(r.socket, "close");
    f.owner.abort(); await closed; await f.proxy.revoke();
    expect(f.proxy.credentialsFor(challenge(f.proxy))).toBeNull();
  });
  it("keeps the registered identity when the caller reuses its input object", async () => {
    const f = await fixture(); f.binding.webContentsId = 20;
    expect(f.proxy.credentialsFor({ ...challenge(f.proxy), webContentsId: 20 }) === null).toBe(true);
    expect(f.proxy.credentialsFor(challenge(f.proxy))).not.toBeNull();
  });
  it("destroys a connecting socket on revoke and cannot publish a late CONNECT result", async () => {
    const entered = deferred<void>(); const pending = new Socket();
    const f = await fixture(undefined, { connect: () => { entered.resolve(); return pending; } });
    const r = await request(f.proxy, { auth: authorization(f.proxy) }); const response = r.response.catch(() => "closed");
    await entered.promise; await f.proxy.revoke(); pending.emit("connect");
    expect(await response).not.toContain("200"); expect(pending.destroyed).toBe(true); expect(f.hits()).toBe(0);
  });
  it("rejects a connected peer differing from the validated pin before forwarding bytes", async () => {
    const f = await fixture(undefined, { remoteAddress: "10.0.0.1" }); const r = await request(f.proxy, { auth: authorization(f.proxy) });
    expect(await r.response).toContain("403"); expect(Buffer.concat(f.bytes).length).toBe(0);
  });
  it("recognizes equivalent IPv6 peer text using the actual Node BlockList", async () => {
    const f = await fixture(vi.fn(async () => [{ address: "2606:4700:4700:0:0:0:0:1111", family: 6 }]), { remoteAddress: "2606:4700:4700::1111" });
    const r = await request(f.proxy, { auth: authorization(f.proxy) }); expect(await r.response).toContain("200");
  });
  it("revalidates every new CONNECT and rejects DNS that changes to private", async () => {
    let lookups = 0; const f = await fixture(vi.fn(async () => ++lookups === 1 ? publicAnswer : [{ address: "10.0.0.1", family: 4 }]));
    const first = await request(f.proxy, { auth: authorization(f.proxy) }); expect(await first.response).toContain("200");
    const second = await request(f.proxy, { auth: authorization(f.proxy) }); expect(await second.response).toContain("403");
    expect(f.targets).toHaveLength(1); expect(f.hits()).toBe(1);
  });
  it("fails closed when DNS throws and does not echo the raw resolver error", async () => {
    const f = await fixture(vi.fn(async () => { throw new Error("sensitive resolver detail"); }));
    const r = await request(f.proxy, { auth: authorization(f.proxy) }); const response = await r.response;
    expect(response).toContain("403"); expect(response).not.toContain("sensitive"); expect(f.hits()).toBe(0);
  });
  it.each([
    { isProxy: false }, { host: "example.com" }, { port: 443 }, { realm: "other" },
    { scheme: "digest" }, { webContentsId: 0 }, { webContentsId: 20 },
  ])("refuses target/foreign/unknown login challenge %#", async (change) => {
    const f = await fixture(); expect(f.proxy.credentialsFor({ ...challenge(f.proxy), ...change })).toBeNull();
  });
  it("does not bind a listener for an already cancelled owner", async () => {
    const owner = new AbortController(); owner.abort();
    await expect(startAuthenticatedConnectProxy({ webContentsId: 19, signal: owner.signal })).rejects.toThrow();
  });
});
