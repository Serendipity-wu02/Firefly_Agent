# Firefly 右侧代理工作区：两步交付设计

日期：2026-10-04。工作树基线：`50cc50be3d6e51c616c41ba5d2b6e86dd7b626aa`；共享审阅对照整合 `c1735ec4a90980332d1745f0c86034bdba55f374`。后者相较本基线仅音乐/日程头像五文件差异，不更改本设计边界；未将其它分支结果冒充本主线验证。

## 授权与当前状态

用户已对“两步交付”的建议回复“可以的”：首版是基础浏览器、当前工作区文件/Diff 预览、真实输出来源摘要、重命名/置顶；日程窗口独立。第二步再讨论登录教务、代理点击/输入及下载。

这确认了功能范围，不等于批准尚待 review 的网络代理、安全机制或共享文件接线。父另明确批准独立纯 renderer 状态机 TDD 与实现；该部分已完成加载/错误/关闭状态及测试，不接网络。浏览器服务和新安全机制仍未实现，共享接线未改，ignored 草稿未强制添加。

工作树复用 `E:\Codex\2026-10-04\task-4\audit-r3-r4`，分支 `feat/right-agent-workspace`。旧 R3/R4 完整成果保留在 `fix/audit-r3-r4`，提交 `5bd8b920fd6da88f32fbdad622bddf92d2a9ec28`。不另建工作树或修改原仓库。共享依赖位于 E 盘当前 Firefly 仓库：Electron 43.1.0、React 19.3.0、TypeScript 5.9.3、Vitest 4.1.11；复用、不复制、不启用 C 盘缓存。

## 首版交付与排除范围

| 首版交付 | 可验收行为 |
|---|---|
| 用户手动浏览公共网页 | 右侧可见网页、地址栏、前进/后退/刷新、加载/错误/受阻提示、关闭标签 |
| 现有文件与 Diff 预览 | 沿用文件树、文本/代码/Markdown、行号定位、Diff 与计划标签；预览限当前会话工作区 |
| 真实输出来源摘要 | Main 根据完整工具结果中的结构化证据提供来源及真实结果状态；长预览不丢来源 |
| 现有会话操作 | 重命名、置顶复用既有接口，不增加第二套会话存储 |

首版不提供代理浏览器工具或代理操作入口，包括自动导航、截图、点击、输入、下载；不登录、不保存登录态、不存凭据、不上传文件、不付款。不新增 Office/PDF/可执行 HTML 查看器、任意路径读取或外部单文件打开。没有 backend 契约的 fork、side-chat、archive、分享、新独立会话窗口不出现假按钮。任务会话绑定及日程独立小窗口不在本主线。

R1 目录边界模块及相关原生 backend、目录迁移、朋友圈、新记忆、真实 userData、CI 门禁变化继续排除。保留 Firefly Harness，不用 Codex CLI/app-server 替换桌面代理核心；不操作现有 PID 10072，不推送、PR、合并或部署。

## 现有实现与最小接线

`ChatPage.tsx` 持有 files/file/diff/plan 标签，`ChatPageInspector.tsx` 组装 `RightInspector`。保留既有分屏、窄布局和标签关闭回退；新浏览器与来源组件放在独立 `features/chat/workspace/`，ChatPage 仅传当前会话及接线回调。

推荐 Main 管理 `WebContentsView`，Renderer 负责工具栏、标签和内容矩形。单独窗口偏离同屏目标，iframe 有站点嵌入限制，webview 增加宿主边界复杂度。[Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)

原生视图只覆盖网页内容区域。拖宽、缩放、窄布局、标签切换更新矩形；审批、设置或其它可信弹窗打开时卸下/隐藏网页，避免远程内容遮挡可信 UI。远程网页不获得 Firefly preload、Node 或宿主 IPC。

## 文件打开与预览权限

复用既有手动 `window.workspaceFiles.list/read(sessionId, relPath)` 和 `src/main/chats/workspace-files-ipc.ts`，不修改目录边界算法、不扩大读取权。其已有会话工作区绑定、realpath 检查、stat 阶段 1MB 上限及二进制拒绝，不代表 sender 授权或实际打开的竞态已安全：handler 忽略 event，`createIpcScope` 只管理注册；realpath/stat/readFile 间也存在竞态。本主线不宣称这些问题已修复，不修改受限 R1 边界。

来源中的文件路径只展示 Main 记录，首版不新增来源链接自动打开、自动读取或新的文件 IPC。若将来自动打开要求更强授权/竞态保证，须先解决 R1 依赖并获原任务授权；当前不借来源入口绕过。已有用户手动文件树/行号定位原样保留，缺失、越界或过大显示真实错误。预览纯文本/代码/Markdown，不执行 HTML、脚本、宏，也不让远程页取得文件接口。

## 浏览器网络与登录策略

首版只浏览公共网页；建议执行限制为公共 HTTPS。禁止本地/内网/回环/链路本地及保留 IPv4/IPv6、file/data/javascript/自定义 scheme、URL userinfo。限制必须覆盖导航、重定向、框架与子资源，不能只验证地址栏。用户手动浏览不等于批准无限网络访问。

独立内存 session、不导入常用浏览器 profile、不保留登录态、不把凭据写入配置/日志/事件。权限、新窗口、下载、上传、客户端证书与写请求默认拒绝。远程内容不可信，不自动进入代理上下文。[Electron Session](https://www.electronjs.org/docs/latest/api/session)、[Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)

**待安全 review 的候选机制**：专用 session 经鉴权受限本地代理访问，代理解析全部目标地址、拒绝私网并固定已核验 IP 建立连接；HTTPS 不解密。Chromium 侧限制写请求，禁止 DIRECT 回退，验证或禁用 QUIC/WebRTC 等绕行。一次 DNS 预检不能证明实际连接安全。候选代理尚未获 review，不能先实现后要求追认；若 review 不接受或无法验证边界，浏览器部分暂不开放，不降级为裸 loadURL。

浏览器首版属于基础手动查看，公共页面中依赖登录或被限制的交互显示受阻；不宣称对所有站点兼容。已读取原仓库 `docs/superpowers/plans/2026-10-03-visible-browser-plan.md`：记录用户选方案 B、登录状态“保持”、首批 GitHub/ChatGPT。本设计不撤销该产品选择；按父确认的两步收缩，当前先公开匿名验证。持久登录仍受原计划的跨工具凭据保护、真实行动审批等安全前置条件约束，本主线不创建持久 profile 或真实凭据。父统一原三阶段与本次两步计划。

### 2026-10-04 会话授权域验证契约

用户明确选择“综合看看这个方向解决吧”：本轮授权更新设计、独立安全review及隔离原型，优先独立Session/BrowserContext、不可变policyEpoch和统一出口，不默认禁Worker。授权不等于生产网络gate放行；仍是匿名公共HTTPS GET/HEAD，不增加站点登录、POST、持久凭据、无限网络访问或代理工具。

policyEpoch是本轮候选Main私有对象，绑定已注册owner/profile/conversation/browser、全新非persist Session对象、冻结目标与方法政策、专用代理及abort状态；不是renderer可传入的数字或DTO。冻结政策内容及闭包，不只冻结包含可变Set/对象的外壳。网页、子框架、dedicated/shared/service worker继承同一域。Session回调的可信来源是Main注册的对象与闭包，不从请求的resourceType、可选WebContentsId/frame反推授权；缺字段既不直接授予权限，也不独立证明来自外域。协议/资源拒绝仍保留，字段不充当worker身份证。

独立安全review允许受限原型，要求新Session先安装默认deny的唯一handler及权限/鉴权绑定，准备未完成不导航；每次准备await后、setProxy结束后及首文档副作用前复验注册对象/owner/abort/epoch，失败持续deny。缓存继承的验收必须同时覆盖同源第二Session误配旧proxy拨号0、clearAuthCache+closeAllConnections后无归属挑战取消、旧域存量tunnel终止，不能只数policyAllows=true。review不批准生产放行。

这改变后续网络模块中的“缺WebContentsId/未知worker直接拒绝”分支，改为“未注册、已撤销或Session对象不匹配的域拒绝”；不改变公网IP固定、方法限制、匿名性和撤销要求。本机43.1.0下dedicated worker GET/xhr及importScripts/script关联祖先frame与页面ID，SharedWorker/SW缺ID/frame，与[Chromium150固定源码](https://raw.githubusercontent.com/chromium/chromium/150.0.7871.47/content/public/browser/content_browser_client.h)及[Electron43固定源码](https://raw.githubusercontent.com/electron/electron/v43.1.0/shell/browser/api/electron_api_web_request.cc)语义一致；先前“冒用宿主”措辞不代表已证认证/IP绕过。历史RED保留，用来证明字段不足以分类worker。

每个授权域唯一新Session、partition及代理capability；绝不把workspace/profile级Session共享给多个tab或复用旧域。政策不可原地扩大，任何owner/会话/目标或方法权限变化先同步撤销旧域、持续deny、关闭代理存量隧道和Session连接，再创建新域。跨站只有在目标政策/授权发生变化时构成跨域，不擅自新增“同站点白名单”；同源两个域也必须隔离。旧worker不得看到新政策、凭据或存储。清理失败不得报告成功或恢复旧域。

鉴权候选只向当前Main注册且原生`contents.session === epoch.session`的页面、精确代理端点/realm/scheme发专用凭据，复验owner/abort/epoch；目标站点鉴权及无可信Session来源的挑战均取消。原型调查Chromium是否在该Session内缓存已由页面认证的代理capability，供缺ID/frame的workers使用；缓存继承不是向未知挑战发放凭据。未预认证或清auth cache后的无归属挑战继续拒绝，若worker功能因此受阻如实记录，不用endpoint、pid、URL或猜测的owner补授权。缓存跨域、旧代可复用或无字段challenge无法安全归属时该路线未通过，不能绕过。

代理不解密TLS，仍不能证明方法限制、worker身份或全协议出口；Session统一`onBeforeRequest`负责每个可观察请求的HTTPS GET/HEAD与目标政策。N1–N10继续适用，SW安装/更新/importScripts及已有TLS隧道上的POST均须独立验收；QUIC/WebRTC/WebTransport旁路未证明前生产gate保持HOLD。Node TLS夹具的显式测试CA仅是局部验证目标证书，不安装系统CA、不改变Chromium验证，不冒充Chromium可信HTTPS正例。

参考[DeepSeek browser-guests](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/src/browser-guests.ts)的Main owner/opaque lease、先注册再附着及无beforeunload等待回收思路；该实现实际按workspace复用process-lifetime partition，release保留workspace存储，并非本方案的新域策略或网络安全证明。只作结构参考，无代码移植，来源MIT，Copyright (c) 2026 DeepSeek，保留[许可链接](https://github.com/deepseek-ai/deepseek-harness/blob/master/LICENSE)；如后续复制实质代码须完整保留许可声明。未更换Firefly runtime/renderer布局。

## 控制与退出清理

首版只有用户控制，不创建 agent lease，也不注册代理浏览器工具。独立状态模块按 conversationId/browserId 和导航 requestId 隔离：较旧、其它会话或已关闭页面的异步响应不能覆盖当前页面；失败保留上次已提交地址并显示真实错误。

纯状态模块已实现于 `src/renderer/react/features/chat/workspace/browser-page-state.ts`，17 个用例通过。它只是展示状态转换，没有实际浏览器/网络/权限动作；本地 blocked/load_failed 是展示结果，不替代待冻结的 Main 错误及授权契约。[本阶段验证记录](../testing/right-agent-workspace-state.md)

partition 由 Main 生成非空唯一标识，绑定 runtime profile/conversation/browser，不使用 defaultSession，也不复用旧标识。关闭 view 不等于销毁 Electron Session；关闭须停止请求/代理连接、释放 view，再 await `clearStorageData`/`clearCache`，记录清理失败，重开用新标识。正常退出接现有 ShutdownCoordinator，清理失败不得静默当作成功。切换会话先取消旧请求并隐藏旧视图，后台页面不得继续替用户操作。异常崩溃不承诺未实现的即时清除，内存会话避免持久登录状态。

第二步如引入代理操作，再独立设计用户优先、显式接管、站点/动作授权、run 取消、每次 await 后及副作用前的租约复验；首版不预埋通用 executeJavaScript/CDP 通道。

## 输出来源语义

Main 在 `harness/tool-round.ts::commitToolResult` 等完整结果边界投影来源，`HarnessEvent`、AGUI 映射和可选恢复字段透传。现有 `preview` 最多 200 字；不能从 preview、Markdown 或模型回答反推来源。

首版来源限明确结构化证据：changes 的变更文件，read_file 的 canonicalPath/hash/行范围，已有 `web_search` 完整 JSON 的 `success:true/results[].url`。搜索标“搜索结果”，不声明已阅读全文；导航只证明访问，不证明模型读取；截图第二步如获批则标“获批页面捕获”。shell 文本不生成“已创建文件”。无证据显示“未提供结构化来源”；失败、取消、unknown、not_executed 不显示成功。来源是外部/历史记录，不 mint 记忆 M 事实。

输出记录只显示引用标识，本轮不新开完整输出读取 IPC；参数、原始输出不默认进入摘要。公开 URL 丢弃 userinfo/query/fragment，path 如含秘密模式则降到 origin 展示；原 URL 如确有必要仅在受限 Main 状态短暂使用，不通过公开 record 恢复敏感参数。用户手动访问网页不是生成答案的来源，不伪造 toolCallId 将浏览记录混入输出证据。

来源必须进入现有 canonical tool-result 提交/恢复链。当前 `tool_end` 在 `commitToolResultMessage` 之前发出，不能当作持久提交证明。投影先产生候选记录，由父与原 S owner 扩展已有 appendToolResult metadata，等待其成功后再发独立的 committed 来源事件；失败不发布 committed 来源。恢复从 canonical metadata 提取，主线不建立第二份来源数据库。重试只提交最终结果，重复按 profile/conversation/run/toolCall/assistantEntry key 去重；旧 metadata 缺字段兼容、不从 preview 重建。

## 待冻结的可调用接口与错误契约

以下为审阅提案，由父冻结后新模块引用；不是已实现 API，也不让 Renderer DTO 变成 authority。

```ts
type BrowserErrorCode = "permission_denied" | "owner_mismatch" | "closed"
  | "cancelled" | "blocked_url" | "network_unavailable" | "load_failed" | "cleanup_failed";
type BrowserReply<T> = { ok: true; value: T } | { ok: false; code: BrowserErrorCode };
type ManualBrowserCommand =
  | { kind: "open"; url: string }
  | { kind: "navigate"; browserId: string; url: string }
  | { kind: "history"; browserId: string; action: "back" | "forward" | "reload" }
  | { kind: "layout"; browserId: string; bounds: { x:number; y:number; width:number; height:number } | null }
  | { kind: "close"; browserId: string };
// TrustedUserOwner 是父注册的 Main 私有对象，以对象身份/私有注册表验证，禁止从 payload 构造。
interface TrustedUserOwner {
  readonly host: Electron.BrowserWindow;
  readonly topFrame: Electron.WebFrameMain;
  readonly profile: import("../../src/main/runtime-profile").RuntimeProfile;
  readonly conversationId: string;
  readonly ownerSessionId: string;
  readonly generation: number;
  readonly signal: AbortSignal;
}
interface UserBrowserController {
  execute(owner: TrustedUserOwner, command: ManualBrowserCommand): Promise<BrowserReply<BrowserPageDto | null>>;
  revoke(owner: TrustedUserOwner): void;
}
interface BrowserPageDto {
  browserId: string; conversationId: string; requestId: number;
  closed: boolean; loading: boolean; url: string; pendingUrl: string | null;
  canGoBack: boolean; canGoForward: boolean; error: BrowserErrorCode | null;
}
interface BrowserNetworkPort {
  prepare(owner: TrustedUserOwner, browserId: string, partitionKey: string): Promise<BrowserReply<BrowserNetworkBinding>>;
}
interface BrowserNetworkBinding {
  readonly session: Electron.Session; // 已完成 review 接受的网络与权限限制
  validate(url: string, method: string, signal: AbortSignal): Promise<BrowserReply<string>>;
  dispose(signal: AbortSignal): Promise<BrowserReply<null>>;
}
interface BrowserService extends UserBrowserController {
  registerHost(host: Electron.BrowserWindow, resolveOwner: (event: Electron.IpcMainInvokeEvent) => TrustedUserOwner | null): () => void;
  isRegisteredBrowser(contents: Electron.WebContents): boolean;
  handleNavigation(contents: Electron.WebContents, url: string): Promise<BrowserReply<BrowserPageDto>>;
  closeHost(host: Electron.BrowserWindow, signal: AbortSignal): Promise<BrowserReply<null>>;
  dispose(signal: AbortSignal): Promise<BrowserReply<null>>;
}
```

手动 owner 从父的实际窗口/profile/会话注册冻结；open 后才由 Main 生成 browserId，关闭/会话切换/宿主销毁递增 generation。权限异步结束后、每次 await 后、loadURL/展示等副作用前重新验证对象仍注册、top frame、profile、owner 和 signal。失败只回错误码，不回秘密 URL 或原始异常。runId 不用虚构的“manual”替代。

第二步 owner-bound adapter 必须消费父实际 runtime 冻结的 profile/ownerSessionId/conversationId/runId/origin/signal/generation，并用 Main 私有不透明租约校验。当前 tool-runtime 没有 ownerSessionId，父须从真实父/子 agent 注册建立映射，不从活动标签或模型参数回填。取消仅传准确 runId；该 adapter 在首版不创建、不注册。

全局导航接线：父修改 `external-link.ts::installGlobalNavigationGuard` 为动态精确路由，只有 BrowserService 注册的 WebContents 交专门策略。原 listener 在创建时已安装，不能靠再设一个新窗口 handler 移除。所有 browser 导航/redirect/popup 拒绝都不得退到 openExternal；其它窗口保持原守卫，不引入 URL 前缀例外或通用绕过。先 preventDefault，再由受限控制器校验/启动导航。

来源模块的可调用提案如下。FrozenToolOwner 由父实际 runtime 注册冻结；投影纯函数不验证或授予权限，调用适配器必须只接受 Main 已注册对象。canonicalPath 保留在已有私有 fileRead metadata，公开 DTO 只展示受限路径/hash/行范围和证据 key，不能恢复文件读取权。

```ts
interface FrozenToolOwner {
  readonly profileKind: "production" | "development" | "test" | "smoke";
  readonly profileKey: string; // Main 私有注册标识，不是 renderer authority
  readonly conversationId: string;
  readonly ownerSessionId: string;
  readonly runId: string;
  readonly signal: AbortSignal;
  readonly generation: number;
}
interface WorkspaceSourceRecord {
  schemaVersion: 1;
  conversationId: string; runId: string; toolCallId: string; toolId: string;
  assistantEntryId: string; // 与 canonical appendToolResult 的实际 entry 绑定
  outcome: "success" | "failure" | "unknown" | "not_executed";
  category?: string;
  refs: Array<
    { kind: "file_read"; displayPath: string; sha256: string; startLine: number; endLine: number; totalLines: number }
    | { kind: "file_change"; displayPath: string; change: "added" | "modified" | "deleted" | "renamed" }
    | { kind: "web_search"; displayUrl: string; evidence: "search_result" }
  >;
  outputRecordId?: string; truncated: boolean;
}
interface WorkspaceSourceInput {
  owner: FrozenToolOwner; assistantEntryId: string; toolCallId: string; toolId: string;
  outcome: WorkspaceSourceRecord["outcome"]; category?: string;
  fullOutput: string | undefined; outputRecordId?: string; truncated: boolean;
}
// 新 projector 的签名，父冻结后实现；不含读取文件/网络或独立持久存储。
// projectWorkspaceSource(input: WorkspaceSourceInput): WorkspaceSourceRecord
// 父/S 的现有 appendToolResult input 增加 workspaceSource?: WorkspaceSourceRecord。
// await appendToolResult 成功后，父发布 committed workspaceSource；失败不得发布。
// 父恢复适配器：recoverWorkspaceSource(metadata: unknown): WorkspaceSourceRecord | null。
```

profile/ownerSessionId 用于 Main 私有去重和归属校验，不序列化到公开 record；conversation/run/assistantEntry/toolCall 与 canonical metadata 交叉校验。恢复仅接受 schemaVersion=1 和合法字段，历史缺失返回 null；URL 脱敏不反向恢复原地址。源 record 即使格式正确仍只是展示证据，不成为 agent authority、文件 capability 或记忆事实。

## 分工与共享文件

本主线独占新浏览器/来源/状态组件、Main 新浏览器模块和相应测试。主 UI 线程负责头像、导航、设置、任务、托盘及现有会话菜单。唯一集成者负责 review 结果、共享接线分工与最终集成；日程窗口由其它独立主线负责。

| 需协调的共享文件 | 最小改动目的 |
|---|---|
| `src/renderer/react/features/chat/pages/ChatPage.tsx` | 会话身份、独立工作区 hook、可信弹窗遮挡回调 |
| `src/renderer/react/features/chat/components/ChatPageInspector.tsx`、`RightInspector.tsx/.css` | 注入标签与内容矩形，不重做导航 |
| `src/shared/ipc-channels.ts`、`src/preload/index.ts`、`src/renderer/global.d.ts` | 白名单手动浏览器桥；不改宠物 `types/firefly.d.ts` |
| `src/main/application/default-dependencies.ts`、`src/main/windows/window-manager.ts`、`src/main/windows/external-link.ts`、`src/main/application/shutdown.ts` | 服务注册、宿主绑定、精确导航路由与释放 |
| `src/main/orchestrator/harness/types.ts`、`tool-round.ts`、`tool-dispatcher.ts`、`adapter/event-mapper.ts` | 完整结果来源投影，保留 R2/R3/R4 |
| `src/shared/chat-types.ts`、`src/main/agui-bridge.ts`、`pages/run/AgentRunController.ts`、`pages/chat-page-normalizers.ts`、`components/ChatMessageList.tsx` | 来源字段与 canonical AGUI/恢复接线，由父唯一写 |

共享表中的所有既有文件均由集成者唯一写；本主线只交最小接线提案，不写 UI 独占文件。`harness/adapter/tool-runtime.ts` 与真实 run owner 绑定由父负责；transcript types/store/coordinator/sink/settlement 仍由原 S owner，经父协调。新 i18n key/文案由本主线提供清单，父协调 UI owner 应用。新类型待父冻结，不能在主线另造身份来源或复制持久层。

## 验收与未完成门槛

验收必须包含：真实隔离 Electron 窗口的公共页、地址栏前后刷新、宽/窄/缩放/拖宽/弹窗遮挡、标签关闭及会话切换；实际网络私网/重绑定/旁路拒绝证据；当前工作区文件/Diff、重命名置顶、Stop/队列/审批回归；完整输出超过 200 字的来源和错误/取消/unknown 的真实状态；旧记录恢复兼容。保留 RED/GREEN，执行定向、全量、类型和 build，不改检查策略。

已读取并按源码核验父的 `E:\Codex\2026-10-03\task-10\h-native-20261004\right-workspace-shared-boundary-review.md`。两步范围和唯一共享写入者已明确；本修订补齐导航、owner/profile/未来 run 租约及 canonical 来源恢复提案。当前具体剩余阻塞只有：父接受/冻结本接口和来源 metadata 契约；网络实施机制及实际 Electron 43.1.0 可验证边界的安全结论。返回结论即可接续 TDD，无需重做总体设计或再次询问首版范围。原登录产品选择保留，首版不以新浏览器解锁 R1 文件读取。

参考的交互方向是聊天旁可见浏览器和文件预览，以及真实已有动作；不是导入另一产品的权限或功能。[Browser](https://learn.chatgpt.com/docs/browser)、[Work with files](https://learn.chatgpt.com/docs/artifacts-viewer)、[Commands](https://learn.chatgpt.com/docs/reference/commands)
