import { describe, expect, test, vi } from "vitest";
import type { ChatVendorAdapter, VendorConfig } from "./types";
import { testVendorConnection } from "./test-connection";

describe("testVendorConnection", () => {
  test("uses the runtime config without dropping transport or reasoning", async () => {
    const cfg: VendorConfig = {
      provider: "MiniMax（稀宇科技）",
      baseUrl: "https://api.minimaxi.com/v1",
      model: "MiniMax-M3",
      apiKey: "secret",
      explicitTransport: "openai",
      reasoning: { mode: "off" },
    };
    const testConnection = vi.fn().mockResolvedValue({ ok: true, latency: 1 });
    const resolveAdapter = vi.fn().mockReturnValue({
      transport: "openai",
      testConnection,
    } as unknown as ChatVendorAdapter);

    await testVendorConnection(cfg, resolveAdapter);

    expect(resolveAdapter).toHaveBeenCalledWith(cfg);
    expect(testConnection).toHaveBeenCalledWith(cfg);
  });
});

test("never logs model credentials or upstream output", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const cfg: VendorConfig = { provider: "fixture-secret", model: "fixture-secret", baseUrl: "https://fixture-secret.invalid", apiKey: "fixture-secret" };
    const adapter = { transport: "openai", testConnection: async () => ({ ok: false, latency: 1, error: "fixture-secret private response", sample: "fixture-secret sample" }) } as unknown as ChatVendorAdapter;
    await testVendorConnection(cfg, () => adapter);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/fixture-secret|private response|sample/);
  } finally { log.mockRestore(); }
});