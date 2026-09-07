import type { ApprovalRequirement } from "../../../shared/approval-types";
import {
  DEFAULT_PERMISSION_PROFILE,
  migratePersistedPermissionProfile,
  type PermissionProfile,
} from "../../../shared/permission-profile-types";
import type { SandboxProfileId } from "../../../shared/sandbox-types";
import type { ToolSideEffect } from "../../../shared/tool-types";

export interface PermissionProfilePolicyResolverOptions {
  readonly sandboxProfileByProfile?: Partial<Record<PermissionProfile, SandboxProfileId>>;
}

export interface PermissionProfilePolicyInput {
  readonly profile: PermissionProfile;
  readonly capabilityKnown: boolean;
  readonly declaredApprovalRequirement: ApprovalRequirement;
  readonly sideEffect?: ToolSideEffect;
}

export interface PermissionProfilePolicy {
  readonly profile: PermissionProfile;
  readonly capabilityAllowed: boolean;
  readonly approvalRequirement: ApprovalRequirement;
  readonly sandboxProfileId?: SandboxProfileId;
}

/**
 * Pure profile-to-policy mapping. The resolver never reads SettingsManager,
 * evaluates Sandbox resources, shows UI, or executes a tool.
 */
export class PermissionProfilePolicyResolver {
  private readonly sandboxProfileByProfile: Partial<Record<PermissionProfile, SandboxProfileId>>;

  constructor(options: PermissionProfilePolicyResolverOptions = {}) {
    this.sandboxProfileByProfile = { ...(options.sandboxProfileByProfile ?? {}) };
  }

  getDefaultProfile(): PermissionProfile {
    return DEFAULT_PERMISSION_PROFILE;
  }

  resolve(input: PermissionProfilePolicyInput): PermissionProfilePolicy {
    const profile = migratePersistedPermissionProfile(input.profile);
    if (!input.capabilityKnown) {
      return {
        profile,
        capabilityAllowed: false,
        approvalRequirement: "required",
      };
    }

    if (profile === "READ_ONLY" && input.sideEffect !== "read_only") {
      return {
        profile,
        capabilityAllowed: false,
        approvalRequirement: "required",
      };
    }

    const approvalRequirement = profile === "ASK_EVERY_TIME" && input.sideEffect !== "read_only"
      ? "required"
      : input.declaredApprovalRequirement;
    const sandboxProfileId = this.sandboxProfileByProfile[profile];

    return {
      profile,
      capabilityAllowed: true,
      approvalRequirement,
      ...(sandboxProfileId === undefined ? {} : { sandboxProfileId }),
    };
  }
}
