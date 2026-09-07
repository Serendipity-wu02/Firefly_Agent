import type { ChatCompletionRequest } from "../../../shared/chat-types";
import type { CapabilityJsonValue } from "../../../shared/capability-types";
import {
  createSubAgentId,
  type SubAgentFailure,
  type SubAgentTaskConstraints,
  type SubAgentTaskId,
  type SubAgentTaskRecord,
} from "../../../shared/subagent-types";
import type { ToolCall, ToolCallResult } from "../../../shared/tool-types";
import { SubAgentRegistry } from "./subagent-registry";
import { SubAgentTaskService } from "./subagent-task-service";
import type { SubAgentWorkerRuntime } from "./subagent-worker-runtime";

export const MAIN_AGENT_DELEGATION_TOOL_ID = "delegate_subagent";

const MAIN_DELEGATION_V1_LIMITS: SubAgentTaskConstraints = Object.freeze({
  maxSteps: 2,
  maxToolCalls: 1,
  timeoutMs: 30_000,
  maxDepth: 0,
});

type ToolSchema = NonNullable<ChatCompletionRequest["tools"]>[number];

export interface MainAgentDelegationBudget {
  /** Worker steps available after reserving one MAIN continuation step. */
  readonly availableWorkerSteps: number;
  /** Tool calls available after counting the delegation operation itself. */
  readonly availableWorkerToolCalls: number;
  /** Remaining wall-clock time on the originating MAIN run. */
  readonly remainingTimeoutMs: number;
}

export interface MainAgentDelegationContext {
  readonly parentRunId: string;
  readonly parentConversationId?: string;
  readonly signal?: AbortSignal;
  readonly budget: MainAgentDelegationBudget;
}

export interface MainAgentDelegationExecution {
  readonly result: ToolCallResult;
  /** A valid created task reserves this full finite budget from its parent. */
  readonly reservedBudget?: SubAgentTaskConstraints;
  readonly taskId?: SubAgentTaskId;
}

export interface MainAgentDelegationServiceOptions {
  readonly registry: SubAgentRegistry;
  readonly taskService: SubAgentTaskService;
  readonly workerRuntime: Pick<SubAgentWorkerRuntime, "execute">;
}

interface ParsedDelegationArguments {
  readonly subAgentId: ReturnType<typeof createSubAgentId>;
  readonly objective: string;
  readonly input: CapabilityJsonValue;
}

function isCapabilityJsonValue(value: unknown): value is CapabilityJsonValue {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((entry) => isCapabilityJsonValue(entry));
  if (typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value).every((entry) => isCapabilityJsonValue(entry));
}

function invalidArguments(message: string): Error {
  const error = new TypeError(message);
  error.name = "InvalidMainDelegationArguments";
  return error;
}

function parseDelegationArguments(args: Record<string, unknown>): ParsedDelegationArguments {
  const permittedKeys = new Set(["subAgentId", "objective", "input"]);
  if (Object.keys(args).some((key) => !permittedKeys.has(key))) {
    throw invalidArguments(
      "Delegation arguments may contain only subAgentId, objective, and input.",
    );
  }
  if (typeof args.subAgentId !== "string" || args.subAgentId.trim().length === 0) {
    throw invalidArguments("Delegation subAgentId must be a non-empty string.");
  }
  if (typeof args.objective !== "string" || args.objective.trim().length === 0) {
    throw invalidArguments("Delegation objective must be a non-empty string.");
  }
  if (
    typeof args.input !== "object" ||
    args.input === null ||
    Array.isArray(args.input) ||
    !isCapabilityJsonValue(args.input)
  ) {
    throw invalidArguments("Delegation input must be a serializable JSON object.");
  }

  return {
    subAgentId: createSubAgentId(args.subAgentId.trim()),
    objective: args.objective.trim(),
    input: args.input,
  };
}

function errorResult(
  call: ToolCall,
  error: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): ToolCallResult {
  return {
    toolCallId: call.id,
    name: call.name,
    output: JSON.stringify({ ok: false, operation: MAIN_AGENT_DELEGATION_TOOL_ID, error, message, ...details }),
    isError: true,
  };
}

function constraintsFromBudget(
  budget: MainAgentDelegationBudget,
): SubAgentTaskConstraints | undefined {
  if (
    !Number.isInteger(budget.availableWorkerSteps) ||
    !Number.isInteger(budget.availableWorkerToolCalls) ||
    !Number.isFinite(budget.remainingTimeoutMs) ||
    budget.availableWorkerSteps < MAIN_DELEGATION_V1_LIMITS.maxSteps ||
    budget.availableWorkerToolCalls < MAIN_DELEGATION_V1_LIMITS.maxToolCalls ||
    budget.remainingTimeoutMs <= 0
  ) {
    return undefined;
  }

  return Object.freeze({
    maxSteps: MAIN_DELEGATION_V1_LIMITS.maxSteps,
    maxToolCalls: MAIN_DELEGATION_V1_LIMITS.maxToolCalls,
    timeoutMs: Math.max(
      1,
      Math.min(MAIN_DELEGATION_V1_LIMITS.timeoutMs, Math.floor(budget.remainingTimeoutMs)),
    ),
    maxDepth: MAIN_DELEGATION_V1_LIMITS.maxDepth,
  });
}

function terminalFailure(record: SubAgentTaskRecord): SubAgentFailure {
  if (record.result?.ok === false) return record.result.error;
  return {
    code: "RUNTIME_FAILURE",
    message: `SubAgent task returned non-terminal state ${record.state}.`,
  };
}

/**
 * MAIN-only bridge from a model-visible Harness operation to the existing
 * SubAgent task and Worker runtime owners. It performs no worker work itself.
 */
export class MainAgentDelegationService {
  constructor(private readonly options: MainAgentDelegationServiceOptions) {}

  handles(call: ToolCall): boolean {
    return call.name === MAIN_AGENT_DELEGATION_TOOL_ID;
  }

  getToolSchema(): ToolSchema {
    const workers = this.options.registry.list();
    const workerDescriptions = workers.map(
      (descriptor) =>
        `${descriptor.id}: ${descriptor.description} Capabilities: ${descriptor.capabilities.join(", ")}.`,
    );
    return {
      type: "function",
      function: {
        name: MAIN_AGENT_DELEGATION_TOOL_ID,
        description: [
          "Delegate one bounded functional objective to a registered worker, then use the returned structured observation to continue the current MAIN run.",
          ...workerDescriptions,
        ].join(" "),
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            subAgentId: {
              type: "string",
              enum: workers.map((descriptor) => descriptor.id),
              description: "Exact registered worker identifier.",
            },
            objective: {
              type: "string",
              minLength: 1,
              description: "Bounded functional objective for the worker.",
            },
            input: {
              type: "object",
              description: "Small serializable task-relevant input projection.",
            },
          },
          required: ["subAgentId", "objective", "input"],
        },
      },
    };
  }

  async execute(
    call: ToolCall,
    context: MainAgentDelegationContext,
  ): Promise<MainAgentDelegationExecution> {
    if (!this.handles(call)) {
      return {
        result: errorResult(
          call,
          "delegation_operation_mismatch",
          "The requested operation is not owned by MainAgentDelegationService.",
        ),
      };
    }
    if (context.signal?.aborted) {
      return {
        result: errorResult(
          call,
          "delegation_cancelled",
          "The parent MAIN run was cancelled before task creation.",
          { state: "cancelled", parentRunId: context.parentRunId },
        ),
      };
    }

    let parsed: ParsedDelegationArguments;
    try {
      parsed = parseDelegationArguments(call.arguments);
    } catch (error: unknown) {
      return {
        result: errorResult(
          call,
          "invalid_delegation_arguments",
          error instanceof Error ? error.message : String(error),
          { parentRunId: context.parentRunId },
        ),
      };
    }

    if (this.options.registry.get(parsed.subAgentId) === undefined) {
      return {
        result: errorResult(
          call,
          "subagent_not_found",
          `SubAgent "${parsed.subAgentId}" is not registered.`,
          { parentRunId: context.parentRunId, subAgentId: parsed.subAgentId },
        ),
      };
    }

    const constraints = constraintsFromBudget(context.budget);
    if (constraints === undefined) {
      return {
        result: errorResult(
          call,
          "delegation_budget_exhausted",
          "The parent MAIN run has insufficient remaining step, tool, or timeout budget.",
          { parentRunId: context.parentRunId, subAgentId: parsed.subAgentId },
        ),
      };
    }

    const created = this.options.taskService.createTask({
      subAgentId: parsed.subAgentId,
      parentRunId: context.parentRunId,
      requester: { type: "main-agent", id: context.parentRunId },
      objective: parsed.objective,
      input: parsed.input,
      constraints,
      depth: 0,
    });

    let record: SubAgentTaskRecord;
    try {
      record = await this.options.workerRuntime.execute(created.task.taskId, context.signal);
    } catch (error: unknown) {
      const current = this.options.taskService.get(created.task.taskId);
      if (current?.state === "pending") {
        record = context.signal?.aborted
          ? this.options.taskService.cancel(
              created.task.taskId,
              "The parent MAIN run was cancelled before worker execution.",
            )
          : this.options.taskService.fail(
              this.options.taskService.start(created.task.taskId).task.taskId,
              {
                code: "RUNTIME_FAILURE",
                message: error instanceof Error ? error.message : String(error),
              },
            );
      } else if (current?.state === "running") {
        record = context.signal?.aborted
          ? this.options.taskService.cancel(
              created.task.taskId,
              "The parent MAIN run was cancelled during worker execution.",
            )
          : this.options.taskService.fail(created.task.taskId, {
              code: "RUNTIME_FAILURE",
              message: error instanceof Error ? error.message : String(error),
            });
      } else if (current !== undefined) {
        record = current;
      } else {
        return {
          taskId: created.task.taskId,
          reservedBudget: constraints,
          result: errorResult(
            call,
            "delegation_runtime_failure",
            error instanceof Error ? error.message : String(error),
            {
              parentRunId: context.parentRunId,
              subAgentId: parsed.subAgentId,
              taskId: created.task.taskId,
              state: "failed",
            },
          ),
        };
      }
    }

    if (record.state === "pending") {
      this.options.taskService.start(record.task.taskId);
      record = this.options.taskService.fail(record.task.taskId, {
        code: "RUNTIME_FAILURE",
        message: "SubAgent worker runtime returned before starting the task.",
      });
    } else if (record.state === "running") {
      record = this.options.taskService.fail(record.task.taskId, {
        code: "RUNTIME_FAILURE",
        message: "SubAgent worker runtime returned before reaching a terminal state.",
      });
    }

    const correlation = {
      parentRunId: context.parentRunId,
      ...(context.parentConversationId !== undefined
        ? { parentConversationId: context.parentConversationId }
        : {}),
      taskId: record.task.taskId,
      subAgentId: record.task.subAgentId,
      state: record.state,
    };

    if (context.signal?.aborted || record.state === "cancelled") {
      return {
        taskId: record.task.taskId,
        reservedBudget: constraints,
        result: errorResult(
          call,
          "delegation_cancelled",
          "The delegated task was cancelled and produced no successful observation.",
          correlation,
        ),
      };
    }

    if (record.state !== "succeeded" || record.result?.ok !== true) {
      const failure = terminalFailure(record);
      return {
        taskId: record.task.taskId,
        reservedBudget: constraints,
        result: errorResult(
          call,
          "delegation_failed",
          failure.message,
          { ...correlation, failure },
        ),
      };
    }

    return {
      taskId: record.task.taskId,
      reservedBudget: constraints,
      result: {
        toolCallId: call.id,
        name: call.name,
        output: JSON.stringify({
          ok: true,
          operation: MAIN_AGENT_DELEGATION_TOOL_ID,
          ...correlation,
          result: {
            output: record.result.output,
            ...(record.result.summary !== undefined ? { summary: record.result.summary } : {}),
          },
        }),
      },
    };
  }
}
