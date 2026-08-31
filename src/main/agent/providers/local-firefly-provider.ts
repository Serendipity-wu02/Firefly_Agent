import type { IFireflyLlmProvider, ProviderCapabilities } from "./provider-types";
import type { ChatCompletionRequest, ChatCompletionResponse } from "../../../shared/chat-types";

/**
 * 本地智能测试与规则 Provider（具备完整结构化 Tool Calling 能力）
 */
export class LocalFireflyProvider implements IFireflyLlmProvider {
  readonly id = "local-rule";
  readonly name = "流萤内置智能规则引擎 (Local Test Provider)";
  readonly capabilities: ProviderCapabilities = {
    supportsNativeToolCalling: true,
    supportsStreaming: true,
  };

  async generateCompletion(
    request: ChatCompletionRequest,
    _signal?: AbortSignal,
    onChunk?: (delta: string) => void,
  ): Promise<ChatCompletionResponse> {
    const lastMsg = request.messages[request.messages.length - 1];

    // If previous message was a tool result, produce final natural completion
    if (lastMsg.role === "tool") {
      let actionAlias = "开心";
      try {
        const parsed = JSON.parse(lastMsg.content);
        if (parsed.alias) actionAlias = parsed.alias;
      } catch {}

      const finalText = `（做出了${actionAlias}的动作）开拓者，我在这里呢！今天想和我聊些什么呢？`;
      onChunk?.(finalText);

      return {
        message: {
          role: "assistant",
          content: finalText,
        },
      };
    }

    const text = lastMsg.content || "";

    // Action matching rules
    let chosenActionAlias: string | null = null;
    if (/笑|开心|高兴|乐/i.test(text)) chosenActionAlias = "开心";
    else if (/想|思考|怎么看|分析/i.test(text)) chosenActionAlias = "思考";
    else if (/打招呼|你好|嗨|hello|早安|晚安/i.test(text)) chosenActionAlias = "打招呼";
    else if (/看书|读书|学习/i.test(text)) chosenActionAlias = "看书";
    else if (/困|累|睡|眯/i.test(text)) chosenActionAlias = "困了";
    else if (/害羞|脸红/i.test(text)) chosenActionAlias = "害羞";
    else if (/感动|摸头|喜欢你/i.test(text)) chosenActionAlias = "感动";
    else if (/惊讶|真的吗|哇/i.test(text)) chosenActionAlias = "惊讶";

    // If tools are provided and an action was requested, return a structured Tool Call!
    if (request.tools && request.tools.some((t) => t.function.name === "play_live2d_action") && chosenActionAlias) {
      return {
        message: {
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: "play_live2d_action",
              arguments: { name: chosenActionAlias },
            },
          ],
        },
      };
    }

    // Default conversational responses
    let reply = "开拓者，今天也要一起看星星吗？无论去哪里，我都想和你在一起。";
    if (/你是谁|流萤是谁/i.test(text)) {
      reply = "我是流萤。对我来说，与开拓者相遇的每一刻，都是我最珍贵的回忆。";
    } else if (/蛋糕|吃/i.test(text)) {
      reply = "橡木蛋糕卷！甜甜的，吃一口心情就会变好。谢谢你总是想着我！";
    }

    onChunk?.(reply);

    return {
      message: {
        role: "assistant",
        content: reply,
      },
    };
  }
}
