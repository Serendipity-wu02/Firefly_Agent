# Service Worker 安装更新与退出生命周期验证

> 证据阶段：2026-10-04
> 文档整理：2026-10-07；仅整理既有证据，未重跑测试。
> 适用边界：下述实现、通过项与 HOLD 均指记录阶段，不代表当前产品状态。

## 1. 背景与范围

沿用[Session 契约](../architecture/right-agent-workspace.md)，以固定内存主脚本验证 SW install/update 与 native quit；产品源码/启动接线不变，当时生产 gate HOLD。环境为 Electron 43.1.0 / Chromium 150.0.7871.47、独立非 persist Session、sandbox/contextIsolation、无 Node/preload。

## 2. TLS/DNS 与协议边界

只读诊断的 example.com OS DNS 为 `198.18.1.171`，按原策略非公网；应用未调用 TCP 连接 API。`tcpAttempts:0` 不涵盖 OS DNS 内部 TCP 或全机流量。既有 leaf 为日期有效自签证书，Chromium 明确 `ERR_CERT_AUTHORITY_INVALID`，不是过期；不安装根或改网络。

受控 resolver/dialer 将合法公网 pin 映射到自有 TLS sink；Node 使用局部 CA、rejectUnauthorized:true 建立自有 GET 隧道作关闭观察。该 Node GET 是 sink 唯一 HTTP 命中，不代表 Chromium TLS 正例。

## 3. SW 实测与技术边界

- `/update.js` 内存 v1 实际 activated，回传 version1、UUID 与安装事件结果，不只看 register resolve。
- 主脚本字节变为 v2 后 update，active version2、UUID 改变、protocol 记录 v2。每版安装事件 GET 进入无 ID/frame 的 xhr hook并新增 proxy dial1；POST 拒绝、HTTP0。
- 独立 `/install-only/` scope 安装期顶层 HTTPS import 与既有 scope 更新 v3 顶层 import 均进入 script hook，各新增 DNS/数值 dial1，hookCoverageGap=false、HTTP0，脚本求值/更新失败。
- v3 失败后实际 active 仍为 v2 原 UUID；失败返回不表示新版本可用。

这些事实证明两个 import 路径可观察和内存 v1/v2 激活，不能证明 HTTPS 主 SW install/update 成功或全面覆盖。import 无逐 URL app certificate-error，实际错误为 script evaluation failed，不能从 TypeError 推断每次精确证书错误。已安装 SW 动态 import script-map 负例与安装/更新路径分开解释。

## 4. 退出设计与最终结果

原型在 before-quit 同步 preventDefault/锁重入，首 await 前全域 ready=false/revoked/abort、触发 proxy revoke、destroy view，不等待不可信 beforeunload。每域五项清理逐项捕获，先尝试全部域，再逐域最多 3 秒观察 worker 状态；两域序列最多 6 秒，不是总退出 3 秒。超时/查询/清理失败保留 errors，正常退出不放行。放行前再次核对全域为空。

最终 `green-sw-r3`：7 记录、errors 空、native exit0；A 有界观察 34ms 后为空，B waitedMs0 只表示轮到检查已空，不表示其原生清理同步完成。beforeQuit3、cleanupRuns1、reentryBlocked1、willQuit1、quit1/code0、beforeUnloadEvents0；两域 cookie/worker 空、Node TLS client destroyed、自有 peer0。

早期原生退出失败时 cookie0/tunnel closed/peer0，但 B 即时 running snapshot 非空，走 app.exit1，不能算正常生命周期通过。`clearStorageData` resolve 不保证 Main running snapshot 同步空，ServiceWorkers 提供状态事件/查询而非本次可用 stop 方法。最终有界观察支持异步状态解释，但未证明早期内部精确时序。launcher 核验原始 errors、事件与重入，不以 exit0 单独判通过。

## 5. 证据、审查与剩余验收

独立只读审查要求原始证据 gate、全域清理后观察、退出前复验与精确 SW 版本，均满足，无新增 Critical/Required；未独立跑 native。输入 SHA-256：`8a7b32f9c918b0ed82e709a5f062fbbaf54e12ed00a3cb91cd7c00e4eb6346a9`。语法、归档哈希与自有 PID 退出已核验，产品无变更，未将历史131/全量/build算作新执行。

[原始证据](fixtures/browser-session-epoch/continuation/sw-lifecycle-manifest.json)、[诊断证据](fixtures/browser-session-epoch/continuation/diagnosis-manifest.json)保留失败与输入版本。后续[首域失败](browser-cleanup-failure.md)补充 A 异步拒绝、B 清理完成及 cleanup_failed/native exit1，不把该有限项继续写成完全未测。

可信 Chromium TLS/已有隧道 POST、HTTPS 主 SW install/update/navigation-preload、持续 late-writer、跨协议出口、生产 owner/ShutdownCoordinator、其他失败/超时和 Windows 关机/注销/崩溃/跨平台仍需独立验收。可信目标须有既有系统信任、合规 DNS 和可控脚本，不能靠新增根或硬编码公网 IP 补齐。

固定 API：[BrowserWindow](https://raw.githubusercontent.com/electron/electron/v43.1.0/docs/api/browser-window.md)、[App](https://raw.githubusercontent.com/electron/electron/v43.1.0/docs/api/app.md)、[ServiceWorkers](https://raw.githubusercontent.com/electron/electron/v43.1.0/docs/api/service-workers.md)。destroy 不发送 beforeunload，Windows 系统退出也不保证 app 事件完整。
