import type { IFireflyLlmProvider } from "./provider-types";
import type { LlmProviderConfig } from "../../../shared/provider-types";
import { PROVIDER_PRESETS } from "../../../shared/provider-types";
import { LocalFireflyProvider } from "./local-firefly-provider";
import { OpenAiFireflyProvider } from "./openai-firefly-provider";

export function createFireflyProvider(config: LlmProviderConfig): IFireflyLlmProvider {
  if (config.provider === "local" || !config.baseUrl) {
    return new LocalFireflyProvider();
  }

  const presetName = PROVIDER_PRESETS[config.provider]?.name || "外部兼容模型";
  return new OpenAiFireflyProvider(config, presetName);
}
