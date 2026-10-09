# N6 有限撤销矩阵与 N10 回调身份验证计划

> 记录阶段：2026-10-05
> 文档整理：2026-10-07；仅整理历史计划及结果，未重新执行。
> 历史结论：有限 E1/E2 条款获得证据；完整 N6/E3 未闭合，生产 gate 关闭。
> 适用边界：以上与下文均指记录阶段，不代表当前产品状态；历史 gate/HOLD 不作为当前启用判定。

## 1. 背景与范围

复用既有 resolver、owner 与迟到资源回归，不重复 N3/N10 故障矩阵。不改产品 gate、R1、shared/renderer、系统网络/信任、外部服务或 CI。既有 N3/N10 脚本和 manifest 保持原始证据身份，新矩阵单独归档。

## 2. 验证设计

| 边界 | 观察点 |
| --- | --- |
| P0 | 收到 CONNECT、admission 之前 |
| P1 | 自有 DNS stub 扣住真实独立 c-ares A/AAAA UDP 查询 |
| P2 | 原生答案完成、交付 proxy 校验之前 |
| P3 | 实际 socket 已连接、connect 事件向代理交付之前 |
| P5 | 探针 peer 已收到 200 |
| P6 | 活动字节已完整往返 |
| P7 | 重复 revoke，注入 close failure |

每个负例必须使用与正例相同的 raw CONNECT/nonce 探针与自有 origin counter。分别记录真实 remote peer、本地 destroy 和远端 EOF/reset；产品撤销观测结束后才能回收夹具两端 peer。撤销后新提交的 fresh nonce 不得转发；撤销前已经启动的写入可能晚到，不自动算违规。

P4 的 peer 检查、200 启动和初始 pipe 设置是源码中无 await 的同步续段。仅记录其真实顺序，不改产品或使用重入 getter 制造异步窗口。P2 不得描述为最终地址谓词之后的暂停。本矩阵不涵盖全部 OS/Chromium DNS/connect 时序。

## 3. 补充观察与验证要求

- 增加真实 native guest DNS-wait 取消/正例及独立 sibling resolver 取消。
- 地址分类和端口映射只在自有 QA 进程替换，保留 realSocket/realPeer。
- 可选 example.com 匿名 GET 使用既定 Main resolver、恢复实际分类/443 拨号与默认 TLS；缺 origin 日志不得写完整 E3。失败时保留限制，不换路由或放行证书。
- N10 仅补身份：两次真实 quit 传入可区分的回调，首个恰好执行一次、第二个不执行。
- 检查夹具语法、原生记录、相关既有测试、独立只读审查与原始字节哈希。没有产品变更且无未解失败时，不要求重复全量/build。

## 4. 已记录结果

`n6-r2`：17 记录、native exit 0；其中 14 个 raw proxy case 各有一个 revoke marker，marker 后没有禁止的启动事件。`n6-r1` 因 P0 marker 检查失败（资格 exit 1）不作整组验收，只采用独立有效的单个公开 TLS 观察。N10 不同回调身份为 first 1 / second 0。

已有定向回归 4 文件、95 通过。独立只读审查无 Critical/Important；原始分类标签的一项 Minor 保留并解释。详细证据、输入及哈希见[N6 报告](browser-native-n6.md)、[manifest](fixtures/browser-native-n6/manifest.json)。未修改产品源码，不宣称 OS resolver 取消或完整 E3。
