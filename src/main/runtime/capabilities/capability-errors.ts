import type { CapabilityErrorCode } from "../../../shared/capability-types";

export type CapabilityRegistryErrorCode = Extract<
  CapabilityErrorCode,
  "DUPLICATE_ID" | "INVALID_DESCRIPTOR"
>;

export class CapabilityRegistryError extends Error {
  readonly code: CapabilityRegistryErrorCode;

  constructor(code: CapabilityRegistryErrorCode, message: string) {
    super(message);
    this.name = "CapabilityRegistryError";
    this.code = code;
  }
}
