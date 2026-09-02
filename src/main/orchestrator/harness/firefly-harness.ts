import type {
  HarnessConfig,
  HarnessInput,
  HarnessResult,
  HarnessEvent,
  HarnessRunStatus,
} from "../../../shared/harness-types";
import { DEFAULT_HARNESS_CONFIG } from "../../../shared/harness-types";
import type { ChatMessage } from "../../../shared/chat-types";
import type { IFireflyLlmProvider } from "../../llm/providers/provider-types";
import type { IAgentCore } from "../../../shared/agent-core";
import { LocalFireflyProvider } from "../../llm/providers/local-firefly-provider";
import { FireflyToolRegistry } from "../../tools/tool-registry";
import { FireflyToolDispatcher } from "../../tools/tool-dispatcher";
import { FireflyMemoryService } from "../../character/memory/memory-service";
import { buildRoundMessages, buildFireflySystemPrompt } from "./harness-context";
import { executeToolRound } from "./tool-round";
import { compactMessagesIfNeeded, computeTokenBudget } from "./compaction";
import { InMemoryCheckpointStore } from "./checkpoint";

export interface FireflyHarnessOptions {
  provider?: IFireflyLlmProvider;
  toolRegistry: FireflyToolRegistry;
  memoryService?: FireflyMemoryService;
  config?: Partial<HarnessConfig>;
}

export class FireflyHarness implements IAgentCore {
  private provider: IFireflyLlmProvider;
  private readonly toolRegistry: FireflyToolRegistry;
  private readonly toolDispatcher: FireflyToolDispatcher;
  private readonly memoryService?: FireflyMemoryService;
  private readonly config: HarnessConfig;
  private readonly activeRuns = new Map<string, AbortController>();
  private readonly checkpointStore = new InMemoryCheckpointStore();

  constructor(options: FireflyHarnessOptions) {
    this.provider = options.provider || new LocalFireflyProvider();
    this.toolRegistry = options.toolRegistry;
    this.toolDispatcher = new FireflyToolDispatcher(this.toolRegistry);
    this.memoryService = options.memoryService;
    this.config = { ...DEFAULT_HARNESS_CONFIG, ...(options.config || {}) };
  }

  setProvider(provider: IFireflyLlmProvider): void {
    this.provider = provider;
  }

  getProvider(): IFireflyLlmProvider {
    return this.provider;
  }

  getCheckpoint(runId: string) {
    return this.checkpointStore.get(runId);
  }

  async run(
    input: HarnessInput,
    emitter?: (event: HarnessEvent) => void,
  ): Promise<HarnessResult> {
    const startTime = Date.now();
    const runId = input.runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const conversationId = input.conversationId;

    // Auto extract user facts into long-term memory
    if (this.memoryService && input.userPrompt) {
      const extracted = this.memoryService.extractFromText(input.userPrompt);
      for (const item of extracted) {
        this.memoryService.remember(item.key, item.value, "chat_auto_extract");
      }
    }

    const runAbortController = new AbortController();
    if (input.signal) {
      if (input.signal.aborted) runAbortController.abort();
      else input.signal.addEventListener("abort", () => runAbortController.abort(), { once: true });
    }
    this.activeRuns.set(runId, runAbortController);

    // Timeout guard for entire run
    let runTimeoutId: NodeJS.Timeout | null = null;
    if (this.config.totalTimeoutMs > 0) {
      runTimeoutId = setTimeout(() => {
        runAbortController.abort();
      }, this.config.totalTimeoutMs);
    }

    emitter?.({ type: "run_created", runId });

    let status: HarnessRunStatus = "running";
    let roundsCount = 0;
    let toolCallsCount = 0;
    let errorMsg: string | undefined;

    // 1. Build Memory Context
    const memoryContext =
      input.memoryContext ?? this.memoryService?.buildMemoryContext(input.userPrompt) ?? "";

    // 2. Build initial context messages & system prompt
    const systemPrompt =
      input.systemPromptOverride ||
      buildFireflySystemPrompt(input.characterState, memoryContext);

    let messages = buildRoundMessages({
      userPrompt: input.userPrompt,
      history: input.history,
      characterState: input.characterState,
      memoryContext,
      systemPromptOverride: input.systemPromptOverride,
    });

    // Save initial checkpoint
    this.checkpointStore.save({
      runId,
      conversationId,
      round: 0,
      status,
      transcript: messages,
      toolCallsCount,
      createdAt: startTime,
      updatedAt: startTime,
    });

    try {
      // Main Agent Loop
      while (roundsCount < this.config.maxRounds) {
        if (runAbortController.signal.aborted) {
          status = "cancelled";
          break;
        }

        roundsCount++;
        const roundId = `${runId}:r${roundsCount}`;
        emitter?.({ type: "round_start", roundId, round: roundsCount });

        // Tool schemas
        const toolSchemas = this.toolRegistry.getToolSchemas();

        // Mid-loop compaction check & context usage report
        const compactionRes = compactMessagesIfNeeded(messages, systemPrompt, toolSchemas, this.config);
        messages = compactionRes.messages;

        const usageSnapshot = computeTokenBudget(systemPrompt, toolSchemas, messages, this.config);
        emitter?.({ type: "context_usage", snapshot: usageSnapshot });

        // Round LLM Call
        status = "running";
        const roundResponse = await this.provider.generateCompletion(
          {
            messages,
            tools: toolSchemas.length > 0 ? toolSchemas : undefined,
          },
          runAbortController.signal,
          (delta) => {
            emitter?.({ type: "progress_text", delta });
          },
        );

        if (runAbortController.signal.aborted) {
          status = "cancelled";
          emitter?.({ type: "round_end", roundId, round: roundsCount });
          break;
        }

        const asstMessage = roundResponse.message;

        // Case A: LLM requested Tool Calls
        if (asstMessage.toolCalls && asstMessage.toolCalls.length > 0) {
          status = "waiting_tool";
          toolCallsCount += asstMessage.toolCalls.length;

          // Assistant message with toolCalls MUST be recorded to transcript before executing tool round
          const asstEntry: ChatMessage = {
            id: `asst-${Date.now()}-${roundsCount}`,
            role: "assistant",
            content: asstMessage.content || "",
            toolCalls: asstMessage.toolCalls,
            timestamp: Date.now(),
          };
          messages.push(asstEntry);

          // Emit tool_start events
          for (const tc of asstMessage.toolCalls) {
            emitter?.({ type: "tool_start", toolCallId: tc.id, toolName: tc.name, args: tc.arguments });
          }

          // Execute Tool Round
          const toolObservations = await executeToolRound(asstMessage.toolCalls, {
            dispatcher: this.toolDispatcher,
            toolTimeoutMs: this.config.toolTimeoutMs,
            userQuery: input.userPrompt,
            conversationId,
            signal: runAbortController.signal,
          });

          // Append each Tool Result to transcript
          for (const obs of toolObservations) {
            emitter?.({ type: "tool_end", toolCallId: obs.call.id, outcome: obs.outcome, preview: obs.preview });
            const toolEntry: ChatMessage = {
              id: `tool-${Date.now()}-${obs.call.id}`,
              role: "tool",
              content: obs.result.output,
              toolCallId: obs.call.id,
              timestamp: Date.now(),
            };
            messages.push(toolEntry);
          }

          // Checkpoint update
          this.checkpointStore.save({
            runId,
            conversationId,
            round: roundsCount,
            status,
            transcript: messages,
            toolCallsCount,
            createdAt: startTime,
            updatedAt: Date.now(),
          });

          emitter?.({ type: "round_end", roundId, round: roundsCount });

          // Continue to next round so LLM can observe tool results and formulate answer
          continue;
        }

        // Case B: LLM returned final text response (No tool calls)
        const finalAsstEntry: ChatMessage = {
          id: `asst-${Date.now()}`,
          role: "assistant",
          content: asstMessage.content || "",
          timestamp: Date.now(),
        };
        messages.push(finalAsstEntry);

        emitter?.({ type: "final_answer", content: asstMessage.content || "" });
        emitter?.({ type: "round_end", roundId, round: roundsCount });

        status = "completed";
        break;
      }

      if (roundsCount >= this.config.maxRounds && status !== "completed") {
        status = "completed";
      }
    } catch (err: any) {
      if (runAbortController.signal.aborted) {
        status = "cancelled";
      } else {
        status = "error";
        const msg = err?.message ? String(err.message) : String(err);
        errorMsg = msg;
        emitter?.({ type: "run_error", runId, error: msg });
      }
    } finally {
      if (runTimeoutId) clearTimeout(runTimeoutId);
      this.activeRuns.delete(runId);
    }

    const lastAsst = messages.filter((m) => m.role === "assistant").pop();
    // Factual statuses only. A real execution error must NEVER be disguised
    // as a persona reply ("我在这里，开拓者。") — error runs produce empty
    // finalText so no downstream consumer can broadcast a fake response.
    const fallbackText = status === "cancelled" ? "（对话已被取消）" : "";
    const finalText: string =
      status === "error"
        ? ""
        : lastAsst && typeof lastAsst.content === "string" && lastAsst.content.length > 0
          ? lastAsst.content
          : fallbackText;

    const result: HarnessResult = {
      runId,
      conversationId,
      status,
      finalText,
      transcript: messages,
      toolCallsCount,
      roundsCount,
      error: errorMsg,
      durationMs: Date.now() - startTime,
    };

    // Save terminal checkpoint
    this.checkpointStore.save({
      runId,
      conversationId,
      round: roundsCount,
      status,
      transcript: messages,
      toolCallsCount,
      createdAt: startTime,
      updatedAt: Date.now(),
    });

    emitter?.({ type: "run_completed", runId, result });
    return result;
  }

  cancel(runId: string): boolean {
    const controller = this.activeRuns.get(runId);
    if (controller) {
      controller.abort();
      this.activeRuns.delete(runId);
      return true;
    }
    return false;
  }

  cancelAll(): void {
    for (const [id, controller] of this.activeRuns.entries()) {
      controller.abort();
    }
    this.activeRuns.clear();
  }
}
