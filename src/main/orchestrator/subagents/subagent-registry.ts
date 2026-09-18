import type { CapabilityId } from "../../../shared/capability-types";
import type { SubAgentDescriptor, SubAgentId } from "../../../shared/subagent-types";
import { SubAgentServiceError } from "./subagent-errors";

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SubAgentServiceError(
      "INVALID_DESCRIPTOR",
      `SubAgent descriptor field "${field}" must be a non-empty string.`,
    );
  }
}

function cloneDescriptor(descriptor: SubAgentDescriptor): SubAgentDescriptor {
  return Object.freeze({
    id: descriptor.id,
    name: descriptor.name,
    description: descriptor.description,
    version: descriptor.version,
    capabilities: Object.freeze([...descriptor.capabilities]),
  });
}

/** Canonical declarative profile registry; it contains no worker runtime. */
export class SubAgentRegistry {
  private readonly descriptors = new Map<SubAgentId, SubAgentDescriptor>();

  register(descriptor: SubAgentDescriptor): void {
    if (typeof descriptor !== "object" || descriptor === null) {
      throw new SubAgentServiceError(
        "INVALID_DESCRIPTOR",
        "SubAgent descriptor must be an object.",
      );
    }

    assertNonEmptyString(descriptor.id, "id");
    assertNonEmptyString(descriptor.name, "name");
    assertNonEmptyString(descriptor.description, "description");
    assertNonEmptyString(descriptor.version, "version");
    if (!Array.isArray(descriptor.capabilities)) {
      throw new SubAgentServiceError(
        "INVALID_DESCRIPTOR",
        "SubAgent descriptor capabilities must be an array.",
      );
    }
    for (const capabilityId of descriptor.capabilities) {
      assertNonEmptyString(capabilityId, "capabilities");
    }

    if (this.descriptors.has(descriptor.id)) {
      throw new SubAgentServiceError(
        "SUBAGENT_ALREADY_REGISTERED",
        `SubAgent "${descriptor.id}" is already registered.`,
      );
    }

    this.descriptors.set(descriptor.id, cloneDescriptor(descriptor));
  }

  get(id: SubAgentId): SubAgentDescriptor | undefined {
    return this.descriptors.get(id);
  }

  has(id: SubAgentId): boolean {
    return this.descriptors.has(id);
  }

  list(): readonly SubAgentDescriptor[] {
    return Object.freeze(Array.from(this.descriptors.values()));
  }
}
