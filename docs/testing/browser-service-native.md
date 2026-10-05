# Main BrowserService / native guest 交付证据

基线 `c98e5fd2bfa89f3b477330798d93c48a6ceb820d`，隔离 worktree `E:\Codex\2026-10-04\task-4\audit-r3-r4`，分支 `feat/browser-service-native-20261005`。仅 Main/browser 模块、相关测试及交付文档/fixture；未修改原工作区、renderer/preload/shared、H/R1 backend、CI、系统网络/证书或当前用户实例。默认生产 gate 关闭。

## 已实现与验证

- 实际 Main owner/host/topFrame/profile 注册及 ActiveChatTargetRegistry/store 消费。命令无 owner/partition/generation/gate 授权字段；私有 Main owner 指针、signal 和 epoch 在准备、导航及响应发布边界复验。
- 复用真实 Session/epoch/network controller，原生 WebContentsView 的固定安全偏好、未加载/未附着创建、只在准备完毕后导航。GET/HEAD HTTPS443、DNS 全结果公网判断、数字 IP pin、真实代理认证及 TLS 由既有下层继续执行。
- 导航/历史、错误 DTO、旧响应隔离、explicit bounds/close、取消/切换/host/退出生命周期。初始化可立即取消，永不结束的 setProxy 不阻塞取消回复；每个 context 的清理有总预算，失败不升级成功。
- 精确 native guest 导航路由保留原方法；关闭后 tombstone 继续拒绝并禁止系统浏览器 fallback。站点 login、client cert、坏证书、popup/webview/download/permissions 均走明确拒绝消费者。不能据此宣称所有原生文件选择或跨协议出口已验收。
- 现有 IPC scope、availability 注册点及 ShutdownCoordinator 消费；生产装配和 shared/preload/renderer 的最小补丁由唯一集成者采用 [集成提案](../architecture/browser-service-integration.md)。本分支不宣称这些接线已落地。

## RED / GREEN 与独立审查

原始日志在 [fixtures/browser-service-native](fixtures/browser-service-native)；manifest 列出原始字节数及 SHA-256，不对日志进行重编码。

初始 service、native adapter、精确路由、IPC、owner、context disposal、挂起准备测试各有预期 RED 与对应 GREEN。后续审查确认并修复：同文档 Back/Forward 完成、blur/hide 后延迟 layout 禁止重新挂载、负 origin 按矩形交集裁剪。审查回归分别保留 RED/GREEN；独立 fresh-context Astra medium reviewer 只读执行实际实现，最终三项均关闭，新增 availability 消费无 Important/Critical。审查不代替 native GUI 或全量验证。

定向命令：`node node_modules/vitest/vitest.mjs run src/main/browser src/main/application/ipc-contract.test.ts --configLoader runner`，E task TEMP。最终 12 files / 241 tests passed。Main/preload/renderer `tsc --noEmit`、Main/browser 测试严格类型检查以及 `npm run build` 通过；构建保留原有大 chunk warning，没有调整阈值或 CI。完整全量结果在 raw `browser-service-final-full.log`，交付结果不得只引用此前的绿色基线。

最终完整全量 exit 1：638 files，637 passed / 1 failed；6388 tests passed / 14 failed / 2 skipped（6404）。唯一失败文件是未改动的 H `native-history-presence-process.test.ts`，14 项均在硬编码 TEMP 前置条件失败，随后 afterEach 对未初始化 root 报错。本轮引入的两项 IPC 契约失败已在最终全量消除。未跳过该文件，不报告全量绿色。

## 真实 native 探针

QA fixture 的 `probe.cjs`、`preload.cjs`、`run.ps1` 及原始 evidence/launcher/stderr 一并归档。使用当前编译 Main 模块，启动隐藏且不可聚焦 Electron 43.1.0，全新 E `smoke` profile；Electron appData/userData/sessionData/logs/crashDumps 实际路径逐一验证在该隔离目录内。QA preload 仅给合成宿主提供 IPC；真实 remote guest 不含该 preload。QA 采用集成提案的精确全局导航路由；这不表示生产 consumer 已接线。

`r2` exit 0，8 项检查、0 errors、0 focus events：默认 factory gate 关闭；真实 renderer IPC 对 localhost HTTP 零 guest 分配；真实 WebContentsView 与专用非持久 Session、实际 PROXY route/代理认证；隐藏/unfocused host 的 layout 零挂载；owner switch 销毁 guest、旧 Session.fetch 得到 `net::ERR_BLOCKED_BY_CLIENT`；新 owner 得到不同 Session；显式 close 销毁；现有退出协调器清理无错误。native cookie/cache 读回为空，未伪称已对可信远程源写入并清理全套 storage。

`r1` 真实请求已走到代理认证/CONNECT，但 hidden offscreen guest capturePage 图像为空，fixture 在截图断言失败。保留该失败证据；`r2` 验证真实 hidden-host 禁止挂载和剩余生命周期，不放宽 focus/visibility 以制造截图。native 前台绘制、截图和 OS foreground/tray 行为仍未验收。

实际匿名 `https://example.com/` 请求：DNS `198.18.0.162`、公网分类 false；native `ERR_TUNNEL_CONNECTION_FAILED`，service `load_failed`。Wikipedia/GitHub 的 OS DNS 也返回 198.18.0.*，见 `browser-service-dns.json`。未注入 resolver/dialer、改 IP 分类、添加根证书、信任坏证书、代理 DIRECT fallback 或系统网络配置。

## 限制与生产启用条件

1. 集成者必须完成上述 shared/preload/renderer、host refresh、composition 和 global guard 接线。这是本分支刻意划分的内部集成工作，不是外部网络限制。
2. 本环境当前 DNS 将匿名公网域映射到策略明确拒绝的保留网段。完成真实 HTTPS 正向验收需要允许范围内的实际公网解析、可路由公网出口及正常系统信任的服务器 TLS 链；不能改策略使 198.18.0.* 通过。当前证据没有到达可信公网 TLS 成功阶段，不能据此声称 TLS 正向通过或判定本轮 TLS 失败原因。
3. 完整 N1–N10、worker/domain 撤销、跨协议出口、真实远程源 storage 清理、前台 native view 与 OS foreground/tray 仍需隔离验收。内部 service/native 实现和负向出口验证不能替代它们；生产 gate 保持关闭。
4. 基线 H `native-history-presence-process.test.ts` 硬编码 `E:\Codex\2026-10-03\task-10\h-presence-synthetic-20261004` TEMP 及该任务 native helper；本轮 E task-4 TEMP 导致该文件 14 项前置检查失败。基线 `git show c98e5fd:...` 确认原样存在。本轮不改 H/R1/backend、不写其外部 fixture、不跳过测试或改 CI；唯一集成者须独立处理其可移植性/授权。

官方 API 参考固定版本：[WebContentsView](https://github.com/electron/electron/blob/v43.1.0/docs/api/web-contents-view.md)、[WebContents](https://github.com/electron/electron/blob/v43.1.0/docs/api/web-contents.md)、[App](https://github.com/electron/electron/blob/v43.1.0/docs/api/app.md)、[Session](https://github.com/electron/electron/blob/v43.1.0/docs/api/session.md)。实际 Electron 43.1.0 / TS 5.9.3 / Vitest 4.1.11。
