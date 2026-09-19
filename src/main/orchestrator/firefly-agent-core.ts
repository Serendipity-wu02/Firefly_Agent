import type {
  AgentConfig,
  AgentResumeResult,
  AgentRunInput,
  AgentRunResult,
} from "../../shared/agent-types";
import { DEFAULT_AGENT_CONFIG } from "../../shared/agent-types";
import type { IFireflyLlmProvider } from "../../shared/provider-types";
import type { IAgentCore } from "../../shared/agent-core";
import { LocalFireflyProvider } from "./providers/local-firefly-provider";
import { FireflyToolRegistry } from "./tools/registry/tool-registry";
import { ContextManager } from "./context/context-manager";
import { ToolExecutionEngine } from "./tools/execution/tool-execution-engine";
import type { ToolPolicyConfig } from "./tools/execution/tool-policy";
import { AgentEventBus } from "./agent-events";
import { CheckpointManager } from "./recovery/checkpoint-manager";
import { RecoveryManager } from "./recovery/recovery-manager";
import { BoundedPlanner } from "./planning/bounded-planner";
import type { PlannerConfig } from "./planning/plan-types";
import {
  runMainRequiredPlan,
  validateAgentRunPlanInput,
  type MainPlanExecutionResult,
} from "./planning/plan-execution-entry";
import { FireflyHarness } from "./harness/firefly-harness";
import type { HarnessAuthorizationAdapter } from "./harness/harness-authorization-adapter";
import type { MainAgentDelegationService } from "./subagents/main-agent-delegation";
import type { WorkPlanGenerationResult } from "../../shared/work-types";

export interface FireflyAgentCoreOptions {
  provider?: IFireflyLlmProvider;
  toolRegistry: FireflyToolRegistry;
  config?: Partial<AgentConfig>;
  eventBus?: AgentEventBus;
  contextManager?: ContextManager;
  toolPolicy?: Partial<ToolPolicyConfig>;
  executionEngine?: ToolExecutionEngine;
  authorizationAdapter?: HarnessAuthorizationAdapter;
  mainDelegationService?: MainAgentDelegationService;
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
      authorizationAdapter: options.authorizationAdapter,
      mainDelegationService: options.mainDelegationService,
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

  proposeRequiredPlan(
    userPrompt: string,
    signal?: AbortSignal,
    browserRequestTargets?: readonly string[],
  ): Promise<WorkPlanGenerationResult> {
    return this.harness.proposeRequiredPlan(userPrompt, signal, browserRequestTargets);
  }

  run(input: AgentRunInput): Promise<AgentRunResult> {
    const validation = validateAgentRunPlanInput(
      input,
      this.harness.getPlanner().getConfig().maxSteps,
      { availableToolSchemas: this.harness.getMainToolSchemas() },
    );
    if (!validation.ok) {
      return Promise.resolve({
        runId: input.runId ?? "plan-request-rejected",
        conversationId: input.conversationId,
        status: "error",
        terminationReason: { kind: "error" },
        finalText: "",
        transcript: [],
        toolCallsCount: 0,
        roundsCount: 0,
        error: `${validation.code}: ${validation.message}`,
        durationMs: 0,
      });
    }
    return this.harness.run({
      ...input,
      history: input.history ? input.history.map((message) => ({ ...message })) : undefined,
      customSteps: input.customSteps
        ? input.customSteps.map((step) => typeof step === "string"
          ? step
          : {
              ...step,
              ...(step.toolBinding === undefined
                ? {}
                : {
                    toolBinding: {
                      ...step.toolBinding,
                      arguments: { ...step.toolBinding.arguments },
                    },
                  }),
            })
        : undefined,
    });
  }

  /**
   * Trusted Main-only entry for an explicitly selected execution plan.
   * It is intentionally absent from IAgentCore, Renderer IPC, and Worker
   * inputs; ordinary Chat continues to call run().
   */
  runRequiredPlan(request: unknown): Promise<MainPlanExecutionResult> {
    return runMainRequiredPlan(
      this,
      request,
      this.harness.getPlanner().getConfig().maxSteps,
      { availableToolSchemas: this.harness.getMainToolSchemas() },
    );
  }

  resume(checkpointId: string, signal?: AbortSignal): Promise<AgentResumeResult> {
    return this.harness.resume(checkpointId, signal);
  }

  cancel(runId: string): boolean {
    return this.harness.cancel(runId);
  }

  cancelAll(): void {
    this.harness.cancelAll();
  }
}
