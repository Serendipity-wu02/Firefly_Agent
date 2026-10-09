# Firefly 右侧代理工作区实施与验收计划

- **初始计划日期**：2026-10-04
- **状态**：首版设计及独立组件已完成历史验收；浏览器服务与共享接线由后续阶段实现
- **范围**：手动浏览、现有文件/Diff、结构化来源与既有会话操作
- **原则**：先确认当前接口和证据，再实施未完成项；不重复执行已交付模块

## 1. 背景与阶段关系

[架构设计](right-agent-workspace.md)最初采用现有 Inspector、Main WebContentsView、临时 Session 与完整工具结果来源投影。初始实施环境为 Electron 43.1.0、React 19.3.0、TypeScript 5.9.3、Vitest 4.1.11。

该计划最初的“BrowserService 未实现、共享接线待开始”已被后续[服务实现](browser-service-native-plan.md)和[接线契约](browser-service-integration.md)取代。来源 canonical 提交/恢复的设计要求仍须依据实际模块单独核对，不能将纯展示组件完成当作端到端来源完成。

登录、Agent 操作和下载属于初始计划的第二步。当前源码已有另外的授权模式；其状态和安全范围以实际实现及对应验收为准，不能从早期排除范围或 gate HOLD 推导当前全部能力。

## 2. 全局边界

- 保留既有文件边界、有效测试、R2/R3/R4 语义与 CI 标准，不增加检查阈值或工具。
- 不扩展任意路径读取、Office/PDF/可执行 HTML、目录迁移、新记忆、任务会话绑定或无 backend 会话按钮。
- 浏览器 fixture 使用独立 smoke profile 与非 persist Session，不读取真实 userData、常用浏览器 profile 或凭据。
- 网络准备失败保持真实错误，不回退裸 loadURL、系统浏览器、DIRECT 或证书放行。
- renderer 仅持有受限 DTO，Main 私有 owner、Session、epoch、partition、token 与授权回调不进入公开 payload。

## 3. 独立页面状态机

已实现于 `src/renderer/react/features/chat/workspace/browser-page-state.ts` 及同名测试，纯状态 API 如下：

```ts
createBrowserPageState(conversationId: string, browserId: string): BrowserPageState;
beginBrowserNavigation(state: BrowserPageState, url: string): BrowserPageState;
completeBrowserNavigation(state: BrowserPageState, result: BrowserNavigationResult): BrowserPageState;
failBrowserNavigation(state: BrowserPageState, result: BrowserNavigationFailure): BrowserPageState;
closeBrowserPage(state: BrowserPageState): BrowserPageState;
```

state 包含 conversationId、browserId、requestId、closed、loading、已提交 url、pendingUrl、canGoBack、canGoForward 和 error。result/failure 必须携带同一会话、标签与请求身份，旧响应、外来身份、关闭页或未请求完成不改变当前状态。failure 的 `blocked | load_failed` 是本模块展示状态，不是完整 Main 错误枚举。

历史结果为 17/17 工作区状态用例及相关 4 文件 43/43 回归通过，renderer/模块/测试类型和当时 renderer build 均 exit 0。测试覆盖不可变快照、重复终态、错误后重试和关闭；初始缺模块导致的加载失败不计为已执行断言的 RED。详见[状态验证](../testing/right-agent-workspace-state.md)。

## 4. 受限浏览器服务

初始候选文件 `browser-workspace-types.ts`、`browser-ipc.ts`、`bootstrap.ts`、`browser-network-policy.ts` 和 `browser-network-proxy.ts` 属于早期规划，不能继续当作当前路径。后续实际实现采用 `src/shared/manual-browser.ts`、`browser-service.ts`、`browser-service-ipc.ts`、`electron-browser-service.ts`、授权域和 CONNECT 模块。

当前维护要求：

1. IPC 拒绝错误 sender/frame、外来 browserId、远程网页调用、关闭后命令和非法矩形；公开命令不能生成 owner。
2. 服务使用 Main 注册的 host/topFrame/profile/owner/generation/signal，每次 await 和副作用前复验。
3. Session 默认 deny 先于 view；同 Session/epoch/binding 准备完成后才导航，延迟 prepare 被 close 取消时不得 loadURL。
4. navigation、redirect、subresource 和 worker 受相应策略约束，完整 DNS 答案校验与数值 pin 不降级。
5. 关闭、宿主销毁和 shutdown 同步 revoke，随后有界清理 view、连接及存储；失败返回 `cleanup_failed`，不恢复旧域。
6. 精确 guest 导航拒绝不能回退系统浏览器；保留原生 HTTP 方法，避免 POST 重发为 GET。

[网络模块方案](browser-network-modules-plan.md)、[授权域方案](browser-domain-modules-plan.md)、[服务方案](browser-service-native-plan.md)分别保存对应实现和验收边界。功能接线完成不能代替[网络门槛](../security/browser-public-page-gate.md)。

## 5. 结构化来源投影

原设计中的候选落点为 `workspace-source-types.ts`、`workspace-source-projector.ts/.test.ts` 与 `WorkspaceSourcesPanel.tsx/.test.ts`。这些名称作为设计范围保留；除明确实现的展示组件外，本文不据候选路径声称 canonical 投影已完成。

来源契约至少包含 conversationId、runId、toolCallId、toolId、assistantEntryId、真实 outcome/category、已校验 refs、可选 outputRecordId 和 truncated。恢复字段向后兼容，手动浏览记录不构造工具来源。

待依据当前实现核对或完成的验收：

- 文件证据位于完整输出第 201 字之后仍可投影，preview-only、shell 文本和手动导航不能冒充读取。
- read_file canonical/hash/行范围、web_search success/results URL 来自真实结构化结果；query/userinfo/fragment 脱敏，不公开凭据。
- failure、cancelled、unknown、not_executed 保留实际语义；重试只提交最终结果，重复 key 去重。
- appendToolResult 失败不发布 committed 来源；成功后的 metadata 恢复一致，旧 metadata 缺失兼容。
- 来源只展示，不增加自动打开、文件读取或完整输出 IPC，不建立第二份来源数据库或记忆事实。

变更需同时覆盖 Harness 完整结果边界、event mapper、canonical transcript metadata、AGUI、AgentRunController、normalizer 与展示组件。单测 projector 或仅发出 `tool_end` 不能证明持久提交成功。

## 6. Inspector 组件与共享交互

初始独立子集已实现 `BrowserWorkspacePanel.tsx/.css/.test.ts`、`browser-workspace-reducer.ts/.test.ts` 与纯展示 `WorkspaceSourcesPanel.tsx/.test.ts`。

Panel 通过 page/address/labels 和 onAddressChange/onNavigate/onCommand/onClose 接收受控输入，不直接引用 window bridge。Reducer 组合五个状态函数及地址编辑，不启动异步任务。候选来源显示“来源待确认”，不宣称 canonical 持久提交，不新增超链接或文件打开。

历史组件验收为 49/49 工作区用例，独立审查无 blocking/Important 遗留项；renderer/schema/新模块严格类型及完整 build exit 0。该阶段全量 615 个文件、6059 passed、0 failed、2 skipped，详见[组件记录](../testing/right-agent-workspace-components.md)。这些数字不代表后续服务、网络或本次文档整理的验证。

组件文案由 required labels prop 注入。请求完成更新已提交地址，但不能覆盖用户正在编辑的草稿；身份不匹配或旧响应保留原对象。会话切换重新建立状态，不改变旧实例身份。

后续共享集成验收包括：浏览器与文件/Diff/计划标签共存，同会话去重、切换不串页、Modal 隐藏、旧回调隔离、关闭回退，保留文件行号、错误、rename/pin、Stop/队列/审批。ResizeObserver 与 Main 校验共同处理矩形和缩放，非活动页及可信弹窗传 null，恢复焦点时重新提交布局。

## 7. 后续实施顺序与完成标准

1. 核对当前服务、renderer 和来源链，按实际缺口修改，移除已被实现替代的待办，不复制早期候选 API。
2. 先补来源真实性、canonical 提交/恢复及必要身份回归，再扩展依赖这些契约的展示。
3. 对网络剩余门槛建立有限、带正对照的原生验证；区分普通回归、合成 fixture、真实公网和 OS 前台证据。
4. 根据改动运行已有定向测试、Main/preload/renderer 类型、schema 与构建；全量结果按实际环境记录失败/跳过，不修改标准掩盖问题。
5. 在[状态验证](../testing/right-agent-workspace-state.md)、[组件验证](../testing/right-agent-workspace-components.md)及相关阶段记录中给出日期、范围、结果和未验证项；不可继承其他阶段的数字作为本次结果。

以上验收要求与历史结果分别保留，文档更新本身不构成新的测试、构建或 native 验收证据。
