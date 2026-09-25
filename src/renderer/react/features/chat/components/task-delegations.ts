import type { TaskDelegationDisplayRecord } from "../../../../../shared/chat-types";
import type { TaskDelegationPresentation } from "../../../../../shared/task-session";
import { TASK_CHARACTERS } from "../../../../../shared/task-characters";

export function normalizeTaskDelegationEvent(value: unknown): TaskDelegationPresentation | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const event = value as Partial<TaskDelegationPresentation>;
  if (typeof event.invocationId !== "string" || !event.invocationId
    || typeof event.taskId !== "string" || !event.taskId
    || typeof event.description !== "string" || !event.description.trim()
    || typeof event.nickname !== "string"
    || typeof event.assetFileName !== "string"
    || !TASK_CHARACTERS.some((character) => character.nickname === event.nickname && character.assetFileName === event.assetFileName)
    || (event.status !== "running" && event.status !== "completed" && event.status !== "failed" && event.status !== "cancelled")) return undefined;
  return {
    invocationId: event.invocationId,
    taskId: event.taskId,
    description: event.description.trim(),
    nickname: event.nickname,
    assetFileName: event.assetFileName,
    status: event.status,
  };
}

export function applyTaskDelegationEvent(
  records: readonly TaskDelegationDisplayRecord[],
  event: TaskDelegationPresentation,
  roundId?: string,
): TaskDelegationDisplayRecord[] {
  const index = records.findIndex((record) => record.invocationId === event.invocationId);
  if (index < 0) return [...records, { ...event, roundId }];
  return records.map((record, recordIndex) => recordIndex === index
    ? { ...record, ...event, roundId: record.roundId ?? roundId }
    : record);
}
