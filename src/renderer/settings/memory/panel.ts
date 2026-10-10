// M policy state and imported documents are independent data sources.
import type { MemoryPanelApi, MemoryPanelPayload } from "../shared/types";
import { createSmhPanel } from "./smh-panel";
import { formatDateTime } from "../shared/format";

let mounted: { root: HTMLElement; panel: ReturnType<typeof createSmhPanel> } | null = null;
let importedDocs: MemoryPanelPayload["importedDocs"] = [];
function api(): MemoryPanelApi | undefined {
  return (window as Window & { memoryPanel?: MemoryPanelApi }).memoryPanel;
}
function docsMessage(message: string): void {
  const list = document.getElementById("memory-imported-list");
  if (!list) return;
  const note = document.createElement("p"); note.className = "memory-list__empty"; note.textContent = message; list.replaceChildren(note);
}
async function loadImportedDocs(): Promise<void> {
  try {
    const payload = await api()?.getData();
    if (!payload || !Array.isArray(payload.importedDocs)) { docsMessage("导入知识接口不可用"); return; }
    importedDocs = payload.importedDocs;
    renderImportedDocs();
  } catch { docsMessage("导入知识读取失败，请重试"); }
}
export async function loadMemoryPanel(): Promise<void> {
  const root = document.getElementById("memory-smh-panel");
  if (root && mounted?.root !== root) {
    const bridge = api();
    mounted = { root, panel: createSmhPanel(root, typeof bridge?.getState === "function" ? bridge : undefined) };
  }
  await Promise.all([root ? mounted?.panel.load() : undefined, loadImportedDocs()]);
}
export function renderImportedDocs(): void {
  const list = document.getElementById("memory-imported-list");
  if (!list) return;
  if (!importedDocs.length) { docsMessage("暂无导入文档；在聊天窗口上传文件后会自动索引"); return; }
  list.replaceChildren();
  for (const item of importedDocs) {
    const article = document.createElement("article"); article.className = "memory-record memory-record--doc";
    const main = document.createElement("div"); main.className = "memory-record__main";
    const title = document.createElement("h3"); title.className = "memory-record__title"; title.textContent = item.fileName;
    const body = document.createElement("p"); body.className = "memory-record__body"; body.textContent = `已索引 ${item.chunkCount} 个片段`;
    const meta = document.createElement("p"); meta.className = "memory-record__meta"; meta.textContent = `最近导入：${formatDateTime(item.lastImportedAt)}`;
    main.append(title, body, meta);
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "memory-record__delete";
    remove.dataset.importId = item.importId || ""; remove.dataset.fileName = item.fileName; remove.title = "删除此导入文档"; remove.setAttribute("aria-label", `删除 ${item.fileName}`);
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [name, value] of Object.entries({ width: "16", height: "16", viewBox: "0 0 48 48", fill: "none", "aria-hidden": "true" })) icon.setAttribute(name, value);
    for (const d of ["M8 15H40L37 44H11L8 15Z", "M20.002 25.0024V35.0026", "M28.0024 24.9995V34.9972", "M12 14.9999L28.3242 3L36 15"]) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      for (const [name, value] of Object.entries({ d, stroke: "currentColor", "stroke-width": "4", "stroke-linecap": "round", "stroke-linejoin": "round" })) path.setAttribute(name, value);
      icon.append(path);
    }
    remove.append(icon);
    article.append(main, remove); list.append(article);
  }
}
