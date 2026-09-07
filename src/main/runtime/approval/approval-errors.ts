export type ApprovalServiceErrorCode =
  | "APPROVAL_NOT_FOUND"
  | "APPROVAL_ALREADY_RESOLVED"
  | "INVALID_APPROVAL_REQUEST"
  | "INVALID_APPROVAL_GRANT"
  | "APPROVAL_ID_COLLISION";

export class ApprovalServiceError extends Error {
  readonly code: ApprovalServiceErrorCode;

  constructor(code: ApprovalServiceErrorCode, message: string) {
    super(message);
    this.name = "ApprovalServiceError";
    this.code = code;
  }
}
