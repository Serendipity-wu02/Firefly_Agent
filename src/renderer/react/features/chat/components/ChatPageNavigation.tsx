import React, { useRef, useState } from "react";
import { Popover } from "antd";
import { Ellipsis, LayoutDashboard } from "lucide-react";
import { useTranslation } from "../../../i18n";
import type { ChatSessionMeta, ConversationMode } from "../../../../../shared/chat-types";
import { ModeSwitch } from "../../../components/ui/ModeSwitch";
import { ModelModeButton } from "../../../components/ui/ModelModeButton";
import { NewTaskButton } from "../../../components/ui/NewTaskButton";
import { PluginModeButton } from "../../../components/ui/PluginModeButton";
import { SettingsButton } from "../../../components/ui/SettingsButton";
import { SidebarToggle } from "../../../components/ui/SidebarToggle";
import { SkillModeButton } from "../../../components/ui/SkillModeButton";
import { ToolModeButton } from "../../../components/ui/ToolModeButton";
import { WindowControls } from "../../../components/ui/WindowControls";
import { AppUpdateEntry } from "./AppUpdateEntry";
import { ConversationSidebar } from "./ConversationSidebar";
import { reportChatPerfRender } from "./chat-perf-probe";

export type ChatPagePanel = "tool" | "skill" | "model" | "plugin";

export interface ChatPageNavigationProps {
  collapsed: boolean;
  activePanel: ChatPagePanel | null;
  mode: ConversationMode;
  sessions: ChatSessionMeta[];
  sessionListStatus: "loading" | "error" | "ready";
  activeSessionId?: string;
  onToggleCollapsed: () => void;
  onModeChange: (mode: string) => void;
  onNewTask: () => void;
  onTogglePanel: (panel: ChatPagePanel) => void;
  onSelectSession: (sessionId: string) => void;
  onOpenProject: (workspaceRoot: string) => void;
  onRenameSession: (sessionId: string, newTitle: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onTogglePinSession: (sessionId: string, pinned: boolean) => void;
  onExportSession: (sessionId: string) => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onCloseWindow: () => void;
  onOpenSettings: () => void;
}

// 阶段 1A：memo 隔离——ChatPage 流式重渲染时，只要 props 引用稳定（sessions/回调由父级保证），
// 导航子树（含内嵌的 ConversationSidebar）整体跳过执行，流式期间执行次数应为 0（探针验收）。
export const ChatPageNavigation = React.memo(function ChatPageNavigation({
  collapsed,
  activePanel,
  mode,
  sessions,
  sessionListStatus,
  activeSessionId,
  onToggleCollapsed,
  onModeChange,
  onNewTask,
  onTogglePanel,
  onSelectSession,
  onOpenProject,
  onRenameSession,
  onDeleteSession,
  onTogglePinSession,
  onExportSession,
  onMinimize,
  onMaximize,
  onCloseWindow,
  onOpenSettings,
}: ChatPageNavigationProps) {
  // 性能探针：perf harness 注册后统计导航子树执行次数（阶段 1A 验收：流式期间应为 0）
  reportChatPerfRender("navigationRenders");
  const hasOpenPanel = activePanel !== null;
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const chooseMorePanel = (panel: ChatPagePanel) => {
    setMoreOpen(false);
    onTogglePanel(panel);
    moreRef.current?.focus();
  };

  return (
    <>
      <div className="cy-page-toggle">
        <SidebarToggle collapsed={collapsed} onToggle={onToggleCollapsed} />
      </div>
      <div className="cy-page-windows">
        <WindowControls onMinimize={onMinimize} onMaximize={onMaximize} onClose={onCloseWindow} />
      </div>
      <nav className="cy-page-rail" aria-label={t("ui.navigation")}>
        <button type="button" className={`cy-rail-button ${!hasOpenPanel ? "is-active" : ""}`}
          title={t("ui.workbench")} aria-label={t("ui.workbench")} aria-pressed={!hasOpenPanel}
          onClick={() => {
            if (activePanel) onTogglePanel(activePanel);
            if (collapsed) onToggleCollapsed();
          }}>
          <LayoutDashboard size={20} aria-hidden="true" />
        </button>
        <PluginModeButton active={activePanel === "plugin"} onClick={() => onTogglePanel("plugin")} />
        <Popover trigger="click" placement="rightTop" open={moreOpen} onOpenChange={setMoreOpen}
          content={(
            <div className="cy-page-more" onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation(); setMoreOpen(false); moreRef.current?.focus();
              }
            }}>
              <ToolModeButton active={activePanel === "tool"} onClick={() => chooseMorePanel("tool")} />
              <SkillModeButton active={activePanel === "skill"} onClick={() => chooseMorePanel("skill")} />
              <ModelModeButton active={activePanel === "model"} onClick={() => chooseMorePanel("model")} />
            </div>
          )}>
          <button ref={moreRef} type="button" className={`cy-rail-button ${moreOpen ? "is-active" : ""}`}
            title={t("ui.more")} aria-label={t("ui.more")} aria-expanded={moreOpen}>
            <Ellipsis size={20} aria-hidden="true" />
          </button>
        </Popover>
        <div className="cy-page-rail-bottom"><SettingsButton onClick={onOpenSettings} /></div>
      </nav>
      <aside id="firefly-context-sidebar" className="cy-page-sidebar" inert={collapsed} aria-hidden={collapsed} aria-label={t("ui.contextSidebar")}>
        <div className="cy-page-context-header">Firefly</div>
        <ModeSwitch value={mode} onChange={onModeChange} />
        <div className="cy-page-newtask">
          <NewTaskButton onClick={onNewTask} />
        </div>
        <div className="cy-page-conversations">
          <ConversationSidebar
            mode={mode}
            sessions={sessions}
            listStatus={sessionListStatus}
            activeSessionId={activeSessionId}
            onSelect={onSelectSession}
            onOpenProject={onOpenProject}
            onRename={onRenameSession}
            onDelete={onDeleteSession}
            onTogglePin={onTogglePinSession}
            onExport={onExportSession}
          />
        </div>
        <AppUpdateEntry />
      </aside>
    </>
  );
});
