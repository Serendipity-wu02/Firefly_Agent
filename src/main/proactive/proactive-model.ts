import type { MainMemoryRun } from "../memory-context/main-memory-runtime";
import type { TranscriptSink } from "../orchestrator/transcript-sink";
import { recordUsage, recordRequest } from "../token-usage-store";
import {
  getAdapterForConfig,
  type ChatMessage,
  type VendorConfig,
} from "../orchestrator/vendors";
import { parseProactiveDecision, type ProactiveModelDecision } from "./proactive-prompt";

export type ProactiveModelResult =
  | ProactiveModelDecision
  | { kind: "error"; reason: string };

export interface RunProactiveModelInput {
  settings: VendorConfig;
  messages: ChatMessage[];
  timeoutMs: number;
  fetchFn?: typeof fetch;
  memoryRun?: MainMemoryRun;
  transcriptSink?: TranscriptSink;
  signal?: AbortSignal;
}

function containsToolContent(messages: ChatMessage[]): boolean {
  return messages.some((message) => (
    message.role === "tool" ||
    Boolean(message.toolCallId) ||
    Boolean(message.toolCalls?.length)
  ));
}

export async function runProactiveModel(input: RunProactiveModelInput): Promise<ProactiveModelResult> {
  if (containsToolContent(input.messages)) {
    return { kind: "error", reason: "tool_content_forbidden" };
  }

  const adapter = getAdapterForConfig(input.settings);
  const modelRequest = {
    model: input.settings.model,
    messages: input.messages,
    stream: false,
    maxTokens: 600,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, input.timeoutMs));
  const signal = input.signal ? AbortSignal.any([input.signal, controller.signal]) : controller.signal;
  try {
    if (signal.aborted) throw Error("MEMORY_CONTEXT_CANCELLED");
    if (input.memoryRun) {
      if (!input.transcriptSink) throw Error("MEMORY_CONTEXT_STREAM_SINK_DENIED");
      const response = await input.memoryRun.call({ adapter, request: modelRequest, config: input.settings, timeoutMs: input.timeoutMs, signal });
      if (signal.aborted) throw Error("MEMORY_CONTEXT_CANCELLED");
      const sink = input.memoryRun.bindSink(input.transcriptSink);
      await sink.appendAssistant({ message: response.assistantMessage ?? { role: "assistant", content: response.text ?? "" } });
      await sink.checkpoint();
      recordRequest(input.settings.model);
      if (response.usage) recordUsage(response.usage.input, response.usage.output, 1, response.usage.cachedInput, input.settings.model, response.usage.cacheCreation);
      return parseProactiveDecision(response.text ?? "");
    }
    const request = adapter.buildRequest(modelRequest, input.settings);
    const response = await (input.fetchFn ?? fetch)(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      signal,
    });
    if (!response.ok) return { kind: "error", reason: `http_${response.status}` };

    const raw = await response.json();
    let parsedResponse;
    try {
      parsedResponse = adapter.parseResponse(raw);
    } catch {
      return { kind: "invalid", reason: "invalid_provider_response" };
    }
    recordRequest(input.settings.model);
    if (parsedResponse.usage) {
      recordUsage(parsedResponse.usage.input, parsedResponse.usage.output, 1, parsedResponse.usage.cachedInput, input.settings.model, parsedResponse.usage.cacheCreation);
    }
    return parseProactiveDecision(parsedResponse.text ?? "");
  } catch (error) {
    if (error instanceof Error && /^MEMORY_[A-Z0-9_]+$/.test(error.message)) return { kind: "error", reason: error.message };
    const name = error instanceof Error ? error.name : "";
    return { kind: "error", reason: name === "AbortError" ? "timeout" : "network_error" };
  } finally {
    clearTimeout(timer);
  }
}
