// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../../../i18n";
import type { ChatPageNavigationProps } from "./ChatPageNavigation";

vi.mock("./AppUpdateEntry", () => ({ AppUpdateEntry: () => null }));
vi.mock("../../../components/ui/UserAvatar", () => ({ UserAvatar: () => null }));
vi.mock("./ConversationSidebar", () => ({ ConversationSidebar: () => React.createElement("div", null, "legacy-session-fixture") }));
import { ChatPageNavigation } from "./ChatPageNavigation";

let root: Root;
let host: HTMLDivElement;
const props: ChatPageNavigationProps = {
  collapsed: false, activePanel: null, mode: "chat", sessions: [], sessionListStatus: "ready",
  onToggleCollapsed: vi.fn(), onModeChange: vi.fn(), onNewTask: vi.fn(), onTogglePanel: vi.fn(),
  onSelectSession: vi.fn(), onOpenProject: vi.fn(), onRenameSession: vi.fn(), onDeleteSession: vi.fn(),
  onTogglePinSession: vi.fn(), onExportSession: vi.fn(), onMinimize: vi.fn(), onMaximize: vi.fn(),
  onCloseWindow: vi.fn(), onOpenSettings: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn() });
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
function render(changes: Partial<ChatPageNavigationProps> = {}) {
  act(() => root.render(React.createElement(ChatPageNavigation, { ...props, ...changes })));
}
function button(label: string) {
  const node = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!node) throw new Error(`Missing button: ${label}`);
  return node;
}
describe("workspace navigation layout", () => {
  it("keeps rail settings reachable and mounted history inert while collapsed", () => {
    render({ collapsed: true });
    expect(host.querySelector(".cy-page-sidebar")?.hasAttribute("inert")).toBe(true);
    expect(host.textContent).toContain("legacy-session-fixture");
    expect(host.querySelector(".cy-page-rail")?.hasAttribute("inert")).toBe(false);
    act(() => button(t("ui.settings")).click());
    expect(props.onOpenSettings).toHaveBeenCalledOnce();
    expect(button(t("ui.toggleSidebar")).getAttribute("aria-expanded")).toBe("false");
  });
  it("returns to the workbench and expands context from an open panel", () => {
    render({ collapsed: true, activePanel: "plugin" });
    act(() => button(t("ui.workbench")).click());
    expect(props.onTogglePanel).toHaveBeenCalledWith("plugin");
    expect(props.onToggleCollapsed).toHaveBeenCalledOnce();
  });
  it("keeps modes in context while plugins are open", () => {
    render({ activePanel: "plugin" });
    const modeButton = [...host.querySelectorAll("button")].find(node => node.textContent === "Chat");
    expect(modeButton?.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector(".cy-page-sidebar")?.contains(modeButton!)).toBe(true);
  });
  it("opens tools through More and returns keyboard focus on Escape", async () => {
    render();
    const more = button(t("ui.more"));
    act(() => more.click());
    await act(async () => {});
    expect(document.querySelector(".cy-page-more")).toBeTruthy();
    const tool = [...document.querySelectorAll<HTMLButtonElement>(".cy-page-more button")].find(node => node.title === t("ui.tools"));
    act(() => tool!.click());
    expect(props.onTogglePanel).toHaveBeenCalledWith("tool");
    act(() => more.click());
    act(() => document.querySelector(".cy-page-more")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.activeElement).toBe(more);
  });
  it("closes More with Escape while keyboard focus is on the trigger", () => {
    render();
    const more = button(t("ui.more"));
    act(() => { more.focus(); more.click(); });
    expect(more.getAttribute("aria-expanded")).toBe("true");
    act(() => more.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(more);
  });
});
