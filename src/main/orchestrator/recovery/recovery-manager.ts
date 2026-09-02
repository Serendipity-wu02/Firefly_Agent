import {
  ErrorClassifier,
  type ClassifiedError,
  type ClassifiedErrorType,
} from "./error-classifier";

export interface RecoveryBudget {
  maxRecoveryAttempts: number;
  maxProviderRetries: number;
  maxOverflowRetries: number;
  maxResumeAttempts: number;
  initialBackoffMs: number;
}

export const DEFAULT_RECOVERY_BUDGET: RecoveryBudget = {
  maxRecoveryAttempts: 3,
  maxProviderRetries: 3,
  maxOverflowRetries: 1,
  maxResumeAttempts: 2,
  initialBackoffMs: 500,
};

export type RecoveryActionType =
  | "retry_with_compaction"
  | "retry_with_backoff"
  | "retry_immediate"
  | "fail_run";

export interface RecoveryDecision {
  action: RecoveryActionType;
  delayMs: number;
  reason: string;
  classifiedError: ClassifiedError;
}

/**
 * RecoveryManager (运行级故障自愈与恢复决策器)
 *
 * 专门负责处理 LLM Provider 级故障（400 上下文溢出、429 限流、5xx 服务端故障、网络抖动），
 * 严格限制恢复预算，避免无限递归重试与死循环。
 */
export class RecoveryManager {
  private readonly budget: RecoveryBudget;

  constructor(budget?: Partial<RecoveryBudget>) {
    this.budget = { ...DEFAULT_RECOVERY_BUDGET, ...(budget || {}) };
  }

  getBudget(): RecoveryBudget {
    return { ...this.budget };
  }

  evaluate(err: unknown, currentAttempts: number): RecoveryDecision {
    const classified = ErrorClassifier.classify(err);

    // 1. 用户主动取消，绝不执行自动恢复
    if (classified.type === "cancelled") {
      return {
        action: "fail_run",
        delayMs: 0,
        reason: "Operation was cancelled by user or signal.",
        classifiedError: classified,
      };
    }

    // 2. 检查全局恢复预算
    if (currentAttempts >= this.budget.maxRecoveryAttempts) {
      return {
        action: "fail_run",
        delayMs: 0,
        reason: `Max recovery attempts exhausted (${currentAttempts}/${this.budget.maxRecoveryAttempts}).`,
        classifiedError: classified,
      };
    }

    // 3. 上下文超限 (Context Overflow) 恢复路径
    if (classified.type === "context_overflow") {
      if (currentAttempts < this.budget.maxOverflowRetries) {
        return {
          action: "retry_with_compaction",
          delayMs: 0,
          reason: "Context overflow detected. Triggering Emergency Compaction.",
          classifiedError: classified,
        };
      }
      return {
        action: "fail_run",
        delayMs: 0,
        reason: "Context overflow could not be resolved after compaction attempt.",
        classifiedError: classified,
      };
    }

    // 4. 限流 (429 Rate Limit) 退避恢复路径
    if (classified.type === "rate_limit") {
      const delayMs = this.budget.initialBackoffMs * Math.pow(2, currentAttempts);
      return {
        action: "retry_with_backoff",
        delayMs,
        reason: `Rate limit encountered. Backing off for ${delayMs}ms before retry.`,
        classifiedError: classified,
      };
    }

    // 5. 服务端异常与网络故障 (5xx / Socket Error) 重试路径
    if (classified.type === "server_error" || classified.type === "network_error") {
      const delayMs = Math.min(2000, this.budget.initialBackoffMs * (currentAttempts + 1));
      return {
        action: "retry_immediate",
        delayMs,
        reason: `Transient provider failure (${classified.type}). Retrying after ${delayMs}ms.`,
        classifiedError: classified,
      };
    }

    // 6. 致命错误 (Fatal / 401 / 403 / Unknown)
    return {
      action: "fail_run",
      delayMs: 0,
      reason: `Fatal non-retryable error: ${classified.message}`,
      classifiedError: classified,
    };
  }
}
