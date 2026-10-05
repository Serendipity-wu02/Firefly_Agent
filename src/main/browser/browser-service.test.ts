import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createBrowserService, type BrowserGuestPort, type BrowserHostPort, type TrustedBrowserOwner } from "./browser-service";
import type { BrowserSessionPort } from "./browser-network-binding";
import type { ConnectProxy } from "./authenticated-connect-proxy";

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function fixture(gateOpen = true) {
  const profile = {}, abort = new AbortController(), effects: string[] = [], frames = new EventEmitter();
  const topFrame = {}, hostEvents = new EventEmitter();
  const host: BrowserHostPort = Object.assign(hostEvents, { webContents: Object.assign(frames, { id: 10, mainFrame: topFrame, isDestroyed: () => false }),
    isDestroyed: () => false, isVisible: () => true, isFocused: () => true, getContentSize: (): [number, number] => [800, 600], contentView: { addChildView: () => {}, removeChildView: () => {} } });
  let owner: TrustedBrowserOwner = Object.freeze({ host, topFrame, profile, conversationId: "a", ownerSessionId: "manual-a", generation: 1, signal: abort.signal });
  const sender = { sender: host.webContents, senderFrame: topFrame };
  const sessions: object[] = [], guests: BrowserGuestPort<object>[] = [], changed: unknown[] = [];
  const callbacks: Parameters<BrowserGuestPort<object>["installCallbacks"]>[0][] = [];
  let nextLoad = async () => {};
  let nextProxy = async () => {};
  const service = createBrowserService({ profile, gateOpen, onChanged: (_owner, state) => changed.push(state),
    createSession: () => {
      const session = {}; sessions.push(session); effects.push("session");
      const port: BrowserSessionPort<object> = { session, persistent: false,
        installRequestHandler: () => { effects.push("deny"); }, denyPermissions: () => { effects.push("permissions"); },
        setProxy: async () => { effects.push("setProxy"); await nextProxy(); }, closeAllConnections: async () => { effects.push("connections"); },
        clearStorageData: async () => { effects.push("storage"); }, clearCache: async () => { effects.push("cache"); },
        clearAuthCache: async () => { effects.push("auth"); }, clearHostResolverCache: async () => { effects.push("resolver"); }, runningWorkerCount: () => 0 };
      return port;
    },
    createView: (session) => {
      effects.push("view"); let destroyed = false, url = "";
      const contents = { id: 20 + guests.length, session, isDestroyed: () => destroyed };
      const guest: BrowserGuestPort<object> = { contents,
        loadURL: async (target) => { effects.push("load:" + target); await nextLoad(); url = target; },
        history: async action => { effects.push(action); }, snapshot: () => ({ url, canGoBack: true, canGoForward: false }),
        stop: () => { effects.push("stop"); }, attach: () => { effects.push("attach"); }, detach: () => { effects.push("detach"); },
        setBounds: bounds => { effects.push("bounds:" + JSON.stringify(bounds)); },
        destroy: () => { effects.push("destroy"); destroyed = true; }, installCallbacks: next => { callbacks.push(next); } };
      guests.push(guest); return guest;
    },
    proxyFactory: async () => ({ endpoint: { host: "127.0.0.1", port: 1234, realm: "fixture" }, credentialsFor: () => ({ username: "opaque", password: "opaque" }), revoke: async () => { effects.push("proxyRevoke"); } } satisfies ConnectProxy),
    cleanupTimeoutMs: 100, workerStopTimeoutMs: 30,
  });
  service.registerHost(host, () => owner);
  return { service, host, sender, profile, abort, effects, guests, sessions, changed, callbacks, owner: () => owner,
    swap: () => { owner = Object.freeze({ ...owner, conversationId: "b", ownerSessionId: "manual-b", generation: 2 }); },
    delayLoad: (operation: () => Promise<void>) => { nextLoad = operation; }, delayProxy: (operation: () => Promise<void>) => { nextProxy = operation; } };
}

describe("Main browser service using the real Session/epoch controller", () => {
  it("default closed gate has zero Session/view/proxy/navigation effects", async () => {
    const f = fixture(false); expect(await f.service.dispatch(f.sender, { kind: "open", url: "https://example.com/" })).toEqual({ ok: false, code: "network_unavailable" }); expect(f.effects).toEqual([]);
  });
  it("rejects forged frame/host/profile and an unregistered owner before allocation", async () => {
    const f = fixture();
    expect((await f.service.dispatch({ ...f.sender, senderFrame: {} }, { kind: "open", url: "https://example.com/" })).ok).toBe(false);
    expect(await f.service.execute({ ...f.owner() }, { kind: "open", url: "https://example.com/" })).toEqual({ ok: false, code: "owner_mismatch" }); expect(f.effects).toEqual([]);
  });
  it.each(["file:///x", "http://example.com", "https://127.0.0.1", "https://[::1]", "https://example.com:444", "https://u:p@example.com", "javascript:alert(1)"])("refuses %s before allocation", async url => {
    const f = fixture(); expect(await f.service.dispatch(f.sender, { kind: "open", url })).toEqual({ ok: false, code: "blocked_url" }); expect(f.effects).toEqual([]);
  });
  it("prepares actual network domain before load and attaches only with clipped explicit bounds", async () => {
    const f = fixture(), result = await f.service.dispatch(f.sender, { kind: "open", url: "https://example.com/" });
    expect(result.ok).toBe(true); if (!result.ok || !result.value) throw Error("page missing");
    expect(f.effects.slice(0, 7)).toEqual(["session", "deny", "permissions", "view", "setProxy", "connections", "load:https://example.com/"]);
    expect(f.effects).not.toContain("attach"); expect(result.value.loading).toBe(false); expect(result.value.url).toBe("https://example.com/");
    const layout = await f.service.dispatch(f.sender, { kind: "layout", browserId: result.value.browserId, bounds: { x: 700, y: 500, width: 400, height: 400 } });
    expect(layout.ok).toBe(true); expect(f.effects).toContain('bounds:{"x":700,"y":500,"width":100,"height":100}'); expect(f.effects).toContain("attach");
    await f.service.dispose();
  });
  it("cancellation during setProxy starts no document and returns cancelled", async () => {
    const f = fixture(), wait = deferred<void>(); f.delayProxy(() => wait.promise);
    const pending = f.service.dispatch(f.sender, { kind: "open", url: "https://example.com/" });
    for (let n = 0; n < 8; n++) await Promise.resolve(); f.abort.abort(); wait.resolve();
    expect(await pending).toEqual({ ok: false, code: "cancelled" }); expect(f.effects.some(x => x.startsWith("load:"))).toBe(false);
    expect(await f.service.dispose()).toEqual({ ok: true, value: null }); expect(f.effects).toContain("storage");
  });
  it("cancels a never-settling setup promptly and bounds failed shutdown cleanup", async () => {
    const f = fixture(), wait = deferred<void>(); f.delayProxy(() => wait.promise);
    const pending = f.service.dispatch(f.sender, { kind: "open", url: "https://example.com/" });
    for (let n = 0; n < 8; n++) await Promise.resolve();
    expect(f.effects).toContain("setProxy"); f.abort.abort();
    const result = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve("hung"), 200))]);
    expect(result).toEqual({ ok: false, code: "cancelled" });
    expect(await f.service.dispose()).toEqual({ ok: false, code: "cleanup_failed" });
    expect(f.effects).toContain("storage"); expect(f.effects).not.toContain("attach");
    expect(f.effects.some(x => x.startsWith("load:"))).toBe(false);
    wait.resolve();
  });
  it("publishes the pending browser ID so close can cancel initialization before any navigation", async () => {
    const f = fixture(), wait = deferred<void>(); f.delayProxy(() => wait.promise);
    const pending = f.service.dispatch(f.sender, { kind: "open", url: "https://example.com/" });
    for (let n = 0; n < 8; n++) await Promise.resolve();
    expect(f.changed.at(-1)).toMatchObject({ loading: true, pendingUrl: "https://example.com/", closed: false });
    const page = f.changed.at(-1) as { browserId: string };
    const closed = f.service.dispatch(f.sender, { kind: "close", browserId: page.browserId });
    wait.resolve();
    expect(await pending).toEqual({ ok: false, code: "cancelled" });
    expect(await closed).toMatchObject({ ok: true, value: { closed: true } });
    expect(f.effects.some(x => x.startsWith("load:"))).toBe(false); await f.service.dispose();
  });
  it("owner switch revokes old view and old response cannot publish into the new session", async () => {
    const f = fixture(), wait = deferred<void>(); f.delayLoad(() => wait.promise);
    const old = f.service.dispatch(f.sender, { kind: "open", url: "https://example.com/a" });
    for (let n = 0; n < 15; n++) await Promise.resolve(); f.swap(); f.delayLoad(async () => {});
    const fresh = await f.service.dispatch(f.sender, { kind: "open", url: "https://example.com/b" }); expect(fresh.ok).toBe(true); wait.resolve();
    expect((await old).ok).toBe(false); expect(f.effects).toContain("destroy"); expect(f.sessions).toHaveLength(2);
    expect(f.changed.at(-1)).toMatchObject({ conversationId: "b", url: "https://example.com/b" }); await f.service.dispose();
  });
  it("a newer navigation cancels old delivery and preserves its own committed URL", async () => {
    const f = fixture(), opened = await f.service.dispatch(f.sender, { kind: "open", url: "https://example.com/" });
    if (!opened.ok || !opened.value) throw Error("page missing"); const browserId = opened.value.browserId, wait = deferred<void>();
    f.delayLoad(() => wait.promise); const old = f.service.dispatch(f.sender, { kind: "navigate", browserId, url: "https://example.com/old" });
    f.delayLoad(async () => {}); const fresh = await f.service.dispatch(f.sender, { kind: "navigate", browserId, url: "https://example.com/new" }); wait.resolve();
    expect(await old).toEqual({ ok: false, code: "cancelled" }); expect(fresh).toMatchObject({ ok: true, value: { url: "https://example.com/new", loading: false } }); await f.service.dispose();
  });
  it("load failure preserves committed URL and hides raw exceptions", async () => {
    const f = fixture(), opened = await f.service.dispatch(f.sender, { kind: "open", url: "https://example.com/" }); if (!opened.ok || !opened.value) throw Error("page missing");
    f.delayLoad(async () => { throw Error("private-token=never-expose"); });
    expect(await f.service.dispatch(f.sender, { kind: "navigate", browserId: opened.value.browserId, url: "https://example.com/fail" })).toEqual({ ok: false, code: "load_failed" });
    expect(f.changed.at(-1)).toMatchObject({ url: "https://example.com/", error: "load_failed", pendingUrl: null }); await f.service.dispose();
  });
  it("close clears real Session resources and stale browser IDs stay closed", async () => {
    const f = fixture(), opened = await f.service.dispatch(f.sender, { kind: "open", url: "https://example.com/" }); if (!opened.ok || !opened.value) throw Error("page missing");
    const browserId = opened.value.browserId; expect(await f.service.dispatch(f.sender, { kind: "close", browserId })).toMatchObject({ ok: true, value: { closed: true } });
    expect(f.effects).toEqual(expect.arrayContaining(["destroy", "proxyRevoke", "storage", "cache", "auth", "resolver"]));
    expect(await f.service.dispatch(f.sender, { kind: "navigate", browserId, url: "https://example.com/" })).toEqual({ ok: false, code: "closed" }); await f.service.dispose();
  });
  it("uses native history state and detaches on trusted overlays, blur, hide and host close", async () => {
    const f = fixture(), opened = await f.service.dispatch(f.sender, { kind: "open", url: "https://example.com/" });
    if (!opened.ok || !opened.value) throw Error("page missing"); const browserId = opened.value.browserId;
    expect((await f.service.dispatch(f.sender, { kind: "history", browserId, action: "back" })).ok).toBe(true);
    expect(f.effects).toContain("back");
    expect(await f.service.dispatch(f.sender, { kind: "history", browserId, action: "forward" })).toEqual({ ok: false, code: "closed" });
    const layout = { kind: "layout", browserId, bounds: { x: 0, y: 0, width: 200, height: 100 } };
    await f.service.dispatch(f.sender, layout); f.service.setTrustedOverlay(f.host, true);
    const attachments = f.effects.filter(effect => effect === "attach").length;
    await f.service.dispatch(f.sender, layout); expect(f.effects.filter(effect => effect === "attach")).toHaveLength(attachments);
    f.service.setTrustedOverlay(f.host, false); await f.service.dispatch(f.sender, layout);
    (f.host as unknown as EventEmitter).emit("blur"); (f.host as unknown as EventEmitter).emit("hide");
    expect(f.effects.filter(effect => effect === "detach").length).toBeGreaterThanOrEqual(3);
    expect(await f.service.closeHost(f.host)).toEqual({ ok: true, value: null });
    expect(f.effects).toContain("destroy"); expect(f.callbacks[0].allowsNavigation("https://example.com/")).toBe(false);
    expect(await f.service.dispatch(f.sender, layout)).toEqual({ ok: false, code: "owner_mismatch" }); await f.service.dispose();
  });
  it("native callbacks publish current page errors and exact proxy credentials expire on owner revoke", async () => {
    const f = fixture(), opened = await f.service.dispatch(f.sender, { kind: "open", url: "https://example.com/" });
    expect(opened.ok).toBe(true);
    const native = f.guests[0].contents, challenge = { isProxy: true, host: "127.0.0.1", port: 1234, realm: "fixture", scheme: "basic" };
    expect(f.service.credentialsFor(native, challenge)).toEqual({ username: "opaque", password: "opaque" });
    expect(f.service.credentialsFor({ ...native }, challenge)).toBeNull();
    f.callbacks[0].started("https://example.com/linked"); expect(f.changed.at(-1)).toMatchObject({ loading: true, pendingUrl: "https://example.com/linked" });
    f.callbacks[0].failed(); expect(f.changed.at(-1)).toMatchObject({ error: "load_failed", loading: false, url: "https://example.com/" });
    f.service.revoke(f.owner()); const notifications = f.changed.length;
    f.callbacks[0].changed(); f.callbacks[0].started("https://example.com/stale");
    expect(f.changed).toHaveLength(notifications); expect(f.service.credentialsFor(native, challenge)).toBeNull();
    expect(f.service.isRegisteredBrowser(native)).toBe(true); await f.service.dispose();
  });
  it.each(["blur", "hide"])("a queued layout cannot undo %s until trusted restoration", async event => {
    const f = fixture(), opened = await f.service.dispatch(f.sender, { kind: "open", url: "https://example.com/" });
    if (!opened.ok || !opened.value) throw Error("page missing");
    const command = { kind: "layout", browserId: opened.value.browserId, bounds: { x: 1, y: 2, width: 100, height: 100 } };
    await f.service.dispatch(f.sender, command);
    (f.host as unknown as EventEmitter).emit(event);
    const before = f.effects.filter(effect => effect === "attach").length;
    await f.service.dispatch(f.sender, command); expect(f.effects.filter(effect => effect === "attach")).toHaveLength(before);
    (f.host as unknown as EventEmitter).emit(event === "blur" ? "focus" : "show");
    await f.service.dispatch(f.sender, command); expect(f.effects.filter(effect => effect === "attach")).toHaveLength(before + 1); await f.service.dispose();
  });
  it("clips negative-origin rectangles by their original edges and detaches fully offscreen layouts", async () => {
    const f = fixture(), opened = await f.service.dispatch(f.sender, { kind: "open", url: "https://example.com/" });
    if (!opened.ok || !opened.value) throw Error("page missing");
    await f.service.dispatch(f.sender, { kind: "layout", browserId: opened.value.browserId, bounds: { x: -200, y: 0, width: 100, height: 100 } });
    expect(f.effects).not.toContain("attach");
    await f.service.dispatch(f.sender, { kind: "layout", browserId: opened.value.browserId, bounds: { x: -20, y: -30, width: 100, height: 100 } });
    expect(f.effects).toContain('bounds:{"x":0,"y":0,"width":80,"height":70}'); await f.service.dispose();
  });
});
