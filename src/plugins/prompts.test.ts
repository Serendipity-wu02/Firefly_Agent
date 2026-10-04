import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPluginPromptRegistry,
  MAX_PLUGIN_PROMPT_CHARS,
  MAX_PLUGIN_PROMPT_TOTAL_CHARS,
  PLUGIN_PROMPT_PROVIDER_TIMEOUT_MS,
} from "./prompts";
import type { PluginPromptSource } from "./types";

it("rejects the retired Moments prompt source at registration", () => {
  const registry = createPluginPromptRegistry();
  expect(() => registry.register("retired", {
    id: "context", sources: ["moments-post"] as never, provide: () => "unused",
  }, new AbortController().signal)).toThrow(/sources/);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("PluginPromptRegistry", () => {
  it("rejects retired Learn provider modes", () => {
    const registry = createPluginPromptRegistry();
    expect(() => registry.register("study", { id: "study", modes: ["learn"], provide: () => "study" } as never,
      new AbortController().signal)).toThrow("modes 含未知模式");
  });
  it("按注册顺序拼接命名空间内容，并按模式过滤", async () => {
    const registry = createPluginPromptRegistry();
    const first = new AbortController();
    const second = new AbortController();
    registry.register("alpha", {
      id: "shared",
      modes: ["chat"],
      provide: ({ userText }) => `A:${userText}`,
    }, first.signal);
    registry.register("beta", {
      id: "shared",
      modes: ["work"],
      provide: async ({ source }) => `B:${source}`,
    }, second.signal);

    expect(await registry.build({
      source: "conversation",
      mode: "chat",
      userText: "你好",
    })).toBe("[插件上下文：plugin:alpha:shared]\nA:你好");
    expect(await registry.build({
      source: "scheduler",
      mode: "work",
      userText: "检查任务",
    })).toBe("[插件上下文：plugin:beta:shared]\nB:scheduler");
  });

  it("同一插件拒绝重复和非法 id，不同插件可使用相同短 id", () => {
    const registry = createPluginPromptRegistry();
    const signal = new AbortController().signal;
    const provider = { id: "context", provide: () => "ok" };
    registry.register("alpha", provider, signal);
    expect(() => registry.register("alpha", provider, signal)).toThrow(/已注册/);
    expect(() => registry.register("beta", provider, signal)).not.toThrow();
    expect(() => registry.register("alpha", { id: "../bad", provide: () => "bad" }, signal)).toThrow(/非法/);
  });

  it("单个 Provider 失败不阻止其他内容", async () => {
    const registry = createPluginPromptRegistry();
    const signal = new AbortController().signal;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registry.register("broken", { id: "context", provide: () => { throw new Error("failed"); } }, signal);
    registry.register("kept", { id: "context", provide: () => "KEPT" }, signal);

    const result = await registry.build({ source: "conversation", mode: "chat", userText: "hi" });

    expect(result).toContain("KEPT");
    expect(result).not.toContain("broken:context]");
    expect(warn).toHaveBeenCalledOnce();
  });

  it("Provider 超时后跳过且不阻塞其他内容", async () => {
    vi.useFakeTimers();
    const registry = createPluginPromptRegistry();
    const signal = new AbortController().signal;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    registry.register("slow", { id: "context", provide: () => new Promise<string>(() => {}) }, signal);
    registry.register("fast", { id: "context", provide: () => "FAST" }, signal);

    const building = registry.build({ source: "conversation", mode: "chat", userText: "hi" });
    await vi.advanceTimersByTimeAsync(PLUGIN_PROMPT_PROVIDER_TIMEOUT_MS);

    await expect(building).resolves.toContain("FAST");
  });

  it("停止信号、所有者注销和单项长度上限均生效", async () => {
    const registry = createPluginPromptRegistry();
    const owner = new AbortController();
    const removed = new AbortController();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    registry.register("active", { id: "long", provide: () => "x".repeat(MAX_PLUGIN_PROMPT_CHARS + 10) }, owner.signal);
    registry.register("removed", { id: "context", provide: () => "REMOVED" }, removed.signal);
    expect(registry.unregister("other", "context")).toBe(false);
    expect(registry.unregister("removed", "context")).toBe(true);

    const active = await registry.build({ source: "conversation", mode: "chat", userText: "hi" });
    expect(active).toContain("x".repeat(MAX_PLUGIN_PROMPT_CHARS));
    expect(active).not.toContain("REMOVED");

    owner.abort();
    expect(await registry.build({ source: "conversation", mode: "chat", userText: "hi" })).toBe("");
  });

  it("总长度上限包含标题和分隔符", async () => {
    const registry = createPluginPromptRegistry();
    const signal = new AbortController().signal;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let index = 0; index < 3; index += 1) {
      registry.register("demo", {
        id: `context-${index}`,
        provide: () => "x".repeat(MAX_PLUGIN_PROMPT_CHARS),
      }, signal);
    }

    const result = await registry.build({ source: "conversation", mode: "chat", userText: "hi" });

    expect(result.length).toBe(MAX_PLUGIN_PROMPT_TOTAL_CHARS);
    expect(result).toContain("plugin:demo:context-0");
    expect(result).toContain("plugin:demo:context-1");
    expect(result).not.toContain("plugin:demo:context-2");
  });
});

describe("prompt source selection", () => {
  it("defaults legacy providers to conversation and scheduler", async () => {
    const registry = createPluginPromptRegistry();
    registry.register("legacy", { id: "context", provide: () => "LEGACY" }, new AbortController().signal);
    expect(await registry.build({ source: "plugin-agent", mode: "work", userText: "hi" })).toBe("");
    for (const source of ["conversation", "scheduler"] as const) {
      expect(await registry.build({ source, mode: "chat", userText: "hi" }))
        .toBe("[插件上下文：plugin:legacy:context]\nLEGACY");
    }
  });

  it("selects explicitly declared sources and applies modes to plugin-agent", async () => {
    const registry = createPluginPromptRegistry();
    const signal = new AbortController().signal;
    registry.register("agent", { id: "context", sources: ["plugin-agent"], modes: ["work"],
      provide: ({ source, mode, userText }) => `${source}|${mode}|${userText}` }, signal);
    registry.register("chat", { id: "context", sources: ["conversation"], provide: () => "CHAT" }, signal);
    expect(await registry.build({ source: "plugin-agent", mode: "work", userText: "hi" }))
      .toBe("[插件上下文：plugin:agent:context]\nplugin-agent|work|hi");
    expect(await registry.build({ source: "plugin-agent", mode: "code", userText: "hi" })).toBe("");
    expect(await registry.build({ source: "conversation", mode: "chat", userText: "hi" }))
      .toBe("[插件上下文：plugin:chat:context]\nCHAT");
  });

  it("preserves mode filtering when a provider declares multiple active sources", async () => {
    const registry = createPluginPromptRegistry();
    registry.register("hybrid", { id: "context", sources: ["conversation", "plugin-agent"], modes: ["chat"],
      provide: ({ source }) => `HYBRID:${source}` }, new AbortController().signal);
    expect(await registry.build({ source: "conversation", mode: "work", userText: "hi" })).toBe("");
    expect(await registry.build({ source: "plugin-agent", mode: "work", userText: "hi" })).toBe("");
    expect(await registry.build({ source: "conversation", mode: "chat", userText: "hi" }))
      .toBe("[插件上下文：plugin:hybrid:context]\nHYBRID:conversation");
  });

  it("rejects malformed sources without blocking a subsequent valid provider", async () => {
    const registry = createPluginPromptRegistry();
    const signal = new AbortController().signal;
    for (const sources of [false, 0, "plugin-agent", [], ["bogus"], ["moments-post"]]) {
      expect(() => registry.register("alpha", { id: "context", sources: sources as PluginPromptSource[],
        provide: () => "unused" }, signal)).toThrow(/sources/);
    }
    registry.register("alpha", { id: "context", sources: ["plugin-agent"], provide: () => "VALID" }, signal);
    expect(await registry.build({ source: "plugin-agent", mode: "work", userText: "hi" }))
      .toBe("[插件上下文：plugin:alpha:context]\nVALID");
  });
});
