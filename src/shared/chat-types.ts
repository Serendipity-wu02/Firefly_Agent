import type { ToolCall } from "./tool-types";
import type { VoiceProsodyHint } from "./tts-session";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  timestamp?: number;
  /** V2.4 具身化表现最小关联元数据 */
  behaviorType?: string;
  correlationId?: string;
  voiceIntent?: string;
  prosodyHint?: VoiceProsodyHint;
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
