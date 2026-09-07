/**
 * User-facing permission schemes. A scheme selects policy inputs; it is not a
 * Capability, Sandbox, Approval, or execution owner.
 */

export type PermissionProfile =
  | "READ_ONLY"
  | "RESTRICTED_SCOPE"
  | "ASK_EVERY_TIME"
  | "FULL_ACCESS";

/** Values written by the earlier four-profile implementation. */
export type LegacyPermissionProfile =
  | "RESTRICTED"
  | "STANDARD"
  | "ASK_EVERY_TIME"
  | "ELEVATED";

export const DEFAULT_PERMISSION_PROFILE: PermissionProfile = "RESTRICTED_SCOPE";

export interface PermissionProfileOption {
  readonly value: PermissionProfile;
  readonly label: string;
  readonly description: string;
}

export const PERMISSION_PROFILE_OPTIONS: readonly PermissionProfileOption[] = [
  {
    value: "READ_ONLY",
    label: "只读",
    description: "仅允许明确标记为只读的能力；写入和外部副作用在授权前直接拒绝。",
  },
  {
    value: "RESTRICTED_SCOPE",
    label: "受限",
    description: "只在现有显式沙箱范围内工作，并按能力声明的授权要求处理。",
  },
  {
    value: "ASK_EVERY_TIME",
    label: "逐次确认",
    description: "仍需通过能力和沙箱校验；每个具有副作用的请求都单独确认。",
  },
  {
    value: "FULL_ACCESS",
    label: "完全访问",
    description: "在当前已配置的合法能力和沙箱范围内减少不必要的询问，不绕过硬拒绝。",
  },
];

export function isPermissionProfile(value: unknown): value is PermissionProfile {
  return value === "READ_ONLY" ||
    value === "RESTRICTED_SCOPE" ||
    value === "ASK_EVERY_TIME" ||
    value === "FULL_ACCESS";
}

export function isLegacyPermissionProfile(value: unknown): value is LegacyPermissionProfile {
  return value === "RESTRICTED" ||
    value === "STANDARD" ||
    value === "ASK_EVERY_TIME" ||
    value === "ELEVATED";
}

/**
 * Convert persisted values from the earlier implementation without granting
 * a broader effective scope. The old names are not accepted as new UI values.
 */
export function migratePersistedPermissionProfile(value: unknown): PermissionProfile {
  if (isPermissionProfile(value)) return value;
  if (!isLegacyPermissionProfile(value)) return DEFAULT_PERMISSION_PROFILE;

  switch (value) {
    case "RESTRICTED":
      return "ASK_EVERY_TIME";
    case "STANDARD":
      return "RESTRICTED_SCOPE";
    case "ASK_EVERY_TIME":
      return "ASK_EVERY_TIME";
    case "ELEVATED":
      return "FULL_ACCESS";
  }
}
