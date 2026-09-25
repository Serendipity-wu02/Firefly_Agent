import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PANEL_MAX_HEIGHT,
  PANEL_MIN_HEIGHT,
  PANEL_PROTOCOL,
  clampPanelHeight,
  collectThemeTokens,
  panelOriginFor,
  parsePanelMessage,
} from "./panel-bridge-protocol";

describe("panelOriginFor", () => {
  it("ignores forged bridge results from windows other than the parent", async () => {
    const script = readFileSync(path.join(__dirname, "../../main/plugin-panel/panel-bridge.js"), "utf8");
    const listeners = new Map<string, (event: unknown) => void>();
    const messages: Array<{ seq: number; protocol: string }> = [];
    const parent = { postMessage: (message: { seq: number; protocol: string }) => { messages.push(message); } };
    const windowObject: { parent: typeof parent; addEventListener: (name: string, listener: (event: unknown) => void) => void; FireflyPanel?: { invoke(channel: string): Promise<unknown> } } = {
      parent,
      addEventListener: (name, listener) => { listeners.set(name, listener); },
    };
    runInNewContext(script, { window: windowObject });
    const result = windowObject.FireflyPanel!.invoke("snapshot");
    expect(messages[0].protocol).toBe("firefly-panel/1");
    let settled = false;
    void result.then(() => { settled = true; });
    const data = { protocol: "firefly-panel/1", kind: "invoke-result", seq: messages[0].seq, ok: true, data: "public result" };
    listeners.get("message")!({ source: {}, data });
    await Promise.resolve();
    expect(settled).toBe(false);
    listeners.get("message")!({ source: parent, data });
    await expect(result).resolves.toBe("public result");
  });
  it("插件 id 直接充当 origin host", () => {
    expect(panelOriginFor("demo")).toBe("firefly-plugin://demo");
    expect(panelOriginFor("system-status")).toBe("firefly-plugin://system-status");
  });
});

describe("clampPanelHeight", () => {
  it("正常值四舍五入后保留", () => {
    expect(clampPanelHeight(357.6)).toBe(358);
  });
  it("超界值钳到边界；非法值落到下限", () => {
    expect(clampPanelHeight(0)).toBe(PANEL_MIN_HEIGHT);
    expect(clampPanelHeight(-5)).toBe(PANEL_MIN_HEIGHT);
    expect(clampPanelHeight(100_000)).toBe(PANEL_MAX_HEIGHT);
    expect(clampPanelHeight(Number.NaN)).toBe(PANEL_MIN_HEIGHT);
    expect(clampPanelHeight(Number.POSITIVE_INFINITY)).toBe(PANEL_MIN_HEIGHT);
  });
});

describe("parsePanelMessage", () => {
  it("合法 invoke / height 消息被解析", () => {
    expect(parsePanelMessage({
      protocol: PANEL_PROTOCOL,
      kind: "invoke",
      seq: 1,
      channel: "snapshot",
      args: [],
    })).toEqual({ protocol: PANEL_PROTOCOL, kind: "invoke", seq: 1, channel: "snapshot", args: [] });

    expect(parsePanelMessage({
      protocol: PANEL_PROTOCOL,
      kind: "height",
      height: 320,
    })).toEqual({ protocol: PANEL_PROTOCOL, kind: "height", height: 320 });
  });

  it("协议不符 / 字段缺失 / 类型错误一律丢弃", () => {
    expect(parsePanelMessage(null)).toBeNull();
    expect(parsePanelMessage("string")).toBeNull();
    expect(parsePanelMessage({ kind: "invoke" })).toBeNull();
    expect(parsePanelMessage({ protocol: "other/1", kind: "invoke" })).toBeNull();
    expect(parsePanelMessage({ protocol: PANEL_PROTOCOL, kind: "invoke", seq: "1", channel: "x", args: [] })).toBeNull();
    expect(parsePanelMessage({ protocol: PANEL_PROTOCOL, kind: "invoke", seq: 1, channel: 1, args: [] })).toBeNull();
    expect(parsePanelMessage({ protocol: PANEL_PROTOCOL, kind: "invoke", seq: 1, channel: "x", args: "no" })).toBeNull();
    expect(parsePanelMessage({ protocol: PANEL_PROTOCOL, kind: "height", height: "tall" })).toBeNull();
    expect(parsePanelMessage({ protocol: PANEL_PROTOCOL, kind: "init", theme: {} })).toBeNull();
  });
});

describe("collectThemeTokens", () => {
  it("只收集 -- 前缀变量并去掉首尾空白", () => {
    const style = {
      length: 3,
      0: "--ink",
      1: "--line",
      2: "color",
      getPropertyValue: (name: string) => (name === "--ink" ? " #493942 " : "1px solid red"),
    } as unknown as CSSStyleDeclaration;
    expect(collectThemeTokens(style)).toEqual({ "--ink": "#493942", "--line": "1px solid red" });
  });
});

describe("与宿主资产 panel-bridge.js 的协议一致性", () => {
  it("bridge 脚本使用同一协议常量", () => {
    const bridge = readFileSync(
      path.join(__dirname, "../../main/plugin-panel/panel-bridge.js"),
      "utf8",
    );
    expect(bridge).toContain(`var PROTOCOL = "${PANEL_PROTOCOL}"`);
    // 面板→宿主方向消息必须带 protocol 字段（宿主端以此过滤）
    expect(bridge).toMatch(/message\.protocol = PROTOCOL/);
  });
});
