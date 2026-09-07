export type SandboxPolicyErrorCode = "INVALID_PROFILE" | "DUPLICATE_PROFILE_ID";

export class SandboxPolicyError extends Error {
  readonly code: SandboxPolicyErrorCode;

  constructor(code: SandboxPolicyErrorCode, message: string) {
    super(message);
    this.name = "SandboxPolicyError";
    this.code = code;
  }
}
