# Firefly V1.1.1 — HTTP Proxy Browser Backend V1

## 状态与边界

本文件记录 HTTP 代理双模式后端的实际实现边界。Browser 仍是验证专用模块，未注册到
生产 Registry，未接入 Capability、Sandbox、Approval、Harness、IPC 或 Renderer，也没有
新增自动网络请求、Memory/RAG 写入或主动行为。

实现保持版本 `1.1.1`，工作树基线为分支 `firefly-v1.1.0`、HEAD
`30ac278cdf0f7419510ae575737ab0ee44d1d744`；本轮没有 Commit、Push 或 Publish。

## 公共契约与调用图

共享契约在 `src/shared/browser-types.ts`：

- `BrowserReadRequest` 仍只有 `requestUrl`；
- `BrowserReadResult` 仍以 `untrustedContent: true` 表示外部观察；
- `BrowserTransportMode` 为新增判别值 `direct | http_proxy`；
- `BrowserProxyEndpoint` 为可信调用方注入的规范化 HTTP 代理端点；
- `BrowserResolvedProxyEndpoint` 包含代理端点和已校验的代理地址集合；
- `BrowserResolvedTarget` 现在是 `BrowserDirectResolvedTarget | BrowserProxyResolvedTarget`；
- `BrowserConnectionEvidence` 现在是直连或 HTTP 代理的判别联合。

`BrowserReadBackendOptions` 在 `src/main/browser/browser-reader.ts` 中按模式约束构造：
直连使用 `mode?: "direct"`，代理使用 `mode: "http_proxy"` 与必需的
`proxyEndpoint: BrowserProxyEndpoint`。模式和端点不进入 `BrowserReadRequest`，因此不会成为
模型工具参数。

实际调用关系为：

```text
trusted caller constructs BrowserReadBackend(mode, proxyEndpoint)
  -> BrowserReadBackend.read({ requestUrl })
     -> direct: resolveBrowserTarget (all web DNS answers checked)
     -> proxy: resolveBrowserProxyEndpoint (proxy DNS only)
             -> resolveBrowserProxyTarget (web hostname is not locally resolved)
     -> BrowserSingleHopTransport.request(single-hop target)
        -> NodeBrowserTransport              [direct]
        -> HttpProxyBrowserTransport         [HTTP forward / HTTPS CONNECT]
     -> BrowserContentExtractor
        -> compiled browser-content-worker.js -> parse5 AST
     -> BrowserReadResult
```

Reader 仍是唯一的重定向次数、总期限、累计响应字节、结果状态和最终结果所有者。Transport
仍是单跳连接、响应流、socket 取消和网络释放所有者；解析 Worker 仍由
`browser-content.ts` 创建并释放。没有第二个 Reader、Agent Loop、权限服务或事件总线。

## 直连模式

`resolveBrowserTarget()` 的现有行为保持：使用 WHATWG `URL`，拒绝凭据、非 HTTP(S) 和非
默认端口；域名用 `BrowserDnsResolver.lookup()` 获取全部地址，全部地址通过当前 CIDR
公开地址策略后才建立连接。

`NodeBrowserTransport` 只接受 `mode: "direct"`，选择完整地址集合的第一个地址，用固定
`lookup` 回调阻止连接阶段的第二次 DNS，并在 socket `remoteAddress` 与选定地址不一致时
返回 `connection_target_mismatch`。HTTPS 继续使用 `rejectUnauthorized: true` 和目标域名
证书身份验证。直连证据字段为：

```text
{ mode: "direct", selectedAddress, connectedAddress, matchesTarget }
```

Reader 只接受模式为 `direct` 且上述匹配成立的证据；它不会用代理证据填充直连地址。

## 代理目标与端点策略

`src/main/browser/browser-policy.ts` 新增：

- `normalizeBrowserProxyEndpoint()`：只接受 HTTP、显式 `1..65535` 端口、空路径或 `/`，
  拒绝凭据、查询、片段和其他路径；
- `resolveBrowserProxyEndpoint()`：代理端点为域名时只解析代理端点，并检查返回的全部地址；
  连接层接收规范化后的地址集合，不在连接阶段重新解析；
- `isAllowedBrowserProxyEndpointAddress()`：允许显式配置的 RFC1918、IPv4 回环、IPv6
  `::1`/ULA 代理端点及公开地址，继续拒绝 fake-IP、未指定、链路本地、组播和其他特殊用途
  地址；
- `resolveBrowserProxyTarget()`：域名目标不执行本地 DNS，拒绝单标签、`localhost` 及其
  子域、`.local`、`.localhost`、`.home.arpa`；IP 字面量仍执行当前公开地址策略。

网页目标仍只允许 HTTP(S) 默认端口、无凭据。代理端点是用户明确配置并信任的基础设施，
允许本地/私有端点并不扩大网页目标范围，也不放行 fake-IP 网页地址。

代理模式的同 Origin 重定向由 `resolveBrowserProxyRedirect()` 处理：相对
`Location` 以当前目标解析，每一跳重新检查 HTTP(S)、凭据、默认端口、目标主机名和 Origin，
最多三跳；不进行网页目标本地 DNS。代理端点自身没有重定向流程。

## HTTP 转发与 HTTPS CONNECT

新增 `src/main/browser/http-proxy-browser-transport.ts`，实现同一
`BrowserSingleHopTransport`：

### HTTP 目标

- 通过已校验的代理 socket 发送一次 `GET`；
- 请求行使用 absolute-form，`Host` 是网页目标主机；
- 仅发送固定的 `Accept`、`Accept-Encoding: identity`、`Connection` 和 `Host`；
- 不携带 Cookie、认证或任意用户请求头；
- `407` 返回 `proxy_auth_required`，不提供认证、不重试；
- 代理连接建立后直接断开或拒绝归类为 `proxy_rejected`；
- 普通网页 HTTP 状态仍交给 Reader 作为网页响应处理。由于 HTTP 转发协议的响应没有
  独立的“这是代理生成还是目标生成”字段，任意普通 `4xx/5xx` 不能可靠地再标为代理拒绝，
  否则会把真实网页错误误报成代理错误。

### HTTPS 目标

- CONNECT authority 由目标规范化主机和 `443` 组成；IPv6 使用括号格式；
- 只接受 `200` 建立隧道；`407` 为 `proxy_auth_required`，其他非成功响应为
  `proxy_connect_rejected`；
- CONNECT 响应头使用相同的 16 KiB 限制；响应头之后的 `head` 字节在包装 TLS 前通过
  `socket.unshift()` 保留，不当作网页正文丢弃；
- 隧道内由 Node `tls.connect()` 执行目标 TLS，继续启用证书验证；域名目标使用目标域名
 进行证书身份验证，IP 字面量不伪造域名 SNI，并通过 `tls.checkServerIdentity()` 按 IP
 证书身份校验；
- TLS 成功后才通过一个复用已建立 TLS socket 的 Node `http.Agent` 发送目标 GET；该
  Agent 的 `createConnection` 返回已建立隧道，不执行网页目标 DNS；
- 代理返回的目标 IP 不作为网页连接证明。

没有代理自动发现、系统/环境代理读取、PAC、SOCKS、代理认证、代理切换或直连回退。

## 连接证据与信任边界

直连证据保留选定地址、socket 地址和匹配值。代理证据使用：

```text
{
  mode: "http_proxy",
  operation: "forward" | "connect",
  proxyEndpoint,
  proxySelectedAddress,
  proxyConnectedAddress,
  proxyMatchesEndpoint,
  targetAddress: "not_observed",
  tls?: { verified: true, serverName }
}
```

`targetAddress: "not_observed"` 是代理模式对网页目标实际 IP 的唯一未观察表达；代理
socket 地址不能写入网页目标字段。`tls` 只在目标 TLS 已实际验证成功后出现。代理端点
socket 不匹配时返回 `proxy_endpoint_target_mismatch`，不会生成成功匹配证据；TLS 失败时
不会生成成功 TLS 证据。

客户端仍能执行网页 URL 的协议、凭据、默认端口、主机名和同 Origin 限制，并能证明自己
连接到了已校验的代理端点；如果网页域名由代理解析，客户端不能证明代理侧解析结果没有
落入私网。因此代理模式依赖用户对代理基础设施的信任，不能宣称具备直连模式的目标 IP
隔离保证。

## 预算、取消和释放

两种 Transport 共用 `BROWSER_READ_LIMITS`：15 秒总期限、3 次重定向、2 MiB 累计响应体、
16 KiB 响应头、4,000 个正文 Unicode 码点、200 个标题 Unicode 码点、并发 1。代理端点
连接、HTTP 转发、CONNECT、目标 TLS、目标响应和解析 Worker 均消耗 Reader 的剩余期限，
重定向不重置期限。

取消、超时或 `dispose()` 会销毁代理请求、原始 socket、TLS socket、目标请求和响应读取；
`dispose()` 幂等，最多等待底层活动集合的有限清理窗口。DNS 仍使用 Node resolver 的
不可撤销 API 时，Reader 只停止等待，迟到结果不会建立连接。迟到成功不能覆盖 Reader 已
返回的取消、超时或失败终态。

## 测试与编译后验证

新增 `tools/test/runtime/browser-proxy.test.ts`，测试只使用本地受控 HTTP 代理和 TLS 服务，
覆盖：

- 端点格式、私有/回环端点允许与 fake-IP/特殊地址拒绝；
- 代理目标不做本地网页 DNS、IP 字面量公开策略、主机名限制；
- absolute-form、Host、identity 编码、无 Cookie/认证、单次 GET；
- 同 Origin 重定向、跨 Origin 阻断；
- `407`、代理断开、CONNECT 非成功响应；
- CONNECT 后目标 TLS、证书不匹配和目标 IP 未观察证据；
- 取消、总期限、重复释放和直连目标拒绝回退。

原有 `browser-read-backend.test.ts` 与 `browser-transport.test.ts` 保留，直连 Reader/HTTP/TLS
行为没有转为代理测试替代。

新增 `tools/verify/browser-electron-proxy.mts` 是独立的编译后验证入口：它使用项目安装的
Electron `33.4.11`（内嵌 Node `20.18.3`），在 `app.whenReady()` 后、不创建
`BrowserWindow` 的进程中加载编译后的 Reader、HTTP proxy Transport、共享契约和
`browser-content-worker.js`，启动本地代理，完成一次 HTTP 转发和解析 Worker 读取，结果写入
临时 JSON，父进程等待真实退出码并保存辅助日志。它不启动完整 Firefly，也不影响已运行的
应用。

`package.json` 新增验证脚本 `verify:browser-electron-proxy`，Browser proxy 测试已加入默认
`npm test`；没有新增生产入口。公网网页验收、本地 fake-IP 兼容和 Clash/TUN 验证不属于本轮，
不能用本地测试替代公网可达性。

## 旧接口、输出与生产状态

旧 Electron 页面 Session 后端、`BrowserPageRuntime` 和只检查源码字符串的验证入口在此前
Browser 后端轮已退役；本轮没有保留第二个 proxy Reader 或旧单跳目标转发文件。新增代理
Transport 与现有编译目录 `dist/main/main/browser/` 一起由 `tsconfig.main.json` 生成，不依赖
源码目录回退。

本轮生产注册状态固定为：**NONE**。Settings、Capability、Sandbox、Approval、Harness、
Renderer、音乐权限、TTS、Live2D 和 Memory/RAG 均未修改。
