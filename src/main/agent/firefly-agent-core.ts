import type {
  HarnessConfig,
  HarnessInput,
  HarnessResult,
  HarnessEvent,
  HarnessRunStatus,
} from "../../shared/harness-types";
import { DEFAULT_HARNESS_CONFIG } from "../../shared/harness-types";
import type { ChatMessage } from "../../shared/chat-types";
import type { IFireflyLlmProvider } from "../../shared/provider-types";
import type { IAgentCore } from "../../shared/agent-core";
import { LocalFireflyProvider } from "./providers/local-firefly-provider";
import { FireflyToolRegistry } from "../tools/tool-registry";
import { FireflyToolDispatcher } from "../tools/tool-dispatcher";
import { FireflyMemoryService } from "../memory/memory-service";
import { buildRoundMessages } from "./harness/harness-context";
import { AgentSession } from "./agent-session";
import { AgentEventBus } from "./agent-events";

export interface FireflyAgentCoreOptions {
  provider?: IFireflyLlmProvider;
  toolRegistry: FireflyToolRegistry;
  memoryService?: FireflyMemoryService;
  config?: Partial<HarnessConfig>;
  eventBus?: AgentEventBus;
}

/**
 * FireflyAgentCore (v1)
 *
 * Implements IAgentCore with an independent Agent Loop decoupled from UI, TTS, and Live2D.
 * Connects directly to:
 * - IFireflyLlmProvider (model agnostic)
 * - FireflyToolRegistry & FireflyToolDispatcher
 * - AgentSession (stateful message transcript)
 * - AgentEventBus (typed event emitter)
 * - FireflyMemoryService (long-term memory extraction)
 */
export class FireflyAgentCore implements IAgentCore {
  private provider: IFireflyLlmProvider;
  private readonly toolRegistry: FireflyToolRegistry;
  private readonly toolDispatcher: FireflyToolDispatcher;
  private readonly memoryService?: FireflyMemoryService;
  private readonly config: HarnessConfig;
  private readonly eventBus: AgentEventBus;
  private readonly activeRuns = new Map<string, AbortController>();

  constructor(options: FireflyAgentCoreOptions) {
    this.provider = options.provider || new LocalFireflyProvider();
    this.toolRegistry = options.toolRegistry;
    this.toolDispatcher = new FireflyToolDispatcher(this.toolRegistry);
    this.memoryService = options.memoryService;
    this.config = { ...DEFAULT_HARNESS_CONFIG, ...(options.config || {}) };
    this.eventBus = options.eventBus || new AgentEventBus();
  }

  setProvider(provider: IFireflyLlmProvider): void {
    this.provider = provider;
  }

  getProvider(): IFireflyLlmProvider {
    return this.provider;
  }

  getEventBus(): AgentEventBus {
    return this.eventBus;
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

  async run(
    input: HarnessInput,
    legacyEmitter?: (event: HarnessEvent) => void,
  ): Promise<HarnessResult> {
    const startTime = Date.now();
    const runId = input.runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const conversationId = input.conversationId;

    // 1. Auto extract user facts into long-term memory
    if (this.memoryService && input.userPrompt) {
      const extracted = this.memoryService.extractFromText(input.userPrompt);
      for (const item of extracted) {
        this.memoryService.remember(item.key, item.value, "chat_auto_extract");
      }
    }

    // 2. Setup AbortController for Cancellation & Timeout
    const runAbortController = new AbortController();
    if (input.signal) {
      if (input.signal.aborted) runAbortController.abort();
      else input.signal.addEventListener("abort", () => runAbortController.abort(), { once: true });
    }
    this.activeRuns.set(runId, runAbortController);

    let timedOut = false;
    let runTimeoutId: NodeJS.Timeout | null = null;
    if (this.config.totalTimeoutMs > 0) {
      runTimeoutId = setTimeout(() => {
        timedOut = true;
        runAbortController.abort();
      }, this.config.totalTimeoutMs);
    }

    // 3. Build Context & Initialize AgentSession
    const memoryContext =
      input.memoryContext ?? this.memoryService?.buildMemoryContext(input.userPrompt) ?? "";

    const initialMessages = buildRoundMessages({
      userPrompt: input.userPrompt,
      history: input.history,
      characterState: input.characterState,
      memoryContext,
      systemPromptOverride: input.systemPromptOverride,
    });

    const session = new AgentSession({ initialMessages });

    this.eventBus.emit({
      type: "agent:started",
      runId,
      prompt: input.userPrompt,
      timestamp: startTime,
    });
    legacyEmitter?.({ type: "run_created", runId });

    let status: HarnessRunStatus = "running";
    let stepCount = 0;
    let toolCallsCount = 0;
    let errorMsg: string | undefined;

    // 4. Main Multi-Turn Agent Loop
    try {
      while (stepCount < this.config.maxRounds) {
        if (runAbortController.signal.aborted) {
          status = timedOut ? "timeout" : "cancelled";
          if (timedOut) errorMsg = `Run timed out after ${this.config.totalTimeoutMs}ms`;
          break;
        }

        stepCount++;
        const roundId = `${runId}:s${stepCount}`;

        this.eventBus.emit({
          type: "agent:step-start",
          runId,
          step: stepCount,
          timestamp: Date.now(),
        });
        legacyEmitter?.({ type: "round_start", roundId, round: stepCount });

        const toolSchemas = this.toolRegistry.getToolSchemas();

        this.eventBus.emit({
          type: "agent:llm-request",
          runId,
          step: stepCount,
          messageCount: session.size(),
          timestamp: Date.now(),
        });

        // Call Provider
        const roundResponse = await this.provider.generateCompletion(
          {
            messages: session.getMessages(),
            tools: toolSchemas.length > 0 ? toolSchemas : undefined,
          },
          runAbortController.signal,
          (delta) => {
            legacyEmitter?.({ type: "progress_text", delta });
          },
        );

        if (runAbortController.signal.aborted) {
          status = timedOut ? "timeout" : "cancelled";
          if (timedOut) errorMsg = `Run timed out after ${this.config.totalTimeoutMs}ms`;
          legacyEmitter?.({ type: "round_end", roundId, round: stepCount });
          break;
        }

        const asstMessage = roundResponse.message;

        // Branch A: LLM requested tool calls
        if (asstMessage.toolCalls && asstMessage.toolCalls.length > 0) {
          const asstEntry: ChatMessage = {
            id: `asst-${Date.now()}-${stepCount}`,
            role: "assistant",
            content: asstMessage.content || "",
            toolCalls: asstMessage.toolCalls,
            timestamp: Date.now(),
          };
          session.append(asstEntry);

          this.eventBus.emit({
            type: "agent:assistant-message",
            runId,
            step: stepCount,
            content: asstMessage.content || "",
            toolCalls: asstMessage.toolCalls,
            timestamp: Date.now(),
          });

          for (const tc of asstMessage.toolCalls) {
            toolCallsCount++;

            this.eventBus.emit({
              type: "agent:tool-call",
              runId,
              step: stepCount,
              toolCallId: tc.id,
              toolName: tc.name,
              args: typeof tc.arguments === "string" ? JSON.parse(tc.arguments || "{}") : tc.arguments,
              timestamp: Date.now(),
            });
            legacyEmitter?.({
              type: "tool_start",
              toolCallId: tc.id,
              toolName: tc.name,
              args: typeof tc.arguments === "string" ? JSON.parse(tc.arguments || "{}") : tc.arguments,
            });

            // Execute Tool via Tool Dispatcher
            const toolResult = await this.toolDispatcher.executeToolCall(tc, {
              conversationId,
              userQuery: input.userPrompt,
              signal: runAbortController.signal,
            });

            this.eventBus.emit({
              type: "agent:tool-result",
              runId,
              step: stepCount,
              toolCallId: tc.id,
              toolName: tc.name,
              output: toolResult.output,
              isError: !!toolResult.isError,
              timestamp: Date.now(),
            });
            legacyEmitter?.({
              type: "tool_end",
              toolCallId: tc.id,
              outcome: toolResult.isError ? "failure" : "success",
              preview: toolResult.output.slice(0, 100),
            });

            const toolEntry: ChatMessage = {
              id: `tool-${Date.now()}-${tc.id}`,
              role: "tool",
              content: toolResult.output,
              toolCallId: tc.id,
              timestamp: Date.now(),
            };
            session.append(toolEntry);
          }

          legacyEmitter?.({ type: "round_end", roundId, round: stepCount });
          // Loop continues to next turn
          continue;
        }

        // Branch B: Final assistant response without tool calls
        const finalAsstEntry: ChatMessage = {
          id: `asst-${Date.now()}`,
          role: "assistant",
          content: asstMessage.content || "",
          timestamp: Date.now(),
        };
        session.append(finalAsstEntry);

        this.eventBus.emit({
          type: "agent:assistant-message",
          runId,
          step: stepCount,
          content: asstMessage.content || "",
          timestamp: Date.now(),
        });

        this.eventBus.emit({
          type: "agent:final-answer",
          runId,
          content: asstMessage.content || "",
          timestamp: Date.now(),
        });
        legacyEmitter?.({ type: "final_answer", content: asstMessage.content || "" });
        legacyEmitter?.({ type: "round_end", roundId, round: stepCount });

        status = "completed";
        break;
      }

      if (stepCount >= this.config.maxRounds && status !== "completed" && status !== "cancelled") {
        status = "completed";
      }
    } catch (err: any) {
      if (runAbortController.signal.aborted) {
        status = timedOut ? "timeout" : "cancelled";
        if (timedOut) errorMsg = `Run timed out after ${this.config.totalTimeoutMs}ms`;
      } else {
        status = "error";
        const msg = err?.message ? String(err.message) : String(err);
        errorMsg = msg;
        this.eventBus.emit({
          type: "agent:error",
          runId,
          error: msg,
          timestamp: Date.now(),
        });
        legacyEmitter?.({ type: "run_error", runId, error: msg });
      }
    } finally {
      if (runTimeoutId) clearTimeout(runTimeoutId);
      this.activeRuns.delete(runId);
    }

    if (status === "cancelled") {
      this.eventBus.emit({
        type: "agent:cancelled",
        runId,
        timestamp: Date.now(),
      });
    }

    const lastAsst = session
      .getMessages()
      .filter((m) => m.role === "assistant")
      .pop();

    const fallbackText =
      status === "cancelled"
        ? "（对话已被取消）"
        : status === "timeout"
          ? "（对话请求已超时）"
          : "我在这里，开拓者。";
    const finalText: string =
      lastAsst && typeof lastAsst.content === "string" && lastAsst.content.length > 0
        ? lastAsst.content
        : fallbackText;

    const durationMs = Date.now() - startTime;

    const result: HarnessResult = {
      runId,
      conversationId,
      status,
      finalText,
      transcript: session.getMessages(),
      toolCallsCount,
      roundsCount: stepCount,
      error: errorMsg,
      durationMs,
    };

    this.eventBus.emit({
      type: "agent:finished",
      runId,
      status,
      durationMs,
      toolCallsCount,
      stepsCount: stepCount,
      timestamp: Date.now(),
    });
    legacyEmitter?.({ type: "run_completed", runId, result });

    return result;
  }
}
