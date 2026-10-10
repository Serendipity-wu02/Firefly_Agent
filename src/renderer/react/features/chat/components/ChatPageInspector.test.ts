import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./PlanReviewPanel", () => ({
  PlanContent: () => null,
  planTabDotClass: () => "is-review",
  planTabLabel: () => "计划 · 待审批",
}));
vi.mock("./ReviewInspector", () => ({ ReviewDiffContent: () => null }));
// FileTreePanel 会引入 ChatMessageList 的 MarkdownContent（MD 预览用），
// 正文渲染涉及浏览器样式与插件链；该结构测试只需轻量替身。
vi.mock("./ChatMessageList", () => ({
  MarkdownContent: ({ content }: { content: string }) => createElement("div", null, content),
}));

import { ChatPageInspector } from "./ChatPageInspector";

describe("ChatPageInspector", () => {
  it("keeps the closed browser entry available before the first session", () => {
    const props = {
      sessionId: "session-a", browserTabOpen: true, filesTabOpen: false, filesTabPinned: false,
      fileTabs: [], diffTabs: [], activePlan: null, planDrawerOpen: false,
      planTabId: "plan:session-a", activeTabId: "browser", onTabChange: () => undefined,
      onCloseTab: () => undefined, onOpenFile: () => undefined,
    };
    const html = renderToStaticMarkup(createElement(ChatPageInspector, props));
    expect(html).toContain('role="tab"');
    expect(html).toContain('inputMode="url"');
    expect(html.match(/<aside/g)).toHaveLength(1);
    expect(html).not.toMatch(/<(iframe|webview)\b/);
    const welcome = renderToStaticMarkup(createElement(ChatPageInspector, { ...props, sessionId: undefined }));
    expect(welcome).toContain('inputMode="url"');
    expect(welcome).not.toMatch(/<(iframe|webview)\b/);
  });
  it("renders a file empty state and workspace selection before a session exists", () => {
    const html = renderToStaticMarkup(createElement(ChatPageInspector, {
      filesTabOpen: true, filesTabPinned: false, fileTabs: [], diffTabs: [],
      activePlan: null, planDrawerOpen: false, planTabId: "plan:session", activeTabId: "files",
      onTabChange: () => undefined, onCloseTab: () => undefined, onOpenFile: () => undefined,
      onChooseWorkspace: () => undefined,
    }));
    expect(html).toContain('role="tab"');
    expect(html).toContain('class="cy-workspace-empty"');
    expect(html).toContain('data-workspace-choose="true"');
  });
  it("interpolates the selected workspace name in the welcome file state", () => {
    const html = renderToStaticMarkup(createElement(ChatPageInspector, {
      filesTabOpen: true, filesTabPinned: false, fileTabs: [], diffTabs: [],
      activePlan: null, planDrawerOpen: false, planTabId: "plan:session", activeTabId: "files",
      onTabChange: () => undefined, onCloseTab: () => undefined, onOpenFile: () => undefined,
      pendingWorkspaceName: "Synthetic selected folder",
    }));
    expect(html).toContain("Synthetic selected folder");
    expect(html).not.toContain("{name}");
  });
  it("hosts task content in the right workspace tab", () => {
    const html = renderToStaticMarkup(createElement(ChatPageInspector, {
      filesTabOpen: false, filesTabPinned: false, fileTabs: [], diffTabs: [],
      activePlan: null, planDrawerOpen: false, planTabId: "plan:session", activeTabId: "tasks",
      onTabChange: () => undefined, onCloseTab: () => undefined, onOpenFile: () => undefined,
      tasksTabOpen: true, taskPanel: createElement("div", { "data-task-fixture": true }, "Task fixture"),
    }));
    expect(html).toContain('data-task-fixture="true"');
    expect(html).toContain('class="cy-right-inspector');
  });
  it("renders nothing when no inspector tab is available", () => {
    const html = renderToStaticMarkup(createElement(ChatPageInspector, {
      sessionId: undefined,
      workspaceRoot: undefined,
      filesTabOpen: false,
      filesTabPinned: false,
      fileTabs: [],
      diffTabs: [],
      activePlan: null,
      planDrawerOpen: false,
      planTabId: "plan:session",
      activeTabId: null,
      onTabChange: () => undefined,
      onCloseTab: () => undefined,
      onOpenFile: () => undefined,
    }));

    expect(html).toBe("");
  });
});
