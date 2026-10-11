import type { DesktopAsrApi } from "../shared/desktop-asr";
import type { SettingsApi } from "./settings/shared/types";
import type { ModelConfigApi } from "../shared/model-connection-types";
import type { BrowserAvailabilityApi } from "../shared/browser-availability";
// Global type augmentations for renderer

import type { ReviewSnapshot, ReviewRestoreOutcome } from "../shared/review-types";
import type { AppUpdateApi } from "../shared/app-update";
import type { StickerManagerApi } from "../shared/sticker-types";
import type { PluginManagementApi, PluginPanelApi } from "../shared/plugin-management";
import type { WorkspaceListResult, WorkspaceReadResult, WorkspaceSaveResult } from "../shared/workspace-files-types";
import type { OpenInAppListResult, OpenInAppOpenResult } from "../shared/open-in-app-types";

interface SystemApi {
  openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>;
}

interface ReviewApi {
  get: (runId: string) => Promise<ReviewSnapshot | null>;
  /** 把本次 Run 修改过的文件恢复到运行前状态 */
  restore: (runId: string) => Promise<ReviewRestoreOutcome>;
}

interface WorkspaceFilesApi {
  /** 列出工作区内某目录的条目（懒加载；隐藏文件已过滤，目录优先排序） */
  list: (sessionId: string, relPath: string) => Promise<WorkspaceListResult>;
  /** 读取工作区内某文件内容（预览用；1MB 上限、二进制拒绝） */
  read: (sessionId: string, relPath: string) => Promise<WorkspaceReadResult>;
  /** Every save requires Main-owned native confirmation. */
  save: (sessionId: string, relPath: string, content: string, editVersion: string) => Promise<WorkspaceSaveResult>;
}

interface OpenInAppApi {
  /** 探测本机可打开工作区的应用（主进程进程内缓存；不含固定的资源管理器项） */
  listApps: (sessionId: string) => Promise<OpenInAppListResult>;
  /** 执行打开动作：explorer 固定项 + 探测到的应用 id */
  open: (sessionId: string, appId: string) => Promise<OpenInAppOpenResult>;
}

/** 聊天窗口通过 contextBridge 暴露的 window.chat（对应 preload 的 chatApi）。
 *  只声明渲染端实际使用的方法面，完整实现见 src/preload/index.ts。 */
interface ChatWindowApi {
  minimize: () => void;
  close: () => void;
  toggleMaximize: () => void;
  isMaximized: () => Promise<boolean>;
  /** 最大化后拖标题栏：主进程还原窗口并跟随光标，直到 endWindowDrag。 */
  startWindowDrag: () => void;
  endWindowDrag: () => void;
  /** 已启用的贴纸列表（主进程返回 { id, src } 结构） */
  getEnabledStickers: () => Promise<Array<{ id: string; src: string }>>;
  /** 读取本地图片并转为 dataUrl 预览；失败返回 ok=false + error */
  getImagePreview: (filePath: string) => Promise<{ ok: boolean; dataUrl?: string; error?: string }>;
  /** 主进程通用设置（只声明渲染端读取的字段） */
  getGeneralSettings: () => Promise<{
    language?: string;
    currentStyleId?: string;

  }>;
}

declare global {
  interface Window {
    desktopAsr?: DesktopAsrApi;
    manualBrowser?: BrowserAvailabilityApi;
    manualBrowserWorkspace?: import("../shared/manual-browser").ManualBrowserWorkspaceApi;
    modelConfig?: ModelConfigApi;
    system?: SystemApi;
    review?: ReviewApi;
    workspaceFiles?: WorkspaceFilesApi;
    openInApp?: OpenInAppApi;
    appUpdate?: AppUpdateApi;
    plugins?: PluginManagementApi;
    pluginPanel?: PluginPanelApi;
    toast?: ToastRendererApi;
    chat?: ChatWindowApi;
    stickerManager?: StickerManagerApi;
    settings?: SettingsApi;
  }
}

// 注意：静态资源（*.png / *.svg / *.md?raw 等）的 declare module 通配声明
// 不在此文件声明——本文件因类型导入而成为"模块"，模块内的通配声明不参与模块解析。
// 这些声明已移至脚本式的 assets.d.ts。

export {};
