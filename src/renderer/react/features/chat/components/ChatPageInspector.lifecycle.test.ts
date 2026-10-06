// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BROWSER_PUBLIC_SCOPE, type ManualBrowserCommand } from "../../../../../shared/manual-browser";
vi.mock("./ChatMessageList", () => ({ MarkdownContent: () => null }));
vi.mock("./PlanReviewPanel", () => ({ PlanContent: () => null, planTabDotClass: () => "", planTabLabel: () => "plan" }));
vi.mock("./ReviewInspector", () => ({ ReviewDiffContent: () => null }));
import { ChatPageInspector, type ChatPageInspectorProps } from "./ChatPageInspector";
let root: ReturnType<typeof createRoot>, host: HTMLDivElement, execute: ReturnType<typeof vi.fn>;
const props: ChatPageInspectorProps = { sessionId: "s", browserTabOpen: true, filesTabOpen: false, filesTabPinned: false, fileTabs: [], diffTabs: [], activePlan: null, planDrawerOpen: false, planTabId: "plan:s", activeTabId: "browser", onTabChange: vi.fn(), onCloseTab: vi.fn(), onOpenFile: vi.fn() };
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true; vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addListener() {}, removeListener() {} });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ x: 300, y: 80, left: 300, top: 80, width: 400, height: 300, right: 700, bottom: 380, toJSON() {} });
  execute = vi.fn(async (c: ManualBrowserCommand) => ({ ok: true, value: c.kind === "get" ? { browserId: "b", conversationId: "s", requestId: 1, closed: false, loading: false, url: "https://example.com/", pendingUrl: null, canGoBack: false, canGoForward: false, error: null } : null }));
  window.manualBrowser = { execute, onChanged() { return () => {}; }, getAvailability: async () => ({ available: true }), getPermission: async () => ({ ok: true, value: { conversationId: "s", status: "granted", scope: BROWSER_PUBLIC_SCOPE, requestId: null } }), requestPermission: vi.fn(), revokePermission: vi.fn() };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); delete window.manualBrowser; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render(extra: Partial<ChatPageInspectorProps> = {}) { await act(async () => root.render(React.createElement(ChatPageInspector, { ...props, ...extra }))); }
it("hides the inspector without disposing its browser and resumes the same page on expand", async () => {
  await render(); const input = host.querySelector("input");
  await render({ visible: false });
  expect(host.querySelector("aside")!.hasAttribute("hidden")).toBe(true);
  expect(host.querySelector("input")).toBe(input);
  expect(execute).toHaveBeenCalledWith({ kind: "layout", browserId: "b", bounds: null });
  expect(execute.mock.calls.some(([c]) => c.kind === "close")).toBe(false);
  await render({ visible: true }); expect(host.querySelector("input")).toBe(input);
  expect(host.querySelector("aside")!.hasAttribute("hidden")).toBe(false);
});
it("mounts a nonactive browser for Main recovery without drawing it over another tab", async () => {
  await render({ filesTabOpen: true, activeTabId: "files" });
  expect(execute).toHaveBeenCalledWith({ kind: "get" });
  expect(execute).toHaveBeenCalledWith({ kind: "layout", browserId: "b", bounds: null });
  expect(execute.mock.calls.some(([c]) => c.kind === "layout" && c.bounds !== null)).toBe(false);
});
