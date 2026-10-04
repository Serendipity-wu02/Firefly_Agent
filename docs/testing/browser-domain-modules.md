# Session/epoch 离线生产模块验证

基准 `27dd8667934ce3b859a3d9bd66c137d5902d745a`；隔离分支 `feat/right-agent-workspace`，工作树 `E:\Codex\2026-10-04\task-4\audit-r3-r4`。本轮默认 production gate 关闭，无真实浏览器、共享接线或系统网络/信任改动。后续接线约束见[集成说明](../architecture/browser-domain-integration.md)，执行记录见[实施计划](../architecture/browser-domain-modules-plan.md)。

沿用现有已批准 Session/epoch 契约及接续计划，使用可用的 Superpowers TDD/debugging/verification 与独立审查流程。仓库 `.agents/skills/vendor/firefly-skills/skills` 不存在，未声称使用该 vendor 技能；没有安装新依赖或重做原型。云技能所述辅助脚本未作为本地可执行文件提供，进度以本计划、实际工具结果和 Git 记录保存。

## 实际实现与 RED/GREEN

三组测试先写，临时行为 stub 的 RED 留档，再替换为实现；最终没有 stub。现有 request-policy、public-network-target、CONNECT 代理/R2 权限均未改。

| 证据 | 实际结果 | 覆盖 |
| --- | --- | --- |
| domain-red.log | exit1，32 failed / 7 passed | Main 私有 owner/native Session、冻结 epoch、请求及撤销状态 |
| proxy-red.log | exit1，3 failed / 1 passed | 准备认证拒绝、真实 CONNECT challenge、迟到代理 |
| binding-red.log | exit1，14 failed / 1 passed | prepare/dispose 编排及取消、清理失败/超时 |
| domain-proxy-green.log | exit0，81 passed / 3 files | 注册域及代理适配与原策略回归 |
| late-proxy-red.log | exit1，预期 cleanup_failed 却收到 cancelled | 独立审查 Required：迟到 proxy.revoke rejection 丢失 |
| owner-mismatch-red.log | exit1，预期 owner_mismatch 却收到 network_unavailable | proxy await 后 stale owner 语义 |
| view-quiescence-red.log | exit1，原生 contents 未销毁却返回成功 | 同时有界观察 view 销毁及 worker=0 |
| registry-retirement-red.log | exit1，取消分配未进入共享 registry | 独立审查 Required：跨 controller 复用窗口 |
| binding-retirement-green.log | exit0，21 passed / 1 file | 所有 controller 回归、native API 端口映射 |
| browser-domain-targeted-frozen.log | exit0，195 passed / 6 files | 三个新模块 64 项 + 原 browser 模块 131 项 |

父取消 listener 的同引用移除回归也已覆盖。policy 输入与 gate 构造快照； preparing 默认 deny；原生 contents/Session/ID 变化永久撤销；GET/HEAD 与目标/资源限制不扩大。缺 worker request ID 只继承注册 Session 的请求策略，缺 native contents 的 login 仍不认证。

controller 同步保留 owner/browser 槽。非 persist fresh Session 被共享 registry 永久记录，包含 factory 期间取消的分配；persistent/重复 Session 在 handler 或数据清理前拒绝。每同步 factory、异步 proxy/setProxy/连接关闭后重新检查，晚资源不激活。

dispose 同步拒绝、撤销代理、尝试 destroy；连接/storage/cache/auth/resolver 分别尝试。默认总预算 10000ms，实际 native contents 销毁与 worker=0 同时观察最多 3000ms且受总预算约束。每项异常或超时、未知迟到资源、迟到代理回收异常均永久 cleanup_failed；不释放失败槽，不把取消当清理成功；A失败仍尝试B。重复 dispose 复用结果。

## 全量、类型与 build

冻结后的最终全量 exit0：621 files 全部通过，6254 passed / 2 skipped（6256 total），407.49s。保留现有两个 skip。命令使用现有 Vitest 配置，不新增/调整门禁：

```powershell
$env:TEMP='E:\Codex\2026-10-04\task-4\tmp'
$env:TMP=$env:TEMP
$env:RUNNER_TEMP=$env:TEMP
$env:FIREFLY_TEST_BASH='E:\Git\bin\bash.exe'
node node_modules/vitest/vitest.mjs run --configLoader runner
node node_modules/typescript/bin/tsc -p tsconfig.main.json --noEmit
node node_modules/typescript/bin/tsc -p tsconfig.preload.json --noEmit
node node_modules/typescript/bin/tsc -p tsconfig.renderer.json --noEmit
npm run build
```

Main/preload/renderer noEmit 均 exit0，新增三组测试另用 strict 临时 config 单独类型检查 exit0。真实 Electron Session.fromPartition 类型调用、实际 ShutdownCoordinator 阶段以及 native app.login 的 Main 示例也经临时 config noEmit 验证 exit0；只有编译，没有执行这些接线。临时 config 没进入源码或 CI。

完整 npm build exit0，包含 storage-boundary、Main、preload、CLI 和 renderer。删除 dist 前核对解析绝对路径在本隔离 worktree 内，且不是 junction。保留现有 Vite 大于500kB chunk 警告；未调整阈值/CI或依赖。

另直接加载 build 后的两个 Main JS 模块执行默认关闭 gate 冒烟，exit0：prepare={ok:false,code:permission_denied}，Session/view/proxy 调用各为0；未加载Electron runtime或创建原生视图。原始输出为browser-domain-built-gate-smoke.log。

首次全量在限制沙箱且未设置 Bash fixture 下得到 3 failed files、11 failed / 6241 passed / 2 skipped；这次运行跨越审查修正，不作为冻结版本的最终结果。三项报精确缺失 FIREFLY_TEST_BASH，八项进程生命周期断言未确认测试子进程退出。核对实际 Git Bash 路径和代码 taskkill 链，再通过正式工具审批在原生进程权限下定向重验：3 files / 18 passed、exit0。未改测试或产品代码来绕过这些错误。最终全量使用同一已确认 fixture 和进程权限。首次失败日志也保留。

全量测试触碰现有 built-in-tools snapshot 的mtime；逐字节比较16558 bytes等于HEAD，无内容差异，仅刷新隔离 index记录，未提交该文件。原工作区只读核对，没有写入。

## 独立审查

`session_epoch_security_review` 对最新未提交三模块与测试作独立只读审查，基准为上面的HEAD；没有修改文件或运行 native/TLS/DNS。其纯 mock 当前源码复核 exit0：迟到代理 revoke rejection 在 prepare 和重复 disposeAll 均 cleanup_failed；取消分配在 registry 永久退役；第二 controller 同 Session 返回 permission_denied且 handler/cleanup 次数不变。监听移除、owner过期及真实destroy/worker状态观察均复核存在。最终没有剩余 Critical / Required / Important 阻塞；没有把审查等同全量测试/build。

## 证据与限制

原始日志及 SHA256 清单在 [fixtures/browser-domain-modules/](fixtures/browser-domain-modules/README.md) 随提交保存；正文记录退出码，空类型日志代表实际命令无诊断，不单独推断成功。

只验证离线生产模块、真实 loopback CONNECT 认证分支及注入原生端口。没有新建实际 Electron 浏览器/native全链路测试，没有可信 Chrome TLS/公网 DNS 正向证据、真实 HTTPS worker 主脚本成功证据或所有跨协议出口保障。owner/private factory/login/导航/shutdown 的实际集成、真实 Session 清理生命周期及其他平台均未验证。系统信任/DNS依赖调查维持暂停，不安装根证书、不另建外部服务。生产 gate HOLD。本轮无R1、原生backend、renderer、真实userData、记忆或CI门禁变更；没有推送/PR/合并/部署。
