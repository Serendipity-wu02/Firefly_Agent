export type ToolRiskLevel = "safe" | "read_only" | "side_effect" | "high_risk";
export type ToolSafetyLevel = "safe" | "confirm_required" | "high_risk";
export type ToolSideEffect = "read_only" | "idempotent" | "state_mutation" | "external_action";

export interface ToolContext {
  userQuery: string;
  conversationId?: string;
  signal?: AbortSignal;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  catalogHint?: string;
  risk?: ToolRiskLevel;
  safetyLevel?: ToolSafetyLevel;
  sideEffect?: ToolSideEffect;
  timeoutMs?: number;
  retryable?: boolean;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (args: Record<string, unknown>, ctx?: ToolContext) => Promise<string>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  toolCallId: string;
  name: string;
  output: string;
  isError?: boolean;
}
