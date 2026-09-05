import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "../../../shared/chat-types";
import type { IFireflyLlmProvider } from "../../../shared/provider-types";

/**
 * Thin LLM boundary for the Harness.
 *
 * Provider URLs, model selection, authentication, and provider-specific
 * behavior remain owned by the provider implementations.
 */
export function requestHarnessCompletion(
  provider: IFireflyLlmProvider,
  request: ChatCompletionRequest,
  signal: AbortSignal,
  onProgress?: (delta: string) => void,
): Promise<ChatCompletionResponse> {
  return provider.generateCompletion(request, signal, onProgress);
}
