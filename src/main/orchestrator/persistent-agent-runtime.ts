import type { AgentProfile } from "../../shared/agent-profile";
import type { TaskDelegationPresentation, TaskSessionStatus } from "../../shared/task-session";
import { AgentSessionRegistry } from "../tasks/agent-session-registry";
import { taskCharacterLeasePool, type TaskCharacterLeasePool } from "../tasks/task-character-pool";
import type { TaskSessionStore } from "../tasks/task-session-store";
import { resolveSpecialistModelProfile, type AgentModelRoutingSettings } from "../settings/agent-model-routing";
import { buildSkillCatalog, buildAutoInjectedSkillContext } from "../skills/skill-catalog";
import { skillRegistry } from "../skills/skill-registry";
import { resolveAgentCapabilities } from "./agent-capabilities";
import { runChildSession } from "./child-session-runtime";
import type { ChildSessionParent } from "./child-session-types";
import type { runFireflyHarness } from "./harness/firefly-harness";
import { createAbortError } from "../abort-utils";

export interface AgentExecuteRequest { agentId: string; prompt: string }
export interface AgentExecuteResult { agentId: string; sessionId: string; status: TaskSessionStatus; text: string }

export function createAgentExecutor(input: {
  parent: ChildSessionParent;
  store: TaskSessionStore;
  profiles: readonly AgentProfile[];
  modelSettings: AgentModelRoutingSettings;
  runHarness?: typeof runFireflyHarness;
  characterPool?: Pick<TaskCharacterLeasePool, "acquire">;
  onLifecycle?: (event: TaskDelegationPresentation) => void;
}): (request: AgentExecuteRequest) => Promise<AgentExecuteResult> {
  const registry = new AgentSessionRegistry(input.store);
  return async request => {
    if (input.parent.signal?.aborted) throw createAbortError();
    const profile = input.profiles.find(entry => entry.id === request.agentId);
    if (!profile) throw new Error("AGENT_NOT_FOUND");
    if (!request.prompt.trim()) throw new Error("AGENT_PROMPT_REQUIRED");
    const capabilities = resolveAgentCapabilities(profile, input.parent.mode, input.parent.tools, input.parent.capabilities?.skills ?? []);
    const skillBodies = new Map<string, string>();
    for (const skill of capabilities.skills) {
      if (!skill.enabled || skill.manifest?.autoInject !== true) continue;
      const body = skillRegistry.getBody(skill.id);
      if (!body?.trim()) throw new Error("AGENT_SKILL_BODY_UNAVAILABLE");
      skillBodies.set(skill.id, body);
    }
    const skillContext = buildAutoInjectedSkillContext([...capabilities.skills], id => skillBodies.get(id) ?? null);
    const model = resolveSpecialistModelProfile(input.modelSettings, profile.id, profile.modelProfile);
    const lease = (input.characterPool ?? taskCharacterLeasePool).acquire(input.parent.parentConversationId, profile.nickname);
    let session;
    try {
      session = registry.acquire({
        agentId: profile.id, modelProfile: profile.modelProfile, savedModelProfileId: model.id,
        parentConversationId: input.parent.parentConversationId, parentRunId: input.parent.parentRunId,
        mode: input.parent.mode, resolvedWorkspaceRoot: input.parent.resolvedWorkspaceRoot ?? "",
        description: profile.role, prompt: request.prompt,
      });
    } catch (error) {
      lease.release();
      throw error;
    }
    const result = await runChildSession({
      ...input, session, lease, prompt: request.prompt, description: profile.role,
      systemPrompt: [profile.systemPrompt, buildSkillCatalog([...capabilities.skills]), skillContext].filter(Boolean).join("\n\n"),
      tools: [...capabilities.tools],
      config: { totalTimeoutMs: profile.timeoutMs, ...(model.contextWindowTokens ? { contextWindowTokens: model.contextWindowTokens } : {}) },
      parent: {
        ...input.parent, capabilities, includeInteractiveTools: false,
        vendorConfig: { provider: model.provider, baseUrl: model.baseUrl, model: model.model,
          apiKey: model.apiKey, explicitTransport: model.explicitTransport, reasoning: model.reasoning },
      },
    });
    return { agentId: profile.id, sessionId: result.taskId, status: result.status, text: result.text };
  };
}
