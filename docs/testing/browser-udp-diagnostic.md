# 自有接口 STUN/UDP 有限诊断与证据资格修正

> 记录日期：2026-10-05
> 文档整理：2026-10-07；仅整理历史记录，未重新执行探针。
> 历史结论：选定接口有限 UDP 到达对照合格；完整 N7 与可信 HTTPS SW 未验收，生产 gate 关闭。
> 适用边界：以上与下文均指记录阶段，不代表当前产品状态；历史 gate/HOLD 不作为当前启用判定。

## 1. 背景与范围

变更仅包含 QA 脚本、证据和设施提案，产品源码/CI 不变；不重复 TURN TCP 或 N6。loopback 正例未触达时，受限侧零值不能证明 UDP 阻断。本报告记录因果诊断、同探针对照及字段级资格校准。

## 2. 已观察边界与本机对照

未绑定的 Node Binding transaction 在两个地址族均触达 loopback；同一客户端绑定已分配 WLAN 源地址而目标仍为 loopback 时，均返回 `EADDRNOTAVAIL`；换为自身已分配接口目标则成功。direct/default 原生 Chromium probe 在受限 guest 创建前运行：loopback 为 0，自有 WLAN IPv4/IPv6 收到 6/3 个有效 20-byte Binding 请求并发送真实响应。

这支持本机源绑定地址与 loopback 目标不兼容的解释；不证明原生 socket 的精确绑定方式，也不证明 TUN 是原因。

| Run | PID / native exit | 记录数 | Native IPv4 | Native IPv6 |
| --- | --- | ---: | --- | --- |
| `udp-diagnosis-r1` | 4588 / 0 | 11 | loopback 0；assigned 6 | loopback 0；assigned 3 |
| `udp-own-interface-r1` | 30096 / 0 | 12 | 6 / 0 / 6 | 3 / 0 / 3 |
| `udp-calibration-r1` | 31296 / 0 | 12 | 6 / 0 / 6 | 3 / 0 / 3 |

三元组依次为 direct 正例、受限负例、原 direct guest 再次正例。各运行顶层 errors 空，原生配置/offer 无 `result.failure`。Node oracle 使用独立随机 transaction ID，不计入 native counter。

受限侧使用编译后的 `createElectronBrowserGuest`、`disable_non_proxied_udp`、真实 authenticated CONNECT proxy，以及 `createElectronBrowserSessionPort().setProxy`。控制侧为 default/DIRECT；HTTP/HTTPS 取消处理相同。结论针对组合 Session 网络策略，不区分哪个设置独立导致负例。

## 3. 运行时字段与实际接口覆盖

校准记录为物理 WLAN、interface index 15、Intel Wi-Fi 6 AX201、Native 802.11、hardware=true、virtual=false、status=Up。选定私网 IPv4 与非 link-local IPv6 均属于该接口。地址用单进程 HMAC 等价 token 表示，随机密钥丢弃，不能跨运行比较 token。

每组三次的归档 `actual.probe` 深度相等：bound address token、实际 socket port（IPv4 54416，IPv6 50014）、`dgram.bind(0,assigned-address)`、interface facts、STUN/UDP URL configuration token、一个 ICE server、data channel、default offer options、3500ms 观察预算。按规范化 IPv6 字节核对 actual bound address 与 selected address；Main 总预算 6000ms。前后使用同一 direct Session，仅负例的 policy/proxy 网络设置不同。native completion 与 launcher 均独立要求 pair 资格通过。

其他接口仅作只读清单：Mihomo/Meta Tunnel index 11 为 Up 的虚拟 IP 接口；Realtek Ethernet index 10、Wi-Fi Direct 未连接；WAN IP/IPv6/Network Monitor miniport 为 Up，其他 WAN miniport 未连接；Teredo、IP-HTTPS、6to4、kernel-debug 为 NotPresent。它们没有增加为探针目标。清单不等于抓包或全接口流量证明；未改 route/TUN/adapter/certificate/OS trust，不收集其他流量。

首次修正运行未记录 runtime address/port/configuration。源码复用与成功三元组只支持其有限到达分类，不能追认字段一致性。校准运行关闭这项元数据缺口，没有新增矩阵。

## 4. 历史零计数证据修正

原始归档保持逐字节不变；以下表格规定解释边界。

| 证据 | 正确分类 |
| --- | --- |
| `browser-bounded-acceptance/evidence-n7-r1.json` IPv4/IPv6 loopback STUN UDP | 正负均 0，原已判不合格，不能证明 UDP 阻断 |
| `browser-resolver-shared-integration/evidence-r8.json` loopback UDP/WebTransport | 计数仍为 Node preflight 的 1；没有同 native probe 正例。受限零增量仅是观察，STUN UDP/WebTransport/QUIC 未验收 |
| 同 r8 loopback TCP | Node preflight 不足以证明 native 资格；后续 n7-r1 的独立合格 TCP 证据保留其范围 |
| n7-r1 TURN TCP IPv4/IPv6 | native 正例 2/3、受限 0；有限 TCP 到达对照，不证明 TURN allocation/relay 成功 |
| `browser-native-n6/evidence-n6-r2.json` | 独立 DNS/TCP 取消 API 与真实自有 sink 正例不受影响，未重跑 |
| 更早 phase2/SW lifecycle | local protocol、cleanup、negative import 保持原限制，不升级为可信 HTTPS 主 SW 或全接口 N7 |

要求整棵进程树零 UDP 的 I1 不变量无效，因为 Main 独立 DNS 合法使用 UDP。socket polling 可能漏掉短连接，不能证明全局无流量；未实现该不变量或替代全局 scanner。

## 5. 资格判定、审查与验证

独立只读初审 Critical 0 / Important 1 / Minor 1。Important 为 pair 失败或某地址族缺失仍产生 exit-0 receipt。修正后 shared qualifier 要求两个地址族按 positive-negative-positive 排序、正例到达且响应、受限到达/响应为 0、配置/offer 成功、无异常、pair 数量匹配、实际 policy/proxy 正确，以及新验收的 runtime metadata 一致；native 和 launcher 均调用。

同一审查者确认修正及实际校准：Critical 0 / Important 0 / Minor 1；两次审查均未额外执行 native/网络。最终 manifest 由实施侧核对，不能据此宣称审查覆盖最终清单。

Minor 保留：responder 检查 header/type/magic/total length，为本次 20-byte 请求生成 XOR-MAPPED-ADDRESS；不验证任意 attribute alignment/comprehension，不是完整 RFC8489 server。控制各 10 个 host candidates、无 srflx，IPv4 gathering 未完成。到达与发送响应不证明原生响应接受、完整 ICE、公网可达或普遍 zero candidates。

| 历史检查 | 结果 |
| --- | --- |
| codec | 3 passed |
| qualification 首次 | 4 passed / 1 failed，改变 port 被错误接受 |
| qualification 修正后 | 5 passed |
| 最终 archived-data codec + qualification | 8 passed |
| 既有 guest 回归 | 1 file / 7 passed |
| 移除 IPv6 记录的负例 CLI | 必须 exit 1，已验证 |
| calibration qualification | exit 0，`runtimeMetadataVerified:true`、`fullN7:false` |
| CJS 与 PowerShell launcher | 语法检查通过 |

本阶段仅 QA/文档变更，未重跑完整产品 test/type/build。较早 288 browser tests/type/build 成功及 14 项继承 TEMP/history 全量失败仍为历史结果。

`inputs-diagnosis-r1.cjs` 为诊断后重建，较首次修正快照仅多出诊断模式未执行的 fix-only qualification expression；`inputs-own-interface-r1.cjs` 在运行后、资格 gate 变更前捕获，二者没有 prelaunch hash receipt。`inputs-calibration-r1.cjs` 与 `inputs-udp-calibration-r1.json` 在校准前捕获，包含实际 compiled inputs 和 adapter facts。manifest 绑定当前归档字节，不补造更早 receipt。

## 6. 剩余验收与设施要求

只有选定接口、有限窗口的 native STUN/UDP 到达对照合格。完整 N7/QUIC/WebTransport、全接口捕获和可信 HTTPS SW 主脚本 install/update/preload 均未验收，生产 gate 保持关闭。

[自有 HTTPS 设施提案](../architecture/browser-trusted-https-fixture-proposal.md)比较已有 origin 与临时 Cloudflare Worker、条件式免费额度、合成载荷、完整日志与回收。实际账户、域名、直接部署授权仍未知；没有创建 Cloudflare login/account/key/Worker、部署文件、外部写入或 origin 探测。原始数据及资格材料见[manifest](fixtures/browser-udp-diagnostic/manifest.json)。
