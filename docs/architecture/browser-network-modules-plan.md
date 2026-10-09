# 匿名浏览器网络模块与 Session 授权域实施方案

- **记录日期**：2026-10-04
- **状态**：独立网络模块、Session/epoch 原型及有限清理实验已完成；保留历史证明范围
- **范围**：代理鉴权、公网 IP 固定、Chromium 请求策略、撤销和隔离原型
- **验收依据**：[网络门槛 N1–N10](../security/browser-public-page-gate.md)

## 1. 背景与职责划分

远端网页与本机代理请求均不可信。只有 Main 私有适配器能创建网络模块并提供 resolver/dialer；renderer 或模型参数不能直接构造 Main 身份。

CONNECT 代理负责鉴权、完整 DNS 答案校验、数值 IP 固定及隧道撤销，不解密 TLS，也不能单独证明 GET/HEAD 或真实宿主归属。Chromium 请求策略负责可观察 HTTP 方法、资源及目标限制；Main 负责 Session/owner 的可信注册。

历史环境为 Node 24.19.0、Electron 43.1.0。该阶段没有新增依赖或检查标准，也未接入共享 bootstrap/IPC/bridge 或生产 BrowserService。

## 2. 已实现网络模块

### 2.1 公网目标分类

`src/main/browser/public-network-target.ts` 提供 `isPublicNetworkAddress(address)` 和 `parseConnectAuthority(authority)`。使用 Node BlockList 保守分类 IPv4、IPv6、mapped、zone 和特殊网段，拒绝非法 authority 及非 443 端口。规则有意拒绝部分全球可达特殊用途地址，不承诺全部网站可用。

### 2.2 Chromium 请求策略

`src/main/browser/browser-request-policy.ts` 提供 `createBrowserRequestPolicy(webContentsId, signal)`，返回 `allows(details)/revoke()`。初始版本限制 HTTPS GET/HEAD、资源白名单、精确登记的 WebContentsId，关闭后拒绝。

这一旧策略的 worker 身份局限由后续 Session/epoch 路线处理；不能把旧“缺 ID 即拒绝”当作所有现行授权域的契约。单元测试能证明策略分支，不能替代 Chromium 全入口覆盖。

### 2.3 鉴权 CONNECT 代理

`src/main/browser/authenticated-connect-proxy.ts` 提供 `startAuthenticatedConnectProxy({ webContentsId, signal }, dependencies?)`：

- 仅绑定 127.0.0.1 随机端口，随机 Basic 凭据只存在于 Main 内存。
- 精确筛选 proxy challenge，CONNECT-only，并限制 header、连接及准备时间。
- 一次解析收集全部 A/AAAA；混合、未知、失败或非全球单播答案全部拒绝。
- 只连接已核验数值 IP，并复核 `remoteAddress`；不存在 DIRECT 回退。
- 撤销后不建立或发布新 tunnel，迟到 socket 与已建立 tunnel 均销毁。
- 错误或过期 token 不触发 DNS/dial，resolver/dialer 注入不成为生产 localhost 例外。

真实本机 raw TCP fixture 证明了协议状态与字节转发；受控 dialer 仅将已审数值参数映射到合成 sink，产品默认 resolver/dialer 继续使用 Node API。

<a id="会话授权域已授权的隔离原型续接计划"></a>

## 3. Session 授权域的历史原型

依据[会话授权域契约](right-agent-workspace.md#2026-10-04-会话授权域验证契约)，候选采用独立 Session、不可变 policyEpoch 和统一出口，默认不禁用 worker。

原型 `session-epoch.cjs` 与隐藏 launcher 位于独立 QA 设施。固定内存 secure scheme 仅返回合成 HTML/worker 脚本，不增加产品 scheme 权限。域适配器只在 fixture 中实现；受控 resolver/dialer 映射到本机 TLS 负例，保留 Chromium 默认的证书拒绝。

验收设计包括：

1. 旧策略 RED：shared/SW GET 因缺 ID/frame 受阻；Node 对本机测试证书严格验证后，TLS POST 可穿过 CONNECT 到达合成 sink，证明代理不能限制 TLS 内方法。
2. 同源双 Session 的实际 worker 实例、SW 注册/状态、cookie/localStorage 隔离及 GET/HEAD、资源、目标限制。
3. 页面认证后 worker GET/importScripts 的 Session proxy cache 继承；未认证或清 auth cache 后的无归属 challenge 必须取消。
4. 新 Session 误配旧 proxy endpoint、旧 epoch worker、跨权限导航、capability 隔离与延迟 DNS/存量 tunnel 撤销。
5. proxy 失效不 DIRECT，旧 policy 不变且旧请求不获新权限；可信 Chromium TLS 不足时保留未验证，不用自签放行替代。

原型最终 19 条记录、`errors=[]`，独立审查两项 Required 已关闭，无新增 Critical/Required；定向 3 个文件、131 passed。完整 RED、失败、输入版本及哈希见[Session/epoch 证据](../testing/browser-session-epoch.md)。此阶段只增加文档与一次性 fixture，未启动生产接线。

后续 [SW 生命周期实验](../testing/browser-sw-lifecycle.md)覆盖内存主脚本 v1/v2 实际激活、安装/更新 HTTPS import hook 和失败 v3 保留 v2；正常原生退出最终 7 条记录、`errors=[]`。清理后的即时 running 快照并不保证为空，须维持 deny 并有界观察。[首域清理失败实验](../testing/browser-cleanup-failure.md)证明 A 的 Promise 拒绝不跳过 B，保留 `cleanup_failed` 与 native exit 1，不报告清理成功。

## 4. 历史模块验收

- 初始三模块取得实际 RED 后完成 GREEN：126/126。readonly binding 回归还发现并修复了可变输入身份问题。
- Electron 43 原生 proxy login、renderer POST 与 revoke 探针 r2 退出 0。
- 独立六文件审查发现半开拒绝连接占槽的 Important 问题；真实 RED/GREEN 回归后关闭，未留未处理 Important。
- 当阶段原 runner 全量为 6185 passed、0 failed、2 skipped；Main/preload/renderer/测试严格类型及完整 build 均 exit 0。首轮 RED 与 native 超时保留。

详细结果见[网络模块证据](../testing/browser-network-modules.md)。这些是历史运行结果，本次文档整理未执行产品测试或构建。

## 5. 后续变更与验收边界

Session 生产模块由[授权域实施方案](browser-domain-modules-plan.md)续接，真实服务由[BrowserService 接线](browser-service-integration.md)续接。不得把原型接口复制为第二套权限来源。

初始模块阶段尚缺真实 TLS/mTLS 与证书拒绝、全部 frame/worker/SW 请求、Chromium 真实鉴权、QUIC/WebRTC UDP/TCP 旁路、Session 全存储清理与 shutdown 接线。后续可信 DNS/TLS 等证据已单独记录，但 N1–N10 的完整安全放行不能由上述普通测试或本地 TCP 结果推导。

参考：[Node 24.19 net](https://nodejs.org/download/release/v24.19.0/docs/api/net.html)、[Node HTTP CONNECT](https://nodejs.org/docs/latest-v24.x/api/http.html#event-connect)、[Node 24.19 crypto](https://nodejs.org/download/release/v24.19.0/docs/api/crypto.html)、[IANA IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry)、[IANA IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry)。HTTP 资料为 latest 24.x，不能称作固定版本源码；具体行为须结合实际类型和实测。
