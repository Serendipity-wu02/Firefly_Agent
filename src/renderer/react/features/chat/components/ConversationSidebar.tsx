import { chatStore } from "../pages/chat-page-bridge";
import { useSidebarLayout } from "../pages/use-sidebar-layout";
import { projectSidebar } from "../pages/sidebar-projection";
import { SidebarLayoutControls } from "./SidebarLayoutControls";
import { Conversations, type ConversationItemType } from "@ant-design/x";
import { DeleteOutlined, DownloadOutlined, EditOutlined, PushpinOutlined } from "@ant-design/icons";
import { Input, Menu, Popover } from "antd";
import type { InputRef } from "antd";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "../../../i18n";
import { useFeedback } from "../../../components/feedback/FeedbackProvider";
import { reportChatPerfRender } from "./chat-perf-probe";
import type { ChatSessionMeta, ConversationMode } from "../../../../../shared/chat-types";

interface ConversationSidebarProps {
  mode: ConversationMode;
  sessions: ChatSessionMeta[];
  listStatus: "loading" | "error" | "ready";
  activeSessionId?: string;
  onSelect: (sessionId: string) => void;
  onOpenProject: (workspaceRoot: string) => void;
  onRename: (sessionId: string, newTitle: string) => void | Promise<void>;
  onDelete: (sessionId: string) => void | Promise<void>;
  onTogglePin: (sessionId: string, pinned: boolean) => void | Promise<void>;
  onExport: (sessionId: string) => void | Promise<void>;
}

interface ProjectSummary {
  name: string;
  workspaceRoot?: string;
  conversationCount: number;
  updatedAt: number;
}

function ProjectIcon({ mode }: { mode: ConversationMode }) {
  if (mode === "code") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M43 23V14C43 12.8954 42.1046 12 41 12H24L19 6H7C5.89543 6 5 6.89543 5 8V40C5 41.1046 5.89543 42 7 42H22" />
        <path d="M38 29L43 34L38 39" />
        <path d="M30 29L25 34L30 39" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M5 8C5 6.89543 5.89543 6 7 6H19L24 12H41C42.1046 12 43 12.8954 43 14V40C43 41.1046 42.1046 42 41 42H7C5.89543 42 5 41.1046 5 40V8Z" />
      <path d="M14 22L19 27L14 32" />
      <path d="M26 32H34" />
    </svg>
  );
}

function formatModifiedTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

function ProjectInfoCard({
  mode,
  project,
  onOpen,
}: {
  mode: ConversationMode;
  project: ProjectSummary;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="cy-project-card" aria-label={t("sidebar.projectInfoAria", { name: project.name })}>
      <div className="cy-project-card__name">
        <ProjectIcon mode={mode} />
        <span>{project.name}</span>
      </div>
      <dl className="cy-project-card__details">
        <div><dt>{t("sidebar.projectNameLabel")}</dt><dd>{project.name}</dd></div>
        <div><dt>{t("sidebar.conversationCountLabel")}</dt><dd>{project.conversationCount}</dd></div>
        <div><dt>{t("sidebar.projectPathLabel")}</dt><dd title={project.workspaceRoot}>{project.workspaceRoot ?? t("sidebar.noProjectPath")}</dd></div>
        <div><dt>{t("sidebar.lastModifiedLabel")}</dt><dd>{formatModifiedTime(project.updatedAt)}</dd></div>
      </dl>
      <button
        className="cy-project-card__open"
        type="button"
        disabled={!project.workspaceRoot}
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        <ProjectIcon mode={mode} />
        <span>{t("sidebar.openProjectFolder")}</span>
      </button>
    </section>
  );
}

// 阶段 1A：memo 隔离——ChatPage 流式重渲染时，只要 props 引用稳定（sessions/回调由父级保证），
// 侧栏子树整体跳过执行，流式期间执行次数应为 0（探针验收）。
export const ConversationSidebar = memo(function ConversationSidebar({
  mode,
  sessions,
  listStatus,
  activeSessionId,
  onSelect,
  onOpenProject,
  onRename,
  onDelete,
  onTogglePin,
  onExport,
}: ConversationSidebarProps) {
  // 性能探针：perf harness 注册后统计侧栏子树执行次数（阶段 1A 验收：流式期间应为 0）
  reportChatPerfRender("sidebarRenders");
  const { t } = useTranslation();
  // 统一反馈入口：删除会话走危险确认
  const feedback = useFeedback();
  const supportsProjects = mode === "work" || mode === "code";
  const sectionTitle = supportsProjects ? t("sidebar.projectsTitle") : t("sidebar.conversationsTitle");
  const layout = useSidebarLayout(typeof window === "undefined" ? undefined : chatStore()?.sidebarLayout, sessions);
  const projection = useMemo(() => layout.snapshot ? projectSidebar(sessions, layout.snapshot, mode) : null, [sessions, layout.snapshot, mode]);
  const groupBySession = useMemo(() => new Map(projection?.groups.flatMap(group => group.sessionIds.map(id => [id, group.groupId] as const)) ?? []), [projection]);
  const persistedExpanded = projection?.groups.filter(group => !layout.snapshot!.layout.modes[mode].collapsedGroupIds.includes(group.groupId)).map(group => group.groupId);
  const projects = useMemo(() => {
    const result = new Map<string, ProjectSummary>();
    for (const session of sessions) {
      const key = session.workspaceRoot ?? `unbound:${session.id}`;
      const current = result.get(key);
      if (current) {
        current.conversationCount += 1;
        current.updatedAt = Math.max(current.updatedAt, session.updatedAt);
      } else {
        result.set(key, {
          name: session.workspaceDisplayName ?? t("sidebar.unboundProject"),
          workspaceRoot: session.workspaceRoot,
          conversationCount: 1,
          updatedAt: session.updatedAt,
        });
      }
    }
    return result;
  }, [sessions]);
  // A single, expanded, unnamed group (typical Chat history) needs no heading of its own.
  const soleGroup = projection?.groups.length === 1 ? projection.groups[0] : undefined;
  const flat = !!soleGroup && !soleGroup.projectId && !soleGroup.sectionId && !!persistedExpanded?.includes(soleGroup.groupId);
  const projectKeys = useMemo(() => ["pinned", "recent", ...projects.keys()], [projects]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>(projectKeys);

  useEffect(() => {
    setExpandedKeys((current) => [...new Set([...current, ...projectKeys])]);
  }, [projectKeys]);

  const [contextMenu, setContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    sessionId: string;
    sessionTitle: string;
    pinned: boolean;
  }>({ open: false, x: 0, y: 0, sessionId: "", sessionTitle: "", pinned: false });

  const [editing, setEditing] = useState<{
    sessionId: string;
    value: string;
  } | null>(null);

  // antd Input 的 ref 是 InputRef（含 focus/select），不是原生元素
  const renameInputRef = useRef<InputRef | null>(null);

  useEffect(() => {
    if (!editing) return;
    const input = renameInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [editing]);

  const sortedSessions = useMemo(
    () => {
      if (projection) {
        const byId = new Map(sessions.map(session => [session.id, session]));
        return projection.groups.flatMap(group => group.sessionIds.map(id => byId.get(id)!).filter(Boolean));
      }
      return [...sessions].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.updatedAt - a.updatedAt;
      });
    },
    [sessions, projection],
  );

  // 阶段 1A：items 数组 useMemo——避免每次渲染重建（Conversations 拿到新数组引用即重渲染全部条目）
  const items: ConversationItemType[] = useMemo(
    () =>
      sortedSessions.map((session) => ({
        key: session.id,
        "data-session-id": session.id,
        "data-pinned": session.pinned ? "true" : undefined,
        label:
          editing?.sessionId === session.id ? (
            <Input
              ref={renameInputRef}
              size="small"
              className="cy-session-rename-input"
              value={editing.value}
              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
              onPressEnter={() => {
                const title = editing.value.trim();
                if (title && title !== session.title) {
                  void onRename(session.id, title);
                }
                setEditing(null);
              }}
              onBlur={() => setEditing(null)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setEditing(null);
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="cy-session-label">
              <span className="cy-session-label__title" title={session.title || t("sidebar.defaultSessionTitle")}>{session.title || t("sidebar.defaultSessionTitle")}</span>
              {session.pinned && <PushpinOutlined className="cy-session-label__pin" />}
            </span>
          ),
        group: groupBySession.get(session.id) ?? (supportsProjects ? session.workspaceRoot ?? `unbound:${session.id}` : session.pinned ? "pinned" : "recent"),
      })),
    [sortedSessions, editing, t, supportsProjects, onRename, groupBySession],
  );

  function openContextMenu(event: React.MouseEvent, sessionId: string) {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      sessionId,
      sessionTitle: session.title || t("sidebar.defaultSessionTitle"),
      pinned: session.pinned ?? false,
    });
  }

  function closeContextMenu() {
    setContextMenu((current) => ({ ...current, open: false }));
  }

  async function handleMenuClick(key: string) {
    closeContextMenu();
    if (key === "rename") {
      const target = sessions.find((s) => s.id === contextMenu.sessionId);
      setEditing({
        sessionId: contextMenu.sessionId,
        value: target?.title ?? "",
      });
    } else if (key.startsWith("move-section:")) {
      void layout.mutate({ mode, kind: "move-session", sessionId: contextMenu.sessionId, sectionId: key.slice("move-section:".length) || null });
    } else if (key === "move-up" || key === "move-down") {
      const group = projection?.groups.find(item => item.sessionIds.includes(contextMenu.sessionId));
      if (!group || !layout.snapshot) return;
      const index = group.sessionIds.indexOf(contextMenu.sessionId);
      const beforeSessionId = key === "move-up" ? group.sessionIds[index - 1] : group.sessionIds[index + 2];
      if ((key === "move-up" && index === 0) || (key === "move-down" && index === group.sessionIds.length - 1)) return;
      void layout.mutate({ mode, kind: "move-session", sessionId: contextMenu.sessionId, sectionId: group.sectionId ?? null, beforeSessionId });
    } else if (key === "toggle-pin") {
      void onTogglePin(contextMenu.sessionId, !contextMenu.pinned);
    } else if (key === "export-markdown") {
      void onExport(contextMenu.sessionId);
    } else if (key === "delete") {
      // 删除会话不可恢复：危险确认，默认聚焦取消，确认后才触发删除
      const confirmed = await feedback.confirm({
        title: t("sidebar.deleteConfirmTitle", { title: contextMenu.sessionTitle }),
        message: t("sidebar.deleteConfirmContent"),
        confirmText: t("sidebar.delete"),
        cancelText: t("common.cancel"),
        dangerous: true,
      });
      if (confirmed) onDelete(contextMenu.sessionId);
    }
  }

  useEffect(() => {
    if (!contextMenu.open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (target.closest(".cy-session-context-menu")) return;
      closeContextMenu();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeContextMenu();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu.open]);

  return (
    <nav className="cy-conversation-sidebar" aria-label={supportsProjects ? t("sidebar.projectsAndConversationsAria") : t("sidebar.conversationListAria")}>
      {layout.snapshot && projection
        ? <SidebarLayoutControls mode={mode} snapshot={layout.snapshot} groups={projection.groups} title={sectionTitle}
          projectIds={sessions.map(session => layout.snapshot!.sessionProjectIds[session.id]).filter((id): id is string => !!id)} pending={layout.pending} mutate={layout.mutate} />
        : <div className="cy-conversation-sidebar__title">{sectionTitle}</div>}
      {layout.error && <p className="cy-sidebar-layout__error" role="alert">{t(layout.error === "conflict" ? "sidebar.layoutConflict" : "sidebar.layoutFailed")}</p>}
      {items.length === 0 ? (
        <div className="cy-conversation-sidebar__empty">
          {listStatus === "loading"
            ? t("sidebar.listLoading")
            : listStatus === "error"
              ? t("sidebar.listFailed")
              : supportsProjects ? t("sidebar.emptyProjects") : t("sidebar.emptyConversations")}
        </div>
      ) : (
        <>
          <div
            className="cy-conversation-list-wrapper"
            onContextMenu={(e) => {
              const item = (e.target as HTMLElement).closest("[data-session-id]");
              const sessionId = item?.getAttribute("data-session-id");
              if (!sessionId) return;
              openContextMenu(e, sessionId);
            }}
          >
            <Conversations
              rootClassName={flat ? "cy-conversation-list cy-conversation-list--flat" : "cy-conversation-list"}
              items={items}
              activeKey={activeSessionId}
              onActiveChange={(key) => {
                onSelect(String(key));
              }}
              groupable={{
                collapsible: true,
                expandedKeys: persistedExpanded ?? expandedKeys,
                // @ant-design/x 2.9.0 在 setState updater 内部调用 onExpand（use-collapsible.js），
                // updater 会在渲染期执行，直接 setExpandedKeys 会触发
                // "Cannot update a component while rendering a different component"。
                // 用 queueMicrotask 把 setState 挪出渲染期，行为不变。
                onExpand: (keys) => {
                  queueMicrotask(() => {
                    if (projection && layout.snapshot) {
                      for (const group of projection.groups) {
                        const expanded = keys.includes(group.groupId);
                        if (expanded === layout.snapshot.layout.modes[mode].collapsedGroupIds.includes(group.groupId)) {
                          void layout.mutate({ mode, kind: "set-expanded", groupId: group.groupId, expanded });
                        }
                      }
                    } else setExpandedKeys(keys);
                  });
                },
                label: (group) => {
                  if (group === "pinned") return t("sidebar.pinnedTitle");
                  if (group === "recent") return t("sidebar.recentTitle");
                  const projected = projection?.groups.find(item => item.groupId === group);
                  if (projected && !projected.projectId) return projected.sectionId ? projected.label
                    : t(mode === "chat" || layout.snapshot?.layout.modes[mode].viewMode === "merged" ? "sidebar.recentTitle" : "sidebar.unboundProject");
                  const storedProject = layout.snapshot?.layout.projects.find(item => item.id === projected?.projectId);
                  const members = projected?.sessionIds.map(id => sessions.find(session => session.id === id)!).filter(Boolean);
                  const project = storedProject ? { name: storedProject.displayName, workspaceRoot: storedProject.workspaceRoot,
                    conversationCount: members?.length ?? 0, updatedAt: Math.max(0, ...(members?.map(session => session.updatedAt) ?? [])) } : projects.get(group);
                  if (!project) return null;
                  return (
                    <Popover
                      placement="rightTop"
                      mouseEnterDelay={0.25}
                      mouseLeaveDelay={0.12}
                      overlayClassName="cy-project-popover"
                      getPopupContainer={(trigger) => trigger.closest<HTMLElement>("#firefly-context-sidebar") ?? trigger.parentElement!}
                      content={(
                        <ProjectInfoCard
                          mode={mode}
                          project={project}
                          onOpen={() => project.workspaceRoot && onOpenProject(project.workspaceRoot)}
                        />
                      )}
                    >
                      <span className="cy-conversation-project">
                        <ProjectIcon mode={mode} />
                        <span className="cy-conversation-project__name">{project.name}</span>
                        <span className="cy-conversation-project__count">{project.conversationCount}</span>
                      </span>
                    </Popover>
                  );
                },
              }}
            />
          </div>
          {contextMenu.open && (
            <div
              className="cy-session-context-menu"
              style={{
                position: "fixed",
                left: contextMenu.x,
                top: contextMenu.y,
                zIndex: 1050,
              }}
            >
              <Menu
                items={[
                  ...(layout.snapshot ? [{ key: "placement", label: t("sidebar.moveToSection"), children: [
                    { key: "move-section:", label: t("sidebar.defaultSection") },
                    ...layout.snapshot.layout.modes[mode].sections.map(section => ({ key: "move-section:" + section.id, label: section.name })),
                  ] }, ...(layout.snapshot.layout.modes[mode].sortMode === "manual" ? [
                    { key: "move-up", label: t("sidebar.moveUp") }, { key: "move-down", label: t("sidebar.moveDown") },
                  ] : [])] : []),
                  { key: "rename", label: t("sidebar.rename"), icon: <EditOutlined /> },
                  {
                    key: "toggle-pin",
                    label: contextMenu.pinned ? t("sidebar.unpin") : t("sidebar.pin"),
                    icon: <PushpinOutlined />,
                  },
                  ...(mode === "work" ? [{ key: "export-markdown", label: t("sidebar.exportMarkdown"), icon: <DownloadOutlined /> }] : []),
                  { key: "delete", label: t("sidebar.delete"), icon: <DeleteOutlined />, danger: true },
                ]}
                onClick={({ key }) => handleMenuClick(key)}
              />
            </div>
          )}
        </>
      )}
    </nav>
  );
});
