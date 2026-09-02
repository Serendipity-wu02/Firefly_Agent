import type { ChatMessage } from "../../../shared/chat-types";
import type { AgentEventBus } from "../agent-events";
import {
  CHECKPOINT_SCHEMA_VERSION,
  type Checkpoint,
  type CheckpointTrigger,
  type ICheckpointPolicy,
  type ICheckpointStore,
} from "./checkpoint-types";
import { DefaultCheckpointPolicy } from "./checkpoint-policy";
import { InMemoryCheckpointStore } from "./checkpoint-store";
import type { RunExecutionState } from "./execution-state";

export interface CheckpointManagerOptions {
  store?: ICheckpointStore;
  policy?: ICheckpointPolicy;
  eventBus?: AgentEventBus;
}

/**
 * CheckpointManager (快照持久化与恢复协调器)
 *
 * 统一协调 Policy 判定、Store 读写、数据序列化脱敏以及生命周期事件分发。
 */
export class CheckpointManager {
  private readonly store: ICheckpointStore;
  private readonly policy: ICheckpointPolicy;
  private readonly eventBus?: AgentEventBus;

  constructor(options: CheckpointManagerOptions = {}) {
    this.store = options.store || new InMemoryCheckpointStore();
    this.policy = options.policy || new DefaultCheckpointPolicy();
    this.eventBus = options.eventBus;
  }

  getStore(): ICheckpointStore {
    return this.store;
  }

  getPolicy(): ICheckpointPolicy {
    return this.policy;
  }

  /**
   * 捕获并保存执行现场快照
   */
  async createCheckpoint(
    state: RunExecutionState,
    messages: ChatMessage[],
    trigger: CheckpointTrigger,
    providerMetadata?: Record<string, unknown>,
  ): Promise<Checkpoint | null> {
    if (!this.policy.shouldCheckpoint(trigger, state)) {
      return null;
    }

    const checkpointId = `cp-${state.runId}-s${state.step}-${Date.now()}`;

    // 深度防御性脱敏与拷贝（确保无未决 Promise、函数、AbortController 等不可序列化对象）
    const sanitizedMessages: ChatMessage[] = messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolCallId: m.toolCallId,
      toolCalls: m.toolCalls ? JSON.parse(JSON.stringify(m.toolCalls)) : undefined,
      timestamp: m.timestamp,
    }));

    const sanitizedToolCalls = JSON.parse(JSON.stringify(state.activeToolCalls || []));
    const sanitizedPlan = state.plan ? JSON.parse(JSON.stringify(state.plan)) : undefined;

    const checkpoint: Checkpoint = {
      checkpointId,
      runId: state.runId,
      sessionId: state.sessionId,
      step: state.step,
      runState: state.runState,
      stepState: state.stepState,
      messages: sanitizedMessages,
      activeToolCalls: sanitizedToolCalls,
      recoveryAttempts: state.recoveryAttempts,
      createdAt: Date.now(),
      version: CHECKPOINT_SCHEMA_VERSION,
      trigger,
      plan: sanitizedPlan,
      providerMetadata,
    };

    await this.store.save(checkpoint);

    this.eventBus?.emit({
      type: "checkpoint:created",
      runId: state.runId,
      checkpointId,
      step: state.step,
      timestamp: Date.now(),
    });

    return checkpoint;
  }

  /**
   * 恢复指定快照
   */
  async restoreCheckpoint(checkpointId: string): Promise<Checkpoint | undefined> {
    const checkpoint = await this.store.get(checkpointId);
    if (!checkpoint) {
      return undefined;
    }

    this.eventBus?.emit({
      type: "checkpoint:restored",
      runId: checkpoint.runId,
      checkpointId,
      timestamp: Date.now(),
    });

    return checkpoint;
  }

  async getLatestForRun(runId: string): Promise<Checkpoint | undefined> {
    return this.store.getLatestForRun(runId);
  }
}
