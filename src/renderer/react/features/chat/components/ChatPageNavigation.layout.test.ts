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
afterEach(() => { act(() => root.unmount()); host.remove(); delete (window as unknown as { user?: unknown }).user; });
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
    act(() => button(t("ui.userMenu")).click());
    act(() => button(t("ui.settings")).click());
    expect(props.onOpenSettings).toHaveBeenCalledOnce();
    expect(button(t("ui.toggleSidebar")).getAttribute("aria-expanded")).toBe("false");
  });
  it("keeps the Firefly portrait visible outside the collapsed context", () => {
    render({ collapsed: true });
    const portrait = host.querySelector<HTMLImageElement>(".cy-page-rail img.cy-page-role-avatar")!;
    expect(portrait).toBeTruthy();
    expect(portrait.src).toMatch(/\/avatars\/firefly-avatar\.png$/);
    expect(host.querySelector(".cy-page-sidebar")?.contains(portrait)).toBe(false);
  });
  it("closes the local user menu on Escape and restores focus", () => {
    render();
    const trigger = button(t("ui.userMenu"));
    act(() => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    const settings = button(t("ui.settings"));
    expect(document.activeElement).toBe(settings);
    act(() => settings.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });
  it("dismisses the user menu when focus leaves without trapping Tab", () => {
    render();
    const trigger = button(t("ui.userMenu"));
    act(() => trigger.click());
    const outside = button(t("ui.workbench"));
    act(() => outside.focus());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(outside);
  });
  it("refreshes the local portrait and nickname through the existing profile events", async () => {
    let changedAvatar: (() => void) | undefined;
    let changedProfile: ((profile: { nickname: string }) => void) | undefined;
    let avatar = "data:image/png;base64,fixture-one";
    Object.assign(window, { user: {
      getAvatar: async () => avatar,
      onAvatarChanged(callback: () => void) { changedAvatar = callback; return () => { changedAvatar = undefined; }; },
      getProfile: async () => ({ nickname: "Existing local nickname" }),
      onProfileChanged(callback: (profile: { nickname: string }) => void) { changedProfile = callback; return () => { changedProfile = undefined; }; },
    } });
    await act(async () => render());
    const trigger = button(t("ui.userMenu"));
    expect(trigger.title).toBe("Existing local nickname");
    expect(trigger.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,fixture-one");
    avatar = "data:image/png;base64,fixture-two";
    await act(async () => { changedAvatar!(); changedProfile!({ nickname: "Updated local nickname" }); });
    act(() => trigger.click());
    expect(document.querySelector(".cy-rail-user__name")?.textContent).toBe("Updated local nickname");
    expect(trigger.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,fixture-two");
    act(() => root.unmount());
    expect(changedAvatar).toBeUndefined();
    expect(changedProfile).toBeUndefined();
  });
  it.each(["Tab", "Shift+Tab"])("dismisses the local menu on %s without cancelling native traversal", key => {
    render();
    const trigger = button(t("ui.userMenu"));
    act(() => trigger.click());
    const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey: key === "Shift+Tab", bubbles: true, cancelable: true });
    act(() => button(t("ui.settings")).dispatchEvent(event));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(event.defaultPrevented).toBe(false);
  });
  it("returns to the workbench and expands context from an open panel", () => {
    render({ collapsed: true, activePanel: "plugin" });
    act(() => button(t("ui.workbench")).click());
    expect(props.onTogglePanel).toHaveBeenCalledWith("plugin");
    expect(props.onToggleCollapsed).toHaveBeenCalledOnce();
  });
  it("keeps the current mode dropdown in context while plugins are open", () => {
    render({ activePanel: "plugin" });
    const modeButton = host.querySelector<HTMLButtonElement>(".cy-mode-picker__trigger")!;
    expect(modeButton.textContent).toContain("Chat");
    expect(modeButton.getAttribute("aria-haspopup")).toBe("menu");
    expect(host.querySelector(".cy-page-sidebar")?.contains(modeButton)).toBe(true);
    act(() => modeButton.click());
    const codeChoice = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
      .find(node => node.querySelector(".cy-mode-picker__label")?.textContent === "Code")!;
    act(() => codeChoice.click());
    expect(props.onModeChange).toHaveBeenCalledExactlyOnceWith("code");
    expect(props.onTogglePanel).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(modeButton);
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
