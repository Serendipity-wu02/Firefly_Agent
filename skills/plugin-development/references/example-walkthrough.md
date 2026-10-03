# 上游示例插件走读：system-status

本示例沿用上游实现与署名；manifest 中的作者不是 Firefly 维护者，不因宿主产品改名而替换。

本文件走读真实插件的工具注册、带参数 schema、子进程数据采集、无边框弹窗、私有 IPC 和设置面板。代码片段是局部摘录，不是独立可运行入口；完整实现以该目录源码为准。

源码位置：仓库 `examples/system-status/`（开发版）。结构：

```text
system-status/
  manifest.json
  index.cjs      # 入口：工具注册 + IPC + 弹窗管理
  ui.html        # 弹窗界面（自绘标题栏 + 数据面板）
  panel.html     # 宿主设置页内嵌面板
  avatar.png     # 随包分发的静态资源（同时充当插件图标）
```

## manifest.json

```json
{
  "apiVersion": 1,
  "id": "system-status",
  "name": "系统状态",
  "version": "0.2.0",
  "description": "查询本机系统状态：CPU、内存、磁盘、电池与开机时长",
  "author": "Playa",
  "entry": "index.cjs",
  "icon": "avatar.png",
  "settingsPanel": "panel.html",
  "defaultEnabled": false
}
```

`icon` 指向的图片会显示在聊天窗口插件卡片左侧；文件缺失或超限会被静默忽略，插件照常加载。

## 要点 1：两个工具，一个带参数

```js
ctx.registerTool({
  id: "system-status_status",
  name: "系统状态查询",
  description: "查询当前系统状态：CPU 占用与型号、内存使用、GPU 占用与温度、开机时长。用户询问电脑状态、剩余内存、显卡温度等时使用。",
  enabled: true,
  risk: "safe",
  effectKind: "read",
  inputSchema: { type: "object", properties: {}, required: [] },
  async execute() { return (await collectStatus()).join("\n"); },
});

ctx.registerTool({
  id: "system-status_disk",
  name: "磁盘占用查询",
  description: "查询磁盘占用。drive 参数为盘符（如 C、D），不传时当前实现查询 C 盘。",
  enabled: true,
  risk: "safe",
  effectKind: "read",
  inputSchema: {
    type: "object",
    properties: { drive: { type: "string", description: "盘符，如 C 或 D" } },
    required: [],
  },
  async execute(args) {
    const drive = typeof args.drive === "string" && /^[a-z]$/i.test(args.drive.trim())
      ? args.drive.trim().toUpperCase() : undefined;
    return collectDisk(drive);
  },
});
```

- 两个 id 都以 `system-status_` 开头（插件 id 前缀铁律）
- description 把"用户会怎么问"写进去，AI 命中率高

## 要点 2：数据采集——原生优先，子进程兜底

- CPU 占用：`os.cpus()` 两次采样差分；首次没有差分基准，返回 null
- GPU 占用/温度/显存：优先调用 `nvidia-smi`；失败后不再重试该命令，Windows 回退使用 `Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine` 的 `UtilizationPercentage` 汇总（只有占用）
- 磁盘/电池：一次 PowerShell `Get-CimInstance` 拿全
- 所有子进程：设超时；拿不到的数据返回 null，UI 显示"—"，绝不让面板崩

## 要点 3：无边框弹窗 + 自绘标题栏

```js
async open() {
  if (pluginWin && !pluginWin.isDestroyed()) { pluginWin.focus(); return; }
  const { BrowserWindow } = require("electron");
  pluginWin = new BrowserWindow({
    width: 860, height: 600,
    minWidth: 380, minHeight: 420,
    frame: false,                    // 无系统标题栏
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  // 窗口控制按钮：渲染进程 send，主进程 on
  const { ipcMain } = require("electron");
  const onMin = () => pluginWin?.minimize();
  const onClose = () => pluginWin?.close();
  ipcMain.on("plugin:system-status:win-minimize", onMin);
  ipcMain.on("plugin:system-status:win-close", onClose);
  pluginWin.on("closed", () => {
    pluginWin = null;
    ipcMain.removeListener("plugin:system-status:win-minimize", onMin);
    ipcMain.removeListener("plugin:system-status:win-close", onClose);
  });
  await pluginWin.loadFile(path.join(__dirname, "ui.html"));
}
```

ui.html 标题栏的关键 CSS：

```css
.titlebar { -webkit-app-region: drag; }       /* 整条可拖动窗口 */
.titlebar button { -webkit-app-region: no-drag; }  /* 按钮必须豁免，否则点不到 */
```

## 要点 4：私有 IPC + 前端轮询

```js
ctx.registerIpc("snapshot", () => collectSnapshot());
```

```js
// ui.html：每 3 秒拉一次，单次失败静默重试
async function poll() {
  try { window.renderSnapshot(await ipcRenderer.invoke("plugin:system-status:snapshot")); }
  catch { /* 静默，下轮再试 */ }
}
setInterval(poll, 3000);
```

## 要点 5：彻底清理

```js
async unregister() {
  if (pluginWin && !pluginWin.isDestroyed()) pluginWin.close();
}
```

## 拿它当模板改

1. 复制目录，改 manifest 的 `id`/`name`/`description`
2. 全文搜索旧 id（工具前缀、IPC 通道名都要跟着改）
3. 替换 `collectSnapshot()` 数据源及 `ui.html`、`panel.html` 面板内容
4. 版本号从 `0.1.0` 起步，每改一版递增

## TypeScript + SDK 示例索引

需要数据服务（Secrets、对话分页、调度任务）或语音输入租约时，参考 `examples/` 下四个 TypeScript 示例（`weather-tool`、`long-term-memory`、`scheduled-automation`、`local-asr-contract`）：它们用 `@firefly/plugin-sdk` 的类型与测试工具编写，`npm run test:plugin-examples` 可从打包后的 SDK 编译并冒烟验证。

测试工具在独立冒烟脚本中使用，四个插件入口仅导入 SDK 类型。源码中的生命周期与持久化限制见仓库 `examples/README.md`；注册冒烟不等于真实宿主端到端验证。
