// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { SidebarLayoutApi, SidebarSnapshot } from "../../../../../shared/sidebar-layout";
import { SidebarLayoutControls } from "./SidebarLayoutControls";
import { useSidebarLayout } from "../pages/use-sidebar-layout";
vi.mock("../../../i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, snapshot: SidebarSnapshot, api: SidebarLayoutApi;
const sessions = [] as const;
const groups = [{ groupId: "work:section:s", sectionId: "s", label: "Section", sessions: [] }, { groupId: "work:default", label: "Recent", sessions: [] }];
function Harness() {
  const layout = useSidebarLayout(api, sessions);
  return layout.snapshot && createElement(SidebarLayoutControls, { mode: "work", snapshot: layout.snapshot, groups, projectIds: [], pending: layout.pending, mutate: layout.mutate });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const state = { viewMode: "merged" as const, sortMode: "recent" as const, hiddenProjectIds: [], sections: [{ id: "s", name: "Section" }], collapsedGroupIds: [], membership: {}, manualOrders: {}, groupOrder: ["work:project:pb", "work:section:s", "work:project:pa", "work:default"] };
  snapshot = { layout: { schemaVersion: 1, revision: 3, projects: [], modes: { work: state, chat: state, code: state } }, sessionProjectIds: {}, notices: [] };
  api = { get: vi.fn(async () => ({ ok: true, snapshot })), mutate: vi.fn(async () => ({ ok: false, code: "storage_error" })), onChanged: () => () => {} };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
it("reorders visible groups without dropping the invisible project order", async () => {
  await act(async () => root.render(createElement(Harness)));
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="sidebar.moveDown"]')!.click());
  expect(api.mutate).toHaveBeenCalledWith({ expectedRevision: 3, patch: { mode: "work", kind: "set-group-order", groupIds: ["work:project:pb", "work:default", "work:project:pa", "work:section:s"] } });
});
it.each(["conflict", "storage_error"])("preserves a section name draft after %s", async code => {
  vi.mocked(api.mutate).mockResolvedValue({ ok: false, code: code as "conflict" | "storage_error" });
  await act(async () => root.render(createElement(Harness)));
  const form = host.querySelector<HTMLFormElement>("form")!, input = form.querySelector<HTMLInputElement>("input")!;
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"Keep this draft"); input.dispatchEvent(new Event("input",{bubbles:true})); });
  await act(async () => form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(api.mutate).toHaveBeenCalled(); expect(input.value).toBe("Keep this draft");
});
