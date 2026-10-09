// RightInspector — 统一的右侧挤出式面板容器。
// antd Tabs（editable-card）承载多标签：每个标签可单独关闭（chip 上的 ×），
// 右上角关闭按钮关闭当前活动标签，活动标签关闭后的回退由上层 ChatPage 决定。
//
// 使用现有工作区色板和紧凑标签；保留 antd 的键盘标签导航。

import type { ReactNode } from "react";
import { Tabs } from "antd";
import { File, Files, FolderTree, GitCompareArrows, Globe, ListChecks, SquareTerminal } from "lucide-react";
import { useTranslation } from "../../../i18n";
import "./RightInspector.css";

export interface InspectorTab {
  id: string;
  label: string;
  /** Full path/context for tabs that share the same visible basename. */
  title?: string;
  kind?: "files" | "file" | "diff" | "browser" | "tasks" | "plan" | "result";
  status?: ReactNode;
  /** 阶段色点 class（如 is-review / is-executing / is-completed），不传则不显示 */
  dotClass?: string;
  /** 是否允许关闭（chip 上的 × 和右上角按钮都受它控制）；不传默认可关 */
  closable?: boolean;
  content: ReactNode;
}

const tabIcons = { files: FolderTree, file: File, diff: GitCompareArrows, browser: Globe, tasks: SquareTerminal, plan: ListChecks, result: Files };

export function RightInspector({
  tabs,
  activeTabId,
  onTabChange,
  onCloseTab,
  visible = true,
}: {
  tabs: InspectorTab[];
  visible?: boolean;
  /** 当前活动标签 ID，不在列表中时回退到第一个标签 */
  activeTabId: string | null;
  onTabChange: (id: string) => void;
  /** 关闭指定标签（chip 上的 × 和右上角按钮共用） */
  onCloseTab: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (tabs.length === 0) return null;
  const active = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  return (
    <aside className="cy-right-inspector" hidden={!visible} inert={!visible} aria-label={t("rightInspector.panelAria")}
      onKeyDownCapture={event => {
        // Tab-header Delete follows the same discard/cleanup path as the close button.
        // Text-editor keys and browser shortcuts keep their own meaning.
        if (event.key !== "Delete" || !(event.target instanceof HTMLElement) || event.target.getAttribute("role") !== "tab") return;
        const triggers = Array.from(event.currentTarget.querySelectorAll('[role="tab"]'));
        const tab = tabs[triggers.indexOf(event.target)];
        if (!tab || tab.closable === false) return;
        event.preventDefault(); event.stopPropagation(); onCloseTab(tab.id);
      }}>
      <Tabs
        type="editable-card"
        hideAdd
        size="small"
        className="cy-right-inspector__tabs"
        activeKey={active.id}
        onChange={onTabChange}
        onEdit={(key, action) => {
          if (action === "remove" && tabs.find(tab => tab.id === String(key))?.closable !== false) onCloseTab(String(key));
        }}
        items={tabs.map((tab) => {
          const Icon = tab.kind ? tabIcons[tab.kind] : undefined;
          return ({
          key: tab.id,
          forceRender: true,
          closable: tab.closable !== false,
          label: (
            <span className="cy-right-inspector__label" data-inspector-kind={tab.kind}>
              {Icon && <Icon size={14} aria-hidden="true" />}
              {tab.dotClass && (
                <span className={`cy-right-inspector__dot ${tab.dotClass}`} aria-hidden="true" />
              )}
              <span className="cy-right-inspector__label-text" title={tab.title ?? tab.label}>{tab.label}</span>
              {tab.status}
            </span>
          ),
          children: tab.content,
        }); })}
        tabBarExtraContent={{
          right: (
            active.closable !== false && (
              <button
                type="button"
                className="cy-right-inspector__close"
                onClick={() => onCloseTab(active.id)}
                aria-label={`${t("common.close")} ${active.label}`}
                title={t("rightInspector.closeTab", { name: active.title ?? active.label })}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
                </svg>
              </button>
            )
          ),
        }}
      />
    </aside>
  );
}
