// 渠道适配器 —— 每个外部渠道（微信/飞书/...）的协议适配层接口。
//
// 设计原则：适配器只负责协议收发、消息归一化和账号凭证管理：
//   1) 启动时注册回调、启动子进程或加载本地状态；
//   2) 入站时归一化消息并交给调度器；
//   3) 出站时把统一消息翻译成平台协议并发送。
//
// 适配器不直接调用智能体，也不重复发送入站回调的返回值。
import type {
  ChannelCapability,
  ChannelId,
  ChannelStatus,
  IncomingMessage,
  MessageHandler,
  OutgoingMessage,
} from "../types";

export interface ChannelAdapter {
  readonly id: ChannelId;
  readonly displayName: string;
  readonly capability: ChannelCapability;

  /** 启动：注册 webhook / 启子进程 / 加载凭证 / 写运行时配置 */
  start(): Promise<void>;

  /** 关闭：停止子进程、关闭监听并释放协议资源。 */
  stop(): Promise<void>;

  /** 管理器在启动前注入；适配器通过此回调把入站消息交给调度器。 */
  onMessage: MessageHandler | null;

  /** 出站：把统一 OutgoingMessage 翻译成平台协议发出去 */
  send(msg: OutgoingMessage): Promise<{ ok: boolean; error?: string }>;

  /** Main-only authenticated account snapshot. Absent/null means no memory authority.
   * Optional for legacy/plugin adapters; consumers MUST fail closed, never infer an owner. */
  getMemoryAccountIdentity?(): ChannelMemoryAccountIdentity | null;

  /** UI 展示用状态。轮询调用，adapter 内部缓存即可。 */
  getStatus(): ChannelStatus;
}

/** 工具类型：adapter 的可选 onMessage setter。 */
export function setAdapterHandler(
  adapter: ChannelAdapter,
  handler: MessageHandler | null,
): void {
  adapter.onMessage = handler;
}

/** Main metadata, never copied from IncomingMessage or exposed as a Renderer capability. */
export type ChannelMemoryAccountIdentity = Readonly<{ accountKey: string; revision: number }>;

// Process-wide revisions also prevent an adapter replacement reusing an old account revision.
let nextMemoryAccountRevision = 0;
const memoryAccountControllers = new WeakMap<object, AbortController>();

/** Main-only authority lookup; serialized or forged identity shapes carry no signal. */
export function getChannelMemoryAccountSignal(identity: unknown): AbortSignal | null {
  if (typeof identity !== "object" || identity === null) return null;
  return memoryAccountControllers.get(identity)?.signal ?? null;
}

/** Adapter-private state: only a verified protocol handshake may authenticate it. */
export function createChannelMemoryAccountIdentity() {
  let current: ChannelMemoryAccountIdentity | null = null;
  let transition = 0;
  const revokeCurrent = (): number => {
    const revocation = ++transition;
    const previous = current;
    current = null;
    // Abort callbacks must observe the identity as already revoked.
    if (previous) memoryAccountControllers.get(previous)!.abort();
    return revocation;
  };
  return {
    read: (): ChannelMemoryAccountIdentity | null => current,
    revoke: (): void => { revokeCurrent(); },
    authenticate: (accountKey: string): void => {
      if (current?.accountKey === accountKey) return;
      const revocation = revokeCurrent();
      // A synchronous abort listener may stop/restart the adapter. Its newer transition wins.
      if (revocation !== transition) return;
      current = Object.freeze({ accountKey, revision: ++nextMemoryAccountRevision });
      memoryAccountControllers.set(current, new AbortController());
    },
  };
}
