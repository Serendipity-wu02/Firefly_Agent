# Firefly Right Agent Workspace Implementation Plan

> For agentic workers：已批准两步范围、独立纯 renderer 状态机/组件 TDD 与本地可审查交付。集成者安全与接口冻结结论返回前，不实现新安全机制、不修改共享接线。仅作可回退本地提交，不推送、PR、合并或部署。

**Goal:** 首版交付用户手动公共网页浏览、已有工作区文件/Diff 预览、真实来源摘要和已有重命名/置顶。登录教务、代理导航/截图/点击/输入/下载属于第二步。

**Architecture:** 现有 Inspector 承载独立工作区组件；推荐 Main WebContentsView + 临时 session。Main 完整工具结果投影来源。网络隔离机制等待安全 review，不视为已批准实现。

**Tech Stack:** 指定基线 `50cc50be3d6e51c616c41ba5d2b6e86dd7b626aa`；共享 Electron 43.1.0、React 19.3.0、TypeScript 5.9.3、Vitest 4.1.11。

**Spec:** [完整正式设计](./right-agent-workspace.md)。本计划的新路径/API 是拟新增，不是现有接口。

## Global Constraints

- 复用 E 盘现有隔离树与共享依赖，不新建 worktree，不复制 node_modules，不启用 C 盘缓存；TEMP/TMP/RUNNER_TEMP 与测试诊断留任务 E 盘。
- 保留 R2/R3/R4、现有文件边界、有效测试与 CI 策略，不新增检查阈值或工具。
- 不做 R1/相关原生 backend、朋友圈、目录迁移、新记忆、任务会话绑定及无 backend 会话按钮。
- 不用真实 userData 或 PID 10072；自己的 smoke 子进程仅用 E 盘隔离 profile。
- 原 UI 线程拥有头像/导航/设置/任务/托盘；本主线独占新浏览器/来源文件；集成者协调共享接线。
- 同一问题两次修复失败报告集成者，按指令转 gpt-6-astra medium；审批拒绝不以换模型绕过。

## Task 0：review 与执行门槛（集成者协调，本主线核对）

- [x] 保存两步范围、正式设计和计划；核验基线、旧成果、共享依赖、现有接口与 runner。
- [ ] 取得集成者安全 review：实际公网连接边界、session 权限、宿主归属、生命周期、来源脱敏与恢复字段。
- [x] 取得共享文件修改归属：集成者唯一写所有既有共享接线，原 UI/S owner 范围保持；本主线只提交最小接线提案与新独立模块。
- [x] 读取父 shared review 并核验全局导航 guard、文件 handler、tool-runtime 与 canonical tool-result 提交顺序；正式设计已修订。原可见浏览器计划 B/保留登录/GitHub/ChatGPT 产品选择保留，本阶段匿名。
- [ ] 根据 review 更新本计划的候选网络机制并记录决定。review 需要用户新增选择时，交具体取舍；不将“可以的”解释为对新机制的批准。

## Task 1：独立页面状态机（本主线，父已批准纯状态实现）

**Create test:** `src/renderer/react/features/chat/workspace/browser-page-state.test.ts`。
**Implementation:** 同目录 `browser-page-state.ts`；不接网络、IPC、权限机制或真实浏览器。

拟定本模块接口（纯状态，不检查网络或授予权限）：

```ts
createBrowserPageState(conversationId: string, browserId: string): BrowserPageState;
beginBrowserNavigation(state: BrowserPageState, url: string): BrowserPageState;
completeBrowserNavigation(state: BrowserPageState, result: BrowserNavigationResult): BrowserPageState;
failBrowserNavigation(state: BrowserPageState, result: BrowserNavigationFailure): BrowserPageState;
closeBrowserPage(state: BrowserPageState): BrowserPageState;
// State: conversationId, browserId, requestId, closed, loading,
// url（已提交地址）, pendingUrl, canGoBack, canGoForward, error。
// Result: conversationId, browserId, requestId, url, canGoBack, canGoForward。
// Failure: conversationId, browserId, requestId, error: blocked | load_failed。
```

- [x] 准备并扩展为 17 个用例，覆盖初始/加载/完成/错误/关闭、旧请求/外来会话/外来标签、重复终态、未请求完成、重试清错误及 immutable 快照。
- [x] 保存初始缺模块 RED（0 断言）；父批准纯状态实现后先实现初始状态，取得实际执行 RED：13 用例 12 失败/1 通过。扩展测试再执行 RED：17 用例 16 失败/1 通过，缺尚未实现的导航函数。
- [x] 完成最小状态转换，17/17 GREEN；相关回归 4 文件 43/43 GREEN。renderer 类型和模块/测试独立类型检查退出 0；仓库默认 renderer build 退出 0。未将这些结果当作实际浏览器或网络验证。

## Task 2：受限手动浏览器（本主线，等待安全 review）

**Create after review:** `src/shared/browser-workspace-types.ts`；`src/main/browser/browser-service.ts`、`browser-ipc.ts`、`bootstrap.ts` 及对应 `.test.ts`。网络策略及候选代理放 `src/main/browser/browser-network-policy.ts`、`browser-network-proxy.ts` 与测试，只有机制被 review 接受后创建。

**Integrator only:** `src/shared/ipc-channels.ts`、`src/preload/index.ts`、`src/renderer/global.d.ts`、`src/main/application/default-dependencies.ts`、`src/main/windows/window-manager.ts`、`src/main/windows/external-link.ts`、`src/main/application/shutdown.ts`。本主线只交设计中 BrowserService/registerHost/精确导航路由/受控退出的最小提案。

拟定手动桥：`open(conversationId,url)`、`navigate(browserId,url)`、`command(browserId,"back"|"forward"|"reload")`、`setBounds(browserId,bounds|null)`、`close(browserId)`、`onChanged(callback)`。不含代理截图、任意脚本/CDP 或凭据接口。

- [ ] RED：实际 IPC handler 拒绝错误 sender/frame、外来会话/browserId、远程网页调用、关闭后命令、非法矩形。service 验证安全 preferences、session 隔离、下载/新窗口/权限拒绝；延迟准备阶段关闭后零 loadURL。
- [ ] 网络 RED：IPv4/IPv6、重定向/子资源私网、DNS 重绑定与绕行；如选代理，测试真实代理 server 与注入解析/连接，核验固定连接 IP、鉴权及无 DIRECT 回退。只测字符串分类不够。
- [ ] GREEN：引用父冻结 TrustedUserOwner，按对象身份、host top frame/profile/owner/generation/signal 复验，公开 DTO 无 authority；首版不造 run/agent lease。每次 await 和副作用前复验。父路由仅精确注册 Browser WebContents，拒绝不 openExternal，其它窗口保持原守卫。
- [ ] GREEN：按接受的安全机制创建可见 view，Main 唯一非空 partition，不复用 default/旧 partition；全部控制就绪后才 loadURL。关闭/宿主关闭/正常退出释放连接/view 并 await clearStorageData/clearCache，清理失败返回 cleanup_failed；隐藏和销毁区分，无安全回退。
- [ ] 同一组测试 GREEN，再执行 Main/preload 编译；真实网络 smoke 证明公共页面可用及实际私网边界有效。失败则浏览器入口不开放。

## Task 3：结构化来源投影（本主线，等待来源契约 review）

**Create after review:** `src/shared/workspace-source-types.ts`、`src/main/orchestrator/harness/workspace-source-projector.ts` / `.test.ts`、`src/renderer/react/features/chat/workspace/WorkspaceSourcesPanel.tsx` / `.test.ts`。

**Integrator only:** `harness/types.ts`、`tool-round.ts`、`tool-dispatcher.ts`、`adapter/event-mapper.ts`、`src/shared/chat-types.ts`、`src/main/agui-bridge.ts`、`pages/run/AgentRunController.ts`、`pages/chat-page-normalizers.ts`、`components/ChatMessageList.tsx`。transcript metadata 扩展经父协调原 S owner；主线不写 shared/transcript 文件。

拟定记录：conversationId、runId、toolCallId、toolId、真实 outcome/category、经过字段校验的文件 refs、可选 outputRecordId、truncated；所有恢复字段可选。手动浏览记录不构造工具来源。

- [ ] RED：路径在完整结果第 201 字以后仍有来源；read_file canonical/hash/行范围、web_search success/results URL 真实投影，查询/凭据不持久化；preview-only/shell 文本/手动导航不冒充读取。错误/取消/unknown/not_executed 保持事实；重试仅最终提交、重复去重、旧 metadata 兼容。
- [ ] RED：canonical appendToolResult 失败时不发布 committed 来源；已提交 metadata 重启恢复一致。测试实际父/S owner 提交恢复链，不把 event 发出当持久化成功。
- [ ] GREEN：完整结果先生成候选来源，经现有 canonical tool-result metadata 提交成功后另发 committed 来源事件；原 tool_end 可保留现有顺序但不作为来源已提交证据。不建立来源数据库，不 mint M 事实。
- [ ] GREEN：来源文件仅展示，不新增自动打开/读取能力；已有手动预览沿用且不宣称 sender/竞态已修复。自动打开若需更强边界，明确 R1 依赖，不另造同用途读取模块。不新增完整输出读取 IPC。
- [ ] projector、真实 event mapper、AgentRunController/恢复测试与来源组件定向 GREEN，交 review；保留 R3 四态，不用绿色成功简化错误结果。

## Task 4：右侧 Inspector 集成（本主线组件，共享接线先协调）

**Create after gates:** `BrowserWorkspacePanel.tsx` / `.test.ts`、`useAgentWorkspace.ts` / `.test.ts` 于 `src/renderer/react/features/chat/workspace/`。

**Integrator only, with UI coordination:** `ChatPage.tsx`、`ChatPageInspector.tsx`、`RightInspector.tsx/.css` 及已有相关测试。本主线交独立组件和 props/文案 key 清单，不碰 UI 独占文件或重写导航。文件接口不扩权；重命名/置顶只消费既有冻结回调。

父已放行本任务的独立子集：`BrowserWorkspacePanel.tsx` + `.css` + `.test.ts`，`browser-workspace-reducer.ts` + `.test.ts`，以及纯展示 `WorkspaceSourcesPanel.tsx` + `.test.ts`。Panel 是受控组件，消费 page/address/labels 与 onAddressChange/onNavigate/onCommand/onClose 注入回调；不引用 window bridge。Reducer 只组合已冻结五函数及地址编辑，不启动异步任务。来源展示 DTO 仅为展示提案，所有候选来源显示“来源待确认”，不宣称 canonical 持久提交，不新增超链接或文件打开。

- [x] 完成独立 toolbar/reducer/候选来源组件，49/49 工作区测试；region/ref 补测实际 RED/GREEN、两轮独立审查无 blocking/important。受测代码提交 `cc000b5c78578dde238922db115dc28cfe8d4244`。
- [x] 本阶段 renderer/schema/新模块严格类型与完整 build 退出0；正式全量615 files、6059 pass / 0 fail / 2 skip，首轮环境失败仍归档。未将这些结果视为 BrowserService/shared 接线或网络 gate 完成。

组件文案通过 required labels prop 注入，实际 i18n key 清单交父/UI owner；不修改共享翻译。请求完成更新已提交地址，但用户正在编辑的草稿不被覆盖；identity 不匹配/旧响应沿用原对象；切换会话须由父重新建状态，不把旧实例改成新身份。

- [ ] RED：新标签与文件/Diff/计划共存；同会话去重、切换不串页、Modal 隐藏 view、旧回调不更新新页、关闭最后标签回退；文件行号、错误及 rename/pin 保留；没有第二步代理按钮。
- [ ] GREEN：独立 hook 管状态，ChatPage 最小传参。ResizeObserver + Main 校验处理矩形/缩放；非活动页与可信弹窗时传 null 卸下 view。用户手动浏览是唯一首版控制入口。
- [ ] Inspector/ChatPage、现有文件/Diff、会话动作、Stop/队列/审批测试 GREEN，再 renderer 类型检查。

## Task 5：审查、完整验证与交付（本主线证据，集成者集成）

- [ ] 独立审查针对固定基线与最终 diff：权限、网络实际目标、IPC 归属、资源清理、原生遮挡、来源真实性、旧记录与 R2/R3/R4 交叉回归。
- [ ] 定向 GREEN 后执行既有 `npm run check:renderer`、`npm run check:plugin-schema`、`npm run build`；全量用 `scripts/ci/run-vitest.ps1`。其参数为 `TestFiles`，无参数执行全量；不改 runner/门禁。
- [ ] 新建本任务 smoke 脚本/夹具，仅启动自己 E 盘隔离 profile；真实像素验收地址栏、前后刷新、公共页面、布局/遮挡/关闭/会话切换、文件/Diff、rename/pin 和来源摘要。网络测试夹具不得变成生产 localhost 例外。
- [ ] 归档 `docs/testing/right-agent-workspace.md`，记录 RED/GREEN、数量/退出码、类型/build、独立审查和 native smoke 的实际结果及限制；不使用旧 R3/R4 通过结果替代本次验证。
- [ ] 本地提交须有真实授权；交唯一集成者完整 SHA 或明确未提交文件清单，不自行推送/PR/合并/部署。

## 当前门槛判定

总体两步范围与独立纯状态/组件实现：已批准。正式归档与 shared review 修订：已完成。共享唯一写入者：已明确。独立状态模块、toolbar、reducer 与候选来源展示：已实现；49 个工作区用例通过并获独立审查。剩余 gate：父冻结本修订接口/来源 metadata 与网络安全机制结论；不重问总体范围。实际浏览器服务、来源 canonical 接线及真实产品窗口未实现；第二步不预先实施。[网络门槛提案](../security/browser-public-page-gate.md)有隔离 native 反例/API 证据，未闭合生产 gate。父报告 c1735ec 整合 6015 pass/0 fail/2 skip、类型/build 通过，这不是本主线验证结果。本主线完整验证结果和 props/文案交付见[组件记录](../testing/right-agent-workspace-components.md)。

## 本轮验证记录

共享依赖以本隔离树 node_modules junction 复用，未复制或安装。执行 `node .\node_modules\vitest\vitest.mjs run src/renderer/react/features/chat/workspace/browser-page-state.test.ts --configLoader runner --reporter=verbose`，TEMP/TMP/RUNNER_TEMP 指向任务 E 盘。

初始结果：退出码 1，1 suite failed，0 个断言执行，原因是当时 `./browser-page-state` 未实现。日志：`E:\Codex\2026-10-04\task-4\right-workspace-state-red.log`。此历史记录不是断言通过。后续实际执行 RED、17/17 GREEN、43/43 定向、类型/build 详见[状态阶段验证记录](../testing/right-agent-workspace-state.md)；组件和最终检查另见[组件记录](../testing/right-agent-workspace-components.md)。整个浏览器子系统未完成。
