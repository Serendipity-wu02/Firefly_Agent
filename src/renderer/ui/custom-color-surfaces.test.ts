import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { uiColorTokens } from "../../shared/ui-colors";

const files = ["ChatMessageList", "ConversationSidebar", "RightInspector", "RunExperience", "ReviewPanel", "ChatComposer"] as const;
const styles = Object.fromEntries(files.map(name => [name, readFileSync(new URL(`../react/features/chat/components/${name}.css`, import.meta.url), "utf8") ]));
styles.root = readFileSync(new URL("../react/styles/react-root.css", import.meta.url), "utf8");

function declaration(file: string, selector: string, property: string): string {
  const dom = new JSDOM(`<style>${styles[file]}</style>`);
  const rules = Array.from(dom.window.document.styleSheets[0].cssRules) as CSSStyleRule[];
  const matches = rules.filter(rule => rule.selectorText?.split(",").map(value => value.trim()).includes(selector));
  const value = matches.map(rule => rule.style.getPropertyValue(property)).filter(Boolean).at(-1) ?? "";
  dom.window.close();
  return value;
}

const surfaces: [string, string, string][] = [
  ["ChatMessageList", '.cy-message-markdown [data-streamdown="table-wrapper"]', "--cy-bg-workspace"],
  ["ChatMessageList", '.cy-message-markdown [data-streamdown="table"] th', "--cy-bg-page"],
  ["ChatMessageList", ".cy-mermaid--fallback .cy-mermaid__source", "--cy-bg-page"],
  ["ChatMessageList", ".cy-svg-card--fallback .cy-svg-card__source", "--cy-bg-page"],
  ["ChatMessageList", ".cy-message-markdown-fallback", "--cy-bg-page"],
  ["ChatMessageList", ".cy-tool-executions__result", "--cy-bg-page"],
  ["ChatMessageList", ".cy-ask-user-qa__row", "--cy-bg-page"],
  ["ConversationSidebar", ".cy-conversation-list .ant-conversations-item-active", "--cy-bg-workspace"],
  ["ConversationSidebar", ".cy-session-rename-input", "--cy-bg-workspace"],
  ["ConversationSidebar", ".cy-session-rename-input input", "--cy-bg-workspace"],
  ["ConversationSidebar", ".cy-project-popover .ant-popover-inner", "--cy-bg-workspace"],
  ["ConversationSidebar", ".cy-project-card__open", "--cy-bg-workspace"],
  ["ConversationSidebar", ".cy-session-context-menu", "--cy-bg-workspace"],
  ["ConversationSidebar", ".cy-session-context-menu .ant-menu", "--cy-bg-workspace"],
  ["RightInspector", ".cy-right-inspector", "--cy-bg-page"],
  ["RightInspector", ".cy-right-inspector__tabs > .ant-tabs-nav", "--cy-bg-page"],
  ["RightInspector", ".cy-right-inspector__tabs .ant-tabs-tab.ant-tabs-tab-active", "--cy-bg-active"],
  ["RunExperience", ".cy-task-plan-card", "--cy-bg-workspace"],
  ["RunExperience", ".cy-run-outcome", "--cy-bg-workspace"],
  ["RunExperience", ".cy-interaction-panel", "--cy-bg-page"],
  ["RunExperience", ".cy-interaction-panel__custom-answer input", "--cy-bg-workspace"],
  ["RunExperience", ".cy-interaction-panel__actions button", "--cy-bg-workspace"],
  ["RunExperience", ".cy-quiz-short-answer", "--cy-bg-workspace"],
  ["RunExperience", ".cy-quiz-graded__explanation", "--cy-bg-page"],
  ["ReviewPanel", ".cy-review-panel__restore-btn", "--cy-bg-workspace"],
  ["root", ".cy-compressing-context", "--cy-bg-workspace"],
  ["root", ".cy-workspace-empty button", "--cy-bg-workspace"],
  ["ChatComposer", ".cy-composer.ant-sender", "--cy-surface"],
  ["ChatComposer", ".cy-queue-dock__editor", "--cy-surface"],
  ["ChatComposer", ".cy-composer__attachment", "--cy-bg-page"],
  ["ChatComposer", ".cy-composer .ant-sender-actions-btn:disabled", "--cy-bg-hover"],
];

describe("custom-color foreground and surface pairs", () => {
  it.each(surfaces)("keeps %s %s paired with its custom foreground", (file, selector, token) => {
    expect(declaration(file, `:root[data-ui-colors] ${selector}`, "background")).toBe(`var(${token})`);
    const colors = uiColorTokens({ enabled: true, accent: "#eeeeee", background: "#121212", foreground: "#ffffff" });
    expect(colors[token]).toBeDefined();
    expect(colors[token]).not.toBe("#ffffff");
  });

  it.each([
    ["ChatMessageList", ".cy-message--user .ant-bubble-content"],
    ["ChatMessageList", ".cy-message--user .cy-message-markdown a"],
    ["RunExperience", ".cy-interaction-panel__actions button.is-primary"],
    ["ChatComposer", ".cy-composer .ant-sender-actions-btn"],
  ])("uses contrast-aware text on %s %s", (file, selector) => {
    expect(declaration(file, `:root[data-ui-colors] ${selector}`, "color")).toBe("var(--rb-text-on-pink)");
    expect(uiColorTokens({ enabled: true, accent: "#ffffff" })["--rb-text-on-pink"]).toBe("#000000");
    expect(uiColorTokens({ enabled: true, accent: "#000000" })["--rb-text-on-pink"]).toBe("#ffffff");
  });

  it("keeps the existing light defaults when custom colors are disabled", () => {
    expect(declaration("ChatMessageList", ".cy-message--user .ant-bubble-content", "color")).toBe("rgb(255, 255, 255)");
    expect(declaration("ConversationSidebar", ".cy-session-rename-input", "background")).toBe("rgb(255, 255, 255)");
    expect(declaration("RunExperience", ".cy-interaction-panel", "background")).toBe("rgb(245, 245, 247)");
    const dom = new JSDOM('<div class="cy-session-rename-input"></div>');
    const input = dom.window.document.querySelector("div")!;
    expect(input.matches(":root[data-ui-colors] .cy-session-rename-input")).toBe(false);
    dom.window.document.documentElement.dataset.uiColors = "#ffffff:#121212:#ffffff";
    expect(input.matches(":root[data-ui-colors] .cy-session-rename-input")).toBe(true);
    dom.window.close();
  });

  it("pairs composer text and disabled actions with their surfaces", () => {
    expect(declaration("ChatComposer", ".cy-composer .ant-sender-input", "color")).toBe("var(--cy-text)");
    expect(declaration("ChatComposer", ":root[data-ui-colors] .cy-queue-dock__editor", "color")).toBe("var(--cy-text)");
    expect(declaration("ChatComposer", ":root[data-ui-colors] .cy-composer .ant-sender-actions-btn:disabled", "color")).toBe("var(--cy-text-muted)");
  });

  it("boots shared live theme updates in the reminder window without dropping audio", () => {
    const toast = readFileSync(new URL("../toast/toast.ts", import.meta.url), "utf8");
    expect(toast).toMatch(/import\s+["']\.\.\/ui\/theme["']/);
    expect(toast).toContain('import actionSoundUrl from "./assets/toast-action.mp3"');
    expect(toast).toContain('import notifySoundUrl from "./assets/toast-notify.mp3"');
  });
});
