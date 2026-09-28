import type { TaskSessionStatus, TaskSubagentType } from "../../shared/task-session";
import { TaskSessionStore } from "../tasks/task-session-store";
import { getTaskAgentProfile, resolveTaskTools } from "./task-profiles";
import { runFireflyHarness } from "./harness/firefly-harness";
import type { HarnessInput } from "./harness/types";
import type { ToolDefinition } from "./tools/registry/tool-registry";
import type { VendorConfig } from "./vendors/types";
import { runChildSession } from "./child-session-runtime";
import { taskCharacterLeasePool, type TaskCharacterLeasePool } from "../tasks/task-character-pool";
import type { TaskDelegationPresentation } from "../../shared/task-session";
import type { RunCapabilities } from "./run-capabilities";
import type { ToolOutputStore } from "./harness/tool-output/tool-output-store";
export { buildChildPromptLayers } from "./child-session-runtime";

export interface TaskExecuteRequest {
  description: string;
  prompt: string;
  subagentType: TaskSubagentType;
  companionId?: string;
  taskId?: string;
}

export interface TaskExecuteResult {
  taskId: string;
  status: TaskSessionStatus;
  text: string;
}

export interface TaskRuntimeParentContext {
  parentConversationId: string;
  parentRunId: string;
  mode: "work" | "code";
  systemPrompt: string;
  vendorConfig: VendorConfig;
  tools: ToolDefinition[];
  capabilities?: RunCapabilities;
  resolvedWorkspaceRoot?: string;
  signal?: AbortSignal;
  checkPermission?: HarnessInput["checkPermission"];
  includeInteractiveTools?: boolean;
  permissionMode?: import("./firefly-agent").FireflyRunOptions["permissionMode"];
  toolOutputStore?: ToolOutputStore;
  workReadScopes?: import("../../shared/chat-types").WorkReadScope[];
}

export function createTaskExecutor(input: {
  parent: TaskRuntimeParentContext;
  store: TaskSessionStore;
  runHarness?: typeof runFireflyHarness;
  characterPool?: Pick<TaskCharacterLeasePool, "acquire">;
  onLifecycle?: (event: TaskDelegationPresentation) => void;
}): (request: TaskExecuteRequest) => Promise<TaskExecuteResult> {
  const runHarness = input.runHarness ?? runFireflyHarness;
  const characterPool = input.characterPool ?? taskCharacterLeasePool;
  return async (request) => {
    const profile = getTaskAgentProfile(request.subagentType);
    const lease = request.companionId
      ? characterPool.acquire(input.parent.parentConversationId, request.companionId)
      : null;
    let session: ReturnType<TaskSessionStore["create"]>;
    try {
      session = request.taskId
        ? input.store.resume(request.taskId, {
            parentConversationId: input.parent.parentConversationId,
            parentRunId: input.parent.parentRunId,
            subagentType: request.subagentType,
            prompt: request.prompt,
            mode: input.parent.mode,
            resolvedWorkspaceRoot: input.parent.resolvedWorkspaceRoot,
          })
        : input.store.create({
            parentConversationId: input.parent.parentConversationId,
            parentRunId: input.parent.parentRunId,
            description: request.description,
            prompt: request.prompt,
            subagentType: request.subagentType,
            mode: input.parent.mode,
            resolvedWorkspaceRoot: input.parent.resolvedWorkspaceRoot,
          });
    } catch (error) {
      lease?.release();
      throw error;
    }

    return runChildSession({
      ...input, session, lease, runHarness,
      prompt: request.prompt, description: request.description, systemPrompt: profile.systemPrompt,
      tools: resolveTaskTools(profile, input.parent.tools), config: { totalTimeoutMs: profile.timeoutMs },
    });
  };
}
