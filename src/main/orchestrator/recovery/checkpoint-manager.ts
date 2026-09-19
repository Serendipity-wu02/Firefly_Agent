import type { ChatMessage } from "../../../shared/chat-types";
import type { AgentEventBus } from "../agent-events";
import {
  CHECKPOINT_SCHEMA_VERSION,
  type Checkpoint,
  type CheckpointReadResult,
  type CheckpointTrigger,
  type ICheckpointPolicy,
  type ICheckpointStore,
} from "./checkpoint-types";
import { DefaultCheckpointPolicy } from "./checkpoint-policy";
import { InMemoryCheckpointStore } from "./checkpoint-store";
import type { RunExecutionState } from "./execution-state";
import type {
  ResumeCheckpointFacts,
  ResumeClaimResult,
} from "./resume-types";

export interface CheckpointManagerOptions {
  store?: ICheckpointStore;
  policy?: ICheckpointPolicy;
  eventBus?: AgentEventBus;
}

export interface CheckpointCreationOptions {
  /** Defer the created event until the caller confirms the saved boundary. */
  deferCreatedEvent?: boolean;
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
  private readonly claimedCheckpointIds = new Set<string>();
  private readonly claimedChains = new Map<
    string,
    { checkpointId: string; generation: number; ownerRunId: string }
  >();
  private readonly invalidatedResumeCheckpoints = new Map<string, string>();
  private checkpointSequence = 0;

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
    resumeFacts?: ResumeCheckpointFacts,
    options: CheckpointCreationOptions = {},
  ): Promise<Checkpoint | null> {
    if (!this.policy.shouldCheckpoint(trigger, state)) {
      return null;
    }

    const checkpointId =
      `cp-${state.runId}-s${state.step}-${Date.now()}-${++this.checkpointSequence}`;

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
      terminationReason: state.terminationReason,
      ...(resumeFacts === undefined
        ? {}
        : { resumeFacts: JSON.parse(JSON.stringify(resumeFacts)) }),
    };

    try {
      await this.store.save(checkpoint);
    } catch (error) {
      if (trigger === "resumable") {
        this.invalidateResume(checkpointId, "checkpoint_save_failed");
      }
      throw error;
    }

    let readBack: CheckpointReadResult;
    try {
      readBack = await this.store.read(checkpointId);
    } catch (error) {
      if (trigger === "resumable") {
        this.invalidateResume(checkpointId, "checkpoint_readback_failed");
      }
      throw error;
    }
    if (
      readBack.kind !== "found" ||
      JSON.stringify(readBack.checkpoint) !== JSON.stringify(checkpoint)
    ) {
      if (trigger === "resumable") {
        this.invalidateResume(checkpointId, "checkpoint_readback_failed");
      }
      return null;
    }

    if (!options.deferCreatedEvent) {
      this.publishCheckpointCreated(readBack.checkpoint);
    }

    return readBack.checkpoint;
  }

  publishCheckpointCreated(checkpoint: Checkpoint): boolean {
    if (this.invalidatedResumeCheckpoints.has(checkpoint.checkpointId)) return false;
    this.eventBus?.emit({
      type: "checkpoint:created",
      runId: checkpoint.runId,
      checkpointId: checkpoint.checkpointId,
      step: checkpoint.step,
      timestamp: Date.now(),
    });
    return true;
  }

  invalidateResume(checkpointId: string, reason: string): void {
    this.invalidatedResumeCheckpoints.set(checkpointId, reason);
  }

  getResumeInvalidation(checkpointId: string): string | undefined {
    return this.invalidatedResumeCheckpoints.get(checkpointId);
  }

  /**
   * Atomically claims one R2 snapshot in this process.  The method is
   * synchronous on purpose: callers must not await between eligibility
   * validation and occupation of the recovery chain.
   */
  claimResume(
    checkpoint: Checkpoint,
    ownerRunId: string,
  ): ResumeClaimResult {
    const facts = checkpoint.resumeFacts;
    if (facts === undefined) {
      return {
        ok: false,
        code: "resume_chain_claimed",
        message: "The checkpoint has no R2 facts to claim.",
      };
    }
    if (facts.executionRunId !== checkpoint.runId) {
      return {
        ok: false,
        code: "resume_chain_claimed",
        message: "The checkpoint execution owner does not match its owning run.",
      };
    }
    if (this.claimedCheckpointIds.has(checkpoint.checkpointId)) {
      return {
        ok: false,
        code: "resume_already_claimed",
        message: `Checkpoint "${checkpoint.checkpointId}" was already claimed in this process.`,
      };
    }

    const existing = this.claimedChains.get(facts.originRunId);
    if (existing !== undefined && (
      facts.parentCheckpointId !== existing.checkpointId ||
      facts.generation !== existing.generation + 1 ||
      facts.executionRunId !== existing.ownerRunId
    )) {
      return {
        ok: false,
        code: "resume_chain_claimed",
        message: `Recovery chain for run "${facts.originRunId}" is already claimed by another snapshot.`,
      };
    }

    this.claimedCheckpointIds.add(checkpoint.checkpointId);
    this.claimedChains.set(facts.originRunId, {
      checkpointId: checkpoint.checkpointId,
      generation: facts.generation,
      ownerRunId,
    });
    return { ok: true, ownerRunId };
  }

  /**
   * 恢复指定快照
   */
  async restoreCheckpoint(checkpointId: string): Promise<CheckpointReadResult> {
    const result = await this.store.read(checkpointId);
    if (result.kind !== "found") {
      return result;
    }

    this.eventBus?.emit({
      type: "checkpoint:restored",
      runId: result.checkpoint.runId,
      checkpointId,
      timestamp: Date.now(),
    });

    return result;
  }

  async getLatestForRun(runId: string): Promise<Checkpoint | undefined> {
    return this.store.getLatestForRun(runId);
  }
}
