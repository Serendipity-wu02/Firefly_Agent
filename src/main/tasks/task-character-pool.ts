import { TASK_CHARACTERS } from "../../shared/task-characters";

export { TASK_CHARACTERS } from "../../shared/task-characters";

export function getTaskCompanionNames(): readonly string[] {
  return TASK_CHARACTERS.map((character) => character.nickname);
}

export function buildTaskCompanionPrompt(): string {
  const names = getTaskCompanionNames();
  return names.length === 0
    ? ""
    : [
      `可选的子任务展示角色：${names.join("、")}。`,
      "task 的 subagent_type 决定执行职责与工具范围；companion_id 只选择展示角色，不改变权限、任务路由或子任务人设。",
      "未指定展示角色时可以省略 companion_id；不要为这些角色编造专属经历或能力。",
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
