import { createHash } from "node:crypto";
import type { ChatMessage } from "../vendors/types";

const trustedInternal = new WeakMap<object,string>();
export function isTrustedInternalTranscriptMessage(message: ChatMessage): boolean {
 const serialized=trustedInternal.get(message);
 if(serialized===undefined)return false;
 if(serialized!==JSON.stringify(message))throw new Error("MEMORY_CONTEXT_PROMPT_CHANGED");
 return true;
}

export type InternalTranscriptKind = NonNullable<ChatMessage["internal"]>["kind"];

export function createInternalTranscriptMessage(input: {
  kind: InternalTranscriptKind;
  revision: number;
  content: string;
  runId: string;
  now?: number;
}): ChatMessage {
  const content = input.content.trim();
  const digest = createHash("sha256").update(`${input.kind}\n${content}`).digest("hex");
  const message:ChatMessage = {
    role: "user",
    content,
    visibility: "internal",
    internal: {
      kind: input.kind,
      revision: input.revision,
      digest,
      id: `${input.runId}:internal:${input.revision}`,
      runId: input.runId,
      createdAt: input.now ?? Date.now(),
    },
  };
  trustedInternal.set(message,JSON.stringify(message));
  return message;
}

/** 仅对同类、相同事实去重；不同类型的同文本上下文仍保留各自语义。 */
export function appendInternalTranscriptMessage(
  messages: readonly ChatMessage[],
  next: ChatMessage,
): ChatMessage[] {
  const metadata = next.internal;
  if (!metadata) return [...messages, next];
  const previous = [...messages].reverse().find((message) => message.internal?.kind === metadata.kind);
  if (previous?.internal?.digest === metadata.digest) return [...messages];
  return [...messages, next];
}

/** 删除本地存储/UI 元数据，得到唯一允许交给 Provider 的消息形状。 */
export function toModelVisibleMessage(message: ChatMessage): ChatMessage {
  const { visibility: _visibility, internal: _internal, ...visible } = message;
  return {
    ...visible,
    ...(message.toolCalls ? { toolCalls: message.toolCalls.map((call) => ({ ...call })) } : {}),
  };
}
