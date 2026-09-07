import type {
  CapabilityCategory,
  CapabilityDescriptor,
  CapabilityId,
} from "../../../shared/capability-types";
import { CapabilityRegistryError } from "./capability-errors";

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CapabilityRegistryError(
      "INVALID_DESCRIPTOR",
      `Capability descriptor field "${field}" must be a non-empty string.`,
    );
  }
}

/**
 * Declarative capability metadata registry.
 *
 * Registration means only that a capability is known to this runtime. It does
 * not authorize a requester and it does not provide an execution path.
 */
export class CapabilityRegistry {
  private readonly descriptors = new Map<CapabilityId, CapabilityDescriptor>();

  register(descriptor: CapabilityDescriptor): void {
    if (typeof descriptor !== "object" || descriptor === null) {
      throw new CapabilityRegistryError(
        "INVALID_DESCRIPTOR",
        "Capability descriptor must be an object.",
      );
    }

    assertNonEmptyString(descriptor.id, "id");
    assertNonEmptyString(descriptor.name, "name");
    assertNonEmptyString(descriptor.description, "description");
    assertNonEmptyString(descriptor.version, "version");
    assertNonEmptyString(descriptor.category, "category");

    if (this.descriptors.has(descriptor.id)) {
      throw new CapabilityRegistryError(
        "DUPLICATE_ID",
        `Capability "${descriptor.id}" is already registered.`,
      );
    }

    this.descriptors.set(
      descriptor.id,
      Object.freeze({ ...descriptor }),
    );
  }

  get(id: CapabilityId): CapabilityDescriptor | undefined {
    return this.descriptors.get(id);
  }

  has(id: CapabilityId): boolean {
    return this.descriptors.has(id);
  }

  list(): readonly CapabilityDescriptor[] {
    return Object.freeze(Array.from(this.descriptors.values()));
  }

  listByCategory(category: CapabilityCategory): readonly CapabilityDescriptor[] {
    return Object.freeze(
      Array.from(this.descriptors.values()).filter(
        (descriptor) => descriptor.category === category,
      ),
    );
  }
}
