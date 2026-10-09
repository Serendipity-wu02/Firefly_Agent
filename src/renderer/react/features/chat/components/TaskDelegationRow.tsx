import React, { useId, useState } from "react";
import { useTranslation } from "../../../i18n";
import type { TaskDelegationDisplayRecord } from "../../../../../shared/chat-types";
import { getCharacterPortraitByAssetFileName } from "../../../character-portraits";
import "./RunExperience.css";

// 状态标记符号（非文案）与 i18n key（t() 不能出现在模块顶层常量里），展示文案在组件内求值。
const STATUS_MARKERS: Record<TaskDelegationDisplayRecord["status"], string> = {
  running: "◌",
  completed: "✓",
  failed: "×",
  cancelled: "×",
};

const STATUS_TEXT_KEYS: Record<TaskDelegationDisplayRecord["status"], string> = {
  running: "taskDelegation.statusRunning",
  completed: "taskDelegation.statusCompleted",
  failed: "taskDelegation.statusFailed",
  cancelled: "taskDelegation.statusCancelled",
};

export function TaskDelegationRow({ delegation }: { delegation: TaskDelegationDisplayRecord }) {
  return <TaskDelegationDisclosure key={delegation.invocationId} delegation={delegation} />;
}

function TaskDelegationDisclosure({ delegation }: { delegation: TaskDelegationDisplayRecord }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  // useId keeps duplicate historical renderings distinct without exposing private task data.
  // https://react.dev/reference/react/useId
  const detailsId = useId();
  const portraitUrl = getCharacterPortraitByAssetFileName(delegation.assetFileName);
  return (
    <div className={`cy-task-delegation is-${delegation.status}`}>
      <button type="button" className="cy-task-delegation__summary"
        aria-expanded={expanded} aria-controls={detailsId}
        onClick={() => setExpanded(value => !value)}
        onKeyDown={event => {
          if (event.key !== "Escape" || !expanded) return;
          event.stopPropagation(); setExpanded(false); event.currentTarget.focus();
        }}>
        <span className="cy-task-delegation__marker" aria-hidden="true">{STATUS_MARKERS[delegation.status]}</span>
        {portraitUrl && <img className="cy-task-delegation__avatar" src={portraitUrl} alt="" />}
        <span className="cy-task-delegation__copy">
          <span className="cy-task-delegation__assignee">
            <span className="cy-task-delegation__lead">{t("taskDelegation.delegatedTo")}</span>{" "}
            <span className="cy-task-delegation__nickname">{delegation.nickname}</span>
          </span>
          <span className="cy-task-delegation__description">{delegation.description}</span>
        </span>
        <span className="cy-task-delegation__status" role="status" aria-live="polite" aria-atomic="true">{t(STATUS_TEXT_KEYS[delegation.status])}</span>
        <svg className="cy-task-delegation__chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path d="m6 4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div id={detailsId} className="cy-task-delegation__details" hidden={!expanded}>
        <p>{delegation.description}</p>
        <dl><dt>{t("taskDelegation.taskReference")}</dt><dd>{delegation.taskId}</dd></dl>
      </div>
    </div>
  );
}
