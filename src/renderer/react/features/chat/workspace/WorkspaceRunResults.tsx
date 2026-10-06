import type { ToolFileChange } from "../../../../../shared/chat-types";
import type { FileVersionEvidence, TaskWriteEvidence } from "../../../../../shared/agent-execution-evidence";
import { normalizeToolTaskResult } from "../../../../../shared/task-result-evidence";
import { useTranslation } from "../../../i18n";
import { TaskDelegationRow } from "../components/TaskDelegationRow";
import { workspaceRelativePath, type WorkspaceChangedFile, type WorkspaceRunOutput } from "./workspace-artifacts";
import "./WorkspaceRunResults.css";

export function WorkspaceResultsIndex({ outputs, onOpenResult }: { outputs: WorkspaceRunOutput[]; onOpenResult(id: string): void }) {
  const { t } = useTranslation();
  return <section className="cy-workspace-results-index" aria-label={t("workspace.results")}>
    <h3>{t("workspace.results")}</h3>
    {!outputs.length && <p>{t("workspace.noResults")}</p>}
    {outputs.map((output, index) => <button type="button" key={output.id} data-output-result={output.id} onClick={() => onOpenResult(output.id)}>
      <span>{t("workspace.runResult", { index: index + 1 })}</span>
      <small>{t("workspace.resultCounts", { files: output.files.length, tools: output.tools.length })}</small>
    </button>)}
  </section>;
}

export function WorkspaceRunResults({ output, workspaceRoot, onOpenFile, onOpenDiff }: {
  output: WorkspaceRunOutput; workspaceRoot?: string;
  onOpenFile(path: string): void; onOpenDiff(output: WorkspaceRunOutput, file: WorkspaceChangedFile): void;
}) {
  const { t } = useTranslation();
  return <section className="cy-workspace-run-results" aria-label={t("workspace.results")} data-source-session={output.sessionId} data-source-run={output.runId}>
    {output.tasks.map(task => <TaskDelegationRow key={task.invocationId} delegation={task} />)}
    {output.files.length > 0 && <div className="cy-workspace-run-results__files">
      <h3>{t("workspace.changedFiles")}</h3>
      {output.files.map(file => {
        const path = workspaceRoot && workspaceRelativePath(file.change.file, workspaceRoot);
        return <div key={`${file.toolId}:${file.change.file}`} className="cy-workspace-run-results__file">
          <span title={file.change.file}>{file.change.file}</span>
          <small>+{file.change.insertions} / −{file.change.deletions}</small>
          {path && file.change.kind !== "deleted" && <button type="button" data-output-file={path} onClick={() => onOpenFile(path)}>{t("workspace.openFile")}</button>}
          <button type="button" data-output-diff={file.change.file} onClick={() => onOpenDiff(output, file)}>{t("workspace.openDiff")}</button>
        </div>;
      })}
    </div>}
    {output.tools.map(tool => {
      const taskResult = tool.name === "delegate_agent" ? normalizeToolTaskResult(tool.taskResult, output.runId) : undefined;
      return <article key={tool.id} className="cy-workspace-run-results__tool">
        <header><strong>{taskResult?.agentId ?? tool.displayName ?? tool.name}</strong><span data-tool-status={tool.status}>{t(`workspace.toolStatus.${tool.status}`)}</span></header>
        {taskResult ? <>
          <p>{t("workspace.childResult")} · {t(`workspace.childStatus.${taskResult.status}`)}</p>
          {taskResult.error && <p role="status" data-child-error={taskResult.error.code}>{taskResult.error.code}: {taskResult.error.message}</p>}
          <pre>{taskResult.text || t("workspace.emptyResult")}</pre>
          {taskResult.truncated && <p role="status">{t("workspace.resultTruncated")}</p>}
          <div className="cy-workspace-run-results__files" aria-label={t("workspace.writeEvidence")}>
            <h3>{t("workspace.writeEvidence")}</h3>
            {taskResult.writes === undefined ? <p>{t("workspace.writeEvidenceUnavailable")}</p>
              : taskResult.writes.length === 0 ? <p>{t("workspace.noRecordedWrites")}</p>
              : taskResult.writes.map((write, index) => <WorkspaceWriteEvidence key={`${write.toolCallId}:${write.canonicalPath}:${index}`} write={write} />)}
          </div>
          {taskResult.executionEvents && taskResult.executionEvents.length > 0 && <details>
            <summary>{t("workspace.executionEvidence")}</summary>
            {taskResult.executionEvents.map(event => <p key={event.id} data-execution-phase={event.phase}>
              {event.id} · {event.agentId} · {event.childRunId} · {event.executionId} · {t(`workspace.executionPhase.${event.phase}`)}
              {event.terminal && <> · {t(`workspace.childStatus.${event.terminal}`)}</>}
              {" · "}{t("workspace.executionClock")}: {event.clockDomainId} · #{event.seq} · {event.monotonicMs} ms
            </p>)}
          </details>}
        </> : <>
          <p>{t("workspace.toolSummary")}</p>
          <pre>{tool.result || t("workspace.emptyResult")}</pre>
          {tool.name === "delegate_agent" && <p>{t("workspace.writeEvidenceUnavailable")}</p>}
        </>}
      </article>;
    })}
  </section>;
}

function WorkspaceWriteEvidence({ write }: { write: TaskWriteEvidence }) {
  const { t } = useTranslation();
  const version = (evidence: FileVersionEvidence | undefined) => evidence?.sha256 || evidence?.version
    ? <>{evidence.sha256 && <span>SHA-256: {evidence.sha256}</span>}{evidence.sha256 && evidence.version && " · "}{evidence.version && <span>{t("workspace.fileVersion")}: {evidence.version}</span>}</>
    : t("workspace.versionUnavailable");
  return <div className="cy-workspace-run-results__file" data-write-state={write.state}>
    <span title={write.canonicalPath}>{write.path}</span>
    <strong>{t(`workspace.writeState.${write.state}`)}</strong>
    <small>{write.agentId} · {write.childRunId} · {t("workspace.writeTool")}: {write.toolCallId}</small>
    <span>{t("workspace.beforeWrite")}: {version(write.before)}</span>
    <span>{t("workspace.afterWrite")}: {version(write.after)}</span>
    <span>{t("workspace.writeEvents")}: {write.eventIds.length ? write.eventIds.join(", ") : t("workspace.eventsUnavailable")}</span>
  </div>;
}

/** Inline tool evidence does not assume it has the same file index as a later review snapshot. */
export function WorkspaceChangeDiff({ change }: { change: ToolFileChange }) {
  const { t } = useTranslation();
  return <section className="cy-workspace-change-diff" aria-label={t("workspace.openDiff")}>
    <header>{change.file} <small>+{change.insertions} / −{change.deletions}</small></header>
    {change.diff?.length ? <pre>{change.diff.map((line, index) => <div key={index} className={`is-${line.type}`}>
      <span aria-hidden="true">{line.type === "add" ? "+" : line.type === "remove" ? "−" : " "}</span>{line.text}
    </div>)}</pre> : <p>{t("workspace.diffUnavailable")}</p>}
    {change.truncated && <p>{t("fileChange.truncated")}</p>}
  </section>;
}
