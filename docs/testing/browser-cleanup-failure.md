# 首域清理失败的网络独立验收

> 证据阶段：2026-10-04
> 文档整理：2026-10-07；仅整理既有证据，未重跑测试。
> 适用边界：下述实现、通过项与 HOLD 均指记录阶段，不代表当前产品状态。

## 1. 背景与边界

验证目标是首域清理失败不跳过后域，且不得伪报成功。本阶段只增加一次性夹具和文档，不改产品、shared bootstrap/IPC、R1、renderer、CI 或真实 userData；可信 TLS/DNS 验证当时暂停，生产 gate HOLD。

两独立非 persist A/B Session 均预先有 cookie 和实际 running SW，使用 sandbox/contextIsolation/noNode/noPreload 和固定内存 scheme。首 await 前同步对所有域 deny/abort/revoke、请求 destroy。代理仅监听自有 loopback；resolver/dialer 一旦被调用就记录并 throw。没有 HTTPS/TLS sink 或证书/系统网络变更。零计数只覆盖探针及受控依赖，不是全协议抓包证明。

## 2. 注入设计与最终事实

最终 `fault-cleanup-r2` 含 4 记录。A 的 `clearStorageData` 调用适配器仅一次返回固定 marker 的 Promise.reject，由既有 await 消费；没有覆盖原生 Session 方法。B 的五步调用实际原生 API。两 proxy revoke 均 fulfilled，10 项清理中仅注入步骤失败，其余 9 项成功。

B 实际 cookie=0、running SW=[]；A cookie=1、SW 仍 running，每域最多 3 秒观察后明确失败。即使 A 观察超时，B 的原生清理已完成并再次复验。所有域继续 revoked/aborted、view destroyed、策略拒绝；Main 合成精确 proxy challenge 返回 null 只证明模块 capability 失效，不能替代真实 native login 归属。resolver/dialer/HTTP/auth challenge/certificate-error 均为 0。

`cleanupResult` 从真实 errors 聚合为 `{ok:false,code:'cleanup_failed'}`。正常 quitAllowed 未放行、willQuit=0，异常 fallback 为 app.exit(1)，native exit 1。保留注入、A worker 观察超时、禁止正常退出和 fallback 生命周期不匹配四项错误，不解释为正常退出 GREEN。

## 3. 资格判定与审查

判定器要求注入恰一次、A 唯一指定步骤失败、其余原生步骤/两 proxy 成功、B 确实清空、全域持续拒绝、预期 native 非零与未放行正常退出。额外 cleanup/proxy/query 异常、deadline 或 `FAULT_NEGATIVE_ASSERTION_FAILED` 均不算预期负例通过。wrapper exit 0 仅表示负例断言合格，不改变 native exit 1/cleanup_failed。

早期同步 throw 注入未证明异步拒绝，且 launcher 未排除额外错误，因此不作为该条款验收。独立复审的两项 Required 经上述异步注入和严格 qualifier 关闭，无新增 Critical/Required；审查未重跑 native。最终输入 SHA-256：`e593ec778206b9d465790a5d9a0e592fc0e409f0a968a30c1e1ea5a7ce3b02d9`。

原始失败、最终证据、launcher 和输入见[manifest](fixtures/browser-session-epoch/continuation/cleanup-fault-manifest.json)。语法、哈希及自有进程退出已核验；没有产品变更，未重跑整仓/type/build，也不把此前 131 或全量结果列为本阶段执行。

## 4. 后续可信 HTTPS 验收条件

1. 正常 resolver 的全部 A/AAAA 符合既有公网分类，无 198.18、私网或混合答案；默认 numeric dial 可达 443，不硬编码 IP 或改网络绕过过滤。
2. Chromium 默认信任既有有效证书链，SAN 匹配；无新增根、verify override、客户端证书、登录或持久凭据。
3. 自有 origin 的匿名 GET/HEAD 提供可控文档、SW 主脚本/import、v1/v2/v3 字节、scope/cache 响应及命中日志。
4. 合成无业务副作用路径验证已有 TLS 隧道 GET/HEAD 允许、POST 拒绝、旧 epoch 撤销；跨协议另需受控 endpoint/出口观察，不由 HTTPS 外推。

当时已有两个独立外部阻塞：测试 leaf 不受默认 Chromium 信任、正常 DNS 返回非公网 198.18。尚未证明它们是唯一阻塞；Main owner 注册、生命周期与完整拒绝路径亦未完成。

## 5. 可独立推进的模块与验收要求

当时可在 gate 关闭下进行如下模块工作，但本报告不声明它们已实施：Session/epoch 私有注册与冻结策略；`BrowserNetworkPort.prepare`/`BrowserNetworkBinding.dispose` 的默认 deny、await 后复验和失败聚合；现有 authenticated proxy 的 Main 注册对象适配；ShutdownCoordinator 浏览器参与者；精确注册内容导航路由。

现有入口分别为 `src/main/browser`、`authenticated-connect-proxy.ts::{startAuthenticatedConnectProxy,ConnectProxy,ProxyChallenge}`、`src/main/application/shutdown.ts::{ShutdownCoordinator,createShutdownCoordinator}`、`src/main/windows/external-link.ts::installGlobalNavigationGuard`。接口方案见[工作区设计](../architecture/right-agent-workspace.md)。coordinator resolve 不等于 browser cleanup 成功；未知 challenge 不发凭据，不能通过 URL 前缀或 external-browser fallback 绕过授权。真实 BrowserService/IPC、生产注册、HTTPS 放行和全出口证明必须分别验收。
