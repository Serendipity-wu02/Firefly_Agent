# 受限浏览器有限可用性验收

> 证据阶段：2026-10-05
> 文档整理：2026-10-07；仅整理既有证据，未重跑测试。
> 适用边界：下述实现、通过项与 HOLD 均指记录阶段，不代表当前产品状态。

## 1. 背景与范围

本阶段只新增验收夹具/记录，不改产品、SW策略、生产gate或共享接线。不重复N6的17项或已验证两站，不启动常驻viewer、部署服务或改OS/TUN/证书/驱动。

复用先前 `browser-resolver-shared-integration/evidence-r5.json`：example.com/GitHub经Main DNS192.168.31.1、numeric TCP、原hostname默认Chromium TLS成功，过期站拒绝`ERR_CERT_DATE_INVALID`。既有public UI summary为24项/9截图、errors空，覆盖三种模式欢迎/已有会话、native内容、布局/resize/close/reopen/revoke。公网真实，visible/focused host授权为QA合成，OS foreground/tray未验收。复用不算本阶段再次访问或新预览，也不放行生产。

## 2. N7 同原生探针对照

`n7-r1` native exit0、8记录、errors空。IPv4/IPv6各STUN UDP/TURN TCP，共四组同sink/counter和完全相同RTCPeerConnection/createDataChannel/createOffer/setLocalDescription探针。控制为QA direct/default；受限为编译真实`createElectronBrowserGuest`固定偏好、`disable_non_proxied_udp`、authenticated proxy与Session port fixed proxy组合。

只加载固定data文档，HTTP/HTTPS请求拒绝，未走完整BrowserService导航授权。没有公网RTC目标、remote preload/Node、全接口抓包或证书放行。

| 对照 | 控制真实sink | 受限增量 | 资格 |
| --- | --- | --- | --- |
| IPv4 TURN TCP | accept2、STUN magic2 | accept0/message0 | 有限E2成立 |
| IPv6 TURN TCP | accept3、STUN magic3 | accept0/message0 | 有限E2成立 |
| IPv4 STUN UDP | datagram0 | datagram0 | 正例未触达，不通过 |
| IPv6 STUN UDP | datagram0 | datagram0 | 正例未触达，不通过 |

TCP sink只计连接/消息，不实现relay、auth或data channel；STUN magic仅证明格式字节到达，原事件`owned-TURN-allocation-message`不表示Allocate成功。无proxy-auth事件，不能归因到鉴权或某个内部检查；组合设置未分离因果。

JS观察3500ms、Main总预算6000ms，不是全时段/全出口零证明。控制各10个host候选、受限本次0，保留gathering/error；不能从policy或本次0宣称通用zero ICE。UDP可bind127.0.0.1/::1但Chromium正例未到，不判定IPv6不支持，不改路由或换公网目标。

E1为QA控制适配，E2为真实Chromium/loopback。8项仅两组TCP正例合格，不是N7全通过，无完整E3。

## 3. 剩余验收与设施条件

| 条款 | 该阶段边界 |
| --- | --- |
| IPv6/N7 | 有限TURN TCP已补；STUN UDP正例未到，后续[UDP诊断](browser-udp-diagnostic.md)单独校准，不倒填历史 |
| 公网/全接口 | 普通TLS不等于RTC/QUIC/HTTP3旁路证明，缺获准出口观察/受控服务 |
| QUIC/WebTransport | 既有IPv4 bounded sink仅观察，无可信HTTP3/WebTransport同probe正例 |
| HTTPS worker | main HEAD成功、POST/PUT/DELETE/beacon/WSS拒绝及local-protocol观察保留；iframe/dedicated/shared/SW完整可信HTTPS矩阵未完成 |
| HTTPS SW/N9 | 缺既有信任、合规DNS、可控SW脚本的自有origin，主脚本install/update/navigation-preload/late-writer未验收 |
| local-protocol SW | v1/v2激活和清理、observer存储清空有有限证据；HTTPS import HTTP0负例不是HTTPS主脚本成功 |
| N10系统生命周期 | app.quit/coordinator身份及故障证据保留；OS注销/关机/崩溃未测 |

当时SW保留政策不变，生产gate关闭；“缺设施”不转换为“通过”。

## 4. 验证结果与证据限制

脚本语法、原生launcher、只读`verify-evidence.cjs`资格及已有electron-browser-guest/browser-network-binding回归2 files/29 passed/exit0。产品无变更，未重跑全量/type/build，较早14项TEMP失败未豁免。

独立只读审查无Critical/Important，重新核算TCP2/3与UDP不合格。保留Minor：pair/checker尚未明确排除`result.failure`；本次8项经检查确无此字段，不能保证未来异常例合格。manifest在审查后补齐并核对，不声称独立审查覆盖最终清单。原始输入/JSON/记录与SHA-256见[manifest](fixtures/browser-bounded-acceptance/manifest.json)。

固定API：[Electron 43.1 WebContents](https://raw.githubusercontent.com/electron/electron/v43.1.0/docs/api/web-contents.md)、[WebRTC规范](https://www.w3.org/TR/webrtc/)。API只规定控制方式，验收取实际计数。
