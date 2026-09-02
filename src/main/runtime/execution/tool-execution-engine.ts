import type { ToolCall, ToolCallResult } from "../../../shared/tool-types";
import type { FireflyToolRegistry } from "../../tools/tool-registry";
import { FireflyToolDispatcher } from "../../tools/tool-dispatcher";
import type { AgentEventBus } from "../../orchestrator/agent-events";
import {
  ToolPolicyEvaluator,
  DEFAULT_TOOL_POLICY_CONFIG,
  type ToolPolicyConfig,
  type ToolPolicyDecision,
} from "./tool-policy";
import { ToolBatchPlanner } from "./tool-concurrency";
import { ToolResultPolicy } from "./tool-result-policy";
import type { ToolExecutionContext } from "./tool-execution-context";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 判断是否为暂态错误 (Transient Error - 允许安全重试)
 */
function isTransientError(output: string): boolean {
  try {
    const parsed = JSON.parse(output);
    if (!parsed || parsed.ok !== false) return false;
    const err = String(parsed.error || "");
    return (
      err.includes("timeout") ||
      err.includes("network") ||
      err.includes("econnrefused") ||
      err.includes("transient") ||
      err.includes("busy")
    );
  } catch {
    return false;
  }
}

/**
 * ToolExecutionEngine (工具策略与执行引擎)
 *
 * 核心职责：
 * 1. 拦截并评估大模型发出的工具调用请求 (Tool Authorization & Whitelist/Blacklist)
 * 2. 调度执行并发与串行批次规划 (Tool Concurrency Planner)
 * 3. 实施单工具超时熔断 (Tool Timeout) 与暂态故障退避重试 (Tool Retry Policy)
 * 4. 实施结果尺寸约束与修剪 (Tool Result Policy)
 * 5. 保证执行隔离与失败安全 (Failure Safety)，永不崩溃 Agent Loop
 */
export class ToolExecutionEngine {
  private policyConfig: ToolPolicyConfig;
  private readonly dispatcher: FireflyToolDispatcher;

  constructor(
    private readonly registry: FireflyToolRegistry,
    policyConfig?: Partial<ToolPolicyConfig>,
    private readonly eventBus?: AgentEventBus,
    dispatcher?: FireflyToolDispatcher,
  ) {
    this.policyConfig = { ...DEFAULT_TOOL_POLICY_CONFIG, ...(policyConfig || {}) };
    this.dispatcher = dispatcher || new FireflyToolDispatcher(this.registry);
  }

  getPolicyConfig(): ToolPolicyConfig {
    return { ...this.policyConfig };
  }

  setPolicyConfig(config: Partial<ToolPolicyConfig>): void {
    this.policyConfig = { ...this.policyConfig, ...config };
  }

  /**
   * 执行单次工具调用 (受 Policy, Timeout, Retry, ResultPolicy 完整保护)
   */
  async executeToolCall(
    call: ToolCall,
    ctx: ToolExecutionContext,
  ): Promise<ToolCallResult> {
    try {
      // 1. 校验单次 Run 的最大工具调用配额 (Run Tool Budget)
      const maxCalls =
        ctx.maxToolCallsPerRun || this.policyConfig.maxToolCallsPerRun || 25;
      if (ctx.toolCallsCount > maxCalls) {
        const reason = `Tool calls budget exceeded (Max: ${maxCalls})`;
        this.eventBus?.emit({
          type: "tool:denied",
          runId: ctx.runId,
          step: ctx.step,
          toolCallId: call.id,
          toolName: call.name,
          reason,
          timestamp: Date.now(),
        });

        return {
          toolCallId: call.id,
          name: call.name,
          output: JSON.stringify({
            ok: false,
            error: "budget_exceeded",
            message: reason,
          }),
          isError: true,
        };
      }

      // 2. 策略判定 (Policy Evaluation)
      const tool = this.registry.get(call.name);
      const decision = ToolPolicyEvaluator.evaluate(
        tool,
        call.name,
        this.policyConfig,
      );

      // 3. 拒绝拦截或确认阻断
      if (decision.action === "deny") {
        const reason = decision.reason || "Policy denied execution";
        this.eventBus?.emit({
          type: "tool:denied",
          runId: ctx.runId,
          step: ctx.step,
          toolCallId: call.id,
          toolName: call.name,
          reason,
          timestamp: Date.now(),
        });

        return {
          toolCallId: call.id,
          name: call.name,
          output: JSON.stringify({
            ok: false,
            error: "policy_denied",
            message: reason,
          }),
          isError: true,
        };
      }

      if (decision.action === "require_confirmation") {
        const reason = decision.reason || "User confirmation required";
        this.eventBus?.emit({
          type: "tool:denied",
          runId: ctx.runId,
          step: ctx.step,
          toolCallId: call.id,
          toolName: call.name,
          reason,
          timestamp: Date.now(),
        });

        return {
          toolCallId: call.id,
          name: call.name,
          output: JSON.stringify({
            ok: false,
            error: "confirmation_required",
            message: reason,
          }),
          isError: true,
        };
      }

      // 4. 触发授权通过事件 (tool:authorized)
      this.eventBus?.emit({
        type: "tool:authorized",
        runId: ctx.runId,
        step: ctx.step,
        toolCallId: call.id,
        toolName: call.name,
        timestamp: Date.now(),
      });

      // 5. 执行循环 (含 Timeout 与 Retry)
      let attempt = 0;
      const maxRetries = decision.maxRetries;

      while (true) {
        attempt++;

        // 检查全局中断信号
        if (ctx.signal?.aborted) {
          return {
            toolCallId: call.id,
            name: call.name,
            output: JSON.stringify({
              ok: false,
              error: "tool_cancelled",
              message: "Tool execution was cancelled by agent signal.",
            }),
            isError: true,
          };
        }

        // 单次执行超时控制器
        const timeoutController = new AbortController();
        let timeoutTriggered = false;

        const timer = setTimeout(() => {
          timeoutTriggered = true;
          timeoutController.abort();
        }, decision.timeoutMs);

        const onParentAbort = () => timeoutController.abort();
        ctx.signal?.addEventListener("abort", onParentAbort, { once: true });

        try {
          const rawResult = await this.dispatcher.executeToolCall(call, {
            userQuery: ctx.userQuery || "",
            conversationId: ctx.conversationId,
            signal: timeoutController.signal,
          });

          clearTimeout(timer);
          ctx.signal?.removeEventListener("abort", onParentAbort);

          // 超时拦截
          if (timeoutTriggered) {
            this.eventBus?.emit({
              type: "tool:timeout",
              runId: ctx.runId,
              step: ctx.step,
              toolCallId: call.id,
              toolName: call.name,
              timeoutMs: decision.timeoutMs,
              timestamp: Date.now(),
            });

            return {
              toolCallId: call.id,
              name: call.name,
              output: JSON.stringify({
                ok: false,
                error: "tool_timeout",
                message: `Tool "${call.name}" timed out after ${decision.timeoutMs}ms.`,
              }),
              isError: true,
            };
          }

          // 判定是否为业务错误响应
          let isError = !!rawResult.isError;
          try {
            const parsed = JSON.parse(rawResult.output);
            if (parsed && parsed.ok === false) {
              isError = true;
            }
          } catch {}

          // 若发生暂态错误且尚未耗尽重试次数，执行退避重试
          if (isTransientError(rawResult.output) && attempt <= maxRetries) {
            const delayMs = decision.retryBackoffMs * Math.pow(2, attempt - 1);
            this.eventBus?.emit({
              type: "tool:retry",
              runId: ctx.runId,
              step: ctx.step,
              toolCallId: call.id,
              toolName: call.name,
              attempt,
              delayMs,
              error: rawResult.output,
              timestamp: Date.now(),
            });

            await sleep(delayMs);
            continue;
          }

          // 6. 执行 ToolResultPolicy 修剪超限结果
          return ToolResultPolicy.apply(
            {
              ...rawResult,
              isError,
            },
            {
              maxResultChars: decision.maxResultChars,
            },
          );
        } catch (err: any) {
          clearTimeout(timer);
          ctx.signal?.removeEventListener("abort", onParentAbort);

          if (timeoutTriggered) {
            this.eventBus?.emit({
              type: "tool:timeout",
              runId: ctx.runId,
              step: ctx.step,
              toolCallId: call.id,
              toolName: call.name,
              timeoutMs: decision.timeoutMs,
              timestamp: Date.now(),
            });

            return {
              toolCallId: call.id,
              name: call.name,
              output: JSON.stringify({
                ok: false,
                error: "tool_timeout",
                message: `Tool "${call.name}" timed out after ${decision.timeoutMs}ms.`,
              }),
              isError: true,
            };
          }

          const errMsg = err?.message || String(err);
          if (attempt <= maxRetries && !ctx.signal?.aborted) {
            const delayMs = decision.retryBackoffMs * Math.pow(2, attempt - 1);
            this.eventBus?.emit({
              type: "tool:retry",
              runId: ctx.runId,
              step: ctx.step,
              toolCallId: call.id,
              toolName: call.name,
              attempt,
              delayMs,
              error: errMsg,
              timestamp: Date.now(),
            });

            await sleep(delayMs);
            continue;
          }

          return {
            toolCallId: call.id,
            name: call.name,
            output: JSON.stringify({
              ok: false,
              error: "execution_exception",
              message: errMsg,
            }),
            isError: true,
          };
        }
      }
    } catch (unexpectedError: any) {
      console.warn("[ToolExecutionEngine] Unexpected failure in tool execution:", unexpectedError);
      return {
        toolCallId: call.id,
        name: call.name,
        output: JSON.stringify({
          ok: false,
          error: "engine_internal_error",
          message: unexpectedError?.message || String(unexpectedError),
        }),
        isError: true,
      };
    }
  }

  /**
   * 批次执行整轮工具调用 (自动进行并发与串行拆分)
   */
  async executeRound(
    toolCalls: ToolCall[],
    ctx: ToolExecutionContext,
  ): Promise<ToolCallResult[]> {
    if (!toolCalls || toolCalls.length === 0) {
      return [];
    }

    // 1. 收集各工具的策略决策
    const decisionMap = new Map<string, ToolPolicyDecision>();
    for (const call of toolCalls) {
      const tool = this.registry.get(call.name);
      const decision = ToolPolicyEvaluator.evaluate(tool, call.name, this.policyConfig);
      decisionMap.set(call.id, decision);
      decisionMap.set(call.name, decision);
    }

    // 2. 批次规划
    const maxParallel = this.policyConfig.maxParallelTools || 4;
    const batches = ToolBatchPlanner.plan(toolCalls, decisionMap, maxParallel);

    const resultMap = new Map<string, ToolCallResult>();

    // 3. 按批次序执行
    for (const batch of batches) {
      if (batch.mode === "parallel") {
        const promises = batch.calls.map((call) =>
          this.executeToolCall(call, {
            ...ctx,
            toolCallsCount: ctx.toolCallsCount + resultMap.size,
          }),
        );
        const batchResults = await Promise.all(promises);
        for (const res of batchResults) {
          resultMap.set(res.toolCallId, res);
        }
      } else {
        for (const call of batch.calls) {
          const res = await this.executeToolCall(call, {
            ...ctx,
            toolCallsCount: ctx.toolCallsCount + resultMap.size,
          });
          resultMap.set(res.toolCallId, res);
        }
      }
    }

    // 4. 按原始输入顺序返回结果列表
    return toolCalls.map((call) => {
      return (
        resultMap.get(call.id) || {
          toolCallId: call.id,
          name: call.name,
          output: JSON.stringify({ ok: false, error: "missing_result" }),
          isError: true,
        }
      );
    });
  }
}
