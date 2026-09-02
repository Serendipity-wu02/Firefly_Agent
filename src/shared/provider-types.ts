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

export type ProviderStatusType = "online" | "offline" | "error";

export interface ProviderStatus {
  status: ProviderStatusType;
  providerId: ProviderId;
  providerName: string;
  model?: string;
  label: string;
  details?: string;
}

export function evaluateProviderStatus(config?: Partial<LlmProviderConfig>, lastError?: string): ProviderStatus {
  const provider = config?.provider || "local";
  const preset = PROVIDER_PRESETS[provider];
  const providerName = preset?.name || provider;
  const model = config?.model || preset?.defaultModel || "";

  if (lastError) {
    return {
      status: "error",
      providerId: provider,
      providerName,
      model,
      label: "服务异常",
      details: lastError,
    };
  }

  if (provider === "local") {
    return {
      status: "online",
      providerId: "local",
      providerName: "内置智能规则 (Local)",
      model: "local-rule",
      label: "内置规则引擎 (Local)",
      details: "流萤内置智能规则与工具调度引擎已就绪",
    };
  }

  const apiKey = (config?.apiKey || "").trim();
  const baseUrl = (config?.baseUrl || preset?.baseUrl || "").trim();

  if (!baseUrl || (!apiKey && provider !== "custom")) {
    return {
      status: "offline",
      providerId: provider,
      providerName,
      model,
      label: "未配置 API (离线)",
      details: `请在设置中配置 ${providerName} 的有效 API Key 与端点`,
    };
  }

  return {
    status: "online",
    providerId: provider,
    providerName,
    model,
    label: `${providerName} · ${model}`,
    details: `已连接 ${providerName} 模型 [${model}]`,
  };
}

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

