import type { TaskSession, TaskDelegationPresentation, TaskTranscriptMessage } from "../../shared/task-session";
import type { TaskSessionStore } from "../tasks/task-session-store";
import type { TaskCharacterLease } from "../tasks/task-character-pool";
import type { TaskExecuteResult, TaskRuntimeParentContext } from "./task-runtime";
import type { ToolDefinition } from "./tools/registry/tool-registry";
import type { ToolContext } from "./tools/registry/tool-context";
import type { HarnessConfig, HarnessResult } from "./harness/types";
import type { ChatMessage } from "./vendors/types";
import { runFireflyHarness } from "./harness/firefly-harness";
import { projectTaskTraceEvent } from "./task-events";
import type { PromptLayers } from "./prompt-layers";

export function buildChildPromptLayers(parent: TaskRuntimeParentContext, profilePrompt: string): PromptLayers {
  const workspace = parent.resolvedWorkspaceRoot
    ? `可信工作目录：${parent.resolvedWorkspaceRoot}`
    : "当前没有绑定工作目录。";
  return {
    stablePrefix: profilePrompt,
    sessionPrefix: `${workspace}\n会话模式：${parent.mode}`,
    mode: parent.mode,
  };
}

export async function runChildSession(input: {
  parent: TaskRuntimeParentContext;
  store: TaskSessionStore;
  session: TaskSession;
  prompt: string;
  description: string;
  systemPrompt: string;
  tools: ToolDefinition[];
  config: Partial<HarnessConfig>;
  lease: TaskCharacterLease | null;
  runHarness?: typeof runFireflyHarness;
  onLifecycle?: (event: TaskDelegationPresentation) => void;
}): Promise<TaskExecuteResult> {
  const { parent, store, session, lease } = input;
  const toolContext: ToolContext = {
    userQuery: input.prompt, conversationId: parent.parentConversationId, runId: session.childRunId,
    ...(session.schemaVersion === 2 ? { ownerSessionId: session.id } : {}),
    signal: parent.signal, resolvedWorkspaceRoot: parent.resolvedWorkspaceRoot, mode: parent.mode,
    allowedSkillIds: parent.capabilities?.skillIds, permissionMode: parent.permissionMode,
    workReadScopes: parent.workReadScopes,
  };
  const presentation = lease ? {
    invocationId: session.childRunId, taskId: session.id, description: input.description,
    nickname: lease.nickname, assetFileName: lease.assetFileName,
  } : null;
  try {
    if (presentation) input.onLifecycle?.({ ...presentation, status: "running" });
    const promptLayers = buildChildPromptLayers(parent, input.systemPrompt);
    const result = await (input.runHarness ?? runFireflyHarness)({
      runId: session.childRunId, systemPrompt: promptLayers.stablePrefix, promptLayers,
      messages: session.messages as ChatMessage[], tools: input.tools, vendorConfig: parent.vendorConfig,
      config: input.config, initialState: { todoItems: session.todoItems, uncertainEffects: session.uncertainEffects ?? [] },
      signal: parent.signal, toolContext, toolOutputStore: parent.toolOutputStore,
      checkPermission: parent.checkPermission, includeInteractiveTools: parent.includeInteractiveTools,
      allowedBuiltinToolIds: new Set(["update_todo", "read_tool_result"]),
      onEvent: event => {
        const trace = projectTaskTraceEvent(event);
        if (trace) {
          const current = store.get(session.id);
          if (current) store.checkpoint(session.id, { trace: [...current.trace, trace] });
        }
      },
      onCheckpoint: checkpoint => {
        store.checkpoint(session.id, {
          messages: checkpoint.messages as TaskTranscriptMessage[], todoItems: checkpoint.state.todoItems,
          uncertainEffects: checkpoint.state.uncertainEffects,
        });
      },
    });
    const mapped = taskStatus(result);
    store.checkpoint(session.id, {
      status: mapped.status, resultText: result.finalAnswer, todoItems: result.finalState.todoItems,
      uncertainEffects: result.finalState.uncertainEffects, ...(mapped.error ? { error: mapped.error } : {}), completedAt: Date.now(),
    });
    if (presentation) input.onLifecycle?.({ ...presentation, status: mapped.status });
    return { taskId: session.id, status: mapped.status, text: result.finalAnswer };
  } catch (error) {
    const status = parent.signal?.aborted ? "cancelled" : "failed";
    store.checkpoint(session.id, {
      status, error: { code: status === "cancelled" ? "TASK_CANCELLED" : "TASK_RUNTIME_ERROR", message: error instanceof Error ? error.message : String(error) },
      completedAt: Date.now(),
    });
    if (presentation) input.onLifecycle?.({ ...presentation, status });
    throw error;
  } finally {
    lease?.release();
  }
}

function taskStatus(result: HarnessResult): { status: "completed" | "cancelled" | "failed"; error?: { code: string; message: string } } {
  const terminal = result.terminal?.status;
  if (terminal === "cancelled" || result.terminateReason === "cancelled") return { status: "cancelled" };
  if (terminal === "timeout" || result.terminateReason === "timeout") {
    return { status: "failed", error: { code: "TASK_TIMEOUT", message: "子任务超过执行时间上限" } };
  }
  if (terminal === "runtime_error" || result.terminateReason === "error") {
    return { status: "failed", error: { code: "TASK_RUNTIME_ERROR", message: result.finalAnswer || "子任务运行失败" } };
  }
  return { status: "completed" };
}
