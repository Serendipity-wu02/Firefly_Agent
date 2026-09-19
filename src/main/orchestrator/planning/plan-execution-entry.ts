import type {
  AgentPlanStepCompletionRequirement,
  AgentRunInput,
  AgentRunResult,
} from "../../../shared/agent-types";
import type { IAgentCore } from "../../../shared/agent-core";

/**
 * Main-only request contract for an explicitly selected execution plan.
 *
 * This is deliberately not a renderer/IPC payload.  A trusted Main caller
 * must provide the mode and every step's completion requirement before the
 * Harness starts.
 */
export interface MainRequiredPlanStep {
  readonly description: string;
  readonly completionRequirement: AgentPlanStepCompletionRequirement;
}

export interface MainRequiredPlanRequest {
  readonly planExecutionMode: "required";
  readonly userPrompt: string;
  readonly steps: readonly MainRequiredPlanStep[];
  /** Main-owned URLs extracted from the original user task, never from plan text. */
  readonly browserRequestTargets?: readonly string[];
  readonly runId?: string;
  readonly conversationId?: string;
}

export type MainPlanExecutionRejectionCode =
  | "invalid_plan_execution_mode"
  | "invalid_plan_request"
  | "invalid_plan_steps";

export interface MainPlanExecutionRejection {
  readonly ok: false;
  readonly code: MainPlanExecutionRejectionCode;
  readonly message: string;
}

export interface MainPlanExecutionInput {
  readonly ok: true;
  readonly input: AgentRunInput;
}

export type MainPlanExecutionInputValidation =
  | MainPlanExecutionInput
  | MainPlanExecutionRejection;

export type MainPlanExecutionResult =
  | MainPlanExecutionRejection
  | { readonly ok: true; readonly result: AgentRunResult };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCompletionRequirement(
  value: unknown,
): value is AgentPlanStepCompletionRequirement {
  return value === "analysis" || value === "tool";
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalStringArray(value: unknown): value is readonly string[] | undefined {
  return value === undefined || (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function validateStructuredSteps(
  value: unknown,
  maxSteps: number,
): MainPlanExecutionRejection | MainRequiredPlanStep[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxSteps) {
    return {
      ok: false,
      code: "invalid_plan_steps",
      message: "An explicitly required plan must contain a bounded non-empty step list.",
    };
  }

  const steps: MainRequiredPlanStep[] = [];
  for (const step of value) {
    if (!isRecord(step) || typeof step.description !== "string" ||
        step.description.trim().length === 0 ||
        !isCompletionRequirement(step.completionRequirement)) {
      return {
        ok: false,
        code: "invalid_plan_steps",
        message: "Every required plan step must define a description and completionRequirement.",
      };
    }
    steps.push({
      description: step.description,
      completionRequirement: step.completionRequirement,
    });
  }
  return steps;
}

/**
 * Validate and construct the only Main-side required-plan input.
 *
 * The runtime accepts unknown because this is the boundary where Main code
 * must reject forged or malformed values instead of silently selecting
 * assist mode.
 */
export function createMainRequiredPlanInput(
  request: unknown,
  maxSteps: number,
): MainPlanExecutionInputValidation {
  if (!isRecord(request) || request.planExecutionMode !== "required") {
    return {
      ok: false,
      code: "invalid_plan_execution_mode",
      message: "Only an explicit planExecutionMode=required request may use this entry.",
    };
  }
  if (typeof request.userPrompt !== "string" || request.userPrompt.trim().length === 0 ||
      !isOptionalString(request.runId) || !isOptionalString(request.conversationId) ||
      !isOptionalStringArray(request.browserRequestTargets)) {
    return {
      ok: false,
      code: "invalid_plan_request",
      message: "A required plan request must contain a non-empty userPrompt and valid identifiers.",
    };
  }

  const steps = validateStructuredSteps(request.steps, maxSteps);
  if (!Array.isArray(steps)) return steps;

  return {
    ok: true,
    input: {
      ...(request.runId === undefined ? {} : { runId: request.runId }),
      ...(request.conversationId === undefined ? {} : { conversationId: request.conversationId }),
      source: "user",
      userPrompt: request.userPrompt,
      planMode: true,
      planExecutionMode: "required",
      customSteps: steps.map((step) => ({ ...step })),
      ...(request.browserRequestTargets === undefined
        ? {}
        : { browserRequestTargets: [...request.browserRequestTargets] }),
      executionProfile: { kind: "MAIN", allowSubAgentDelegation: true },
    },
  };
}

/**
 * Runtime guard for the lower-level AgentRunInput boundary.
 * Assist/legacy inputs retain their existing behavior; only required mode
 * demands structured, pre-declared completion requirements.
 */
export function validateAgentRunPlanInput(
  input: AgentRunInput,
  maxSteps: number,
): MainPlanExecutionRejection | { readonly ok: true } {
  const rawMode = (input as unknown as Record<string, unknown>).planExecutionMode;
  if (rawMode !== undefined && rawMode !== "assist" && rawMode !== "required") {
    return {
      ok: false,
      code: "invalid_plan_execution_mode",
      message: "planExecutionMode must be assist or required.",
    };
  }
  if (rawMode !== "required") return { ok: true };

  if ((input.source !== undefined && input.source !== "user") ||
      input.executionProfile?.kind === "WORKER") {
    return {
      ok: false,
      code: "invalid_plan_request",
      message: "Required execution plans are only accepted from a trusted Main user run.",
    };
  }

  const steps = validateStructuredSteps(input.customSteps, maxSteps);
  if (!Array.isArray(steps)) return steps;
  return { ok: true };
}

/** Main-only execution entry; it never becomes a renderer or public IPC API. */
export async function runMainRequiredPlan(
  agentCore: IAgentCore,
  request: unknown,
  maxSteps: number,
): Promise<MainPlanExecutionResult> {
  const validation = createMainRequiredPlanInput(request, maxSteps);
  if (!validation.ok) return validation;
  return { ok: true, result: await agentCore.run(validation.input) };
}
