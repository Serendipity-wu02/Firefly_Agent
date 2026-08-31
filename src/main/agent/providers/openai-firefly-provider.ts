import type { IFireflyLlmProvider, ProviderCapabilities } from "./provider-types";
import type { ChatCompletionRequest, ChatCompletionResponse } from "../../../shared/chat-types";
import type { LlmProviderConfig } from "../../../shared/provider-types";
import { createStreamingAccumulator, processSseChunk, finalizeAccumulator } from "./sse-tool-parser";

export class OpenAiFireflyProvider implements IFireflyLlmProvider {
  readonly id = "openai-compatible";
  readonly name: string;
  readonly capabilities: ProviderCapabilities = {
    supportsNativeToolCalling: true,
    supportsStreaming: true,
  };

  private config: LlmProviderConfig;

  constructor(config: LlmProviderConfig, name = "OpenAI 兼容外部模型") {
    this.name = name;
    this.config = { ...config };
  }

  updateConfig(config: Partial<LlmProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): Readonly<LlmProviderConfig> {
    return this.config;
  }

  async generateCompletion(
    request: ChatCompletionRequest,
    signal?: AbortSignal,
    onChunk?: (delta: string) => void,
  ): Promise<ChatCompletionResponse> {
    const rawBaseUrl = this.config.baseUrl?.trim().replace(/\/+$/, "");
    if (!rawBaseUrl) {
      throw new Error("模型配置错误：Base URL 为空，请在设置中配置有效端点。");
    }

    const url = `${rawBaseUrl}/chat/completions`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const apiKey =
      (this.config.apiKey && this.config.apiKey.trim()) ||
      process.env.FIREFLY_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.DEEPSEEK_API_KEY ||
      "";
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey.trim()}`;
    }

    // Format messages for standard OpenAI Chat Completions API
    const formattedMessages = request.messages.map((m) => {
      const msg: Record<string, unknown> = {
        role: m.role,
        content: m.content || "",
      };
      if (m.toolCalls && m.toolCalls.length > 0) {
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments),
          },
        }));
      }
      if (m.toolCallId) {
        msg.tool_call_id = m.toolCallId;
      }
      return msg;
    });

    const isStreaming = this.config.enableStreaming && typeof onChunk === "function";

    const bodyPayload: Record<string, unknown> = {
      model: this.config.model || "gpt-4o-mini",
      messages: formattedMessages,
      temperature: request.temperature ?? this.config.temperature ?? 0.7,
      stream: isStreaming,
    };

    if (request.tools && request.tools.length > 0) {
      bodyPayload.tools = request.tools;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyPayload),
        signal,
      });
    } catch (err: any) {
      if (signal?.aborted) {
        throw new Error("请求已被用户取消。");
      }
      throw new Error(`网络连接失败 (${err?.message || "无法连接到大模型服务器"})`);
    }

    if (!response.ok) {
      let errDetail = "";
      try {
        errDetail = await response.text();
      } catch { }

      // Secure, user-friendly error classification
      switch (response.status) {
        case 401:
          throw new Error("API 密钥无效或未授权 (401 Unauthorized)，请检查 API Key 设置。");
        case 403:
          throw new Error("权限受限 (403 Forbidden)，请确认账号有权访问该端点或模型。");
        case 404:
          throw new Error(`模型或端点不存在 (404 Not Found)，请核对 Model [${this.config.model}] 或 Base URL。`);
        case 429:
          throw new Error("API 调用频率受限或账户余额不足 (429 Too Many Requests / Quota Exceeded)。");
        case 500:
        case 502:
        case 503:
        case 504:
          throw new Error(`服务商服务器暂时不可用 (HTTP ${response.status})，请稍后重试。`);
        default:
          throw new Error(`大模型接口异常 (HTTP ${response.status}): ${errDetail.slice(0, 300)}`);
      }
    }

    // Path A: Streaming response with SSE parser
    if (isStreaming && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      const accumulator = createStreamingAccumulator();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunkStr = decoder.decode(value, { stream: true });
          processSseChunk(chunkStr, accumulator, onChunk);
        }
      } catch (streamErr: any) {
        if (signal?.aborted) throw new Error("流式传输已被取消。");
        throw new Error(`流式响应中断：${streamErr?.message || "连接异常"}`);
      }

      const finalRes = finalizeAccumulator(accumulator);
      return {
        message: {
          role: "assistant",
          content: finalRes.content,
          toolCalls: finalRes.toolCalls,
        },
      };
    }

    // Path B: Standard Non-streaming response
    const data: any = await response.json();
    const choice = data.choices?.[0]?.message;
    if (!choice) {
      throw new Error("大模型返回格式异常：缺失 choices[0].message 字段。");
    }

    let toolCalls = undefined;
    if (choice.tool_calls && Array.isArray(choice.tool_calls)) {
      toolCalls = choice.tool_calls.map((tc: any) => {
        let args = {};
        try {
          args = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments;
        } catch {
          args = { raw: tc.function.arguments };
        }
        return {
          id: tc.id || `call_${Date.now()}`,
          name: tc.function.name,
          arguments: args,
        };
      });
    }

    const content = choice.content || "";
    if (onChunk && content) {
      onChunk(content);
    }

    return {
      message: {
        role: "assistant",
        content,
        toolCalls,
      },
    };
  }
}
