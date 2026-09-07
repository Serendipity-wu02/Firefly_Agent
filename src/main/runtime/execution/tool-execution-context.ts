import type { UpstreamAuthorizationContext } from "../../../shared/runtime-integration-types";

export interface ToolExecutionContext {
  runId: string;
  step: number;
  conversationId?: string;
  userQuery?: string;
  signal?: AbortSignal;
  toolCallsCount: number;
  maxToolCallsPerRun?: number;
  metadata?: Record<string, unknown>;
  /** Present only when the authorized invocation bridge has completed upstream authorization. */
  upstreamAuthorization?: UpstreamAuthorizationContext;
}
