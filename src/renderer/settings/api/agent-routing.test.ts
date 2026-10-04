// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { SPECIALIST_AGENTS, type AgentRoutingView } from "../../../shared/specialist-agents";
import { loadAgentRoutingPanel } from "./agent-routing";
import { getAgentRoutingView } from "../../../main/settings/agent-model-routing";

it("distinguishes equal saved model labels without exposing service addresses or credentials", async () => {
  const root = document.createElement("div");
  const view = getAgentRoutingView({ modelProfiles: ["local-first", "local-second"].map(id => ({
    id, displayName: "Same name", provider: "fixture", model: "same-model",
    baseUrl: `http://127.0.0.1/${id}?private=value`, apiKey: "private-key",
  })) });
  await loadAgentRoutingPanel(root, { getAgentRouting: async () => view });
  const options = [...root.querySelectorAll('[data-routing-id="review"] option')]
    .filter(option => (option as HTMLOptionElement).value);
  expect(options.map(option => option.textContent)).toEqual(["Same name [local-first]", "Same name [local-second]"]);
  expect(root.textContent).not.toMatch(/127\.0\.0\.1|private=value|private-key/);
});

it("renders twelve agents and saves only one selected identity through the bridge", async () => {
  const root = document.createElement("div");
  const view: AgentRoutingView = {
    profiles: [{ id: "fixture-model", label: "Public local fixture" }],
    routes: [{ id: "reasoning" }],
    agents: SPECIALIST_AGENTS.map(agent => ({ ...agent, error: "AGENT_MODEL_ROUTE_UNCONFIGURED" })),
  };
  const updateAgentRouting = vi.fn(async () => view);
  await loadAgentRoutingPanel(root, { getAgentRouting: async () => view, updateAgentRouting });
  expect(root.querySelectorAll('[data-routing-kind="agent"]')).toHaveLength(12);
  expect(root.querySelectorAll('[data-routing-kind="route"]')).toHaveLength(0);
  expect(root.textContent).toContain("AGENT_MODEL_ROUTE_UNCONFIGURED");
  const select = root.querySelector<HTMLSelectElement>('[data-routing-id="review"]')!;
  select.value = "fixture-model";
  select.dispatchEvent(new Event("change"));
  await vi.waitFor(() => expect(updateAgentRouting).toHaveBeenCalledWith({ kind: "agent", id: "review", profileId: "fixture-model" }));
  expect(root.querySelectorAll('input[type="password"]')).toHaveLength(0);
});

it("retains the selection and displays save failure without claiming success", async () => {
  const root = document.createElement("div");
  const view: AgentRoutingView = { profiles: [{ id: "fixture", label: "Fixture" }], routes: [], agents: SPECIALIST_AGENTS.map(agent => ({ ...agent })) };
  await loadAgentRoutingPanel(root, { getAgentRouting: async () => view, updateAgentRouting: async () => { throw new Error("write blocked"); } });
  const select = root.querySelector<HTMLSelectElement>("select")!;
  select.value = "fixture";
  select.dispatchEvent(new Event("change"));
  await vi.waitFor(() => expect(root.textContent).toContain("write blocked"));
  expect(select.value).toBe("fixture");
  expect(select.disabled).toBe(false);
});
