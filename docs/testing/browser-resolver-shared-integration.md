# 可信 Resolver 共享接线验证

> 记录日期：2026-10-05
> 文档整理：2026-10-07；保存历史集成结果，未重新运行。
> 历史结论：共享路径的匿名 HTTPS/UI 有限验收通过；生产 gate 仍关闭。
> 适用边界：以上与下文均指记录阶段，不代表当前产品状态；历史 gate/HOLD 不作为当前启用判定。

## 1. 背景与接线边界

Main 采用[Resolver 契约](../architecture/browser-trusted-resolver.md)中的小型启动装配。`browser-service-ipc.ts` 同时保留 shared IPC constants 与 one-time certificate refusal helper。以下事实仅适用于该阶段被验证的集成版本。

## 2. 测试与原生结果

- 完整普通套件：646 files，6526 passed / 2 existing skips，exit 0。使用原历史 fixture 要求的精确 TEMP/helper 与已核验 Git Bash。此前独立模块运行的 14 项 TEMP 失败未被豁免，此通过来自不同且明确的运行条件。
- Browser 定向回归：14 files / 287 passed。Main 官方 noEmit、隔离 emit 与 startup tests 严格类型通过。未变更的 shared/preload/renderer 沿用较早正式检查/build；原生 H 12/12 是独立既有验收，不混入普通测试。
- `r5` native exit 0：example.com/GitHub 匿名导航经选定 DNS `192.168.31.1`、数值 TCP、原 hostname Chromium 正常 TLS 成功；expired.badssl 以 `ERR_CERT_DATE_INVALID` 拒绝。未改系统 resolver/TUN/proxy/certificate 或放行 TLS。
- 实际 shared UI/preload/IPC：24 cases / 9 screenshots，覆盖 Chat/Work/Code 欢迎页与已有会话、resize、tab detach/restore、close/reopen、inspector revoke；观察到 9 个 GET，无 renderer errors。visible/focused host ports 是几何测试合成输入，真实 host focus=false、focus events=0。公网传输真实，OS foreground/tray 未认证。
- 初始公开 UI RED 是过时页面内容断言：请求已允许，无 native failure；实际 IANA 多语言页面与旧 heading 不同。保留失败，不解释为网络故障。

## 3. 扩展存储观察与失败证据

`r8` exit 0，17 cases，errors 空。`r6` 因 unloaded CDP target 观察超时；`r7` 正确报告原 origin frame 已销毁、DOMStorage 不可用，两者失败均保留。

最终读回使用原 origin 上的固定 local protocol fixture：旧 guest 全销毁且 worker=0 后，才允许新的 Main-created observer 访问。其余旧 Session 请求持续拒绝；observer 结束后恢复 deny-all 并自毁。实际观察旧 Session localStorage=0、IndexedDB=[]、CacheStorage=[]、cookie=0、cache=0、worker=0。此夹具不证明 TLS，也不恢复旧服务能力。

## 4. N1–N10 证据边界

| 门槛 | 该阶段证据 | 剩余原生缺口 |
| --- | --- | --- |
| N1 | IPC 拒绝 IPv4/IPv6 loopback、link-local、fake-IP，无额外 guest；完整答案分类回归通过 | 全 Windows 接口/bypass sink 覆盖 |
| N2 | fixed authenticated proxy 路由、native load failure、retirement 拒绝和普通 no-fallback 测试 | 跨 transport 的 proxy failure/direct fallback origin 观测 |
| N3 | 实际 native proxy auth；真实 CONNECT wrong/missing/stale/foreign credential 回归 | 完整 hostile native Session/challenge 矩阵 |
| N4 | 独立 A/AAAA、native 公网 TCP/default TLS、renderer resolver forgery 拒绝；mixed/fake/mapped/peer mismatch 回归 | native redirect/reconnect/rebinding 故障矩阵 |
| N5 | native HEAD 200；POST/PUT/DELETE/beacon/WSS 对 `.invalid` 的实际 hook 拒绝，无公网写入 | iframe/dedicated/shared/SW HTTPS 完整请求矩阵 |
| N6 | owner switch 销毁旧 guest、拒绝迟到 fetch、新 Session；精确取消/迟到资源回归 | 全部 native DNS/CONNECT/open-tunnel 时序窗口 |
| N7 | RTCPeerConnection/WebTransport 对自有 IPv4 UDP/TCP sink 无额外流量，只有 Node preflight 正例 | 缺同 native probe 合格正例；这些零计数仅是观察，IPv6/公网/全接口 QUIC/HTTP3/WebTransport/WebRTC 未闭合 |
| N8 | microphone `NotAllowedError`、notifications denied、geolocation code 1；过期证书只拒绝一次；无 Firefly preload/Node | 所有 native device/download/client-cert/site-login 拒绝路径 |
| N9 | 已 seed localStorage/IDB/CacheStorage/cookie 清空，cache/worker 0，新 owner 新 Session | 受控可信 HTTPS SW install/update/late-writer；observer 为本地夹具 |
| N10 | coordinator quiesce/dispose 后实际 before-quit/will-quit/quit 和 exit 0 | 各阶段 native cleanup failure/timeout 与系统退出变体 |

N7 的历史零计数资格已由后续[UDP 诊断](browser-udp-diagnostic.md)明确修正；不能从 Node preflight 推导 Chromium 正例合格。后续独立 TCP/UDP 证据也不得倒填为 r8 当时结果。

## 5. 证据与后续验收要求

部分原始日志及 9 张截图仅存于当时仓库外的专用证据目录，未上传或纳入版本控制。选定可复现 native 脚本、退出记录和 public UI summary 见[fixtures](fixtures/browser-resolver-shared-integration)。仓库链接不表示外部日志/截图当前可用。

生产 dist 与原有隔离候选当时保留，未执行生产 clean/build。Voice/TTS、table-prop 与 streaming/model semantic 变更为其他阶段。任何后续受控试用必须保留显式 Main DNS 选择并补齐剩余门槛，renderer/config/URL 字段不能启用生产。

外部 Codex 修正后审查未运行：请求在启动前被拒绝，未换路由或重试；需要单独明确的代码/日志发送授权。本地只读审查仅作补充，不等价于外部内置审查。
