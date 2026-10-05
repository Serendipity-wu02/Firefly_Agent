import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ preferences: undefined as unknown, contents: undefined as any, bounds: [] as unknown[] }));
vi.mock("electron", () => ({ WebContentsView: class {
  webContents: any;
  constructor(options: unknown) { fixture.preferences = options; this.webContents = fixture.contents; }
  setBounds(bounds: unknown) { fixture.bounds.push(bounds); }
} }));
import { createElectronBrowserGuest } from "./electron-browser-guest";
import { routeBrowserGuestNavigation } from "./browser-guest-routing";
import type { BrowserHostPort } from "./browser-service";

function nativeFixture() {
  const events = new EventEmitter(), session = {}, trace: string[] = [];
  let dead = false, url = "", popup: (() => unknown) | undefined;
  const contents = Object.assign(events, { id: 22, session, isDestroyed: () => dead, getURL: () => url,
    loadURL: async (next: string) => { url = next; trace.push("load"); },
    setWindowOpenHandler: (handler: () => unknown) => { popup = handler; }, setWebRTCIPHandlingPolicy: (policy: string) => trace.push(policy),
    close: (options: unknown) => { trace.push("close:" + JSON.stringify(options)); dead = true; events.emit("destroyed"); }, stop: () => trace.push("stop"), reload: () => events.emit("did-finish-load"),
    navigationHistory: { canGoBack: () => true, canGoForward: () => false, goBack: (): void => { events.emit("did-finish-load"); }, goForward: (): void => { events.emit("did-finish-load"); } } });
  fixture.contents = contents; fixture.bounds = [];
  return { session, contents, trace, popup: () => popup?.() };
}
describe("real Electron WebContentsView adapter boundary", () => {
  it("routes only exact managed guests and keeps destroyed guests denied instead of external fallback", () => {
    const f = nativeFixture(), guest = createElectronBrowserGuest(f.session as any), preventDefault = vi.fn();
    expect(routeBrowserGuestNavigation({}, { preventDefault }, "https://example.com/")).toBe(false); expect(preventDefault).not.toHaveBeenCalled();
    expect(routeBrowserGuestNavigation(f.contents, { preventDefault }, "https://example.com/")).toBe(true); expect(preventDefault).toHaveBeenCalledTimes(1);
    guest.installCallbacks({ allowsNavigation: url => url === "https://example.com/", started: () => {}, changed: () => {}, failed: () => {}, destroyed: () => {} });
    preventDefault.mockClear(); expect(routeBrowserGuestNavigation(f.contents, { preventDefault }, "https://example.com/")).toBe(true); expect(preventDefault).not.toHaveBeenCalled();
    guest.destroy(); expect(routeBrowserGuestNavigation(f.contents, { preventDefault }, "https://example.com/")).toBe(true); expect(preventDefault).toHaveBeenCalledTimes(1);
  });
  it("constructs an unloaded unattached view with the exact dedicated Session and no privileged preload", () => {
    const f = nativeFixture(), guest = createElectronBrowserGuest(f.session as any);
    expect(guest.contents).toBe(f.contents); expect(f.trace).toEqual(["disable_non_proxied_udp"]);
    expect(fixture.preferences).toEqual({ webPreferences: { session: f.session, sandbox: true, contextIsolation: true, webSecurity: true, nodeIntegration: false,
      nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false, allowRunningInsecureContent: false, webviewTag: false, devTools: false, navigateOnDragDrop: false, disableDialogs: true } });
    expect(f.popup()).toEqual({ action: "deny" }); guest.destroy();
  });
  it("defaults to deny and preserves request method at the native navigation boundary after registration", async () => {
    const f = nativeFixture(), guest = createElectronBrowserGuest(f.session as any), preventDefault = vi.fn();
    f.contents.emit("will-navigate", { url: "https://example.com/", preventDefault }); expect(preventDefault).toHaveBeenCalledTimes(1);
    const started: string[] = []; guest.installCallbacks({ allowsNavigation: url => url === "https://example.com/", started: url => started.push(url), changed: () => {}, failed: () => {}, destroyed: () => {} });
    preventDefault.mockClear(); f.contents.emit("will-frame-navigate", { url: "https://example.com/", preventDefault }); expect(preventDefault).not.toHaveBeenCalled();
    f.contents.emit("will-redirect", { url: "http://127.0.0.1/", preventDefault }); expect(preventDefault).toHaveBeenCalledTimes(1);
    f.contents.emit("did-start-navigation", {}, "https://example.com/", false, true); expect(started).toEqual(["https://example.com/"]);
    expect(f.trace).not.toContain("load"); await guest.history("back"); guest.destroy();
  });
  it("denies certificate trust, popup/webview and guest resizing without any external fallback", () => {
    const f = nativeFixture(), guest = createElectronBrowserGuest(f.session as any), preventDefault = vi.fn(), callback = vi.fn();
    f.contents.emit("certificate-error", { preventDefault }, "https://example.com", "bad", {}, callback, true); expect(callback).toHaveBeenCalledWith(false);
    f.contents.emit("will-attach-webview", { preventDefault }); f.contents.emit("content-bounds-updated", { preventDefault }); expect(preventDefault).toHaveBeenCalledTimes(3); guest.destroy();
  });
  it("attaches once, detaches on destroy, and closes without beforeunload waits", () => {
    const f = nativeFixture(), guest = createElectronBrowserGuest(f.session as any), trace: string[] = [];
    const host: BrowserHostPort = Object.assign(new EventEmitter(), { isDestroyed: () => false, isVisible: () => true, isFocused: () => true, getContentSize: (): [number, number] => [100, 100],
      webContents: Object.assign(new EventEmitter(), { id: 10, mainFrame: {}, isDestroyed: () => false }),
      contentView: { addChildView: () => { trace.push("add"); }, removeChildView: () => { trace.push("remove"); } } });
    guest.setBounds({ x: 1, y: 2, width: 3, height: 4 }); guest.attach(host); guest.attach(host); guest.destroy(); guest.destroy();
    expect(trace).toEqual(["add", "remove"]); expect(f.trace).toContain('close:{"waitForBeforeUnload":false}'); expect(fixture.bounds).toEqual([{ x: 1, y: 2, width: 3, height: 4 }]);
  });
  it("completes same-document history on main-frame in-page events and removes wait listeners", async () => {
    const f = nativeFixture(), guest = createElectronBrowserGuest(f.session as any);
    f.contents.navigationHistory.goBack = () => {
      f.contents.emit("did-navigate-in-page", {}, "https://example.com/#child", false);
      f.contents.emit("did-navigate-in-page", {}, "https://example.com/#previous", true);
    };
    let settled = false;
    const pending = guest.history("back").then(() => { settled = true; }, () => {});
    for (let n = 0; n < 8; n++) await Promise.resolve();
    try { expect(settled).toBe(true); expect(f.contents.listenerCount("did-navigate-in-page")).toBe(1); }
    finally { guest.stop(); await pending; guest.destroy(); }
  });
});
