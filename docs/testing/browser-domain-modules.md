# Session/epoch 离线模块验证

> 证据阶段：2026-10-04
> 文档整理：2026-10-07；仅整理既有证据，未重跑测试。
> 适用边界：下述实现、通过项与 HOLD 均指记录阶段，不代表当前产品状态。

## 1. 背景与范围

本阶段验证 Main 私有 Session/epoch 注册域、代理适配和 network binding 编排，默认 production gate 关闭。现有 request-policy、public-network-target、CONNECT proxy 与 R2 权限行为保持；没有真实浏览器全链路或系统网络/信任改动。集成约束见[集成说明](../architecture/browser-domain-integration.md)，设计见[模块计划](../architecture/browser-domain-modules-plan.md)。

## 2. 已记录行为与责任边界

policy 输入和 gate 在构造时快照；preparing 默认 deny。native contents/Session/ID 改变即永久撤销，GET/HEAD、目标和资源限制不扩展。缺 worker request ID 只继承精确注册 Session 策略，缺 native contents 的 login 不授予凭据。

controller 同步保留 owner/browser 槽。fresh 非 persist Session 永久登记到共享 registry，包括 factory 期间取消的分配；persistent/重复 Session 在 handler 安装或数据清理前拒绝。同步 factory、异步 proxy/setProxy/连接关闭后均复验，迟到资源不能激活。上游取消 listener 使用同引用移除。

dispose 同步拒绝、revoke proxy、尝试 destroy，并分别尝试 connection/storage/cache/auth/resolver 清理。默认总预算 10000ms；native contents destroyed 与 worker=0 同时观察最多 3000ms，仍受总预算约束。任一异常/超时、未知迟到资源或迟到 proxy 回收失败永久保留 `cleanup_failed`，失败槽不释放；取消不等于清理成功。A 失败仍尝试 B，重复 dispose 复用结果。

## 3. 技术失败条件与修复验证

直接回归证明并修复迟到 proxy.revoke reject 被误报 cancelled、proxy await 后 stale owner 误报 network_unavailable、contents 未销毁却成功、取消分配未进入共享 registry 的跨 controller 复用窗口。各项保留行为失败及对应修复证据，临时 stub 不存在于最终实现。

| 最终检查 | 历史结果 |
| --- | --- |
| browser 定向 | 6 files / 195 passed，exit 0；新三模块 64 + 既有模块 131 |
| binding / retirement 回归 | 1 file / 21 passed，含原生 API 端口映射 |
| 完整普通套件 | 621 files、6254 passed / 2 skipped，6256 total；exit 0，407.49s |
| Main/preload/renderer noEmit；新增三组测试 strict config | 均 exit 0 |
| Session.fromPartition、ShutdownCoordinator 阶段、app.login 类型示例 | 临时 config 编译通过，仅编译，不表示接线运行 |
| 完整 build | storage-boundary/Main/preload/CLI/renderer exit 0；保留 >500kB 警告 |
| build 后默认关闭 gate 冒烟 | `prepare={ok:false,code:permission_denied}`；Session/view/proxy 各 0，未加载 Electron 或创建 native view |

首次全量跨越修正期间且缺 Bash fixture，为 3 failed files、11 failed / 6241 passed / 2 skipped，不能作为冻结最终状态。其中 3 项缺 `FIREFLY_TEST_BASH`，8 项未确认 Windows 子进程退出；补齐既定 fixture/正常进程权限后定向 3 files / 18 passed，再执行上述最终全量，未改断言或门槛。既有 snapshot 16558 bytes 与原内容相同，未作为变更。

独立只读审查无剩余 Critical/Required/Important。纯 mock 复核迟到 revoke 在 prepare/重复 disposeAll 均为 cleanup_failed、取消分配永久退役、第二 controller 同 Session 返回 permission_denied 且 handler/cleanup 次数不增，以及监听移除/owner 过期/destroy-worker 观察。审查不替代全量或原生验收。

## 4. 证据、验收与限制

原始字节和 SHA-256 见[fixtures](fixtures/browser-domain-modules/README.md)。类型日志无诊断不能独立证明成功，须结合对应退出码。

此阶段只验证离线模块、真实 loopback CONNECT auth 与注入原生端口。owner/private factory/login/navigation/shutdown 实际集成、真实 Session 清理生命周期、可信 Chromium TLS/公网 DNS、HTTPS worker 主脚本和跨协议出口/跨平台均未完成。该阶段 gate HOLD，系统信任/DNS 调查暂停。后续应先完成精确消费者接线，再以相应原生正负例验收；不得用离线 195 项替代外部与原生边界。
