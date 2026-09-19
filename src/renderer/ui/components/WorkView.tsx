import React, { useEffect, useMemo, useState } from "react";
import type { ProviderStatus } from "../../../shared/provider-types";
import type {
  WorkCreatePlanRequest,
  WorkMarkdownExportResult,
  WorkTaskOperationResult,
  WorkTaskSnapshot,
} from "../../../shared/work-types";
import type {
  WorkHistoryRecord,
  WorkHistorySnapshot,
} from "../../../shared/work-history-types";
import type {
  WorkFileSelectionOperationResult,
  WorkFileSelectionSnapshot,
} from "../../../shared/work-file-types";
import { THEME_TOKENS } from "../theme/tokens";
import { Header } from "./Header";

export interface WorkViewProps {
  readonly providerStatus: ProviderStatus;
  readonly isMaximized: boolean;
}

function phaseLabel(phase: WorkTaskSnapshot["phase"]): string {
  switch (phase) {
    case "planning": return "正在生成待确认计划";
    case "awaiting_confirmation": return "等待确认后执行";
    case "running": return "执行中";
    case "completed": return "已完成";
    case "failed": return "未完成";
    case "cancelled": return "已取消";
  }
}

function requirementLabel(requirement: "analysis" | "tool"): string {
  return requirement === "tool" ? "需要真实工具结果" : "需要分析观察结果";
}

function toolOperationLabel(step: WorkTaskSnapshot["steps"][number]): string | undefined {
  if (step.completionRequirement !== "tool" || step.toolBinding === undefined) return undefined;
  const args = step.toolBinding.arguments;
  switch (step.toolBinding.toolName) {
    case "browser_read":
      return typeof args.requestUrl === "string" ? `读取网页：${args.requestUrl}` : "读取网页";
    case "music_control": {
      const labels: Record<string, string> = {
        next: "切换下一首",
        previous: "切换上一首",
        pause: "暂停播放",
        play: "继续播放",
        toggle: "切换播放状态",
      };
      return typeof args.action === "string" && labels[args.action]
        ? `控制音乐：${labels[args.action]}`
        : "控制音乐";
    }
    case "music_search":
      return typeof args.query === "string" ? `搜索音乐：${args.query}` : "搜索音乐";
    case "music_play":
      return typeof args.title === "string"
        ? `播放音乐：${args.title}`
        : typeof args.selection === "string"
          ? `播放音乐：${args.selection}`
          : "播放音乐";
    case "music_status":
      return "查询音乐状态";
    case "file_read":
      return "读取用户选择的文件";
    default:
      return `执行工具：${step.toolBinding.toolName}`;
  }
}

function formatFileBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function FileSelectionSummary({
  selection,
}: {
  readonly selection: WorkFileSelectionSnapshot;
}): React.ReactElement {
  return (
    <div style={{ padding: 12, borderRadius: 10, background: "rgba(235,247,240,0.8)", border: "1px solid #cfe4d8" }}>
      <strong>已选择的文本资料</strong>
      <ul style={{ margin: "8px 0 0", paddingLeft: 22 }}>
        {selection.files.map((file) => (
          <li key={file.fileId}>
            {file.displayName} · {file.fileKind} · {formatFileBytes(file.byteLength)}
            {file.symbolicLink ? " · 符号链接目标" : ""}
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 8, color: THEME_TOKENS.colors.textSecondary, fontSize: 13 }}>
        执行读取后，文件内容会发送给当前配置的模型服务用于处理。
      </div>
    </div>
  );
}

function updateFromResult(
  result: WorkTaskOperationResult,
  setSnapshot: (snapshot: WorkTaskSnapshot | null) => void,
  setError: (message: string) => void,
): void {
  if (result.snapshot) setSnapshot(result.snapshot);
  if (!result.ok) setError(result.message);
  else setError("");
}

function HistoryRecordView({
  record,
  onExport,
}: {
  readonly record: WorkHistoryRecord;
  readonly onExport: (historyId: string) => Promise<void>;
}): React.ReactElement {
  return (
    <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: "rgba(244,248,247,0.9)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <strong>{phaseLabel(record.phase)} · 历史任务</strong>
        <button type="button" onClick={() => void onExport(record.historyId)}>导出 Markdown</button>
      </div>
      <p style={{ whiteSpace: "pre-wrap", margin: "10px 0" }}>{record.userPrompt}</p>
      {record.fileSelection ? (
        <div style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: 13 }}>
          资料：{record.fileSelection.files.map((file) => `${file.displayName} · ${file.fileKind} · ${formatFileBytes(file.byteLength)}`).join("；")}
        </div>
      ) : null}
      <ol style={{ margin: "12px 0", paddingLeft: 24 }}>
        {record.steps.map((step) => (
          <li key={`${record.historyId}-${step.index}`} style={{ marginBottom: 10 }}>
            <div><strong>{step.description}</strong></div>
            <div style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: 13 }}>
              {requirementLabel(step.completionRequirement)} · 状态：{step.status}
              {step.verificationStatus ? ` · 验证：${step.verificationStatus}` : ""}
            </div>
            {step.plannedOperation ? (
              <div style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: 13 }}>
                预定操作：{step.plannedOperation}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      {record.finalText ? (
        <section style={{ margin: "12px 0", padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.72)" }}>
          <strong>最终结果</strong>
          <p style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>{record.finalText}</p>
        </section>
      ) : null}
      {record.error ? <p style={{ color: "#a33", whiteSpace: "pre-wrap" }}>{record.error}</p> : null}
      {record.terminationReason ? <p style={{ color: THEME_TOKENS.colors.textSecondary }}>终态：{record.terminationReason.kind}</p> : null}
    </div>
  );
}

export const WorkView: React.FC<WorkViewProps> = ({ providerStatus, isMaximized }) => {
  const [snapshot, setSnapshot] = useState<WorkTaskSnapshot | null>(null);
  const [history, setHistory] = useState<WorkHistorySnapshot | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | undefined>();
  const [fileSelection, setFileSelection] = useState<WorkFileSelectionSnapshot | undefined>();
  const [fileReadMode, setFileReadMode] = useState<WorkCreatePlanRequest["fileReadMode"]>("optional");
  const [task, setTask] = useState("");
  const [error, setError] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const work = window.work;
    if (!work) {
      setError("Work 通道未加载，请重启应用。");
      return () => { active = false; };
    }
    void work.getState().then((state) => {
      if (active) setSnapshot(state);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
    });
    void work.getHistory().then((records) => {
      if (active) setHistory(records);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
    });
    void work.getFileSelection().then((selection) => {
      if (active) setFileSelection(selection);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
    });
    const unsubscribe = work.onStateChanged((state) => {
      if (active) setSnapshot(state);
    });
    const unsubscribeHistory = work.onHistoryChanged((records) => {
      if (active) setHistory(records);
    });
    return () => {
      active = false;
      unsubscribe();
      unsubscribeHistory();
    };
  }, []);

  const selectFiles = async (): Promise<void> => {
    if (!window.work || busy || isActive) return;
    setBusy(true);
    setError("");
    setExportMessage("");
    try {
      const result: WorkFileSelectionOperationResult = await window.work.selectFiles();
      if (result.selection !== undefined) {
        setFileSelection(result.selection);
        if (result.ok && !result.cancelled) setFileReadMode("optional");
      }
      if (!result.ok) setError(result.message);
    } catch (selectError: unknown) {
      setError(selectError instanceof Error ? selectError.message : String(selectError));
    } finally {
      setBusy(false);
    }
  };

  const isActive = snapshot?.phase === "planning" ||
    snapshot?.phase === "awaiting_confirmation" ||
    snapshot?.phase === "running";
  const isTerminal = snapshot?.phase === "completed" ||
    snapshot?.phase === "failed" ||
    snapshot?.phase === "cancelled";
  const canConfirm = snapshot?.phase === "awaiting_confirmation" && snapshot.proposalId !== undefined;
  const actionLabel = useMemo(() => {
    if (snapshot?.phase === "planning") return "正在生成计划…";
    if (snapshot?.phase === "running") return "执行中…";
    return "生成待确认计划";
  }, [snapshot?.phase]);

  const createPlan = async (): Promise<void> => {
    const value = task.trim();
    if (!value || !window.work || busy) return;
    setBusy(true);
    setError("");
    try {
      const request: WorkCreatePlanRequest = { task: value, fileReadMode };
      const result = await window.work.createPlan(request);
      updateFromResult(result, setSnapshot, setError);
    } catch (createError: unknown) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setBusy(false);
    }
  };

  const confirmPlan = async (): Promise<void> => {
    if (!canConfirm || !snapshot?.proposalId || !window.work || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await window.work.confirmPlan(snapshot.proposalId);
      updateFromResult(result, setSnapshot, setError);
    } catch (confirmError: unknown) {
      setError(confirmError instanceof Error ? confirmError.message : String(confirmError));
    } finally {
      setBusy(false);
    }
  };

  const cancelTask = async (): Promise<void> => {
    if (!window.work || !isActive || busy) return;
    setBusy(true);
    try {
      const result = await window.work.cancel();
      updateFromResult(result, setSnapshot, setError);
    } catch (cancelError: unknown) {
      setError(cancelError instanceof Error ? cancelError.message : String(cancelError));
    } finally {
      setBusy(false);
    }
  };

  const exportMarkdown = async (historyId: string): Promise<void> => {
    if (!window.work || busy) return;
    setBusy(true);
    setError("");
    setExportMessage("");
    try {
      const result: WorkMarkdownExportResult = await window.work.exportMarkdown(historyId);
      if (!result.ok) {
        setError(result.message);
      } else if ("cancelled" in result && result.cancelled) {
        setExportMessage("已取消导出。");
      } else if ("fileName" in result) {
        setExportMessage(`已导出 Markdown：${result.fileName}`);
      }
    } catch (exportError: unknown) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setBusy(false);
    }
  };

  const selectedHistory: WorkHistoryRecord | undefined = history?.records.find(
    (record) => record.historyId === selectedHistoryId,
  );

  return (
    <div
      data-work-view="true"
      data-font-size="medium"
      style={{
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: THEME_TOKENS.colors.bgGradient,
        color: THEME_TOKENS.colors.textPrimary,
        fontFamily: THEME_TOKENS.typography.fontFamily,
        boxSizing: "border-box",
        userSelect: "none",
        overflow: "hidden",
        borderRadius: isMaximized ? 0 : 16,
        paddingTop: "52px",
      }}
    >
      <Header providerStatus={providerStatus} isMaximized={isMaximized} />
      <main style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 28px", WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 26 }}>Work 任务</h1>
          <p style={{ margin: "0 0 20px", color: THEME_TOKENS.colors.textSecondary }}>
            先生成并确认结构化计划，再开始执行。普通 Chat、工具授权和取消规则保持不变。
          </p>

          {!snapshot || snapshot.phase === "completed" || snapshot.phase === "failed" || snapshot.phase === "cancelled" ? (
            <section style={{ display: "grid", gap: 12 }}>
              {fileSelection ? <FileSelectionSummary selection={fileSelection} /> : null}
              <button type="button" onClick={() => void selectFiles()} disabled={busy}>
                选择文本或 Markdown 文件（可选）
              </button>
              {fileSelection ? (
                <label style={{ display: "flex", gap: 8, alignItems: "center", color: THEME_TOKENS.colors.textSecondary }}>
                  <input
                    type="checkbox"
                    checked={fileReadMode === "required"}
                    onChange={(event) => setFileReadMode(event.target.checked ? "required" : "optional")}
                    disabled={busy}
                  />
                  执行时必须读取所选文件，并使用读取结果完成任务
                </label>
              ) : null}
              <textarea
                value={task}
                onChange={(event) => setTask(event.target.value)}
                disabled={busy}
                placeholder="描述要完成的任务"
                rows={5}
                style={{ width: "100%", boxSizing: "border-box", padding: 14, borderRadius: 12, border: "1px solid #cbded5", resize: "vertical", font: "inherit" }}
              />
              <button type="button" onClick={() => void createPlan()} disabled={busy || task.trim().length === 0}>
                {actionLabel}
              </button>
            </section>
          ) : null}

          {snapshot ? (
            <section style={{ marginTop: 24, padding: 18, borderRadius: 14, background: "rgba(255,255,255,0.78)", border: "1px solid #d8e9e0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <strong>{phaseLabel(snapshot.phase)}</strong>
                {isActive ? (
                  <button type="button" onClick={() => void cancelTask()} disabled={busy}>取消</button>
                ) : null}
              </div>
              <p style={{ whiteSpace: "pre-wrap", margin: "12px 0", color: THEME_TOKENS.colors.textPrimary }}>{snapshot.userPrompt}</p>
              {snapshot.fileSelection ? <FileSelectionSummary selection={snapshot.fileSelection} /> : null}
              {snapshot.fileReadMode === "required" ? (
                <p style={{ margin: "8px 0", color: THEME_TOKENS.colors.textSecondary }}>
                  本任务要求执行时读取所选文件；缺少对应的本次成功读取证据不能完成。
                </p>
              ) : null}
              {snapshot.finalText ? (
                <section style={{ margin: "12px 0", padding: 12, borderRadius: 10, background: "rgba(244,248,247,0.9)" }}>
                  <strong>最终结果</strong>
                  <p style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>{snapshot.finalText}</p>
                </section>
              ) : null}
              {snapshot.browserRequestTargets.length > 0 ? (
                <p style={{ margin: "8px 0", color: THEME_TOKENS.colors.textSecondary }}>
                  当前用户消息中的网页目标：{snapshot.browserRequestTargets.join("、")}
                </p>
              ) : null}
              {snapshot.steps.length > 0 ? (
                <ol style={{ margin: "16px 0", paddingLeft: 24 }}>
                  {snapshot.steps.map((step) => (
                    <li key={`${snapshot.taskId}-${step.index}`} style={{ marginBottom: 12 }}>
                      <div><strong>{step.description}</strong></div>
                      <div style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: 13 }}>
                        {requirementLabel(step.completionRequirement)} · 状态：{step.status}
                        {step.verificationStatus ? ` · 验证：${step.verificationStatus}` : ""}
                      </div>
                      {toolOperationLabel(step) ? (
                        <div style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: 13 }}>
                          预定操作：{toolOperationLabel(step)}
                        </div>
                      ) : null}
                      {step.verificationReason ? <div style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: 13 }}>{step.verificationReason}</div> : null}
                    </li>
                  ))}
                </ol>
              ) : snapshot.phase === "planning" ? (
                <p>正在等待一次无工具的计划生成结果，尚未开始执行。</p>
              ) : null}
              {canConfirm ? (
                <button type="button" onClick={() => void confirmPlan()} disabled={busy}>
                  确认计划并执行
                </button>
              ) : null}
              {isTerminal ? (
                <button type="button" onClick={() => void exportMarkdown(snapshot.taskId)} disabled={busy}>
                  导出 Markdown
                </button>
              ) : null}
              {snapshot.error ? <p style={{ color: "#a33", whiteSpace: "pre-wrap" }}>{snapshot.error}</p> : null}
              {exportMessage ? <p style={{ color: THEME_TOKENS.colors.textSecondary }}>{exportMessage}</p> : null}
              {snapshot.terminationReason ? <p style={{ color: THEME_TOKENS.colors.textSecondary }}>终态：{snapshot.terminationReason.kind}</p> : null}
            </section>
          ) : null}

          {history ? (
            <section style={{ marginTop: 24, padding: 18, borderRadius: 14, background: "rgba(255,255,255,0.78)", border: "1px solid #d8e9e0" }}>
              <strong>任务历史</strong>
              <p style={{ margin: "8px 0", color: THEME_TOKENS.colors.textSecondary, fontSize: 13 }}>
                仅在本次应用进程中保存已结束任务，最多 {history.limits.maxRecords} 条、总计 {formatFileBytes(history.limits.maxTotalBytes)}。浏览历史不会取消或重新执行当前任务。
              </p>
              {history.records.length === 0 ? (
                <p style={{ color: THEME_TOKENS.colors.textSecondary }}>暂无已结束任务。</p>
              ) : (
                <ol style={{ margin: "12px 0", paddingLeft: 24 }}>
                  {history.records.map((record) => (
                    <li key={record.historyId} style={{ marginBottom: 8 }}>
                      <button
                        type="button"
                        onClick={() => setSelectedHistoryId(record.historyId)}
                        style={{ textAlign: "left", width: "100%" }}
                      >
                        {phaseLabel(record.phase)} · {record.userPrompt}
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              {selectedHistory ? (
                <HistoryRecordView record={selectedHistory} onExport={exportMarkdown} />
              ) : null}
            </section>
          ) : null}

          {error ? <p style={{ color: "#a33", whiteSpace: "pre-wrap" }}>{error}</p> : null}
        </div>
      </main>
    </div>
  );
};
