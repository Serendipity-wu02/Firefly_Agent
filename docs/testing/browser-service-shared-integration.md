# 手动浏览器共享接线与历史数据清理验证

> 记录日期：2026-10-05
> 文档整理：2026-10-07；历史证据整理，未执行当前复测。
> 历史结论：共享接线与有限清理修复有验证记录；生产 gate 保持关闭。
> 适用边界：以上与下文均指记录阶段，不代表当前产品状态；历史 gate/HOLD 不作为当前启用判定。

## 1. 浏览器接线事实与责任边界

该阶段手动浏览器连接 shared IPC/preload、Main chat host lifecycle 与右侧 inspector。生产 BrowserService 构造不传 `gateOpen`，默认关闭。命令只携带地址、Main 生成的 browser ID、历史操作和 viewport bounds；actor/profile/top-frame/owner 授权保持 Main 私有。

Chat shell 在 renderer load 前注册精确宿主；active session set/clear 同步刷新私有 binding。精确 managed native guest 在全局 external-link guard 之前路由，退役 guest 持续拒绝且无外部浏览器回退。renderer 精确订阅/取消 DTO listener，拒绝 foreign/older/closed-page 更新；关闭 pending open 和旧 Session，detach inactive tab，在 focus/resize 后重新提交几何信息。欢迎页不伪造 conversation。

## 2. 浏览器历史验证

| 检查 | 结果与边界 |
| --- | --- |
| navigation routing、renderer lifecycle RED/GREEN | 定向 21 files / 319 passed；preload/screenshot 6 files / 34 passed |
| 普通全量 | 640 files、6417 passed / 2 existing skips、exit 0；使用核验 Bash 与历史 H fixture 精确 TEMP，未改 H 断言或 skip |
| 类型与构建 | Main/preload/renderer noEmit 通过；隔离 Main/preload/Vite build 通过；保留既有 Vite size warning |
| no-desktop-prewarm QA | 14 张普通 UI 截图/25 cases；9 张 synthetic native 截图/24 cases，覆盖三种欢迎/已有会话模式 |
| 原生视图几何 | local exact HTTPS Session protocol fixture、合成 trusted host-state；真实 focus=false/0 events；viewport 由 Main clamp，tab/close/collapse 释放正常 |
| 只读代码审查 | Codex CLI 0.155.0 / gpt-5.5 实际执行；唯一 P2 为过时的 status-only preload 测试，3-method surface、closed availability、payload、精确 unsubscribe 回归及全量随后通过 |
| screenshot helper | release/staged 二进制各 647168 bytes，SHA-256 一致；native protocol/geometry/display/request contracts 29 passed |
| GDI smoke | 受限执行先有 2 capture cases 失败；正常进程权限下全部 5 通过；未改桌面设置或保存/导出屏幕图像 |

二进制 SHA-256：`4eb9fbf628aee7052659cc7b708268f284280e669630d983d85916013badf297`。

上述普通套件不等于 native history zero-write 验收；synthetic native QA 不认证公网或 OS foreground。广泛 GUI/clipboard/foreground smoke 未执行。SMH 整合前的生产 dist 与 12 个受保护 source hashes 保持不变。

`launch-ui-candidate.ps1` 为仓库外证据目录中的历史启动脚本，使用隔离编译输出和全新专用 profile，无 OS activation/screenshot prewarm，不覆盖生产 dist、已有输入或真实数据。该引用不表示脚本已入仓库或当前可直接运行。

## 3. Dormant native-history 清理修复

SMH core 整合没有启用生产 provider。两项已复现失效问题获修复：captured-head cleanup reject 不再提前返回而遗漏 pending endpoint factories/operations；一个 captured head reject 不再阻止后续 head 清理。两个 barrier 均等待每个精确参与者 settle 后才报告失败，只有成功清理的精确 capture 被移除。

稳定入口 `npm run test:memory-history-zero-write -- --configLoader runner` 通过 `vitest.memory-history-zero-write.config.ts` 仅选择显式 native acceptance 文件。普通配置和质量设置不变；Main 编译排除 acceptance-only fixtures。

## 4. SMH 历史验证与保留证据

- 两项清理行为分别获得直接失败证据，修复后为 26 provider tests 通过，含扣住 second-head cleanup 与实际 Worker 拒绝旧 ref 为 `MEMORY_CONTEXT_TRANSCRIPT_PENDING`。
- 修正后完整普通套件：643 files、6470 passed / 2 existing skips、exit 0，替代同阶段较早 643-file/6469-pass 结果。
- 独立原生验收：12/12 real-helper acceptance、exit 0，使用精确 debug/release helper 与合成 NTFS root；与普通回归分开解释。
- 类型与构建退出记录：官方 Main noEmit 与隔离 Main build 均 exit 0。未变更 preload/renderer/CLI 和 storage boundary 沿用此前验证，生产 dist 未覆盖。
- 保留性检查：所有受保护路径符合既定 core 基线，包括既定 native history parser 变更；7 个生产 dist 文件、4 个 streaming shared 文件、4 个 helper 二进制保持，既有隔离候选未变。

本页原始日志和退出记录存于当时仓库外专用证据目录，不表示已提交附件。实际 native Codex review 发现 later-head cleanup P2，复现与修正均保留。外部修正后复审因代码/测试/日志发送缺少明确目的地授权而在启动前被拒绝，没有重试或替代远程审查；本地只读审查只作补充，不能宣称外部修正后审查通过。

## 5. 剩余验收与限制

该阶段仍待 app-specific 可信 DNS 与真实公网 HTTPS、完整 OS foreground/egress/storage，以及 SMH streaming/hybrid/model 语义整合。后续事实分别在[可信 Resolver 共享验证](browser-resolver-shared-integration.md)等记录，不倒填为本次执行。

不从合成夹具或普通全量结果推导生产可用。生产 gate 保持关闭；模型下载/清理、系统网络变更和生产重启不属于本页验收。
