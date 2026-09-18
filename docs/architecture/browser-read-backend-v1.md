# Firefly V1.1.1 — Controlled Browser Read Backend V1

## 范围与生产状态

本轮实现 Browser 静态网页读取后端，但仍不向生产 Registry 注册，不接入
Capability、Sandbox、Approval、Harness、IPC 或 Renderer，不向 MAIN/Worker 暴露
Browser Schema。没有恢复主动生产者，也没有改变音乐权限、TTS、Live2D、Memory/RAG
或用户数据。

能力边界是：读取用户指定的公开 HTTP(S) 静态文档，返回有限标题和正文。实现不执行网页
脚本、不登录、不携带个人浏览器状态、不提交表单、不下载、不跟随 HTML meta refresh，且不
加载页面子资源或子框架。正文是外部不可信观察数据，不是系统指令、用户消息、权限决定、
Memory 记录或 RAG 输入。

## 公共契约与内部调用图

共享公共契约位于 `src/shared/browser-types.ts`：

- `BrowserReadRequest` 与 `BrowserReadResult`；
- `BrowserReadBackend.read()` 与 `dispose()` 的边界；
- `BROWSER_READ_LIMITS`；
- `untrustedContent: true`；
- `BrowserConnectionEvidence`，记录选定地址、实际 socket 地址及匹配结果。

内部单跳契约位于 `src/main/browser/browser-transport.ts`：

```text
BrowserReadBackend
  -> BrowserPolicy.resolveBrowserTarget / resolveBrowserRedirect
  -> BrowserSingleHopTransport.request
  -> NodeBrowserTransport
       custom lookup(selected validated IP)
       direct http/https socket
       response header/body streaming
       remoteAddress equality check
  -> BrowserContentExtractor
       Worker -> parse5 AST -> title/body
  -> bounded BrowserReadResult
```

`BrowserReadBackend` 独占重定向次数、逐跳地址策略、总期限、累计响应大小、结果状态和
最终结果；`BrowserSingleHopTransport` 独占一次连接、响应头/响应体读取、socket 取消和
网络资源释放；AST 提取在可终止的 `worker_threads` 执行单元中完成。

`extractStaticDocument(html, signal, remainingMs)` 是生产调用契约；其第四个可选参数
`BrowserContentExtractionOptions` 仅提供验证用的 Worker 路径、创建回调和消息投递回调，
生产调用不传入。提取器等待实际 Worker `online` 后才投递 HTML，取消可以在 Worker 已启动且
消息已投递后确定地终止该任务。

## 网络目标策略

`src/main/browser/browser-policy.ts` 使用 WHATWG `URL`，拒绝凭据、非 HTTP(S) 协议和
非默认端口。域名解析通过 `dns.promises.lookup(hostname, { all: true, verbatim: true })`
返回全部地址；任何一个地址不符合公开目标策略，整个请求在连接前阻断。

策略使用可审查的 CIDR 判断。依据 IANA [IPv4 Special-Purpose Address Space](https://www.iana.org/assignments/iana-ipv4-special-registry)
和 [IPv6 Special-Purpose Address Space](https://www.iana.org/assignments/iana-ipv6-special-registry)，
保守拒绝以下范围：

- IPv4：`0/8`、`10/8`、`100.64/10`、`127/8`、`169.254/16`、`172.16/12`、
  `192.0.0/24`、`192.0.2/24`、`192.31.196/24`、`192.52.193/24`、`192.88.99/24`、
  `192.168/16`、`192.175.48/24`、`198.18/15`、`198.51.100/24`、`203.0.113/24`、
  `224/4` 和 `240/4`；
- IPv6：未指定、回环、IPv4 转换前缀 `64:ff9b::/96` 与 `64:ff9b:1::/48`、
  丢弃/虚拟前缀、协议/基准测试/文档/ORCHID/6to4/AS112/文档/分段路由、
  唯一本地、链路本地和组播范围；
- IPv4-mapped IPv6 先还原为 IPv4 再判断；公开 IPv4 映射地址可以通过，私有或特殊
  IPv4 映射地址不能绕过策略。

IPv6 转换、隧道和特殊用途地址不因其形式看起来是全球单播而放行。地址规范化结果会
继续传给连接层，不能由连接层重新解析域名。

## 实际连接绑定

`src/main/browser/browser-transport.ts` 使用 Node 主进程的 `http`/`https` 模块：

1. Reader 把已经验证的完整 `BrowserResolvedTarget` 传给单跳 Transport；
2. Transport 只选择地址集合中的第一个地址，不自动切换或重试；
3. Node `lookup` 回调只返回该选定地址，阻止连接阶段的第二次 DNS 解析；
4. `agent: false`、`Connection: close`，不使用连接池、个人代理、Cookie 或认证信息；
5. HTTP `Host` 保留原始域名；HTTPS 设置原域名 SNI，`rejectUnauthorized: true`，不覆盖
   证书校验；IP 字面量不伪造域名 SNI；
6. socket `remoteAddress` 规范化后必须等于选定地址，否则立即终止并返回
   `connection_target_mismatch`；结果携带 `BrowserConnectionEvidence`。

本轮没有使用 Electron `BrowserWindow` 或网页 `Session`。Electron 主进程版本通过实际
Electron 可执行文件读取到的 `process.versions` 为：

```json
{
  "node": "20.18.3",
  "electron": "33.4.11",
  "chrome": "130.0.6723.191",
  "v8": "13.0.245.25-electron.0",
  "modules": "130"
}
```

系统 Node 为 `v24.19.0`，不用于替代 Electron 主进程版本判断。

## 重定向与响应边界

只处理 `301/302/303/307/308`。`Location` 基于当前响应 URL 解析；每跳重新解析全部 DNS
地址并重新检查同 Origin、协议、凭据、端口和地址范围。每一次跳转都计数，包括自重定向；
超过三次阻断。最终 URL 使用最后一次实际成功响应对应的当前目标，不通过读取结束后的
额外 DNS 查询冒充连接证据。

固定限制：

| 项目 | 值 |
| --- | ---: |
| 整次读取期限 | 15 秒 |
| 最大重定向 | 3 |
| 累计响应体 | 2 MiB |
| 响应头 | 16 KiB |
| 正文 | 4,000 Unicode 码点 |
| 标题 | 200 Unicode 码点 |
| 并发读取 | 1 |

Transport 在 `data` 事件期间累计响应体，超限立即销毁响应；`Content-Length` 只用于
提前拒绝，不能替代流式计数。请求发送 `Accept-Encoding: identity`，收到压缩响应返回
`unsupported_content_encoding`。只接受成功状态的 `text/html`、`application/xhtml+xml`
或 `text/plain`，仅支持 UTF-8；附件、二进制、错误状态和其他编码分别返回结构化原因。

正文使用 `parse5@7.3.0` AST 提取，排除 `script`、`style`、`template`、`noscript` 和
`head` 文本，不使用正则解析 HTML。解析在 Worker 中执行；取消、超时和退出会终止该
Worker。返回文本仍只是静态文档文本，不宣称等同于浏览器视觉正文。

## 取消、超时与释放

DNS resolver 当前 Node API 不提供真正的可撤销句柄。Reader 在共享 AbortSignal 上停止
等待，迟到 DNS 结果被隔离，且只有仍然有效的运行才会调用 Transport，因此迟到解析不会
建立连接。连接、响应读取和 AST Worker 共享同一 15 秒期限；重定向不重置期限。

`BrowserReadBackend.dispose()` 和 `NodeBrowserTransport.dispose()` 幂等；提取器在成功、失败、
取消和超时路径都会移除 AbortSignal/Worker 监听器并终止 Worker，Reader 取消会销毁活动请求，
清理活动集合和定时器。迟到响应不会覆盖已经返回的取消、超时或失败结果。

## 旧实现退役

已移除：

- `src/main/browser/electron-read-session.ts`；
- `src/main/browser/native-browser-backend.ts`；
- 对应 `dist/main/main/browser/` 下的旧 `.js`、`.d.ts` 和 `.js.map` 输出。

替代为 `src/main/browser/node-browser-backend.ts`，仅提供验证阶段的 Node 传输组合函数，
仍未被 `default-dependencies.ts` 或其他生产组合入口导入。旧 `BrowserPageRuntime`、
Electron 源码字符串测试和永远不可用的能力标志已移除；测试改为真实本地 HTTP/TLS
Transport 加注入式 Reader 测试。

## 测试与验证范围

- `browser-read-backend.test.ts`：策略、混合 DNS、逐跳重定向、累计限制、内容分类、
  AST 提取、DNS/响应取消、超时、迟到结果、dispose 和生产注册隔离；
- `browser-transport.test.ts`：本地 HTTP server 的实际 socket 地址、Host、identity 编码、
  分块响应、流式超限、响应头上限、本地 TLS server 的 SNI/证书校验以及请求取消；
- `tools/verify/browser-electron-parser.mts`：通过项目安装的 Electron 启动最小临时应用，
  在 `app.whenReady()` 后加载编译后的提取器和实际编译 Worker；结果写入独立 JSON，父进程
  等待 Electron 退出并单独保存 stdout/stderr；
- 本地传输测试只在底层 Transport 注入 endpoint 端口，策略仍单独拒绝 `127.0.0.1` 等
  非公开地址，没有生产 `allowPrivateNetwork` 开关；
- 未启动 Electron BrowserWindow 或 Electron Session，未安装 Playwright/Puppeteer/MCP；
- 公网验收的时间顺序如下：先前在 TUN 保持开启时，Electron 主进程加载编译后的
  `node-browser-backend.js` 并执行一次 `https://example.com/` 读取；DNS 返回
  `198.18.0.87`，Reader 在连接前返回 `blocked / non_public_target`，因此没有 HTTP 响应、
  最终地址、标题或正文。公开读取没有降低地址策略，未建立到该地址的 socket；编译后的
  后端随后调用 `dispose()`，验证命令退出码为 `0`；
- 随后用户手动尝试关闭 TUN，Codex 连接在取得新的验证结果前中断；该阶段没有新的
  Browser 页面读取结果，不能据此声称关闭成功或公网验收通过；
- 后续只读 DNS 复核时仍观察到 TUN 适配器处于 `Up`，但系统 Node 与 Electron 的
  `dns.lookup` 均返回 `104.20.23.154`、`172.66.147.243` 两个地址。本次只完成 DNS 复核，
  没有再次执行网页读取，因此公网 Browser 验收仍不计为通过；
- 编译后的 AST Worker、Reader 取消和 Transport 取消已由 Node 20.18.3 下的真实本地
  HTTP/TLS 测试覆盖；本轮 Electron 验证进一步在 `app.whenReady()` 后执行了编译 Worker
  的成功、启动失败、异常退出、取消和超时路径。

进入下一轮 Capability、Sandbox、Approval、Harness 集成前，仍须保留当前无生产注册边界。

## 本轮验证记录

- `npm run typecheck`：PASS；主进程、preload、renderer、测试、工具和 CLI 均纳入严格检查；
- `npm run build`：PASS；CLI、主进程、preload、renderer 和运行资源复制均完成；
- Browser 定向测试：PASS；Reader `12/12`，Transport `4/4`；
- `npm test`：PASS；默认测试入口完成，Browser 测试包含在内；
- `npm run verify:typescript`：PASS；仅保留已批准的第三方/运行时非 TypeScript 文件；
- `npm run verify:architecture`：PASS；Browser 未进入生产 Registry、Capability、Harness 或 IPC；
- `git diff --check`：PASS；Git 仅报告现有工作树的 LF/CRLF 转换提示，没有差异检查错误；
- `npm run verify:browser-electron-parser`：PASS；Electron `33.4.11` 退出码 `0`，全部
  `fixedHtml`、`codePointBounds`、`workerStartupFailure`、`workerAbnormalExit`、
  `cancellation`、`timeout` 断言通过；结果文件为
  `C:\Users\w1558\AppData\Local\Temp\firefly-browser-electron-parser-T0oYfq\result.json`，
  辅助输出为同目录的 `electron-output.log`；
- 真实公开网页：已执行一次；结果为 `blocked / non_public_target`，原因是 Electron DNS
  返回的 `198.18.0.87` 属于被策略拒绝的特殊用途地址；
- Electron `33.4.11` 主进程：编译后端加载和结构化阻断结果通过；BrowserWindow/Session
  未创建；编译 Worker 无窗口验证通过；
- Electron 验证临时 bootstrap、失败/挂起 Worker 文件和进程：已清理；结果 JSON 与辅助日志
  按要求保留；未留下本轮 Electron 进程；
- 生产能力注册：NONE。

## 公网验收环境限制

2026-09-14 的只读复核使用后端实际调用的
`dns.promises.lookup(hostname, { all: true, verbatim: true })`：系统 Node `24.19.0` 与
Electron `33.4.11` / Node `20.18.3` 均只得到 `198.18.0.87`。该地址落在当前地址策略拒绝的
特殊用途范围内，因此公网读取在连接前阻断。Browser 后端要求 DNS 返回符合策略的公开地址，
当前不支持本机 fake-IP DNS 模式；本轮未清缓存、修改 DNS、代理、hosts 或地址策略。

## 依赖审计归属

本轮仅执行 `npm audit --json` 与 `npm explain`，没有执行 `npm audit fix`。审计结果为
`3` 项：`1` 项 moderate、`2` 项 high、`0` 项 critical：

- `electron@33.4.11`：根项目直接依赖，位于 `node_modules/electron`；相关 Electron
  advisories 的可修复版本会跨越当前 Electron 主版本，本轮不升级。它是应用运行时依赖，
  不是 Browser 后端新增的传输依赖；
- `extract-zip@2.0.1`：`electron@33.4.11` 的传递依赖，报告了归档符号链接路径写入问题；
  不由 Browser 读取链直接导入；
- `qs@6.15.3`：由 Pixi 依赖链经 `url` 引入的传递依赖；不由 Browser 读取链直接导入。

Browser 本轮新增的 `parse5@7.3.0` 是根项目直接依赖，未出现在本次 3 项审计结果中；它只
用于静态 HTML AST 提取。以上均为归属记录，不改变依赖版本。

## 基线与交付

- 分支：`firefly-v1.1.0`；
- HEAD：`30ac278cdf0f7419510ae575737ab0ee44d1d744`；
- 产品版本：`1.1.1`；
- Commit：NONE；Push：NONE；Publish：NONE。

## 当前双模式补充

HTTP 代理双模式的有效实现记录见 `docs/architecture/browser-http-proxy-backend-v1.md`。
该实现保留本文的直连契约和限制，并新增 `http_proxy` 判别模式；它仍未进入生产
Registry、Capability、Sandbox、Approval、Harness、IPC 或 Renderer。
