// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsApi } from "../shared/types";

const api = { addMcpServer: vi.fn(), removeMcpServer: vi.fn(), listMcpServers: vi.fn() };
const row = { id: "fixture", name: "Synthetic MCP", connected: true, toolCount: 1, toolIds: ["fixture-tool"] };
async function flush() { for (let i = 0; i < 16; i++) await Promise.resolve(); }
function click(selector: string) { const button = document.querySelector<HTMLButtonElement>(selector); expect(button, selector).not.toBeNull(); button!.click(); }
async function input(value: string) { const field = document.querySelector<HTMLInputElement>("#cy-input-field")!; expect(field).not.toBeNull(); field.value = value; click("#cy-input-confirm"); await flush(); }
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  document.body.innerHTML = '<section id="plugins-panel"><button class="plugin-add-btn">＋</button><div class="plugin-list"></div></section>';
  window.settings = api as unknown as SettingsApi;
  api.listMcpServers.mockResolvedValue([]);
  api.addMcpServer.mockResolvedValue({ ok: true, toolIds: ["fixture-tool"] });
  api.removeMcpServer.mockResolvedValue({ ok: true });
});
afterEach(() => { window.dispatchEvent(new Event("beforeunload")); window.dispatchEvent(new Event("pagehide")); document.body.innerHTML = ""; vi.restoreAllMocks(); });

describe("MCP panel with real settings dialogs", () => {
  it("requires explicit run confirmation, then refreshes add/delete while delete cancel does nothing", async () => {
    await import("./panel"); await flush();
    click(".plugin-add-btn"); await input("node synthetic-mcp.js"); await input("Synthetic MCP");
    expect(api.addMcpServer).not.toHaveBeenCalled();
    expect(document.querySelector("#cy-modal-message")?.textContent).toContain("node synthetic-mcp.js");
    expect(document.activeElement?.id).toBe("cy-modal-cancel");
    click("#cy-modal-cancel"); await flush();
    expect(api.addMcpServer).not.toHaveBeenCalled();

    click(".plugin-add-btn"); await input("node synthetic-mcp.js"); await input("Synthetic MCP");
    api.listMcpServers.mockResolvedValue([row]); click("#cy-modal-confirm"); await flush();
    expect(api.addMcpServer).toHaveBeenCalledTimes(1);
    expect(document.querySelector("#mcp-server-list")?.textContent).toContain("Synthetic MCP");

    click('[data-mcp-remove="fixture"]'); await flush();
    expect(document.activeElement?.id).toBe("cy-modal-cancel"); click("#cy-modal-cancel"); await flush();
    expect(api.removeMcpServer).not.toHaveBeenCalled();
    expect(document.querySelector("#mcp-server-list")?.textContent).toContain("Synthetic MCP");
    expect((document.activeElement as HTMLElement).dataset.mcpRemove).toBe("fixture");

    click('[data-mcp-remove="fixture"]'); await flush(); api.listMcpServers.mockResolvedValue([]);
    click("#cy-modal-confirm"); await flush();
    expect(api.removeMcpServer).toHaveBeenCalledWith("fixture");
    expect(document.querySelector("#mcp-server-list")?.textContent).toContain("尚未添加");
    expect(document.querySelector("#cy-modal-overlay")?.classList.contains("is-hidden")).toBe(true);
  });

  it("shows safe connection failure in the real alert and restores usable controls", async () => {
    await import("./panel"); await flush();
    api.addMcpServer.mockRejectedValue(new Error("TOKEN=synthetic-secret"));
    click(".plugin-add-btn"); await input("node synthetic-mcp.js"); await input("Synthetic MCP");
    click("#cy-modal-confirm"); await flush();
    expect(document.querySelector("#cy-modal-title")?.textContent).toContain("添加失败");
    expect(document.querySelector("#cy-modal-message")?.textContent).not.toContain("synthetic-secret");
    click("#cy-modal-confirm"); await flush();
    expect(document.querySelector<HTMLButtonElement>(".plugin-add-btn")?.disabled).toBe(false);
    expect(document.querySelector("#mcp-server-list")?.textContent).toContain("尚未添加");
  });
});
