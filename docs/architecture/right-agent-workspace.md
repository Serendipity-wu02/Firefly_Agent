# Firefly 右侧代理工作区架构与变更边界

- **设计日期**：2026-10-04
- **状态**：首版范围与来源语义设计；浏览器部分已有后续实现，本文保留契约演进边界
- **源码核对日期**：2026-10-07，仅核对相关浏览器入口，不构成新测试结果
- **结论**：工作区复用现有 Inspector；Main 持有浏览器权限和真实输出证据，renderer 负责受限交互与展示。

## 1. 背景与分阶段范围

原设计按两步提供聊天旁工作区。首版限定用户手动公共网页、当前工作区文件/Diff 预览、真实输出来源摘要和既有重命名/置顶；登录教务、代理点击/输入和下载另行设计。日程独立窗口、任务会话绑定和无 backend 契约的会话操作不属于该首版。

该范围是历史设计约束，不应被用来否认后续已实现的浏览器能力。当前源码已存在 BrowserService、原生 WebContentsView、共享 IPC/preload、宿主与导航路由，并包含 manual/agent permission grant 路径。具体实现见[服务接线](browser-service-integration.md)；本文中的历史候选签名不取代 `src/shared/manual-browser.ts` 和 `src/main/browser/browser-service.ts`。

| 首版能力 | 设计验收目标 |
| --- | --- |
| 手动公共网页 | 可见网页、地址栏、前进/后退/刷新、加载/错误/受阻状态及关闭 |
| 文件与 Diff | 沿用文件树、文本/代码/Markdown、行号、Diff 和计划标签，限当前会话工作区 |
| 输出来源摘要 | 从完整工具结果提取结构化证据，保留真实 outcome，长预览不丢来源 |
| 会话操作 | 重命名、置顶复用已有接口，不建立第二套会话存储 |

首版不设计持久登录、凭据存储、文件上传、付款或通用执行通道；不新增 Office/PDF/可执行 HTML 查看器、任意路径读取和外部单文件打开。没有 backend 契约的 fork、side-chat、archive、分享或独立会话窗口不得显示假操作入口。

保留 Firefly Harness 与既有目录边界，不以另一套 CLI/app-server 替换桌面代理核心。朋友圈、新记忆、目录迁移、真实 userData 与 CI 标准变化不属于此架构变更。

## 2. 现有组件与职责

`ChatPage.tsx` 持有 files/file/diff/plan 标签，`ChatPageInspector.tsx` 组装 `RightInspector`。工作区组件位于 `features/chat/workspace/`，保留分屏、窄布局与关闭标签回退，ChatPage 只传会话和必要回调。

浏览器采用 Main 管理的 WebContentsView，renderer 负责工具栏、标签和内容矩形。原生视图只覆盖网页区域；拖宽、缩放、布局和标签变化更新矩形，审批/设置等可信弹窗打开时卸下网页，防止远程内容遮挡可信 UI。远程页面没有 Firefly preload、Node 或宿主 IPC。[Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)

独立 `browser-page-state.ts` 已在原设计阶段完成 17 个状态用例，按 conversationId/browserId/requestId 隔离异步响应。较旧、外来会话或关闭页的结果不能覆盖当前页面；失败保留已提交地址。状态机只控制展示，不构成网络授权。[状态验证](../testing/right-agent-workspace-state.md)

## 3. 文件打开与来源权限

文件预览复用 `window.workspaceFiles.list/read(sessionId, relPath)` 和 `src/main/chats/workspace-files-ipc.ts`。原设计时已存在工作区绑定、realpath 检查、stat 阶段 1MB 限制与二进制拒绝，但当时 handler 未使用 event，`createIpcScope` 只管理注册，realpath/stat/readFile 之间仍有竞态。此文不宣称这些问题已修复；后续是否解决须依据相应目录边界实现与验收。

来源中的路径只展示 Main 记录，不增加自动打开、自动读取或新文件 IPC。未来自动打开如依赖更强 sender/竞态保证，须先满足目录边界条件。现有用户手动文件树与行号定位保留真实缺失、越界、过大错误。文本/代码/Markdown 预览不执行 HTML、脚本或宏，远程页不得取得文件接口。

## 4. 浏览器网络与匿名性边界

初始浏览阶段限定公共 HTTPS，拒绝本地、内网、回环、链路本地和保留 IPv4/IPv6，以及 file/data/javascript/自定义 scheme、URL userinfo。限制覆盖导航、重定向、框架和子资源，不能只验证地址栏。

使用独立内存 Session，不导入常用浏览器 profile，不保留登录态，不把凭据写入配置、日志或事件。权限、新窗口、下载、上传、客户端证书与写请求默认拒绝，远程网页不自动成为 Agent 上下文。[Electron Session](https://www.electronjs.org/docs/latest/api/session)、[Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)

网络采用专用 Session、鉴权 CONNECT 代理和 Chromium 请求策略的分层责任：完整 DNS 答案校验、已审数值 IP 连接、原 hostname 正常端到端 TLS、GET/HEAD 限制与撤销。代理不解密 TLS；一次 DNS 预检、裸 loadURL 或关闭 DIRECT 的配置值都不能替代实际出口证明。

历史产品方向曾包含可见浏览器、保留登录及 GitHub/ChatGPT 目标；首阶段匿名验证没有撤销该长期方向，也没有完成持久登录的凭据保护与真实行动审批前置条件。持久 profile 或真实凭据不由本设计自动引入。

### 2026-10-04 会话授权域验证契约

后续网络研究选择独立 Session/BrowserContext、不可变 policyEpoch 和统一出口，默认不禁用 worker。研究与原型许可不等同于生产网络放行，原阶段仍限定匿名公共 HTTPS GET/HEAD。

policyEpoch 是 Main 私有对象，绑定已注册 owner/profile/conversation/browser、全新非 persist Session、冻结目标/方法政策、专用代理与 abort 状态。冻结内容与闭包，不能只冻结包含可变 Set/对象的外壳。页面、子框架、dedicated/shared/service worker 继承同域限制。

Session 回调的权限来自 Main 注册的对象与闭包，不从 resourceType、可选 WebContentsId/frame 反推身份。缺字段既不授予权限，也不独立证明来自外域；协议与资源限制仍保留。原生 Electron 43.1.0 的 dedicated worker GET/xhr 与 importScripts/script 关联祖先 frame/页面 ID，SharedWorker/SW 缺少这些字段，历史 RED 只证明字段不能可靠分类 worker，不证明认证或 IP 绕过。[Chromium 150 固定源码](https://raw.githubusercontent.com/chromium/chromium/150.0.7871.47/content/public/browser/content_browser_client.h)、[Electron 43 固定源码](https://raw.githubusercontent.com/electron/electron/v43.1.0/shell/browser/api/electron_api_web_request.cc)

新 Session 在未导航前安装默认 deny 的唯一 handler、权限和鉴权绑定。每次准备 await 后、setProxy 完成后及首文档副作用前复验对象、owner、abort 与 epoch，失败持续 deny。

每个授权域使用唯一新 Session、partition 与 proxy capability，不共享 workspace/profile 级 Session 给多个 tab，不复用旧域。政策不能原地扩大；owner、会话、目标或方法权限变化先同步撤销旧域、关闭存量 tunnel 和连接，再创建新域。同源两个域也必须隔离；跨站只有在目标政策或授权变化时才构成换域，不能据此私自增加同站白名单。清理失败不报告成功，不恢复旧域。

代理凭据只发给当前 Main 注册且 `contents.session === epoch.session` 的精确页面，并匹配 endpoint/realm/scheme、owner/abort/epoch。目标站点鉴权和无可信 Session 来源的 challenge 取消。worker 可以继承已由页面认证的 Session proxy cache；该继承不等于向未知 challenge 发放凭据。未预认证或清 auth cache 后的无归属 challenge 仍拒绝，不用 endpoint、PID、URL 或猜测 owner 补授权。

缓存继承验收须包含同源第二 Session 误配旧 proxy 拨号为 0、`clearAuthCache` + `closeAllConnections` 后未知 challenge 取消、旧域存量 tunnel 终止。若跨域缓存可复用或 challenge 无法安全归属，则该路径未通过，不能为可用性放宽边界。

N1–N10 继续适用。SW 安装/更新/importScripts、已建 TLS tunnel 内 POST、QUIC/WebRTC/WebTransport 都须独立证明；Node fixture 的显式测试 CA 只验证局部目标，不安装系统 CA 或改变 Chromium 验证。后续有限证据见[网络门槛](../security/browser-public-page-gate.md)。

结构参考为 [DeepSeek browser-guests](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/src/browser-guests.ts) 的 Main owner/opaque lease、先注册后附着和不等待 beforeunload 的回收。参考实现按 workspace 复用 process-lifetime partition，release 保留存储，不是此方案的新域隔离证明。未移植代码；来源 MIT、Copyright (c) 2026 DeepSeek，[许可](https://github.com/deepseek-ai/deepseek-harness/blob/master/LICENSE)在实质复制时须完整保留。

## 5. 控制与退出生命周期

首版手动控制不创建 Agent lease。Main 生成非空唯一 partition，绑定 profile/conversation/browser，不使用 defaultSession 或旧标识。关闭 view 不等于销毁 Session，须同步撤销并停止新请求/代理，释放 view 后 await connections/storage/cache/auth/resolver 清理，保留 `cleanup_failed`。正常退出消费 ShutdownCoordinator；异常崩溃不承诺即时清零。

切换会话先取消旧请求并隐藏旧 view。第二步 Agent 适配须单独定义用户优先、显式接管、站点/动作范围、run 取消及每次 await/副作用前复验；不得由首版设计自动推导通用 executeJavaScript/CDP 能力。当前额外授权模式以实际实现和对应验收为准。

## 6. 输出来源与 canonical 提交

设计要求 Main 在 `harness/tool-round.ts::commitToolResult` 等完整结果边界投影来源，由 HarnessEvent、AGUI 和可选恢复字段传递。preview 最多 200 字，不能从 preview、Markdown 或模型答案反推证据。

首版候选来源限结构化证据：changes 的变更文件、read_file 的 canonicalPath/hash/行范围，以及 web_search 完整 JSON 的 `success:true/results[].url`。搜索仅标为“搜索结果”，导航不证明模型阅读，shell 文本不能生成“已创建文件”。无证据显示“未提供结构化来源”；failure、cancelled、unknown、not_executed 不显示成功。来源不能自动成为记忆事实。

公开记录仅包含受限引用标识，不默认暴露参数和原始输出，不新增完整输出读取 IPC。URL 丢弃 userinfo/query/fragment，path 含秘密模式时降到 origin；必要原始 URL 仅在受限 Main 状态短暂使用，不从公开记录恢复。手动浏览不伪造 toolCallId 混入工具来源。

来源进入既有 canonical tool-result 提交/恢复链。原设计时 `tool_end` 早于 `commitToolResultMessage`，因此事件发出不等于持久提交。候选来源须加入 appendToolResult metadata，成功后才发布 committed 来源，失败不发布；恢复只消费 canonical metadata，不建立第二份来源库。重试仅提交最终结果，按 profile/conversation/run/toolCall/assistantEntry 去重；旧 metadata 缺字段兼容，不从 preview 重建。

<a id="待冻结的可调用接口与错误契约"></a>

## 7. 历史候选接口与错误契约

以下 TypeScript 是 2026-10-04 的接口设计快照，保留用于解释早期文档；它们不是当前可直接调用的完整 API。真实 BrowserService/network controller 已采用后续接口，Main 私有 owner、真实 Session、错误码及源记录不授予 renderer authority 的原则继续有效。

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
// TrustedUserOwner 是 Main 注册的私有对象，以对象身份/私有注册表验证，禁止从 payload 构造。
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
  readonly session: Electron.Session; // 历史提案要求先完成网络与权限准备
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

手动 owner 来自实际窗口/profile/会话注册，browserId 由 Main 生成。关闭、会话切换和宿主销毁使旧 generation 失效；失败只返回固定错误码，不返回秘密 URL 或原始异常。不得虚构 manual runId。

未来 run-bound adapter 应消费真实 runtime 的 profile/ownerSessionId/conversationId/runId/origin/signal/generation，并用 Main 私有租约验证，不能从活动标签或模型参数补 ownerSessionId。取消绑定准确 runId。

原生全局导航只路由精确登记 guest，拒绝不能转系统浏览器。早期“先 preventDefault 再启动 GET”的提案已经修正：当前路由保留原请求方法，交 Session GET/HEAD gate 判定，避免 POST 被改写为 GET，详见[服务接线](browser-service-integration.md)。

来源接口同属历史候选；projector 是纯函数，不进行文件/网络读取或独立持久化，也不验证或授予权限：

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
// 新 projector 的签名，契约冻结后实现；不含读取文件/网络或独立持久存储。
// projectWorkspaceSource(input: WorkspaceSourceInput): WorkspaceSourceRecord
// canonical transcript 的现有 appendToolResult input 增加 workspaceSource?: WorkspaceSourceRecord。
// await appendToolResult 成功后，提交适配器发布 committed workspaceSource；失败不得发布。
// 恢复适配器：recoverWorkspaceSource(metadata: unknown): WorkspaceSourceRecord | null。
```

profile/ownerSessionId 仅用于 Main 私有归属与去重，不序列化到公开 record。conversation/run/assistantEntry/toolCall 与 canonical metadata 交叉校验，恢复仅接受 schemaVersion=1 和合法字段，历史缺失返回 null。canonicalPath 只留现有私有 fileRead metadata；公开 DTO 的路径/hash/行号不构成文件 capability。

## 8. 变更落点与后续顺序

| 接口层 | 变更职责 |
| --- | --- |
| ChatPage、ChatPageInspector、RightInspector | 会话身份、标签、独立 hook、布局和可信弹窗遮挡 |
| shared IPC、preload、renderer global types | 白名单命令与受限 DTO，不传 gate/owner/profile/partition/token |
| Main application/window/external-link/shutdown | 服务注册、宿主绑定、精确导航路由与资源释放 |
| Harness tool-round/tool-dispatcher/event-mapper | 完整结果来源投影，保持既有结果语义 |
| chat-types、AGUI、AgentRunController、normalizers、ChatMessageList | committed 来源、canonical 恢复及展示 |

后续变更先核对当前实现，避免重复建立权限来源或持久层。优先闭合来源 metadata/恢复契约与剩余网络验收，再扩展第二步能力。共享接线与对应模块应同步更新类型、行为测试和消费者，不能只添加展示按钮。

## 9. 验收标准

验收应覆盖真实隔离 Electron 公共页面、地址栏及历史、宽/窄/缩放/拖宽、弹窗遮挡、关闭与切换；实际私网/重绑定/旁路拒绝；文件/Diff、rename/pin、Stop/队列/审批回归；超过 200 字输出的来源、错误/取消/unknown 状态及旧记录恢复。

每项结果须说明时间和范围，区分普通测试、合成 native fixture、可信公网传输与操作系统前台验收。历史组件 GREEN、后续服务接线或局部 TLS 成功不能自动闭合全部网络门槛；本文没有新增测试或改变运行时行为。

交互参考仅用于聊天旁浏览器、文件预览和已实现动作的组织：[Browser](https://learn.chatgpt.com/docs/browser)、[Work with files](https://learn.chatgpt.com/docs/artifacts-viewer)、[Commands](https://learn.chatgpt.com/docs/reference/commands)，不导入其他产品的权限模型。
