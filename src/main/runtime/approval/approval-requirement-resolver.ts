import type {
  ApprovalRequirement,
  CapabilityApprovalRequirement,
} from "../../../shared/approval-types";
import type {
  ApprovalRequirementInput,
  ApprovalRequirementResolver,
} from "../../../shared/runtime-integration-types";
import type { PermissionProfile } from "../../../shared/permission-profile-types";
import { PermissionProfilePolicyResolver } from "../authorization/permission-profile-policy-resolver";

export type ApprovalRequirementPolicyErrorCode =
  | "DUPLICATE_REQUIREMENT"
  | "BINDING_MISMATCH"
  | "PERMISSION_PROFILE_DENIED";

export class ApprovalRequirementPolicyError extends Error {
  readonly code: ApprovalRequirementPolicyErrorCode;

  constructor(code: ApprovalRequirementPolicyErrorCode, message: string) {
    super(message);
    this.name = "ApprovalRequirementPolicyError";
    this.code = code;
  }
}

export interface ApprovalRequirementResolverOptions {
  readonly permissionPolicyResolver?: PermissionProfilePolicyResolver;
  readonly permissionProfile?: PermissionProfile | (() => PermissionProfile);
}

/**
 * Build the separate policy function that decides whether a capability needs
 * human approval. ApprovalService does not infer this decision.
 */
export function createApprovalRequirementResolver(
  requirements: readonly CapabilityApprovalRequirement[],
  options: ApprovalRequirementResolverOptions = {},
): ApprovalRequirementResolver {
  const byCapability = new Map<string, ApprovalRequirement>();
  const permissionPolicyResolver = options.permissionPolicyResolver ?? new PermissionProfilePolicyResolver();
  for (const requirement of requirements) {
    if (byCapability.has(requirement.capabilityId)) {
      throw new ApprovalRequirementPolicyError(
        "DUPLICATE_REQUIREMENT",
        `Approval requirement for "${requirement.capabilityId}" is duplicated.`,
      );
    }
    byCapability.set(requirement.capabilityId, requirement.requirement);
  }

  return (input: ApprovalRequirementInput): ApprovalRequirement => {
    if (input.binding.capabilityId !== input.capabilityId) {
      throw new ApprovalRequirementPolicyError(
        "BINDING_MISMATCH",
        "Approval requirement input binding must match the capability.",
      );
    }
    const declaredRequirement = byCapability.get(input.capabilityId) ?? "none";
    const configuredProfile = typeof options.permissionProfile === "function"
      ? options.permissionProfile()
      : options.permissionProfile;
    const profile = input.permissionProfile ?? configuredProfile;
    if (profile === undefined) return declaredRequirement;
    const policy = permissionPolicyResolver.resolve({
      profile,
      capabilityKnown: true,
      declaredApprovalRequirement: declaredRequirement,
      sideEffect: input.sideEffect,
    });
    if (!policy.capabilityAllowed) {
      throw new ApprovalRequirementPolicyError(
        "PERMISSION_PROFILE_DENIED",
        `Permission scheme "${policy.profile}" does not allow this capability's side effects.`,
      );
    }
    return policy.approvalRequirement;
  };
}
