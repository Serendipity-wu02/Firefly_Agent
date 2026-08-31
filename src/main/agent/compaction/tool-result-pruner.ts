import type { ChatMessage } from "../../../shared/chat-types";

export interface PruningConfig {
  maxResultChars: number;
  headChars: number;
  tailChars: number;
  middleMarker: string;
  preserveErrors: boolean;
}

export const DEFAULT_PRUNING_CONFIG: PruningConfig = {
  maxResultChars: 4_096,
  headChars: 2_048,
  tailChars: 512,
  middleMarker: "\n\n[... 工具输出过长，中间内容已自动修剪 ...]\n\n",
  preserveErrors: true,
};

/**
 * ToolResultPruner (工具结果上下文级修剪器)
 *
 * 针对历史中超长或冗余的 tool 结果执行安全的即时/投影级头尾采样修剪，
 * 保护小结果不被破坏，同时防止单次大工具输出撑爆上下文窗口。
 */
export class ToolResultPruner {
  /**
   * 修剪单段工具文本
   */
  static pruneText(
    text: string,
    customConfig?: Partial<PruningConfig>,
    isError?: boolean,
  ): { text: string; pruned: boolean } {
    if (!text) return { text: "", pruned: false };

    const config: PruningConfig = { ...DEFAULT_PRUNING_CONFIG, ...customConfig };

    // 错误结果若配置为保留，且长度在合理容忍范围内（如 2 倍预算内），不激进截断
    if (isError && config.preserveErrors && text.length <= config.maxResultChars * 2) {
      return { text, pruned: false };
    }

    const chars = Array.from(text);
    if (chars.length <= config.maxResultChars) {
      return { text, pruned: false };
    }

    const head = chars.slice(0, config.headChars).join("");
    const tail = chars.slice(-config.tailChars).join("");
    const prunedText = `${head}${config.middleMarker}${tail}`;

    return { text: prunedText, pruned: true };
  }

  /**
   * 修剪单个 ChatMessage (仅对 role === 'tool' 的消息生效)
   */
  static pruneMessage(
    message: ChatMessage,
    customConfig?: Partial<PruningConfig>,
  ): { message: ChatMessage; pruned: boolean } {
    if (message.role !== "tool") {
      return { message, pruned: false };
    }

    const content = message.content || "";
    let isError = false;
    try {
      const parsed = JSON.parse(content);
      if (parsed && parsed.ok === false) {
        isError = true;
      }
    } catch {}

    const { text, pruned } = this.pruneText(content, customConfig, isError);
    if (!pruned) {
      return { message, pruned: false };
    }

    return {
      message: {
        ...message,
        content: text,
      },
      pruned: true,
    };
  }

  /**
   * 批量修剪消息列表中的工具输出 (返回全新投影数组，不污染原始对象)
   */
  static pruneMessages(
    messages: ChatMessage[],
    customConfig?: Partial<PruningConfig>,
  ): { messages: ChatMessage[]; prunedCount: number } {
    let prunedCount = 0;
    const result: ChatMessage[] = [];

    for (const msg of messages) {
      if (msg.role === "tool") {
        const { message: prunedMsg, pruned } = this.pruneMessage(msg, customConfig);
        if (pruned) prunedCount++;
        result.push(prunedMsg);
      } else {
        result.push(msg);
      }
    }

    return { messages: result, prunedCount };
  }
}
