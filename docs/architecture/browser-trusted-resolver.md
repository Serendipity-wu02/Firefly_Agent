# 浏览器可信 DNS 解析与 Main 启动契约

- **状态**：可信 resolver 与 Main 启动选择已实现；保留有限验收边界
- **源码核对日期**：2026-10-07，仅核对实现与接线，不代表重新执行测试
- **范围**：Main 私有 DNS 选择、并发预算、撤销、数值 IP 固定及正常端到端 TLS

## 1. 背景与实现入口

`createElectronBrowserService` 接受可选 `trustedResolver: { server, port }`。工厂将 Main 输入快照化，经私有 `BrowserProxyFactory` 传入既有 Session/domain controller。browser IPC 和 renderer command parser 不接受 DNS 配置。

`src/main/browser/browser-startup-config.ts` 的 `createStartupBrowserService` 已由 `application/default-dependencies.ts` 使用。该入口只读取启动进程的 `FIREFLY_BROWSER_DNS_SERVER` 与可选 `FIREFLY_BROWSER_DNS_PORT`：

- 未选择时返回 `undefined`，保留 OS resolution。
- 明确选择数值 IP 且省略端口时使用 53。
- 非法地址或端口在创建服务前拒绝；可信代理工厂继续执行既有 unicast 基础设施校验。
- 配置被快照和冻结；不改系统 DNS、Clash/TUN、证书根、现有设置或 userData。
- DNS 选择不授予浏览权限，不改变 renderer、URL 或 IPC 授权契约。

历史 QA 明确选择了 `192.168.31.1:53`；这是一次受控验证的 DNS 目标，不是其他用户的默认值。域名查询会披露给所选 resolver，部署时需有明确的选择和相应授权。

## 2. 解析预算与失败语义

每个获准 hostname lookup 使用独立 Node `Resolver`，只配置一个数值 unicast DNS endpoint，原生 timeout 为 1000ms、tries 为 2。A 与 AAAA 并行收集，只有 `ENODATA` 表示该地址族为空；NXDOMAIN、SERVFAIL、拒绝及其他 DNS 错误使整个 lookup 失败。

每个 lookup 的 5000ms deadline 只取消自己的 channel，不取消兄弟请求。owner abort 或显式 proxy revoke 取消该 binding 的全部 channel，并阻止新查询。不存在 DNS、proxy、fake-IP 或 DIRECT 回退。

全部可信 binding 共享最多 32 个 unresolved lookup，即最多 64 个原生 A/AAAA 操作。取消或超时的 waiter 在两个原生操作实际 settle 前仍占槽，避免反复取消、重建 binding 导致未完成工作无限增长。原 CONNECT 预算保持不变。

## 3. 网络与 TLS 责任边界

DNS 基础设施地址可以是私网地址；网页目标仍须通过完整 DNS 答案的公网地址与地址族校验。混合私网、mapped、fake-IP 或不确定答案拒绝整个目标。

连接使用已核验数值 IP，并复核真实 remote peer。Chromium 保留原 hostname，经隧道执行正常端到端 TLS，不引入 TLS interception 或验证 override。

`rejectBrowserCertificate` 供 guest 与 App 共用。Electron 将同一个一次性 callback 先交 guest 再交 app listener，两层均 prevent default，但 callback 只以 false 回答一次。弱引用 callback identity 集合不保留已完成请求。该修正在历史可信路由的过期证书验证中得到检验。

## 4. 接线要求

宿主、owner 和 shutdown 接线沿用[服务接线契约](browser-service-integration.md)。Main composition 从明确选择取得 DNS 输入，不新增面向 renderer 的解析能力。

普通启动入口省略 `gateOpen`。当前服务另外存在 permission grant 路径；DNS 环境变量本身既不会开启全局 gate，也不能代替该路径的授权。不得仅根据变量存在、可信 TLS 成功或默认 gate 省略推导整个浏览器的启用状态。

## 5. 历史验收与剩余门槛

[可信 resolver 验证](../testing/browser-trusted-resolver.md)记录模块证据；[共享验证](../testing/browser-resolver-shared-integration.md)记录了受控匿名 example.com/GitHub 正常 Chromium TLS、数值 TCP 及过期证书 `ERR_CERT_DATE_INVALID`。选定 DNS 仅应用于隔离 QA 进程，该记录未重启生产实例。

成功验证普通公网传输不证明完整 worker 主脚本、全接口出口、操作系统前台或所有存储清理路径。生产启用仍需逐项核对[网络门槛](../security/browser-public-page-gate.md)，本文不解除历史 HOLD 限制。

固定 API 参考：[Node 24.19.0 DNS](https://nodejs.org/download/release/v24.19.0/docs/api/dns.html)、[Node 24.19.0 net.isIP](https://nodejs.org/download/release/v24.19.0/docs/api/net.html#netisipinput)。
