# 网络模块原生请求、证书与存储验证

> 证据阶段：2026-10-04
> 文档整理：2026-10-07；仅整理既有证据，未重跑测试。
> 适用边界：下述实现、通过项与 HOLD 均指记录阶段，不代表当前产品状态。

## 1. 背景与范围

本阶段以独立 Main 测试适配器消费编译网络模块，验证 TLS 拒绝、Session 清理、关闭撤销、worker/iframe；不改产品源码或启动接线。DNS 源码修复另见[预算验证](browser-dns-budget.md)。环境为 Electron 43.1.0 / Chromium 150.0.7871.47 / Node 24.18.0，专用非 persist Session、隐藏 sandbox/contextIsolation/noNode/noPreload 窗口与独立 QA 路径。

## 2. 请求与 TLS 的技术事实

本地 resolver/dialer 把公网 pin `93.184.216.34:443` 映射到自有 HTTPS sink，remoteAddress 也为测试映射，不能称默认 OS numeric dial。OpenSSL 3.5.7 生成 SAN example.com 自签 leaf；Chromium 始终默认拒绝，不安装根、不启用 verify override。私钥不归档。

| 观察 | 结果与边界 |
| --- | --- |
| dedicated worker GET | 宿主 xhr、同 WebContentsId/frame、allowed=true，实际进入 proxy dial；不是 unknown ownership |
| worker POST | xhr/owner1、allowed=false，dial 无增长 |
| iframe XHR/form/beacon POST | xhr/subFrame/ping 均拒绝，dial 不增；仅 synthetic 数据，无出站 POST |
| worker/iframe/main GET | 自签 leaf 被 `ERR_CERT_AUTHORITY_INVALID` 拒绝，TLS 服务端 HTTP 0 |
| 宿主销毁 | 适配器同步 revoke/abort，await proxy revoke/closeAllConnections；proxy 端口不可连、TLS socket 0，迟到 fetch unknown ID/other 拒绝，无新 dial |

worker GET 是有效反例：`BrowserRequestDetails` 中 resourceType/frame/ID 不能区分页面 XHR 与已启动 worker。之后先装策略再创建新 worker，GET 与 importScripts GET 仍可拨号；预创建不是唯一原因。候选 CSP `worker-src 'none'` 原型 `csp-r3` exit 0、10 观察、errors 空，worker 新增 dial 0、普通 JS 运行，但产品源码未改，不能算方案已实施。能力取舍见[worker 边界提案](../architecture/browser-worker-boundary-proposal.md)及[证据](fixtures/browser-worker-boundary/manifest.json)。

`local-r1` 的 fail-closed 断言失败被保留；最终 `local-r3` exit 0、8 观察、errors 空而 safetyFindings=1，含同一 dedicated worker 缺口。exit 0 表示收集完成，不表示安全门槛通过。

公开 `public-r1` exit 0 但明确 unavailable：`ERR_TUNNEL_CONNECTION_FAILED`，proxy auth 有效，无证书事件。只读 OS DNS 为 example.com `198.18.1.171`，被既有 198.18/15 策略拒绝。未换路由、改 DNS 或强连该地址，不能从未到 TLS 阶段推断 TLS 失败原因。

## 3. 实际存储与 worker 补证

`memory-r1` exit 0、12 记录、errors/safetyFindings 空。进程仅注册自身 `ff-network-fixture` secure/standard 内存 scheme，固定 host/path 供合成 HTML/worker，无文件路径路由或系统协议注册；secure/allowServiceWorkers/supportFetchAPI 遵循固定 Electron API，不绕 CSP。页面/worker 在严格 HTTPS 策略安装前准备，产品策略没有 scheme 例外，resolver/dialer 无外部 DNS/TCP 能力。

实际 seed 包含 cookie 1、localStorage/sessionStorage synthetic、IndexedDB probe/items、CacheStorage probe/Response、SW 注册1/运行1、shared worker ready，`Session.storagePath=null`。CacheStorage.put 不 fetch；HTTP cache 初始 0，不能称验证非空 cache 清空。

shared/SW GET/POST 为 xhr、无 ID/frame，策略拒绝，DNS/dial 0；撤销后旧 SW GET 仍拒绝。此结果不能覆盖 dedicated worker 反例。依次 await closeAllConnections/clearStorageData/clearCache/clearAuthCache/clearHostResolverCache 后实际页面读回 localStorage/sessionStorage null、IndexedDB/CacheStorage []、SW 注册/运行0、cookie0、HTTP cache0；再销毁页面/共享 worker 宿主。

资源 dispose 后实际 app.quit，before-quit→will-quit→quit(0)，owner abort、window destroy。清理由 QA 在 quit 前主动执行，不是产品 shutdown handler 验收。

## 4. 证据与复现条件

[phase2 夹具](fixtures/browser-network-phase2/phase2.cjs)及[storage 夹具](fixtures/browser-network-phase2/storage.cjs)包含脚本和完整 JSON，不含私钥/代理凭据。它们是依赖已编译模块、专用路径及外部测试证书的历史快照，不是可直接无参数运行的通用 CI 工具。复用前须明确隔离 QA 根、编译输入和临时证书边界；不得指向生产 dist/userData。

本阶段无产品修复，因此没有产品 RED→GREEN；较早 126 单测/全量 6185 仅是历史基线。证书 handler 只记录并 callback(false)，不从 TypeError 推断每种精确证书失败或 mTLS。

## 5. 剩余验收要求

可信 HTTPS/默认 OS numeric dial、真实 HTTPS storage、非空 HTTP/auth cache、多 Session cache、持续 DB/worker 回写、cleanup failure、全部 frame/redirect/native permission 与生产 shutdown 仍未完整验证。QUIC/WebRTC 需获准出口观察，sink 零值不是全局无流量；mTLS 需可信服务器和自有 client-cert 夹具，不使用 OS 真实身份。该阶段 worker OPEN、生产 gate HOLD。

固定 API：[webRequest](https://github.com/electron/electron/blob/v43.1.0/docs/api/web-request.md)、[Session](https://github.com/electron/electron/blob/v43.1.0/docs/api/session.md)、[App](https://github.com/electron/electron/blob/v43.1.0/docs/api/app.md)、[protocol](https://github.com/electron/electron/blob/v43.1.0/docs/api/protocol.md)。webRequest 只保留最后 listener，清理 API 不能替代单一 handler 与产品生命周期接线。
