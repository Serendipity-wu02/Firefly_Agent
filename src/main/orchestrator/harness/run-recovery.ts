import type { ChatMessage, ToolCall } from "../vendors/types";
import { parseToolCallArgs, toolCallFingerprint, type AgentState, type HarnessCacheState } from "./types";
import type { HarnessRunSession } from "./run-store";

export interface HarnessRecoveryEnvironment {
  workspaceRoot?: string;
  provider?: string;
  model?: string;
  enabledToolIds?: string[];
}

export interface PreparedHarnessRecovery {
  messages: ChatMessage[];
  state: AgentState;
  cache: HarnessCacheState;
  recoveryContext: string;
}

/**
 * Repairs an incomplete provider transcript without pretending an interrupted tool succeeded.
 * It is intentionally pure: callers decide whether the user explicitly asked to continue.
 */
export function prepareHarnessRecovery(
  session: HarnessRunSession,
  environment: HarnessRecoveryEnvironment,
): PreparedHarnessRecovery {
  if (session.status !== "interrupted") throw new Error("HARNESS_RECOVERY_NOT_INTERRUPTED");
  if (session.request.workspaceRoot && environment.workspaceRoot !== session.request.workspaceRoot) {
    throw new Error("HARNESS_RECOVERY_WORKSPACE_MISMATCH");
  }

  const messages = JSON.parse(JSON.stringify(session.messages)) as ChatMessage[];
  const state = JSON.parse(JSON.stringify(session.state)) as AgentState;
  const resolvedCallIds = new Set(messages.flatMap((message) => message.role === "tool" && message.toolCallId ? [message.toolCallId] : []));
  const callById = new Map<string, ToolCall>();
  for (const message of messages) {
    for (const call of message.toolCalls ?? []) callById.set(call.id, call);
  }

  const persistedById = new Map(session.toolCalls.map(call => [call.toolCallId, call]));
  for (const call of callById.values()) {
    if (resolvedCallIds.has(call.id)) continue;
    const persisted = persistedById.get(call.id);
    // Match canonical materialization: queued/planned is not dispatched, irrespective
    // of side-effect category. A started/unknown invocation has no confirmed result.
    const isUnknown = persisted?.status === "started" || persisted?.status === "unknown";
    if (isUnknown && persisted?.sideEffect !== "read_only") {
      const args = parseToolCallArgs(call);
      const fingerprint = toolCallFingerprint(call.name, args);
      if (!state.uncertainEffects.some((effect) => effect.toolCallId === call.id)) {
        state.uncertainEffects.push({
          id: `${session.runId}:${call.id}`,
          toolCallId: call.id,
          fingerprint,
          toolName: call.name,
          message: "该外部副作用在应用中断时尚未确认结果",
        });
      }
    }
    messages.push({
      role: "tool",
      toolCallId: call.id,
      content: JSON.stringify({
        outcome: isUnknown ? "unknown_after_interruption" : "not_executed_after_interruption",
        tool: call.name,
        message: isUnknown
          ? "应用在该副作用完成前中断；不得自动重放，先查证或询问用户。"
          : "应用在工具执行完成前中断；请根据当前任务自行决定是否重新读取。",
      }),
    });
  }

  const differences: string[] = [];
  if (environment.provider && environment.model
    && (environment.provider !== session.request.provider || environment.model !== session.request.model)) {
    differences.push(`模型已变化：原为 ${session.request.provider}/${session.request.model}，当前为 ${environment.provider}/${environment.model}。`);
  }
  if (environment.enabledToolIds && session.request.enabledToolIds) {
    const currentTools = new Set(environment.enabledToolIds);
    const missing = session.request.enabledToolIds.filter((id) => !currentTools.has(id));
    if (missing.length > 0) differences.push(`恢复时不可用的旧工具：${missing.join(", ")}。不得假装调用成功。`);
  }

  return {
    messages,
    state,
    cache: { cacheEpoch: session.cache.cacheEpoch + 1, epochReason: "recovery" },
    recoveryContext: [
      `这是从意外中断的运行 ${session.runId} 恢复的任务。`,
      `已完成轮数：${session.rounds}；Todo 是可变工作笔记，应据真实进展更新。`,
      "中断中的外部副作用已标为未知：不得自动重放，必须先查证、询问用户，或诚实说明无法确认。",
      ...differences,
    ].join("\n"),
  };
}
