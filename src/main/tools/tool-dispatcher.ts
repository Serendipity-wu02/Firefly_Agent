import type { ToolCall, ToolCallResult, ToolContext } from "../../shared/tool-types";
import { FireflyToolRegistry } from "./tool-registry";

export class FireflyToolDispatcher {
  constructor(private readonly registry: FireflyToolRegistry) {}

  async executeToolCall(call: ToolCall, ctx?: ToolContext): Promise<ToolCallResult> {
    const tool = this.registry.get(call.name);
    if (!tool) {
      return {
        toolCallId: call.id,
        name: call.name,
        output: JSON.stringify({ ok: false, error: "tool_not_found", message: `Tool "${call.name}" is not registered.` }),
        isError: true,
      };
    }

    if (!tool.enabled) {
      return {
        toolCallId: call.id,
        name: call.name,
        output: JSON.stringify({ ok: false, error: "tool_disabled", message: `Tool "${call.name}" is currently disabled.` }),
        isError: true,
      };
    }

    try {
      const output = await tool.execute(call.arguments, ctx);
      return {
        toolCallId: call.id,
        name: call.name,
        output,
        isError: false,
      };
    } catch (err: any) {
      console.warn(`[ToolDispatcher] Execution error in tool "${call.name}":`, err);
      return {
        toolCallId: call.id,
        name: call.name,
        output: JSON.stringify({ ok: false, error: "execution_error", message: err?.message || String(err) }),
        isError: true,
      };
    }
  }
}
