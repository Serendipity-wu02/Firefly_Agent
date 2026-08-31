import type { ToolCall } from "./tool-types";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  timestamp?: number;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  temperature?: number;
}

export interface ChatCompletionResponse {
  message: {
    role: "assistant";
    content: string;
    toolCalls?: ToolCall[];
  };
}
