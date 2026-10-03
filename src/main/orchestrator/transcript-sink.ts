/**
 * Run 级轨迹提交端（CTA Phase 1 Task 4）。
 *
 * 把 Harness / ChatLoop 的 canonical 消息按协议写入 ConversationTranscriptStore：
 * - appendAssistant：assistant 声明先于任何工具 dispatch 落盘（fail-closed 由调用方保证）；
 * - appendToolResult：canonical 工具结果在生命周期 committed 之前落盘；
 * - closeInterruption：取消时为 started / planned 工具补确定性闭合条目并写 interruption 边界；
 * - checkpoint：终态后刷新快照（失败上抛，由调用方降级为日志，不改 JSONL）。
 *
 * 幂等：所有 entryId 均由 (runId, 协议点) 确定性生成，
 * 不确定确认后的重试不会复制合成结果或边界。
 * 本文件只含类型与实现逻辑，无任何运行时依赖（store 由调用方注入）。
 */

import { TranscriptPersistenceError, type TranscriptAppendGuard } from "./conversation-transcript-store";
import {
  copySAssistantBinding, copySAssistantMessage, copySAssistantSettlementPayload,
  type SAssistantBinding, type SAssistantSettlementBinding,
  type SAssistantSettlementResult, type TranscriptAppendInput,
} from "./conversation-transcript-types";
import type { ConversationTranscriptStore } from "./conversation-transcript-store";
import type { HarnessRunSession } from "./harness/run-store";
import type { ToolCallOutcome } from "./harness/types";
import type { ChatMessage } from "./vendors/types";

/** 轨迹写入失败：failedKind 标记断裂的协议点，cause 保留原始错误。 */
export class TranscriptWriteError extends Error {
  constructor(
    public readonly failedKind: "assistant" | "tool_result" | "interruption",
    public readonly cause: unknown,
  ) {
    super(`${failedKind} 轨迹写入失败：${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "TranscriptWriteError";
  }
}

/** Run 绑定的轨迹提交端：一个 run 一个实例，entryId 全程确定性。 */
export interface TranscriptSink {
  appendSAssistant(input: {
    message: ChatMessage;
    binding: SAssistantBinding;
    guard?: TranscriptAppendGuard;
  }): Promise<string>;
  settleSAssistant(input: {
    binding: SAssistantSettlementBinding;
    result: SAssistantSettlementResult;
    safeReason: string;
    guard?: TranscriptAppendGuard;
  }): Promise<void>;
  /** 落盘一条 canonical assistant 消息，返回其 entryId（工具结果提交的锚点）。 */
  appendAssistant(input: { message: ChatMessage; roundId?: string;guard?:TranscriptAppendGuard }): Promise<string>;
  /** 落盘一条 canonical 工具结果消息（挂在所属 assistant 条目上）。 */
  appendToolResult(input: {
    assistantEntryId: string;
    message: ChatMessage;
    outcome: ToolCallOutcome;
    fullRef?: string;
    fileRead?: { path: string; canonicalPath: string; sha256: string; startLine: number; endLine: number; totalLines: number };
    roundId?: string;
  }): Promise<void>;
  /** 取消终态闭合：为 started / planned 工具补合成结果并写 interruption 边界。 */
  closeInterruption(input: {
    reason: "user_cancel";
    runSession: HarnessRunSession | null;
  }): Promise<void>;
  /** 快照检查点：只在快照写失败时 reject，永不改写 JSONL。 */
  checkpoint(): Promise<void>;
}

const bindings=new WeakMap<object,{store:ConversationTranscriptStore;conversationId:string;runId:string;assistantTurnId?:string}>();
export function requireTranscriptSinkBinding(sink:TranscriptSink,target:{conversationId:string;runId:string;assistantTurnId:string},store?:ConversationTranscriptStore):void {
 const binding=bindings.get(sink);if(!binding||(store!==undefined&&binding.store!==store)||binding.conversationId!==target.conversationId||binding.runId!==target.runId||binding.assistantTurnId!==target.assistantTurnId)throw Error("MEMORY_CONTEXT_STREAM_SINK_DENIED");
}

export function createTranscriptSink(input: {
  store: ConversationTranscriptStore;
  conversationId: string;
  runId: string;
  assistantTurnId?: string;
}): TranscriptSink {
  const { store, conversationId, runId, assistantTurnId } = input;
  // toolCallId → 声明它的 assistant 条目（合成闭合需要锚点）
  const assistantEntryOfCall = new Map<string, string>();
  // 无 roundId 的 assistant 追加序号（ChatLoop 单轮路径）
  let assistantCounter = 0;

  const assertOwned = (binding: SAssistantBinding) => {
    if (binding.runId !== runId || !assistantTurnId || binding.assistantTurnId !== assistantTurnId) {
      throw Error("TRANSCRIPT_S_BINDING_INVALID");
    }
  };
  const sink: TranscriptSink = {
    async appendSAssistant(input) {
      const binding = copySAssistantBinding(input.binding);
      const message = copySAssistantMessage(input.message);
      const guard = input.guard;
      assertOwned(binding);
      const id = `${runId}:assistant:s-response`;
      const entry = await store.append(conversationId, {
        kind: "assistant", id, at: Date.now(), runId, turnId: assistantTurnId,
        roundId: "s-response",
        sSettlement: {version: 1, userTurnId: binding.userTurnId, userRevision: binding.userRevision},
        payload: message,
      }, guard);
      return entry.id;
    },
    async settleSAssistant(input) {
      const payload = copySAssistantSettlementPayload({
        binding: input.binding, result: input.result, safeReason: input.safeReason,
      });
      const guard = input.guard;
      assertOwned(payload.binding);
      const draft: Extract<TranscriptAppendInput, {kind: "assistant_settlement"}> = {
        kind: "assistant_settlement", id: `s-settlement:v1:${payload.binding.assistantEntryId}`,
        at: Date.now(), runId, turnId: assistantTurnId, payload,
      };
      try {
        await store.append(conversationId, draft, guard);
      } catch (error) {
        if (!(error instanceof TranscriptPersistenceError)) throw error;
        try {
          if (await store.confirmSAssistantSettlement(conversationId, draft)) return;
        } catch { /* no durable proof */ }
        throw Error("TRANSCRIPT_S_SETTLEMENT_UNKNOWN", {cause: error});
      }
    },
    async appendAssistant({ message, roundId,guard }) {
      const entryId = `${runId}:assistant:${roundId ?? `n${assistantCounter++}`}`;
      for (const call of message.toolCalls ?? []) {
        assistantEntryOfCall.set(call.id, entryId);
      }
      const entry = await store.append(conversationId, {
        kind: "assistant",
        id: entryId,
        at: Date.now(),
        runId,
        ...(assistantTurnId ? { turnId: assistantTurnId } : {}),
        ...(roundId ? { roundId } : {}),
        payload: message,
      },guard);
      return entry.id;
    },

    async appendToolResult({ assistantEntryId, message, outcome, fullRef, fileRead, roundId }) {
      const toolCallId = message.toolCallId ?? `unknown-${runId}-${assistantEntryId}`;
      await store.append(conversationId, {
        kind: "tool_result",
        id: `${runId}:tool:${toolCallId}`,
        at: Date.now(),
        runId,
        ...(roundId ? { roundId } : {}),
        payload: {
          assistantEntryId,
          toolCallId,
          outcome,
          message,
          ...(fullRef ? { fullRef } : {}),
          ...(fileRead ? { fileRead } : {}),
        },
      });
    },

    async closeInterruption({ reason, runSession }) {
      // 幂等闭合：以权威轨迹为准（限本 run），已有结果的调用不重复补写
      const snapshot = await store.read(conversationId);
      const closedToolCallIds = new Set<string>();
      for (const entry of snapshot.entries) {
        if (entry.kind === "tool_result" && entry.runId === runId) {
          closedToolCallIds.add(entry.payload.toolCallId);
          assistantEntryOfCall.set(entry.payload.toolCallId, entry.payload.assistantEntryId);
        } else if (entry.kind === "assistant" && entry.runId === runId) {
          for (const call of entry.payload.toolCalls ?? []) {
            assistantEntryOfCall.set(call.id, entry.id);
          }
        }
      }
      for (const call of runSession?.toolCalls ?? []) {
        if (closedToolCallIds.has(call.toolCallId)) continue;
        // started → 派发过但无结果（unknown）；planned → 从未派发（not_executed）；
        // 其余状态（committed / unknown / not_executed）按提交顺序先于生命周期发布，
        // 轨迹里已有结果，跳过。
        const outcome: ToolCallOutcome | undefined = call.status === "started"
          ? "unknown"
          : call.status === "planned"
            ? "not_executed"
            : undefined;
        if (!outcome) continue;
        const assistantEntryId = assistantEntryOfCall.get(call.toolCallId) ?? "unknown-assistant";
        const message: ChatMessage = {
          role: "tool",
          toolCallId: call.toolCallId,
          name: call.toolName,
          content: JSON.stringify({
            outcome,
            tool: call.toolName,
            message: outcome === "unknown" ? "工具执行中被取消，结果未知" : "取消时未开始执行",
          }),
        };
        await store.append(conversationId, {
          kind: "tool_result",
          id: `${runId}:tool-close:${assistantEntryId}:${call.toolCallId}`,
          at: Date.now(),
          runId,
          payload: { assistantEntryId, toolCallId: call.toolCallId, outcome, message },
        });
      }
      await store.append(conversationId, {
        kind: "interruption",
        id: `${runId}:interruption:${reason}`,
        at: Date.now(),
        runId,
        payload: { reason },
      });
    },

    async checkpoint() {
      await store.checkpoint(conversationId);
    },
  };
  bindings.set(sink,{store,conversationId,runId,assistantTurnId});return Object.freeze(sink);
}
