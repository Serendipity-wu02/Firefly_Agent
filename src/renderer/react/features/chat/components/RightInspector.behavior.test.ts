// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RightInspector, type InspectorTab } from "./RightInspector";
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addListener() {}, removeListener() {} });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const tabs: InspectorTab[] = [
  { id: "files", label: "Files", closable: false, content: React.createElement("p", null, "Tree") },
  { id: "file:a/notes.md", label: "notes.md", title: "a/notes.md", content: React.createElement("textarea", { defaultValue: "saved draft" }) },
  { id: "diff:notes.md", label: "notes.md", title: "Diff · b/notes.md", content: React.createElement("p", null, "Diff") },
];
it("uses full context for identical filenames and keeps pane state while switching tabs", async () => {
  function TestInspector() {
    const [active, setActive] = useState("file:a/notes.md");
    return React.createElement(RightInspector, { tabs, activeTabId: active, onTabChange: setActive, onCloseTab() {} });
  }
  await act(async () => root.render(React.createElement(TestInspector)));
  const textarea = host.querySelector("textarea")!;
  expect(host.querySelector('[title="a/notes.md"]')).not.toBeNull();
  expect(host.querySelector('[title="Diff · b/notes.md"]')).not.toBeNull();
  await act(async () => host.querySelectorAll<HTMLElement>('[role="tab"]')[2]!.click());
  expect(host.querySelector("textarea")).toBe(textarea);
  expect(host.querySelectorAll('[role="tab"][aria-selected="true"]')).toHaveLength(1);
});
it("Delete closes only the focused closable tab and never consumes editor deletion", async () => {
  const close = vi.fn();
  await act(async () => root.render(React.createElement(RightInspector, { tabs, activeTabId: "file:a/notes.md", onTabChange() {}, onCloseTab: close })));
  const keys = (element: Element, key: string) => act(() => element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
  const triggers = host.querySelectorAll<HTMLElement>('[role="tab"]');
  keys(triggers[0]!, "Delete"); expect(close).not.toHaveBeenCalled();
  keys(host.querySelector("textarea")!, "Delete"); expect(close).not.toHaveBeenCalled();
  keys(triggers[1]!, "Delete"); expect(close).toHaveBeenCalledExactlyOnceWith("file:a/notes.md");
});

it("ignores Delete on nested browser tab headers", async () => {
  const close = vi.fn(), nested = [{id:"browser",label:"Browser",content:React.createElement("button",{role:"tab","data-inner-browser-tab":true},"Tab 1")}, ...tabs];
  await act(async () => root.render(React.createElement(RightInspector,{tabs:nested,activeTabId:"browser",onTabChange(){},onCloseTab:close})));
  await act(async () => host.querySelector('[data-inner-browser-tab]')!.dispatchEvent(new KeyboardEvent("keydown",{key:"Delete",bubbles:true,cancelable:true})));
  expect(close).not.toHaveBeenCalled();
  const label=host.querySelector('[title="a/notes.md"]')!.closest('[role="tab"]')!;
  await act(async () => label.dispatchEvent(new KeyboardEvent("keydown",{key:"Delete",bubbles:true,cancelable:true})));
  expect(close).toHaveBeenCalledExactlyOnceWith("file:a/notes.md");
});
