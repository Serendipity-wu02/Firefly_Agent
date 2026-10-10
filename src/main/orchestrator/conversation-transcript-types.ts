/**
 * 会话轨迹协议类型（CTA Phase 1）。
 *
 * 只定义 JSONL 条目协议与校验规则，不做任何 I/O：
 * - 信封字段：seq / id / at / runId / turnId / revision / roundId；
 * - 载荷按 kind 判别：user / assistant / tool_result / interruption /
 *   turn_rewind / backfill_boundary / compaction_checkpoint；
 * - assistant 与 tool_result 原样复用 canonical ChatMessage，
 *   不得从展示事件或 preview 重建协议消息。
 */

import type { PendingChatAttachment } from "../../shared/chat-types";
import type { ToolCallOutcome } from "./harness/types";
import type { ChatMessage } from "./vendors/types";

export interface SAssistantBinding {
  runId: string;
  assistantTurnId: string;
  userTurnId: string;
  userRevision: number;
}
export interface SAssistantSettlementBinding extends SAssistantBinding {
  assistantEntryId: string;
}
export type SAssistantSettlementResult = "success" | "interrupted";
export interface SAssistantSettlementPayload {
  binding: SAssistantSettlementBinding;
  result: SAssistantSettlementResult;
  /** Main-owned reason code, never an exception body or model text. */
  safeReason: string;
}
function invalidSBinding(): never { throw Error("TRANSCRIPT_S_BINDING_INVALID"); }
function dataObject(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== fields.length)
    invalidSBinding();
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !("value" in descriptor))
      invalidSBinding();
    result[field] = descriptor.value;
  }
  return result;
}
function sId(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 1024 || /[\u0000-\u001f\u007f]/.test(value))
    invalidSBinding();
  return value;
}
function sRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    invalidSBinding();
  return value as number;
}
export function copySAssistantBinding(value: unknown): SAssistantBinding {
  const b = dataObject(value, ["runId", "assistantTurnId", "userTurnId", "userRevision"]);
  const result = {
    runId: sId(b.runId), assistantTurnId: sId(b.assistantTurnId),
    userTurnId: sId(b.userTurnId), userRevision: sRevision(b.userRevision),
  };
  if (result.assistantTurnId === result.userTurnId)
    invalidSBinding();
  return result;
}
export function copySAssistantSettlementBinding(value: unknown): SAssistantSettlementBinding {
  const b = dataObject(value, ["runId", "assistantTurnId", "userTurnId", "userRevision", "assistantEntryId"]);
  return {
    ...copySAssistantBinding({
      runId: b.runId, assistantTurnId: b.assistantTurnId,
      userTurnId: b.userTurnId, userRevision: b.userRevision,
    }),
    assistantEntryId: sId(b.assistantEntryId),
  };
}
export function copySAssistantMessage(value: unknown): ChatMessage {
  const m = dataObject(value, ["role", "content"]);
  if (m.role !== "assistant" || typeof m.content !== "string" || !m.content.trim() || Buffer.byteLength(m.content) > 8 * 1024 * 1024)
    invalidSBinding();
  return { role: "assistant", content: m.content };
}
export function copySAssistantSettlementPayload(value: unknown): SAssistantSettlementPayload {
  const p = dataObject(value, ["binding", "result", "safeReason"]);
  if (p.result !== "success" && p.result !== "interrupted")
    invalidSBinding();
  if (typeof p.safeReason !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,95}$/.test(p.safeReason))
    invalidSBinding();
  return { binding: copySAssistantSettlementBinding(p.binding), result: p.result, safeReason: p.safeReason };
}

export interface TranscriptEnvelopeBase {
  /** 会话内单调递增序号，快照/重放协议依据。 */
  seq: number;
  /** entryId，幂等主键。 */
  id: string;
  at: number;
  /** 产生该条目的 run。 */
  runId?: string;
  /** userTurnId / assistantTurnId。 */
  turnId?: string;
  /** user 条目修订号（编辑替换递增，初值 1；replace_user 行复用此字段表达替换条目的修订号）。 */
  revision?: number;
  /** Harness 主循环内的轮次（多轮工具）。 */
  roundId?: string;
}

export type TranscriptUserPayload = {
  text: string;
  attachments?: PendingChatAttachment[];
};

export type TranscriptEntry =
  | (TranscriptEnvelopeBase & { kind: "user"; payload: TranscriptUserPayload })
  | (TranscriptEnvelopeBase & { kind: "assistant"; payload: ChatMessage; sSettlement?: {version: 1; userTurnId: string; userRevision: number} })
  | (TranscriptEnvelopeBase & { kind: "assistant_settlement"; payload: SAssistantSettlementPayload })
  | (TranscriptEnvelopeBase & {
      kind: "tool_result";
      payload: {
        assistantEntryId: string;
        toolCallId: string;
        outcome: ToolCallOutcome;
        message: ChatMessage;
        fullRef?: string;
        fileRead?: { path: string; canonicalPath: string; sha256: string; startLine: number; endLine: number; totalLines: number };
      };
    })
  | (TranscriptEnvelopeBase & { kind: "interruption"; payload: { reason: "user_cancel" } })
  | (TranscriptEnvelopeBase & {
      kind: "turn_rewind";
      payload: {
        anchorUserTurnId: string;
        disposition: "keep_user" | "replace_user";
        reason: "edit" | "regenerate";
        replacementUser?: TranscriptUserPayload;
      };
    })
  | (TranscriptEnvelopeBase & { kind: "backfill_boundary"; payload: { note: string } })
  | (TranscriptEnvelopeBase & { kind: "compaction_checkpoint"; payload: { ref: string } });

/** Omit 不分发联合，这里手动分发以保留 kind 判别信息。 */
type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

/** 追加输入：不带 seq（由 store 在会话写队列内分配）。 */
export type TranscriptAppendInput = DistributiveOmit<TranscriptEntry, "seq">;

export interface TranscriptSnapshot {
  schemaVersion: 1;
  /** 快照覆盖进度：重放只取 seq > throughSeq 的 JSONL 增量。 */
  throughSeq: number;
  entries: TranscriptEntry[];
  /** 幂等索引：快照恢复后旧 entryId 重试仍可被识别。 */
  seenEntryIds: string[];
  seenUserRevisions: string[];
}

/** user 条目次级幂等键：(turnId, revision)。 */
export function userRevisionKey(turnId: string, revision: number): string {
  return `${turnId}\u0000${revision}`;
}

/** 追加前协议校验（fail-closed：非法草稿直接拒绝，不入队）。 */
export function assertValidTranscriptDraft(input: TranscriptAppendInput): void {
  if (input.kind === "assistant" && Object.hasOwn(input, "sSettlement")) {
    const mark = dataObject(input.sSettlement, ["version", "userTurnId", "userRevision"]);
    if (mark.version !== 1) invalidSBinding();
    copySAssistantBinding({
      runId: input.runId, assistantTurnId: input.turnId,
      userTurnId: mark.userTurnId, userRevision: mark.userRevision,
    });
    sId(input.id);
    copySAssistantMessage(input.payload);
    if (input.roundId !== "s-response") invalidSBinding();
  }
  if (input.kind === "assistant_settlement") {
    const p = copySAssistantSettlementPayload(input.payload);
    sId(input.id);
    if (input.runId !== p.binding.runId || input.turnId !== p.binding.assistantTurnId) invalidSBinding();
  }
  if (!input.id || input.id.includes("\n")) throw new Error("TRANSCRIPT_INVALID_ENTRY_ID");
  if (input.kind === "user" && (!input.turnId || !input.revision || input.revision < 1)) {
    throw new Error("TRANSCRIPT_INVALID_USER_REVISION");
  }
  if (
    input.kind === "turn_rewind" &&
    input.payload.disposition === "replace_user" &&
    (!input.payload.replacementUser || !input.turnId || !input.revision)
  ) {
    throw new Error("TRANSCRIPT_REPLACEMENT_REQUIRED");
  }
}
