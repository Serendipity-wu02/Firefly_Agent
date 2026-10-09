# Main BrowserService 与原生 Guest 验证

> 证据阶段：2026-10-05
> 文档整理：2026-10-07；仅整理既有证据，未重跑测试。
> 适用边界：下述实现、通过项与 HOLD 均指记录阶段，不代表当前产品状态。

## 1. 背景与范围

该阶段实现 Main/browser 模块、相关测试和 QA fixture，不改 renderer/preload/shared、H/R1 backend、CI、系统网络/证书或真实用户实例，生产 gate 默认关闭。生产装配方案见[集成提案](../architecture/browser-service-integration.md)。

## 2. 实现事实与责任边界

- Main 精确 owner/host/topFrame/profile 注册，消费 ActiveChatTargetRegistry/store；命令无 owner/partition/generation/gate 授权字段，私有 owner pointer/signal/epoch 在准备、导航、发布响应边界复验。
- 复用 Session/epoch/network controller；WebContentsView 固定安全偏好，创建时不加载/附着，准备完成后导航。GET/HEAD HTTPS443、全 DNS 公网判断、numeric pin、proxy auth/TLS 由下层执行。
- 导航/历史、错误 DTO、旧响应隔离、bounds/close、取消/切换/host/退出生命周期；初始化可立即取消，永不完成 setProxy 不阻塞取消回复。context 清理有总预算，失败不提升为成功。
- 精确 guest 导航保留方法，退役 tombstone 持续拒绝并禁止 external-browser fallback；site login/client cert/bad cert/popup/webview/download/permissions 有明确拒绝消费者，但不代表所有原生文件选择或跨协议已验收。
- 使用既有 IPC scope、availability 与 ShutdownCoordinator 接口；当时完整 shared/preload/renderer/production composition 尚属独立集成事项。

## 3. 技术反例与最终验证

直接回归与审查修复同文档 Back/Forward 完成、blur/hide 后迟到 layout 重新挂载、负 origin bounds 未按矩形交集裁剪。独立只读复核关闭三项，无 Critical/Important；不等于 GUI 验收。

| 检查 | 历史结果 |
| --- | --- |
| browser + IPC 契约定向 | 12 files / 241 passed |
| Main/preload/renderer noEmit、browser tests strict types | 通过 |
| `npm run build` | 通过，保留 large-chunk warning |
| 最终完整套件 | 638 files：637 passed / 1 failed；6388 passed / 14 failed / 2 skipped，6404 total；exit1 |

唯一失败文件为未改的 `src/main/memory-sources/native-history-presence-process.test.ts`，硬编码外部历史 fixture TEMP/native helper。此次 QA TEMP 不匹配，14 项在 beforeEach 失败，afterEach 因 root 未初始化再报错。两项新增 IPC 契约失败已消除；未跳过 H 测试或改 CI，不宣称全量 GREEN。后续若处理 fixture 可移植性，须保持真实原生验收要求。

## 4. 真实原生观察

Electron 43.1.0 隐藏、不可聚焦宿主，全新 smoke profile；appData/userData/sessionData/logs/crashDumps 均核验在 QA 根。QA preload 只用于合成 host IPC，真实 remote guest 无该 preload；QA routing consumer 不表示生产已装配。

最终 `r2` exit0、8 检查、errors0/focus0：默认 gate 关闭；renderer localhost HTTP IPC 零 guest 分配；真实 WebContentsView/专用非持久 Session/PROXY route/auth；hidden/unfocused layout 零挂载；owner switch 销毁 guest，旧 Session.fetch=`ERR_BLOCKED_BY_CLIENT`；新 owner 新 Session；explicit close 和 coordinator 清理完成，native cookie/cache 读回空。不把初始空状态说成完整远程 storage 清理。

早期 hidden offscreen guest capturePage 为空，截图断言失败；最终验证隐藏宿主禁止挂载与生命周期，没有放宽 focus/visibility 制造截图。前台绘制、OS foreground/tray 仍未验收。

匿名 example.com 的 OS DNS 为 `198.18.0.162`、分类 false，native `ERR_TUNNEL_CONNECTION_FAILED`、service `load_failed`；Wikipedia/GitHub 同为 198.18.0.*。未注入 resolver/dialer、改分类/信任或 DIRECT fallback。请求未到可信 TLS 成功阶段，不能判定该次 TLS 正向或精确失败原因。

## 5. 验收条件与证据

当时仍需完整共享接线、允许范围内的真实公网 DNS/TCP/default TLS、N1–N10、worker/domain revoke、跨协议、真实 storage、native foreground/tray；内部模块通过不等于产品可浏览。

原始字节、输入、失败及 manifest 见[fixtures](fixtures/browser-service-native)。版本为 Electron 43.1.0、TS 5.9.3、Vitest 4.1.11；固定 API：[WebContentsView](https://github.com/electron/electron/blob/v43.1.0/docs/api/web-contents-view.md)、[WebContents](https://github.com/electron/electron/blob/v43.1.0/docs/api/web-contents.md)、[App](https://github.com/electron/electron/blob/v43.1.0/docs/api/app.md)、[Session](https://github.com/electron/electron/blob/v43.1.0/docs/api/session.md)。后续[共享接线验证](browser-service-shared-integration.md)是不同阶段证据，不倒填为本次结果。
