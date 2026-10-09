# DNS 实际未完成解析预算验证

> 证据阶段：2026-10-04
> 文档整理：2026-10-07；仅整理既有证据，未重跑测试。
> 适用边界：下述实现、通过项与 HOLD 均指记录阶段，不代表当前产品状态。

## 1. 背景与缺陷条件

既有每 binding 32 个准备槽在等待者取消、10 秒超时或 revoke 后释放，但 OS lookup 仍可能运行，重复认证 CONNECT 可累积实际未完成 DNS。独立审查将此列为 Important；本阶段仅修改既有代理与相关回归，不改变生产 gate 或共享接线。

## 2. 生命周期与责任边界

- 保留每 binding 32 个准备槽，新增该 Main 模块实例共享的 32 个实际未完成 DNS 额度，无等待队列；认证与 authority 检查仍先于解析。
- resolver 调用前同步占额度，只在同步 throw 或解析 Promise 真正 fulfilled/rejected 时释放一次。等待者 abort、TCP close、10 秒 deadline、revoke、factory 重开均不释放。
- 满额时认证 CONNECT 返回 503，不调用 resolver/dialer。数值 literal 不占 DNS 额度，但仍受准备/连接上限、地址分类和取消检查。
- revoke 同步失效 credentials、停止新能力、abort 等待并拆除 socket；其 Promise 只保证 listener/socket 撤销，不代表 OS DNS 停止或预算归零。
- 撤销后的解析实际 settle 只归还额度，active/signal/client 检查禁止迟到拨号。永不 settle 最多占 32 槽，后续 DNS 持续 503，直到完成或进程退出；这是保守可用性代价。
- 预算是模块实例级，多个进程/模块副本各自计数；Main 装配应保证单实例，factory 不向 renderer 开放。Node lookup 与 `Resolver.cancel` 不是同一 API，不能将后者当作 lookup 取消证明。

## 3. 技术反例与最终验证

真实 127.0.0.1 CONNECT/echo 加受控 pending resolver 验证实际未结束调用数。普通 peer FIN 未必触发服务端 close，不能作为取消复现；改用真实 `resetAndDestroy` 后，100 次取消曾累积 100 个 unresolved，跨 binding 和真实 timeout 亦越过预算。修复后的结果如下。

| 场景 | 结果 |
| --- | --- |
| 100 个认证 CONNECT 真实 RST | unresolved 32、503 为 68、峰值 32、origin/dial 0 |
| revoke 后 pending | 保持 32；settle 后归 0，late dial 0 |
| 满额旧 binding revoke 后重建 | 新请求 503；一个旧解析 reject 后新请求 200，真实 echo 命中 1；其余旧 settle 无旧 dial |
| 31 个 RST + 1 个实际 10 秒 timeout | 仍占 32，下一请求 503 |
| 同步 throw / Promise reject | 各 40 次 403，随后正常 binding 200，无额度泄漏 |

三模块最终 131/131、exit 0、20.92s；独立只读审查另跑 131/131、20.99s，diff check 通过，无 Critical/Important。唯一 Minor 是注释 `process-wide` 超出真实模块范围，已改为 `this Main module's budget`，行为未变。

六 source/test 文件严格类型、renderer/schema 与完整 build 均 exit 0。既有完整 runner：618 files、6190 passed / 0 failed / 2 skipped，6192 total、exit 0、383.38s；使用专用 TEMP、核验 Bash 与正常进程权限，未调整门槛。两个 skip 为真实 Windows 8.3 alias 不可用和 file-symlink 权限 1314。Vite >500kB 警告保留。

## 4. 原生补证与限制

build 后 `local-r3` native exit 0、8 观察、errors 空，但 dedicated worker GET finding 仍为 1；证书拒绝、POST 拒绝与关闭撤销无回归。`memory-r1` native exit 0、12 观察、errors 空，见[第二阶段证据](browser-network-phase2.md)。这些结果不关闭 worker 门槛。

回归只证明受控 resolver 的记账边界，不证明真实 OS DNS 可取消、公网默认 numeric dial、worker 隔离或生产 shutdown。该阶段生产 gate HOLD。外部 Node 24.19 runner 的 TCP/timeout 与 Electron 内嵌 Node 24.18 不混称同一运行环境。原始日志为仓库外阶段证据；本页不列临时执行目录或逐轮日志。

API 依据：[Node 24.19 DNS lookup](https://nodejs.org/download/release/v24.19.0/docs/api/dns.html#dnspromiseslookuphostname-options)。后续验收应维持实际 settlement 计账，不能用取消等待或恢复可用性为理由提前丢弃计数。
