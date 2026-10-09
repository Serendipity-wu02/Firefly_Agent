# 右侧工作区独立组件验证

> 证据阶段：2026-10-04
> 文档整理：2026-10-07；仅整理既有证据，未重跑测试。
> 适用边界：下述实现、通过项与 HOLD 均指记录阶段，不代表当前产品状态。

## 1. 背景与模块边界

本阶段仅包含独立状态/reducer/展示组件，不修改既有共享、UI 或服务消费者。纯组件不解锁 BrowserService、R1 文件读取、代理操作或网络能力。

| 模块 | 已记录契约 |
| --- | --- |
| `browser-page-state.ts` | 五个纯函数；conversation/browser/request 三重匹配；关闭后无新请求；迟到/重复终态忽略；`blocked \| load_failed`，详见[状态验证](right-agent-workspace-state.md) |
| `browser-workspace-reducer.ts` | 组合页面状态与地址草稿；导航期间新编辑不被旧完成结果覆盖；失败保留最后提交页；关闭后编辑/导航无效；不启动任务/网络 |
| `BrowserWorkspacePanel.tsx/.css` | 受控 toolbar；required page/address/labels 与 onAddressChange/onNavigate/onCommand/onClose；命令仅 back/forward/reload；提交 trim 后非空地址 |
| `viewportRef` | optional、有名称的 region 占位 DOM；关闭后解绑并移除 children；调用方提供稳定 ref，独立处理测量、隐藏/缩放、可信弹窗和 Main bounds 校验 |
| `WorkspaceSourcesPanel.tsx/.css` | 本地 `WorkspaceSourcePresentation` 含 id/toolLabel/outcome 与 file_read/file_change/web_search display；均标为“来源待确认”；success/failure/unknown/not_executed 不认证 canonical 提交 |

组件没有 bridge、URL 打开、异步权限、自动读取、HTML 注入或事实写入。display 须来自已审查的结构化结果并脱敏；HTML escaping 不等于路径/URL 敏感信息脱敏。该 DTO 当时未成为共享 metadata 契约。

`tool_end` 早于 `await appendToolResult`，不能作持久化完成依据。共享 IPC/preload/Inspector/Main、结构化来源提交与文件/Diff/rename/pin 消费仍需独立集成。

## 2. 文案接口提案

所有文案均由 required labels 提供，下列 key 在该阶段仅为提案，不表示已写入翻译资源。

| key 前缀 | labels 字段 | 中文 / English |
| --- | --- | --- |
| `workspace.browser` | panel / address / go | 网页工作区 / Browser workspace；网页地址 / Page address；前往 / Go |
| `workspace.browser` | back / forward / reload / close | 后退 / Back；前进 / Forward；刷新 / Reload；关闭网页 / Close page |
| `workspace.browser` | loading / blocked / loadFailed / closed | 正在加载网页 / Loading page；此网页已被阻止 / This page was blocked；网页加载失败 / Page failed to load；网页已关闭 / Page closed |
| `workspace.browser` | viewport / empty | 网页区域 / Page viewport；输入公开网页地址 / Enter a public page address |
| `workspace.sources` | panel / empty / pending | 来源 / Sources；暂无结构化来源 / No structured sources；来源待确认 / Sources pending confirmation |
| `workspace.sources` | success / failure / unknown / notExecuted | 工具成功 / Tool succeeded；工具失败 / Tool failed；结果未知 / Outcome unknown；未执行 / Not executed |
| `workspace.sources` | fileRead / fileChange / webSearch | 读取文件 / File read；文件变更 / File change；网页检索 / Web search |

完整 key 由前缀与字段组合；例如 `workspace.sources.notExecuted` 对应展示 outcome `not_executed`，二者不是同一标识。

## 3. 技术反例与最终验证

可访问性 region 缺失是实际组件问题；React ref 回调额外参数则是测试期望问题。补 region，并将解绑断言限定为契约中的第一个参数，不为测试修改 ref 生命周期。模块缺失产生的 suite 加载失败不计行为通过。

| 检查 | 历史最终结果 |
| --- | --- |
| 新组件及状态回归 | 4 files / 49 passed：状态 17、reducer 9、toolbar 15、来源 8 |
| 独立只读审查 | 无 blocking/important；先验证 47 项，补充后独立 49/49 通过 |
| renderer/schema/全部新模块与测试严格类型（TSX/CSS types） | exit 0 |
| `npm run build` | exit 0；storage boundary、Main/preload/CLI/renderer 完成；保留 >500kB 警告 |
| 完整既有 runner | 615 files；6059 passed / 0 failed / 2 skipped，6061 total；exit 0，383.35s |

首轮受限全量为 612 files pass / 3 fail、6048 pass / 11 fail / 2 skip：8 个 shell-job Windows taskkill 用例未确认子进程退出，3 个真实 Bash 用例缺 `FIREFLY_TEST_BASH`。同 shell-job 在正常进程权限下 13/13 通过；补齐已核验 Bash 5.3.15 与所需进程权限后完整复验通过，未改测试、timeout 或门槛。既有两个 skip 分别为实际 Windows 8.3 alias 不可用与 file symlink 的 native `ERROR_PRIVILEGE_NOT_HELD(1314)`，不以 mock/junction 替代。

## 4. 网络证据与验收限制

隔离 Electron 43.1.0 / Chromium 150.0.7871.47 的网络探针记录 10 项、errors 空、exit 0。空 bypass 导致 loopback DIRECT、页面关闭后 cookie 保留均为实际反例；候选 bypass/显式清理只改变对应本机实验结果。探针不构成生产 localhost 许可。

当时尚无实际 BrowserService/bridge/UI 挂载或像素验收。代理鉴权/IP 固定、完整 renderer/worker、撤销竞态、QUIC/WebRTC、TLS/mTLS 与 shutdown 仍是独立门槛，见[网络门槛](../security/browser-public-page-gate.md)。纯组件和本机探针通过不能放行生产或回退系统浏览器。

原始日志为仓库外历史记录；最终全量没有筛选/排除测试，生成快照仅换行表示变化、无内容差异。后续应基于独立 Main 接口和 canonical 来源契约验收消费者，不将当时待集成状态作为当前事实。
