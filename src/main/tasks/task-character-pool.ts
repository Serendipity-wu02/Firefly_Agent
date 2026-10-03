import { TASK_CHARACTERS } from "../../shared/task-characters";
import { SPECIALIST_AGENTS } from "../../shared/specialist-agents";

export { TASK_CHARACTERS } from "../../shared/task-characters";

export function getTaskCompanionNames(): readonly string[] {
  return TASK_CHARACTERS.map((character) => character.nickname);
}

export function buildTaskCompanionPrompt(mode: "work" | "code" = "work"): string {
  const names = SPECIALIST_AGENTS.filter(agent => agent.supportedModes.includes(mode))
    .map(agent => `${agent.id}（${agent.nickname}）：${agent.role}`);
  return names.length === 0
    ? ""
    : [
      `当前模式的专业 Agent：${names.join("；")}。`,
      "仅在工具可用时由主 Agent 调用 delegate_agent，参数只有 agent_id 和 prompt。角色不授予权限，工具与 Skills 必须在父运行授权范围内。",
      "子 Agent 不得再次委派、询问用户或确认父级副作用；不要编造角色与当前用户的共同经历。",
    ].join("\n");
}

export interface TaskCharacterLease {
  nickname: string;
  assetFileName: string;
  release(): void;
}

/** Main-owned, per-conversation active character leases. */
export class TaskCharacterLeasePool {
  private readonly activeByConversation = new Map<string, Set<string>>();

  acquire(conversationId: string, nickname: string): TaskCharacterLease {
    const active = this.activeByConversation.get(conversationId) ?? new Set<string>();
    const selected = TASK_CHARACTERS.find((character) => character.nickname === nickname);
    if (!selected) throw new Error("TASK_COMPANION_UNKNOWN");
    if (active.has(selected.nickname)) throw new Error("TASK_COMPANION_BUSY");

    active.add(selected.nickname);
    this.activeByConversation.set(conversationId, active);
    let released = false;
    return {
      nickname: selected.nickname,
      assetFileName: selected.assetFileName,
      release: () => {
        if (released) return;
        released = true;
        active.delete(selected.nickname);
        if (active.size === 0) this.activeByConversation.delete(conversationId);
      },
    };
  }
}

export const taskCharacterLeasePool = new TaskCharacterLeasePool();
