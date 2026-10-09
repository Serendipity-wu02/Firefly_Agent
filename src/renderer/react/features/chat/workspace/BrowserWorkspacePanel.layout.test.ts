import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { expect, it } from "vitest";

const css = readFileSync(new URL("./BrowserWorkspacePanel.css", import.meta.url), "utf8");
function property(selector: string, name: string): string {
  const dom = new JSDOM(`<style>${css}</style>`);
  const rules = [...dom.window.document.styleSheets[0].cssRules] as CSSStyleRule[];
  const value = rules.filter(rule => rule.selectorText?.split(",").map(part => part.trim()).includes(selector))
    .map(rule => rule.style.getPropertyValue(name)).filter(Boolean).at(-1) ?? "";
  dom.window.close(); return value;
}

it("bounds the existing consent area without consuming the browser", () => {
  expect(property(".cy-browser-permission", "max-height")).toBe("min(40%, 240px)");
  expect(property(".cy-browser-permission", "overflow-y")).toBe("auto");
  expect(property(".cy-browser-permission", "min-height")).toBe("0px");
  expect(property(".cy-browser-permission", "box-sizing")).toBe("border-box");
});
it("keeps the address toolbar from shrinking while the viewport takes remaining space", () => {
  expect(property(".cy-browser-workspace__toolbar", "flex-shrink")).toBe("0");
  expect(property(".cy-browser-workspace__viewport", "min-height")).toBe("0px");
  expect(property(".cy-browser-workspace__viewport", "flex")).toBe("1 1 0%");
});
it("wraps the existing exact host scope in a narrow inspector", () => {
  expect(property(".cy-browser-permission__scope", "overflow-wrap")).toBe("anywhere");
});

it("bounds the consent area so the capped 16-domain list scrolls without consuming the browser", () => {
  expect(property(".cy-browser-permission", "max-height")).toBe("min(40%, 240px)");
  expect(property(".cy-browser-permission", "overflow-y")).toBe("auto");
  expect(property(".cy-browser-permission", "min-height")).toBe("0px");
  expect(property(".cy-browser-permission", "box-sizing")).toBe("border-box");
});

it("wraps long exact resource hosts and cross-site origins in a narrow inspector", () => {
  expect(property(".cy-browser-resource-consent", "min-width")).toBe("0px");
  expect(property(".cy-browser-resource-consent label", "overflow-wrap")).toBe("anywhere");
  expect(property(".cy-browser-site-consent", "overflow-wrap")).toBe("anywhere");
});

it("keeps the committed URL compact and long addresses inside the inspector", () => {
  expect(property(".cy-browser-workspace__location", "min-width")).toBe("0px");
  expect(property(".cy-browser-workspace__location [data-browser-committed-url]", "text-overflow")).toBe("ellipsis");
  expect(property(".cy-browser-workspace__location [data-browser-committed-url]", "overflow")).toBe("hidden");
  expect(property(".cy-browser-workspace__toolbar", "background")).toBe("var(--cy-bg-workspace, #fff)");
});

const tabsCss = readFileSync(new URL("./BrowserWorkspaceTabs.css", import.meta.url), "utf8");
function tabsProperty(selector: string, name: string): string {
  const dom = new JSDOM(`<style>${tabsCss}</style>`);
  const rules = [...dom.window.document.styleSheets[0].cssRules] as CSSStyleRule[];
  const value = rules.filter(rule => rule.selectorText?.split(",").map(part => part.trim()).includes(selector))
    .map(rule => rule.style.getPropertyValue(name)).filter(Boolean).at(-1) ?? "";
  dom.window.close(); return value;
}
it("keeps tabs in one scrollable row and the close control reachable by hover, focus and selection", () => {
  expect(tabsProperty(".cy-browser-window__tabs", "flex-wrap")).toBe("nowrap");
  expect(tabsProperty(".cy-browser-window__tabs", "overflow-x")).toBe("auto");
  expect(tabsProperty(".cy-browser-window__tab > button[data-browser-close-tab]", "opacity")).toBe("0");
  expect(tabsProperty(".cy-browser-window__tab:focus-within > button[data-browser-close-tab]", "opacity")).toBe("1");
});
it("shows load progress without removing the committed address row", () => {
  expect(property(".cy-browser-workspace__toolbar[data-browser-busy]::after", "animation")).toContain("cy-browser-load");
  expect(property(".cy-browser-workspace__location", "display")).not.toBe("none");
  expect(property(".cy-browser-workspace__address:focus-within", "outline")).toContain("var(--cy-accent");
});

it("uses the user's contrast tokens for browser error and keyboard-focus surfaces", () => {
  expect(property(":root[data-ui-colors] .cy-browser-workspace__notice.is-error", "color")).toBe("var(--cy-text)");
  expect(property(":root[data-ui-colors] .cy-browser-workspace__notice.is-error", "background")).toBe("var(--cy-bg-hover)");
  expect(property(".cy-browser-permission button:focus-visible", "outline")).toContain("var(--cy-accent");
});
