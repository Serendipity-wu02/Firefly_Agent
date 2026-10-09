# Main 可信 Resolver 验证

> 记录日期：2026-10-05
> 文档整理：2026-10-07；下述结果为历史记录，未当前复测。
> 历史结论：有限匿名 HTTPS 正向路径与过期证书拒绝已实测；全量存在 14 项既有环境前置条件失败，生产 gate 关闭。
> 适用边界：以上与下文均指记录阶段，不代表当前产品状态；历史 gate/HOLD 不作为当前启用判定。

## 1. 背景与范围

范围为 Main browser resolver/factory、相关测试与文档，不改 shared settings/renderer、OS DNS、Clash/TUN、R1/backend、依赖或 CI。集成契约见[Main 可信 Resolver](../architecture/browser-trusted-resolver.md)。

实现前以独立 Node 24.19.0 Resolver，仅对选定 `192.168.31.1:53` 进行探测。受限进程超时；同一只读路由在正常执行权限下成功。example.com、www.wikipedia.org、github.com 获得公网 A 与 `ENODATA` AAAA。这只证明 DNS 可达，不证明站点身份或 TLS。

## 2. 已记录行为与回归

行为 RED：第二地址族同步抛错时，第一个 native 查询尚未 settle，admission 已释放。GREEN 将每个 native 调用包为 settled Promise 并等待二者。

覆盖真实 UDP A/AAAA 完整性、ENODATA、NXDOMAIN/SERVFAIL/refusal、native timeout、owner cancel、显式 proxy revoke、binding 独立、Main config 不可变快照、非法 endpoint 配置，以及真实 authenticated TCP CONNECT 对混合私网/fake-IP/mapped AAAA 的拒绝和 zero dial。native boundary mock 特别验证延迟取消及自有 5s deadline 后，32 槽一直保留到 native 实际 settle。原 pin/peer/TLS 和权限回归保持。

renderer 伪造通过实际 service/controller 覆盖 closed gate、private URL、public URL；传入 config/functions 无法替换可信 factory。原生 QA 还经实际 renderer IPC 发送伪造配置。独立只读审查最终无 Critical/Important/Minor 实现缺陷，最初三项覆盖缺口均补齐并复核；审查不认证真实 TUN 传输或完整 N1–N10。

## 3. 原生路由、TLS 与生命周期证据

`r4` 使用编译 Main、显式可信 factory 配置和全新专用 smoke profile。Electron 43.1.0 内嵌 Node 24.18.0；CLI/测试为 Node 24.19.0。appData/userData/sessionData/logs/crashDumps 均核验在专用 QA 根目录。宿主隐藏、不可聚焦，focus events 0、attached views 0。

实际 renderer IPC → Main owner → private domain → 独立非持久 Session → native guest → authenticated CONNECT → 独立 DNS → numeric TCP → 原 hostname Chromium 默认 TLS，成功加载 `https://example.com/` 与 `https://github.com/`。同一时期 OS lookup 仍返回被拒绝的 `198.18.0.162`，可信解析得到 `104.20.23.154`、`172.66.147.243`。未替换 dialer/peer、安装根证书、绕过验证或回退系统代理。renderer 配置伪造未改变 Main 选择；私网路由器页面被拒绝。只读元数据确认 Mihomo Meta Tunnel 仍 Up、DNS `198.18.0.2`。

`https://expired.badssl.com/` 到达原生证书验证，返回 `ERR_CERT_DATE_INVALID` (-201)、service `load_failed`。首个原生 `r3` 暴露 guest 与 App 重复消费同一 one-time certificate callback；原失败及 forwarded-chain unit RED 保留。Main helper 按 callback identity 只回答 false 一次，同时保留两个拒绝边界。转发语义见[Electron 43.1.0 app.ts](https://github.com/electron/electron/blob/v43.1.0/lib/browser/api/app.ts#L103-L109)。独立审查确认修复；`r4` exit 0、9 记录、errors 空，正常 TLS 与过期拒绝均成立。

owner switch 销毁旧 guest；退役 Session.fetch 为 `ERR_BLOCKED_BY_CLIENT`；新 owner 得到新 Session，explicit close 销毁之。native cookie/cache 清理后为 0，既有 shutdown coordination 完成。QA 使用自身窄宿主 preload 和精确 routing consumer；这些事实不能替代生产 composition/settings/shared/preload/renderer 接线。

## 4. 历史验证结果

| 检查 | 结果 |
| --- | --- |
| 最终 browser + 既有 IPC 契约 | 14 files / 278 tests passed，exit 0 |
| Main、browser tests、preload、renderer 严格 TypeScript | 通过 |
| `npm run build` | storage-boundary/Main/preload/CLI/renderer 通过；保留 large-chunk 警告 |
| 冻结源码全量 | 640 files：639 passed / 1 failed；6425 tests passed / 14 failed / 2 skipped，6441 total；exit 1，384.93s |

两次较早全量仅为中间记录：第一次早于最后 public-forgery 回归，第二次跨越证书 callback RED，包含预期额外失败。最终运行单独冻结源码并核对前后 SHA-256，9 个变更 source/test 文件匹配。

唯一最终失败文件 `src/main/memory-sources/native-history-presence-process.test.ts` 硬编码外部历史 fixture 的 TEMP 和 native helper。此次专用 TEMP 不满足其精确 beforeEach 条件，afterEach 随后收到未初始化 root。未改该文件、外部 fixture、skip 或 CI，不宣称全量 GREEN。后续修订若处理可移植性，须保持该真实原生测试的语义。

使用既有 Vitest 4.1.11、TypeScript 5.9.3、专用 TEMP/TMP/RUNNER_TEMP 和已核验 `FIREFLY_TEST_BASH`。最终命令、原始字节、退出结果与 SHA-256 见[fixtures](fixtures/browser-trusted-resolver)。

## 5. 验收限制

可见截图、OS foreground/tray、跨协议出口、完整远程 storage/worker 和 N1–N10 仍未验收。匿名 HTTPS 成功不授权打开生产 gate。Electron/Node 版本、Main DNS 选择与 QA 适配边界必须随证据一起解释；本页不将 2026-10-05 结果当成当前源码状态。
