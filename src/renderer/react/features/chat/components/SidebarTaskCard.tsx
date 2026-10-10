import { useId, useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "../../../i18n";
import { resolveAsset } from "../../../../../shared/renderer-base";
import type { TodoState } from "../../../../../shared/todo-types";
import "./SidebarTaskCard.css";

export interface SidebarTaskCardProps {
  mode: "work" | "code";
  state: TodoState | null;
}

/** Progress card pinned to the bottom of the sidebar: the current todo list of the active task. */
export function SidebarTaskCard({ mode, state }: SidebarTaskCardProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  const todos = state?.todos ?? [];
  const total = todos.length;
  const completed = useMemo(() => todos.filter(item => item.status === "completed").length, [todos]);
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <section className={`cy-task-card${open ? "" : " is-collapsed"}`} aria-label={t("todo.panelAria")}>
      <button type="button" className="cy-task-card__head" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(value => !value)}>
        <span className="cy-task-card__badge"><i aria-hidden="true" />{t(mode === "code" ? "todo.modeCode" : "todo.modeWork")}</span>
        <ChevronDown className="cy-task-card__chevron" size={14} aria-hidden="true" />
      </button>
      <div id={bodyId} className="cy-task-card__body" hidden={!open}>
        <div className="cy-task-card__hero">
          <img src={resolveAsset("avatars/firefly-avatar.png")} alt="" draggable={false} />
          <div>
            <div className="cy-task-card__title">{t("todo.currentTasks")}</div>
            <div className="cy-task-card__sub">{t("todo.progress", { completed, total })}</div>
          </div>
        </div>
        <ul className="cy-task-card__list" data-testid="sidebar-todo-list">
          {total === 0
            ? <li className="cy-task-card__item is-empty"><span className="cy-task-card__check" aria-hidden="true" />{t("todo.empty")}</li>
            : todos.map(todo => {
              const done = todo.status === "completed";
              return (
                <li key={todo.id} className={`cy-task-card__item${done ? " is-done" : ""}${todo.status === "in_progress" ? " is-active" : ""}`}>
                  <span className="cy-task-card__check" aria-hidden="true">{done && <Check size={10} strokeWidth={3} />}</span>
                  <span className="cy-task-card__text">{todo.content}</span>
                </li>
              );
            })}
        </ul>
        <div className="cy-task-card__progress">
          <div className="cy-task-card__track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="cy-task-card__bar" style={{ width: `${progress}%` }} />
          </div>
          <span>{progress}%</span>
        </div>
      </div>
    </section>
  );
}
