import type {
  CapabilityBinding,
  CapabilityId,
} from "../../../shared/capability-types";
import type { FireflyToolRegistry } from "../../tools/tool-registry";
import type { CapabilityRegistry } from "./capability-registry";

export type CapabilityBindingErrorCode =
  | "CAPABILITY_NOT_FOUND"
  | "TOOL_NOT_FOUND"
  | "DUPLICATE_BINDING"
  | "INVALID_BINDING";

export class CapabilityBindingError extends Error {
  readonly code: CapabilityBindingErrorCode;

  constructor(code: CapabilityBindingErrorCode, message: string) {
    super(message);
    this.name = "CapabilityBindingError";
    this.code = code;
  }
}

/**
 * Canonical metadata resolver for the V1 capability-to-tool relationship.
 * V1 is deliberately one capability ↔ one tool: no second tool registry and
 * no execution behavior are introduced here.
 */
export class CapabilityBindingResolver {
  private readonly bindings = new Map<CapabilityId, CapabilityBinding>();
  private readonly toolToCapability = new Map<string, CapabilityId>();

  constructor(
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly toolRegistry: FireflyToolRegistry,
  ) {}

  register(binding: CapabilityBinding): void {
    if (
      typeof binding !== "object" ||
      binding === null ||
      typeof binding.capabilityId !== "string" ||
      binding.capabilityId.trim().length === 0 ||
      typeof binding.toolId !== "string" ||
      binding.toolId.trim().length === 0
    ) {
      throw new CapabilityBindingError(
        "INVALID_BINDING",
        "Capability binding requires non-empty capabilityId and toolId.",
      );
    }
    if (!this.capabilityRegistry.has(binding.capabilityId)) {
      throw new CapabilityBindingError(
        "CAPABILITY_NOT_FOUND",
        `Capability "${binding.capabilityId}" is not registered.`,
      );
    }
    if (!this.toolRegistry.has(binding.toolId)) {
      throw new CapabilityBindingError(
        "TOOL_NOT_FOUND",
        `Tool "${binding.toolId}" is not registered.`,
      );
    }
    if (
      this.bindings.has(binding.capabilityId) ||
      this.toolToCapability.has(binding.toolId)
    ) {
      throw new CapabilityBindingError(
        "DUPLICATE_BINDING",
        `Capability binding for "${binding.capabilityId}" or tool "${binding.toolId}" already exists.`,
      );
    }

    const stored = Object.freeze({
      capabilityId: binding.capabilityId,
      toolId: binding.toolId,
    });
    this.bindings.set(stored.capabilityId, stored);
    this.toolToCapability.set(stored.toolId, stored.capabilityId);
  }

  resolve(capabilityId: CapabilityId): CapabilityBinding | undefined {
    return this.bindings.get(capabilityId);
  }

  list(): readonly CapabilityBinding[] {
    return Object.freeze(Array.from(this.bindings.values()));
  }
}
