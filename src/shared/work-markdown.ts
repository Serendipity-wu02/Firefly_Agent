import type {
  WorkPlanStepRequirement,
  WorkTaskPhase,
  WorkTaskSnapshot,
} from "./work-types";
import type { WorkHistoryRecord } from "./work-history-types";

function phaseLabel(phase: WorkTaskPhase): string {
  switch (phase) {
    case "planning": return "正在生成计划";
    case "awaiting_confirmation": return "等待确认";
    case "running": return "执行中";
    case "completed": return "已完成";
    case "failed": return "未完成";
    case "cancelled": return "已取消";
  }
}

function requirementLabel(requirement: WorkPlanStepRequirement): string {
  return requirement === "tool" ? "真实工具结果" : "分析观察结果";
}

export function workStepOperationLabel(step: WorkTaskSnapshot["steps"][number]): string | undefined {
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
    case "music_status": return "查询音乐状态";
    case "file_read": return "读取用户选择的文件";
    default: return `执行工具：${step.toolBinding.toolName}`;
  }
}

function terminationReasonLabel(reason: NonNullable<WorkTaskSnapshot["terminationReason"]>): string {
  if (reason.kind === "budget_exhausted") return `预算耗尽（${reason.budget}）`;
  if (reason.kind === "plan_incomplete") return `计划未完成（${reason.reason}）`;
  return reason.kind;
}

function appendMultiline(lines: string[], label: string, value: string | undefined): void {
  if (value === undefined || value.length === 0) return;
  lines.push(`### ${label}`, "", value, "");
}

/**
 * Render only the user-visible Work record. File paths, opaque identities,
 * tool arguments and file bodies are intentionally excluded from the export.
 */
export function renderWorkMarkdown(snapshot: WorkTaskSnapshot): string {
  const lines: string[] = [
    "# Work 任务",
    "",
    "## 概览",
    "",
    `- 状态：${phaseLabel(snapshot.phase)}`,
    `- 创建时间：${new Date(snapshot.createdAt).toISOString()}`,
    `- 更新时间：${new Date(snapshot.updatedAt).toISOString()}`,
    "",
    "### 用户请求",
    "",
    snapshot.userPrompt,
    "",
  ];

  if (snapshot.fileSelection !== undefined) {
    lines.push("## 选择的资料", "");
    for (const file of snapshot.fileSelection.files) {
      lines.push(`- ${file.displayName} · ${file.fileKind} · ${file.byteLength} B${file.symbolicLink ? " · 符号链接目标" : ""}`);
    }
    lines.push(`- 选择总量：${snapshot.fileSelection.totalBytes} B`, "");
    if (snapshot.fileReadMode === "required") {
      lines.push("本任务要求执行时读取所选文件，并使用本次读取结果完成任务。", "");
    }
  }

  if (snapshot.steps.length > 0) {
    lines.push("## 执行步骤", "");
    for (const step of snapshot.steps) {
      lines.push(`### ${step.index + 1}. ${step.description}`, "");
      lines.push(`- 完成要求：${requirementLabel(step.completionRequirement)}`);
      lines.push(`- 状态：${step.status}`);
      if (step.verificationStatus !== undefined) lines.push(`- 验证：${step.verificationStatus}`);
      if (step.verificationReason !== undefined) lines.push(`- 验证说明：${step.verificationReason}`);
      const operation = workStepOperationLabel(step);
      if (operation !== undefined) lines.push(`- 预定操作：${operation}`);
      if (step.observation !== undefined) lines.push(`- 观察结果：${step.observation}`);
      lines.push("");
    }
  }

  appendMultiline(lines, "最终结果", snapshot.finalText);

  if (snapshot.terminationReason !== undefined) {
    lines.push(`- 终止原因：${terminationReasonLabel(snapshot.terminationReason)}`, "");
  }
  appendMultiline(lines, "错误信息", snapshot.error);

  return `${lines.join("\n").trimEnd()}\n`;
}

/** Render the safe, immutable history projection without execution-only data. */
export function renderWorkHistoryMarkdown(record: WorkHistoryRecord): string {
  const lines: string[] = [
    "# Work 历史任务",
    "",
    "## 概览",
    "",
    `- 状态：${phaseLabel(record.phase)}`,
    `- 创建时间：${new Date(record.createdAt).toISOString()}`,
    `- 更新时间：${new Date(record.updatedAt).toISOString()}`,
    "",
    "### 用户请求",
    "",
    record.userPrompt,
    "",
  ];

  if (record.fileSelection !== undefined) {
    lines.push("## 选择的资料", "");
    for (const file of record.fileSelection.files) {
      lines.push(`- ${file.displayName} · ${file.fileKind} · ${file.byteLength} B${file.symbolicLink ? " · 符号链接目标" : ""}`);
    }
    lines.push(`- 选择总量：${record.fileSelection.totalBytes} B`, "");
    if (record.fileReadMode === "required") {
      lines.push("本任务要求执行时读取所选文件，并使用本次读取结果完成任务。", "");
    }
  }

  if (record.steps.length > 0) {
    lines.push("## 执行步骤", "");
    for (const step of record.steps) {
      lines.push(`### ${step.index + 1}. ${step.description}`, "");
      lines.push(`- 完成要求：${requirementLabel(step.completionRequirement)}`);
      lines.push(`- 状态：${step.status}`);
      if (step.verificationStatus !== undefined) lines.push(`- 验证：${step.verificationStatus}`);
      if (step.verificationReason !== undefined) lines.push(`- 验证说明：${step.verificationReason}`);
      if (step.plannedOperation !== undefined) lines.push(`- 预定操作：${step.plannedOperation}`);
      lines.push("");
    }
  }

  appendMultiline(lines, "最终结果", record.finalText);
  if (record.terminationReason !== undefined) {
    lines.push(`- 终止原因：${terminationReasonLabel(record.terminationReason)}`, "");
  }
  appendMultiline(lines, "错误信息", record.error);

  return `${lines.join("\n").trimEnd()}\n`;
}
