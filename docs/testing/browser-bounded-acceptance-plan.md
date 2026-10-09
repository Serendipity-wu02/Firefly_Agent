# 受限浏览器有限验收计划与结果边界

> 记录阶段：2026-10-05
> 文档整理：2026-10-07；仅整理既有记录，未重新执行测试。
> 历史结论：有限 TCP 正负对照成立；UDP 正例未触达，生产 gate 保持关闭。
> 适用边界：以上与下文均指记录阶段，不代表当前产品状态；历史 gate/HOLD 不作为当前启用判定。

## 1. 背景与范围

本计划针对 N6 后的可用性与 N7 有限验收，不新增产品能力。复用既有 N6 的 17 项记录、两站 HTTPS 可用性及 UI 证据，不重复计数。产品源码、SW 保留策略和生产 gate 不变。

## 2. 验证设计

1. 对自有 IPv4/IPv6 loopback STUN UDP 与 TURN TCP sink 各执行一组正负对照，共四组。
2. 每组使用同一 Chromium RTCPeerConnection 探针、sink 和 counter。先运行 direct/default-policy 控制，再运行编译后的真实 guest 固定偏好、`disable_non_proxied_udp` 与 authenticated fixed proxy 组合。
3. 控制侧必须实际触达 sink；正例不成立时，受限侧零计数不得判为通过。候选数量按事件记录，不能从策略字符串推断 zero ICE。
4. 观察预算只覆盖有限窗口，不证明全时段、全出口无流量。正例适配仅存在于匿名 QA 进程，不部署服务器、不使用公网 RTC 目标、不改 OS 路由或证书信任、不抓取全机流量。
5. N5/N9 的可信 HTTPS 主 SW 安装、更新、navigation-preload 和 late-writer 需要已受信任、DNS 合规且可控制脚本的自有 origin。该设施当时缺失；已有进程内协议证据不得重标为 TLS 验收。

## 3. 已记录结果

- `n7-r1`：native exit 0，8 条记录；IPv4/IPv6 TURN TCP 控制分别抵达 2/3 个 STUN-magic 消息，受限侧计数均为 0。
- 两组 UDP 控制均为 0，因此不具备合格正例；按四组边界停止，没有扩展目标或延长为无界等待。
- 既有 guest/session 回归：2 文件、29 测试通过。
- 独立只读审查未发现 Critical/Important。保留一项 Minor：未来资格判定应明确排除 `result.failure`；本次 8 项实际均无该字段。
- 最终 manifest 已补齐并核对原始字节；审查时清单尚未生成，不能宣称独立审查覆盖最终清单。

## 4. 验收与限制

语法检查、原生资格判定、相关回归、原始记录和哈希是该阶段交付条件。没有产品变更，因此没有产品 RED/GREEN，也没有重新运行全量/type/build。四组 endpoint 是本计划的有限观察范围；完整 N7、E3 及生产启用均未闭合。

完整结果及证据：[有限验收报告](browser-bounded-acceptance.md)、[manifest](fixtures/browser-bounded-acceptance/manifest.json)。后续 UDP 资格修正见[UDP 诊断](browser-udp-diagnostic.md)。
