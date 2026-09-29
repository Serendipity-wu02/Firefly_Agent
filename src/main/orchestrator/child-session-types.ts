import type { TaskSessionStatus } from "../../shared/task-session";
import type { HarnessInput } from "./harness/types";
import type { ToolDefinition } from "./tools/registry/tool-registry";
import type { VendorConfig } from "./vendors/types";
import type { RunCapabilities } from "./run-capabilities";
import type { ToolOutputStore } from "./harness/tool-output/tool-output-store";

export interface ChildSessionResult {
  taskId: string;
  status: TaskSessionStatus;
  text: string;
}

export interface ChildSessionParent {
  parentConversationId: string;
  parentRunId: string;
  mode: "work" | "code";
  systemPrompt: string;
  vendorConfig: VendorConfig;
  tools: ToolDefinition[];
  capabilities?: RunCapabilities;
  resolvedWorkspaceRoot?: string;
  signal?: AbortSignal;
  checkPermission?: HarnessInput["checkPermission"];
  includeInteractiveTools?: boolean;
  permissionMode?: import("./firefly-agent").FireflyRunOptions["permissionMode"];
  toolOutputStore?: ToolOutputStore;
  workReadScopes?: import("../../shared/chat-types").WorkReadScope[];
}
