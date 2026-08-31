export interface ToolExecutionContext {
  runId: string;
  step: number;
  conversationId?: string;
  userQuery?: string;
  signal?: AbortSignal;
  toolCallsCount: number;
  maxToolCallsPerRun?: number;
  metadata?: Record<string, unknown>;
}
