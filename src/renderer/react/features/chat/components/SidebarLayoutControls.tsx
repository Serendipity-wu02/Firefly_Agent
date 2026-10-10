import { useId, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useTranslation } from "../../../i18n";
import type { ConversationMode } from "../../../../../shared/chat-types";
import type { SidebarPatch, SidebarSnapshot } from "../../../../../shared/sidebar-layout";
import type { SidebarProjectionGroup } from "../pages/sidebar-projection";
import "./SidebarLayoutControls.css";

export function SidebarLayoutControls({ mode, snapshot, groups, projectIds, pending, mutate, title }: {
  mode: ConversationMode; snapshot: SidebarSnapshot; groups: SidebarProjectionGroup[]; title: string;
  projectIds: readonly string[]; pending: boolean; mutate(patch: SidebarPatch): Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const [name, setName] = useState("");
  const [renames, setRenames] = useState<Record<string, string>>({});
  const state = snapshot.layout.modes[mode];
  const label = (group: SidebarProjectionGroup) => group.projectId || group.sectionId ? group.label
    : t(mode === "chat" || state.viewMode === "merged" ? "sidebar.recentTitle" : "sidebar.unboundProject");
  const moveGroup = (index: number, direction: number) => {
    const ids = groups.map(group => group.groupId);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    const visible = new Set(ids);
    const ordered = [...state.groupOrder, ...ids.filter(id => !state.groupOrder.includes(id))];
    let next = 0;
    const groupIds = ordered.map(id => visible.has(id) ? ids[next++] : id);
    void mutate({ mode, kind: "set-group-order", groupIds });
  };
  return <div className="cy-sidebar-layout">
    <div className="cy-sidebar-layout__head">
      <span className="cy-conversation-sidebar__title">{title}</span>
      <button type="button" className="cy-sidebar-layout__toggle" aria-label={t("sidebar.manageLayout")} title={t("sidebar.manageLayout")}
        aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
        <SlidersHorizontal size={14} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
    {mode !== "chat" && <div className="cy-sidebar-layout__views" role="radiogroup" aria-label={t("sidebar.viewMode")}>
      {(["project", "merged"] as const).map(view => <button key={view} type="button" role="radio" aria-checked={state.viewMode === view}
        className={state.viewMode === view ? "is-active" : ""} disabled={pending}
        onClick={() => { if (state.viewMode !== view) void mutate({ mode, kind: "set-view", viewMode: view }); }}>
        {t(view === "project" ? "sidebar.viewProjectsShort" : "sidebar.viewMergedShort")}
      </button>)}
    </div>}
    <div id={panelId} className="cy-sidebar-layout__panel" hidden={!open}>
    <div className="cy-sidebar-layout__selectors">
      <select data-sidebar-sort aria-label={t("sidebar.sortMode")} disabled={pending} value={state.sortMode}
        onChange={event => void mutate({ mode, kind: "set-sort", sortMode: event.target.value as "recent" | "manual" })}>
        <option value="recent">{t("sidebar.recentSort")}</option><option value="manual">{t("sidebar.manualSort")}</option>
      </select>
    </div>
    <div className="cy-sidebar-layout__management">
        {mode !== "chat" && snapshot.layout.projects.filter(project => projectIds.includes(project.id)).map(project =>
          <label className="cy-sidebar-layout__project" key={project.id} title={project.workspaceRoot}>
            <input type="checkbox" disabled={pending} checked={!state.hiddenProjectIds.includes(project.id)}
              onChange={event => void mutate({ mode, kind: "set-project-visible", projectId: project.id, visible: event.target.checked })} />
            <span>{project.displayName}</span>
          </label>)}
        <form className="cy-sidebar-layout__section" onSubmit={event => {
          event.preventDefault(); if (!name.trim() || pending) return;
          void mutate({ mode, kind: "create-section", name: name.trim() }).then(ok => { if (ok) setName(""); });
        }}>
          <input aria-label={t("sidebar.sectionName")} placeholder={t("sidebar.sectionName")} maxLength={120} value={name} onChange={event => setName(event.target.value)} />
          <button type="submit" disabled={pending || !name.trim()}>{t("sidebar.addSection")}</button>
        </form>
        {state.sections.map(section => <div className="cy-sidebar-layout__section" key={section.id}>
          <input aria-label={t("sidebar.sectionName")} maxLength={120} value={renames[section.id] ?? section.name}
            onChange={event => setRenames(current => ({ ...current, [section.id]: event.target.value }))} />
          <button type="button" disabled={pending || !(renames[section.id] ?? section.name).trim()}
            onClick={() => void mutate({ mode, kind: "rename-section", sectionId: section.id, name: (renames[section.id] ?? section.name).trim() })}>{t("sidebar.rename")}</button>
          <button type="button" disabled={pending} aria-label={t("sidebar.removeSection")}
            onClick={() => void mutate({ mode, kind: "delete-section", sectionId: section.id })}>×</button>
        </div>)}
        {groups.map((group, index) => <div className="cy-sidebar-layout__order" key={group.groupId}>
          <span>{label(group)}</span>
          <button type="button" aria-label={t("sidebar.moveUp")} disabled={pending || index === 0} onClick={() => moveGroup(index, -1)}>↑</button>
          <button type="button" aria-label={t("sidebar.moveDown")} disabled={pending || index === groups.length - 1} onClick={() => moveGroup(index, 1)}>↓</button>
        </div>)}
    </div>
    </div>
  </div>;
}
