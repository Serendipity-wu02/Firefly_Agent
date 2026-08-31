import type { HarnessInput, HarnessResult, HarnessEvent } from "./harness-types";
import type { IFireflyLlmProvider } from "./provider-types";

/**
 * Stable Agent Core contract.
 *
 * All consumers (chat-ipc, proactive-scheduler, agent-orchestrator, index.ts)
 * depend ONLY on this interface, never on any concrete implementation.
 *
 * Current implementation: FireflyHarness (src/main/agent/harness/firefly-harness.ts)
 * Future replacement:     FireflyAgentCore (self-developed Agent Loop)
 *
 * To swap the implementation, change ONE line in index.ts (the composition root).
 * Every downstream consumer requires zero modification.
 */
export interface IAgentCore {
  /**
   * Run a single agent turn: build context, call LLM, handle tool rounds,
   * and return the final text + transcript.
   */
  run(input: HarnessInput, emitter?: (event: HarnessEvent) => void): Promise<HarnessResult>;

  /**
   * Cancel a specific in-flight run by its runId.
   * Returns true if the run was found and cancelled.
   */
  cancel(runId: string): boolean;

  /**
   * Cancel all currently in-flight runs (called on app quit).
   */
  cancelAll(): void;

  /**
   * Hot-swap the LLM provider at runtime (e.g. after settings are saved).
   * Optional: future self-developed cores may manage provider selection
   * internally and not expose this method.
   */
  setProvider?(provider: IFireflyLlmProvider): void;
}
