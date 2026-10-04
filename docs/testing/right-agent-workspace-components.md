# 右侧工作区独立组件交付

日期：2026-10-04。隔离树 `E:\Codex\2026-10-04\task-4\audit-r3-r4`，分支 `feat/right-agent-workspace`，基线 `50cc50be3d6e51c616c41ba5d2b6e86dd7b626aa`。旧 R3/R4 交付 `5bd8b920fd6da88f32fbdad622bddf92d2a9ec28` 保持在旧分支，不重做或覆盖。本阶段依据父明确批准的独立组件子集，不修改任何既有共享/UI/S owner 文件。

## 已交付内容与父接线约定

- `browser-page-state.ts`：五个纯函数、conversation/browser/request 三重匹配、关闭后无新请求、迟到/重复终态忽略、`blocked | load_failed`。详见[状态阶段证据](./right-agent-workspace-state.md)。
- `browser-workspace-reducer.ts`：只组合状态函数与地址草稿；导航完成期间继续编辑的地址不被覆盖，失败保留最后提交页，关闭后编辑/导航无效。不启动任务，不触发网络。
- `BrowserWorkspacePanel.tsx/.css`：受控 toolbar；required `page/address/labels` 与 `onAddressChange/onNavigate/onCommand/onClose`。命令仅 `back | forward | reload`；提交 trim 后的非空地址。optional `viewportRef` 提供有名称的 region 占位 DOM，关闭后解绑并移除 children。没有 window bridge、URL 打开、异步任务或权限逻辑。父应提供稳定 ref，并独立处理 DOM 测量、隐藏/缩放/可信弹窗及 Main bounds 验证。
- `WorkspaceSourcesPanel.tsx/.css`：本地展示 DTO `WorkspaceSourcePresentation`，包括 id/toolLabel/outcome 和 file_read/file_change/web_search 的 display 字符串。所有候选显示“来源待确认”；支持 success/failure/unknown/not_executed，但 outcome 不认证 canonical 提交。无链接、自动打开/读取、HTML 注入或事实写入。调用者须从真实已审查结构化结果生成、脱敏 display；组件的 HTML escaping 不等于 URL/路径敏感数据脱敏。此 DTO 未成为共享 metadata 契约。

父负责共享 IPC/preload/Inspector/Main/工具结果接线与未来 canonical 来源提交：`tool_end` 当前早于 await appendToolResult，不能用它宣称持久化完成。纯组件没有解锁 BrowserService、R1 文件读取或代理操作。文件/Diff、rename/pin 仍消费父冻结的既有接口。

## 文案 key 提案（由父协调 UI owner）

所有文案都是 required labels；本分支不修改翻译资源。下面 key 仅拟新增名称，不声称仓库已有。

| 拟定 key | labels 字段 | 中文 | English |
|---|---|---|---|
| workspace.browser.panel | panel | 网页工作区 | Browser workspace |
| workspace.browser.address | address | 网页地址 | Page address |
| workspace.browser.go | go | 前往 | Go |
| workspace.browser.back | back | 后退 | Back |
| workspace.browser.forward | forward | 前进 | Forward |
| workspace.browser.reload | reload | 刷新 | Reload |
| workspace.browser.close | close | 关闭网页 | Close page |
| workspace.browser.loading | loading | 正在加载网页 | Loading page |
| workspace.browser.blocked | blocked | 此网页已被阻止 | This page was blocked |
| workspace.browser.loadFailed | loadFailed | 网页加载失败 | Page failed to load |
| workspace.browser.closed | closed | 网页已关闭 | Page closed |
| workspace.browser.viewport | viewport | 网页区域 | Page viewport |
| workspace.browser.empty | empty | 输入公开网页地址 | Enter a public page address |
| workspace.sources.panel | panel | 来源 | Sources |
| workspace.sources.empty | empty | 暂无结构化来源 | No structured sources |
| workspace.sources.pending | pending | 来源待确认 | Sources pending confirmation |
| workspace.sources.success | success | 工具成功 | Tool succeeded |
| workspace.sources.failure | failure | 工具失败 | Tool failed |
| workspace.sources.unknown | unknown | 结果未知 | Outcome unknown |
| workspace.sources.notExecuted | notExecuted | 未执行 | Not executed |
| workspace.sources.fileRead | fileRead | 读取文件 | File read |
| workspace.sources.fileChange | fileChange | 文件变更 | File change |
| workspace.sources.webSearch | webSearch | 网页检索 | Web search |

## RED/GREEN 与审查

日志根目录：`E:\Codex\2026-10-04\task-4`。共享产品 node_modules junction 未复制/安装；TEMP/TMP/RUNNER_TEMP 指向本任务 tmp。

| 检查 | 实际结果 | 日志 |
|---|---|---|
| 新组件/reducer 尚未实现 | exit 1，3 suites failed、0 断言；仅模块缺失 RED | right-workspace-components-red.log |
| 首次组件/reducer GREEN | exit 0，3 files / 30 tests | right-workspace-components-green.log |
| 审查补充 region/ref 回归，修复前 | exit 1，15 用例、13 pass / 2 fail；其中 region 是实际产品缺陷，ref 的额外参数是测试期望错误 | right-workspace-viewport-red.log |
| 补 region、将解绑断言限定为 ref 的第一个参数 | exit 0，4 files / 49 tests（状态17、reducer9、toolbar15、来源8） | right-workspace-components-final-green.log |

独立审查针对新组件/reducer八个文件及既有纯状态模块，未发现 blocking/important findings；审查者先复跑当时 47 个工作区用例通过。可访问性 region 与 ref 解绑两项建议已按实际 RED/GREEN 补齐，随后独立复核极小增量与交接文档，无 blocking/important，并另执行 49/49（exit 0）。React 回调的额外参数不属于本组件契约，不据测试期望错误更改产品 ref 生命周期。

| 本轮最终检查 | 实际结果 | 日志 |
|---|---|---|
| npm run check:renderer | exit 0 | right-workspace-renderer-types-final.log |
| npm run check:plugin-schema | exit 0 | right-workspace-plugin-schema-final.log |
| 全部新模块及测试独立严格类型（含 TSX/CSS types） | exit 0 | right-workspace-module-types-final.log |
| npm run build | exit 0；storage boundary、Main/preload/CLI/renderer均完成，既有 >500kB chunk 警告保留 | right-workspace-full-build.log |
| 正式 native 权限复验既有 shell-job 真实进程 | exit 0，13/13；未改测试/产品源码 | right-workspace-shell-job-native-recheck.log |
| 首轮受限全量 | exit 1，612 files pass / 3 fail；6048 pass / 11 fail / 2 skip，共6061 | right-workspace-full-tests.log |
| 正式全量复验（现有 runner + 已核验 Git Bash fixture） | exit 0，615 files pass；6059 pass / 0 fail / 2 skip，共6061，383.35s | right-workspace-full-tests-native-final.log |

首轮失败分类：8 个 shell-job 的 Windows taskkill 清理用例报进程仍存活；另3个真实 Bash 集成用例因未设置仓库要求的 `FIREFLY_TEST_BASH`。正式审批后的 shell-job 同测试13/13通过，且此前报告的 fixture PID 已不在。通过 `Get-Command git` 的实际 `E:\Git\cmd\git.exe` 定位并核验 `E:\Git\bin\bash.exe`（Bash5.3.15），复验仅补现有环境变量与正式进程权限，不改产品/测试。该首轮记录保留，不说成初次全量通过，不调整超时或门禁，不用父其它整合分支结果代替。正式完整复验已退出0，6059 pass / 0 fail / 2 skip。

本轮受测代码提交为 `cc000b5c78578dde238922db115dc28cfe8d4244`。复验命令为设置上述 `TEMP/TMP/RUNNER_TEMP/FIREFLY_TEST_BASH` 后执行 `& .\scripts\ci\run-vitest.ps1`；没有 TestFiles 参数或排除用例。两次 runner 写回既有 snapshot 的 LF/CRLF 表示，`git diff` 内容为空；确认由本轮生成后仅恢复该文件，不纳入交付。后续提交仅补此验证记录，不变更代码，不需据文档修改重复全套测试。

两项 skip 保留实际限制：runtime-profile 的真实 Windows8.3 alias 用例因当前临时路径不含短名而按既有条件跳过；plugin-panel-protocol 的文件 symlink 逃逸用例因 native 创建明确返回 ERROR_PRIVILEGE_NOT_HELD(1314) 跳过。未替换成 mock/junction，未改变这些测试或相关目录边界实现。

失败尝试计数：纯组件补测首轮2项失败，真实 region 缺陷和 ref 测试期望分别一次修正后通过；同问题连续修复失败0。全量首轮1次失败，环境原因已定位；不对共享 shell-job 作猜测修复。网络探针r1/r2/r3均退出0，r2修正记录数组快照，r3收紧专用TEMP；均不算生产网络修复或gate验收。

## 网络门槛及未完成事项

[网络门槛文档](../security/browser-public-page-gate.md)列出 N1–N10、候选控制与实际反例/API 证据。隔离 Electron 43.1.0 / Chromium 150.0.7871.47，`network-probe/evidence-r3.json` 记录 10 项、errors 为空，专用 PID 19364 已退出，退出码 0。空 bypass 的 loopback DIRECT、页面关闭保留 cookie 均实际发生；候选 bypass/显式清理改变对应实验结果。探针只连合成本机 fixture，绝非生产 localhost 许可。

生产网络 gate 未闭合：代理鉴权/IP 固定、完整 renderer/worker 覆盖、撤销竞态、QUIC/WebRTC 流量、TLS/mTLS 与 shutdown 接线仍待验收。没有实际 BrowserService/bridge，也未挂载到产品 UI、执行真实浏览或像素验收；不允许据纯组件或探针 GREEN 放行网络，不回退系统浏览器。没有真实 userData、登录/凭据、PID 10072 操作、新记忆、朋友圈、目录迁移、CI 或 R1 改动。

仅交唯一集成者本地可回退提交与仓库外证据；不推送、PR、合并或部署。下一步由父冻结接口/网络机制和 canonical 来源契约，再授权 Main 实现与共享接线。
