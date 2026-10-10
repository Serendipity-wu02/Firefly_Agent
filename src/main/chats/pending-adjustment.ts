// 运行插话轮询：把"标记插入当前运行"的待发条目提交为正式用户消息，
// 供 harness 在模型请求边界（下一次请求前 / 最终结算前）按序取走。
//
// 核心不变量：双写成功才注入——每条插话先写权威轨迹（稳定 ID，含附件元数据），
// 再提交聊天历史；任一步失败抛错且 pending 标记保留（fail-closed），
// 下次轮询轨迹幂等命中后只重试聊天历史，绝不注入未可靠记录的消息，
// 也绝不重复注入已提交的条目（提交即移出队列，第二次提交按 not-found 跳过）。

import * as chatsStore from "./chats-store";
import type { PendingChatAttachment, PendingChatMessage } from "../../shared/chat-types";
import type { RunAdjustmentMessage } from "../orchestrator/harness/types";

/** Opaque Main-only authority for one live, unchanged marked queue item. */
declare const adjustmentPermitBrand: unique symbol;
export type RunAdjustmentPermit = object & { readonly [adjustmentPermitBrand]: true };
type AdjustmentBinding = { sessionId: string; runId: string };
export type RunAdjustmentHandler = (permit: RunAdjustmentPermit, commitHistory: () => RunAdjustmentMessage) => Promise<RunAdjustmentMessage>;
type PollerState = AdjustmentBinding & { handler?: RunAdjustmentHandler; closed?: boolean };
const pollers = new WeakMap<object, PollerState>();
const permits = new WeakMap<object, { binding: PollerState; item: PendingChatMessage; assertPending(): void }>();
const denied = (): never => { throw new Error("MEMORY_CONTEXT_ADJUSTMENT_DENIED"); };

/** A same-shaped function or DTO cannot bind a trusted adjustment producer. */
export function bindRunAdjustmentPoller(poller: object, binding: AdjustmentBinding, handler: RunAdjustmentHandler): () => void {
  const state = pollers.get(poller);
  if (!state || state.sessionId !== binding.sessionId || state.runId !== binding.runId || state.handler || state.closed) return denied();
  state.handler = handler;
  return () => { if (state.handler === handler) { state.closed = true; state.handler = undefined; } };
}

export function requireRunAdjustmentPermit(permit: object, binding: AdjustmentBinding): Readonly<{ turnId: string; revision: 1; text: string }> {
  const state = permits.get(permit);
  if (!state || !state.binding.handler || state.binding.sessionId !== binding.sessionId || state.binding.runId !== binding.runId) return denied();
  state.assertPending();
  if (state.item.attachments?.length) throw new Error("MEMORY_ATTACHMENT_UNSUPPORTED");
  return Object.freeze({ turnId: state.item.id, revision: 1, text: state.item.rawContent });
}

/** 轮询所需的存储端口（生产用 chats-store，测试可注入替身）。 */
export interface PendingAdjustmentStore {
  getPendingMessages(sessionId: string): PendingChatMessage[] | null;
  commitPendingAdjust(
    sessionId: string,
    messageId: string,
    runId: string,
  ): { ok: true; userMessage: { id: string }; remainingQueue: PendingChatMessage[] }
    | { ok: false; error: string };
}

/** 权威轨迹的 user 写入端口：稳定 turnId + 附件元数据，重试幂等。 */
export interface TranscriptUserWritePort {
  appendUser(input: {
    turnId: string;
    text: string;
    attachments?: PendingChatAttachment[];
  }): Promise<void>;
}

/**
 * 创建运行级插话轮询函数。
 * 返回 undefined 表示当前没有标记插入本运行的消息（同步快速路径，
 * harness 不产生 await 挂起点）；返回 Promise 表示有待提交的插话，
 * resolve 值为已按入队顺序双写成功的消息；任一步写失败则 reject
 * （pending 标记保留，等下个边界重试），由 harness fail-closed 终止运行。
 * transcript 端口缺省（缺 userTurnId 的兼容调用）：不写轨迹，只提交聊天历史。
 */
export function createRunAdjustmentPoller(
  sessionId: string,
  runId: string,
  store: PendingAdjustmentStore = chatsStore,
  transcript?: TranscriptUserWritePort,
): () => Promise<RunAdjustmentMessage[]> | undefined {
  const state: PollerState = { sessionId, runId };
  let active: Promise<RunAdjustmentMessage[]> | undefined;
  const poller = () => {
    if (state.closed) return Promise.reject(new Error("MEMORY_CONTEXT_ADJUSTMENT_DENIED"));
    if (active) return active.then(() => []);
    const queue = store.getPendingMessages(sessionId);
    if (!queue) return undefined;
    const marked = queue.filter((item) => item.adjustRunId === runId);
    if (marked.length === 0) return undefined;
    const operation = (async () => {
      const injected: RunAdjustmentMessage[] = [];
      for (const pending of marked) {
        const item = structuredClone(pending);
        if (state.handler) {
          const handler = state.handler, fingerprint = JSON.stringify(item);
          const assertPending = () => {
            const current = store.getPendingMessages(sessionId)?.filter(candidate => candidate.id === item.id);
            if (current?.length !== 1 || current[0].adjustRunId !== runId || JSON.stringify(current[0]) !== fingerprint) {
              throw new Error("MEMORY_CONTEXT_ADJUSTMENT_STALE");
            }
          };
          assertPending();
          const permit = Object.freeze({}) as RunAdjustmentPermit;
          permits.set(permit, { binding: state, item, assertPending });
          let attempted = false, committed: RunAdjustmentMessage | undefined;
          try {
            await handler(permit, () => {
              if (attempted || state.handler !== handler) return denied();
              attempted = true; assertPending();
              const result = store.commitPendingAdjust(sessionId, item.id, runId);
              if (!result.ok) throw new Error(`PENDING_ADJUST_COMMIT_FAILED:${item.id}:${result.error}`);
              committed = { id: result.userMessage.id, rawContent: item.rawContent };
              return committed;
            });
            if (!committed) return denied();
            injected.push(committed);
          } finally { permits.delete(permit); }
          continue;
        }
        // ① 权威轨迹先写（稳定 turnId + 附件元数据，同 entryId 重试幂等吸收）。
        //    写失败上抛：聊天历史不动，pending 保留。兼容调用无端口时跳过。
        if (transcript) {
          await transcript.appendUser({
            turnId: item.id,
            text: item.rawContent,
            ...(item.attachments?.length ? { attachments: item.attachments } : {}),
          });
        }
        // ② 聊天历史后写。失败同样上抛：pending 保留，下次轮询时轨迹幂等命中、只重试本步。
        const commit = store.commitPendingAdjust(sessionId, item.id, runId);
        if (!commit.ok) {
          throw new Error(`PENDING_ADJUST_COMMIT_FAILED:${item.id}:${commit.error}`);
        }
        // ③ 双写成功才注入运行
        injected.push({ id: commit.userMessage.id, rawContent: item.rawContent });
      }
      return injected;
    })();
    active = operation;
    void operation.then(() => { active = undefined; }, () => { active = undefined; });
    return operation;
  };
  pollers.set(poller, state);
  return poller;
}
