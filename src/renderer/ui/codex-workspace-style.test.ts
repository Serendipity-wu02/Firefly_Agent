import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const sources = {
  root: readFileSync(new URL("../react/styles/react-root.css", import.meta.url), "utf8"),
  inspector: readFileSync(new URL("../react/features/chat/components/RightInspector.css", import.meta.url), "utf8"),
  theme: readFileSync(new URL("./theme.css", import.meta.url), "utf8"),
  messages: readFileSync(new URL("../react/features/chat/components/ChatMessageList.css", import.meta.url), "utf8"),
};
function value(file: keyof typeof sources, selector: string, property: string, media?: string): string {
  const dom = new JSDOM(`<style>${sources[file]}</style>`);
  const topLevel = [...dom.window.document.styleSheets[0].cssRules];
  const rules = (media
    ? topLevel.filter(rule => "conditionText" in rule && rule.conditionText === media)
      .flatMap(rule => [...(rule as CSSMediaRule).cssRules])
    : topLevel) as CSSStyleRule[];
  const result = rules.filter(rule => rule.selectorText?.split(",").map(text => text.trim()).includes(selector))
    .map(rule => rule.style.getPropertyValue(property)).filter(Boolean).at(-1) ?? "";
  dom.window.close(); return result;
}
function channels(hex: string) { return [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)); }

describe("Codex-reference workbench presentation", () => {
  it("defaults to a cool blue-grey light palette in both React and shared theme tokens", () => {
    // Tinted but restrained: no channel spread beyond a slate cast, and text stays dark on a light ground.
    for (const key of ["--cy-accent", "--cy-text", "--cy-text-muted", "--cy-border"]) {
      const rgb = channels(value("root", ":root", key));
      expect(Math.max(...rgb) - Math.min(...rgb), key).toBeLessThanOrEqual(40);
    }
    expect(Math.min(...channels(value("root", ":root", "--cy-bg-page")))).toBeGreaterThanOrEqual(232);
    expect(Math.max(...channels(value("root", ":root", "--cy-text")))).toBeLessThanOrEqual(100);
    expect(value("theme", '[data-ui-theme="pearl-white"]', "--rb-pink-500")).toBe(value("root", ":root", "--cy-accent"));
  });
  it("uses adjacent flat columns while retaining the 12px outer and content corners", () => {
    expect(value("root", ".cy-page", "gap")).toBe("0px");
    const padding = value("root", ".cy-page", "padding");
    expect(padding).toBe("var(--cy-app-titlebar-height) var(--cy-workspace-gutter) var(--cy-workspace-gutter) 48px");
    expect(value("root", ":root", "--cy-app-titlebar-height")).toBe("50px");
    expect(value("root", ":root", "--cy-workspace-gutter")).toBe("8px");
    // CSSOM does not resolve var() in JSDOM. Check the actual referenced token
    // values too, so the geometry contract cannot pass with incorrect defaults.
    expect(padding.replace(/var\((--[\w-]+)\)/g, (_, token: string) => value("root", ":root", token)))
      .toBe("50px 8px 8px 48px");
    expect(value("root", ".cy-page", "border-radius")).toBe("12px");
    for (const [file, selector] of [["root", ".cy-workspace"], ["inspector", ".cy-right-inspector"]] as const) {
      expect(value(file, selector, "border")).toBe("0px");
      expect(value(file, selector, "box-shadow")).toBe("none");
      expect(value(file, selector, "border-radius")).toBe("12px");
    }
  });
  it("aligns context, conversation and inspector headers on the shared 48px row", () => {
    expect(value("root", ":root", "--cy-workspace-header-height")).toBe("48px");
    for (const selector of [".cy-page-context-header", ".cy-workspace-header"]) {
      expect(value("root", selector, "height")).toBe("var(--cy-workspace-header-height)");
    }
    expect(value("inspector", ".cy-right-inspector__tabs > .ant-tabs-nav", "height"))
      .toBe("var(--cy-workspace-header-height)");
  });
  it("keeps the titlebar and rail clear when the narrow sidebar floats over the workspace", () => {
    const media = "(max-width: 900px)";
    expect(value("root", ".cy-page.is-collapsed", "padding-left")).toBe("48px");
    expect(value("root", ".cy-page-sidebar.is-floating", "top")).toBe("var(--cy-app-titlebar-height)");
    expect(value("root", ".cy-page-sidebar", "position", media)).toBe("absolute");
    expect(value("root", ".cy-page-sidebar", "top", media)).toBe("var(--cy-app-titlebar-height)");
    expect(value("root", ".cy-page-sidebar", "left", media)).toBe("56px");
    expect(value("root", ".cy-page-sidebar", "bottom", media)).toBe(value("root", ":root", "--cy-workspace-gutter"));
    expect(value("root", ".cy-page-sidebar", "border-radius", media)).toBe("12px");
    expect(value("root", ".cy-workspace-composer", "padding", media)).toBe("12px");
    expect(value("root", ".cy-workspace.has-messages .cy-workspace-composer", "padding", media)).toBe("12px");
  });
  it("draws thin neutral separators without a permanent accent stripe", () => {
    expect(value("root", ".cy-dock-separator::after", "width")).toBe("1px");
    expect(value("root", ".cy-dock-separator::after", "background")).toBe("var(--cy-border)");
    expect(value("root", ".cy-sidebar-resizer::after", "width")).toBe("1px");
    expect(value("root", ".cy-sidebar-resizer::after", "background")).toBe("var(--cy-border)");
  });
  it("uses rounded tab chips and keeps native browser bounds stable during entry", () => {
    expect(value("inspector", ".cy-right-inspector__tabs.ant-tabs .ant-tabs-tab", "border-radius")).toBe("12px");
    expect(value("inspector", ".cy-right-inspector__tabs .ant-tabs-tab.ant-tabs-tab-active", "box-shadow")).toBe("none");
    expect(sources.inspector).not.toContain("transform: translateX");
  });
  it("centres the empty-state greeting and composer as one group without changing the composer's component lifetime", () => {
    expect(value("root", ".cy-workspace.is-empty .cy-workspace-composer", "flex")).toBe("0 0 auto");
    // auto margins above the greeting and below the composer split the free space around the pair
    expect(value("root", ".cy-workspace.is-empty .cy-workspace-greeting", "margin-top")).toBe("auto");
    expect(value("root", ".cy-workspace.is-empty .cy-workspace-composer", "margin-top")).toBe("0px");
    expect(value("root", ".cy-workspace.is-empty .cy-workspace-composer", "margin-bottom")).toBe("auto");
    expect(value("root", ".cy-workspace-greeting", "display")).toBe("none"); // hidden once the conversation has messages
  });
  it("does not paint an accent box behind a sticker-only user message", () => {
    expect(value("messages", ":root[data-ui-colors] .cy-message--user:has(.cy-message__sticker:only-child) .ant-bubble-content", "background")).toBe("transparent");
  });
  it("keeps default user bubbles light and retains chosen custom accent colors", () => {
    expect(value("messages", ".cy-message--user .ant-bubble-content", "background")).toBe("var(--cy-bg-active)");
    expect(value("messages", ".cy-message--user .ant-bubble-content", "color")).toBe("var(--cy-text)");
    expect(value("messages", ":root[data-ui-colors] .cy-message--user .ant-bubble-content", "background")).toBe("var(--cy-accent)");
    expect(value("messages", ":root[data-ui-colors] .cy-message--user .ant-bubble-content", "color")).toBe("var(--rb-text-on-pink)");
  });
});
