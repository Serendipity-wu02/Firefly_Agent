export type SubAgentServiceErrorCode =
  | "SUBAGENT_ALREADY_REGISTERED"
  | "SUBAGENT_NOT_FOUND"
  | "INVALID_DESCRIPTOR"
  | "TASK_NOT_FOUND"
  | "TASK_ID_COLLISION"
  | "INVALID_TASK"
  | "INVALID_DELEGATION_DEPTH"
  | "INVALID_TASK_TRANSITION"
  | "TASK_ALREADY_TERMINAL"
  | "INVALID_RESULT";

export class SubAgentServiceError extends Error {
  readonly code: SubAgentServiceErrorCode;

  constructor(code: SubAgentServiceErrorCode, message: string) {
    super(message);
    this.name = "SubAgentServiceError";
    this.code = code;
  }
}
