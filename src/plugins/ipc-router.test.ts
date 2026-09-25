import { describe, expect, it } from "vitest";
import { createPluginIpcRouter } from "./ipc-router";

function routerWithDemo() {
  const router = createPluginIpcRouter();
  router.register("plugin:demo:snapshot", () => ({ cpu: 12 }));
  router.register("plugin:demo:echo", (value: unknown) => value);
  router.register("plugin:demo:boom", () => {
    throw new Error("炸了");
  });
  return router;
}

describe("createPluginIpcRouter", () => {
  it("dispatch：合法通道返回包装结果", async () => {
    const router = routerWithDemo();
    const result = await router.dispatch({ pluginId: "demo", channel: "snapshot", args: [], caller: "panel" });
    expect(result).toEqual({ ok: true, data: { cpu: 12 } });
  });

  it("dispatch：参数透传，异步 handler 结果被 await", async () => {
    const router = createPluginIpcRouter();
    router.register("plugin:demo:async", async (a: number, b: number) => a + b);
    const result = await router.dispatch({ pluginId: "demo", channel: "async", args: [1, 2], caller: "panel" });
    expect(result).toEqual({ ok: true, data: 3 });
  });

  it("dispatch：handler 抛错被规范化为失败结果", async () => {
    const router = routerWithDemo();
    const result = await router.dispatch({ pluginId: "demo", channel: "boom", args: [], caller: "panel" });
    expect(result).toEqual({ ok: false, error: "炸了" });
  });

  it("dispatch：未注册/未运行插件的通道查不到", async () => {
    const router = routerWithDemo();
    const missing = await router.dispatch({ pluginId: "demo", channel: "nope", args: [], caller: "panel" });
    expect(missing.ok).toBe(false);
    expect(missing.ok === false && missing.error).toContain("未注册");

    const other = await router.dispatch({ pluginId: "ghost", channel: "snapshot", args: [], caller: "panel" });
    expect(other.ok).toBe(false);
  });

  it("dispatch：非法 pluginId 与非法 channel 被语法层拒绝", async () => {
    const router = routerWithDemo();
    // 面板伪造其他插件 id：拼出的通道不在表内（各插件通道空间隔离）
    const forged = await router.dispatch({ pluginId: "other-plugin", channel: "snapshot", args: [], caller: "panel" });
    expect(forged.ok).toBe(false);

    // 语法非法值在拼名之前被拒绝，防止构造跨插件/管理通道
    for (const pluginId of ["Demo", "de_mo", "../evil", "a:b", ""]) {
      const result = await router.dispatch({ pluginId, channel: "snapshot", args: [], caller: "panel" });
      expect(result.ok).toBe(false);
    }
    for (const channel of ["a:b", "plugin:x:y", "../evil", "", "a b"]) {
      const result = await router.dispatch({ pluginId: "demo", channel, args: [], caller: "panel" });
      expect(result.ok).toBe(false);
    }
  });

  it("unregister 后通道失效（插件 dispose 链路）", async () => {
    const router = routerWithDemo();
    router.unregister("plugin:demo:snapshot");
    const viaInvoke = () => router.invokeRegistered("plugin:demo:snapshot", []);
    expect(viaInvoke).toThrow(/未注册/);
    const viaPanel = await router.dispatch({ pluginId: "demo", channel: "snapshot", args: [], caller: "panel" });
    expect(viaPanel.ok).toBe(false);
  });

  it("register 重复通道报错；invokeRegistered 直查执行", () => {
    const router = createPluginIpcRouter();
    router.register("plugin:demo:x", () => 1);
    expect(() => router.register("plugin:demo:x", () => 2)).toThrow(/已注册/);
    expect(router.invokeRegistered("plugin:demo:x", [])).toBe(1);
  });
});
