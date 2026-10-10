import type { FactView } from "../../../shared/memory-contracts";
import type { MemoryPanelAction, MemoryPanelCandidate, MemoryPanelState, MemoryPolicyPanelApi } from "../../../shared/memory-panel-contracts";

/** All memory/source content is text. The renderer cannot construct actor or source authority. */
export function createSmhPanel(root: HTMLElement, api: MemoryPolicyPanelApi | undefined) {
  const doc = root.ownerDocument;
  let busy = false;
  let readGeneration = 0;
  let state: MemoryPanelState | null = null;
  function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const node = doc.createElement(tag);
    node.className = className;
    if (className === "memory-record__meta") node.style.fontSize = "12px";
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function card(title: string, hint: string) {
    const section = element("section", "memory-card");
    const head = element("div", "memory-card__head");
    const heading = element("div", "");
    heading.append(element("h2", "", title), element("p", "", hint));
    head.append(heading);
    const list = element("div", "memory-list");
    section.append(head, list); root.append(section);
    return list;
  }
  root.replaceChildren();
  const status = card("记忆与来源状态", "来源存在覆盖与事实证据资格分别显示。");
  const backend = element("p", "memory-record__body", "正在读取记忆…");
  const coverage = element("p", "memory-record__meta");
  const feedback = element("p", "memory-record__body"); feedback.setAttribute("role", "status"); feedback.setAttribute("aria-live", "polite");
  status.append(backend, coverage, feedback);
  const facts = card("已记住的事实", "查看有效事实、来源和时间，或明确纠正、遗忘。");
  const candidates = card("待确认候选", "候选不代表已记住；确认或拒绝后会重新读取状态。");
  const time = (value: number | null | undefined) => value == null ? "未知" : new Date(value).toLocaleString();
  function empty(list: HTMLElement, message: string) { list.replaceChildren(element("p", "memory-list__empty", message)); }
  function setDisabled() {
    root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => { button.disabled = busy || !state?.backendStatus.available; });
  }
  function button(parent: HTMLElement, title: string, action: string, handler: () => void) {
    const node = element("button", "ghost-btn", title);
    node.type = "button"; node.dataset.memoryAction = action;
    node.addEventListener("click", () => { if (!busy && state?.backendStatus.available) handler(); });
    parent.append(node); return node;
  }
  function row(title: string, meta: string) {
    const article = element("article", "memory-record");
    const main = element("div", "memory-record__main");
    main.append(element("h3", "memory-record__title", title), element("p", "memory-record__meta", meta));
    const actions = element("div", "memory-export__actions");
    main.append(actions); article.append(main);
    return { article, main, actions };
  }
  async function submit(action: MemoryPanelAction) {
    if (busy || !api || !state?.backendStatus.available) return;
    busy = true; setDisabled(); feedback.textContent = "正在处理…";
    try {
      const result = await api.applyAction(action);
      const success = action.kind === "reject"
        ? result.status === "rejected" && result.candidateId === action.id
        : result.status === (action.kind === "forget" ? "forgotten" : "active");
      if (success) {
        await load();
        feedback.textContent = ({ confirm: "已确认", reject: "已拒绝", correct: "已纠正", forget: "已遗忘" } as const)[action.kind];
      } else {
        // A stale target may have changed elsewhere, so refresh rather than resubmit it.
        await load();
        feedback.textContent = `操作未完成：${result.reason || result.status}`;
      }
    } catch { feedback.textContent = "操作失败，请重试"; }
    finally { busy = false; setDisabled(); }
  }
  function renderFact(item: FactView) {
    const entry = row(item.assertion, `状态：${item.activationReason === "explicitUserConfirmed" ? "已明确确认" : "有效"} · 版本：${item.revision} · 来源：${item.sourceRef.sourceId} · 参考时间：${time(item.time.referenceTime)} · 记录时间：${time(item.recordedAt)}`);
    button(entry.actions, "纠正", "correct", () => {
      if (entry.main.querySelector("textarea")) return;
      const editor = element("div", "memory-field memory-field--full");
      const label = element("label", "", "写下正确事实");
      const input = element("textarea", ""); input.value = item.assertion; input.rows = 3; input.maxLength = 65536;
      label.append(input); editor.append(label);
      button(editor, "保存纠正", "save-correction", () => {
        const text = input.value.trim();
        if (!text) { feedback.textContent = "请输入正确事实"; input.focus(); return; }
        void submit({ kind: "correct", id: item.factId, expectedRevision: item.revision, text });
      });
      button(editor, "取消", "cancel-correction", () => editor.remove());
      entry.main.append(editor); input.focus();
    });
    button(entry.actions, "遗忘", "forget", () => { void submit({ kind: "forget", id: item.factId, expectedRevision: item.revision }); });
    button(entry.actions, "来源详情", "source", () => {
      const details = element("div", "memory-record__body", "正在读取来源…");
      entry.main.querySelector("[data-memory-provenance]")?.remove(); details.dataset.memoryProvenance = "true"; entry.main.append(details);
      void api!.auditSource(item.factId).then((audit) => {
        details.replaceChildren(element("p", "memory-record__meta", `来源详情 · ${audit.status} · ${audit.reason}`));
        for (const source of audit.sources) details.append(element("p", "memory-record__meta", `${source.sourceId} · 版本：${source.revision} · ${source.kind} · ${source.validity} · 来源时间：${time(source.occurredAt)}`));
        if (!audit.sources.length) details.append(element("p", "memory-record__meta", "没有可展示的来源详情"));
      }).catch(() => { details.textContent = "来源读取失败，请重试"; });
    });
    facts.append(entry.article);
  }
  function renderCandidate(item: MemoryPanelCandidate) {
    const entry = row(item.assertion || "候选内容待明确", `状态：待确认 · ${item.reason} · 版本：${item.revision} · 来源：${item.sourceRef.sourceId} · 来源时间：${time(item.occurredAt)}`);
    button(entry.actions, "确认", "confirm", () => { void submit({ kind: "confirm", id: item.candidateId, expectedRevision: item.revision }); });
    button(entry.actions, "拒绝", "reject", () => { void submit({ kind: "reject", id: item.candidateId, expectedRevision: item.revision }); });
    candidates.append(entry.article);
  }
  function renderState(value: MemoryPanelState) {
    state = value;
    backend.textContent = value.backendStatus.available ? "记忆后端可用" : `记忆后端不可用：${value.backendStatus.reason || "原因未知"}`;
    const c = value.coverage;
    const partial = c.status !== "measured" || c.unknownDenied === null || c.unknownDenied > 0 || c.missing === null || c.missing > 0;
    coverage.textContent = c.status !== "measured"
      ? `来源覆盖未测量${c.reason ? `：${c.reason}` : ""}；证据资格未评估。`
      : `来源存在：${c.present ?? "未知"} / ${c.population ?? "未知"} · ${partial ? "覆盖不完整" : "已测量"} · 缺失：${c.missing ?? "未知"} · 未知/拒绝：${c.unknownDenied ?? "未知"}；证据资格未评估。`;
    facts.replaceChildren(); candidates.replaceChildren();
    if (!value.backendStatus.available) {
      empty(facts, "后端不可用，无法读取事实"); empty(candidates, "后端不可用，无法读取候选");
    } else {
      value.facts.forEach(renderFact); value.candidates.forEach(renderCandidate);
      if (!value.facts.length) empty(facts, "当前没有可展示的有效事实；来源覆盖见上方");
      if (!value.candidates.length) empty(candidates, "当前没有待确认候选");
    }
    setDisabled();
  }
  async function load(): Promise<void> {
    const generation = ++readGeneration;
    backend.textContent = "正在读取记忆…";
    if (!api) {
      state = null; backend.textContent = "记忆后端不可用"; coverage.textContent = "来源覆盖未测量；证据资格未评估。";
      empty(facts, "记忆接口不可用，无法读取事实"); empty(candidates, "记忆接口不可用，无法读取候选"); return;
    }
    try { const value = await api.getState(); if (generation === readGeneration) renderState(value); }
    catch {
      if (generation !== readGeneration) return;
      state = null; backend.textContent = "记忆读取失败，请重试"; coverage.textContent = "来源覆盖状态未知；证据资格未评估。";
      empty(facts, "事实读取失败"); empty(candidates, "候选读取失败");
    }
  }
  return { load };
}
