import React, { useEffect, useState } from "react";
import type { ApprovalRecord } from "../../../shared/approval-types";
import type { SandboxScope } from "../../../shared/sandbox-types";
import type { ToolRiskLevel, ToolSideEffect } from "../../../shared/tool-types";
import { THEME_TOKENS } from "../theme/tokens";

export const FIREFLY_APPROVAL_HINT = "这个操作需要你的许可，我会等你决定。";

function requesterLabel(record: ApprovalRecord): string {
  const requester = record.request.requester;
  if (requester.type === "main-agent") return `主智能体 · ${requester.id}`;
  if (requester.type === "subagent") return `子智能体 · ${requester.id}`;
  return `系统运行时 · ${requester.id}`;
}

function scopeLabel(scope: SandboxScope): string {
  switch (scope.kind) {
    case "filesystem":
      return `${scope.access === "read" ? "读取" : "写入"} · ${scope.path}`;
    case "network":
      return `网络 · ${scope.host}${scope.port === undefined ? "" : `:${scope.port}`}`;
    case "process":
      return `进程 · ${scope.executable}`;
    case "desktop":
      return `桌面 · ${scope.target}`;
    default:
      return "未识别范围";
  }
}

function stateLabel(state: ApprovalRecord["state"]): string {
  if (state === "pending") return "等待确认";
  if (state === "approved") return "已允许";
  if (state === "denied") return "已拒绝";
  if (state === "cancelled") return "已取消";
  return "已过期";
}

function riskLabel(risk: ToolRiskLevel | undefined): string {
  if (risk === "safe") return "安全";
  if (risk === "read_only") return "只读";
  if (risk === "side_effect") return "有副作用";
  if (risk === "high_risk") return "高风险";
  return "未声明";
}

function sideEffectLabel(sideEffect: ToolSideEffect | undefined): string {
  if (sideEffect === "read_only") return "只读";
  if (sideEffect === "idempotent") return "幂等操作";
  if (sideEffect === "state_mutation") return "状态变更";
  if (sideEffect === "external_action") return "外部操作";
  return "未声明";
}

export const ApprovalView: React.FC = () => {
  const [record, setRecord] = useState<ApprovalRecord | null>(null);
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "流萤 · 权限确认";
    const api = window.approval;
    if (!api) {
      setError("确认通道未加载，请重启应用后重试。");
      return undefined;
    }

    let active = true;
    void api.getApprovalRequest()
      .then((next) => {
        if (active) setRecord(next);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "无法读取确认请求。");
      });

    const unsubscribe = api.onApprovalChanged((event) => {
      if (active) setRecord(event.record);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const isPending = record?.state === "pending";
  const request = record?.request;

  const resolve = async (action: "approve" | "deny"): Promise<void> => {
    if (!record || record.state !== "pending" || busy || !window.approval) return;
    setBusy(action);
    setError(null);
    try {
      const result = await window.approval.resolveApproval({
        approvalRequestId: record.request.approvalRequestId,
        action,
      });
      if (result.ok) {
        setRecord(result.record);
      } else {
        setError(result.message);
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "确认请求处理失败。");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main
      data-approval-view="true"
      style={{
        width: "100%",
        height: "100vh",
        boxSizing: "border-box",
        padding: "14px",
        background: "transparent",
        color: THEME_TOKENS.colors.textPrimary,
        fontFamily: THEME_TOKENS.typography.fontFamily,
        userSelect: "none",
        WebkitAppRegion: "drag",
      } as React.CSSProperties}
    >
      <section
        aria-label="权限确认"
        style={{
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: THEME_TOKENS.radii.lg,
          background: THEME_TOKENS.colors.bgGradient,
          border: `1px solid ${THEME_TOKENS.colors.borderGlass}`,
          boxShadow: THEME_TOKENS.shadows.lg,
          WebkitAppRegion: "no-drag",
        } as React.CSSProperties}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px 10px",
            WebkitAppRegion: "drag",
          } as React.CSSProperties}
        >
          <div>
            <div style={{ fontSize: THEME_TOKENS.typography.fontSizes.title, fontWeight: 700 }}>需要你的确认</div>
            <div style={{ marginTop: "3px", color: THEME_TOKENS.colors.textMuted, fontSize: THEME_TOKENS.typography.fontSizes.caption }}>
              一次授权 · ONCE
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭确认窗口"
            title="关闭"
            onClick={() => window.firefly?.close()}
            style={{
              width: "28px",
              height: "28px",
              padding: 0,
              border: "none",
              borderRadius: THEME_TOKENS.radii.full,
              background: THEME_TOKENS.colors.bgSecondary,
              color: THEME_TOKENS.colors.textSecondary,
              fontSize: "18px",
              lineHeight: 1,
              cursor: "pointer",
              WebkitAppRegion: "no-drag",
            } as React.CSSProperties}
          >
            ×
          </button>
        </header>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "0 16px 14px",
            WebkitAppRegion: "no-drag",
          } as React.CSSProperties}
        >
          {request ? (
            <>
              <div
                data-firefly-approval-hint="true"
                style={{
                  marginBottom: "14px",
                  padding: "9px 11px",
                  borderRadius: THEME_TOKENS.radii.md,
                  background: "rgba(255, 231, 177, 0.34)",
                  border: "1px solid rgba(210, 160, 83, 0.34)",
                  color: "#805b2f",
                  fontSize: THEME_TOKENS.typography.fontSizes.label,
                  lineHeight: 1.45,
                }}
              >
                {FIREFLY_APPROVAL_HINT}
              </div>
              <div style={{ marginBottom: "10px", color: THEME_TOKENS.colors.textSecondary, fontSize: THEME_TOKENS.typography.fontSizes.label }}>
                请求方
              </div>
              <div style={{ marginBottom: "14px", fontSize: THEME_TOKENS.typography.fontSizes.body, fontWeight: 650 }}>
                {requesterLabel(record)}
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                <InfoBlock label="摘要" value={request.summary} />
                <InfoBlock label="原因" value={request.reason} />
                <InfoBlock label="能力" value={request.capabilityId} />
                <InfoBlock label="风险" value={riskLabel(request.risk)} />
                <InfoBlock label="副作用" value={sideEffectLabel(request.sideEffect)} />
                <InfoBlock label="有效沙箱范围" value={scopeLabel(request.effectiveScope)} />
                <InfoBlock
                  label="有效期"
                  value={new Date(request.expiresAt).toLocaleString()}
                />
              </div>
            </>
          ) : (
            <div style={{ padding: "32px 8px", color: THEME_TOKENS.colors.textSecondary, textAlign: "center" }}>
              当前没有等待确认的请求。
            </div>
          )}

          {record && !isPending ? (
            <div
              role="status"
              style={{
                marginTop: "14px",
                padding: "10px 12px",
                borderRadius: THEME_TOKENS.radii.md,
                background: THEME_TOKENS.colors.accentSoft,
                color: THEME_TOKENS.colors.accent,
                fontSize: THEME_TOKENS.typography.fontSizes.label,
              }}
            >
              {stateLabel(record.state)}
            </div>
          ) : null}
          {error ? (
            <div role="alert" style={{ marginTop: "10px", color: THEME_TOKENS.colors.statusError, fontSize: THEME_TOKENS.typography.fontSizes.label }}>
              {error}
            </div>
          ) : null}
        </div>

        <footer
          style={{
            display: "flex",
            gap: "10px",
            padding: "12px 16px 16px",
            borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            WebkitAppRegion: "no-drag",
          } as React.CSSProperties}
        >
          <button
            type="button"
            onClick={() => void resolve("deny")}
            disabled={!isPending || busy !== null}
            style={actionButtonStyle(false, !isPending || busy !== null)}
          >
            {busy === "deny" ? "处理中…" : "拒绝"}
          </button>
          <button
            type="button"
            onClick={() => void resolve("approve")}
            disabled={!isPending || busy !== null}
            style={actionButtonStyle(true, !isPending || busy !== null)}
          >
            {busy === "approve" ? "处理中…" : "允许"}
          </button>
        </footer>
      </section>
    </main>
  );
};

const InfoBlock: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div
    style={{
      padding: "9px 10px",
      borderRadius: THEME_TOKENS.radii.md,
      background: THEME_TOKENS.colors.surfaceGlass,
      border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
    }}
  >
    <div style={{ marginBottom: "3px", color: THEME_TOKENS.colors.textMuted, fontSize: THEME_TOKENS.typography.fontSizes.caption }}>
      {label}
    </div>
    <div style={{ color: THEME_TOKENS.colors.textPrimary, fontSize: THEME_TOKENS.typography.fontSizes.label, lineHeight: 1.45, overflowWrap: "anywhere" }}>
      {value}
    </div>
  </div>
);

function actionButtonStyle(primary: boolean, disabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    minHeight: "36px",
    border: primary ? "none" : `1px solid ${THEME_TOKENS.colors.border}`,
    borderRadius: THEME_TOKENS.radii.md,
    background: primary ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.surface,
    color: primary ? THEME_TOKENS.colors.textInverse : THEME_TOKENS.colors.textSecondary,
    fontSize: THEME_TOKENS.typography.fontSizes.body,
    fontWeight: 650,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };
}
