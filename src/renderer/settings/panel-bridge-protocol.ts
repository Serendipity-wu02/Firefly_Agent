/**
 * 插件设置面板桥协议（cyrene-panel/1）：渲染端纯逻辑部分。
 *
 * 与宿主资产 panel-bridge.js 保持同一协议常量（有测试断言一致性）；
 * 消息种类：
 * - 面板→宿主：invoke / height
 * - 宿主→面板：invoke-result / init / theme-changed
 */

export const PANEL_PROTOCOL = "cyrene-panel/1";
export const PANEL_MIN_HEIGHT = 120;
export const PANEL_MAX_HEIGHT = 800;
export const PANEL_SCHEME = "cyrene-plugin";

export interface PanelInvokeMessage {
  protocol: typeof PANEL_PROTOCOL;
  kind: "invoke";
  seq: number;
  channel: string;
  args: unknown[];
}
export interface PanelHeightMessage {
  protocol: typeof PANEL_PROTOCOL;
  kind: "height";
  height: number;
}
export type PanelInboundMessage = PanelInvokeMessage | PanelHeightMessage;

export interface PanelTheme {
  name: string;
  tokens: Record<string, string>;
}

/** 面板 origin：与协议层 PLUGIN_ID_RE 同语法的插件 id 才有合法 origin */
export function panelOriginFor(pluginId: string): string {
  return `${PANEL_SCHEME}://${pluginId}`;
}

/** 高度钳制：防面板伪造超大/零高度撑爆设置页 */
export function clampPanelHeight(height: number): number {
  if (!Number.isFinite(height)) return PANEL_MIN_HEIGHT;
  return Math.min(PANEL_MAX_HEIGHT, Math.max(PANEL_MIN_HEIGHT, Math.round(height)));
}

/** 面板消息体校验：格式不对直接丢弃（渲染端不留处理分支） */
export function parsePanelMessage(data: unknown): PanelInboundMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const message = data as Record<string, unknown>;
  if (message.protocol !== PANEL_PROTOCOL) return null;
  if (message.kind === "invoke") {
    if (
      typeof message.seq !== "number"
      || typeof message.channel !== "string"
      || !Array.isArray(message.args)
    ) {
      return null;
    }
    return { protocol: PANEL_PROTOCOL, kind: "invoke", seq: message.seq, channel: message.channel, args: message.args };
  }
  if (message.kind === "height") {
    if (typeof message.height !== "number") return null;
    return { protocol: PANEL_PROTOCOL, kind: "height", height: message.height };
  }
  return null;
}

/** 从计算样式收集 CSS 变量 token（面板主题唯一链路的数据源） */
export function collectThemeTokens(
  computedStyle: CSSStyleDeclaration,
): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const property of Array.from(computedStyle)) {
    if (property.startsWith("--")) {
      tokens[property] = computedStyle.getPropertyValue(property).trim();
    }
  }
  return tokens;
}

/** 组装下发面板的主题对象（name + token 集）；DOM 值由调用方注入便于测试 */
export function buildPanelTheme(
  themeName: string,
  computedStyle: CSSStyleDeclaration,
): PanelTheme {
  return { name: themeName, tokens: collectThemeTokens(computedStyle) };
}
