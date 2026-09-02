/**
 * 工具输出截断器（完全对齐 Cyrene-Agent v3 §5.7 规范）
 */
export interface TruncationConfig {
  thresholdChars: number;
  headChars: number;
  tailChars: number;
}

export const DEFAULT_TRUNCATION: TruncationConfig = {
  thresholdChars: 8_192,
  headChars: 4_096,
  tailChars: 1_024,
};

export const TOOL_RESULT_PRUNE_MARKER = "\n\n[... tool result middle pruned ...]\n\n";

export function truncateToolOutput(
  output: string,
  config: TruncationConfig = DEFAULT_TRUNCATION,
): { preview: string; truncated: boolean } {
  const points = Array.from(output);
  if (points.length <= config.thresholdChars) {
    return { preview: output, truncated: false };
  }

  const head = points.slice(0, config.headChars).join("");
  const tail = points.slice(-config.tailChars).join("");
  const preview = `${head}${TOOL_RESULT_PRUNE_MARKER}${tail}`;

  return { preview, truncated: true };
}
