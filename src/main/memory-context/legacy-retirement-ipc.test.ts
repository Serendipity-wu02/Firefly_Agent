import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { IPC } from "../../shared/ipc-channels";
import type { IpcScope } from "../application/ipc-scope";

const mocks = vi.hoisted(() => ({
  path: "", memory: { getL0: vi.fn(), getL1: vi.fn(), getAllL2: vi.fn(), getReflectionLogs: vi.fn(), updateL0: vi.fn(), updateL1: vi.fn() },
  open: vi.fn(), exportVault: vi.fn(), syncVault: vi.fn(), loadVault: vi.fn(), saveVault: vi.fn(), unbindVault: vi.fn(), startWatcher: vi.fn(), stopWatcher: vi.fn(),
  deleteDoc: vi.fn(), stickers: vi.fn(), skills: vi.fn(), mcp: vi.fn(), settingsWindow: null as unknown,
}));
vi.mock("electron", () => ({ app: { getAppPath: () => process.cwd() }, dialog: { showOpenDialog: mocks.open } }));
vi.mock("../env", () => ({ isDev: false }));
vi.mock("../memory/memory-store", () => ({ memoryStore: mocks.memory }));
vi.mock("../settings-store", () => ({ getRagStorePath: () => mocks.path, loadUserProfile: vi.fn(), saveUserProfile: vi.fn(), getAvatarPath: vi.fn() }));
vi.mock("../orchestrator/sticker-settings", () => ({ getStickerManagerConfig: mocks.stickers, setStickerEnabled: vi.fn() }));
vi.mock("../sticker-storage", () => ({ addUserSticker: vi.fn(), deleteUserSticker: vi.fn() }));
vi.mock("../rag", () => ({ deleteImportedDoc: mocks.deleteDoc }));
vi.mock("../orchestrator/mcp-manager", () => ({ addMcpServer: vi.fn(), removeMcpServer: vi.fn(), listMcpServers: mocks.mcp }));
vi.mock("../orchestrator/tools/registry/tool-registry", () => ({ toolRegistry: {} }));
vi.mock("../settings/settings-facade", () => ({ loadGeneralSettings: vi.fn(), saveGeneralSettings: vi.fn() }));
vi.mock("../skills", () => ({ listSkillsForUi: mocks.skills, setSkillEnabled: vi.fn(), skillRegistry: {}, rescanSkills: vi.fn() }));
vi.mock("../windows/window-state", () => ({ reactChatWindow: null, sidebarWindow: null, tasksWindow: null, get settingsWindow() { return mocks.settingsWindow; }, stickerManagerWindow: null }));
vi.mock("../memory/obsidian-exporter", () => ({ exportMemoryToObsidianVault: mocks.exportVault, syncToBoundVault: mocks.syncVault }));
vi.mock("../memory/obsidian-vault-config", () => ({ loadObsidianVaultConfig: mocks.loadVault, saveObsidianVaultConfig: mocks.saveVault, unbindVault: mocks.unbindVault }));
vi.mock("../memory/obsidian-importer", () => ({ startVaultWatcher: mocks.startWatcher, stopVaultWatcher: mocks.stopWatcher }));

import { registerMemoryUserToolIpc } from "../memory/memory-user-ipc";
import { loadImportedDocumentPanelData } from "../memory/panel";

let dir: string;
function register(mode: "legacy" | "smh" = "smh") {
  const handlers = new Map<string, (...args: any[]) => unknown>();
  const ipc: IpcScope = { handle: (name, handler) => { handlers.set(name, handler); }, on: vi.fn(), removeHandler: vi.fn(), dispose: vi.fn() };
  registerMemoryUserToolIpc({ windowManager: null, embeddingIndexService: {} as any, ipc, personalMemoryMode: mode });
  return (channel: string, payload?: unknown, event: unknown = {}) => handlers.get(channel)!(event, payload);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.settingsWindow = null;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-panel-")); mocks.path = path.join(dir, "memory-store.json");
  mocks.open.mockResolvedValue({ canceled: false, filePaths: [dir] });
  for (const read of [mocks.memory.getL0, mocks.memory.getL1]) read.mockResolvedValue({});
  mocks.memory.getAllL2.mockResolvedValue([]); mocks.memory.getReflectionLogs.mockResolvedValue([]);
  mocks.syncVault.mockResolvedValue({ ok: true }); mocks.loadVault.mockReturnValue({ vaultPath: "/old/vault" });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("Main SMH legacy IPC retirement", () => {
  it("rejects old personal writes, exports and every Vault entry before old data or watchers are touched", async () => {
    const invoke = register();
    for (const channel of [IPC.MEMORY_PANEL_SAVE_L0, IPC.MEMORY_PANEL_SAVE_L1, IPC.MEMORY_EXPORT_OBSIDIAN_VAULT,
      IPC.OBSIDIAN_VAULT_BIND, IPC.OBSIDIAN_VAULT_UNBIND, IPC.OBSIDIAN_VAULT_GET_CONFIG, IPC.OBSIDIAN_VAULT_SET_AUTO_SYNC, IPC.OBSIDIAN_VAULT_SYNC_NOW]) {
      expect(await invoke(channel, { preferredName: "should not write", personalMemoryMode: "legacy" })).toEqual({ ok: false, code: "MEMORY_LEGACY_RETIRED" });
    }
    for (const fn of [...Object.values(mocks.memory), mocks.open, mocks.exportVault, mocks.syncVault, mocks.loadVault, mocks.saveVault, mocks.unbindVault, mocks.startWatcher, mocks.stopWatcher]) expect(fn).not.toHaveBeenCalled();
  });
  it("loads only imported document rows from the mixed RAG file without L0/L1/L2 reads", async () => {
    const mixed = [
      { source: "user_memory", text: "private old fact", createdAt: 99, metadata: { fileName: "private", importId: "secret" } },
      { source: "chat_history", text: "private old history", createdAt: 100 },
      { source: "imported_doc", createdAt: 2, metadata: { fileName: "book.md", importId: "doc-1" } },
      { source: "imported_doc", createdAt: 4, metadata: { fileName: "book.md", importId: "doc-1" } },
      { source: "imported_doc", createdAt: 8, metadata: { fileName: "legacy.md" } },
    ];
    const original = JSON.stringify(mixed); fs.writeFileSync(mocks.path, original);
    const expected = { importedDocs: [
      { importId: null, fileName: "legacy.md", chunkCount: 1, lastImportedAt: 8 },
      { importId: "doc-1", fileName: "book.md", chunkCount: 2, lastImportedAt: 4 },
    ] };
    expect(await register()(IPC.MEMORY_PANEL_GET_DATA)).toEqual(expected);
    expect(await loadImportedDocumentPanelData()).toEqual(expected);
    for (const fn of Object.values(mocks.memory)) expect(fn).not.toHaveBeenCalled();
    expect(fs.readFileSync(mocks.path, "utf8")).toBe(original);
  });
  it("preserves imported documents, sticker, skill and MCP management", async () => {
    mocks.deleteDoc.mockReturnValue(2); mocks.stickers.mockReturnValue([{ id: "smile", enabled: true }]); mocks.skills.mockReturnValue([{ id: "skill" }]); mocks.mcp.mockReturnValue([{ id: "server" }]);
    const invoke = register();
    expect(await invoke(IPC.MEMORY_PANEL_DELETE_IMPORTED_DOC, { importId: "doc-1", fileName: "book.md" })).toEqual({ ok: true, deleted: 2 });
    expect(mocks.deleteDoc).toHaveBeenCalledWith("doc-1", "book.md");
    expect(await invoke(IPC.STICKERS_GET_CONFIG)).toEqual([{ id: "smile", enabled: true }]);
    expect(await invoke(IPC.SKILL_LIST)).toEqual([{ id: "skill" }]);
    const url = pathToFileURL(path.join(process.cwd(), "dist/renderer/settings/index.html")).href;
    const sender = { mainFrame: { url }, getURL: () => url, isDestroyed: () => false };
    mocks.settingsWindow = { webContents: sender, isDestroyed: () => false };
    expect(await invoke(IPC.MCP_LIST_SERVERS, undefined, { sender, senderFrame: sender.mainFrame })).toEqual([{ id: "server" }]);
  });
  it("retains explicit isolated legacy construction for old compatibility tests", async () => {
    expect(await register("legacy")(IPC.MEMORY_PANEL_SAVE_L0, { preferredName: "name" })).toEqual({ ok: true });
    expect(mocks.memory.updateL0).toHaveBeenCalledWith({ preferredName: "name" });
  });
});
