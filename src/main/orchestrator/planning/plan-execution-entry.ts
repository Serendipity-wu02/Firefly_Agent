import type {
  AgentPlanStepCompletionRequirement,
  AgentRunInput,
  AgentRunResult,
  AgentRequiredToolExecution,
} from "../../../shared/agent-types";
import type { IAgentCore } from "../../../shared/agent-core";
import { BROWSER_READ_TOOL_ID } from "../../browser/browser-tool";
import { normalizeBrowserUrl } from "../../browser/browser-policy";

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
  /** V1 required binding for a tool step; never inferred from description. */
  readonly toolBinding?: AgentRequiredToolExecution;
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
  | "invalid_plan_steps"
  | "invalid_plan_tool_binding";

export interface MainAvailableToolSchema {
  readonly name: string;
  readonly parameters: Record<string, unknown>;
}

/** Main-owned validation inputs; this is not a user or model payload. */
export interface MainRequiredPlanValidationContext {
  readonly availableToolSchemas?: readonly MainAvailableToolSchema[];
}

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

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (isRecord(value)) {
    const copy: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) copy[key] = cloneJsonValue(child);
    return copy;
  }
  return value;
}

function cloneToolBinding(binding: AgentRequiredToolExecution): AgentRequiredToolExecution {
  return {
    ...binding,
    arguments: cloneJsonValue(binding.arguments) as Readonly<Record<string, unknown>>,
  };
}

function isToolBinding(value: unknown): value is AgentRequiredToolExecution {
  if (!isRecord(value) || typeof value.toolName !== "string" || value.toolName.trim().length === 0) {
    return false;
  }
  if (!isRecord(value.arguments) || !Object.values(value.arguments).every(isJsonValue)) return false;
  if (value.argumentMatching !== undefined &&
      value.argumentMatching !== "exact" && value.argumentMatching !== "normalized_url") {
    return false;
  }
  if (value.successContract !== "json_ok_true" || value.correction !== "once") return false;
  if (value.argumentMatching === "normalized_url" && typeof value.arguments.requestUrl !== "string") {
    return false;
  }
  return true;
}

function schemaValueMatches(value: unknown, schema: unknown): boolean {
  if (!isRecord(schema)) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => Object.is(entry, value))) return false;
  if (schema.type === undefined) return true;
  switch (schema.type) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "integer": return typeof value === "number" && Number.isInteger(value);
    case "boolean": return typeof value === "boolean";
    case "object": return isRecord(value);
    case "array": return Array.isArray(value);
    default: return false;
  }
}

function matchesToolSchema(
  binding: AgentRequiredToolExecution,
  schema: MainAvailableToolSchema,
): boolean {
  const parameters = schema.parameters;
  if (parameters.type !== "object" || !isRecord(parameters.properties)) return false;
  const required = parameters.required;
  if (required !== undefined &&
      (!Array.isArray(required) || required.some((key) =>
        typeof key !== "string" || !Object.prototype.hasOwnProperty.call(binding.arguments, key)))) {
    return false;
  }
  for (const [key, value] of Object.entries(binding.arguments)) {
    if (!Object.prototype.hasOwnProperty.call(parameters.properties, key)) return false;
    if (!schemaValueMatches(value, parameters.properties[key])) return false;
  }
  return true;
}

function matchesOriginalBrowserTarget(
  binding: AgentRequiredToolExecution,
  browserRequestTargets: readonly string[] | undefined,
): boolean {
  if (binding.toolName !== BROWSER_READ_TOOL_ID) return true;
  if (browserRequestTargets === undefined || browserRequestTargets.length === 0) return false;
  if (typeof binding.arguments.requestUrl !== "string") return false;
  const normalized = normalizeBrowserUrl(binding.arguments.requestUrl);
  return normalized.allowed && browserRequestTargets.includes(normalized.url.href);
}

function validateStructuredSteps(
  value: unknown,
  maxSteps: number,
  context: MainRequiredPlanValidationContext = {},
  browserRequestTargets?: readonly string[],
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
    if (step.completionRequirement === "analysis" && step.toolBinding !== undefined) {
      return {
        ok: false,
        code: "invalid_plan_tool_binding",
        message: "Analysis steps must not declare a tool binding.",
      };
    }
    let validatedToolBinding: AgentRequiredToolExecution | undefined;
    if (step.completionRequirement === "tool") {
      const binding = step.toolBinding;
      if (!isToolBinding(binding)) {
        return {
          ok: false,
          code: "invalid_plan_tool_binding",
          message: "Every tool step must declare a complete tool name and parameter binding before execution.",
        };
      }
      const toolSchema = context.availableToolSchemas?.find((schema) => schema.name === binding.toolName);
      if (context.availableToolSchemas !== undefined && toolSchema === undefined) {
        return {
          ok: false,
          code: "invalid_plan_tool_binding",
          message: `The bound tool "${binding.toolName}" is not enabled in the current Main tool scope.`,
        };
      }
      if (toolSchema !== undefined && !matchesToolSchema(binding, toolSchema)) {
        return {
          ok: false,
          code: "invalid_plan_tool_binding",
          message: `The parameters bound to "${binding.toolName}" do not match its current input schema.`,
        };
      }
      if (!matchesOriginalBrowserTarget(binding, browserRequestTargets)) {
        return {
          ok: false,
          code: "invalid_plan_tool_binding",
          message: "A Browser tool binding must match an HTTP(S) URL explicitly present in the original user message.",
        };
      }
      validatedToolBinding = cloneToolBinding(binding);
    }
    steps.push({
      description: step.description,
      completionRequirement: step.completionRequirement,
      ...(validatedToolBinding === undefined
        ? {}
        : { toolBinding: validatedToolBinding }),
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
  context: MainRequiredPlanValidationContext = {},
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

  const steps = validateStructuredSteps(
    request.steps,
    maxSteps,
    context,
    request.browserRequestTargets,
  );
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
      customSteps: steps.map((step) => ({
        ...step,
        ...(step.toolBinding === undefined
          ? {}
          : { toolBinding: cloneToolBinding(step.toolBinding) }),
      })),
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
  context: MainRequiredPlanValidationContext = {},
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

  const steps = validateStructuredSteps(
    input.customSteps,
    maxSteps,
    context,
    input.browserRequestTargets,
  );
  if (!Array.isArray(steps)) return steps;
  return { ok: true };
}

/** Main-only execution entry; it never becomes a renderer or public IPC API. */
export async function runMainRequiredPlan(
  agentCore: IAgentCore,
  request: unknown,
  maxSteps: number,
  context: MainRequiredPlanValidationContext = {},
): Promise<MainPlanExecutionResult> {
  const validation = createMainRequiredPlanInput(request, maxSteps, context);
  if (!validation.ok) return validation;
  return { ok: true, result: await agentCore.run(validation.input) };
}
