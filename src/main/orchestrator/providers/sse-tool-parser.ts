import type { ToolCall } from "../../../shared/tool-types";

export interface StreamingAccumulator {
  content: string;
  toolCallsMap: Map<number, { id: string; name: string; argumentsStr: string }>;
}

export function createStreamingAccumulator(): StreamingAccumulator {
  return {
    content: "",
    toolCallsMap: new Map(),
  };
}

export function processSseChunk(
  chunkText: string,
  acc: StreamingAccumulator,
  onDeltaText?: (delta: string) => void,
): void {
  const lines = chunkText.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || !line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload === "[DONE]") continue;

    try {
      const data = JSON.parse(payload);
      const choice = data.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta;
      if (!delta) continue;

      // 1. Text delta
      if (typeof delta.content === "string" && delta.content.length > 0) {
        acc.content += delta.content;
        onDeltaText?.(delta.content);
      }

      // 2. Tool Calls delta
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = typeof tc.index === "number" ? tc.index : 0;
          let entry = acc.toolCallsMap.get(idx);
          if (!entry) {
            entry = {
              id: tc.id || `call_${Date.now()}_${idx}`,
              name: tc.function?.name || "",
              argumentsStr: "",
            };
            acc.toolCallsMap.set(idx, entry);
          } else {
            if (tc.id && !entry.id) entry.id = tc.id;
            if (tc.function?.name && !entry.name) entry.name = tc.function.name;
          }

          if (tc.function?.arguments) {
            entry.argumentsStr += tc.function.arguments;
          }
        }
      }
    } catch {}
  }
}

export function finalizeAccumulator(acc: StreamingAccumulator): {
  content: string;
  toolCalls?: ToolCall[];
} {
  let toolCalls: ToolCall[] | undefined = undefined;
  if (acc.toolCallsMap.size > 0) {
    toolCalls = [];
    for (const entry of acc.toolCallsMap.values()) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(entry.argumentsStr || "{}");
      } catch {
        args = { raw: entry.argumentsStr };
      }
      toolCalls.push({
        id: entry.id,
        name: entry.name,
        arguments: args,
      });
    }
  }

  return {
    content: acc.content,
    toolCalls,
  };
}
