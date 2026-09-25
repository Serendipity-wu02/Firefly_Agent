# 方案：SnowLuma 受管 QQ 接入 · 插件化实现

> 对应 Issue #96（已关 PR #95）。维护者决策：不以本体合并方式实现，
> 改为「本体开通用接口 + SnowLuma 独立插件」。
>
> 评审记录：
> - v2（2026-09-12 外部 review）：manifest 兼容性、pluginId 宿主绑定、
>   Panel Bridge、删 accountId 编码、fake channel 门槛。
> - v3（2026-09-12 外部 review 收口，当前版）：P0 沙箱/origin 语义修正
>   （`allow-same-origin`）、删除 loader 升级指引、删 `supportFetchAPI`、
>   协议服务面收窄至 enabled+valid、生命周期拆分、IPC 路由器抽象。
>   **v3 后设计冻结，进入阶段一实现。**

---

## 背景

Issue #96 提出 QQ 渠道的三个痛点：难配置、易封号、需反复重新登录，并给出
「SnowLuma 受管接入」方案。PR #95 已实现但直接改动本体 27 个文件，涉及
settings-store、adapter、dispatcher、init 与前端设置页，耦合面大，已被关闭。

本方案将同样的能力拆成两部分：

1. **本体只开一个通用接口**：插件设置面板（plugin settings panel）。
   形状是「任何插件可贡献一块设置 UI」，不是「给 SnowLuma 一张卡片」。
2. **SnowLuma 作为独立插件**：运行时管理、OneBot 协议、访问控制全部收进
   插件内部，本体零感知。

**接口准入原则**：本体只为「插件生态的通用能力」开接口，不为某个具体插件
开接口。判据：换一个插件来用这个接口，还成立吗？成立才进本体。
（这与 `src/plugins/context.ts` 中「宿主服务统一从工厂注入，不再向
PluginContext 增加特例」的既有原则一致。）

据此裁决两个候选接口：

| 候选接口 | 裁决 | 理由 |
|---|---|---|
| 插件设置面板注入 | **开** | 通用 contribution point：weather 插件配 API key、memory 插件配参数、未来任何渠道插件配账号，全用它。相当于 VS Code 的贡献点机制。 |
| 渠道槽位互斥（slot） | **不开（暂缓）** | 目前生态里只有 QQ 一个消费者，正是「为 SnowLuma 专门开接口」的嫌疑形态。等出现第二个「同平台多后端」场景再做成通用能力。 |

---

## 目标 / 非目标

### 目标

- 任何插件可以声明一个设置面板，挂载到设置页指定分区。
- SnowLuma 受管接入的完整能力（下载校验、进程守护、端口持久化、
  账号绑定、黑名单、WebUI 凭据）全部由插件实现，不进本体。
- 插件渠道与 NapCat 渠道会话历史天然隔离，`makeSessionId`、
  `QqChannelConfig`、`napcat-adapter.ts`、`dispatcher.ts` 全部零改动。

### 非目标

- 不做渠道槽位互斥的宿主接口（见上表裁决）。
- 不重构宿主 `ChannelId` 封闭联合类型——但**必须先审计并验证**插件渠道
  id 能完整走通现有链路（见阶段四门槛，这是实现前置条件而非可选项）。
- 不在 `chatId` 里编码账号等身份信息（见 2.2）。
- 不做 `engines.cyrene` 宿主版本门控（通用能力，等插件市场需要时再做）。
- 不携带 SnowLuma 二进制，不复制其源码（沿用 PR #95 的边界）。

---

## 总体架构

```
┌─────────────────────────────── 设置窗口（现有） ────────────────────────────────┐
│  channels-panel 分区                     plugins-panel 分区                      │
│  ┌─────────────────────────┐            ┌─────────────────────────┐             │
│  │ <iframe sandbox=        │            │ <iframe sandbox=        │   ...       │
│  │   "allow-scripts        │            │   "allow-scripts        │             │
│  │    allow-same-origin">  │            │    allow-same-origin"> │             │
│  │  插件 ui.html           │            │  插件 ui.html            │             │
│  │  └ <script src=         │            │  └ <script src=          │             │
│  │     /.cyrene/           │            │     /.cyrene/            │             │
│  │     panel-bridge.js>    │            │     panel-bridge.js>     │             │
│  │    CyrenePanel.invoke / │            │                          │             │
│  │    onTheme / 高度上报    │            │                          │             │
│  └─────────┬───────────────┘            └─────────┬───────────────┘             │
│            │ postMessage（宿主按 event.source + event.origin 双校验；           │
│            │  插件 origin = cyrene-plugin://<插件id>，结构性不同源于设置页）     │
│  ┌─────────┴───────────────────────────────────────────────────┐               │
│  │ 设置页宿主脚本：iframe 注册表 + postMessage 桥 + 挂载        │               │
│  └─────────┬───────────────────────────────────────────────────┘               │
└────────────┼────────────────────────────────────────────────────────────────────┘
             │ window.pluginPanel.invoke（单一 IPC 通道 PLUGINS_PANEL_INVOKE）
             ▼
┌─ 主进程 ─────────────────────────────────────────────────────────────────────┐
│  PLUGINS_PANEL_INVOKE 处理器                                                  │
│   1. 校验 event.sender 是面板宿主窗口（首版=设置窗口）                        │
│   2. dispatchPluginIpc({ pluginId, channel, args, caller: "panel" })           │
│                                                                              │
│  插件 IPC 路由器（新抽象，单一执行路径）：                                     │
│   channel 校验 / enabled 校验 / handler 查找 / dispose 失效 / 错误规范化      │
│   ↑ ipcMain.handle("plugin:<id>:<ch>")（既有路径）                            │
│   ↑ PLUGINS_PANEL_INVOKE（面板路径）                                          │
│                                                                              │
│  cyrene-plugin:// 协议（新增，纯静态文件服务）                                 │
│   仅服务 enabled + settingsPanel 合法的插件；保留路径 /.cyrene/* → 宿主资产    │
│  插件运行时（现有）：SnowLuma 插件 = 适配器 / 运行时 / IPC / storage / secrets │
└────────────────────────────────────────────────────────────────────────────┘
             │ 渠道消息（registerChannelAdapter，现有能力）
             ▼
   ChannelManager → ChannelDispatcher → Agent（完全复用现有链路）
```

---

## 一、本体改动：插件设置面板（通用能力）

### 1.1 技术形态选型与沙箱语义（v3 P0 修正）

采用 **sandbox iframe + 自定义协议 + 宿主提供的 Panel Bridge**，不用 `<webview>`：

| 方案 | 结论 |
|---|---|
| sandbox iframe + 协议 + Bridge | **选用**。无独立进程开销，布局/销毁行为与普通 DOM 一致。 |
| `<webview>` 标签 | 不用。独立进程、需 `webviewTag: true`、布局与销毁行为复杂，设置面板场景收益为零。 |

**sandbox 标志：`allow-scripts allow-same-origin`**（v3 修正，v2 的
`allow-scripts` 单独使用是错的）：

- **v2 的错误**：没有 `allow-same-origin` 的 sandbox iframe 被浏览器强制
  赋予 opaque origin，其 postMessage 的 `event.origin` **恒为 `"null"`**，
  而不是 URL 的 `cyrene-plugin://<id>`。v2 设计的
  `event.origin === cyrene-plugin://<插件id>` 校验在该配置下客观不成立；
  宿主往面板下发消息也无法用精确 origin 字符串定位。
- **修正语义**：`allow-same-origin` 的含义是「保留 iframe 自身真实
  origin」，不是「允许访问宿主」——跨源访问由同源策略挡住，与 sandbox
  无关。加上后每个插件面板拥有自己真正的 origin
  （`cyrene-plugin://<插件id>`），`event.source + event.origin` 双校验
  真正成立，宿主下发 `init`/`theme-changed` 可用精确 targetOrigin。
- **安全前提（必须守住的不变量）**：`allow-scripts + allow-same-origin`
  组合的已知危险是「iframe 与 parent 同源时，子页面可以移除自己的
  sandbox 属性」。本架构中设置页是 `file://`（打包）或
  `http://localhost:5173`（开发），插件面板是 `cyrene-plugin://`，
  **结构性不同源**，危险场景不成立。`cyrene-plugin` scheme 由宿主进程
  独占注册，设置页无法令其与自身同源——此不变量写入协议模块注释，
  阶段二测试中加断言（面板 origin 与设置页 origin 必不相等）。
- **额外收益（防导航攻击）**：若插件 A 把自己的 iframe 导航到
  `cyrene-plugin://plugin-b`，`WindowProxy` 不变、`event.source` 仍匹配
  注册表，但 `event.origin` 已变成 B——第二道 origin 校验正好拦截。

iframe 内**没有 preload**（Electron 默认不在子 frame 注入 preload，
`nodeIntegrationInSubFrames` 属实验特性且会带来整页面的 Node 暴露风险），
所有面板通信走 postMessage，由设置页主 frame 经受控单一 IPC 通道转发。

### 1.2 manifest 契约

`src/plugins/api.ts` 的 `PluginManifest` 与 `PluginManifestInput` 新增两个
可选字段：

```ts
/** 插件目录内的设置面板 HTML 文件名；声明后宿主在设置页挂载该面板。 */
settingsPanel?: string;
/** 面板挂载的设置分区；缺省挂到「插件」分区。 */
settingsSection?: "channels" | "plugins";
```

`settingsSection` 首版只开放两个枚举值：`channels`（渠道分区）、`plugins`
（插件分区，默认）。每开放一个枚举值，设置页就要有对应的挂载容器，所以
故意收窄；将来按需增加，属于纯增量。

**兼容性**：

- manifest schema 是 `additionalProperties: false`——**旧宿主不会「忽略」
  新字段，而是 schema 校验直接失败、整个插件拒绝加载**（fail-closed）。
- 因此正式规定：**声明 `settingsPanel` 的插件要求宿主 ≥ 引入该字段的
  Cyrene 版本**，插件 README 标注最低宿主版本。
- `apiVersion` 保持 1 不变：可选字段不触发 major bump，旧插件在新宿主上
  完全正常（新 schema 向后兼容旧 manifest）。
- 旧 Cyrene 的具体报错文案**无法也无意改善**（旧宿主的 loader 是旧代码，
  新逻辑穿越不回去；v2 曾写的「loader 提供升级指引」存在时间悖论，v3
  删除）。将来若做插件市场，用市场 metadata 或通用
  `engines: { cyrene: ">=x.y.z" }` 承担兼容门控——那是真正的通用生态
  能力，但不在本方案顺手做。

同步改动：

- `src/plugins/manifest.schema.json`：新增两个属性定义（`additionalProperties:
  false`，不改 schema 会让新字段校验失败）；`settingsSection` 用 enum。
- SDK（`packages/plugin-sdk`）随 `api.ts` 同步再导出，无独立改动。

### 1.3 加载校验

`src/plugins/loader.ts` 的 `inspectPluginDir` 内新增 `resolveSettingsPanel()`，
完全照抄 `resolveIcon()` 的既有模式（装饰性可选字段，不合法则静默忽略并留
日志，不让整个插件加载失败）：

- 必须是插件目录内裸文件名（`path.basename(input) === input`）；
- 扩展名 `.html`；文件存在、不超上限（建议 1 MiB）；
- realpath 不得逃逸插件目录（防符号链接越界）。

面板文件不参与 fingerprint 的入口哈希计算（与 icon 一致，只看 manifest
文本与 entry）；面板内容变更无需重载插件，刷新设置页即生效。

### 1.4 面板文件服务协议（纯静态）

新增 `src/main/plugin-panel-protocol.ts`，**两个导出函数、生命周期分开**
（Electron 要求 `registerSchemesAsPrivileged` 在 app ready 之前、
`protocol.handle` 在 ready 之后，拆开防止实现者放错时机）：

```ts
/** index.ts 模块顶层调用（app.ready 之前）。 */
export function registerPluginPanelScheme(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: "cyrene-plugin",
    // 最小权限：standard 支持面板内相对资源（./xxx.js）；
    // secure 获得安全上下文。不开 supportFetchAPI——
    // 面板与主进程通信统一走 CyrenePanel.invoke，无 fetch 需求。
    privileges: { standard: true, secure: true },
  }]);
}

/** app.whenReady() 之后调用（ready 之后才可用 protocol.handle）。 */
export function installPluginPanelProtocol(
  query: PluginPanelAccessQuery,
): void;
```

`protocol.handle("cyrene-plugin", handler)` **只做静态文件服务**：

- URL 形如 `cyrene-plugin://<插件id>/<相对路径>`；
- **服务面（v3 收窄）**：仅当插件「已扫描 AND **enabled** AND
  `manifest.settingsPanel` 通过校验」三条件同时成立才服务其目录；
  禁用插件的 `cyrene-plugin://<id>/*` 立即 404。查询函数由
  PluginManager 注入（records + enabledMap 现有状态），既符合生命周期
  语义（禁用即失效）也收窄暴露面；
- 保留路径 `/.cyrene/*` 不读插件目录，由宿主资产应答（目前仅
  `panel-bridge.js`，见 1.5）；
- 按内容类型返回（html/js/css/png 等白名单）；
- **不做任何 HTML 改写、不注入内容**（协议层职责单一化为「安全地提供
  插件静态资源」；主题唯一链路走 Bridge，见 1.5）。

**插件 id 的 hostname 安全性（v3 已验证，无需改动）**：loader.ts 既有
`ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/`（小写字母数字 + 连字符分段），
是 RFC 3986 host 语法的子集，天然 hostname-safe，可直接作为
`cyrene-plugin://` 的 origin host，无需 `canonicalPanelHost` 或
`encodeURIComponent`（URL host 本不适合后者）。

**路径安全规范（Windows 重点）**——必须用 `path.relative` 判定，禁止
`startsWith(root)` 字符串前缀（`C:\plugins\foo` 与 `C:\plugins\foobar`
的经典前缀绕过）：

```ts
const root = await realpath(pluginRoot);
const target = await realpath(candidate); // candidate 不存在则直接 404
const rel = path.relative(root, target);
if (rel === "" || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
  return notFound();
}
```

URL 解析测试矩阵必须显式覆盖：`%2f`、`%5c`（反斜杠）、`..` 与 `..%2f`、
NUL 字节、双重编码（`%252e`）、盘符绝对路径（`C:` / `file:` 形态）、
大小写差异（Windows 不区分大小写，realpath 比较天然归一）、符号链接
逃逸、保留路径与真实文件冲突时保留路径优先、**禁用插件的目录 404**。

### 1.5 Panel Bridge（设置面板 API 的正式组成部分）

ResizeObserver **必须运行在插件 iframe 内部**——宿主对 sandbox iframe
无法可靠观察其文档尺寸；同时为避免每个插件手搓一套
`postMessage + seq + request/response + height + theme`（必然出现十种
写法），宿主提供唯一官方 Bridge：

- **分发方式**：协议保留路径
  `cyrene-plugin://<任意插件id>/.cyrene/panel-bridge.js`，内容由宿主
  资产提供（随应用打包、随宿主版本演进），插件作者不复制、不维护。
  面板 HTML 内一行引入：

  ```html
  <script src="/.cyrene/panel-bridge.js"></script>
  ```

- **面板侧 API**（全局 `CyrenePanel`）：

  ```ts
  CyrenePanel.invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  CyrenePanel.onTheme(cb: (theme: ThemeTokens) => void): () => void;
  CyrenePanel.ready(): void; // 可选：通知宿主面板已完成首帧渲染
  ```

  `invoke` 的 channel 仅限**本插件**的通道（宿主按 iframe 归属构造完整
  channel，见 1.6/1.7，面板无法指定其他插件）。高度上报完全自动：Bridge
  在内部对 `document.documentElement` 挂 ResizeObserver 并在 load 后
  首报，插件无感知。

- **消息协议**（`cyrene-panel/1`，双向 postMessage）：

  | 方向 | kind | 载荷 | targetOrigin |
  |---|---|---|---|
  | 面板→宿主 | `invoke` | `{ seq, channel, args }` | `"*"`（父页面 origin 在打包 `file://` / 开发 `localhost` 间不同；安全由接收方 source+origin 校验保证，不依赖投递目标） |
  | 宿主→面板 | `invoke-result` | `{ seq, ok, data?, error? }` | `cyrene-plugin://<插件id>`（精确） |
  | 面板→宿主 | `height` | `{ height }`（自动） | `"*"` |
  | 宿主→面板 | `init` | `{ theme }`（iframe load 后下发） | `cyrene-plugin://<插件id>`（精确） |
  | 宿主→面板 | `theme-changed` | `{ theme }` | `cyrene-plugin://<插件id>`（精确） |

  宿主→面板方向能用精确 targetOrigin，正是 1.1 `allow-same-origin`
  修正的直接收益（opaque origin 下只能 `"*"`）。

- **主题**：唯一链路走 Bridge。宿主把主题 token（现有 `ui-theme` 持久化
  设置导出的 CSS 变量集）作为结构化对象下发，Bridge 写入 iframe 的
  `:root` CSS 变量并回调 `onTheme` 订阅者。设置页换主题时对所有存活
  面板推 `theme-changed`，无需刷新页面（不丢表单状态）。

- **高度钳制**：宿主侧 clamp 到 `[120, 800]` 后设置 iframe 高度。

### 1.6 插件 IPC 路由器与 preload 转发（v3 新增抽象）

v3 决定：不维护两条执行路径（`ipcMain.handle("plugin:x:y")` 直达 handler
vs `PLUGINS_PANEL_INVOKE` 查 map）——正好在引入第二个调用来源时抽成
单一入口，避免两套校验与错误处理漂移：

```ts
// src/plugins/ipc-router.ts（新增）
dispatchPluginIpc(input: {
  pluginId: string;
  channel: string;
  args: unknown[];
  caller: "ipc" | "panel";
}): Promise<unknown>;
```

统一承担：channel 格式校验（复用 `registerIpc` 同一正则）、插件存在与
enabled 校验、handler 查找、插件 dispose 后失效、错误规范化。两条来源
收敛到它：

1. **既有路径**：`registerIpc` 注册时，除 `ipcMain.handle` 包装外同步
   登记路由表；handle 包装器内部调 `dispatchPluginIpc({ caller: "ipc" })`。
2. **面板路径**：主进程注册 `PLUGINS_PANEL_INVOKE` 处理器，先做
   **sender 校验**（`event.sender` 必须是面板宿主窗口的 webContents，
   首版即设置窗口，取 `getSettingsWindow()?.webContents` 比对身份），
   再调 `dispatchPluginIpc({ caller: "panel" })`。

sender 校验是主进程侧强制，不依赖渲染端自觉——本通道是首个「任意插件
任意通道」的通用转发入口，不加的话等于给所有共用 preload 的窗口（聊天
窗、侧栏、toast）开了调用任意插件 IPC 的口子。

preload 侧**只暴露单一转发通道**，不提供「按通道名直接 invoke」的通用
后门：

```ts
// src/preload/index.ts
const pluginPanelApi = {
  /** pluginId 由设置页宿主脚本按 iframe 归属填入，不来自消息。 */
  invoke: (pluginId: string, channel: string, args: unknown[]) =>
    ipcRenderer.invoke(IPC.PLUGINS_PANEL_INVOKE, { pluginId, channel, args }),
};
```

### 1.7 设置页挂载与 iframe 绑定

改动集中在设置页（vanilla DOM，遵循现有 `dom.ts` + `settings.ts` 模式）：

- `src/renderer/settings/index.html`：在 `channels-panel` 与
  `plugins-panel` 两个 section 尾部各加一个空容器
  （如 `<div class="plugin-panels" id="plugin-panels-channels">`）。
- 新增 `src/renderer/settings/plugin-panels.ts`（设置页侧的挂载与桥逻辑，
  与现有 `dom.ts` 同级）：
  1. 通过现有 `window.plugins.list()`（`PLUGINS_LIST` →
     `manager.overview()`，含 manifest 与 enabled 状态；若返回结构缺字段
     则顺手补齐）筛出「已启用 + 声明了合法 settingsPanel」的插件；
  2. 按 `settingsSection` 往对应容器插入
     `<iframe sandbox="allow-scripts allow-same-origin"
     src="cyrene-plugin://<id>/<panel>">`，外层加统一卡片壳
     （插件名 + 图标 + 版本），视觉与现有卡片一致；
  3. **iframe 注册表**：`Map<iframe.contentWindow, pluginId>`，创建时写入。
     这是安全边界的锚点——**iframe 不能选择自己是谁**：收到 postMessage
     时按 `event.source` 反查归属插件，`event.origin` 必须等于
     `cyrene-plugin://<插件id>`（allow-same-origin 下该校验真实成立，
     并兼防 1.1 所述导航攻击）；消息里即使携带 `pluginId` 字段也一律
     忽略，未注册来源的消息直接丢弃；
  4. postMessage 桥：把合法来源的 `invoke` 转为
     `window.pluginPanel.invoke(注册表中的pluginId, channel, args)`，
     按 `seq` 回发结果；`height` 消息钳制后调整 iframe 高度；
     `init` / `theme-changed` 在 iframe load 后 / 宿主主题变化时下发；
  5. 插件启停/卸载后刷新面板列表（复用设置页现有的插件管理刷新时机；
     禁用插件的面板随之消失，与 1.4 协议层 404 一致）。

设置页 CSP 若存在，需允许 `frame-src cyrene-plugin:`（以实际 CSP 配置为准）。

### 1.8 本体改动文件清单

| 文件 | 改动 |
|---|---|
| `src/plugins/api.ts` | manifest 新增 `settingsPanel` / `settingsSection` 类型 |
| `src/plugins/manifest.schema.json` | 同步两个属性（含 enum） |
| `src/plugins/loader.ts` | `resolveSettingsPanel()` 校验（icon 同款模式） |
| `src/shared/ipc-channels.ts` | 新增 `PLUGINS_PANEL_INVOKE` |
| `src/plugins/ipc-router.ts` | **新增**：插件 IPC 路由器（dispatchPluginIpc 单一执行路径） |
| `src/main/plugin-panel-protocol.ts` | **新增**：scheme 注册（ready 前）+ 文件服务安装（ready 后）+ 保留路径 |
| `src/main/plugin-panel/panel-bridge.js` | **新增**：官方 Bridge 脚本（宿主资产，随包分发） |
| `src/main/index.ts` | 顶层调 `registerPluginPanelScheme()`；whenReady 后调 `installPluginPanelProtocol()` |
| `src/main/plugin-runtime.ts` | `registerIpc` 登记路由表；`PLUGINS_PANEL_INVOKE` 处理器（sender 校验） |
| `src/preload/index.ts` | 暴露 `pluginPanel`（单一通道） |
| `src/renderer/settings/index.html` | 两个分区容器 |
| `src/renderer/settings/plugin-panels.ts` | **新增**：挂载 + iframe 注册表 + postMessage 桥 |

预期净增约 550–750 行（Bridge、协议、路由器占大头）；核心逻辑（dispatcher、
channels、settings-store）零改动。

---

## 二、SnowLuma 插件设计

### 2.1 插件形态

- 独立插件，manifest 声明 `deps: ["channels", "secrets"]`（声明
  `PluginChannelAdapter` 注册能力与 `PluginSecretsService` 凭据存储）。
- 源码首版随仓库开发（examples 风格），经插件市场分发；是否改为
  内置随包发布，由维护者在交付时另行决策（内置需要打包管线支持，
  不影响本方案结构）。
- 开发期可用多文件（`require` 自己目录内的 `lib/*.cjs`，
  `clearPluginModuleCache` 已按插件目录整树清缓存）。

### 2.2 渠道注册与会话隔离（无 accountId 编码）

- 注册**独立渠道 id `qq-snowluma`**，不占用 `qq`：
  - `makeSessionId("qq-snowluma", chatId)` 生成
    `channel:qq-snowluma:<hash>`，与 NapCat 的 `channel:qq:<hash>`
    **天然隔离**，无需改宿主 `makeSessionId`；
  - 老用户升级零迁移：NapCat 历史原地不动。
- **`chatId` 保持纯语义**（不在 `chatId` 里编码 `accountId:${chatId}`
  之类的身份前缀——chat identity 就是 chat identity，复合键会随时间
  腐烂成 `workspace:account:thread:chat` 且无类型约束）。v1 单受管实例
  = 单 QQ 账号，不需要账号维度：

  ```text
  channel = qq-snowluma
  chatId  = 原始 OneBot chatId（群号 / 对方 QQ 号）
  ```

- **换绑账号的边界**：沿用 PR #95 已有约束——「保留的数据目录不能直接
  重新绑定其他账号」。v1 明确规定：更换绑定 QQ 号 = 删除实例并新建
  （新实例 = 新会话命名空间，历史不跨账号复用）。等真实出现
  Discord 多 bot / Slack 多 workspace / 微信多账号等场景，再设计通用
  `ChannelIdentity { channelId, instanceId?, accountId?, chatId }`——
  同样遵循「通用需求出现了才开接口」。
- 注册渠道后，宿主的限速、TTS、表情包、桌面镜像、状态轮询
  （`CHANNELS_GET_STATUS` 会列出插件渠道）**预期**全部自动生效——
  但这是预期而非已验证事实，必须先过阶段四的链路验证门槛。
- 单实例约束（一个受管实例 = 一个 QQ 账号）：插件内部用 storage 标记 +
  操作锁实现（对应 PR #95 的 `qq-instance.ts` 并发锁，纯插件内逻辑）。

### 2.3 受管运行时（插件内移植）

对应 PR #95 的 `snowluma-runtime.ts` / `snowluma-guardian.ts`，逻辑不变，
落点改变：

| 能力 | 实现落点 |
|---|---|
| 固定版本下载 + SHA-256 校验 + 安全解压 | 插件内（Node fs/https） |
| 实例目录（运行文件/配置/日志） | `ctx.storage.rootDir()` 下自建子目录 |
| WebUI 初始凭据 | `ctx.deps.secrets`（不入日志、不入 IPC 明文） |
| WebUI 端口首次分配后持久化、冲突报错 | `ctx.storage` |
| 进程守护、掉线重连、退出清理 | `ctx.onDispose` 注册退出清理 |
| 反向 WS 地址与 Token 自动写入 | 插件写实例目录内的配置文件 |

**下载确认**：「联网下载第三方可执行文件并在本机运行」属于较强的运行时
能力，首次点击「安装 SnowLuma」时面板必须明确告知：

- 将从 SnowLuma 官方 Release 下载并在本机运行第三方程序；
- 展示：固定版本号、下载来源 URL、SHA-256、安装位置；
- 用户确认后才发起下载。当前插件系统是完全信任模型，不为此引入
  权限系统，但信息披露是底线，对插件市场的长期健康也是对的。

应用退出时插件停止（现有插件生命周期）→ 守护进程随之回收；重启后按
storage 中记录的手动启动状态恢复（对应 PR #95 的恢复语义）。

### 2.4 访问控制（黑名单）

- SnowLuma 走黑名单：空黑名单 = 私聊默认放行；群聊仍需 @ 机器人；
  用户黑名单同时作用于私聊与群聊，群黑名单屏蔽整群。
- 全部在插件适配器的入站过滤里实现（PR #95 中 `isQqEventAllowed` 的
  黑名单分支），配置存 `ctx.storage`，由面板读写。
- 账号绑定校验：拒绝与绑定账号不符的连接与消息（握手校验 self_id，
  PR #95 已有逻辑，直接移植）。
- NapCat 保持白名单语义不变——它在适配器内部读自己的配置，互不干扰。

### 2.5 OneBot 协议层（插件内移植）

从 PR #95 / 现有 `src/main/channels/adapters/qq/` 移植五个自包含模块
到插件 `lib/`：`onebot-reverse-ws`、`onebot-normalizer`、
`onebot-action-client`、`onebot-media`、`onebot-types`。它们对宿主的
依赖极少（消息类型与归一化），插件内维护一份小类型即可。注意一处
移植差异：模块里 `streamMinimumVersion` 等版本门槛提示要写 SnowLuma 的
displayName（PR #95 中 CodeRabbit 指出的「固定显示 NapCat」问题在插件
形态下自然消解——整个适配器只有 SnowLuma 一个后端）。

### 2.6 设置面板（插件自带）

`ui.html` 通过第一节的本体能力挂到 `channels` 分区，**通过官方
`panel-bridge.js` 与宿主通信**（不手搓 postMessage），功能对应 PR #95
的 `qq-instance-panel.ts`：

- 生命周期：安装（含 2.3 的下载确认）/ 创建实例 / 启动 / 停止 / 重启 /
  删除，含状态轮询；
- 访问控制：用户/群黑名单编辑（即时保存，不重启）；
- 连接信息：展示自动写入的 OneBot 反向 WS 地址、WebUI 入口；
- 折叠教程：首次登录、Hook、端口与故障排查（DOM 全在插件内）。

面板与插件主进程通过 `ctx.registerIpc("instance/status", ...)` 等自有
通道通信（自动命名空间为 `plugin:snowluma-qq:instance/status`），经
`CyrenePanel.invoke` → `PLUGINS_PANEL_INVOKE` → `dispatchPluginIpc`
受控链路。

### 2.7 与 NapCat 共存（首版策略）

不做宿主级互斥。插件在面板启动流程中检查
`ctx.deps.channels.has("qq")`：NapCat 已启用时在面板上显示警示
（同时挂两个 QQ 后端的风险），由用户自行决定，不阻断。

这是有意的取舍：互斥的正确形态是通用「渠道槽位」接口，而它目前只有
一个消费者，按准入原则不应进本体。等第二个「同平台多后端」场景出现
（例如微信出现第二种后端）再把 slot 做成通用能力。

### 2.8 插件目录结构（示意）

```
snowluma-qq/
  manifest.json        # deps: ["channels", "secrets"]，settingsPanel: "ui.html"
  index.cjs           # 入口：注册适配器 + IPC + 生命周期
  ui.html             # 设置面板（挂 channels 分区，引官方 bridge）
  lib/
    snowluma-runtime.cjs    # 下载/校验/解压/端口
    snowluma-guardian.cjs   # 进程守护与回收
    instance.cjs            # 实例清单/生命周期/操作锁
    onebot-reverse-ws.cjs
    onebot-normalizer.cjs
    onebot-action-client.cjs
    onebot-media.cjs
    onebot-types.cjs
    settings.cjs            # ctx.storage 配置读写
  README.md           # 使用与边界说明（含最低宿主版本要求）
```

---

## 三、PR #95 代码搬运地图

| PR #95 改动 | 去向 |
|---|---|
| `snowluma-runtime.ts` / `snowluma-guardian.ts` / `qq-instance.ts` | 插件 `lib/`，逻辑原样移植 |
| `napcat-adapter.ts` 的后端切换 / 黑名单 / accountId 改动 | 插件自有适配器（SnowLuma 单后端，比双后端分支更简单） |
| OneBot 五个协议模块 | 插件 `lib/` 移植 |
| `settings-store.ts` 的 `QqChannelConfig` 黑名单字段 | **丢弃**，改存插件 storage |
| `channel-context.ts` / `dispatcher.ts` 的会话键 accountId | **丢弃**，独立渠道 id 天然隔离；v1 单账号 + 换绑即重建实例 |
| `shared/qq-instance.ts` / `preload` 的实例 IPC 契约 | 插件自有 `registerIpc` 通道 |
| `settings/index.html` / `dom.ts` / `qq-instance-panel.ts` | 插件 `ui.html` |
| `docs/snowluma-managed-qq.md` | 插件 README |
| `scripts/verify/snowluma-smoke.cjs` | 插件开发工作流内保留 |
| 相关测试 | 大部分可移植到插件侧测试 |

PR #95 的 27 个文件改动中，**本体零保留**——这正是插件化的意义：
贡献者的实现工作没有浪费，只是落点从本体移到插件。

---

## 四、分阶段执行与验证

每阶段独立可验证、可提交，失败可回滚到上一阶段。

### 阶段一：manifest 契约与校验

- 改 `api.ts` + `manifest.schema.json` + `loader.ts`
  （`resolveSettingsPanel`，含非法值静默忽略测试）。
- 验证：`src/plugins` 相关 vitest 通过；手工构造带/不带新字段的
  manifest，确认新宿主两种都接受；确认 schema 拒绝未知字段的行为不变。

### 阶段二：面板文件服务协议

- 新增 `plugin-panel-protocol.ts`（两个导出函数拆分生命周期），
  `src/main/index.ts` 顶层注册 scheme + whenReady 后安装 handler。
- 验证：单测覆盖——未知插件 404、**禁用插件 404**、路径穿越 404、
  合法静态文件返回、保留路径命中 Bridge 资产、1.4 节完整测试矩阵
  （`%2f`/`%5c`/`..`/NUL/双重编码/前缀绕过/盘符路径/大小写/符号链接）、
  **面板 origin ≠ 设置页 origin 的同源不变量断言**；`npm run build` 通过。

### 阶段三：Panel Bridge + IPC 路由器 + preload + 设置页挂载 + 参考示例

- `panel-bridge.js`（invoke/onTheme/高度自动上报，targetOrigin 规则见 1.5）；
  `src/plugins/ipc-router.ts`（dispatchPluginIpc，既有 ipcMain 路径收敛）；
  preload `pluginPanel`（单一 `PLUGINS_PANEL_INVOKE`）；
  主进程处理器（sender 校验）；设置页容器 + `plugin-panels.ts`
  （挂载 / iframe 注册表 / source+origin 双校验 / 主题推送）。
- **给 `examples/system-status` 补上 `settingsPanel: "ui.html"`**——
  该示例目录里本来就躺着一个未被使用的 `ui.html`。这一步同时充当
  「通用性测试」：第二个消费者立即证明该接口不是 SnowLuma 专属。
- 验证：设置页能看到示例面板、能 invoke 其 IPC、高度自适应、
  换主题面板跟随；**安全用例**：伪造 pluginId 的消息被注册表拒绝、
  origin 不匹配（含 iframe 被导航到其他插件 origin 的模拟）被拒、
  非设置窗口 sender 调用 `PLUGINS_PANEL_INVOKE` 被主进程拒绝。

### 阶段四：ChannelId 开放性审计与链路门槛（实现 SnowLuma 前的硬门槛）

> `as unknown as ChannelAdapter` 只是堵住类型系统的嘴，不能证明链路上
> 不存在 `channel === "qq"` 之类的硬编码分支漏掉未知渠道。这一步不通过，
> 不得开始 SnowLuma 插件。

- 全局审计所有 `ChannelId` 消费点（dispatcher / agent-input /
  agent-policy / outbound-composer / delivery-service / 会话绑定 /
  chats 元数据 / 状态与限速路径），确认未知插件渠道 id 不会进入错误
  fallback 或漏掉能力；发现的硬编码分支逐个改为开放集合行为。
- 集成测试：注册 fake-channel 测试插件 → IncomingMessage →
  dispatcher → sessionId → 限速 / TTS / 表情包 / 桌面镜像 /
  `CHANNELS_GET_STATUS` 全链路，证明插件渠道在运行时确实是
  open-world，而不只是类型上假装开放。
- 本阶段允许对宿主做**行为修正**（消除硬编码），但不做 `ChannelId`
  类型重构（那是独立任务）。

### 阶段五：SnowLuma 插件骨架（协议先行）

- manifest + 适配器注册（`qq-snowluma`）+ OneBot 五模块移植。
- 此时支持「用户手动部署 SnowLuma」的连接方式（等同现在的 NapCat
  自管模式），可先在真实 QQ 上联调收发。
- 验证：渠道状态出现在 `CHANNELS_GET_STATUS`；NapCat 历史不受影响
  （会话键不同）；插件禁用/启用轮换无残留。

### 阶段六：受管运行时

- 移植 runtime / guardian / instance；接入 `ctx.storage`、
  `ctx.deps.secrets`、`ctx.onDispose`；实现下载确认对话框
  （版本/来源/SHA-256/安装位置）。
- 验证：移植 PR #95 的账号、路径、端口、生命周期测试；冒烟脚本
  （模拟服务，不加载真实 QQ）；应用退出后无孤儿进程。

### 阶段七：插件设置面板 + 收尾

- `ui.html` 完整面板（生命周期/黑名单/连接信息/折叠教程），全部经
  官方 Bridge 通信。
- 验证：面板浏览器检查（对齐、不重叠——按项目 UI 标准）；真实 QQ
  端到端人工验收；PR #95 的已知边界清单在插件 README 中逐条复核
  （Hook 卸载边界、许可证、Windows x64 范围、最低宿主版本）。

---

## 五、风险与开放问题

| 项 | 说明 | 处置 |
|---|---|---|
| allow-same-origin 同源不变量 | `allow-scripts + allow-same-origin` 的危险仅在 iframe 与 parent 同源时成立 | 设置页 `file://`/localhost 与 `cyrene-plugin://` 结构性不同源；协议模块注释不变量 + 阶段二断言（1.1） |
| 通用转发入口的暴露面 | `PLUGINS_PANEL_INVOKE` 是首个「任意插件任意通道」转发口 | 主进程强制 sender = 面板宿主窗口；pluginId 由注册表绑定（1.6/1.7） |
| 伪造 pluginId / 跨插件调用 / iframe 导航攻击 | 恶意消息尝试 `plugin:other-plugin:*`，或插件把自己 iframe 导航到别家 origin | 完整通道名由可信 pluginId 拼出；`event.source` + `event.origin` 双校验，导航后 origin 变化即被拦（1.1/1.7） |
| 面板插件对旧宿主不兼容 | schema fail-closed 拒绝加载（不是静默忽略） | README 标注最低宿主版本；未来由插件市场 `engines.cyrene` 承担门控（1.2） |
| Bridge 版本漂移 | 插件自带 bridge 会分叉，宿主统一分发 | 保留路径 `/.cyrene/panel-bridge.js` 由宿主资产提供（1.5） |
| 主题一致性 | 面板是跨源 iframe，无法继承宿主样式 | 唯一链路：Bridge `init` / `theme-changed` + CSS 变量（1.5），协议层不碰 HTML |
| CSP 兼容 | 设置页若配置了 CSP 需放行 `frame-src cyrene-plugin:` | 阶段三实测确认 |
| 协议服务面 | 静态文件服务若不限范围会暴露禁用插件目录 | 服务面收窄至 enabled + settingsPanel 合法（1.4），与面板挂载刷新联动（1.7） |
| 插件渠道链路硬编码 | `ChannelId` 消费点可能存在按已知渠道分支的 fallback | 阶段四审计 + fake channel 集成测试，硬门槛 |
| SnowLuma 许可证 | 插件不携带二进制，运行时从官方 Release 下载 | 交付前复核上游许可（沿用 PR #95 边界） |
| 第三方可执行文件下载 | 联网下载并运行 exe，属较强运行时能力 | 首装确认对话框披露版本/来源/SHA-256/位置（2.3），不做权限系统 |
| 提示词中的渠道名 | Agent 会看到 `qq-snowluma` 作为渠道标识 | 无功能影响；若介意观感，渠道 id 换 `qq2` 等更短名（开发期定） |
| 双 QQ 后端并存 | 首版仅警示不互斥 | 有意取舍，见 2.7；等第二个消费者再做通用槽位 |

---

## 附：决策记录

- 2026-09-12（v1）：插件化方向确认；本体仅开「设置面板注入」一个通用
  接口；槽位互斥暂缓（单一消费者不满足通用性判据）。
- 2026-09-12（v2，外部 review）：修正 manifest 兼容性错误；pluginId 由
  宿主按 `event.source` 绑定 + 主进程 sender 校验；引入官方 Panel
  Bridge；删除 `accountId:${chatId}` 编码；新增阶段四硬门槛；路径安全
  `path.relative` 判定与测试矩阵；SnowLuma 下载确认披露。
- 2026-09-12（v3，外部 review 收口，**设计冻结**）：
  - **P0**：sandbox 改 `allow-scripts allow-same-origin`——v2 的
    opaque origin 使 `event.origin` 恒为 `"null"`，origin 校验客观不
    成立；修正后 origin 校验真实生效、兼防 iframe 导航攻击、宿主下发
    可用精确 targetOrigin；同源不变量（设置页与插件协议结构性不同源）
    写入协议模块注释并加测试断言。
  - 删除「loader 提供升级指引」（时间悖论：旧宿主的 loader 是旧代码，
    新报错逻辑无法作用于真正需要它的场景）；诚实规定最低宿主版本，
    未来由插件市场 `engines.cyrene` 承担门控。
  - 删除 `supportFetchAPI: true`（最小权限；面板通信统一走 Bridge，
    无 fetch 需求）。
  - 协议服务面收窄：仅 enabled + settingsPanel 合法的插件，禁用即 404。
  - 插件 id hostname-safe 已验证（既有 `ID_RE`），无需额外机制。
  - scheme 特权注册与 handler 安装拆成两个函数，分别绑定 ready 前/后
    时机。
  - 新增 `dispatchPluginIpc` 路由器抽象：既有 ipcMain 路径与面板转发
    收敛到单一执行路径（校验/查找/失效/错误规范化只维护一套）。
