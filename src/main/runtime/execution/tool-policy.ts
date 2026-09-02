import type {
  ToolDefinition,
  ToolSafetyLevel,
  ToolSideEffect,
} from "../../../shared/tool-types";

export type ToolExecutionMode = "serial" | "parallel";

export type ToolState =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "denied";

export interface ToolPolicyRule {
  allowed?: boolean;
  safetyLevel?: ToolSafetyLevel;
  sideEffect?: ToolSideEffect;
  executionMode?: ToolExecutionMode;
  timeoutMs?: number;
  maxRetries?: number;
  retryBackoffMs?: number;
  maxResultChars?: number;
  requireConfirmation?: boolean;
}

export interface ToolPolicyConfig {
  allowedTools?: string[];
  deniedTools?: string[];
  requireConfirmationTools?: string[];
  defaultSafetyLevel?: ToolSafetyLevel;
  defaultTimeoutMs?: number;
  defaultMaxRetries?: number;
  defaultRetryBackoffMs?: number;
  maxResultChars?: number;
  maxToolCallsPerRun?: number;
  maxParallelTools?: number;
  rules?: Record<string, ToolPolicyRule>;
}

export const DEFAULT_TOOL_POLICY_CONFIG: ToolPolicyConfig = {
  defaultSafetyLevel: "safe",
  defaultTimeoutMs: 30_000,
  defaultMaxRetries: 2,
  defaultRetryBackoffMs: 200,
  maxResultChars: 8_192,
  maxToolCallsPerRun: 25,
  maxParallelTools: 4,
};

export interface ToolPolicyDecision {
  toolName: string;
  allowed: boolean;
  action: "allow" | "deny" | "require_confirmation";
  safetyLevel: ToolSafetyLevel;
  sideEffect: ToolSideEffect;
  executionMode: ToolExecutionMode;
  timeoutMs: number;
  maxRetries: number;
  retryBackoffMs: number;
  maxResultChars: number;
  reason?: string;
}

/**
 * ToolPolicyEvaluator (工具策略评估器)
 *
 * 评估工具权限 (Whitelist/Blacklist)、安全等级、副作用、并发模式、超时与重试配额。
 */
export class ToolPolicyEvaluator {
  static evaluate(
    tool: ToolDefinition | undefined,
    toolName: string,
    config: ToolPolicyConfig = DEFAULT_TOOL_POLICY_CONFIG,
  ): ToolPolicyDecision {
    const mergedConfig: ToolPolicyConfig = { ...DEFAULT_TOOL_POLICY_CONFIG, ...config };
    const rule = mergedConfig.rules?.[toolName] || {};

    // 1. 工具未注册校验
    if (!tool) {
      return {
        toolName,
        allowed: false,
        action: "deny",
        safetyLevel: "high_risk",
        sideEffect: "state_mutation",
        executionMode: "serial",
        timeoutMs: mergedConfig.defaultTimeoutMs || 30_000,
        maxRetries: 0,
        retryBackoffMs: 0,
        maxResultChars: mergedConfig.maxResultChars || 8_192,
        reason: `tool_not_found: Tool "${toolName}" is not registered.`,
      };
    }

    // 2. 黑名单 (deniedTools) 优先检查
    if (mergedConfig.deniedTools && mergedConfig.deniedTools.includes(toolName)) {
      return {
        toolName,
        allowed: false,
        action: "deny",
        safetyLevel: "high_risk",
        sideEffect: "state_mutation",
        executionMode: "serial",
        timeoutMs: mergedConfig.defaultTimeoutMs || 30_000,
        maxRetries: 0,
        retryBackoffMs: 0,
        maxResultChars: mergedConfig.maxResultChars || 8_192,
        reason: `policy_denied: Tool "${toolName}" is blacklisted by policy.`,
      };
    }

    // 3. 显式规则禁用
    if (rule.allowed === false) {
      return {
        toolName,
        allowed: false,
        action: "deny",
        safetyLevel: "high_risk",
        sideEffect: "state_mutation",
        executionMode: "serial",
        timeoutMs: mergedConfig.defaultTimeoutMs || 30_000,
        maxRetries: 0,
        retryBackoffMs: 0,
        maxResultChars: mergedConfig.maxResultChars || 8_192,
        reason: `policy_denied: Tool "${toolName}" is disabled by explicit rule.`,
      };
    }

    // 4. 白名单 (allowedTools) 检查
    if (
      mergedConfig.allowedTools &&
      mergedConfig.allowedTools.length > 0 &&
      !mergedConfig.allowedTools.includes(toolName)
    ) {
      return {
        toolName,
        allowed: false,
        action: "deny",
        safetyLevel: "high_risk",
        sideEffect: "state_mutation",
        executionMode: "serial",
        timeoutMs: mergedConfig.defaultTimeoutMs || 30_000,
        maxRetries: 0,
        retryBackoffMs: 0,
        maxResultChars: mergedConfig.maxResultChars || 8_192,
        reason: `policy_denied: Tool "${toolName}" is not in the allowed tools whitelist.`,
      };
    }

    // 5. 元数据解析：安全等级与副作用分类
    const safetyLevel: ToolSafetyLevel =
      rule.safetyLevel ??
      tool.safetyLevel ??
      (tool.risk === "high_risk" ? "high_risk" : mergedConfig.defaultSafetyLevel || "safe");

    const sideEffect: ToolSideEffect =
      rule.sideEffect ??
      tool.sideEffect ??
      (tool.risk === "read_only" ? "read_only" : "state_mutation");

    const executionMode: ToolExecutionMode =
      rule.executionMode ??
      (sideEffect === "read_only" || sideEffect === "idempotent" ? "parallel" : "serial");

    const timeoutMs =
      rule.timeoutMs ?? tool.timeoutMs ?? mergedConfig.defaultTimeoutMs ?? 30_000;
    const maxRetries =
      rule.maxRetries ?? (tool.retryable === false ? 0 : mergedConfig.defaultMaxRetries ?? 2);
    const retryBackoffMs =
      rule.retryBackoffMs ?? mergedConfig.defaultRetryBackoffMs ?? 200;
    const maxResultChars =
      rule.maxResultChars ?? mergedConfig.maxResultChars ?? 8_192;

    // 6. 确认需求 (Confirmation Requirement) 判定
    const isConfirmationRequired =
      rule.requireConfirmation === true ||
      (mergedConfig.requireConfirmationTools &&
        mergedConfig.requireConfirmationTools.includes(toolName)) ||
      safetyLevel === "confirm_required" ||
      safetyLevel === "high_risk";

    if (isConfirmationRequired) {
      return {
        toolName,
        allowed: true,
        action: "require_confirmation",
        safetyLevel,
        sideEffect,
        executionMode,
        timeoutMs,
        maxRetries: 0, // 需要确认的工具不自动重试
        retryBackoffMs,
        maxResultChars,
        reason: `confirmation_required: Tool "${toolName}" requires user authorization before execution.`,
      };
    }

    return {
      toolName,
      allowed: true,
      action: "allow",
      safetyLevel,
      sideEffect,
      executionMode,
      timeoutMs,
      maxRetries,
      retryBackoffMs,
      maxResultChars,
    };
  }
}
