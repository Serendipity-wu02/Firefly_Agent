import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentProfile } from "../../shared/agent-profile";
import { TaskSessionStore } from "../tasks/task-session-store";
import { createAgentExecutor } from "./persistent-agent-runtime";
import type { HarnessInput, HarnessResult } from "./harness/types";
import type { TaskRuntimeParentContext } from "./task-runtime";
import type { ToolDefinition } from "./tools/registry/tool-registry";
import type { SkillEntry } from "../skills/types";
import { skillRegistry } from "../skills/skill-registry";
import { FileToolOutputStore } from "./harness/tool-output/file-tool-output-store";
import { dispatchToolCall } from "./harness/tool-dispatcher";
import { createTaskExecutor } from "./task-runtime";

const roots: string[] = [];
const profile: AgentProfile = {
  id: "test-agent", nickname: "艾利欧", role: "Test review", systemPrompt: "Fixture specialist identity",
  modelProfile: "coding", allowedTools: ["read_file"], allowedSkills: [], supportedModes: ["code"],
  persistent: true, timeoutMs: 0, concurrency: 1,
};
const models = {
  modelProfiles: [{ id: "saved-code", provider: "fixture", baseUrl: "http://127.0.0.1:12345", model: "fixture-model", apiKey: "", contextWindowTokens: 64000 }],
  agentModelProfiles: { coding: "saved-code" },
};
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-persistent-agent-"));
  roots.push(root);
  const read: ToolDefinition = { id: "read_file", name: "read", description: "fixture", enabled: true,
    inputSchema: { type: "object", properties: {} }, execute: async () => "fixture", effectKind: "read" };
  const parent: TaskRuntimeParentContext = {
    parentConversationId: "conversation", parentRunId: "run", mode: "code", systemPrompt: "parent persona",
    vendorConfig: { provider: "fixture", model: "parent-model", baseUrl: "http://127.0.0.1:12345", apiKey: "" },
    tools: [read], resolvedWorkspaceRoot: root, checkPermission: vi.fn(async () => false), includeInteractiveTools: false,
  };
  return { store: new TaskSessionStore(root), parent, read };
}
function complete(input: HarnessInput): Promise<HarnessResult> {
  const state = { todoItems: [], uncertainEffects: [] };
  input.onCheckpoint?.({ messages: [...input.messages, { role: "assistant", content: "fixture result" }], state,
    toolOutputs: [], rounds: 1, cache: { cacheEpoch: 1, epochReason: "run_start" }, at: 1 });
  return Promise.resolve({ finalAnswer: "fixture result", finalState: state, terminated: false,
    rounds: 1, terminal: { status: "success", externalEffectsMayContinue: false } });
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe("persistent specialist runtime", () => {
  it("isolates real dispatched results by persistent owner across workspaces and resumes", async () => {
    const { store, parent, read } = setup();
    const outputs = new FileToolOutputStore(parent.resolvedWorkspaceRoot!);
    const contexts: NonNullable<HarnessInput["toolContext"]>[] = [];
    const refs: string[] = [];
    const runHarness = async (input: HarnessInput) => {
      contexts.push(input.toolContext!);
      const result = await dispatchToolCall({ id: "owned-read", name: read.id,
        arguments: JSON.stringify({ ownerSessionId: "forged-owner" }) }, {
        state: { todoItems: [], uncertainEffects: [] }, tools: input.tools,
        toolContext: input.toolContext, toolOutputStore: input.toolOutputStore,
      });
      refs.push(result.fullOutputRef!);
      return complete(input);
    };
    const firstExecutor = createAgentExecutor({ store, parent: { ...parent, toolOutputStore: outputs },
      profiles: [profile], modelSettings: models, runHarness });
    const first = await firstExecutor({ agentId: profile.id, prompt: "first" });
    const sibling = { ...profile, id: "second-agent" };
    const second = await createAgentExecutor({ store,
      parent: { ...parent, resolvedWorkspaceRoot: path.join(parent.resolvedWorkspaceRoot!, "other"), toolOutputStore: outputs },
      profiles: [sibling], modelSettings: models, runHarness })({ agentId: sibling.id, prompt: "second" });
    await firstExecutor({ agentId: profile.id, prompt: "resume" });
    expect(contexts[0].conversationId).toBe(parent.parentConversationId);
    expect(contexts[0].ownerSessionId).toBe(first.sessionId);
    expect(contexts[1].ownerSessionId).toBe(second.sessionId);
    expect(contexts[2].ownerSessionId).toBe(first.sessionId);
    expect(contexts[2].runId).not.toBe(contexts[0].runId);
    const fetch = (context: NonNullable<HarnessInput["toolContext"]>, resultRef: string, query?: string) =>
      dispatchToolCall({ id: "fetch", name: "read_tool_result", arguments: JSON.stringify({
        result_ref: resultRef, query, ownerSessionId: first.sessionId,
      }) }, { state: { todoItems: [], uncertainEffects: [] }, tools: [], toolContext: context, toolOutputStore: outputs });
    for (const query of [undefined, "fixture"]) {
      expect(await fetch(contexts[2], refs[0], query)).toMatchObject({ outcome: "success" });
      expect(await fetch(contexts[1], refs[0], query)).toMatchObject({ outcome: "failure", category: "not_found" });
      expect(await fetch(contexts[0], refs[1], query)).toMatchObject({ outcome: "failure", category: "not_found" });
      expect(await fetch({ userQuery: "", conversationId: parent.parentConversationId }, refs[0], query))
        .toMatchObject({ outcome: "success" });
    }
    await createTaskExecutor({ store, parent: { ...parent, toolOutputStore: outputs }, runHarness })({
      description: "legacy scope", prompt: "legacy", subagentType: "general",
    });
    expect(contexts[3].ownerSessionId).toBeUndefined();
    expect(contexts[3].conversationId).toBe(parent.parentConversationId);
    for (const query of [undefined, "fixture"]) {
      expect(await fetch(contexts[3], refs[0], query)).toMatchObject({ outcome: "success" });
      expect(await fetch(contexts[3], refs[3], query)).toMatchObject({ outcome: "success" });
      expect(await fetch(contexts[2], refs[3], query)).toMatchObject({ outcome: "failure", category: "not_found" });
    }
    await outputs.deleteConversation(parent.parentConversationId);
    for (const ref of refs) expect(await fetch(contexts[3], ref)).toMatchObject({ outcome: "failure", category: "not_found" });
  });
  it("does not append a prompt or invoke a child after parent cancellation", async () => {
    const { store, parent } = setup();
    const controller = new AbortController();
    controller.abort();
    const runHarness = vi.fn(complete);
    const execute = createAgentExecutor({ parent: { ...parent, signal: controller.signal }, store,
      profiles: [profile], modelSettings: models, runHarness });
    await expect(execute({ agentId: profile.id, prompt: "fixture" })).rejects.toMatchObject({ name: "AbortError" });
    expect(runHarness).not.toHaveBeenCalled();
    expect(store.listForParent(parent.parentConversationId)).toEqual([]);
  });
  it("injects only authorized automatic Skill bodies and inherits confirmed read scopes", async () => {
    const { store, parent, read } = setup();
    const skill: SkillEntry = {
      id: "fixture-auto", name: "fixture-auto", description: "fixture", enabled: true, source: "user",
      dirPath: parent.resolvedWorkspaceRoot!, bodyPath: path.join(parent.resolvedWorkspaceRoot!, "SKILL.md"), references: [],
      modes: ["code"], effectKind: "read",
      manifest: { id: "fixture-auto", version: "1.0.0", defaultEnabled: true, entry: "", dependencies: [], autoInject: true },
    };
    fs.writeFileSync(skill.bodyPath, "---\nname: fixture-auto\ndescription: fixture\n---\nAuthorized fixture rules");
    skillRegistry.register(skill);
    const runHarness = vi.fn(complete);
    const scopes = [{ name: "fixture", path: path.join(parent.resolvedWorkspaceRoot!, "public.txt"), sha256: "a".repeat(64), totalLines: 10, endLine: 2, partialAccepted: true }];
    try {
      const execute = createAgentExecutor({ store, parent: { ...parent, workReadScopes: scopes,
        capabilities: { mode: "code", tools: [read], toolIds: new Set([read.id]), skills: [skill], skillIds: new Set([skill.id]) } },
        profiles: [{ ...profile, allowedSkills: [skill.id] }], modelSettings: models, runHarness });
      await execute({ agentId: profile.id, prompt: "fixture" });
      expect(runHarness.mock.calls[0][0].systemPrompt).toContain("Authorized fixture rules");
      expect(runHarness.mock.calls[0][0].toolContext?.workReadScopes).toEqual(scopes);
      expect(runHarness.mock.calls[0][0].allowedBuiltinToolIds).toEqual(new Set(["update_todo", "read_tool_result"]));
    } finally {
      skillRegistry.unregister(skill.id);
    }
  });
  it("reuses one private transcript and selected model while inheriting permission boundaries", async () => {
    const { store, parent, read } = setup();
    const runHarness = vi.fn(complete);
    const lifecycle = vi.fn();
    const execute = createAgentExecutor({ parent, store, profiles: [profile], modelSettings: models, runHarness, onLifecycle: lifecycle });
    const first = await execute({ agentId: profile.id, prompt: "Inspect fixture" });
    const second = await execute({ agentId: profile.id, prompt: "Continue inspection" });
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.agentId).toBe(profile.id);
    expect(store.listForParent(parent.parentConversationId)).toHaveLength(1);
    expect(runHarness.mock.calls[1][0].messages.map(message => message.content))
      .toEqual(["Inspect fixture", "fixture result", "Continue inspection"]);
    expect(runHarness).toHaveBeenCalledWith(expect.objectContaining({
      tools: [read], vendorConfig: expect.objectContaining({ model: "fixture-model" }),
      config: expect.objectContaining({ contextWindowTokens: 64000 }),
      checkPermission: parent.checkPermission, includeInteractiveTools: false,
      toolContext: expect.objectContaining({ allowedSkillIds: new Set() }),
    }));
    expect(runHarness.mock.calls[0][0].systemPrompt).not.toContain("parent persona");
    expect(runHarness.mock.calls[0][0].taskExecutor).toBeUndefined();
    expect(lifecycle.mock.calls.map(([event]) => event.status)).toEqual(["running", "completed", "running", "completed"]);
  });

  it("rejects unknown agents and absent model routes before persistence or Harness execution", async () => {
    const { store, parent } = setup();
    const runHarness = vi.fn(complete);
    const execute = createAgentExecutor({ parent, store, profiles: [profile], modelSettings: {}, runHarness });
    await expect(execute({ agentId: "missing", prompt: "fixture" })).rejects.toThrow("AGENT_NOT_FOUND");
    await expect(execute({ agentId: profile.id, prompt: "fixture" })).rejects.toThrow("AGENT_MODEL_ROUTE_UNCONFIGURED");
    expect(runHarness).not.toHaveBeenCalled();
    expect(store.listForParent(parent.parentConversationId)).toEqual([]);
  });

  it("inherits cancellation and releases the character lease after a cancelled run", async () => {
    const { store, parent } = setup();
    const controller = new AbortController();
    const cancelled = vi.fn(async (input: HarnessInput): Promise<HarnessResult> => {
      expect(input.signal).toBe(controller.signal);
      controller.abort();
      return { finalAnswer: "", finalState: { todoItems: [], uncertainEffects: [] }, terminated: false,
        rounds: 0, terminal: { status: "cancelled", externalEffectsMayContinue: false } };
    });
    const execute = createAgentExecutor({ parent: { ...parent, signal: controller.signal }, store,
      profiles: [profile], modelSettings: models, runHarness: cancelled });
    const first = await execute({ agentId: profile.id, prompt: "fixture" });
    expect(first.status).toBe("cancelled");
    const next = createAgentExecutor({ parent, store, profiles: [profile], modelSettings: models, runHarness: complete });
    expect((await next({ agentId: profile.id, prompt: "resume fixture" })).status).toBe("completed");
  });
});
