import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getPath: () => "/tmp/firefly-test" } }));

import { normalizeModelSettings } from "./model-settings";

describe("normalizeModelSettings current vision settings", () => {
  it("keeps an explicit independent vision model and multimodal choice", () => {
    const settings = normalizeModelSettings({
      schemaVersion: 2,
      modelProfiles: [],
      multimodal: false,
      vision: { baseUrl: "https://vision.example.test", apiKey: "test-key", model: "vision-test" },
    });

    expect(settings.multimodal).toBe(false);
    expect(settings.vision).toEqual({ baseUrl: "https://vision.example.test", apiKey: "test-key", model: "vision-test" });
  });

  it("defaults multimodal without inferring from the vision endpoint", () => {
    const settings = normalizeModelSettings({
      schemaVersion: 2,
      modelProfiles: [],
      vision: { baseUrl: "https://vision.example.test", apiKey: "test-key", model: "vision-test" },
    });

    expect(settings.multimodal).toBe(true);
  });
});
