import type { ChatMessage } from "../../shared/chat-types";
import type { CharacterStateData } from "../../shared/firefly-state";
import type { IAgentCore } from "../../shared/agent-core";
import type { IFireflyLlmProvider } from "../../shared/provider-types";

export interface AgentOrchestratorOptions {
  agentCore: IAgentCore;
}

/**
 * Thin coordination layer over IAgentCore.
 *
 * Receives a pre-constructed agentCore at construction time so that
 * index.ts (the composition root) remains the only place that knows
 * which concrete implementation is in use.
 */
export class FireflyAgentOrchestrator {
  private agentCore: IAgentCore;

  constructor(options: AgentOrchestratorOptions) {
    this.agentCore = options.agentCore;
  }

  getAgentCore(): IAgentCore {
    return this.agentCore;
  }

  setProvider(provider: IFireflyLlmProvider): void {
    this.agentCore.setProvider?.(provider);
  }

  async runConversation(
    messages: ChatMessage[],
    options: {
      characterState?: CharacterStateData;
      signal?: AbortSignal;
    } = {},
  ): Promise<{ messages: ChatMessage[]; replyText: string; toolCalled?: boolean }> {
    const lastUserMsg = messages[messages.length - 1];
    const userPrompt = lastUserMsg?.content || "";
    const history = messages.slice(0, -1);

    const result = await this.agentCore.run({
      userPrompt,
      history,
      characterState: options.characterState,
      signal: options.signal,
    });

    return {
      messages: result.transcript,
      replyText: result.finalText,
      toolCalled: result.toolCallsCount > 0,
    };
  }
}
