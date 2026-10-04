// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ModeSwitch } from "./ModeSwitch";
import { setUiLocale } from "../../i18n";

let root: Root;
let host: HTMLDivElement;
let changes: string[];
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  host = document.createElement("div"); document.body.appendChild(host);
  root = createRoot(host); changes = []; setUiLocale("zh-CN");
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
function mount(initial = "chat") {
  function Harness() {
    const [mode, setMode] = useState(initial);
    return React.createElement(ModeSwitch, {value: mode, onChange: (next: string) => { changes.push(next); setMode(next); }});
  }
  act(() => root.render(React.createElement(Harness)));
}
function trigger() {
  const button = host.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  expect(button, "current mode is the only closed trigger").not.toBeNull();
  return button!;
}
function items() { return [...host.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]; }
function key(node: Element, value: string) {
  act(() => node.dispatchEvent(new KeyboardEvent("keydown", {key: value, bubbles: true, cancelable: true})));
}
function open() { act(() => trigger().click()); }

describe("current mode dropdown", () => {
  it("shows one current mode and exposes all three checked choices only when opened", () => {
    mount("work");
    expect(host.querySelectorAll("button")).toHaveLength(1);
    expect(trigger().textContent).toContain("Work");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector('[role="menu"]')).toBeNull();
    open();
    expect(items()).toHaveLength(3);
    expect(items().map(item => item.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(document.activeElement).toBe(items()[1]);
  });
  it("selects a real controlled mode once and restores trigger focus", () => {
    mount(); open();
    act(() => items()[2].click());
    expect(changes).toEqual(["code"]);
    expect(trigger().textContent).toContain("Code");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger());
  });
  it("opens from the keyboard, moves up/down, and confirms with Enter", () => {
    mount("work"); trigger().focus(); key(trigger(), "ArrowDown");
    expect(document.activeElement).toBe(items()[1]);
    key(document.activeElement!, "ArrowDown"); expect(document.activeElement).toBe(items()[2]);
    key(document.activeElement!, "ArrowDown"); expect(document.activeElement).toBe(items()[0]);
    key(document.activeElement!, "ArrowUp"); expect(document.activeElement).toBe(items()[2]);
    key(document.activeElement!, "Enter");
    expect(changes).toEqual(["code"]); expect(document.activeElement).toBe(trigger());
  });
  it("dismisses with Escape without changing mode and restores trigger focus", () => {
    mount(); open(); key(document.activeElement!, "ArrowDown"); key(document.activeElement!, "Escape");
    expect(changes).toEqual([]); expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
  it("dismisses outside pointer clicks and lets outside controls retain focus", () => {
    mount(); open();
    const outside = document.createElement("button"); document.body.appendChild(outside);
    act(() => { outside.dispatchEvent(new MouseEvent("pointerdown", {bubbles:true})); outside.focus(); });
    expect(host.querySelector('[role="menu"]')).toBeNull(); expect(document.activeElement).toBe(outside);
    expect(changes).toEqual([]); outside.remove();
  });
  it("dismisses when Tab takes focus outside the menu", () => {
    mount(); open();
    const outside = document.createElement("button"); document.body.appendChild(outside);
    act(() => outside.focus());
    expect(host.querySelector('[role="menu"]')).toBeNull(); expect(document.activeElement).toBe(outside);
    outside.remove();
  });
  it("dismisses on Shift+Tab while preserving native focus traversal", () => {
    mount(); open();
    const event = new KeyboardEvent("keydown", {key: "Tab", shiftKey: true, bubbles: true, cancelable: true});
    act(() => document.activeElement!.dispatchEvent(event));
    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(event.defaultPrevented).toBe(false);
    expect(changes).toEqual([]);
  });
  it("exposes localized menu labels while preserving Chat/Work/Code identities", () => {
    setUiLocale("en"); mount("code");
    expect(trigger().getAttribute("aria-label")).toBe("Switch mode, current: Code");
    open(); expect(host.querySelector('[role="menu"]')?.getAttribute("aria-label")).toBe("Conversation mode");
    expect(items().map(item => item.querySelector('.cy-mode-picker__label')?.textContent)).toEqual(["Chat", "Work", "Code"]);
  });
});
