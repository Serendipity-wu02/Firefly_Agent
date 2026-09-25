/**
 * 插件 IPC 路由器：把两条调用来源收敛到同一张 handler 表——
 * 既有渲染端 ipcMain.invoke("plugin:<id>:<channel>") 直达路径，以及设置
 * 面板桥经 PLUGINS_PANEL_INVOKE 的转发路径。校验、查找、失效、错误
 * 规范化只维护这一套。
 *
 * 安全要点：dispatch 输入的 pluginId 与 channel 都不可信（来自沙箱面板），
 * 必须先过语法校验再拼完整通道名，防止构造 plugin:other-plugin:* 之类的
 * 跨插件通道；handler 表的注销由插件 dispose 链路保证，未运行插件的
 * 通道天然查不到。
 */
import { PLUGIN_ID_RE } from "./loader";

/** 与 context.ts 的 registerIpc 同一语法约束 */
const IPC_SEGMENT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

type IpcHandler = (...args: unknown[]) => unknown;

export interface PluginIpcDispatchInput {
  pluginId: string;
  channel: string;
  args: unknown[];
  caller: "ipc" | "panel";
}

export type PluginIpcDispatchResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export interface PluginIpcRouter {
  /** 登记完整通道（含 plugin: 前缀或管理通道）的 handler */
  register(fullChannel: string, handler: IpcHandler): void;
  /** 注销通道；插件 dispose 时调用 */
  unregister(fullChannel: string): void;
  /** 既有 ipcMain.handle 路径的执行入口：按完整通道名直查执行 */
  invokeRegistered(fullChannel: string, args: unknown[]): unknown;
  /** 面板路径的执行入口：校验后拼名查表，结果统一包装 */
  dispatch(input: PluginIpcDispatchInput): Promise<PluginIpcDispatchResult>;
}

export function createPluginIpcRouter(): PluginIpcRouter {
  const handlers = new Map<string, IpcHandler>();

  return {
    register(fullChannel, handler) {
      if (handlers.has(fullChannel)) {
        throw new Error(`插件 IPC channel 已注册: ${fullChannel}`);
      }
      handlers.set(fullChannel, handler);
    },

    unregister(fullChannel) {
      handlers.delete(fullChannel);
    },

    invokeRegistered(fullChannel, args) {
      const handler = handlers.get(fullChannel);
      if (!handler) {
        throw new Error(`插件 IPC channel 未注册或插件已停止: ${fullChannel}`);
      }
      return handler(...args);
    },

    async dispatch({ pluginId, channel, args }) {
      if (!PLUGIN_ID_RE.test(pluginId)) {
        return { ok: false, error: "插件 id 非法" };
      }
      if (!IPC_SEGMENT_RE.test(channel)) {
        return { ok: false, error: "非法插件 IPC channel" };
      }
      const fullChannel = `plugin:${pluginId}:${channel}`;
      const handler = handlers.get(fullChannel);
      if (!handler) {
        return { ok: false, error: `插件通道未注册或插件未运行: ${channel}` };
      }
      try {
        return { ok: true, data: await handler(...args) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
