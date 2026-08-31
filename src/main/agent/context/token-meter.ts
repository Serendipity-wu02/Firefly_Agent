import type { ChatMessage } from "../../../shared/chat-types";

export interface ITokenizer {
  countTokens(text: string): number;
}

export class DefaultEstimateTokenizer implements ITokenizer {
  countTokens(text: string): number {
    if (!text) return 0;
    // 启发式估算：中文约 1.5 字符/token，英文约 4 字符/token，平均按约 2 字符/token 计算
    return Math.ceil(text.length / 2);
  }
}

export interface TokenMeterOptions {
  tokenizer?: ITokenizer;
}

/**
 * TokenMeter (Context Layer Token 计量与计算器)
 *
 * 明确区分 estimateTokens（启发式快速估算）与 actualTokens（可注入精确 Tokenizer）
 */
export class TokenMeter {
  private readonly tokenizer?: ITokenizer;
  private readonly defaultEstimator = new DefaultEstimateTokenizer();

  constructor(options: TokenMeterOptions = {}) {
    this.tokenizer = options.tokenizer;
  }

  hasExactTokenizer(): boolean {
    return !!this.tokenizer;
  }

  /**
   * 启发式快速估算 (纯文本长度平均估算)
   */
  estimateTokens(text: string): number {
    return this.defaultEstimator.countTokens(text);
  }

  /**
   * 精确/实际 Token 计算 (若未注入 Provider Tokenizer，则回退至估算器)
   */
  actualTokens(text: string): number {
    if (this.tokenizer) {
      return this.tokenizer.countTokens(text);
    }
    return this.estimateTokens(text);
  }

  /**
   * 计算一组 ChatMessage 的 Token 总数
   */
  estimateMessageTokens(messages: ChatMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      total += this.estimateTokens(msg.content || "");
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        total += this.estimateTokens(JSON.stringify(msg.toolCalls));
      }
    }
    return total;
  }

  /**
   * 计算工具 Schema 的 Token 总数
   */
  estimateSchemaTokens(
    toolSchemas: Array<{
      type?: string;
      function: { name: string; description: string; parameters?: unknown };
    }>,
  ): number {
    let total = 0;
    for (const schema of toolSchemas) {
      const payload = `${schema.function.name} ${schema.function.description} ${JSON.stringify(schema.function.parameters || {})}`;
      total += this.estimateTokens(payload);
    }
    return total;
  }
}
