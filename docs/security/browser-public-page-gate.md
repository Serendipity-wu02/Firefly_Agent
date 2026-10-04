# 首版公共网页浏览器网络门槛

日期：2026-10-04。审查基线：`50cc50be3d6e51c616c41ba5d2b6e86dd7b626aa`。范围是[已确认设计](../architecture/right-agent-workspace.md)中的匿名公共网页浏览；本文件提供实验与验收建议，不批准或实现 BrowserService、bridge、代理、安全机制或共享接线。来源 metadata 冻结不属于本文件。

**结论：网络门槛尚未闭合。** 单独 `setProxy`、地址栏校验、renderer 状态机或内存 Session 都不能证明“只访问公网”。已有最小真实 Electron 实验证实隐式直连与 Session 残留；候选控制在特定合成案例有效。未完成的代理鉴权、IP 固定、跨协议流量、并发撤销等验收必须完成并由父集成者作安全决定后，才可让真实网页走 `loadURL`。失败保持浏览入口受阻并给真实错误；不得跳过网络准备或回退系统浏览器。

## 已核验事实与来源

实际安装 `node_modules/electron/package.json`、`dist/version` 和运行进程均为 Electron **43.1.0**；运行进程 Chromium **150.0.7871.47**、Node **24.18.0**。`node_modules` 是指向当前 Firefly E 盘依赖的 junction，没有复制、安装或读取其它产品基线。下列 Electron 文档均固定到 `v43.1.0`。

| 边界 | 版本固定事实 | 判断与限制 |
|---|---|---|
| 代理 | `ProxyConfig` 有 `fixed_servers/proxyRules/proxyBypassRules`；代理规则可以显式加入 `direct://` | 使用单一代理覆盖所有支持的 URL 类别，禁止 PAC/system/自动发现与 DIRECT 候选；空 bypass 不取消隐式绕过。见 [ProxyConfig](https://github.com/electron/electron/blob/v43.1.0/docs/api/structures/proxy-config.md)。 |
| HTTPS 方法 | `onBeforeRequest` 提供原请求 `method/url/resourceType` 和取消回调；每种事件仅最后一个 listener 生效 | 每个专用 Session 单一受控注册点负责全部请求策略，避免安全 handler 被另一组件替换。CONNECT 只检查隧道目的地，方法策略须在 Chromium 请求边界实施。见 [WebRequest](https://github.com/electron/electron/blob/v43.1.0/docs/api/web-request.md)。 |
| WebRTC | `WebContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')` 是页面 API，允许 TCP（以及代理支持的 UDP） | 它不是 Session 网络总开关；无媒体权限也不能证明 DataChannel 不联网。仅读回 policy 不证明封住直连。见 [WebContents](https://github.com/electron/electron/blob/v43.1.0/docs/api/web-contents.md#contentssetwebrtciphandlingpolicypolicy)。 |
| 权限/清理 | Session 有权限 check/request 双 handler、连接/存储/cache/auth 清理；更全面的 `clearData` 也存在 | 两种权限 handler 都拒绝；页关闭与 session 清理是独立动作。`setProxy` 完成也不能清除之前的池化连接。见 [Session](https://github.com/electron/electron/blob/v43.1.0/docs/api/session.md)。 |
| 证书与鉴权 | app 与 WebContents 有 certificate-error、select-client-certificate、login 事件；未拦客户端证书可能选择证书库首项 | 对受控浏览页面阻止默认客户端证书选择，不提供证书；拒绝目标站点登录挑战。代理挑战只有当前注册 binding 且端点、scheme、realm、generation 全匹配才可回应专用凭据。见 [App](https://github.com/electron/electron/blob/v43.1.0/docs/api/app.md#event-select-client-certificate)。 |

本机类型定位：`electron.d.ts` 的 ProxyConfig 约 11665 行，Session cleanup 约 12862–12921 行，证书 verify proc 约 13175 行，权限双 handler 约 13238/13247 行，Session setProxy 约 13266 行，WebRTC policy 约 18423 行。全文未找到 `destroySession` 或 Session QUIC 禁用方法；探针对象 `typeof ses.destroySession === 'undefined'`。这里的缺失判断只覆盖本次检查的公开类型/API，不推断 Chromium 内部不存在相关机制。

Chromium 官方 [Proxy support](https://chromium.googlesource.com/chromium/src/+/main/net/docs/proxy.md)说明：隐式绕过包括 localhost、loopback 与 link-local；`<-loopback>` 减去隐式规则；CONNECT 保持端到端 TLS；单代理失败不会自动 DIRECT，显式加 DIRECT 才允许回退。**该 Chromium 文档为 main，尝试按 150.0.7871.47 固定读取被 web 工具拒绝访问，不能称其为版本固定源码证据。** 本机 Electron 实验补充验证了 loopback 和单代理失效行为，未验证全部平台特殊名称或 link-local 地址。

QUIC 不属于 WebRTC。Electron [43.1.0 command-line-switches](https://github.com/electron/electron/blob/v43.1.0/docs/api/command-line-switches.md)说明启动 switch 在 ready 前追加，但其中未找到 `disable-quic` 文档；本次仅在专用探针进程追加该候选 switch，**未抓包验证效果**。不能据此宣称已按 Session 禁用 QUIC，不能把全局 switch 偷接到产品宿主。

## 最小候选控制及其证明责任

父可继续评估“专用内存 Session + 本地授权 CONNECT 代理 + Chromium 请求策略”的候选组合，但不得把本文件视作批准。每个控制有不同责任：

1. Session 在任何网页载入前准备完毕，使用 Main 生成且不复用的 partition；只绑定当前 runtime profile/conversation/browser 与私有 owner generation。不得复用 defaultSession、生产 profile 或旧浏览 partition。Session 不能成为 renderer DTO 可构造的 authority。
2. 明确固定单一本地代理，`proxyBypassRules: '<-loopback>'`，没有 DIRECT/PAC/system/自动发现分支。对 HTTPS、HTTP、WebSocket 路由均做独立证据验证；即使方法 gate 只准 HTTPS，绕过请求必须在网络边界被拒绝。`resolveProxy` 只是配置诊断，必须另有 origin/proxy 实际命中证据。代理死掉时失败，不重试直连。
3. 本地绑定地址与随机端口不构成鉴权。候选代理使用每个 binding 独立随机凭据，只在 Main 内存持有；无凭据、错误凭据、过期 generation、其它浏览 session 均不得创建上游 socket。凭据不进 URL/renderer/工具结果/日志；禁止通用主机或通配 realm 的 login 响应。不采用 Chromium 不支持鉴权的 SOCKS 方案来声称满足本门槛。
4. 代理对每次 CONNECT 解析规范 authority，只准指定 HTTPS 端口，拒绝 userinfo、非法编码/语法与非公网 IP 字面量。DNS 获取所有 A/AAAA 答案并严格分类 IPv4/IPv6（含 IPv4-mapped 等等价形式）；混合公网/非公网答案、分类不明、解析失败全部拒绝。固定一个已通过的数值 IP，实际 `connect` 不再次按主机名解析；连接后的 remoteAddress 复核；重连和新 CONNECT 重新授权/分类。用可注入 resolver/dialer 的合成测试证明 DNS 变更不能让第二次解析换入内网，不真实触达元数据地址或局域网服务。
5. TLS 保持浏览器与目标之间端到端，不做解密 MITM，不安装测试/产品 CA 到系统。原 hostname 仍用于浏览器 SNI 与验证。CONNECT 代理无法看到 TLS 内的 POST/PUT 等方法，**GET/HEAD 白名单由 Chromium onBeforeRequest 对所有资源实施**；默认拒绝非 HTTPS、非白名单方法、WebSocket 等长期双向通道，不能只查导航入口。覆盖子 frame、重定向、fetch/XHR、form、beacon、worker/service worker，未知请求归属也拒绝；异步结束与副作用前重新检查 generation/abort。
6. 同时覆盖无法由上述 HTTP gate 证明的预连接、DNS prefetch、QUIC/HTTP3、WebTransport、WebRTC UDP 与 TCP。推荐先在隔离浏览进程/受约束 egress 方案上做本地抓包及计数验收；是否引入该架构由父决定。仅 Session API、loopback 代理或 `disable_non_proxied_udp` 不能自行满足全部证明责任。

“只准 GET/HEAD”是方法限制，不是对任意网站无副作用的证明：网页 GET 也可能触发服务端写入或带查询数据。匿名内存页仍会收到 cookie，且网页脚本可能联网。若产品要求语义上的“无写入/不发送数据”，父须决定更严格的站点/资源策略或静态内容模式；不能把普通交互网页称为绝对只读。

## 权限、证书与关闭顺序

首版所有 permission check 返回 false，request callback false；设备权限、显示捕获、新窗口、下载、外部 scheme 等独立路径也要默认拒绝，不能以双 handler 代替各路径验收。文件输入/上传选择器未在本次实验覆盖，不能声称已禁用上传。客户端证书选择对受控 webContents 调用 preventDefault 并不提供证书；有效服务器证书用 Chromium 正常验证，错误证书不接受，不使用 `callback(0)` 统一放行，也不加 ignore-certificate-errors。session verify proc 如需额外策略，用已确认 API 保留正常验证结果；验证结果缓存必须纳入重开/撤销考虑。

建议关闭是一个 Main 私有幂等流程：同步使 owner/binding 失效并启动全请求 deny → 中止 DNS/授权等等待并立即销毁本 binding 代理隧道 → 隐藏、stop、关闭 WebContents（不等不可信 beforeunload）并确认 destroyed → await `closeAllConnections()` → await `clearStorageData()` 与 `clearCache()`、独立 `clearAuthCache()`/`clearHostResolverCache()`；若要清 backgroundFetch 等更广的数据，评估已存在的 `clearData()` 并追加实测。deny handler 保留到流程结束，迟到回调不得重新放行。仅 `stop()` 只停止导航，不能当作全部网络停止；清 storage/cache 不等于关闭连接。

顺序的安全理由是先让所有生产者失去授权，再清理状态，防止清理后迟到请求写回。closeAllConnections 必须配合持续 deny 与代理隧道销毁，不能依赖它阻止之后的新请求。撤销后已传出的网络字节无法收回；明确验收从何时起拒绝新 connect、断开现存 tunnel，避免承诺不存在的原子“零后续字节”。

实际退出入口为 `src/main/application/shutdown.ts` 的 `ShutdownCoordinator`，现有 phase 顺序包含 quiesce、stopProducers、stopActiveWork、stopExternalConsumers、stopExternalProviders、stopLocalResources、flushPersistence。同阶段并行，单项失败仍继续，总超时中止等待。父需把依赖顺序放在一个受控 dispose 或不同已有 phase，不能靠注册顺序保证；失败/超时记录 cleanup_failed，不假称清空完成。退出异常与强杀只提供内存会话降低持久状态的事实，不承诺即时清零。重开使用新 partition，旧 binding 永不恢复。

## 已执行隔离探针

位置：`E:/Codex/2026-10-04/task-4/network-probe/probe.cjs`。无产品 import、无上游转发、无远程站点、无真实凭据；服务均只绑定 127.0.0.1，URL 为本机 IP 字面量。local HTTP/direct 仅是合成反例 fixture，不是产品允许项。探针专用 BrowserWindow show:false、sandbox/contextIsolation、无 Node integration/preload，userData/sessionData/logs 在独立 `smoke-r*`。其 executeJavaScript 只请求合成页 Notification 权限，不接入任何产品执行通道。

正式 native `require_escalated` 审批通过后，Start-Process WindowStyle Hidden 启动独立 Electron，仅本机服务，30 秒脚本自退出。首跑 `r1` PID **33808**，退出 **0**，证据 `evidence-r1.json`，stdout/stderr 各 `*-r1.log`，PID 留 `pid-r1.txt`；启动未触碰 PID 10072 或真实 userData。记录数组快照修正后复跑信息见下文最终验证段。

| 实验 | 实测结果 | 证明范围 |
|---|---|---|
| 空 bypass 的反例 | resolveProxy 为 DIRECT，origin 1 次、proxy 0 次 | 默认 loopback 可直连 |
| 减去隐式绕过 | PROXY，代理命中，origin 无新增 | 该本机 IPv4 URL 已走代理 |
| HTTPS POST | onBeforeRequest 看到 POST，ERR_BLOCKED_BY_CLIENT，CONNECT 0 | Chromium session.fetch 在 CONNECT 前可拒绝 POST；未证明全部 renderer/worker 请求 |
| HTTPS GET | 本地代理收到 CONNECT，返回合成 403 | CONNECT 可见 authority；没有完成 TLS 隧道实验 |
| 单代理失效 | ERR_PROXY_CONNECTION_FAILED，origin 无新增 | 该 HTTP fixture 未 DIRECT 回退 |
| 权限与 WebRTC | Notification denied，WebRTC policy 读回设定值 | 一项权限实测；未证明 UDP/TCP 无旁路 |
| 同步撤销 | 新 fetch ERR_BLOCKED_BY_CLIENT，origin 无新增 | 新请求 deny；未测已连 tunnel/异步 DNS 竞态 |
| 页面关闭反例 | 关闭后合成 cookie 仍 1 条 | 页面关闭不清 Session |
| 显式清理 | connections/storage/cache/auth/hostResolver 完成，cookie 0 条 | API 可调用与 cookie 清理；未证明所有存储或 shutdown 接线 |

此处 RED 是安全反例的标签；探针断言“反例确实发生”所以进程成功退出。**没有产品安全实现，也没有真实产品测试先失败再转绿的 TDD 记录。** 以下矩阵是后续实现前应建立的验收测试，不把已有 mock 或状态机通过算作网络通过。

## 最小 RED/GREEN 验收矩阵

| 编号 | 先建立 RED/拒绝反例 | 实现后 GREEN 的外部证据 | 当前状态 |
|---|---|---|---|
| N1 | 空 bypass/显式 DIRECT 允许 loopback/link-local 特殊名称 | IPv4/IPv6 与 Windows 特殊名称全部走代理拒绝；目标 socket 0 | loopback IPv4 探针；其余待测 |
| N2 | 代理退出、端口拒绝、协议失败仍尝试 origin | 实际目标连接 0、真实错误、无系统浏览器回退 | 本机 HTTP 连接拒绝已测；TLS/其它待测 |
| N3 | 无/错/旧 token、其它 Session 也能 CONNECT | 上游 dial 0；正确 active binding 才成功；target auth 永不获凭据 | 未实现/未测 |
| N4 | DNS 预检公网但第二次解析内网、混合 AAAA、映射地址绕过 | resolver/dialer 参数证明只连已审数值 IP；rebind/redirect/reconnect 拒绝 | 未实现/未测 |
| N5 | TLS 内 POST/form/beacon/重定向或 worker 未受限制 | 每种入口被 Chromium gate 拒绝，fixture POST/上游命中 0；GET/HEAD 合法 fixture 成功 | session.fetch POST 已测；完整入口待测 |
| N6 | revoke 在 DNS await、CONNECT 建立中或已有 tunnel 时到来 | 延迟释放后不 dial、不 publish；现存 tunnel 终止；后续请求拒绝 | 新 fetch deny 已测；竞态/tunnel 待测 |
| N7 | QUIC/HTTP3/WebTransport/WebRTC UDP/STUN/TURN TCP 绕过代理 | 专用本地 UDP/TCP sink 与抓包计数 0；配置和版本留证；不碰真实网络 | 未测；公开 Session API 不足证明 |
| N8 | permission/request、设备/捕获、client cert 自动选择、坏服务器证书 | 全路径拒绝；无需真实证书库/凭据，临时 TLS fixture；无操作系统选择 UI | Notification 已测；其余待测 |
| N9 | view.close 保留 cookie；worker/连接/延迟 callback 清理后写回；cleanup reject | cookie/localStorage/IndexedDB/cache/SW/auth 清理留证；延迟副作用0；新 partition；失败真实报告 | cookie 反例与清理已测；其余待测 |
| N10 | 接入 shutdown 后同 phase 竞态、超时/失败被吞掉 | 现有 coordinator 单测/隔离 smoke 证明 revoke-first、后续清理执行、失败/超时可见 | 仅源码核验，未改接线 |

最小后续顺序：先新增 N1–N6 的可注入策略/代理验收与 renderer/worker 合成测试，保留目标端计数；再单独完成 N7 egress/packet 证明和 N8–N10 生命周期/权限验收，之后才审查 BrowserNetworkPort prepare 的生产实现。mock 能证明策略分支与竞态，不能证明 Chromium 不走另一网络栈。

## 父集成者须决定的具体事项

- 是否批准继续研究上述双边界代理候选，及要求全部公网地址还是显式站点白名单；明确 GET/HEAD 与语义只读的区别。
- 如何隔离跨协议 egress（专用浏览进程/系统约束等），或在拿不到证明前继续禁用真实浏览。全局 QUIC switch 会影响宿主，不能由子任务决定。
- 将代理 token/binding/revoke 生命周期、请求归属/未知 worker 拒绝规则和 cleanup 错误冻结为 Main 私有契约，再授权产品实现；不把本探针代理移入产品。
- 给 N1–N10 的验收所有权、native 隔离测试窗口与失败处理，明确网络准备失败继续 blocked、禁止系统浏览器回退。

最终验证：本任务只写入此新文档及仓库外 network-probe 目录；无 commit、push、merge、依赖安装或共享/UI改动。文档/探针无产品代码改动，未运行产品 build/typecheck 或整仓测试，不能据本次 native smoke 宣称产品可用。

## 交付验证附录

- `node --check E:/Codex/2026-10-04/task-4/network-probe/probe.cjs` 退出 0。
- 首跑 r1 的记录对象包含可变数组引用，后续事件会扩展已记录的 seen；修正为快照后 r2（PID 33216）复跑退出 0。r1/r2 启动时 TEMP/TMP 沿用调用进程，未声称全临时文件均在 E 盘。
- 新增 `network-probe/run-probe.ps1` 明确限定 TEMP/TMP/RUNNER_TEMP 并在 finally 恢复调用进程环境；其隐藏启动参数是专用 probe.cjs、`--probe-run=r3` 和专用 `--user-data-dir`。执行 `& 'E:/Codex/2026-10-04/task-4/network-probe/run-probe.ps1' -Run r3` 再次正式审批通过，shell 退出 0。
- 最终 r3 PID **19364**，native 退出 **0**，10 个记录项、errors 为空。`launcher-r3.json` 留存进程、退出码、E 盘临时目录和 userData 路径；`evidence-r3.json` 留存断言结果与真实 runtime versions。`stdout-r3.log`、`stderr-r3.log` 留存原始进程输出。
- 以上 probe RED/GREEN 仍是反例/候选 API 实验，没有批准或闭合 N1–N10 生产验收。r3 的 `disable-quic` 只用于专用进程且未证明 UDP 零流量。
