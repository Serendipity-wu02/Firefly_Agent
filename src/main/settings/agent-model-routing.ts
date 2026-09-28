import type { SavedModelProfile } from "./model-catalog";

export interface AgentModelRoutingSettings {
  modelProfiles?: SavedModelProfile[];
  defaultModelProfileId?: string;
  agentModelProfiles?: Record<string, string>;
}

export function normalizeAgentModelProfiles(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([name, profileId]) =>
    name.trim() && typeof profileId === "string" && profileId.trim()
      ? [[name, profileId.trim()]] : []));
}

export function resolveAgentModelProfile(settings: AgentModelRoutingSettings, route: string): SavedModelProfile {
  const routes = normalizeAgentModelProfiles(settings.agentModelProfiles);
  const profileId = Object.hasOwn(routes, route)
    ? routes[route]
    : route === "default" ? settings.defaultModelProfileId : undefined;
  if (!profileId) throw new Error("AGENT_MODEL_ROUTE_UNCONFIGURED");
  const profile = settings.modelProfiles?.find(entry => entry.id === profileId);
  if (!profile) throw new Error("AGENT_MODEL_PROFILE_NOT_FOUND");
  if (!profile.provider?.trim() || !profile.baseUrl?.trim() || !profile.model?.trim()) {
    throw new Error("AGENT_MODEL_PROFILE_INCOMPLETE");
  }
  return { ...profile, ...(profile.reasoning ? { reasoning: { ...profile.reasoning } } : {}) };
}
