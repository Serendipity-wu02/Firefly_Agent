import type { ToolDefinition } from "../../../../shared/tool-types";
import type { UpstreamAuthorizationContext } from "../../../../shared/runtime-integration-types";
import type { WorkFileId, WorkFileSelectionId } from "../../../../shared/work-file-types";
import { WorkFileSelectionStore } from "../../../work/work-file-selection-store";
import type { HarnessAuthorizationFactsResolver } from "../../harness/harness-authorization-adapter";

export const FILE_READ_TOOL_ID = "file_read" as const;
export const FILE_READ_CAPABILITY_ID = "file.read";
export const FILE_READ_SANDBOX_PROFILE_ID = "firefly-file-selected-read-v1";

export function createFileAuthorizationFactsResolver(
  store: WorkFileSelectionStore,
): HarnessAuthorizationFactsResolver {
  return (input, context) => {
    const keys = Object.keys(input).sort();
    if (keys.length !== 2 || keys[0] !== "fileId" || keys[1] !== "selectionId") {
      return {
        ok: false,
        code: "FILE_TARGET_INVALID",
        message: "File authorization requires exactly the bound selectionId and fileId.",
      };
    }
    if (typeof input.selectionId !== "string" || typeof input.fileId !== "string") {
      return {
        ok: false,
        code: "FILE_TARGET_INVALID",
        message: "File authorization identities are invalid.",
      };
    }
    const boundFile = store.getBoundFile(
      context.runId,
      input.selectionId as WorkFileSelectionId,
      input.fileId as WorkFileId,
    );
    if (boundFile === undefined) {
      return {
        ok: false,
        code: "FILE_SCOPE_NOT_BOUND",
        message: "The selected file is not bound to the current Work run.",
      };
    }
    return {
      ok: true,
      requestedScope: { kind: "filesystem", path: boundFile.path, access: "read" },
      approvalSummary: `读取已选择文件：${boundFile.displayName}`,
      approvalReason: "文件内容将发送给当前配置的模型服务用于处理。",
    };
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function authorizedForFileRead(
  authorization: UpstreamAuthorizationContext | undefined,
  runId: string | undefined,
): boolean {
  return authorization?.toolId === FILE_READ_TOOL_ID
    && authorization.authorizedScope.kind === "filesystem"
    && authorization.authorizedScope.access === "read"
    && authorization.requester.type === "main-agent"
    && authorization.authorization.type === "approval-grant"
    && typeof runId === "string"
    && runId.length > 0;
}

export function createFileReadTool(store: WorkFileSelectionStore): ToolDefinition {
  return {
    id: FILE_READ_TOOL_ID,
    name: FILE_READ_TOOL_ID,
    description: "Read one user-selected text or Markdown file as untrusted content.",
    enabled: true,
    risk: "read_only",
    safetyLevel: "confirm_required",
    sideEffect: "read_only",
    retryable: false,
    timeoutMs: 30_000,
    inputSchema: {
      type: "object",
      properties: {
        selectionId: { type: "string", description: "Opaque Main-owned selection identity." },
        fileId: { type: "string", description: "Opaque Main-owned file identity." },
      },
      required: ["selectionId", "fileId"],
    },
    execute: async (args, context) => {
      const runId = context?.runId;
      if (!authorizedForFileRead(context?.upstreamAuthorization, runId)) {
        return JSON.stringify({
          ok: false,
          error: "file_read_authorization_required",
          message: "File reading requires the current Main run's authorization chain.",
          complete: false,
          untrustedContent: true,
        });
      }
      if (!isRecord(args) || typeof args.selectionId !== "string" || typeof args.fileId !== "string") {
        return JSON.stringify({
          ok: false,
          error: "invalid_file_read_arguments",
          message: "file_read requires selectionId and fileId.",
          complete: false,
          untrustedContent: true,
        });
      }

      const selectionId = args.selectionId as WorkFileSelectionId;
      const fileId = args.fileId as WorkFileId;
      if (!store.validateBinding(runId!, selectionId, fileId)) {
        return JSON.stringify({
          ok: false,
          error: "file_scope_not_bound",
          message: "The file target is not bound to the current Work run.",
          selectionId,
          fileId,
          complete: false,
          untrustedContent: true,
        });
      }

      return JSON.stringify(await store.readFile({
        runId: runId!,
        selectionId,
        fileId,
        signal: context?.signal,
      }));
    },
  };
}
