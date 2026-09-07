import React, { useEffect, useState } from "react";
import type { ApprovalRecord } from "../../../shared/approval-types";
import type { SandboxScope } from "../../../shared/sandbox-types";
import type { ToolRiskLevel, ToolSideEffect } from "../../../shared/tool-types";

export interface InlineApprovalCardProps {
  readonly record: ApprovalRecord;
  readonly onStale: () => void;
}

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

export const InlineApprovalCard: React.FC<InlineApprovalCardProps> = ({ record, onStale }) => {
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBusy(null);
    setError(null);
  }, [record.request.approvalRequestId]);

  const resolve = async (action: "approve" | "deny"): Promise<void> => {
    if (busy || record.state !== "pending" || !window.approval) return;
    setBusy(action);
    setError(null);
    try {
      const result = await window.approval.resolveApproval({
        approvalRequestId: record.request.approvalRequestId,
        action,
      });
      if (!result.ok) {
        if (result.code === "APPROVAL_NOT_CURRENT" ||
            result.code === "APPROVAL_NOT_FOUND" ||
            result.code === "APPROVAL_ALREADY_RESOLVED") {
          onStale();
        } else {
          setError(result.message);
        }
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "确认请求处理失败。");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      data-approval-inline="true"
      aria-label="聊天内权限确认"
      style={{
        marginBottom: "12px",
        padding: "12px",
        borderRadius: "14px",
        border: "1px solid rgba(135, 202, 177, 0.45)",
        background: "rgba(22, 30, 35, 0.96)",
        color: "#f2fff9",
        boxShadow: "0 10px 28px rgba(10, 24, 29, 0.22)",
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "baseline" }}>
        <strong style={{ fontSize: "14px" }}>需要你的确认</strong>
        <span style={{ color: "#a7c8bb", fontSize: "11px" }}>一次授权 · ONCE</span>
      </div>
      <div style={{ marginTop: "4px", color: "#b7d7ca", fontSize: "12px" }}>{requesterLabel(record)}</div>
      <div style={{ display: "grid", gap: "6px", marginTop: "10px" }}>
        <InlineField label="摘要" value={record.request.summary} />
        <InlineField label="原因" value={record.request.reason} />
        <InlineField label="能力" value={record.request.capabilityId} />
        <InlineField label="风险" value={riskLabel(record.request.risk)} />
        <InlineField label="副作用" value={sideEffectLabel(record.request.sideEffect)} />
        <InlineField label="有效范围" value={scopeLabel(record.request.effectiveScope)} />
      </div>
      {error ? <div role="alert" style={{ marginTop: "8px", color: "#ffb3aa", fontSize: "12px" }}>{error}</div> : null}
      <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
        <button type="button" onClick={() => void resolve("deny")} disabled={busy !== null} style={buttonStyle(false, busy !== null)}>
          {busy === "deny" ? "处理中…" : "拒绝"}
        </button>
        <button type="button" onClick={() => void resolve("approve")} disabled={busy !== null} style={buttonStyle(true, busy !== null)}>
          {busy === "approve" ? "处理中…" : "允许"}
        </button>
      </div>
    </section>
  );
};

const InlineField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: "grid", gridTemplateColumns: "52px minmax(0, 1fr)", gap: "8px", fontSize: "12px", lineHeight: 1.4 }}>
    <span style={{ color: "#91b8a8" }}>{label}</span>
    <span style={{ color: "#effff8", overflowWrap: "anywhere" }}>{value}</span>
  </div>
);

function buttonStyle(primary: boolean, disabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    minHeight: "32px",
    border: primary ? "none" : "1px solid rgba(167, 200, 187, 0.45)",
    borderRadius: "9px",
    background: primary ? "#74c69d" : "rgba(255, 255, 255, 0.08)",
    color: primary ? "#10241d" : "#e9fff5",
    fontSize: "13px",
    fontWeight: 650,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };
}
