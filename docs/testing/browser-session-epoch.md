# Session/policyEpoch 隔离原型验证

> 证据阶段：2026-10-04
> 文档整理：2026-10-07；仅整理既有证据，未重跑测试。
> 适用边界：下述实现、通过项与 HOLD 均指记录阶段，不代表当前产品状态。

## 1. 背景与边界

本阶段验证会话授权域候选契约，不默认禁止 worker，不打开生产。产品源码、原 WebContentsId 策略、proxy、DNS 预算和 R2/R3/R4 不变。相关设计见[工作区设计](../architecture/right-agent-workspace.md)及[模块计划](../architecture/browser-network-modules-plan.md)。

原型环境为 Electron 43.1.0 / Chromium 150.0.7871.47 / Node 24.18.0，独立隐藏窗口/QA profile。每域使用新非 persist Session，Main 私有 Map 按原生 Session 对象注册，epoch/hosts/methods 冻结；ready 前 deny，准备 await 后和首文档前复验 owner/abort/注册。这里的 owner 是自有窗口，不证明实际 profile/conversation/run 接线。

无 Node/preload、sandbox/contextIsolation，拒绝权限/设备/新窗口/下载。固定 `ff-epoch-fixture://fixture/`、`/shared.js`、`/sw.js` 只供应合成内容，并检查活动域/GET/资源类型；无文件路由或产品 scheme 扩权。worker 在策略安装后创建，未用 CSP 禁止。HTTPS 仍遵守 GET/HEAD、资源白名单、443/userinfo 与既有公网分类。

## 2. 鉴权与方法边界

凭据只发给活动域中精确注册 native contents、其 Session 及精确 proxy endpoint/realm/scheme；无 contents/可信 Session 的 app.login 取消，不从 PID/URL/realm 猜 owner。凭据只在 Main 内存。页面先认证后，Chromium auth cache 可被同域 worker 消费；缺 ID/frame 不触发新凭据授予，cache 失效后无法归属的新挑战仍拒绝。

公网 pin `93.184.216.34` 被夹具映射到自有 TLS sink，Chromium 自签证书始终拒绝、HTTP0，因此无可信公网成功证明。独立 Node `tls.connect({ca:测试证书,rejectUnauthorized:true,servername:'example.com'})` 只访问自有 sink；其 POST 实际抵达，证明 CONNECT 不解密且不能独立约束方法。它不能补齐 Chromium 已有 TLS 隧道的 POST 覆盖。

## 3. 最终有限结果

`green-r4`：19 记录、errors 空、native exit 0，自有剩余 peer 0。

- 同源 A/B 具有不同 SharedWorker/SW UUID，各 SW 注册1；B localStorage 初始 null，owner 值和 cookie 隔离，未覆盖所有 IDB/CacheStorage 形态。
- 未预认证 B 的真实无 contents challenge 被取消，dial0；no-cors `fulfilled` 不等于访问成功，按 dial/sink 判断。
- A 页面完成真实 proxy auth 后，dedicated/shared/SW GET 各新增1个真实数值 dial；shared/SW 无 ID/frame，无新的凭据授予。dedicated/shared importScripts 亦可拨号，HEAD 保留。三类 worker POST 与 SW 私网目标拒绝，新增 dial0。
- 不先清 B auth cache而将 B 指向 A endpoint，worker 无 contents challenge 与可信 B 页面 challenge 均拒绝，无新 dial；随后 A shared 缓存仍可新增 dial1，排除清 B 顺带清 A 掩盖问题。
- A clearAuthCache/closeAllConnections 后，无 contents SW challenge 拒绝；可信 A 页面重新认证。旧 epoch revoke/close 后存量 Node TLS client destroyed。
- 新 Session C 只冻结 example.org，A 仍为 example.com。旧 shared/SW 各有非空、新 URL、原实例匹配记录，全部 deny、旧域 dial 不增。C main-frame 经新 policy 后因正常自签拒绝失败，不是导航成功。
- C proxy 关闭后 main-frame 为 `ERR_PROXY_CONNECTION_FAILED`，resolveProxy 仍 PROXY，无新增受控 dial/sink；不证明所有协议无 DIRECT。
- D 在受控 DNS Promise 等待时撤销，再释放无晚 dial；不等于 OS DNS 可取消。

## 4. 技术失败条件、审查与证据

旧策略拒绝已注册 Session 的 shared worker 无 ID/frame GET，是新继承契约的 RED；Node POST 抵达是方法边界反例。TLS 关闭观察曾因客户端未消费响应而超时，补 `resume()` 后通过，没有降低撤销断言。

已安装 SW 动态 import 新 URL 不会必然联网：script resource map 缺项返回 NetworkError，hook/dial0。这是平台负例，不算 SW 安装/更新请求策略通过，见[ServiceWorker 规范](https://w3c.github.io/ServiceWorker/#importscripts)。早期失败缺少 result 时不追填历史。

独立审查要求缓存负例不先清 B、旧 worker 请求逐种非空且匹配旧实例；最终均实测满足，无新增 Critical/Required。最终输入 SHA-256：`f740b686fe9abff327f6579fc20678eb0485abc39cfc06c140df081a60a62b06`。审查未独立跑 native。

[manifest](fixtures/browser-session-epoch/manifest.json)保留失败/最终 JSON、launcher 与输入版本。外部 sha256 绑定原始字节，archivedSha256 绑定 Git 内 LF 副本，不混同。完整 stdout/stderr 和测试 key/cert 位于仓库外历史目录；私钥未归档。

脚本 node --check、PowerShell 解析通过；2026-10-04 19:49:12 的定向回归为 3 files / 131 passed、exit0、20.80s。仅夹具/文档变更，未重跑整仓 test/build/types。来源参考 DeepSeek Main lease 仅设计参考，未移植 runtime/code 或采用其 workspace partition 复用/存储保留策略，许可见正式设计。

## 5. 验收限制与后续阶段

缓存继承仅覆盖本机版本与有限顺序，不保证其他版本/所有 worker。可信 Chromium TLS 已有隧道方法、默认公网 dial、HTTPS 主 SW install/update/preload、持续回写、完整 frame/redirect/多平台、QUIC/WebRTC/WebTransport、mTLS 和生产 owner/shutdown 均未完整验证；当时 gate HOLD。

后续[SW/退出验证](browser-sw-lifecycle.md)提供内存 v1/v2 激活及 import 拒绝有限补证，不能倒填为本阶段已验收 HTTPS 主脚本。`tcpAttempts:0` 仅应用显式 API 计数，不表示 DNS 内部或全机抓包 TCP0。
