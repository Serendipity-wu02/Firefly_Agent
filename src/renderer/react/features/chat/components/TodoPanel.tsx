import { useId, useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "../../../i18n";
import type { TodoState } from "../../../../../shared/todo-types";
import "./TodoPanel.css";

export interface TodoPanelProps {
  state: TodoState | null;
}

/** The task checklist section at the top of the right-hand workspace panel. */
export function TodoPanel({ state }: TodoPanelProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  const todos = state?.todos ?? [];
  const total = todos.length;
  const completed = useMemo(() => todos.filter((item) => item.status === "completed").length, [todos]);
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <section className="cy-todo" role="region" aria-label={t("todo.panelAria")}>
      <button type="button" className="cy-todo__head" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((value) => !value)}>
        <span className="cy-todo__title">{t("todo.currentTasks")}</span>
        <span className="cy-todo__count">{completed}/{total}</span>
        <ChevronDown className="cy-todo__chevron" size={14} aria-hidden="true" />
      </button>
      <div id={bodyId} className="cy-todo__body" hidden={!open}>
        <ul className="cy-todo__list" data-testid="todo-list">
          {total === 0 ? (
            <li className="cy-todo__item cy-todo__item--empty">{t("todo.empty")}</li>
          ) : (
            todos.map((todo) => {
              const isCompleted = todo.status === "completed";
              return (
                <li key={todo.id} className={`cy-todo__item ${isCompleted ? "cy-todo__item--completed" : ""} ${todo.status === "in_progress" ? "cy-todo__item--active" : ""}`}>
                  <span className="cy-todo__check" aria-hidden="true">{isCompleted && <Check size={11} strokeWidth={3} />}</span>
                  <span className="cy-todo__content">{todo.content}</span>
                </li>
              );
            })
          )}
        </ul>
        {total > 0 && (
          <div className="cy-todo__progress" data-testid="todo-footer">
            <div className="cy-todo__track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="cy-todo__bar" style={{ width: `${progress}%` }} />
            </div>
            <span className="cy-todo__percent">{progress}%</span>
          </div>
        )}
      </div>
    </section>
  );
}
