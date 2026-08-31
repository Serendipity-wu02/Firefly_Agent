export type ProviderId = "local" | "openai" | "deepseek" | "openrouter" | "custom";

export interface LlmProviderConfig {
  provider: ProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  enableStreaming: boolean;
}

export const PROVIDER_PRESETS: Record<ProviderId, { name: string; baseUrl: string; defaultModel: string }> = {
  local: {
    name: "内置智能规则 (Local Test)",
    baseUrl: "",
    defaultModel: "local-firefly-v1",
  },
  openai: {
    name: "OpenAI 官方",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
  },
  deepseek: {
    name: "DeepSeek 官方",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
  },
  openrouter: {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "deepseek/deepseek-chat",
  },
  custom: {
    name: "自定义 OpenAI 兼容接口",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "qwen2.5:7b",
  },
};

export const DEFAULT_LLM_CONFIG: LlmProviderConfig = {
  provider: "local",
  baseUrl: "",
  apiKey: "",
  model: "local-firefly-v1",
  temperature: 0.7,
  enableStreaming: true,
};

// ── Provider interface types ────────────────────────────────────────────────
// Kept in shared/ so that IAgentCore can reference IFireflyLlmProvider
// without creating a circular dependency through the main/ layer.

import type { ChatCompletionRequest, ChatCompletionResponse } from "./chat-types";

export interface ProviderCapabilities {
  supportsNativeToolCalling: boolean;
  supportsStreaming: boolean;
}

/**
 * Stable contract for any LLM backend.
 * Implementors: LocalFireflyProvider, OpenAiFireflyProvider.
 * Future implementations must satisfy this interface only.
 */
export interface IFireflyLlmProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  generateCompletion(
    request: ChatCompletionRequest,
    signal?: AbortSignal,
    onChunk?: (delta: string) => void,
  ): Promise<ChatCompletionResponse>;
  /** Optional: update runtime config (e.g. after settings are saved). */
  updateConfig?(config: Partial<LlmProviderConfig>): void;
  /** Optional: retrieve current config for display. */
  getConfig?(): Readonly<LlmProviderConfig>;
}

