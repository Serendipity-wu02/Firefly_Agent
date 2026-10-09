import type {} from "../../global";
import type { SettingsApi } from "../shared/types";
import { showAlert, showConfirm, showInputModal, showNotice } from "../shared/modal";
import { parseCommandLine } from "../shared/parse";
import { subscribeLocaleChanged, t } from "../i18n";

type McpServer = Awaited<ReturnType<NonNullable<SettingsApi["listMcpServers"]>>>[number];
const label = (key: string, values?: Record<string, string | number>) => t(`settings.mcpUi.${key}`, values);

/** Keep presentation state local; Main remains the connection/configuration owner.
 * https://www.electronjs.org/docs/latest/tutorial/ipc#pattern-2-renderer-to-main-two-way
 */
export function mountMcpManagement(addButton: HTMLButtonElement | null): { add: () => Promise<void>; dispose: () => void } | undefined {
  const panel = addButton?.closest("#plugins-panel");
  const anchor = panel?.querySelector(".plugin-list");
  if (!addButton || !anchor) return;

  const section = document.createElement("section");
  section.id = "mcp-management";
  section.className = "mcp-management";
  section.setAttribute("aria-labelledby", "mcp-management-title");
  // All interpolated content below uses textContent, never service-provided HTML.
  section.innerHTML = '<div class="mcp-management__heading"><div><h2 id="mcp-management-title"></h2><p class="panel-hint" id="mcp-management-hint"></p></div><button type="button" class="btn-secondary" id="mcp-refresh-btn"></button></div><p id="mcp-server-feedback" role="status" aria-live="polite"></p><div id="mcp-server-list" class="plugin-list"></div>';
  anchor.before(section);
  const heading = section.querySelector<HTMLElement>("#mcp-management-title")!;
  const hint = section.querySelector<HTMLElement>("#mcp-management-hint")!;
  const refreshButton = section.querySelector<HTMLButtonElement>("#mcp-refresh-btn")!;
  const feedback = section.querySelector<HTMLElement>("#mcp-server-feedback")!;
  const list = section.querySelector<HTMLElement>("#mcp-server-list")!;
  let disposed = false;
  let pending = false;
  let loading = false;
  let loaded = false;
  let readError = false;
  let readVersion = 0;
  let servers: McpServer[] = [];
  const alive = () => !disposed && section.isConnected;

  function render(): void {
    if (!alive()) return;
    heading.textContent = label("title");
    hint.textContent = label("hint");
    addButton!.setAttribute("aria-label", label("add"));
    addButton!.title = label("add");
    addButton!.disabled = pending || !window.settings?.addMcpServer;
    refreshButton.textContent = label(loading ? "loading" : "refresh");
    refreshButton.disabled = pending || loading || !window.settings?.listMcpServers;
    section.setAttribute("aria-busy", String(pending || loading));
    feedback.textContent = readError ? label("readFailed") : "";
    feedback.setAttribute("role", readError ? "alert" : "status");
    list.replaceChildren();
    for (const server of servers) {
      const card = document.createElement("article");
      card.className = "plugin-card mcp-server-card";
      const body = document.createElement("div");
      body.className = "plugin-card__body";
      const name = document.createElement("h3");
      name.textContent = server.name;
      const status = document.createElement("p");
      status.textContent = label(server.connected ? "connected" : "disconnected", { count: server.toolCount });
      status.className = "mcp-server-status";
      body.append(name, status);
      card.append(body);
      // This built-in is owned by syncPlaywrightMcp and its existing toggle.
      if (server.id === "playwright-mcp") {
        const note = document.createElement("p");
        note.className = "panel-hint";
        note.textContent = label("builtin");
        body.append(note);
      } else {
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "btn-secondary btn-danger";
        removeButton.textContent = label("remove");
        removeButton.setAttribute("aria-label", label("removeNamed", { name: server.name }));
        removeButton.dataset.mcpRemove = server.id;
        removeButton.disabled = pending || !window.settings?.removeMcpServer;
        removeButton.addEventListener("click", () => { void remove(server); });
        card.append(removeButton);
      }
      list.append(card);
    }
    if (servers.length === 0 && loaded && !readError) {
      const empty = document.createElement("p");
      empty.className = "panel-hint";
      empty.textContent = label("empty");
      list.append(empty);
    }
  }

  async function refresh(): Promise<void> {
    if (!alive()) return;
    const version = ++readVersion;
    loading = true;
    render();
    try {
      if (!window.settings?.listMcpServers) throw new Error("MCP_LIST_UNAVAILABLE");
      const result = await window.settings.listMcpServers();
      if (!alive() || version !== readVersion) return;
      if (!Array.isArray(result)) throw new Error("MCP_LIST_INVALID");
      // Explicit projection: commands, env and arbitrary extra fields never enter UI state.
      servers = result.map(server => ({ id: server.id, name: server.name, connected: server.connected, toolCount: server.toolCount, toolIds: [] }));
      loaded = true;
      readError = false;
    } catch {
      if (!alive() || version !== readVersion) return;
      readError = true;
    } finally {
      if (alive() && version === readVersion) { loading = false; render(); }
    }
  }

  function begin(): boolean {
    if (!alive() || pending) return false;
    pending = true;
    render();
    return true;
  }
  function invalidateRead(): void {
    // Confirmation is still read-only. Invalidate only when a mutation starts,
    // so canceling a dialog cannot discard the initial list permanently.
    readVersion++;
    loading = false;
    render();
  }
  function finish(): void {
    if (!alive()) return;
    pending = false;
    render();
  }
  async function failure(action: "add" | "remove"): Promise<void> {
    if (!alive()) return;
    // MCP transport errors may echo process arguments, URLs or credentials.
    // Do not log or show arbitrary error objects in this renderer.
    await showAlert({ tone: "error", title: label(`${action}Failed`), message: label(`${action}FailedMessage`) });
  }

  async function add(): Promise<void> {
    if (!begin()) return;
    try {
      if (!window.settings?.addMcpServer) { await failure("add"); return; }
      const command = await showInputModal({ title: label("add"), message: label("commandPrompt"), placeholder: "node path/to/server.js --flag" });
      if (!alive() || !command?.trim()) return;
      const parsed = parseCommandLine(command.trim());
      if (!parsed.command) { showNotice({ tone: "warning", message: label("invalidCommand") }); return; }
      const nameInput = await showInputModal({ title: label("nameTitle"), message: label("namePrompt"), placeholder: label("namePlaceholder") });
      if (!alive() || nameInput === null) return;
      const name = nameInput.trim() || label("unnamed");
      const approved = await showConfirm({ tone: "warning", dangerous: true, title: label("runTitle"), message: label("runMessage", { command: command.trim() }), confirmText: label("run"), cancelText: label("cancel") });
      if (!alive() || !approved) return;
      invalidateRead();
      const result = await window.settings.addMcpServer({ id: `mcp-${crypto.randomUUID()}`, name, transport: "stdio", command: parsed.command, args: parsed.args });
      if (!alive()) return;
      await refresh();
      if (!alive()) return;
      if (result?.ok) showNotice({ tone: "success", message: label("added", { name, count: result.toolIds?.length ?? 0 }) });
      else await failure("add");
    } catch {
      if (!alive()) return;
      await refresh();
      await failure("add");
    } finally { finish(); }
  }

  async function remove(server: McpServer): Promise<void> {
    if (server.id === "playwright-mcp" || !begin()) return;
    try {
      const approved = await showConfirm({ tone: "warning", dangerous: true, title: label("removeTitle"), message: label("removeMessage", { name: server.name }), confirmText: label("remove"), cancelText: label("cancel") });
      if (!alive() || !approved) return;
      if (!window.settings?.removeMcpServer) { await failure("remove"); return; }
      invalidateRead();
      const result = await window.settings.removeMcpServer(server.id);
      if (!alive()) return;
      await refresh();
      if (!alive()) return;
      if (result?.ok) showNotice({ tone: "success", message: label("removed", { name: server.name }) });
      else await failure("remove");
    } catch {
      if (!alive()) return;
      // A disconnect can succeed while saving fails: re-read the actual state.
      await refresh();
      await failure("remove");
    } finally {
      finish();
      if (alive()) {
        // Rendering replaces row buttons. Restore focus after cancel/failure,
        // or to Refresh after a successful removal instead of leaving it on body.
        const target = [...list.querySelectorAll<HTMLButtonElement>("[data-mcp-remove]")]
          .find(button => button.dataset.mcpRemove === server.id);
        (target ?? refreshButton).focus();
      }
    }
  }

  const onRefresh = () => { if (!pending && !loading) void refresh(); };
  refreshButton.addEventListener("click", onRefresh);
  const unsubscribe = subscribeLocaleChanged(render);
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    readVersion++;
    unsubscribe();
    refreshButton.removeEventListener("click", onRefresh);
    window.removeEventListener("pagehide", dispose);
    window.removeEventListener("beforeunload", dispose);
  }
  window.addEventListener("pagehide", dispose);
  window.addEventListener("beforeunload", dispose);
  void refresh();
  return { add, dispose };
}
