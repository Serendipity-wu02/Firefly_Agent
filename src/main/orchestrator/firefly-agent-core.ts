import type {
  AgentConfig,
  AgentRunInput,
  AgentRunResult,
} from "../../shared/agent-types";
import { DEFAULT_AGENT_CONFIG } from "../../shared/agent-types";
import type { IFireflyLlmProvider } from "../../shared/provider-types";
import type { IAgentCore } from "../../shared/agent-core";
import { LocalFireflyProvider } from "../llm/providers/local-firefly-provider";
import { FireflyToolRegistry } from "../tools/tool-registry";
import { ContextManager } from "./context/context-manager";
import { ToolExecutionEngine } from "../runtime/execution/tool-execution-engine";
import type { ToolPolicyConfig } from "../runtime/execution/tool-policy";
import { AgentEventBus } from "./agent-events";
import { CheckpointManager } from "./recovery/checkpoint-manager";
import { RecoveryManager } from "./recovery/recovery-manager";
import { BoundedPlanner } from "./planning/bounded-planner";
import type { PlannerConfig } from "./planning/plan-types";
import { FireflyHarness } from "./harness/firefly-harness";

export interface FireflyAgentCoreOptions {
  provider?: IFireflyLlmProvider;
  toolRegistry: FireflyToolRegistry;
  config?: Partial<AgentConfig>;
  eventBus?: AgentEventBus;
  contextManager?: ContextManager;
  toolPolicy?: Partial<ToolPolicyConfig>;
  executionEngine?: ToolExecutionEngine;
  checkpointManager?: CheckpointManager;
  recoveryManager?: RecoveryManager;
  planner?: BoundedPlanner;
  plannerConfig?: Partial<PlannerConfig>;
}

/**
 * FireflyAgentCore is the stable public facade.
 *
 * It owns dependency composition and the public lifecycle API. The unique
 * execution loop lives in FireflyHarness, while ContextManager,
 * ToolExecutionEngine, Planning, Recovery, CheckpointManager, and AgentEventBus
 * remain the actual domain owners.
 */
export class FireflyAgentCore implements IAgentCore {
  private readonly harness: FireflyHarness;

  constructor(options: FireflyAgentCoreOptions) {
    const eventBus = options.eventBus || new AgentEventBus();
    const contextManager = options.contextManager || new ContextManager();
    const executionEngine =
      options.executionEngine ||
      new ToolExecutionEngine(options.toolRegistry, options.toolPolicy, eventBus);
    const checkpointManager = options.checkpointManager || new CheckpointManager();
    const recoveryManager = options.recoveryManager || new RecoveryManager();
    const planner = options.planner || new BoundedPlanner(options.plannerConfig);

    this.harness = new FireflyHarness({
      provider: options.provider || new LocalFireflyProvider(),
      toolRegistry: options.toolRegistry,
      config: { ...DEFAULT_AGENT_CONFIG, ...(options.config || {}) },
      eventBus,
      contextManager,
      executionEngine,
      checkpointManager,
      recoveryManager,
      planner,
    });
  }

  getContextManager(): ContextManager {
    return this.harness.getContextManager();
  }

  getExecutionEngine(): ToolExecutionEngine {
    return this.harness.getExecutionEngine();
  }

  getCheckpointManager(): CheckpointManager {
    return this.harness.getCheckpointManager();
  }

  getRecoveryManager(): RecoveryManager {
    return this.harness.getRecoveryManager();
  }

  getPlanner(): BoundedPlanner {
    return this.harness.getPlanner();
  }

  setProvider(provider: IFireflyLlmProvider): void {
    this.harness.setProvider(provider);
  }

  getProvider(): IFireflyLlmProvider {
    return this.harness.getProvider();
  }

  getEventBus(): AgentEventBus {
    return this.harness.getEventBus();
  }

  run(input: AgentRunInput): Promise<AgentRunResult> {
    return this.harness.run({
      ...input,
      history: input.history ? input.history.map((message) => ({ ...message })) : undefined,
      customSteps: input.customSteps ? [...input.customSteps] : undefined,
    });
  }

  resume(checkpointId: string, signal?: AbortSignal): Promise<AgentRunResult> {
    return this.harness.resume(checkpointId, signal);
  }

  cancel(runId: string): boolean {
    return this.harness.cancel(runId);
  }

  cancelAll(): void {
    this.harness.cancelAll();
  }
}
