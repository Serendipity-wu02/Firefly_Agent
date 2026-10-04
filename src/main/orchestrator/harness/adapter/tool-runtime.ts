import { app } from "electron";
import type { BaseEvent } from "@ag-ui/core";
import type { ToolDefinition } from "../../tools/registry/tool-registry";
import { toolRegistry } from "../../tools/registry/tool-registry";
import { checkPermission, getCurrentLevel, type ToolRiskLevel } from "../../../permission";
import { policyFor } from "../../../permission-policy";
import { isPlanReadOnly } from "../../plan-mode";
import { contextRefRegistry, extractLastUserQuery, type ToolContext } from "../../tools/registry/tool-context";
import type { HarnessInput } from "../index";
import { getTaskSessionStore } from "../../../tasks/task-session-store";
import { createAgentExecutor } from "../../persistent-agent-runtime";
import { createSpecialistProfiles } from "../../specialist-profiles";
import { loadModelSettings } from "../../../settings/model-settings";
import { FileToolOutputStore } from "../tool-output/file-tool-output-store";
import { sendTaskLifecycleAsAgui } from "./event-mapper";
import type { PreparedHarnessRun } from "./run-preparation";
import type { FireflyRunOptions } from "../../firefly-agent";

/**
 * 为一次 Harness run 构造工具运行时（tool runtime）。
 * signal、runId 和 permissionCheck 从父 run 原样下传，避免子任务或权限检查产生第二套生命周期。
 */
export interface PreparedToolRuntime {
  toolContext: ToolContext;
  checkPermission: NonNullable<HarnessInput["checkPermission"]>;
  toolOutputStore: FileToolOutputStore;
  agentExecutor: HarnessInput["agentExecutor"];
  agentDefinitions: HarnessInput["agentDefinitions"];
}

export function prepareToolRuntime(input: {
  options: FireflyRunOptions;
  signal: AbortSignal;
  prepared: PreparedHarnessRun;
  sendBaseEvent: (event: BaseEvent) => void;
}): PreparedToolRuntime {
  const { options, signal, prepared } = input;
  const { threadId, runId, systemPrompt, vendorConfig, tools } = prepared;
  // 会话权限由可信设置捕获一次；随后全局档位只能进一步限制，不能扩大该快照。
  const fileAccessLevel = options.permissionMode === "allow_all" ? "full" : getCurrentLevel();
  const permissionCheck: NonNullable<HarnessInput["checkPermission"]> = async (
    toolId: string,
    args: Record<string, unknown>,
  ): Promise<boolean> => {
    const tool = toolRegistry.getById(toolId);
    if (!tool) return false;
    const risk: ToolRiskLevel = (tool as ToolDefinition & { risk?: ToolRiskLevel }).risk ?? "safe";
    const blockedByPlan = (): boolean => isPlanReadOnly(threadId)
      && (risk === "shell" || policyFor("read-only", risk) !== "allow");
    // 计划限制先于显式免审批授权，并使用父会话实时状态，覆盖会话中途进入计划模式。
    if (blockedByPlan()) {
      console.log(`[HarnessAdapter] [Plan] read-only enforcement blocked tool=${toolId} risk=${risk}`);
      return false;
    }
    if (policyFor(fileAccessLevel, risk) === "deny") return false;
    if (options.permissionMode === "allow_all") return true;
    const decision = await checkPermission({
      toolId,
      toolName: tool.name,
      toolDescription: tool.description,
      args,
      risk,
      runId,
      signal,
      level: fileAccessLevel,
    });
    // 等待用户审批期间也可能进入计划讨论，批准单次工具不能解除计划限制。
    return decision.allowed && !blockedByPlan();
  };

  const toolContext: ToolContext = {
    userQuery: extractLastUserQuery(options.messages),
    conversationId: options.conversationId ?? "default",
    runId,
    contextRefs: contextRefRegistry,
    signal,
    resolvedWorkspaceRoot: options.resolvedWorkspaceRoot,
    mode: options.conversationMode,
    workReadScopes: options.workReadScopes,
    allowedSkillIds: options.capabilities?.skillIds,
    permissionMode: options.permissionMode,
    fileAccessLevel,
  };
  const toolOutputStore = new FileToolOutputStore(app.getPath("userData"));
  // 只有 work/code 模式允许派生任务；chat 模式不创建 TaskSession，避免出现不可见的后台执行。
  const profiles = createSpecialistProfiles(options.conversationMode ?? "chat", tools, options.capabilities?.skills ?? []);
  const agentExecutor = options.conversationMode === "work" || options.conversationMode === "code"
    ? createAgentExecutor({
      profiles,
      modelSettings: loadModelSettings(),
      parent: {
        parentConversationId: threadId,
        parentRunId: runId,
        mode: options.conversationMode,
        capabilities: options.capabilities,
        systemPrompt,
        vendorConfig,
        tools,
        resolvedWorkspaceRoot: options.resolvedWorkspaceRoot,
        signal,
        checkPermission: permissionCheck,
        includeInteractiveTools: options.harnessInteractiveTools,
        permissionMode: options.permissionMode,
        fileAccessLevel,
        toolOutputStore,
        workReadScopes: options.workReadScopes,
      },
      store: getTaskSessionStore(app.getPath("userData")),
      onLifecycle: (event) => sendTaskLifecycleAsAgui(event, threadId, runId, input.sendBaseEvent),
    })
    : undefined;

  return { toolContext, checkPermission: permissionCheck, toolOutputStore, agentExecutor,
    agentDefinitions: profiles.map(({ id, nickname, description }) => ({ id, nickname, description })) };
}
