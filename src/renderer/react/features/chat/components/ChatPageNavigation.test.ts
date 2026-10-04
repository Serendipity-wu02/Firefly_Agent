// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../components/ui/SidebarToggle", () => ({
  SidebarToggle: ({ collapsed }: { collapsed: boolean }) => createElement("span", null, `sidebar-toggle:${collapsed}`),
}));
vi.mock("../../../components/ui/ModeSwitch", () => ({
  ModeSwitch: () => createElement("span", null, "mode-switch"),
}));
vi.mock("../../../components/ui/ToolModeButton", () => ({
  ToolModeButton: ({ active }: { active: boolean }) => createElement("span", null, `tool-button:${active}`),
}));
vi.mock("../../../components/ui/SkillModeButton", () => ({
  SkillModeButton: () => createElement("span", null, "skill-button"),
}));
vi.mock("../../../components/ui/ModelModeButton", () => ({
  ModelModeButton: () => createElement("span", null, "model-button"),
}));
vi.mock("../../../components/ui/PluginModeButton", () => ({
  PluginModeButton: ({ active }: { active: boolean }) => createElement("span", null, `plugin-button:${active}`),
}));
vi.mock("../../../components/ui/WindowControls", () => ({
  WindowControls: () => createElement("span", null, "window-controls"),
}));
vi.mock("../../../components/ui/SettingsButton", () => ({
  SettingsButton: () => createElement("span", null, "settings-button"),
}));
vi.mock("../../../components/ui/UserAvatar", () => ({ UserAvatar: () => createElement("span", null, "user-avatar") }));
vi.mock("../../../components/ui/NewTaskButton", () => ({
  NewTaskButton: () => createElement("span", null, "new-task-button"),
}));
vi.mock("./AppUpdateEntry", () => ({ AppUpdateEntry: () => createElement("span", null, "app-update-entry") }));
vi.mock("./ConversationSidebar", () => ({
  ConversationSidebar: ({ listStatus }: { listStatus: string }) => createElement("span", null, `conversation-sidebar:${listStatus}`),
}));

import { ChatPageNavigation } from "./ChatPageNavigation";

describe("ChatPageNavigation", () => {
  it("keeps context modes while a tool panel is open", () => {
    const html = renderToStaticMarkup(createElement(ChatPageNavigation, {
      collapsed: false,
      activePanel: "tool",
      mode: "chat",
      sessions: [],
      sessionListStatus: "loading",
      activeSessionId: undefined,
      onToggleCollapsed: () => undefined,
      onModeChange: () => undefined,
      onNewTask: () => undefined,
      onTogglePanel: () => undefined,
      onSelectSession: () => undefined,
      onOpenProject: () => undefined,
      onRenameSession: () => undefined,
      onDeleteSession: () => undefined,
      onTogglePinSession: () => undefined,
      onMinimize: () => undefined,
      onMaximize: () => undefined,
      onCloseWindow: () => undefined,
      onOpenSettings: () => undefined,
    }));

    expect(html).toContain("mode-switch");
    expect(html).toContain("更多");
    expect(html).toContain("conversation-sidebar:loading");
  });

  it("places the plugin entry in the rail and marks it active", () => {
    const html = renderToStaticMarkup(createElement(ChatPageNavigation, {
      collapsed: false,
      activePanel: "plugin",
      mode: "chat",
      sessions: [],
      sessionListStatus: "error",
      activeSessionId: undefined,
      onToggleCollapsed: () => undefined,
      onModeChange: () => undefined,
      onNewTask: () => undefined,
      onTogglePanel: () => undefined,
      onSelectSession: () => undefined,
      onOpenProject: () => undefined,
      onRenameSession: () => undefined,
      onDeleteSession: () => undefined,
      onTogglePinSession: () => undefined,
      onMinimize: () => undefined,
      onMaximize: () => undefined,
      onCloseWindow: () => undefined,
      onOpenSettings: () => undefined,
    }));

    expect(html).toContain("plugin-button:true");
    expect(html).toContain("cy-page-rail");
    expect(html).toContain("mode-switch");
    expect(html).toContain("conversation-sidebar:error");
  });
});
