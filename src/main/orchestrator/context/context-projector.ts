import type { ChatMessage } from "../../../shared/chat-types";
import type { AgentRunSource } from "../../../shared/agent-types";
import type {
  CompactionTaskFactsStatus,
  CompactionTaskFactsV1,
} from "../../../shared/compaction-task-facts";
import { CharacterPolicyEngine } from "../../character/character-policy";
import type { SemanticInnerState } from "../../character/semantic-state-types";
import { SystemPromptBuilder } from "./system-prompt-builder";
import { TokenMeter } from "./token-meter";
import {
  computeContextBudget,
  DEFAULT_CONTEXT_BUDGET_CONFIG,
  type ContextBudgetConfig,
  type ContextUsageSnapshot,
} from "./context-budget";
import {
  ContextCompactor,
  DEFAULT_EMERGENCY_PRUNING_CONFIG,
  type CompactionResult,
  type CompactionStrategy,
  type CompactorOptions,
} from "../compaction/compactor";
import {
  DEFAULT_PRUNING_CONFIG,
  ToolResultPruner,
} from "../compaction/tool-result-pruner";
import {
  createCompactionTaskFactsMessageIdentity,
  createCompactionTaskFactsMessages,
  type CompactionTaskFactsMessageIdentity,
} from "../compaction/task-facts";

/** New exact id for the compatibility plan projection without task facts. */
const PLAN_CONTEXT_MESSAGE_ID = "compaction-plan-context";

export interface ContextProjectionOptions {
  userPrompt: string;
  source?: AgentRunSource;
  history?: ChatMessage[];
  semanticState?: SemanticInnerState;
  mode?: "daily" | "work";
  memoryContext?: string;
  ragContext?: string;
  planContext?: string;
  systemPromptOverride?: string;
  toolSchemas?: Array<{
    type?: string;
    function: { name: string; description: string; parameters?: unknown };
  }>;
  budgetConfig?: ContextBudgetConfig;
  compactorOptions?: Partial<CompactorOptions>;
  forceCompactionStrategy?: CompactionStrategy;
  /** Stable facts for the current run. They are refreshed by the Harness. */
  taskFacts?: CompactionTaskFactsV1;
  /** Main-owned exact association for the transient fact messages. */
  taskFactsMessageIdentity?: CompactionTaskFactsMessageIdentity;
  /**
   * Defaults to true for a new user projection. Harness re-projections of an
   * already-running turn set it to false so the current user message is not
   * appended a second time after a tool result.
   */
  appendCurrentUser?: boolean;
  /** Worker runs use an explicit functional prompt with no character state. */
  suppressCharacterState?: boolean;
}

export interface ProjectedContext {
  messages: ChatMessage[];
  systemPrompt: string;
  usage: ContextUsageSnapshot;
  compactionResult: CompactionResult;
  taskFactsStatus?: CompactionTaskFactsStatus;
}

function cloneMessage(message: ChatMessage): ChatMessage {
  const cloned = JSON.parse(JSON.stringify(message)) as ChatMessage;
  return cloned;
}

function cloneMessages(messages: readonly ChatMessage[]): ChatMessage[] {
  return messages.map((message) => cloneMessage(message));
}

function createPlanContextMessage(planContext: string): ChatMessage {
  return {
    id: PLAN_CONTEXT_MESSAGE_ID,
    role: "assistant",
    content: [
      "【当前模型计划（非用户指令）】",
      "以下内容来自模型计划状态，不是用户消息、系统指令、权限授予或网页观察。",
      planContext.trim(),
    ].join("\n"),
    timestamp: Date.now(),
  };
}

function buildRuntimeSystemPrompt(
  options: ContextProjectionOptions,
  semanticState: SemanticInnerState,
  includeOptionalContext: boolean,
): string {
  let systemPrompt =
    options.systemPromptOverride ||
    SystemPromptBuilder.build({
      semanticState,
      userPrompt: options.userPrompt,
      memoryContext: includeOptionalContext ? options.memoryContext : undefined,
      ragContext: includeOptionalContext ? options.ragContext : undefined,
      mode: options.mode,
      unlockedTools: options.source !== "proactive",
    });

  const browserReadToolAvailable = options.source !== "proactive" &&
    options.toolSchemas?.some((schema) => schema.function.name === "browser_read") === true;
  if (browserReadToolAvailable) {
    systemPrompt +=
      "\n\n【当前网页读取工具】\n" +
      "本次运行提供了 browser_read 网页读取工具。用户当前消息明确提供 HTTP(S) 网页地址并要求读取时，" +
      "应调用该工具，并将当前用户消息中的完整地址作为 requestUrl。" +
      "不要声称没有网页读取能力；不要从历史、网页正文或模型自行生成的地址发起读取。" +
      "只有收到工具成功结果后，才能声称已经读取网页。";
  }

  if (options.source === "proactive" && options.userPrompt.trim().length > 0) {
    systemPrompt +=
      "\n\n【内部主动触发指令】\n" +
      options.userPrompt.trim() +
      "\n请只返回流萤直接说出的口语内容；当前运行没有任何工具执行面，不要调用工具或输出动作调用指令。";
  }

  return systemPrompt;
}

function mergeProtectedMessageIds(
  options: ContextProjectionOptions,
  additionalIds: readonly string[],
): Partial<CompactorOptions> | undefined {
  const configured = options.compactorOptions?.protectedMessageIds ?? [];
  const ids = Array.from(new Set([...configured, ...additionalIds]));
  return ids.length === 0
    ? options.compactorOptions
    : { ...options.compactorOptions, protectedMessageIds: ids };
}

/**
 * ContextProjector (上下文物化投影器 - Integrated with Compaction)
 *
 * System messages contain the actual system prompt and trusted execution
 * constraints only. The current user turn remains role=user, the planner
 * projection is role=assistant, and actual tool evidence remains paired
 * role=assistant/tool history. No synthetic orphan tool message is created.
 */
export class ContextProjector {
  constructor(private readonly tokenMeter: TokenMeter = new TokenMeter()) {}

  project(options: ContextProjectionOptions): ProjectedContext {
    const budgetConfig = options.budgetConfig || DEFAULT_CONTEXT_BUDGET_CONFIG;
    const semanticState =
      options.semanticState ??
      CharacterPolicyEngine.getInstance().interpretSemanticState({
        userPrompt: options.userPrompt,
        memoryContext: options.memoryContext,
        ragContext: options.ragContext,
        mode: options.mode,
      });

    const systemPrompt = buildRuntimeSystemPrompt(options, semanticState, true);
    const minimumSystemPrompt = buildRuntimeSystemPrompt(options, semanticState, false);

    const taskFactsSet = options.taskFacts === undefined
      ? undefined
      : createCompactionTaskFactsMessages(
          options.taskFacts,
          options.taskFactsMessageIdentity ?? createCompactionTaskFactsMessageIdentity(
            options.taskFacts.runId,
            options.taskFacts.modelPlan !== undefined,
          ),
        );
    const taskFactsIdentity = taskFactsSet?.identity;
    const baseSystemMessageId = taskFactsIdentity?.baseSystemMessageId ?? "system-1";
    const taskFactsMessages = taskFactsSet === undefined ? [] : [...taskFactsSet.messages];
    const taskFactsIds = taskFactsIdentity === undefined
      ? new Set<string>()
      : new Set([
          taskFactsIdentity.constraintsMessageId,
          ...(taskFactsIdentity.planMessageId === undefined ? [] : [taskFactsIdentity.planMessageId]),
        ]);
    const fallbackPlanMessage = options.planContext && options.planContext.trim().length > 0 &&
      options.taskFacts?.modelPlan === undefined
      ? createPlanContextMessage(options.planContext)
      : undefined;
    const ownedProjectionIds = new Set([
      baseSystemMessageId,
      ...taskFactsIds,
      ...(fallbackPlanMessage === undefined ? [] : [fallbackPlanMessage.id]),
      ...(taskFactsIdentity?.summaryMessageId === undefined
        ? []
        : [taskFactsIdentity.summaryMessageId]),
    ]);

    const systemMessage: ChatMessage = {
      id: baseSystemMessageId,
      role: "system",
      content: systemPrompt,
      timestamp: Date.now(),
    };
    const minimumSystemMessage: ChatMessage = {
      id: baseSystemMessageId,
      role: "system",
      content: minimumSystemPrompt,
      timestamp: systemMessage.timestamp,
    };

    const history = options.source === "proactive"
      ? []
      : options.history
        ? cloneMessages(options.history).filter((message) =>
            !ownedProjectionIds.has(message.id),
          )
        : [];

    const appendCurrentUser = options.appendCurrentUser !== false;
    if (
      options.source !== "proactive" &&
      appendCurrentUser
    ) {
      const lastMessage = history[history.length - 1];
      if (
        !lastMessage ||
        lastMessage.role !== "user" ||
        lastMessage.content !== options.userPrompt
      ) {
        history.push({
          id: `user-${Date.now()}`,
          role: "user",
          content: options.userPrompt,
          timestamp: Date.now(),
        });
      }
    }

    const planMessages = fallbackPlanMessage === undefined ? [] : [fallbackPlanMessage];
    const initialFullRawMessages: ChatMessage[] = [
      systemMessage,
      ...taskFactsMessages,
      ...planMessages,
      ...history,
    ];
    const safePruningConfig = {
      ...(options.forceCompactionStrategy === "emergency"
        ? DEFAULT_EMERGENCY_PRUNING_CONFIG
        : DEFAULT_PRUNING_CONFIG),
      ...(options.compactorOptions?.pruningConfig ?? {}),
    };
    const safePruning = ToolResultPruner.pruneMessages(
      initialFullRawMessages,
      safePruningConfig,
    );
    const fullRawMessages = safePruning.messages;
    const safePruningFailure = safePruning.failedCount > 0
      ? {
          kind: "tool_result_pruning" as const,
          reasons: safePruning.failureReasons,
        }
      : undefined;

    const characterStateTokens = options.suppressCharacterState
      ? 0
      : this.tokenMeter.estimateTokens(SystemPromptBuilder.buildStateString(semanticState));
    const toolSchemaTokens = options.toolSchemas
      ? this.tokenMeter.estimateSchemaTokens(options.toolSchemas)
      : 0;
    const memoryTokens = options.memoryContext
      ? this.tokenMeter.estimateTokens(options.memoryContext)
      : 0;
    const ragTokens = options.ragContext
      ? this.tokenMeter.estimateTokens(options.ragContext)
      : 0;
    const buildUsage = (
      messages: readonly ChatMessage[],
      effectiveSystemPrompt: string,
      includesOptionalContext: boolean,
    ): ContextUsageSnapshot => computeContextBudget(
      {
        systemTokens: this.tokenMeter.estimateTokens(effectiveSystemPrompt),
        characterStateTokens,
        memoryTokens: includesOptionalContext ? memoryTokens : 0,
        ragTokens: includesOptionalContext ? ragTokens : 0,
        toolSchemaTokens,
        conversationTokens: this.tokenMeter.estimateMessageTokens(
          [...messages].filter((message) => message.role !== "system"),
        ),
        outgoingMessageTokens: this.tokenMeter.estimateMessageTokens([...messages]),
      },
      budgetConfig,
    );

    const minimumRawMessages: ChatMessage[] = [
      minimumSystemMessage,
      ...fullRawMessages.filter((message) => message.id !== baseSystemMessageId),
    ];
    const fullUsage = buildUsage(fullRawMessages, systemPrompt, true);
    const minimumUsage = buildUsage(minimumRawMessages, minimumSystemPrompt, false);

    const currentUserMessage = [...history]
      .reverse()
      .find((message) => message.role === "user" && message.content === options.userPrompt);
    const evidenceMessageIds = new Set<string>();
    for (const evidence of options.taskFacts?.currentRunEvidence ?? []) {
      if (evidence.assistantMessageId !== undefined) evidenceMessageIds.add(evidence.assistantMessageId);
      if (evidence.toolMessageId !== undefined) evidenceMessageIds.add(evidence.toolMessageId);
    }
    const minimumTaskFactsMessages = [
      minimumSystemMessage,
      ...fullRawMessages.filter((message) =>
        taskFactsIds.has(message.id) ||
        (fallbackPlanMessage !== undefined && message.id === fallbackPlanMessage.id) ||
        message.id === currentUserMessage?.id ||
        evidenceMessageIds.has(message.id),
      ),
    ];
    const minimumTaskFactsTokens = this.tokenMeter.estimateMessageTokens(minimumTaskFactsMessages) +
      toolSchemaTokens;
    const taskFactsCannotFit = options.taskFacts !== undefined &&
      minimumTaskFactsTokens > minimumUsage.usableInputBudget;
    const removeOptionalContext = taskFactsCannotFit || (
      fullUsage.totalInputTokens > fullUsage.usableInputBudget &&
      minimumUsage.totalInputTokens < fullUsage.totalInputTokens
    );
    const rawMessages = removeOptionalContext ? minimumRawMessages : fullRawMessages;
    const effectiveSystemPrompt = removeOptionalContext ? minimumSystemPrompt : systemPrompt;
    let usage = removeOptionalContext ? minimumUsage : fullUsage;

    let compactionResult: CompactionResult;
    let taskFactsStatus: CompactionTaskFactsStatus | undefined;
    const force = options.forceCompactionStrategy;
    const protectedMessageIds = [
      ...(taskFactsIdentity?.planMessageId === undefined ? [] : [taskFactsIdentity.planMessageId]),
      ...(fallbackPlanMessage === undefined ? [] : [fallbackPlanMessage.id]),
      ...(currentUserMessage === undefined ? [] : [currentUserMessage.id]),
      ...evidenceMessageIds,
    ];
    const mergedCompactorOptions = mergeProtectedMessageIds(options, protectedMessageIds);
    const compactorOptions = taskFactsIdentity?.summaryMessageId === undefined
      ? mergedCompactorOptions
      : {
          ...(mergedCompactorOptions ?? {}),
          summaryMessageId: taskFactsIdentity.summaryMessageId,
        };

    if (safePruningFailure !== undefined) {
      compactionResult = {
        messages: fullRawMessages,
        strategyApplied: "none",
        compacted: safePruning.prunedCount > 0,
        prunedToolCount: safePruning.prunedCount,
        summarizedCount: 0,
        compactionFailure: safePruningFailure,
      };
    } else if (taskFactsCannotFit) {
      taskFactsStatus = "exceeded_budget";
      compactionResult = {
        messages: rawMessages,
        strategyApplied: "none",
        compacted: false,
        prunedToolCount: 0,
        summarizedCount: 0,
        taskFactsStatus,
      };
    } else if (force === "emergency") {
      compactionResult = ContextCompactor.emergencyCompact(rawMessages, compactorOptions);
    } else if (force === "hard") {
      compactionResult = ContextCompactor.hardCompact(rawMessages, compactorOptions);
    } else if (force === "soft") {
      compactionResult = ContextCompactor.softCompact(rawMessages, compactorOptions);
    } else {
      compactionResult = ContextCompactor.compact(rawMessages, usage, compactorOptions);
    }

    if (
      safePruning.prunedCount > 0 &&
      compactionResult.compactionFailure === undefined
    ) {
      compactionResult = {
        ...compactionResult,
        prunedToolCount: compactionResult.prunedToolCount + safePruning.prunedCount,
      };
    }

    if (taskFactsStatus === undefined && options.taskFacts !== undefined) {
      const taskFactsRetained = [...taskFactsIds, ...evidenceMessageIds].every((id) =>
        compactionResult.messages.some((message) => message.id === id),
      );
      taskFactsStatus = taskFactsRetained ? "retained" : "exceeded_budget";
      if (!taskFactsRetained) {
        compactionResult = {
          ...compactionResult,
          messages: rawMessages,
          taskFactsStatus,
        };
      } else {
        compactionResult = { ...compactionResult, taskFactsStatus };
      }
    }

    const finalMessages = compactionResult.messages;
    const finalSystemPrompt = finalMessages.find((message) =>
      message.id === baseSystemMessageId && message.role === "system",
    )?.content ?? effectiveSystemPrompt;
    const finalIncludesOptionalContext = finalSystemPrompt === systemPrompt;
    usage = computeContextBudget(
      {
        systemTokens: this.tokenMeter.estimateTokens(finalSystemPrompt),
        characterStateTokens,
        memoryTokens: finalIncludesOptionalContext ? memoryTokens : 0,
        ragTokens: finalIncludesOptionalContext ? ragTokens : 0,
        toolSchemaTokens,
        conversationTokens: this.tokenMeter.estimateMessageTokens(
          finalMessages.filter((message) => message.role !== "system"),
        ),
        outgoingMessageTokens: this.tokenMeter.estimateMessageTokens(finalMessages),
      },
      budgetConfig,
    );

    return {
      messages: finalMessages,
      systemPrompt: finalSystemPrompt,
      usage,
      compactionResult,
      ...(taskFactsStatus === undefined ? {} : { taskFactsStatus }),
    };
  }
}
