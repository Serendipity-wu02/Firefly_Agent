# Firefly V1.1.1 — Browser 公共发行网络兼容设计 V1

## 1. 文档状态与范围

- 文档类型：架构设计提案，不是生产实现记录。
- 当前版本：`1.1.1`。
- 本轮只读核对并形成设计；没有改变 Firefly 的网络行为。
- 没有安装依赖、读取 Clash 配置或控制接口、修改系统网络、执行网页读取、注册
  Browser 工具、提交、推送或发布。
- 默认网络模式仍是现有直连模式。

目标能力是：用户明确指定一个公开 HTTP(S) 地址，Firefly 读取静态文档的标题和有界正文。
后续增加代理模式时，直连和代理必须是两个明确的传输选择，共用一个 Reader、结果契约、
解析 Worker、预算、取消和资源释放边界。

本轮设计不引入第二个 Agent、Harness、ContextManager、Memory、事件总线或权限所有者。

## 2. 当前源码事实

### 2.1 Browser 后端当前仍未生产注册

Browser 实现当前位于：

- `src/main/browser/browser-policy.ts`
- `src/main/browser/browser-reader.ts`
- `src/main/browser/browser-transport.ts`
- `src/main/browser/browser-content.ts`
- `src/main/browser/browser-content-worker.ts`
- `src/main/browser/node-browser-backend.ts`
- `src/shared/browser-types.ts`

`src/main/browser/node-browser-backend.ts:7-9` 将组合明确标记为验证用途，
`createNodeBrowserReadBackend()` 只被验证入口使用。当前
`src/main/application/default-dependencies.ts:1-50` 没有 Browser 导入，
`src/main/application/default-dependencies.ts:492-704` 的默认组合也没有创建 Browser 后端、
工具、Capability、Sandbox Profile、Approval 路由或 Harness Schema。

因此当前状态是：

| 项目 | 当前事实 |
| --- | --- |
| Browser 源码 | 已存在，验证阶段实现 |
| Node/Electron 运行依赖 | 项目已有 Electron；Browser 直连使用 Node 主进程模块 |
| Browser 生产 Tool | NONE |
| Browser Capability | NONE |
| Browser Sandbox Profile | NONE |
| Browser Approval 路由 | NONE |
| Browser IPC / Renderer 入口 | NONE |
| 自动代理发现 | 未实现 |
| Clash/Mihomo 自动读取 | 未实现 |

### 2.2 现有公共 Reader 契约

`src/shared/browser-types.ts:9-17` 已定义固定读取限制：

- 总期限 `15_000` ms；
- 最多 `3` 次重定向；
- 累计响应体 `2 MiB`；
- 响应头 `16 KiB`；
- 标题 `200` 个 Unicode 码点；
- 正文 `4,000` 个 Unicode 码点；
- 并发读取 `1`。

`src/shared/browser-types.ts:84-86` 当前 `BrowserReadRequest` 只有：

```ts
export interface BrowserReadRequest {
  readonly requestUrl: string;
}
```

`src/shared/browser-types.ts:96-120` 当前共享类型包括：

- `BrowserResolvedTarget`：规范化 URL 加 `addresses`；
- `BrowserConnectionEvidence`：`selectedAddress`、`connectedAddress`、
  `matchesTarget`；
- `BrowserReadResult`：状态、原因、请求/最终 URL、标题、正文、截断标记、
  HTTP 状态、内容类型和可选连接证据；
- `BrowserDnsResolver.lookup(hostname, signal?)`。

`BrowserConnectionEvidence` 的字段语义是直连目标地址证据。它不能在代理模式下复用为
“网页服务器实际 IP”，因为代理 socket 的对端只是代理端点。

### 2.3 现有直连调用图

当前验证后端的调用关系为：

```text
createNodeBrowserReadBackend()
  -> BrowserReadBackend.read()
  -> normalizeBrowserUrl()
  -> resolveBrowserTarget()
       -> dns.lookup(hostname, { all: true, verbatim: true })
       -> 全部地址执行公开目标策略
  -> BrowserSingleHopTransport.request()
       -> NodeBrowserTransport
       -> Node http/https.request()
       -> 注入已选定地址的 lookup 回调
       -> socket remoteAddress 与选定地址比较
  -> BrowserContentExtractor
       -> browser-content-worker.js
       -> parse5 AST
       -> 标题/正文提取
  -> BrowserReadResult
```

`src/main/browser/browser-reader.ts:189-239` 是单一读取生命周期所有者，负责并发限制、
取消传播和 `dispose()`；`src/main/browser/browser-reader.ts:241-433` 负责总期限、重定向、
累计响应大小、内容边界、解析和终态结果。

`src/main/browser/browser-transport.ts:17-72` 的单跳接口当前为：

```ts
export interface BrowserSingleHopRequest {
  readonly target: BrowserResolvedTarget;
  readonly signal: AbortSignal;
  readonly remainingMs: number;
  readonly remainingResponseBytes: number;
  readonly maxResponseHeaderBytes: number;
}

export interface BrowserSingleHopTransport {
  request(input: BrowserSingleHopRequest): Promise<BrowserSingleHopResponse>;
  cancel(): void;
  dispose(): Promise<void>;
}
```

`src/main/browser/browser-transport.ts:173-200` 当前直连 Transport：

- 取 `target.addresses[0]`；
- 通过自定义 `lookup` 只返回该地址，避免连接阶段再次解析；
- 使用 `agent: false` 和 `Connection: close`；
- 请求方法固定为 `GET`；
- `Host` 保留原始域名；
- HTTPS 使用原域名 SNI，`rejectUnauthorized: true`；
- 不使用环境代理或共享连接池。

`src/main/browser/browser-transport.ts:230-249` 将 socket `remoteAddress` 规范化后与
选定地址比较，不一致返回 `connection_target_mismatch`。

### 2.4 当前地址策略是直连策略

`src/main/browser/browser-policy.ts:237-292` 使用 WHATWG `URL`，拒绝嵌入凭据、非
HTTP(S) 协议和非默认端口。

`src/main/browser/browser-policy.ts:315-343` 对域名解析的全部返回地址执行检查；只要一个地址
不满足当前公开目标策略，整体返回 `non_public_target`。

`src/main/browser/browser-policy.ts:109-155` 包含 IPv4、IPv6、IPv4-mapped IPv6 及
特殊用途 CIDR。`198.18.0.0/15` 在当前拒绝表中，因此本机 Fake-IP 结果不能进入直连。

这套策略保留为 `direct` 模式的硬边界。代理端点的显式本地例外不能改变网页目标的直连
策略，也不能把 Fake-IP 网段加入普通网页允许范围。

## 3. 现有授权、Sandbox 与 Settings 契约

### 3.1 Settings 唯一所有者

`src/shared/settings-types.ts:11-26` 的 `FireflySettingsSnapshot` 当前只有：

- `permissionProfile`；
- `llm`；
- `tts`；
- `ui`；
- `window`；
- `startup`。

其中没有 Browser 或代理字段。

`src/main/settings/settings-manager.ts:17-32` 构造并加载设置，默认使用
`app.getPath("userData")/settings.json`；`src/main/settings/settings-manager.ts:34-85`
负责读取、合并和写回；`src/main/application/default-dependencies.ts:249-272` 通过
现有 Settings IPC 调用同一个 `SettingsManager`。当前 SettingsManager 没有 Browser 代理
验证器，也没有独立的机密凭据存储抽象。

现有 `LlmProviderConfig.apiKey` 位于 `src/shared/provider-types.ts:3-10`，示例配置也以
字符串字段表示 API Key。该现有做法不能作为新增代理密码的依据；本设计不把代理密码放进
`FireflySettingsSnapshot` 或普通日志。

### 3.2 当前 Capability / Approval / 执行链

当前公共授权契约位于：

- `src/shared/capability-types.ts:60-69`：Capability 描述含 `risk` 和 `sideEffect`；
- `src/shared/capability-types.ts:90-105`：Capability 请求含请求身份、请求者和 JSON 输入；
- `src/shared/runtime-integration-types.ts:47-72`：Sandbox 输入、Approval 输入和运行时上下文；
- `src/shared/runtime-integration-types.ts:106-123`：授权调用及其范围、来源和关联；
- `src/main/runtime/authorization/capability-authorization-pipeline.ts:34-50`：
  Capability、绑定、Sandbox、Approval 依赖和有限的进程内授权复用规则；
- `src/main/runtime/authorization/authorized-invocation-bridge.ts:30-76`：授权调用验证后
  进入现有 ToolExecutionEngine。

`src/main/runtime/authorization/permission-profile-policy-resolver.ts:43-71` 当前只按
四档权限、Capability 是否已知、声明的 Approval 要求和现有 `ToolSideEffect` 做决策。
它没有 Browser 目标、代理端点、DNS 证明或代理信任字段。

### 3.3 当前 Sandbox 不能表达网页目标与代理端点的分离

`src/shared/sandbox-types.ts:32-37` 当前网络范围只有：

```ts
export interface NetworkScope {
  readonly kind: "network";
  readonly host: string;
  readonly port?: number;
}
```

`src/shared/sandbox-types.ts:140-145` 的 `NetworkSandboxRule` 使用精确 host 匹配和可选端口。
`src/main/runtime/sandbox/sandbox-policy.ts:203-237` 只验证对应类型的规则是否存在并匹配。

这能表达“允许访问某个 host/port”，但不能表达下列必要差异：

1. 网页目标是用户请求的 Origin；
2. 代理端点是用户显式信任的基础设施；
3. 代理端点允许本地地址只代表连接代理，不代表允许网页目标访问本地地址；
4. HTTP 转发和 HTTPS CONNECT 是不同的传输方式；
5. 代理模式无法观察代理最终解析出的网页目标 IP。

因此，未来不能把代理端点简单塞进现有 `NetworkScope.host`，也不能把“连接代理成功”
作为“网页目标已通过公开 IP 检查”。

## 4. 两种网络模式的职责设计

### 4.1 共用职责

以下职责继续由现有 `BrowserReadBackend` 持有：

- 请求 URL 规范化的入口编排；
- 每一跳的 Origin、协议、凭据和默认端口检查；
- 重定向次数与总期限；
- 累计响应体和响应头预算；
- 取消、迟到结果隔离和最终终态；
- 内容类型、UTF-8、空正文和截断结果；
- `BrowserContentExtractor` 及编译后的解析 Worker；
- `dispose()` 和并发读取限制。

Transport 只负责一跳的网络事务，不拥有重定向策略、权限决策、Memory/RAG、模型上下文
或 Renderer。

Reader 通过同一个 `BrowserSingleHopTransport` 接口调用直连或代理实例；代理模式不得
复制 Reader。

### 4.2 `direct` 模式

现有 `NodeBrowserTransport` 保持为直连实现，职责不变：

1. Reader 通过当前 `BrowserDnsResolver` 获取全部目标地址；
2. 地址策略整体检查；
3. Transport 只使用已验证集合中的选定地址；
4. 自定义 lookup 防止连接阶段二次解析；
5. socket 对端地址必须与已选定目标地址一致；
6. HTTPS 继续使用目标域名 SNI 和证书验证；
7. 连接证据可以继续表示网页目标地址匹配。

直连默认模式不读取系统代理、PAC、Clash 配置或环境代理变量。直连失败不自动切换
代理。

### 4.3 `http_proxy` 模式

代理模式只接受用户显式配置的 HTTP 代理端点，首批不支持 SOCKS、PAC、系统代理自动发现、
代理自动选择或自动读取代理客户端配置。

建议的单一实现名称（均为设计提案，当前不存在）：

- `HttpProxyBrowserTransport`：现有 `BrowserSingleHopTransport` 的代理实现；
- `BrowserProxyEndpointPolicy`：只校验显式代理端点，不校验网页目标；
- `BrowserProxyEndpoint`：规范化且不含凭据的代理端点值。

代理 Transport 的一跳行为：

#### HTTP 目标的转发

- 只向已配置代理端点建立 socket；
- 请求行使用 HTTP absolute-form，目标 URL 保持规范化后的完整地址；
- `Host` 使用网页目标的 host，端口只使用目标 URL 的默认端口语义；
- Firefly 不把代理 socket 地址写入网页目标连接证据；
- 代理可看到 HTTP 目标和响应内容，因此 HTTP 目标经过代理属于额外信任边界。

#### HTTPS 目标的 CONNECT

- 只向已配置代理端点建立 socket；
- 发送 `CONNECT target-host:443`；
- 只有代理返回允许建立隧道的成功响应后才继续；
- 隧道内由 Firefly 建立 TLS；
- TLS 的 `servername` 使用网页目标域名；
- `rejectUnauthorized` 保持 `true`，不关闭证书验证；
- 证书不匹配仍失败；
- 代理不能被记录为网页服务器实际 IP。

代理阶段、CONNECT 阶段、目标 TLS 阶段、响应读取和解析共用 Reader 的剩余预算。取消或
超时必须销毁代理请求、CONNECT socket、TLS socket和响应监听；不使用连接池，不自动重试。
代理失败不回退直连。

## 5. 地址、解析与信任边界

### 5.1 三种不同对象必须分开

未来契约必须区分：

| 对象 | 含义 | 当前/未来责任 |
| --- | --- | --- |
| 网页目标 | 用户要求读取的规范化 HTTP(S) URL | Reader 逐跳检查；不得含凭据；只用默认端口 |
| 代理端点 | 用户显式配置并信任的 HTTP 代理基础设施 | 代理配置策略和 Transport 连接 |
| 代理实际连接的目标 | 代理解析并连接的网页服务器 | 标准 HTTP 代理下客户端不可独立观察 |

连接到代理端点只证明 Firefly 到达了代理，不能证明代理到达了网页目标的公开 IP。

### 5.2 代理端点策略提案

新增的 `BrowserProxyEndpointPolicy` 不是现有 `browser-policy.ts` 的网页目标策略副本，
而是独立的纯校验函数，建议只接受：

```ts
// 设计提案，不是当前生产类型
interface BrowserProxyEndpoint {
  readonly protocol: "http:";
  readonly hostname: string;
  readonly port: number;
  readonly credentialRef?: string;
}
```

规则：

- 代理端点必须由用户设置提供；
- 端点 URL 不得含用户名或密码；
- 首批端点协议限定为 `http:`；
- 端口必须是显式有效端口；
- 本地回环、私有地址可以作为显式代理端点，因为这项例外只针对用户指定的代理基础设施；
- 该例外不能改变网页目标策略，不能允许网页目标访问 localhost、私有、链路本地、Fake-IP
  或其他特殊用途地址；
- 不读取系统代理、PAC、Clash 私有配置、订阅或控制接口；
- 不从环境变量选取代理；
- 端点变化后重新规范化并重新绑定，不沿用旧授权或旧连接证据。

代理端点是本地地址时，连接对象的证据只能命名为 `proxyEndpoint`，不能命名为
`connectedTarget`、`targetAddress` 或其他网页服务器含义的字段。

### 5.3 网页目标私有地址风险

代理模式不应在客户端对域名执行本地 DNS 查询来决定是否允许网页目标，因为本机 Fake-IP
会产生错误结论；也不能先查询一次 DNS 再让代理重新解析。

标准 HTTP 代理下，代理解析网页域名并建立连接时，Firefly 没有可信的最终目标 IP 证明。
因此必须选择并记录以下产品边界：

1. **兼容模式边界（本设计推荐的实现前提）**：允许用户显式选择代理，保留 URL 语法、
   凭据、协议、端口和明显本地目标的客户端限制；结果明确记录
   `destinationVerification: "not_observed"`，并在授权/结果说明中写明“最终网页目标由
   用户信任的代理解析，Firefly 未独立验证目标 IP”。这不能宣称等同直连的公开 IP 保证。
2. **强保证边界**：如果产品要求代理模式也必须证明网页目标不是私有地址，则标准 HTTP
   代理不足以满足要求；在具备可验证代理侧解析/连接证明或受控中继前，代理模式必须返回
   阻断，而不是忽略 DNS 校验、放行 Fake-IP 或伪造连接证据。

客户端仍然应拒绝：

- 非 HTTP(S)；
- 嵌入凭据；
- 非默认端口；
- 非公开字面量 IP；
- 明确的本机/局域网命名目标（具体列表须由策略实现和测试契约列明）；
- 跨 Origin、协议或端口重定向。

上述客户端限制不能证明任意域名在代理侧不会解析到私有地址，只能减少显式错误目标。

### 5.4 代理连接证据的类型调整提案

当前 `BrowserConnectionEvidence` 只能表达直连。建议将它改为判别联合，保留
`BrowserReadResult.connection` 位置但改变其内部类型：

```ts
// 以下全部是设计提案；当前 shared/browser-types.ts 尚未包含这些字段。
type BrowserConnectionEvidence =
  | {
      readonly mode: "direct";
      readonly selectedAddress: string;
      readonly connectedAddress: string;
      readonly matchesTarget: true;
    }
  | {
      readonly mode: "http_proxy";
      readonly proxyEndpoint: {
        readonly protocol: "http:";
        readonly hostname: string;
        readonly port: number;
      };
      readonly proxyConnectedAddress?: string;
      readonly targetAddress: "not_observed";
      readonly destinationVerification: "not_observed";
      readonly operation: "forward" | "connect";
    };
```

设计约束：

- 直连分支继续保留当前 selected/connected/matches 语义；
- 代理分支的 `proxyConnectedAddress` 只表示代理 socket 对端；
- `targetAddress: "not_observed"` 是明确的非证明状态，不允许填入代理声称的 IP；
- 不把代理端点连接成功映射为 `matchesTarget: true`；
- 如果未来获得代理侧可验证证明，必须新增独立的证明类型和验证规则，不能复用
  `matchesTarget`。

## 6. 重定向、内容与取消设计

Reader 仍是重定向唯一所有者：

1. 基于当前响应 URL 解析 `Location`；
2. 只处理 `301/302/303/307/308`；
3. 每跳重新执行 URL 规则；
4. 只允许初始 Origin；
5. 重新把当前目标传给当前模式的 Transport；
6. 自重定向和循环都计数，最多三次；
7. 不跟随 meta refresh。

在代理模式下，“重新校验”仍然表示目标 URL、Origin、协议、凭据和端口重新校验；它不
意味着 Firefly 对代理侧 DNS 进行第二次本地证明。

两种模式共同使用现有：

- `15` 秒总期限，重定向不重置；
- `2 MiB` 流式响应体上限；
- `16 KiB` 响应头上限；
- `Accept-Encoding: identity`；
- UTF-8、HTML/XHTML/纯文本限制；
- AST Worker 正文提取；
- 空正文、超时、取消、响应过大和解析失败的独立结果；
- 单任务并发限制。

不得因为加入代理而新增静默重试、直连回退、代理回退或第二个解析/广播点。

## 7. Settings 与代理凭据设计

### 7.1 非敏感代理选择

未来如果产品提供代理选择，建议由现有 `SettingsManager` 继续作为唯一持久化所有者，
在 `src/shared/settings-types.ts` 增加以下设计提案：

```ts
// 设计提案，不是当前 FireflySettingsSnapshot 的已有字段
interface BrowserSettings {
  readonly transportMode: "direct" | "http_proxy";
  readonly httpProxy?: {
    readonly protocol: "http:";
    readonly hostname: string;
    readonly port: number;
    readonly credentialRef?: string;
  };
}
```

明确约束：

- 模型输入不能选择或改写代理端点；
- Browser 后端从 Main 组装时读取 Settings 快照；
- `transportMode` 缺失时继续使用 `direct`；
- `http_proxy` 缺少合法端点时返回配置错误，不回退直连；
- 设置更新后，下一次读取重新获取并验证端点；在途读取继续由其已绑定的配置和取消信号
  完成，不中途切换传输模式；
- 代理端点身份必须进入未来授权关联，防止审批等待期间端点被替换。

当前 `SettingsManager.save()` 只对 `permissionProfile` 做专门校验
（`src/main/settings/settings-manager.ts:66-84`）。实施轮必须先增加纯 Browser 配置校验，
再由 SettingsManager 调用；不能让 Renderer 或 Browser Transport 各自接受任意对象。

### 7.2 凭据

当前仓库没有独立的机密存储契约。设计结论：

- 首批 HTTP 代理实现不接入代理认证，或只支持由后续明确设计的 `credentialRef`；
- `credentialRef` 不是密码，不进入 `BrowserReadRequest` 的可见正文、
  `BrowserReadResult`、Approval 文案或普通日志；
- 不把代理密码放入 `FireflySettingsSnapshot`、URL userinfo、环境变量、命令行参数或
  Memory/RAG；
- 不把 `Proxy-Authorization` 转发到网页目标；
- 代理认证失败必须单独结果化，且错误信息去敏；
- 具体使用 Electron 安全存储或其他受支持凭据提供者，须在实现轮先提交独立凭据契约，
  不能沿用当前 LLM API Key 的明文设置字段。

## 8. Capability / Sandbox / Approval 接入设计

本轮不接入。后续集成只能沿以下单一链路：

```text
用户明确提供 URL
  -> Main 普通 Chat 的结构化工具意图
  -> Browser capability
  -> Browser target + transport endpoint scope
  -> Sandbox
  -> 当前四档权限与 Approval
  -> 一次性 AuthorizedCapabilityInvocation
  -> 现有 ToolExecutionEngine
  -> 同一个 BrowserReadBackend
  -> BrowserReadResult（外部不可信观察）
  -> 同一 Main Harness 下一轮上下文
```

### 8.1 Capability 设计提案

建议使用一个只读网页能力，例如 `browser.read.static`（名称为设计提案，当前不存在），
对应一个工具，不为代理另建工具。工具输入只包含用户指定 URL，不包含任意代理选择、
请求头、脚本、Cookie 或凭据。

能力元数据必须明确：

- 目标是公开 HTTP(S) 静态文档读取；
- 读取会产生网络请求和代理可见性影响；
- 页面内容是不可信观察，不是系统指令；
- 不包含点击、脚本、表单、下载、登录、子资源或自动主动访问。

当前 `ToolSideEffect` 只有 `read_only`、`idempotent`、`state_mutation`、
`external_action`。Browser 的“业务只读但产生外部网络请求”没有独立枚举。
实施前需要在权限层决定是否：

1. 新增明确的 `external_network_read` 影响类型并更新四档策略；或
2. 使用现有 `external_action`，以保守方式触发现有权限/Approval 语义。

不能把 Browser 网络访问静默标为普通本地 `read_only`，又在文档中声称没有外部影响。

### 8.2 Sandbox 设计提案

当前 `NetworkScope` 不足以表达目标和代理的关系。建议扩展现有 Sandbox 类型体系，
不新建第二个 Sandbox 所有者：

```ts
// 设计提案，不是当前 SandboxScope 的已有成员
interface BrowserScope {
  readonly kind: "browser";
  readonly targetOrigin: string;
  readonly targetPort: 80 | 443;
  readonly transportMode: "direct" | "http_proxy";
  readonly proxyEndpointId?: string;
}
```

`SandboxPolicyEvaluator`、`isSandboxScopeWithin`、ApprovalService 的范围校验和
AuthorizedInvocation 的运行时校验都必须同步理解这个判别类型。范围比较至少要保证：

- 目标 Origin 精确匹配；
- 目标端口不扩大；
- `direct` 与 `http_proxy` 不互相替换；
- 代理端点身份精确匹配；
- 代理端点的本地例外不扩展为网页目标本地访问。

不要只把 `proxyEndpoint` 写进普通 `NetworkScope.host`，因为那会丢失网页目标身份。

### 8.3 Approval 设计提案

Approval 请求应展示真实的：

- 网页目标规范化 Origin；
- 传输模式；
- 代理端点（去除凭据）；
- 静态读取范围和固定预算；
- 代理模式“最终目标 IP 由代理解析，Firefly 未独立观察”的信任提示。

审批恢复前必须重新读取当前 Settings 权限、重新确认 Capability/Binding、重新评估
Sandbox，并比较目标和代理端点身份。旧审批不能因同一个工具名或同一个 URL 文本而复用。

本进程授权复用是否适用于 Browser 必须单独决定；不能把现有 `music_control` 的进程授权
规则扩展到 Browser，也不能把音乐端点许可解释为网页代理许可。

## 9. 结果真实性与上下文边界

Browser 成功结果只表示：当前 Transport 获得了符合内容限制的响应，并由 AST Worker
完成了静态文本提取。

结果必须继续带有 `untrustedContent: true`，并通过现有 Main Harness 的工具结果路径
进入上下文。网页中的“忽略系统指令”“执行工具”“修改权限”等内容只能作为外部文本，
不能：

- 改写系统 Prompt；
- 直接产生新的工具调用；
- 改变权限或 Sandbox；
- 写入 Memory、RAG 或偏好证据；
- 伪装成用户消息。

代理模式额外返回的连接信息必须准确区分：

- HTTP 状态和内容读取结果；
- 代理端点连接结果；
- 目标 TLS 证书验证结果；
- 网页目标地址是否由 Firefly 独立观察。

不能把“代理返回 200”或“CONNECT 建立成功”写成“网页服务器公开 IP 已验证”。

## 10. 后续首批实施文件与顺序

以下路径和字段都是后续实现计划，不代表已存在：

### 第 1 步：共享契约与纯策略

1. `src/shared/browser-types.ts`
   - 增加传输模式、代理端点、判别式连接证据和明确错误原因；
   - 保持 `BrowserReadRequest`、`BrowserReadResult`、`BrowserReadBackend` 的公共位置；
   - 不把机密凭据放入共享 DTO。
2. `src/main/browser/browser-policy.ts`
   - 保持现有直连公开 IP 策略；
   - 增加网页 URL 与代理端点的分开校验函数；
   - 明确代理模式不伪造网页目标 IP 证明。
3. 如采用新的 `BrowserScope`，同步 `src/shared/sandbox-types.ts`、
   `src/main/runtime/sandbox/sandbox-policy.ts` 和共享运行时验证。

### 第 2 步：单一 Reader 的代理 Transport

1. 新增 `src/main/browser/http-proxy-browser-transport.ts`（设计提案名称）；
2. 保留 `NodeBrowserTransport` 作为直连实现；
3. Reader 通过注入的单一 Transport 选择模式，不新增第二个 Reader；
4. 实现 HTTP absolute-form、HTTPS CONNECT、目标 TLS、预算、取消和释放；
5. 连接证据使用代理分支，禁止冒充目标 IP。

### 第 3 步：Settings 组装

1. `src/shared/settings-types.ts` 增加不含机密的 Browser 设置（设计提案）；
2. `src/main/settings/settings-manager.ts` 增加严格 Browser 配置校验和旧配置迁移；
3. `src/main/application/default-dependencies.ts` 只构造一个 Browser backend；
4. 传输模式和端点从 Settings 注入，模型和 Renderer 不能指定代理；
5. 缺失/非法代理配置返回明确配置错误，不回退直连。

### 第 4 步：Capability / Sandbox / Approval / Harness

1. 先确定 Browser 外部网络影响在四档权限中的表达；
2. 注册一个 Browser 读取 Tool 和一个对应 Capability；
3. 绑定真实 Browser Scope 和端点身份；
4. 接入现有 Harness 授权适配器、AuthorizedInvocationBridge 和
   ToolExecutionEngine；
5. 保持普通 Chat、Music、Worker 和主动无工具边界不变；
6. 不新增 Browser Worker、Browser Agent 或并行任务。

### 第 5 步：分发和人工验收

1. 验证编译后 Browser Worker、`parse5` 和资源定位；
2. 默认测试使用本地受控代理/服务器，不依赖 Clash 或公网；
3. 真实国内/境外访问分别记录可达性与后端结果，不互相替代；
4. 未完成代理目标信任边界前，不宣称“公开网页安全隔离”已完成。

## 11. 固定验证矩阵

### 直连回归

- 现有全部地址策略、混合 DNS、Fake-IP 拒绝、IPv4/IPv6 和映射地址；
- 选定地址与 socket 对端一致；
- 连接阶段无第二次不受控解析；
- HTTP Host、HTTPS SNI、证书验证；
- 重定向逐跳复查、三次边界和跨 Origin 阻断；
- 流式响应/响应头限制、取消、超时、迟到结果和 dispose。

### HTTP 代理

- HTTP absolute-form 请求行；
- `Host` 与网页目标一致；
- 代理端点连接证据与网页目标证据分离；
- 代理拒绝、认证失败、连接断开、响应超限和取消；
- 不读取系统代理或环境代理；
- 代理端点显式本地例外不放宽网页目标；
- 代理失败不回退直连。

### HTTPS CONNECT

- CONNECT 目标 host/port 正确；
- 隧道内目标证书和 SNI 正确；
- 证书不匹配失败；
- 代理 socket 地址不冒充网页服务器 IP；
- CONNECT 阶段超时、取消和释放；
- 不关闭证书校验。

### 目标和重定向

- 私有/回环/链路本地/特殊用途字面量目标拒绝；
- 显式本地代理端点仍可按配置连接；
- 相同 Origin 重定向重新进入当前模式；
- 跨 Origin、协议、凭据、端口或禁止目标阻断；
- 代理侧 DNS 无法证明时，结果保持 `not_observed`，不伪造公开地址。

### 权限与数据边界

- 代理模式显式配置和授权；
- 目标、代理端点、模式和授权范围绑定；
- 审批恢复前复查 Settings、权限、Scope 和端点；
- 凭据不进入 URL、请求目标、结果、正文、Approval 文案或日志；
- 网页提示词注入不能调用工具或改变权限；
- 不写 Settings 之外的用户数据、Memory、RAG 或偏好；
- 直连/代理均无静默回退。

### 配置与分发

- 缺失、非法和旧 Browser 设置的明确结果；
- 默认模式仍为 `direct`；
- 编译后 Main、解析 Worker 和依赖可定位；
- 发布包不含用户配置、代理密码、Memory、缓存或日志；
- 隔离发布目录运行不依赖仓库源码回退。

## 12. 当前缺口与必须决定的问题

以下不是已实现功能，而是进入生产授权集成前必须定案的事项：

1. **代理模式的目标保证**：接受“代理解析目标、Firefly 不独立观察 IP”的显式信任边界，
   还是在取得代理侧可验证证明前保持代理模式阻断。
2. **Browser 网络影响的权限表达**：新增 `external_network_read`，还是沿用现有
   `external_action` 的保守语义。不能默认为普通 `read_only`。
3. **代理认证**：首批是否完全不支持认证；若支持，先确定受支持凭据存储提供者和
   `credentialRef` 契约。当前 SettingsManager 没有安全凭据所有者。
4. **代理端点协议**：第一版是否严格限定 `http:` 代理端点；本设计不包含 HTTPS 代理端点。
5. **代理端点范围绑定**：审批范围绑定规范化端点，还是绑定用户设置版本/稳定端点 ID；
   两者都必须防止审批等待期间端点替换。
6. **显式目标命名限制**：代理模式对 `localhost`、局域网命名和其他不可证明公开的域名，
   采用固定阻断列表还是统一交给代理信任边界。具体列表必须写入策略和测试，不能由模型或
   Renderer 临时判断。
7. **HTTP 目标内容信任**：允许代理看到明文 HTTP 内容，还是代理模式只允许 HTTPS；
   用户要求的 HTTP 转发范围需要与该风险一并确认。

## 13. 结论

当前直连后端可以继续作为默认模式，Fake-IP 仍然拒绝，现有 Reader/Worker/结果契约可以
作为两种模式的共同骨架。

代理兼容不能通过忽略 DNS、把代理 socket 当网页 IP、自动读取 Clash、关闭 TLS 校验或
静默回退直连实现。后续实现必须新增独立 HTTP 代理 Transport，并扩展连接证据与 Sandbox
范围，使网页目标、代理端点和代理侧未观察到的最终目标明确分开。

在上述目标保证、权限影响、凭据存储和 HTTP 明文范围决定前，不进入 Browser 的
Capability、Sandbox、Approval、Harness 或生产 Registry 接入。

**本轮生产网络行为：未修改。**
