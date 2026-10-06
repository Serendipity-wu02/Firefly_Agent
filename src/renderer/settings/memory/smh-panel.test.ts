// @vitest-environment jsdom
import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSmhPanel } from "./smh-panel";
import type { FactView } from "../../../shared/memory-contracts";
import type { MemoryPanelAction, MemoryPanelState, MemoryPolicyPanelApi } from "../../../shared/memory-panel-contracts";

function fact(assertion = "我喜欢茶"): FactView {
  return { factId: "fact-1", revision: 2, subjectKey: "preference", assertion, assertionKind: "user-statement",
    time: { validFrom: 1, validTo: null, referenceTime: 1000 }, sourceRef: { sourceId: "source-1", revision: 1 }, recordedAt: 2000, acceptedAt: 2000,
    supersededAt: null, activationReason: "explicitUserConfirmed", policyVersion: "test", provenance: { candidateId: "candidate-1", evidenceId: null, activationSourceRef: { sourceId: "settings-source", revision: 1 } } };
}
function fixture() {
  const root = document.createElement("div"); document.body.append(root);
  const state: MemoryPanelState = { facts: [], candidates: [{ candidateId: "candidate-1", revision: 1, attribute: "preference", value: "tea", reason: "needs-review", assertion: "我喜欢茶", sourceRef: { sourceId: "source-1", revision: 1 }, occurredAt: 1000 }],
    backendStatus: { available: true }, coverage: { status: "measured", population: 3, present: 3, missing: 0, unknownDenied: 0, exactRatio: 1, lowerRatio: 1, upperRatio: 1, reasons: {}, evidence: { status: "not-evaluated", eligible: null, ineligible: null, unknown: 3, ratio: null } } };
  const actions: MemoryPanelAction[] = [];
  const api: MemoryPolicyPanelApi = {
    getState: async () => structuredClone(state),
    applyAction: async (action) => {
      actions.push(action);
      if (action.kind === "confirm") { state.candidates = []; state.facts = [fact()]; return { status: "active" }; }
      if (action.kind === "reject") { state.candidates = []; return { status: "rejected", candidateId: action.id, candidateRevision: 2 }; }
      if (action.kind === "correct") { state.facts = [{ ...fact(action.text), revision: 3 }]; return { status: "active" }; }
      state.facts = []; return { status: "forgotten" };
    },
    auditSource: async (id) => ({ factId: id, revision: 2, status: "eligible", reason: "valid-support", sources: [{ sourceId: "settings-source", revision: 1, kind: "explicitUserConfirmed", validity: "valid", occurredAt: 1000 }] }),
  };
  const panel = createSmhPanel(root, api);
  return { root, state, actions, api, panel };
}
const click = (root: HTMLElement, action: string) => (root.querySelector(`[data-memory-action="${action}"]`) as HTMLButtonElement).click();
beforeEach(() => { document.body.replaceChildren(); });

describe("SMH settings panel", () => {
  it("shows facts, candidates, status, source time and explicit coverage instead of L0/L1", async () => {
    const f = fixture(); f.state.facts = [fact()]; await f.panel.load();
    expect(f.root.textContent).toContain("已记住的事实"); expect(f.root.textContent).toContain("待确认候选");
    expect(f.root.textContent).toContain("来源时间"); expect(f.root.textContent).toContain("source-1");
    expect(f.root.textContent).toContain("3 / 3"); expect(f.root.textContent).toContain("未评估");
    expect(f.root.textContent).not.toMatch(/L0|L1|无历史/);
  });
  it("confirms, corrects and forgets with revisioned actions, then reloads displayed state", async () => {
    const f = fixture(); await f.panel.load(); click(f.root, "confirm");
    await vi.waitFor(() => expect(f.root.querySelector('[data-memory-action="correct"]')).not.toBeNull());
    expect(f.actions[0]).toEqual({ kind: "confirm", id: "candidate-1", expectedRevision: 1 });
    click(f.root, "correct");
    const input = f.root.querySelector("textarea")!; input.value = "我喜欢咖啡";
    click(f.root, "save-correction");
    await vi.waitFor(() => expect(f.root.textContent).toContain("我喜欢咖啡"));
    expect(f.actions[1]).toEqual({ kind: "correct", id: "fact-1", expectedRevision: 2, text: "我喜欢咖啡" });
    click(f.root, "forget");
    await vi.waitFor(() => expect(f.root.textContent).not.toContain("我喜欢咖啡"));
    expect(f.actions[2]).toEqual({ kind: "forget", id: "fact-1", expectedRevision: 3 });
    expect(f.root.textContent).toContain("已遗忘");
  });
  it("rejects a candidate and does not mistake the successful rejected outcome for failure", async () => {
    const f = fixture(); await f.panel.load(); click(f.root, "reject");
    await vi.waitFor(() => expect(f.root.textContent).toContain("已拒绝"));
    expect(f.actions).toEqual([{ kind: "reject", id: "candidate-1", expectedRevision: 1 }]);
    expect(f.root.querySelector('[data-memory-action="confirm"]')).toBeNull();
  });
  it("shows partial and unavailable coverage without claiming no history or hiding loading failures", async () => {
    const f = fixture(); f.state.candidates = []; f.state.coverage.unknownDenied = 1; f.state.coverage.present = 2; f.state.coverage.exactRatio = null;
    await f.panel.load(); expect(f.root.textContent).toContain("覆盖不完整"); expect(f.root.textContent).not.toContain("无历史");
    f.state.backendStatus = { available: false, reason: "MEMORY_BACKEND_UNAVAILABLE" };
    await f.panel.load(); expect(f.root.textContent).toContain("记忆后端不可用"); expect(f.root.textContent).not.toContain("暂无事实");
    f.api.getState = async () => { throw new Error("/private/account secret"); };
    await f.panel.load(); expect(f.root.textContent).toContain("读取失败"); expect(f.root.textContent).not.toMatch(/private|secret|暂无事实/);
    const root = document.createElement("div"); await createSmhPanel(root, undefined).load();
    expect(root.textContent).toContain("记忆后端不可用");
  });
  it("double click submits once and keeps actions disabled while pending", async () => {
    const f = fixture(); let release!: () => void;
    const original = f.api.applyAction;
    f.api.applyAction = async (action) => { await new Promise<void>((resolve) => { release = resolve; }); return original(action); };
    await f.panel.load(); click(f.root, "confirm"); click(f.root, "confirm");
    expect([...f.root.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);
    release(); await vi.waitFor(() => expect(f.actions).toHaveLength(1));
  });
  it("renders hostile assertion, candidate, backend reason and provenance only as text", async () => {
    const f = fixture(); const hostile = '<img src=x onerror="window.pwned=true">';
    f.state.facts = [fact(hostile)]; f.state.candidates[0].assertion = hostile;
    f.state.candidates[0].reason = hostile; f.state.backendStatus.reason = hostile;
    f.api.auditSource = async () => ({ factId: "fact-1", revision: 2, status: "eligible", reason: hostile, sources: [{ sourceId: hostile, revision: 1, kind: "automatic", validity: hostile, occurredAt: 1000 }] });
    await f.panel.load(); click(f.root, "source");
    await vi.waitFor(() => expect(f.root.textContent).toContain("来源详情"));
    expect(f.root.textContent).toContain(hostile); expect(f.root.querySelector("img")).toBeNull(); expect(f.root.querySelector("script")).toBeNull();
  });
  it("shows stale/error results without claiming success and refreshes stale state", async () => {
    const f = fixture(); f.api.applyAction = async () => ({ status: "rejected", reason: "MEMORY_REVISION_CONFLICT" });
    await f.panel.load(); click(f.root, "confirm");
    await vi.waitFor(() => expect(f.root.textContent).toContain("MEMORY_REVISION_CONFLICT"));
    expect(f.root.textContent).not.toContain("已确认");
  });
  it("source read failures are visible and contain no raw exception details", async () => {
    const f = fixture(); f.state.facts = [fact()]; f.api.auditSource = async () => { throw new Error("private-token"); };
    await f.panel.load(); click(f.root, "source");
    await vi.waitFor(() => expect(f.root.textContent).toContain("来源读取失败"));
    expect(f.root.textContent).not.toContain("private-token");
  });
});


describe("settings memory page integration", () => {
  it("mounts the new manager and preserves only the separate imported-document controls", async () => {
    document.body.innerHTML = fs.readFileSync("src/renderer/settings/index.html", "utf8");
    expect(document.getElementById("memory-smh-panel")).not.toBeNull();
    expect(document.getElementById("memory-imported-list")).not.toBeNull();
    expect(document.getElementById("memory-l0-edit-btn")).toBeNull();
    expect(document.getElementById("memory-l1-edit-btn")).toBeNull();
    expect(document.getElementById("memory-l2-list")).toBeNull();
    expect(document.getElementById("obsidian-vault-bind-btn")).toBeNull();
  });
  it("loads the real page entry, keeping imported docs usable when policy state fails", async () => {
    vi.resetModules();
    document.body.innerHTML = fs.readFileSync("src/renderer/settings/index.html", "utf8");
    const calls: string[] = [];
    Object.defineProperty(window, "memoryPanel", { configurable: true, value: {
      getState: async () => { calls.push("state"); throw new Error("private-token"); },
      getData: async () => { calls.push("documents"); return { importedDocs: [{ importId: "doc-1", fileName: "<img src=x>.txt", chunkCount: 2, lastImportedAt: 1000 }] }; },
    } });
    const { loadMemoryPanel } = await import("./panel");
    await loadMemoryPanel();
    expect(calls.sort()).toEqual(["documents", "state"]);
    expect(document.getElementById("memory-smh-panel")?.textContent).toContain("读取失败");
    const docs = document.getElementById("memory-imported-list")!;
    expect(docs.textContent).toContain("<img src=x>.txt");
    expect(docs.querySelector("img")).toBeNull();
    expect(docs.querySelector("[data-import-id=doc-1]")).not.toBeNull();
  });
});
