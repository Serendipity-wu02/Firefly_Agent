import { describe, expect, it, vi } from "vitest";
import { createBrowserAuthorizationDomainRegistry } from "./browser-authorization-domain";
import { startBrowserDomainProxy } from "./browser-domain-proxy";
import { startAuthenticatedConnectProxy, type ConnectProxy } from "./authenticated-connect-proxy";

function setup() {
  const session = {}, abort = new AbortController();
  const registry = createBrowserAuthorizationDomainRegistry({ gateOpen: true, isOwnerCurrent: () => true });
  const domain = registry.create({ owner: {}, profile: {}, conversationId: "c", browserId: "b", generation: 0, signal: abort.signal }, session)!;
  const contents = { id: 17, session, isDestroyed: () => false };
  domain.registerContents(contents);
  return { domain, contents, abort };
}
function proxy() {
  return { endpoint: { host: "127.0.0.1" as const, port: 12345, realm: "test" }, credentialsFor: vi.fn(() => ({ username: "u", password: "p" })), revoke: vi.fn(async () => {}) };
}
describe("domain proxy adapter", () => {
  it("starts with registered native identity and denies credentials before activation", async () => {
    const { domain, contents } = setup(), raw = proxy(), factory = vi.fn(async () => raw);
    const scoped = await startBrowserDomainProxy(domain, contents, factory);
    expect(factory).toHaveBeenCalledWith({ webContentsId: 17, signal: domain.signal });
    const challenge = { isProxy: true, host: "127.0.0.1", port: 12345, realm: "test", scheme: "basic" };
    expect(scoped.credentialsFor(contents, challenge)).toBeNull();
    domain.activate();
    expect(scoped.credentialsFor(contents, challenge)).toEqual({ username: "u", password: "p" });
    expect(scoped.credentialsFor(undefined, challenge)).toBeNull();
    expect(scoped.credentialsFor({ ...contents }, challenge)).toBeNull();
    expect(raw.credentialsFor).toHaveBeenCalledTimes(1);
    expect(raw.credentialsFor).toHaveBeenCalledWith({ ...challenge, webContentsId: 17 });
    const closing = scoped.revoke();
    expect(domain.signal.aborted).toBe(true);
    expect(scoped.credentialsFor(contents, challenge)).toBeNull();
    expect(scoped.revoke()).toBe(closing);
    await closing;
    expect(raw.revoke).toHaveBeenCalledTimes(1);
  });
  it("does not start for missing, foreign or revoked native contents", async () => {
    const { domain, contents } = setup(), factory = vi.fn(async () => proxy());
    await expect(startBrowserDomainProxy(domain, { ...contents }, factory)).rejects.toThrow();
    domain.revoke();
    await expect(startBrowserDomainProxy(domain, contents, factory)).rejects.toThrow();
    expect(factory).not.toHaveBeenCalled();
  });
  it("reclaims a proxy which resolves after cancellation", async () => {
    const { domain, contents, abort } = setup(), raw = proxy();
    let resolve!: (value: ConnectProxy) => void;
    const pending = startBrowserDomainProxy(domain, contents, () => new Promise<ConnectProxy>((done) => { resolve = done; }));
    const rejected = expect(pending).rejects.toThrow();
    abort.abort(); resolve(raw); await rejected;
    expect(raw.revoke).toHaveBeenCalledTimes(1);
  });
  it("executes the real proxy challenge checks through the adapter without DNS/dial", async () => {
    const { domain, contents } = setup();
    const scoped = await startBrowserDomainProxy(domain, contents, (owner) => startAuthenticatedConnectProxy(owner, {
      resolve: vi.fn(async () => { throw new Error("unexpected DNS"); }), connect: () => { throw new Error("unexpected dial"); },
    }));
    domain.activate();
    const good = { isProxy: true, host: scoped.endpoint.host, port: scoped.endpoint.port, realm: scoped.endpoint.realm, scheme: "basic" };
    try {
      expect(scoped.credentialsFor(contents, good)).not.toBeNull();
      for (const patch of [{ isProxy: false }, { host: "localhost" }, { port: good.port + 1 }, { realm: "other" }, { scheme: "digest" }]) {
        expect(scoped.credentialsFor(contents, { ...good, ...patch })).toBeNull();
      }
      expect(scoped.credentialsFor(undefined, good)).toBeNull();
    } finally { await scoped.revoke(); }
  });
});
