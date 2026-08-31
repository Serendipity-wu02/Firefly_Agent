import type { ToolCallResult } from "../../../shared/tool-types";
import { ToolResultPruner } from "../compaction/tool-result-pruner";

export interface ToolResultPolicyOptions {
  maxResultChars: number;
}

/**
 * ToolResultPolicy (工具结果策略执行器)
 *
 * 负责在工具执行完毕后实施尺寸约束，将超限结果无缝移交 Phase B ToolResultPruner 执行安全的头尾截断。
 */
export class ToolResultPolicy {
  static apply(
    result: ToolCallResult,
    options: ToolResultPolicyOptions = { maxResultChars: 8_192 },
  ): ToolCallResult {
    const rawOutput = result.output || "";
    if (rawOutput.length <= options.maxResultChars) {
      return result;
    }

    const headChars = Math.max(1, Math.floor(options.maxResultChars * 0.7));
    const tailChars = Math.max(1, Math.floor(options.maxResultChars * 0.2));

    const { text, pruned } = ToolResultPruner.pruneText(
      rawOutput,
      {
        maxResultChars: options.maxResultChars,
        headChars,
        tailChars,
        middleMarker: "\n\n[... 工具执行结果超限，已由 ToolResultPolicy 自动修剪 ...]\n\n",
        preserveErrors: true,
      },
      result.isError,
    );

    if (!pruned) {
      return result;
    }

    return {
      ...result,
      output: text,
    };
  }
}
