import type { IAgentCore } from "../../../shared/agent-core";
import {
  createCapabilityId,
  type CapabilityJsonValue,
  type CapabilityRequester,
} from "../../../shared/capability-types";
import {
  createSubAgentId,
  type SubAgentDescriptor,
  type SubAgentResult,
  type SubAgentTaskConstraints,
  type SubAgentTaskId,
  type SubAgentTaskRecord,
  type WorkerExecutionProfile,
} from "../../../shared/subagent-types";
import type { AgentEventBus } from "../../orchestrator/agent-events";
import { CapabilityBindingResolver } from "../capabilities/capability-binding-resolver";
import { SubAgentServiceError } from "./subagent-errors";
import { SubAgentRegistry } from "./subagent-registry";
import { SubAgentTaskService } from "./subagent-task-service";

export interface SubAgentWorkerRuntimeOptions {
  readonly registry: SubAgentRegistry;
  readonly taskService: SubAgentTaskService;
  readonly bindingResolver: CapabilityBindingResolver;
  readonly agentCore: Pick<IAgentCore, "run">;
  readonly eventBus: AgentEventBus;
  readonly now?: () => number;
}

interface ActiveWorkerRun {
  readonly runId: string;
  readonly controller: AbortController;
}

function defaultNow(): number {
  return Date.now();
}

function runIdForTask(taskId: SubAgentTaskId): string {
  return `subagent-run:${taskId}`;
}

function isWorkerTaskConstraints(value: SubAgentTaskConstraints): boolean {
  return (
    value.maxSteps > 0 &&
    value.maxToolCalls >= 0 &&
    value.timeoutMs > 0 &&
    value.maxDepth >= 0
  );
}

function parseWorkerOutputValue(value: string): CapabilityJsonValue {
  try {
    return JSON.parse(value) as CapabilityJsonValue;
  } catch {
    return value;
  }
}

export const DEFAULT_MUSIC_STATUS_SUBAGENT_DESCRIPTOR: SubAgentDescriptor = Object.freeze({
  id: createSubAgentId("music-status-worker-v1"),
  name: "Music Status Worker",
  description: "Reads current player status through the canonical authorized capability path.",
  version: "1.1.1",
  capabilities: Object.freeze([createCapabilityId("music.status.read")]),
});

/**
 * Small orchestration owner for bounded functional workers.
 *
 * The worker delegates execution to the existing AgentCore facade. It owns
 * task-to-run correlation and cancellation only; authorization and operation
 * execution remain in the canonical Harness path.
 */
export class SubAgentWorkerRuntime {
  private readonly now: () => number;
  private readonly activeRuns = new Map<SubAgentTaskId, ActiveWorkerRun>();

  constructor(private readonly options: SubAgentWorkerRuntimeOptions) {
    this.now = options.now ?? defaultNow;
  }

  async execute(
    taskId: SubAgentTaskId,
    signal?: AbortSignal,
  ): Promise<SubAgentTaskRecord> {
    const initial = this.requireTask(taskId);
    if (initial.state !== "pending") {
      throw new SubAgentServiceError(
        "INVALID_TASK_TRANSITION",
        `SubAgent task "${taskId}" cannot start from ${initial.state}.`,
      );
    }

    if (initial.task.depth !== 0 || initial.task.parentTaskId !== undefined) {
      throw new SubAgentServiceError(
        "INVALID_DELEGATION_DEPTH",
        "V1 worker runtime does not allow nested worker tasks.",
      );
    }
    if (!isWorkerTaskConstraints(initial.task.constraints)) {
      throw new SubAgentServiceError(
        "INVALID_TASK",
        "Worker task constraints must contain a positive step and timeout budget.",
      );
    }

    const descriptor = this.options.registry.get(initial.task.subAgentId);
    if (descriptor === undefined) {
      throw new SubAgentServiceError(
        "SUBAGENT_NOT_FOUND",
        `SubAgent "${initial.task.subAgentId}" is not registered.`,
      );
    }

    const allowedToolIds = descriptor.capabilities.map((capabilityId) => {
      const binding = this.options.bindingResolver.resolve(capabilityId);
      if (binding === undefined) {
        throw new SubAgentServiceError(
          "INVALID_TASK",
          `Worker capability "${capabilityId}" has no canonical binding.`,
        );
      }
      return binding.toolId;
    });

    if (signal?.aborted) {
      const cancelled = this.options.taskService.cancel(
        taskId,
        "The SubAgent task was cancelled before the worker started.",
      );
      this.emitCancelled(cancelled, runIdForTask(taskId));
      return cancelled;
    }

    this.options.taskService.start(taskId);
    const runId = runIdForTask(taskId);
    const controller = new AbortController();
    const activeRun: ActiveWorkerRun = { runId, controller };
    this.activeRuns.set(taskId, activeRun);

    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, initial.task.constraints.timeoutMs);
    const onAbort = (): void => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });

    this.options.eventBus.emit({
      type: "subagent:started",
      runId,
      subAgentId: initial.task.subAgentId,
      taskId,
      ...(initial.task.parentRunId !== undefined
        ? { parentRunId: initial.task.parentRunId }
        : {}),
      timestamp: this.now(),
    });

    try {
      const requester: Extract<CapabilityRequester, { type: "subagent" }> = {
        type: "subagent",
        id: `subagent:${taskId}`,
        subAgentId: initial.task.subAgentId,
        taskId,
        ...(initial.task.parentRunId !== undefined
          ? { parentRunId: initial.task.parentRunId }
          : {}),
      };
      const profile: WorkerExecutionProfile = {
        kind: "WORKER",
        subAgentId: initial.task.subAgentId,
        taskId,
        requester,
        signal: controller.signal,
        objective: initial.task.objective,
        contextProjection: Object.freeze([
          Object.freeze({ key: "task_input", value: initial.task.input }),
        ]),
        allowedCapabilityIds: Object.freeze([...descriptor.capabilities]),
        allowedToolIds: Object.freeze([...new Set(allowedToolIds)]),
        budget: Object.freeze({ ...initial.task.constraints }),
      };

      const result = await this.options.agentCore.run({
        runId,
        conversationId: `subagent:${taskId}`,
        userPrompt: initial.task.objective,
        executionProfile: profile,
        signal: controller.signal,
      });

      if (timedOut || result.status === "timeout") {
        return this.failRunning(taskId, {
          code: "TIMEOUT",
          message: `SubAgent task exceeded its ${initial.task.constraints.timeoutMs}ms timeout budget.`,
        });
      }
      if (controller.signal.aborted || result.status === "cancelled") {
        return this.cancelRunning(taskId, "The SubAgent worker run was cancelled.");
      }
      if (result.status !== "completed") {
        return this.failRunning(taskId, {
          code: "RUNTIME_FAILURE",
          message: result.error || `SubAgent worker ended with status ${result.status}.`,
        });
      }

      const output = parseWorkerOutputValue(result.finalText);
      const completed = this.options.taskService.succeed(taskId, {
        ok: true,
        output,
      });
      this.options.eventBus.emit({
        type: "subagent:completed",
        runId,
        subAgentId: initial.task.subAgentId,
        taskId,
        timestamp: this.now(),
      });
      return completed;
    } catch (error: unknown) {
      if (timedOut) {
        return this.failRunning(taskId, {
          code: "TIMEOUT",
          message: `SubAgent task exceeded its ${initial.task.constraints.timeoutMs}ms timeout budget.`,
        });
      }
      if (controller.signal.aborted || signal?.aborted) {
        return this.cancelRunning(taskId, "The SubAgent worker run was cancelled.");
      }
      return this.failRunning(taskId, {
        code: "RUNTIME_FAILURE",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      this.activeRuns.delete(taskId);
    }
  }

  cancel(taskId: SubAgentTaskId): boolean {
    const active = this.activeRuns.get(taskId);
    if (active !== undefined) {
      active.controller.abort();
      this.cancelRunning(taskId, "The SubAgent worker run was cancelled.");
      return true;
    }

    const record = this.options.taskService.get(taskId);
    if (record?.state === "pending") {
      const cancelled = this.options.taskService.cancel(taskId);
      this.emitCancelled(cancelled, runIdForTask(taskId));
      return true;
    }
    return false;
  }

  cancelAll(): void {
    for (const taskId of this.activeRuns.keys()) {
      this.cancel(taskId);
    }
    for (const record of this.options.taskService.list()) {
      if (record.state === "pending") this.cancel(record.task.taskId);
    }
  }

  private requireTask(taskId: SubAgentTaskId): SubAgentTaskRecord {
    const record = this.options.taskService.get(taskId);
    if (record === undefined) {
      throw new SubAgentServiceError(
        "TASK_NOT_FOUND",
        `SubAgent task "${taskId}" was not found.`,
      );
    }
    return record;
  }

  private failRunning(
    taskId: SubAgentTaskId,
    failure: Extract<SubAgentResult, { ok: false }>["error"],
  ): SubAgentTaskRecord {
    const current = this.requireTask(taskId);
    if (current.state !== "running") return current;
    const failed = this.options.taskService.fail(taskId, failure);
    this.options.eventBus.emit({
      type: "subagent:failed",
      runId: runIdForTask(taskId),
      subAgentId: failed.task.subAgentId,
      taskId,
      error: failure.message,
      timestamp: this.now(),
    });
    return failed;
  }

  private cancelRunning(taskId: SubAgentTaskId, message: string): SubAgentTaskRecord {
    const current = this.requireTask(taskId);
    if (current.state !== "running") return current;
    const cancelled = this.options.taskService.cancel(taskId, message);
    this.emitCancelled(cancelled, runIdForTask(taskId));
    return cancelled;
  }

  private emitCancelled(record: SubAgentTaskRecord, runId: string): void {
    this.options.eventBus.emit({
      type: "subagent:cancelled",
      runId,
      subAgentId: record.task.subAgentId,
      taskId: record.task.taskId,
      timestamp: this.now(),
    });
  }
}
