import { randomUUID } from "node:crypto";
import type { DelegationScope } from "../child-session-types";
import type { ToolCall } from "../vendors/types";
import { resolveEffectKind, type ToolDefinition } from "../tools/registry/tool-registry";
import { parseToolCallArgs } from "./types";
import { resolveSideEffect } from "./side-effect-resolver";
import { DELEGATE_AGENT_TOOL_ID, isHarnessBuiltin } from "./builtin-tools";
import { READ_TOOL_RESULT_TOOL_ID } from "./tool-output/read-tool-result";

export type ToolExecutionMode = "parallel" | "exclusive" | "delegation";

export type ToolScheduleCommitDecision = "continue" | "halt";

/** 原始模型调用顺序的显式载体；完成顺序不得替代该顺序。 */
export interface ToolCallExecution {
  toolCallIndex: number;
  call: ToolCall;
  /** Main-owned identity; never accepted from model arguments. */
  delegationScope?: DelegationScope;
}

export interface ToolCallSchedulerOptions<T> {
  calls: ToolCall[];
  maxParallel: number;
  signal?: AbortSignal;
  classify: (call: ToolCall) => ToolExecutionMode;
  execute: (execution: ToolCallExecution) => Promise<T>;
  commit: (execution: ToolCallExecution, result: T) => Promise<ToolScheduleCommitDecision>;
  notExecuted: (execution: ToolCallExecution, reason: string) => Promise<T>;
  /** Stop only this run's owned work immediately on infrastructure failure, before any drain. */
  onFailure?: (error: unknown) => void;
  /** Runs after all original delegation promises settle, including cancellation. */
  closeGroup?: (groupId: string) => Promise<void>;
}

export interface ToolCallScheduleResult {
  cancelled: boolean;
  halted: boolean;
}

/**
 * 并发默认拒绝：普通工具必须显式声明当前参数安全，且只能是读操作。
 * Harness 内置工具中仅 read_tool_result 不会改父状态，允许并发。
 */
export function classifyToolExecutionMode(
  call: ToolCall,
  tools: ToolDefinition[],
): ToolExecutionMode {
  if (isHarnessBuiltin(call.name)) {
    if (call.name === DELEGATE_AGENT_TOOL_ID) return "delegation";
    return call.name === READ_TOOL_RESULT_TOOL_ID ? "parallel" : "exclusive";
  }

  const tool = tools.find((candidate) => candidate.id === call.name);
  if (!tool) return "exclusive";

  const args = parseToolCallArgs(call);
  try {
    const effectKind = resolveEffectKind(tool, args);
    if (effectKind !== "read" && effectKind !== "verification") return "exclusive";
    if (resolveSideEffect(tool, args) !== "read_only") return "exclusive";
  } catch {
    return "exclusive";
  }

  try {
    return tool.isConcurrencySafe?.(args) === true ? "parallel" : "exclusive";
  } catch {
    return "exclusive";
  }
}

/**
 * 按模型顺序调度工具：连续安全调用使用滚动池；独占调用前后形成屏障。
 * 完成顺序不影响 commit 顺序，因此模型消息和 Harness 状态可保持稳定。
 */
export async function scheduleToolCalls<T>(
  options: ToolCallSchedulerOptions<T>,
): Promise<ToolCallScheduleResult> {
  let failure: { error: unknown } | undefined;
  const onFailure = (error: unknown): void => {
    if (failure) return;
    failure = { error };
    options.onFailure?.(error);
  };
  try {
    return await scheduleOwnedToolCalls({ ...options, onFailure });
  } catch (error) {
    // Cleanup may abort the invocation signal or fail itself. Neither replaces the
    // infrastructure error that initiated cleanup.
    try { onFailure(error); }
    finally { throw failure!.error; }
  }
}

async function scheduleOwnedToolCalls<T>(
  options: ToolCallSchedulerOptions<T>,
): Promise<ToolCallScheduleResult> {
  const maxParallel = Math.max(1, Math.trunc(options.maxParallel) || 1);
  let index = 0;
  const executionAt = (toolCallIndex: number): ToolCallExecution => ({
    toolCallIndex,
    call: options.calls[toolCallIndex]!,
  });

  const commitNotStarted = async (from: number, reason: string): Promise<void> => {
    for (let cursor = from; cursor < options.calls.length; cursor++) {
      const execution = executionAt(cursor);
      const result = await options.notExecuted(execution, reason);
      await options.commit(execution, result);
    }
  };

  while (index < options.calls.length) {
    if (options.signal?.aborted) {
      await commitNotStarted(index, "aborted_before_dispatch");
      return { cancelled: true, halted: false };
    }

    const first = options.calls[index];
    if (options.classify(first) === "exclusive") {
      const execution = executionAt(index);
      let result: T;
      try {
        result = await options.execute(execution);
      } catch (error) {
        if (options.signal?.aborted) {
          // 当前调用已进入 execute（runStore 已记 started、非幂等副作用可能已派发）：
          // 不能闭合为 not_executed，保留 started 交取消闭合写 unknown + uncertainEffects；
          // 只有 index 之后真正未派发的调用才记 aborted_before_dispatch。
          await commitNotStarted(index + 1, "aborted_before_dispatch");
          return { cancelled: true, halted: false };
        }
        options.onFailure?.(error);
        // 与并行组一致：execute 抛错的槽位以合成失败结果提交（transcript 闭合），
        // 其余未执行调用补 not_executed，再把错误上抛给工具轮统一转 error 终态。
        const synthetic = await options.notExecuted(execution, "execution_error");
        await options.commit(execution, synthetic);
        await commitNotStarted(index + 1, "not_executed_after_error");
        throw error;
      }
      const decision = await options.commit(execution, result);
      index++;
      if (decision === "halt") {
        await commitNotStarted(index, "not_executed_after_halt");
        return { cancelled: false, halted: true };
      }
      continue;
    }

    const groupStart = index;
    while (index < options.calls.length && options.classify(options.calls[index]) !== "exclusive") index++;
    const hasDelegation = options.calls.slice(groupStart, index)
      .some(call => options.classify(call) === "delegation");
    const groupId = hasDelegation ? randomUUID() : undefined;
    const group = options.calls.slice(groupStart, index).map((call, offset): ToolCallExecution => ({
      toolCallIndex: groupStart + offset,
      call,
      ...(groupId && options.classify(call) === "delegation"
        ? { delegationScope: { groupId, toolCallId: call.id } } : {}),
    }));
    let groupResult: ParallelGroupResult;
    try {
      groupResult = await runParallelGroup(group, maxParallel, options);
    } catch (error) {
      options.onFailure?.(error);
      throw error;
    } finally {
      if (groupId) await options.closeGroup?.(groupId);
    }
    if (groupResult.failure) {
      await commitNotStarted(index, "not_executed_after_error");
      throw groupResult.failure.error;
    }
    if (groupResult.cancelled) {
      await commitNotStarted(index, "aborted_before_dispatch");
      return { cancelled: true, halted: false };
    }
    if (groupResult.halted) {
      await commitNotStarted(index, "not_executed_after_halt");
      return { cancelled: false, halted: true };
    }
  }

  return { cancelled: false, halted: false };
}

interface ParallelGroupResult {
  cancelled: boolean;
  halted: boolean;
  failure?: { error: unknown };
}

async function runParallelGroup<T>(
  calls: ToolCallExecution[],
  maxParallel: number,
  options: ToolCallSchedulerOptions<T>,
): Promise<ParallelGroupResult> {
  type Settled = { index: number; result: T; failed: false } | { index: number; error: unknown; failed: true };
  type Slot = { ready: false } | { ready: true; result: T } | { ready: true; aborted: true };
  const settled: Slot[] = calls.map(() => ({ ready: false }));
  const active = new Map<number, Promise<Settled>>();
  const launched = new Set<number>();
  const modes = calls.map(({ call }) => options.classify(call));
  const activeCounts = { parallel: 0, delegation: 0 };
  const capacities = { parallel: maxParallel, delegation: Math.min(3, maxParallel) };
  let commitIndex = 0;
  let halted = false;
  let cancelled = false;
  let failure: { error: unknown } | undefined;
  const recordFailure = (error: unknown): void => {
    if (failure) return;
    failure = { error };
    options.onFailure?.(error);
  };

  // Scan both pools independently. A full role pool must not strand a later safe read.
  const launchAvailable = (): void => {
    for (let cursor = 0; cursor < calls.length; cursor++) {
      if (halted || cancelled || failure !== undefined || options.signal?.aborted) break;
      if (launched.has(cursor)) continue;
      const mode = modes[cursor] === "delegation" ? "delegation" : "parallel";
      if (activeCounts[mode] >= capacities[mode]) continue;
      launched.add(cursor);
      activeCounts[mode]++;
      const promise = Promise.resolve().then(() => options.execute(calls[cursor]!)).then(
        (result): Settled => ({ index: cursor, result, failed: false }),
        (error): Settled => ({ index: cursor, error, failed: true }),
      );
      active.set(cursor, promise);
    }
  };

  const commitReady = async (): Promise<void> => {
    while (commitIndex < calls.length) {
      let slot = settled[commitIndex]!;
      if (!slot.ready && !launched.has(commitIndex)
        && (halted || cancelled || failure !== undefined || options.signal?.aborted)) {
        const reason = failure ? "not_executed_after_error"
          : cancelled || options.signal?.aborted ? "aborted_before_dispatch" : "not_executed_after_halt";
        slot = { ready: true, result: await options.notExecuted(calls[commitIndex]!, reason) };
        settled[commitIndex] = slot;
      }
      if (!slot.ready) break;
      if (!("aborted" in slot)) {
        try {
          const decision = await options.commit(calls[commitIndex]!, slot.result);
          halted ||= decision === "halt";
        } catch (error) {
          recordFailure(error);
        }
      }
      commitIndex++;
    }
  };

  launchAvailable();
  try {
    while (active.size > 0) {
      const next = await Promise.race(active.values());
      active.delete(next.index);
      const mode = modes[next.index] === "delegation" ? "delegation" : "parallel";
      activeCounts[mode]--;
      cancelled ||= options.signal?.aborted === true;
      if (next.failed) {
        if (cancelled) {
          // Started, genuinely aborted slots remain for interruption recovery to close.
          settled[next.index] = { ready: true, aborted: true };
        } else {
          recordFailure(next.error);
          settled[next.index] = {
            ready: true, result: await options.notExecuted(calls[next.index]!, "execution_error"),
          };
        }
      } else {
        settled[next.index] = { ready: true, result: next.result };
      }
      await commitReady();
      launchAvailable();
    }
    cancelled ||= options.signal?.aborted === true;
    await commitReady();
  } catch (error) {
    // notExecuted/commit bookkeeping can throw while siblings still own permits.
    // Quiesce here, not in the outer Harness which is waiting on this drain.
    recordFailure(error);
  } finally {
    // Drain the original execute promises. Cancellation never invents settlement.
    if (active.size > 0) await Promise.allSettled([...active.values()]);
  }
  return { cancelled, halted, ...(failure ? { failure } : {}) };
}
