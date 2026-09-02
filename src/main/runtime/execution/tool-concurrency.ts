import type { ToolCall } from "../../../shared/tool-types";
import type { ToolPolicyDecision } from "./tool-policy";

export interface ToolExecutionBatch {
  mode: "parallel" | "serial";
  calls: ToolCall[];
}

/**
 * ToolBatchPlanner (工具并发与串行批次规划器)
 *
 * 规则：
 * 1. read_only / idempotent 的无副作用工具允许并发分批执行 (Parallel Batch)
 * 2. state_mutation / external_action 等具有状态改变的工具必须作为独立串行批次执行 (Serial Batch)
 * 3. 严格遵循 LLM 返回的调用先后顺序
 */
export class ToolBatchPlanner {
  static plan(
    toolCalls: ToolCall[],
    decisionMap: Map<string, ToolPolicyDecision>,
    maxParallel: number = 4,
  ): ToolExecutionBatch[] {
    const batches: ToolExecutionBatch[] = [];
    let currentBatch: ToolExecutionBatch | null = null;

    for (const call of toolCalls) {
      const decision = decisionMap.get(call.id) || decisionMap.get(call.name);
      const isParallel = decision ? decision.executionMode === "parallel" : false;

      if (isParallel) {
        if (currentBatch && currentBatch.mode === "parallel" && currentBatch.calls.length < maxParallel) {
          currentBatch.calls.push(call);
        } else {
          if (currentBatch) {
            batches.push(currentBatch);
          }
          currentBatch = {
            mode: "parallel",
            calls: [call],
          };
        }
      } else {
        if (currentBatch) {
          batches.push(currentBatch);
          currentBatch = null;
        }
        batches.push({
          mode: "serial",
          calls: [call],
        });
      }
    }

    if (currentBatch) {
      batches.push(currentBatch);
    }

    return batches;
  }
}
