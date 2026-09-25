# Firefly → Cyrene Batch 1 实施记录（2026-09-23）

## 范围与增量复核

- 本轮目标仅为「流萤可见、人设单一、Chat 可用」。继续使用 Cyrene 的入口、Agent 循环、工具、审批、状态所有权与导航结构；未建立第二套 Loop，也未加入 Jev/DecisionProvider。
- 新底座昨天无 Git 信息，本轮在当前提取目录建立本地 `main` 基线提交 `46610b9`，无 remote；未关联上游仓库，也未提交本轮改动。因昨天没有 Git 历史，无法对「报告之后、基线之前」的源码漂移做 Git 级归因；已将当时磁盘现状锁定为本地根提交。新建 `.git` 的所有者与当前 Windows 账户不同，所有权修正被系统拒绝，因此只对本路径增加了用户级 Git `safe.directory` 例外；普通 `git status` 现可使用。
- 旧 Firefly 仍在 `firefly-v1.1.0` / `f6f20f9`，`git status --short` 仍为 47 项；本轮未修改旧仓库。
- 开始时 Electron `node_modules/electron/dist/electron.exe` 缺失，已用仓内 `node_modules/electron/install.js` 恢复；没有变更依赖清单。开始时 `dist` 早于迁移源码，已重新执行 `npm run build`。
- 不触碰音乐实现、打包 appId/更新源、旧 Firefly UI，也不处理流萤 Live2D 第三方授权；授权仍是发布前阻塞项。

## 源码状态与证据

| 项目 | 本轮结论与依据 |
| --- | --- |
| 模型可加载 | `src/renderer/main.ts` 指向 `models/firefly/Firefly.model3.json`；`src/main/character-migration.test.ts` 遍历清单中 Moc、纹理、物理、动作、表情资源；构建后 `dist/renderer/models/firefly/` 存在。实际画面仍须用户验收。 |
| 角色装配 | `src/main/orchestrator/mode-prompt-profile.ts` 在 Chat/Work/Learn/Code 四模式装入 `soul.md`；`prompts/soul.md` 是分节 Markdown，覆盖背景、关系、称呼、表达及对话示例，不再注入原始 YAML；`prompts/cyrene_harness.md` 仅承担执行语气，保留工具参数与事实边界。 |
| 运行约束 | 各 `*_system.md` 中的事实、权限、工具、审批和任务边界没有替换成旧 Firefly 架构；`src/main/orchestrator/harness/cyrene-harness.ts` 未改。 |
| 子代理 | `src/main/tasks/task-character-pool.ts` 名单为空；`src/main/orchestrator/harness/builtin-tools.ts` 无名单时不暴露/强制 `companion_id`；`src/main/orchestrator/task-runtime.ts` 支持非角色化子任务。 |
| 朋友圈 | `src/main/settings/settings-facade.ts` 的 `momentsEnabled` 和 `chatMomentsContextEnabled` 均默认 `false`；旧角色注册表因空名单不加载。导航入口仍沿用 Cyrene，用户主动开启后的社交功能仍需实机验收。 |
| UI 素材 | Chat、导航、交互卡、设置、提醒、通话、启动页的昔涟插画不再渲染；有流萤头像的入口使用 `avatars/firefly-avatar.png`，没有对应素材时保留文字/中性符号。静态防回归检查见 `src/main/character-migration.test.ts`。 |
| Chat | 原 `src/main/agui-bridge.ts`、`src/main/orchestrator/cyrene-agent.ts` 及既有 ChatLoop 仍为唯一通路；单元测试覆盖 prompt 装配与运行链。未发送真实模型请求，故不能声明已验证一次真实 Chat 回复。 |

## 修改文件及原因

下表每格列出的路径均属于本轮工作树改动；同格文件共用该格的修改原因。`dist/` 资源为构建复制品，未手工编辑。

| 文件 | 原因 |
| --- | --- |
| `prompts/soul.md` | 将旧 Firefly YAML 语义整理为当前 prompt loader 可直接装配的结构化角色核心，加入对话示例。 |
| `prompts/chat_system.md`、`prompts/work_system.md`、`prompts/learn_system.md`、`prompts/code_system.md` | 替换角色指代及语气，不更改运行、安全、审批和工具约束。 |
| `prompts/cyrene_harness.md` | 将执行口吻改为流萤，并保留 Function Calling 参数与结果真实性边界。 |
| `prompts/phone_identity.md`、`prompts/phone_style.md`、`prompts/phone_system.md` | 通话身份和表达改为流萤。 |
| `prompts/styles/01_default.md`、`prompts/styles/02_lively.md`、`prompts/styles/03_healing.md`、`prompts/styles/04_focused.md`、`prompts/styles/05_sweet.md` | 各风格不再注入昔涟自称、音符和旧角色口吻。 |
| `prompts/work_remark.md`、`prompts/code_remark.md` | 模式补充提示的角色抬头改为流萤。 |
| `prompts/worldbook/Cyrene.md`（删除）、`prompts/worldbook/Firefly.md`（新增） | 动态世界书保持流萤条目，不让旧角色文件同场命中。 |
| `src/main/orchestrator/mode-prompt-profile.ts`、`src/main/orchestrator/mode-prompt-profile.test.ts` | 四模式装入同一角色核心，并验证装配。 |
| `src/main/orchestrator/agent-runtime.ts`、`src/main/orchestrator/build-options.ts`、`src/main/orchestrator/context-manager.ts`、`src/main/orchestrator/cyrene-agent.ts` | 清理观察、上下文、摘要及运行时可见文字中的旧人设；不改循环所有权。 |
| `src/main/orchestrator/harness-adapter.test.ts` | 验证当前角色层与执行层的真实装配，不沿用旧英文标题断言。 |
| `src/main/tasks/task-character-pool.ts`、`src/main/tasks/task-character-pool.test.ts` | 清空黄金裔角色化名单，并验证不会再注入旧角色。 |
| `src/main/orchestrator/harness/builtin-tools.ts`、`src/main/orchestrator/harness/builtin-tools.test.ts`、`src/main/orchestrator/task-runtime.ts`、`src/main/orchestrator/task-runtime.test.ts` | 允许现有任务工具以非角色化子代理运行，避免空名单使 Work/Code 委托失效。 |
| `src/main/settings/settings-facade.ts`、`src/main/settings/model-settings.ts`、`src/main/settings/general-settings.ts`、`src/main/channels/settings-store.ts` | 朋友圈默认关闭，内置旧表情推荐关闭，替换可见测试文案；保留设置所有者。 |
| `src/main/sticker-storage.ts` | 不再向用户列出内置昔涟贴纸；用户自选贴纸仍可使用。 |
| `src/main/moments/character-personas.ts`、`src/main/moments/character-personas.test.ts`、`src/main/moments/moments-agent.ts`、`src/main/moments/moments-agent.test.ts`、`src/main/moments/moments-context.ts`、`src/main/moments/moments-context.test.ts` | 清理朋友圈摘要中的旧主角名，测试用局部角色名单验证原有解析能力，不恢复生产名单。 |
| `src/main/character-migration.test.ts`、`src/main/live2d-actions.test.ts`、`src/main/orchestrator/tools/builtin-tools/play-live2d-action.test.ts` | 核对模型资源、动作目标、角色 prompt 及旧图隐藏。 |
| `src/main/orchestrator/tools/__snapshots__/built-in-tools.snapshot.test.ts.snap` | 同步实际工具描述中的流萤名称与已存在的流萤动作清单，不删除快照测试。 |
| `src/main/orchestrator/tools/builtin-tools/install-mcp-tool.ts`、`src/main/orchestrator/tools/document-tools.ts`、`src/main/orchestrator/tools/history-tools.ts`、`src/main/orchestrator/tools/registry/tool-registry.ts` | 替换模型可见工具说明的旧主角名。 |
| `src/main/permission.ts`、`src/main/proactive/proactive-lifecycle.ts`、`src/main/toast/toast-service.ts`、`src/main/call/call-manager.ts` | 审批提示、主动消息、提醒与通话中的旧角色文案改为流萤。 |
| `src/main/agui-bridge.ts`、`src/main/application/application.ts`、`src/main/application/default-dependencies.ts` | 桥接运行标签、错误框和启动日志改为流萤/Firefly；不变更桥接调度。 |
| `src/main/app-icon.ts`、`src/main/tray.ts`、`src/main/tray.test.ts`、`src/main/windows/create-toast-window.ts`、`src/main/windows/create-aux-windows.ts` | 托盘、辅助窗口和运行图标使用 Firefly 可见身份。 |
| `src/main/channels/adapters/wechat/inbound-media.ts`、`src/main/channels/adapters/wechat/inbound-media.test.ts`、`src/main/channels/adapters/wechat/ilink-bot-adapter.ts`、`src/main/channels/adapters/wechat/ilink-bot-adapter.test.ts` | 微信代收提示由昔涟语气改为流萤语气，新写入文件使用 Firefly 收件箱。 |
| `src/main/learn/obsidian/vault-templates.ts`、`src/main/plugin-runtime.ts` | 新建学习空间模板及插件导入对话框改为 Firefly 品牌。 |
| `src/shared/banner.ts`、`src/cli/banner/ascii.ts`、`src/cli/banner/text.ts`、`src/cli/banner/render.test.ts`、`src/cli/commands/handlers.ts`、`src/cli/app.test.ts` | 运行横幅与 CLI 欢迎文案改为 Firefly；`cyrene` CLI 命令及上游来源链接仍保留到身份批次。 |
| `src/renderer/index.html`、`src/renderer/react/index.html`、`src/renderer/public/splash.html`、`dist/renderer/splash.html` | 主窗口标题与启动图改为 Firefly；dist 项是构建复制品。 |
| `src/renderer/call/index.html`、`src/renderer/call/main.ts`、`src/renderer/sidebar/index.html`、`src/renderer/sidebar/sidebar.ts`、`src/renderer/sidebar/sidebar.css` | 通话/侧栏显示流萤头像和文字；移除昔涟心情/状态图映射。 |
| `src/renderer/react/character-avatars.ts`、`src/renderer/react/features/moments/MomentComposer.tsx`、`src/renderer/react/features/moments/MomentPostCard.tsx`、`src/renderer/react/features/moments/MomentsPanel.tsx` | 朋友圈主角头像不再指向昔涟；保留原 UI 结构。 |
| `src/renderer/react/components/ui/CharacterStatusPill.tsx`、`src/renderer/react/components/ui/ModelModeButton.tsx`、`src/renderer/react/components/ui/MomentsModeButton.tsx`、`src/renderer/react/components/ui/NewTaskButton.tsx`、`src/renderer/react/components/ui/PluginModeButton.tsx`、`src/renderer/react/components/ui/SkillModeButton.tsx`、`src/renderer/react/components/ui/ToolModeButton.tsx` | 可见名称与导航图标去昔涟化，保留按钮和中性文字/符号。 |
| `src/renderer/react/features/chat/components/ChatComposer.tsx`、`src/renderer/react/features/chat/components/ChatWorkspaceNotices.tsx`、`src/renderer/react/features/chat/components/StatusFloat.tsx` | 隐藏欢迎图、压缩图、浮动昔涟图与贴纸入口旧角色图；保留操作和文字。 |
| `src/renderer/react/features/chat/components/ChatMessageList.tsx`、`src/renderer/react/features/chat/components/ChatMessageList.test.ts`、`src/renderer/react/features/chat/components/ContextUsageRing.tsx`、`src/renderer/react/features/chat/components/ContextUsageRing.test.ts` | Chat 头像改为流萤，思考/任务进度和上下文容量只显示状态文字/加载符号；测试防止旧图回流。 |
| `src/renderer/react/features/chat/components/CodeGitPanel.tsx`、`src/renderer/react/features/chat/components/InteractionPanel.tsx`、`src/renderer/react/features/chat/components/ModelModePanel.tsx`、`src/renderer/react/features/chat/components/PlanModeToggle.tsx`、`src/renderer/react/features/chat/components/PluginModePanel.tsx`、`src/renderer/react/features/chat/components/ReasoningControl.tsx`、`src/renderer/react/features/chat/components/ReviewPanel.tsx`、`src/renderer/react/features/chat/components/SkillModePanel.tsx`、`src/renderer/react/features/chat/components/StyleControl.tsx`、`src/renderer/react/features/chat/components/TodoPanel.tsx`、`src/renderer/react/features/chat/components/ToolModePanel.tsx` | 面板和交互保留，移除没有流萤版本的昔涟插画。 |
| `src/renderer/react/features/chat/components/TaskDelegationRow.tsx`、`src/renderer/react/features/chat/components/TaskDelegationRow.test.ts`、`src/renderer/react/features/chat/components/agent-rounds.ts`、`src/renderer/react/features/chat/components/agent-rounds.test.ts`、`src/renderer/react/features/chat/components/run-presentation.test.ts` | 任务运行文字改为流萤；历史委托不继续渲染旧角色立绘。 |
| `src/renderer/react/i18n/zh-CN.json`、`src/renderer/react/i18n/en.json`、`src/renderer/settings/i18n/zh-CN.json` | Chat、设置、审批、状态翻译切换角色品牌，保留技术 ID。 |
| `src/renderer/settings/index.html`、`src/renderer/settings/settings.css`、`src/renderer/settings/settings.ts`、`src/renderer/settings/appearance-settings-markup.test.ts` | 设置页文案、头像、记忆入口图和旧图选择器显示调整；保留既有设置布局及存储键。 |
| `src/renderer/settings/mcp/panel.ts`、`src/renderer/settings/mcp/panel.test.ts`、`src/renderer/settings/mcp/modal-interaction.test.ts`、`src/renderer/settings/memory/panel.ts`、`src/renderer/settings/plugins/permission.ts`、`src/renderer/settings/tts/panel.ts` | 模态框、记忆、权限、语音测试的可见角色用语替换，并同步有效测试。 |
| `src/renderer/tasks/index.html`、`src/renderer/toast/index.html`、`src/renderer/toast/toast.ts` | 任务/提醒标题与提醒头像改为 Firefly。 |
| `dist/renderer/avatars/firefly-avatar.png`、`dist/renderer/models/firefly/` | `npm run build` 复制的 Firefly 产品资源；当前未跟踪，尚未暂存。 |

## 验证与边界

- `npm run build`：通过；TypeScript main/preload、CLI 与 Vite renderer 均完成。Vite 提示部分 chunk 超过 500 kB，为性能提醒而非构建失败。
- `npm test -- --reporter=dot --silent`：501 个测试文件通过，4498 个测试通过、1 个跳过。Windows 测试进程临时将已安装的 `E:\Git\bin` 加入 PATH，使 Bash 相关既有测试能找到 `bash.exe`；未修改 shell 工具或删除测试。
- `npm run check:renderer`：通过。
- `git diff --check`：通过；Windows 换行转换警告未产生空白错误。
- Electron 烟测：主进程启动且 4 秒内记录 `core/windows-revealed`，12 秒后仍存活，随后主动结束。终端横幅显示 Firefly。没有发送模型请求，未验证真实 Chat 回复或 Live2D 画面。
- 烟测 stderr：截图 native helper 不存在（`ENOENT`）；Memory/RAG 在该配置下不可写而跳过；贴纸 embedding 模型缺失而禁用。这些不阻止主窗口启动，但相关功能需后续批次或实机确认。
- Windows Electron `app.getPath("appData")` 指向系统 Roaming 路径；即使外层 PowerShell 设置临时 `APPDATA`，实际 userData 仍由 `src/main/app-identity.ts` 指向 `Firefly-Cyrene-Base`。因此烟测启动的应用确实访问了该 userData 目录；本轮没有手工查看或导出其内容，也未调用模型。用户数据目录命名与打包身份按 Batch 6 决策处理。

## 残留与待验收

1. **仍可检索到旧词**：`prompts/moments_personas/` 中的翁法罗斯/昔涟/黄金裔资料仍在磁盘，但生产角色名单为空且朋友圈默认关闭；`src/renderer/music/` 和 `src/main/windows/create-music-player-window.ts` 仍显示 Cyrene Music（用户要求 Batch 4 才改，故本轮未动）；CLI 的 `cyrene` 命令、上游仓库来源链接以及 `app-identity.ts` 的 `Firefly Cyrene Base` 暂保留。旧模型/图文件仍在仓库与构建资源中，但本轮已移除主 UI 引用。
2. **发布前阻塞**：Firefly Live2D 模型与第三方素材的作者、来源、再分发授权尚未取得；不阻止本地迁移。
3. **需要用户实机验收**：桌宠模型是否完整显示/可拖动/可点击、所有 Chat/Work/Learn/Code 页面是否无旧角色图、Chat 使用用户自选模型能否完成真实一轮、应用名称/目录是否符合最终期望。没有真实模型凭据时不能将「主窗口启动」等同于「Chat 已实际回复」。
