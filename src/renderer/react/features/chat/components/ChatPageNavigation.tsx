import React, { useEffect, useRef, useState } from "react";
import { Popover } from "antd";
import { Ellipsis, Search } from "lucide-react";
import { useTranslation } from "../../../i18n";
import type { ChatSessionMeta, ConversationMode } from "../../../../../shared/chat-types";
import type { TodoState } from "../../../../../shared/todo-types";
import { ModeTabs } from "../../../components/ui/ModeTabs";
import { ModelModeButton } from "../../../components/ui/ModelModeButton";
import { NewTaskButton } from "../../../components/ui/NewTaskButton";
import { PluginModeButton } from "../../../components/ui/PluginModeButton";
import { resolveAsset } from "../../../../../shared/renderer-base";
import { SidebarToggle } from "../../../components/ui/SidebarToggle";
import { SkillModeButton } from "../../../components/ui/SkillModeButton";
import { ToolModeButton } from "../../../components/ui/ToolModeButton";
import { WindowControls } from "../../../components/ui/WindowControls";
import { AppUpdateEntry } from "./AppUpdateEntry";
import { ConversationSidebar } from "./ConversationSidebar";
import { SidebarSearchDialog } from "./SidebarSearchDialog";
import { SidebarTaskCard } from "./SidebarTaskCard";
import { SidebarUserRow } from "./SidebarUserRow";
import { ModelConnectionIndicator } from "./ModelConnectionIndicator";
import { useSidebarWidth } from "../pages/useSidebarWidth";
import { reportChatPerfRender } from "./chat-perf-probe";

export type ChatPagePanel = "tool" | "skill" | "model" | "plugin";

export interface ChatPageNavigationProps {
  collapsed: boolean;
  activePanel: ChatPagePanel | null;
  mode: ConversationMode;
  sessions: ChatSessionMeta[];
  sessionListStatus: "loading" | "error" | "ready";
  activeSessionId?: string;
  activeModelProfileId?: string;
  /** Todo list of the active task, shown in the card at the bottom of the sidebar (work and code only). */
  todoState?: TodoState | null;
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
  onOpenApiSettings?: () => void;
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
  activeModelProfileId,
  todoState,
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
  onOpenApiSettings,
}: ChatPageNavigationProps) {
  // 性能探针：perf harness 注册后统计导航子树执行次数（阶段 1A 验收：流式期间应为 0）
  reportChatPerfRender("navigationRenders");
  const sidebar = useSidebarWidth(collapsed);
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  // The thin strip along the left window edge is what brings the folded sidebar back on hover.
  const edgeRef = useRef<HTMLElement>(null);
  const contextRef = useRef<HTMLElement>(null);
  const [peeking, setPeeking] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pointerWithin = useRef(false);
  const keyboardInteraction = useRef(false);
  const owns = (target: EventTarget | null) => target instanceof Node &&
    Boolean(edgeRef.current?.contains(target) || contextRef.current?.contains(target));
  const holdFocus = () => owns(document.activeElement) &&
    (keyboardInteraction.current || Boolean(document.activeElement?.closest('[role="menu"], .ant-popover')));
  const enter = () => { pointerWithin.current = true; if (collapsed && !moreOpen) setPeeking(true); };
  const leave = (event: React.PointerEvent) => {
    if (owns(event.relatedTarget)) return;
    pointerWithin.current = false;
    if (!sidebar.isResizing && !moreOpen && !holdFocus()) setPeeking(false);
  };
  useEffect(() => { setPeeking(false); }, [collapsed]);
  useEffect(() => {
    const focus = (event: FocusEvent) => {
      if (collapsed && owns(event.target) && !moreOpen) setPeeking(true);
      else if (!pointerWithin.current && !moreOpen) setPeeking(false);
    };
    const pointerDown = () => { keyboardInteraction.current = false; };
    const pointerMove = (event: globalThis.PointerEvent) => {
      if (owns(event.target)) return;
      pointerWithin.current = false;
      if (!sidebar.isResizing && !moreOpen && !holdFocus()) setPeeking(false);
    };
    const shortcut = (event: KeyboardEvent) => {
      keyboardInteraction.current = true;
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "s" && !event.repeat) {
        event.preventDefault(); onToggleCollapsed();
      } else if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault(); setSearchOpen(true);
      }
    };
    const blur = () => { pointerWithin.current = false; setPeeking(false); };
    document.addEventListener("focusin", focus);
    document.addEventListener("pointerdown", pointerDown);
    document.addEventListener("pointermove", pointerMove);
    window.addEventListener("keydown", shortcut);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("focusin", focus);
      document.removeEventListener("pointerdown", pointerDown);
      document.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("keydown", shortcut);
      window.removeEventListener("blur", blur);
    };
  }, [collapsed, moreOpen, onToggleCollapsed, sidebar.isResizing]);
  useEffect(() => {
    if (!sidebar.isResizing && !moreOpen && !pointerWithin.current && !holdFocus()) setPeeking(false);
  }, [moreOpen, sidebar.isResizing]);
  const hidden = collapsed && !peeking && !sidebar.isResizing;
  const chooseMorePanel = (panel: ChatPagePanel) => {
    setMoreOpen(false);
    onTogglePanel(panel);
    moreRef.current?.focus();
  };

  const resizeHandle = <div className={`cy-sidebar-resizer ${sidebar.isResizing ? "is-resizing" : ""}`} role="separator" tabIndex={0}
        aria-label={t("workspace.resizeSidebar")} aria-orientation="vertical"
        aria-controls="firefly-context-sidebar" aria-valuemin={sidebar.min}
        aria-valuemax={sidebar.max} aria-valuenow={sidebar.width}
        onPointerDown={sidebar.beginResize}
        onKeyDown={(event) => {
          const delta = event.key === "Home" ? sidebar.min - sidebar.width
            : event.key === "End" ? sidebar.max - sidebar.width
              : event.key === "ArrowRight" ? 16 : event.key === "ArrowLeft" ? -16 : null;
          if (delta === null) return;
          event.preventDefault();
          sidebar.resizeBy(delta);
        }} />;

  const morePanelActive = activePanel === "tool" || activePanel === "skill" || activePanel === "model";
  return (
    <>
      <header className="cy-page-titlebar">
        <div className="cy-page-toggle">
          <SidebarToggle collapsed={collapsed} onToggle={onToggleCollapsed} />
          <div className="cy-page-role">
            <img className="cy-page-role-avatar" src={resolveAsset("avatars/firefly-avatar.png")} alt="Firefly" draggable={false} />
            <ModelConnectionIndicator activeProfileId={activeModelProfileId} onOpenSettings={onOpenApiSettings ?? onOpenSettings} />
          </div>
        </div>
        <div className="cy-page-top-center">
          <ModeTabs value={mode} onChange={onModeChange} />
        </div>
        <div className="cy-page-windows">
          <WindowControls onMinimize={onMinimize} onMaximize={onMaximize} onClose={onCloseWindow} />
        </div>
      </header>
      {collapsed && <nav ref={edgeRef} onPointerEnter={enter} onPointerLeave={leave} className="cy-page-edge" aria-label={t("ui.navigation")} />}
      <aside ref={contextRef} onPointerEnter={enter} onPointerLeave={leave} id="firefly-context-sidebar" className={`cy-page-sidebar ${collapsed ? "is-floating" : ""} ${peeking ? "is-peeking" : ""}`} style={{ width: sidebar.width }} inert={hidden} aria-hidden={hidden} aria-label={t("ui.contextSidebar")}>
        {collapsed && <span className="cy-sidebar-hover-corridor" aria-hidden="true" />}
        <div className="cy-page-newtask">
          <NewTaskButton label={mode === "chat" ? undefined : t("ui.newTaskButton")} onClick={onNewTask} />
          <button type="button" className="cy-side-action cy-side-action--search" onClick={() => setSearchOpen(true)} aria-label={t("sidebar.searchAction")} aria-keyshortcuts="Control+K">
            <span className="cy-side-action-icon"><Search size={16} strokeWidth={1.8} aria-hidden="true" /></span>
            <span className="cy-side-action-label">{t("sidebar.searchAction")}</span>
            <kbd>Ctrl K</kbd>
          </button>
          <PluginModeButton active={activePanel === "plugin"} onClick={() => onTogglePanel("plugin")} />
          <Popover trigger={["hover", "click"]} mouseEnterDelay={0.08} mouseLeaveDelay={0.2} placement="rightTop" open={moreOpen} onOpenChange={setMoreOpen}
            getPopupContainer={() => contextRef.current!}
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
            <button ref={moreRef} type="button" className={`cy-side-action ${moreOpen || morePanelActive ? "is-active" : ""}`}
              title={t("ui.more")} aria-label={t("ui.more")} aria-expanded={moreOpen}>
              <span className="cy-side-action-icon"><Ellipsis size={18} aria-hidden="true" /></span>
              <span className="cy-side-action-label">{t("ui.more")}</span>
            </button>
          </Popover>
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
        {(mode === "work" || mode === "code") && <SidebarTaskCard mode={mode} state={todoState ?? null} />}
        <AppUpdateEntry />
        <SidebarUserRow onOpenSettings={onOpenSettings} />
        {sidebar.overlay && !hidden && resizeHandle}
      </aside>
      {!sidebar.overlay && resizeHandle}
      <SidebarSearchDialog open={searchOpen} sessions={sessions} activeSessionId={activeSessionId}
        onClose={() => setSearchOpen(false)} onSelect={onSelectSession} />
    </>
  );
});
