# STUN/UDP 正例诊断与资格校准计划

> 记录阶段：2026-10-05
> 文档整理：2026-10-07；历史计划及结果边界，未重新运行探针。
> 历史结论：选定自有接口的有限 UDP 对照具备资格；完整 N7 仍未验收。
> 适用边界：以上与下文均指记录阶段，不代表当前产品状态；历史 gate/HOLD 不作为当前启用判定。

## 1. 背景与范围

前一阶段 loopback STUN/UDP 正例未触达，因此受限侧零计数不能判为阻断成功。本计划只诊断自有 STUN/UDP；仅在因果证据支持时修正 QA 夹具。不重复 TURN TCP/N6，不改 OS/TUN/证书，不管理员抓包或采集其他用户流量。HTTPS SW 仅形成设施提案，不创建账户、密钥或部署。

## 2. 诊断假设与设计

H1：本机以非 loopback 源地址绑定的 UDP socket 不能触达 loopback 目标；WebRTC 使用原生接口绑定 socket。TUN 适配器存在本身不构成因果证据。

一次诊断包含 20-byte Binding 请求/响应 oracle、Node 未绑定与 WLAN 源绑定的 loopback 发送，以及相同 direct/default Chromium RTC 探针对 loopback 和实际 WLAN IPv4/IPv6 endpoint 的比较。所有原生探针均返回 RFC8489 风格 XOR-MAPPED-ADDRESS，只有 endpoint 地址变化。正例先于任何受限 guest，记录 default policy 与 `resolveProxy=DIRECT`，不抓包。

如自有接口正例成功，再作一次有证据支持的夹具修正：使用同 probe/sink/counter 加入编译后的真实 guest policy/fixed proxy 受限侧。资格必须明确排除 `result.failure`，并要求同一原生探针真实 Binding 消息，不能用 Node 正例替代。loopback 失败永久保留。

## 3. 已记录诊断与校准要求

自有接口实际收到 IPv4/IPv6 Binding 请求 6/3，srflx 为 0、host 候选各 10。自有地址服务真实返回既有地址/端口，srflx 不作为 UDP sink 校准条件；不得虚构映射地址。受限探针后再检查同一原 direct guest，以发现跨 guest 策略残留。

补充校准只重测同一 UDP 矩阵，记录实际适配器、socket 绑定地址身份/端口和探针配置，要求正例前、负例、正例后元数据一致。不新增目标或地址族、不重复 TURN TCP/N6。IP 用单进程 HMAC 等价 token 表示并丢弃密钥；旧运行未采集的字段不得追补为当时事实。

## 4. 停止条件、设施与验收限制

诊断一次，最多一次基于已证因果的夹具修正；若同一原因连续两次修正失败，应先独立诊断再继续。后续字段校准不扩大测试矩阵。禁止换公网 STUN/DNS 目标或更改路由；同探针正例不成立时，零值仍未通过。

HTTPS 设施提案比较已有自有 origin 与临时 workers.dev origin，需核验官方免费额度、最小权限、合成载荷/日志与回收办法。实际账户和域名仍未指定，不生成部署文件或服务。完整结果见[UDP 诊断报告](browser-udp-diagnostic.md)。
