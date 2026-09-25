import { readFileSync } from "node:fs";
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
  it("插件 id 直接充当 origin host", () => {
    expect(panelOriginFor("demo")).toBe("cyrene-plugin://demo");
    expect(panelOriginFor("system-status")).toBe("cyrene-plugin://system-status");
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
