import { assertModelSettingsReadable, loadModelSettings, resolveModelSettingsProfile } from "../settings/model-settings";

export type MemoryModelConfigSource = "inherited-main";

export interface MemoryModelConfig {
  source: MemoryModelConfigSource;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  explicitTransport?: "openai" | "anthropic" | "responses";
}

export function loadMemoryModelConfig(): MemoryModelConfig {
  assertModelSettingsReadable();
  const settings = resolveModelSettingsProfile(loadModelSettings());
  return {
    source: "inherited-main",
    provider: settings.provider.trim(),
    baseUrl: settings.baseUrl.trim(),
    model: settings.model.trim(),
    apiKey: settings.apiKey.trim(),
    explicitTransport: settings.explicitTransport,
  };
}

export function stripThinkBlocks(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .trim();
}
