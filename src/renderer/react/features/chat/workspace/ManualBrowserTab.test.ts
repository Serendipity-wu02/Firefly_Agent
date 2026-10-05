// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserPageDto, ManualBrowserCommand } from "../../../../../shared/manual-browser";
vi.mock("../../../i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import { ManualBrowserTab } from "./ManualBrowserTab";
const page = (id = "b", requestId = 1): BrowserPageDto => ({ browserId: id, conversationId: "s", requestId, closed: false, loading: false, url: "https://example.com/", pendingUrl: null, canGoBack: true, canGoForward: false, error: null });
let changed: (p: BrowserPageDto) => void, host: HTMLDivElement, root: ReturnType<typeof createRoot>;
let execute: ReturnType<typeof vi.fn>, off: ReturnType<typeof vi.fn>, resize: (() => void) | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { constructor(fn: () => void) { resize = fn; } observe() {} disconnect() {} });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ x: 300, y: 80, left: 300, top: 80, width: 400, height: 300, right: 700, bottom: 380, toJSON() {} });
  off = vi.fn(); execute = vi.fn(async (command: ManualBrowserCommand) => ({ ok: true, value: command.kind === "open" ? page() : null }));
  window.manualBrowser = { getAvailability: async () => ({ available: true }), execute, onChanged: fn => { changed = fn; return off; } };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); delete window.manualBrowser; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render(sessionId: string | undefined = "s", active = true) { await act(async () => root.render(createElement(ManualBrowserTab, { sessionId, active, onClose: vi.fn() }))); }
async function navigate() {
  const input = host.querySelector("input")!;
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "https://example.com/"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
describe("manual browser Main bridge and viewport lifecycle", () => {
  it("does not mint a fake conversation on welcome; closed production availability cannot navigate", async () => {
    await act(async () => root.render(createElement(ManualBrowserTab, { onClose: vi.fn() }))); await navigate(); expect(execute).not.toHaveBeenCalled();
    window.manualBrowser!.getAvailability = async () => ({ available: false, reason: "network_unavailable" });
    await render("closed-gate"); await navigate(); expect(execute).not.toHaveBeenCalled();
    expect(host.querySelector("iframe, webview, a[href]")).toBeNull();
  });
  it("adopts Main IDs only during open, ignores foreign/older updates, detaches inactive viewport, and resends on focus/resize", async () => {
    await render(); await navigate();
    expect(execute).toHaveBeenCalledWith({ kind: "open", url: "https://example.com/" });
    expect(execute).toHaveBeenCalledWith({ kind: "layout", browserId: "b", bounds: { x: 300, y: 80, width: 400, height: 300 } });
    await act(async () => changed({ ...page("foreign", 99), conversationId: "other" }));
    await act(async () => changed({ ...page("b", 0), url: "https://stale.example/" }));
    expect(host.querySelector<HTMLInputElement>("input")!.value).toBe("https://example.com/");
    await render("s", false); expect(execute).toHaveBeenLastCalledWith({ kind: "layout", browserId: "b", bounds: null });
    await render("s", true); execute.mockClear();
    await act(async () => { window.dispatchEvent(new Event("focus")); resize?.(); });
    expect(execute.mock.calls.filter(([c]) => c.kind === "layout").length).toBeGreaterThanOrEqual(2);
    await render("next"); expect(execute).toHaveBeenCalledWith({ kind: "close", browserId: "b" }); expect(off).toHaveBeenCalled();
  });
  it("close cancels pending open as soon as Main publishes its ID and never adopts a late reply", async () => {
    let finish!: (value: unknown) => void;
    execute.mockImplementation((c: ManualBrowserCommand) => c.kind === "open" ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ ok: true, value: null }));
    await render(); await navigate();
    await act(async () => changed({ ...page(), loading: true, url: "", pendingUrl: "https://example.com/" }));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="browserWorkspace.close"]')!.click());
    expect(execute).toHaveBeenCalledWith({ kind: "close", browserId: "b" });
    await act(async () => finish({ ok: true, value: page() }));
    expect(host.textContent).toContain("browserWorkspace.closed");
  });
  it("closed DTO remains terminal and cleanup_failed stays visible", async () => {
    await render(); await navigate();
    await act(async () => changed({ ...page("b", 3), closed: true, error: "cleanup_failed" }));
    await act(async () => changed(page("b", 4)));
    expect(host.textContent).toContain("browserWorkspace.cleanupFailed");
    expect(host.querySelector<HTMLButtonElement>('[aria-label="browserWorkspace.go"]')!.disabled).toBe(true);
  });
});
