# 公共网页浏览器网络安全门槛

- **初始证据日期**：2026-10-04
- **状态**：N1–N10 验收契约及历史证据汇总；尚无完整跨协议出口放行证明
- **范围**：匿名公共 HTTPS、可信 Main Session 域、代理与请求策略、权限及撤销清理
- **结论**：单独 setProxy、地址栏校验、状态机或内存 Session 均不能证明“只访问公网”。

## 1. 背景与状态解释

本门槛源于[右侧工作区设计](../architecture/right-agent-workspace.md)。2026-10-04 初始探针仅调查隐式直连、请求 hook 和 Session 残留；随后实现 Main-only CONNECT、请求策略与 Session/epoch 模块，再接入 BrowserService 和共享入口。

历史阶段的 production gate HOLD 表示该阶段未取得整体放行依据，不能直接复制为所有当前功能关闭的结论。当前源码另有 manual/agent permission grant 路径；本文不评价其完整启用状态，也不因功能已经存在而解除尚未完成的安全证明。

[网络模块证据](../testing/browser-network-modules.md)、[Session 契约](../architecture/right-agent-workspace.md#2026-10-04-会话授权域验证契约)、[共享服务验证](../testing/browser-service-shared-integration.md)、[可信 DNS 共享验证](../testing/browser-resolver-shared-integration.md)依次补充了原始证据。普通测试、合成 native fixture、真实公网成功与全接口出口证明必须分别陈述，不能相互替代。

## 2. 已核验 API 与证明边界

初始实验运行版本为 Electron 43.1.0、Chromium 150.0.7871.47、embedded Node 24.18.0。以下 Electron 资料固定到 v43.1.0：

| 边界 | API 事实 | 证明责任 |
| --- | --- | --- |
| 代理 | `ProxyConfig` 有 fixed_servers/proxyRules/proxyBypassRules，允许显式 `direct://` | 单一固定代理，无 PAC/system/自动发现/DIRECT；空 bypass 不取消隐式绕过。[ProxyConfig](https://github.com/electron/electron/blob/v43.1.0/docs/api/structures/proxy-config.md) |
| 方法与资源 | onBeforeRequest 提供 method/url/resourceType，每类事件仅最后一个 listener 生效 | 专用 Session 只有一个受控请求注册点；CONNECT 不限制 TLS 内方法。[WebRequest](https://github.com/electron/electron/blob/v43.1.0/docs/api/web-request.md) |
| WebRTC | `disable_non_proxied_udp` 属于 WebContents policy，仍可涉及 TCP 或支持的代理 UDP | 不是 Session 总出口开关；禁止媒体权限不证明 DataChannel 不联网。[WebContents](https://github.com/electron/electron/blob/v43.1.0/docs/api/web-contents.md#contentssetwebrtciphandlingpolicypolicy) |
| 权限与清理 | Session 有 check/request 双 handler，以及 connections/storage/cache/auth/resolver 清理和 clearData | 两 handler 均拒绝，其他设备路径独立验收；setProxy 不清已有连接，关闭页面不清 Session。[Session](https://github.com/electron/electron/blob/v43.1.0/docs/api/session.md) |
| 证书与登录 | app/WebContents 有 certificate-error、select-client-certificate、login；未拦 client certificate 可能默认选证书 | 受控 guest 拒绝 client certificate 和站点鉴权，仅精确活动 binding 的代理挑战可获凭据。[App](https://github.com/electron/electron/blob/v43.1.0/docs/api/app.md#event-select-client-certificate) |

当时公开类型未包含 `destroySession` 或 Session 级 QUIC 禁用方法，探针也观察到 `ses.destroySession` 为 undefined；该结论只覆盖检查过的公开 API，不推断 Chromium 内部不存在相关能力。

Chromium [Proxy support](https://chromium.googlesource.com/chromium/src/+/main/net/docs/proxy.md)描述 localhost/loopback/link-local 隐式绕过、`<-loopback>`、CONNECT 端到端 TLS 和显式 DIRECT 回退。该来源为 main，当时未取得 150.0.7871.47 的对应正文，不能称固定版本源码证据；本机实验只补证了 loopback 与单代理失效，未覆盖全部平台特殊名称。

[Electron 43 command-line switches](https://github.com/electron/electron/blob/v43.1.0/docs/api/command-line-switches.md)说明 switch 在 ready 前设置，但当时未找到 `disable-quic` 的文档。专用探针使用该候选 switch 未同时取得抓包证明，不得据此声称按 Session 禁用 QUIC或向产品宿主注入全局开关。QUIC 与 WebRTC 是不同出口责任。

## 3. 网络控制契约

### 3.1 Session 身份与请求入口

在任何网页加载前准备新 Session，partition 由 Main 唯一生成，绑定 runtime profile/conversation/browser 与私有 owner generation。不得复用 defaultSession、生产 profile 或旧浏览 partition，renderer DTO 不能构造 authority。

可信归属来自 Main 注册的 Session 对象与闭包。页面、iframe 和 worker 继承同域政策；缺 WebContentsId/frame 不直接授予权限，也不能用其缺失替代 Session 归属判断。未知、未注册、已撤销或不匹配域一律拒绝。

### 3.2 固定代理与认证

配置单一固定代理，`proxyBypassRules: '<-loopback>'`，无 DIRECT/PAC/system/自动发现。HTTPS、HTTP、WebSocket 和代理失败分别建立实际 origin/proxy 计数，`resolveProxy` 仅为诊断。代理不可用返回真实错误，不重试直连或回退系统浏览器。

loopback 绑定与随机端口不构成认证。每 binding 使用 Main 内存中的独立随机凭据；无/错/旧 token 或外来 Session 不得建立上游 socket，凭据不进入 URL、renderer、工具结果、日志或持久化。仅精确端点、realm、scheme、原生 contents/Session、owner 和 epoch 同时匹配才响应代理 challenge；站点鉴权和未知归属 challenge 取消。不用不支持所需鉴权的 SOCKS 路径冒充该边界。

### 3.3 DNS 与实际 socket

每次 CONNECT 校验规范 authority，只允许指定 HTTPS 端口，拒绝 userinfo、非法编码/语法和非公网 IP 字面量。收集所有 A/AAAA，分类 IPv4/IPv6 及 mapped 等等价形式；混合、公私不明或解析失败拒绝整个目标。

连接只使用已审数值 IP，不再次按 hostname 解析，并复核 remoteAddress。重连与新 CONNECT 重新授权和分类。重绑定测试用注入 resolver/dialer 与合成 sink，不真实访问元数据地址或局域网服务。

### 3.4 方法与 TLS

TLS 保持浏览器到目标的端到端验证，不解密、不安装系统 CA，不接受错误证书。原 hostname 保留用于 SNI 与证书验证。

GET/HEAD 由 Chromium onBeforeRequest 对所有可观察资源限制，覆盖子 frame、redirect、fetch/XHR、form、beacon、dedicated/shared/service worker 及其脚本。非 HTTPS、非白名单方法、WebSocket 等双向通道默认拒绝，不能只检查导航。每次异步结束和副作用前复验 generation/abort。

只准 GET/HEAD 不证明语义无副作用：GET 也可能触发服务端写入或发送查询数据，匿名内存页面仍可能收到 cookie。若要求语义无写入，需要另行明确更严格站点/资源政策或静态模式，不能把普通交互页称为绝对只读。

### 3.5 HTTP 以外出口

预连接、DNS prefetch、QUIC/HTTP3、WebTransport、WebRTC UDP、STUN 和 TURN TCP 均须独立验证。专用进程或受约束 egress 可作为待评估方案，但须明确对宿主的影响和实际授权。仅 Session API、loopback proxy 或 WebRTC policy 字符串不能证明全部出口受限。

## 4. 权限与清理契约

permission check/request 均拒绝。设备、显示捕获、popup、下载、外部 scheme、上传文件选择器、client certificate 和站点 login 分别覆盖，不能以双 handler 代替。错误证书不接受，不使用统一 `callback(0)` 或 ignore-certificate-errors；额外 verify proc 也须保留默认验证，缓存纳入撤销/重开考虑。

Main 的幂等关闭顺序为：同步使 owner/binding 失效并持续 deny → 中止 DNS/授权等待并销毁代理 tunnel → 隐藏、stop、关闭 WebContents，不等待不可信 beforeunload，并确认 destroyed → await closeAllConnections → 分别清理 storage/cache/auth/hostResolver。需要 backgroundFetch 等更广状态时先评估 clearData 并追加实测。

先撤销生产者再清状态，避免清理后迟到写回。stop 只停止导航，清 storage 不等于关闭连接，closeAllConnections 也不阻止后来新请求；deny 保持到清理结束。撤销前已发送字节无法收回，证据应说明拒绝新 connect 与断开现存 tunnel 的具体边界，不能承诺原子“零后续字节”。

`ShutdownCoordinator` 的已有 phase 包括 quiesce、stopProducers、stopActiveWork、stopExternalConsumers、stopExternalProviders、stopLocalResources、flushPersistence。同 phase 并行、单项失败继续、总超时中止等待；不能依赖注册顺序。失败/超时保留 `cleanup_failed`，最终退出不是清理成功证据。重开使用新 partition，旧 binding 不恢复；强杀不承诺即时清零。

## 5. 初始隔离实验的有限结论

2026-10-04 的隐藏 Electron fixture 使用独立 profile、sandbox/contextIsolation、无 Node/preload；仅绑定 127.0.0.1，无远程站点、真实凭据或上游转发。local HTTP/direct 仅作反例，不是产品允许项。最终探针 exit 0，10 条记录、errors 为空，脚本语法检查通过。

| 实验 | 观察结果 | 有效结论 |
| --- | --- | --- |
| 空 bypass | DIRECT，origin 1、proxy 0 | loopback 默认可绕代理 |
| `<-loopback>` | PROXY，origin 无新增 | 该 IPv4 fixture 已转代理 |
| session.fetch POST | `ERR_BLOCKED_BY_CLIENT`，CONNECT 0 | 此入口可在 CONNECT 前拒绝 POST |
| HTTPS GET | 收到 CONNECT，返回合成 403 | 可见 authority，未完成 TLS |
| 单代理失败 | `ERR_PROXY_CONNECTION_FAILED`，origin 无新增 | 此 HTTP fixture 未 DIRECT 回退 |
| 权限/WebRTC | Notification denied，policy 读回一致 | 一项权限与配置值已观察，非全出口证明 |
| 同步撤销 | 新 fetch 拒绝，origin 无新增 | 新请求 deny，未证明全部在途竞态 |
| 页面关闭与显式清理 | 关闭后 cookie 仍 1；清理后 cookie 0 | 关闭不清 Session，清理 API 对该 cookie 有效 |

原探针的记录数组引用问题已改为不可变快照。反例被正确观察时进程可 exit 0，这不等同产品安全实现由 RED 转 GREEN。该阶段未运行产品 build、typecheck 或全量测试，不能据 native smoke 宣称产品可用。

## 6. N1–N10 验收矩阵

以下保留完整验收目标，并以各阶段证据区分有限进展与剩余条件；不得把“已有证据”列解读为整体通过。

| 编号 | 必须证明的结果 | 已有有限证据 | 剩余关键条件 |
| --- | --- | --- | --- |
| N1 | IPv4/IPv6、特殊名称及保留地址不能绕代理，目标 socket 0 | loopback 探针、实际 IPC 拒绝及完整答案分类回归 | 全 Windows interface/特殊名称/bypass sink 覆盖 |
| N2 | 代理退出、端口拒绝或协议失败均无 DIRECT/系统浏览器回退 | 本机 HTTP 失败、固定代理和原生失败/撤销路径 | 全 transport 的真实 origin 失败计数 |
| N3 | 无/错/旧/外来凭据 dial 0，只有精确活动 binding 可认证 | 原生 proxy authentication、真实 CONNECT 凭据回归 | 完整 hostile Session/challenge 矩阵 |
| N4 | 全答案分类、已审数值 dial、peer 复核阻止重绑定 | A/AAAA resolver、真实公网 TCP/TLS、mixed/fake/mapped 与伪造输入回归 | 全原生 redirect/reconnect/rebinding 故障矩阵 |
| N5 | 每种入口不安全方法 origin 0，GET/HEAD 同路径正例成功 | session.fetch POST、native HEAD、保留域名上的写方法/beacon/WSS hook | 完整可信 HTTPS iframe/dedicated/shared/SW 矩阵 |
| N6 | DNS/CONNECT/tunnel 撤销后不新 dial、不 publish，旧 tunnel 终止 | 精确取消/迟到资源回归，实际 owner 切换与新 Session | 全原生在途时序窗口 |
| N7 | QUIC/HTTP3/WebTransport/WebRTC UDP/STUN/TURN TCP 无旁路 | 有限本机 sink 与 RTC/transport 对照 | 有效 UDP 正例、IPv6/公网/全接口 packet 证据；局部零计数不是全出口证明 |
| N8 | 设备、捕获、上传/下载、client cert、站点 login、错误证书全拒绝 | 若干原生权限拒绝、过期证书 one-shot refusal、无 preload/Node | 全原生权限与选择器路径 |
| N9 | 所有目标存储/worker/auth 清理、迟到写入受限、新 partition、失败真实可见 | cookie/localStorage/IDB/CacheStorage 清理及 worker/cache 观察 | 可信 HTTPS SW 安装/更新/晚 writer；本地 observer 不证明该生命周期 |
| N10 | revoke-first，其他清理不被首失败跳过，超时/失败可见 | coordinator 接线、正常原生退出及首域失败负例 | 每阶段 native cleanup failure/timeout 和平台退出变体 |

可信 DNS 共享阶段记录真实 example.com/GitHub 正常 hostname Chromium TLS 与过期证书拒绝，修正了早期“尚无公网 TLS 正例”的历史缺口。其存储 readback 使用受控本地 observer，不能改称 HTTPS SW 完整生命周期证明。[共享证据](../testing/browser-resolver-shared-integration.md)

后续[有限验收](../testing/browser-bounded-acceptance.md)中的 IPv4/IPv6 TURN TCP 同 probe 对照有效；UDP STUN 对照未触达，零计数不计通过。不同阶段 probe 的对照资格不能互相替换，不能从预检 socket 或 policy 字符串推导 Chromium UDP 已受控。

## 7. 后续变更与验收要求

先补齐每项真实正负对照和目标端计数，再判断对应门槛；mock 只能证明分支和竞态，不能证明 Chromium 未使用另一网络栈。N5/N9 可采用[受控 HTTPS 设施方案](../architecture/browser-trusted-https-fixture-proposal.md)，部署和数据发送须先满足明确的授权范围。

任何新 egress 架构、全局 switch、站点白名单或静态模式都需要明确产品取舍与独立验收。网络准备或验证失败保持受阻和真实错误，不减少方法、公网分类、认证或撤销要求。历史 HOLD 及剩余限制在本次文档整理中不解除；本次未改变运行时、重新执行探针或补造测试结果。
