export type ClassifiedErrorType =
  | "context_overflow"
  | "rate_limit"
  | "server_error"
  | "network_error"
  | "cancelled"
  | "fatal";

export interface ClassifiedError {
  type: ClassifiedErrorType;
  statusCode?: number;
  retryable: boolean;
  message: string;
}

export class ErrorClassifier {
  static classify(err: unknown): ClassifiedError {
    if (!err) {
      return { type: "fatal", retryable: false, message: "Unknown error" };
    }

    const message = err instanceof Error ? err.message : String(err);
    const lower = message.toLowerCase();

    // 1. 中断与取消判定
    if (
      lower.includes("aborted") ||
      lower.includes("abort") ||
      lower.includes("cancelled") ||
      (err instanceof Error && err.name === "AbortError")
    ) {
      return { type: "cancelled", retryable: false, message };
    }

    // 2. 上下文超限判定 (Context Overflow / 413 / 400 Context Length)
    if (
      lower.includes("context_length_exceeded") ||
      lower.includes("maximum context length") ||
      lower.includes("context window") ||
      lower.includes("token limit") ||
      lower.includes("413") ||
      lower.includes("payload too large")
    ) {
      return { type: "context_overflow", statusCode: 413, retryable: true, message };
    }

    // 3. 限流判定 (Rate Limit / 429)
    if (
      lower.includes("429") ||
      lower.includes("rate_limit") ||
      lower.includes("too many requests") ||
      lower.includes("quota exceeded")
    ) {
      return { type: "rate_limit", statusCode: 429, retryable: true, message };
    }

    // 4. 服务端错误 (500 / 502 / 503 / 504)
    if (
      lower.includes("500") ||
      lower.includes("502") ||
      lower.includes("503") ||
      lower.includes("504") ||
      lower.includes("internal server error") ||
      lower.includes("bad gateway") ||
      lower.includes("service unavailable")
    ) {
      return { type: "server_error", statusCode: 500, retryable: true, message };
    }

    // 5. 网络传输错误 (ECONNRESET / ETIMEDOUT / fetch failed)
    if (
      lower.includes("econnreset") ||
      lower.includes("etimedout") ||
      lower.includes("enotfound") ||
      lower.includes("fetch failed") ||
      lower.includes("network error") ||
      lower.includes("socket hang up")
    ) {
      return { type: "network_error", retryable: true, message };
    }

    // 6. 认证或不可恢复致命错误 (401 / 403 / Model Not Found)
    if (
      lower.includes("401") ||
      lower.includes("403") ||
      lower.includes("unauthorized") ||
      lower.includes("forbidden") ||
      lower.includes("invalid_api_key") ||
      lower.includes("model_not_found")
    ) {
      return { type: "fatal", statusCode: 401, retryable: false, message };
    }

    return { type: "fatal", retryable: false, message };
  }
}
