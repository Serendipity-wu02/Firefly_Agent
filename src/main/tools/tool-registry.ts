import type { ToolDefinition } from "../../shared/tool-types";

export class FireflyToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.id)) {
      console.warn(`[ToolRegistry] Tool "${tool.id}" is already registered. Overwriting.`);
    }
    this.tools.set(tool.id, tool);
  }

  unregister(toolId: string): boolean {
    return this.tools.delete(toolId);
  }

  get(toolId: string): ToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  has(toolId: string): boolean {
    return this.tools.has(toolId);
  }

  list(): readonly ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  listEnabled(): readonly ToolDefinition[] {
    return Array.from(this.tools.values()).filter((t) => t.enabled);
  }

  setEnabled(toolId: string, enabled: boolean): boolean {
    const tool = this.tools.get(toolId);
    if (tool) {
      tool.enabled = enabled;
      return true;
    }
    return false;
  }

  getToolSchemas(): Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> {
    return this.listEnabled().map((tool) => ({
      type: "function",
      function: {
        name: tool.id,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }
}

export const globalToolRegistry = new FireflyToolRegistry();
