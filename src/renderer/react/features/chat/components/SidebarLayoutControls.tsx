import { useState } from "react";
import { useTranslation } from "../../../i18n";
import type { ConversationMode } from "../../../../../shared/chat-types";
import type { SidebarPatch, SidebarSnapshot } from "../../../../../shared/sidebar-layout";
import type { SidebarProjectionGroup } from "../pages/sidebar-projection";
import "./SidebarLayoutControls.css";

export function SidebarLayoutControls({ mode, snapshot, groups, projectIds, pending, mutate }: {
  mode: ConversationMode; snapshot: SidebarSnapshot; groups: SidebarProjectionGroup[];
  projectIds: readonly string[]; pending: boolean; mutate(patch: SidebarPatch): Promise<boolean>;
}) {
  const { t } = useTranslation();
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
    <div className="cy-sidebar-layout__selectors">
      {mode !== "chat" && <select aria-label={t("sidebar.viewMode")} disabled={pending} value={state.viewMode}
        onChange={event => void mutate({ mode, kind: "set-view", viewMode: event.target.value as "project" | "merged" })}>
        <option value="project">{t("sidebar.projectView")}</option><option value="merged">{t("sidebar.mergedView")}</option>
      </select>}
      <select data-sidebar-sort aria-label={t("sidebar.sortMode")} disabled={pending} value={state.sortMode}
        onChange={event => void mutate({ mode, kind: "set-sort", sortMode: event.target.value as "recent" | "manual" })}>
        <option value="recent">{t("sidebar.recentSort")}</option><option value="manual">{t("sidebar.manualSort")}</option>
      </select>
    </div>
    <details><summary>{t("sidebar.manageLayout")}</summary>
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
          <input aria-label={t("sidebar.sectionName")} maxLength={120} value={name} onChange={event => setName(event.target.value)} />
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
    </details>
  </div>;
}
