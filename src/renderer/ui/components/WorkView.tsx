import React, { useEffect, useMemo, useState } from "react";
import type { ProviderStatus } from "../../../shared/provider-types";
import type {
  WorkTaskOperationResult,
  WorkTaskSnapshot,
} from "../../../shared/work-types";
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
    default:
      return `执行工具：${step.toolBinding.toolName}`;
  }
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

export const WorkView: React.FC<WorkViewProps> = ({ providerStatus, isMaximized }) => {
  const [snapshot, setSnapshot] = useState<WorkTaskSnapshot | null>(null);
  const [task, setTask] = useState("");
  const [error, setError] = useState("");
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
    const unsubscribe = work.onStateChanged((state) => {
      if (active) setSnapshot(state);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const isActive = snapshot?.phase === "planning" ||
    snapshot?.phase === "awaiting_confirmation" ||
    snapshot?.phase === "running";
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
      const result = await window.work.createPlan(value);
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
              {snapshot.error ? <p style={{ color: "#a33", whiteSpace: "pre-wrap" }}>{snapshot.error}</p> : null}
              {snapshot.terminationReason ? <p style={{ color: THEME_TOKENS.colors.textSecondary }}>终态：{snapshot.terminationReason.kind}</p> : null}
            </section>
          ) : null}

          {error ? <p style={{ color: "#a33", whiteSpace: "pre-wrap" }}>{error}</p> : null}
        </div>
      </main>
    </div>
  );
};
