import { describe, expect, it } from "vitest";
import { resolveAgentModelProfile, normalizeAgentModelProfiles } from "./agent-model-routing";

const profiles = [
  { id: "local-default", provider: "test", baseUrl: "http://127.0.0.1:12345", model: "test-model", apiKey: "" },
  { id: "local-code", provider: "test", baseUrl: "http://127.0.0.1:12345", model: "test-code-model", apiKey: "" },
];

describe("agent model routing", () => {
  it("binds the explicit route to a saved profile without using the first model or another route", () => {
    const settings = { modelProfiles: profiles, defaultModelProfileId: "local-default", agentModelProfiles: { coding: "local-code" } };
    expect(resolveAgentModelProfile(settings, "coding")).toEqual(profiles[1]);
    expect(resolveAgentModelProfile(settings, "default")).toEqual(profiles[0]);
    expect(() => resolveAgentModelProfile(settings, "research")).toThrow("AGENT_MODEL_ROUTE_UNCONFIGURED");
    expect(() => resolveAgentModelProfile({ ...settings, agentModelProfiles: { coding: "removed" } }, "coding"))
      .toThrow("AGENT_MODEL_PROFILE_NOT_FOUND");
  });

  it("does not silently select the first saved profile when the saved default is missing", () => {
    expect(() => resolveAgentModelProfile({ modelProfiles: profiles }, "default")).toThrow("AGENT_MODEL_ROUTE_UNCONFIGURED");
    expect(() => resolveAgentModelProfile({ modelProfiles: profiles, defaultModelProfileId: "removed" }, "default"))
      .toThrow("AGENT_MODEL_PROFILE_NOT_FOUND");
  });

  it("normalizes only own nonempty string bindings and does not alter provider settings", () => {
    const routing = Object.assign(Object.create({ research: "inherited" }), { coding: " local-code ", empty: "", secret: { apiKey: "fixture" } });
    expect(normalizeAgentModelProfiles(routing)).toEqual({ coding: "local-code" });
    expect(() => resolveAgentModelProfile({ modelProfiles: profiles, agentModelProfiles: routing }, "research"))
      .toThrow("AGENT_MODEL_ROUTE_UNCONFIGURED");
    const selected = resolveAgentModelProfile({ modelProfiles: profiles, defaultModelProfileId: "local-default" }, "default");
    selected.model = "changed";
    expect(profiles[0].model).toBe("test-model");
  });

  it("rejects incomplete saved models without inventing addresses or requiring a key for local providers", () => {
    expect(resolveAgentModelProfile({ modelProfiles: profiles, defaultModelProfileId: "local-default" }, "default").apiKey).toBe("");
    expect(() => resolveAgentModelProfile({ modelProfiles: [{ ...profiles[0], baseUrl: "" }], defaultModelProfileId: "local-default" }, "default"))
      .toThrow("AGENT_MODEL_PROFILE_INCOMPLETE");
  });
});
