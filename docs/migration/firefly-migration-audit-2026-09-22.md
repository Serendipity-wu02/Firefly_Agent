# Firefly → Cyrene 新底座迁移审计

- 审计日期：2026-09-22
- 新底座：`E:\Codex\Cyrene-Agent-master`
- 原 Firefly：`E:\Codex\working\Firefly-Pet`
- 本轮性质：只读审计。未修改源码、未安装依赖、未启动应用、未运行测试、未请求模型、未读取任何用户数据目录内容（仅检查目录名是否存在）。本文件是本轮唯一新增文件。

## 0. 证据等级与基线

| 标记 | 含义 |
|---|---|
| **[S]** | 静态源码/文件结论（本轮读取实际文件得出） |
| **[T]** | 已有测试记录 |
| **[R]** | 运行验证 |
| **[预测]** | 对测试结果的静态推断，未实际运行 |

- 本轮全部结论为 **[S]**。**无 [R]**。
- 新底座**没有任何测试运行记录**（无 coverage、结果文件或 vitest 缓存），所以没有 [T]。
- 本轮未运行测试：`vitest` 会写缓存，与只读要求冲突。

**新底座基线**

- 目录不是 Git 仓库（`git rev-parse` 返回 `fatal: not a git repository`），无法用 Git 确定基线。
- 按文件时间推断：
  - 解压：2026-09-21 12:37（绝大多数文件）。
  - `dist/`：13:49 构建。
  - 迁移改动：13:54–14:01，共 21 个文件（见 §1）。
- `dist/` 早于全部迁移改动，可当作"改动前上游编译产物"做语义对照。它不是权威基线。
- `package.json`：`live2d-cyrene@1.2.2`。

**原 Firefly 基线**

- Git 分支 `firefly-v1.1.0`，HEAD `f6f20f9`（2026-09-20，与 `origin/firefly-v1.1.0` 一致），共 85 个提交。
- 工作区有 **39 个已修改 + 8 个未跟踪文件未提交**，包括：
  - `docs/architecture/unified-workbench-v1.md`
  - `src/main/work/work-file-evidence.ts`
  - `ThinkingIntensityControl.tsx`、`UnifiedStatusCard.tsx`、`WorkbenchSidebar.tsx`
  - thinking-effort 相关测试
- 这些未提交内容不属于任何提交，作为"原功能基线"的地位不确定（见 §9 问题 5）。

---

## 1. 当前迁移状态

### 1.1 已发生的迁移改动（21 个文件，13:54–14:01）[S]

| 类别 | 文件 |
|---|---|
| 应用身份 | `src/main/app-identity.ts`、`src/main/app-identity.test.ts`、`src/main/index.ts` |
| Live2D 加载 | `src/renderer/main.ts`、`src/renderer/live2d/manager.ts`、`src/renderer/live2d/model-manifest.ts(+test)`、`src/renderer/live2d/speaking-motion.ts` |
| 动作目录 | `src/shared/live2d-actions.ts`、`src/main/orchestrator/tools/builtin-tools/play-live2d-action.ts` |
| 迁移测试 | `src/main/character-migration.test.ts` |
| Prompt | `prompts/{chat,work,code,learn,plan}_identity.md`、`prompts/worldbook/*.md`（5 个） |
| 复制文件（保留原 mtime 2026-09-03） | `src/renderer/public/models/firefly/**`、`src/renderer/public/avatars/firefly-avatar.png`、`prompts/soul.md`、`prompts/source-persona/firefly.yaml`、`prompts/canon_quotes.md`、`prompts/canon_quotes_lite.md` |

### 1.2 总体判断

- **资源层**基本完成。
- **身份层**在开发模式下完成，打包配置未改。
- **人设层**只替换了"identity + worldbook"一层。system 层、执行人设、风格层、运行时硬编码字符串仍是昔涟，所以每个模式都在混合人设。
- **UI 可见品牌**未替换。
- **构建产物过期**，Electron 二进制缺失，应用当前无法按迁移后状态启动。
- **原 Firefly 功能**：未迁入任何代码。大部分由新底座等价实现覆盖，有 4 项缺口（见 §5）。

---

## 2. 新底座实际所有者 [S]

| 职责 | 所有者（唯一） | 依据 |
|---|---|---|
| 进程入口 | `src/main/index.ts` | `:30` 设置身份 → `:39` `createApplication` → `:42` `prepareBeforeReady` |
| 单实例 | `application/pre-ready.ts:26` → `single-instance.ts:16` | `requestSingleInstanceLock`，在身份设置之后执行 |
| Agent 循环 | `orchestrator/cyrene-agent.ts:387` `CyreneAgent` | 见下方说明 |
| 渲染进程入口 | `agui-bridge.ts:355` `registerAgUiIpc` | 在 `application/default-dependencies.ts:513` 注册 |
| 工具注册与分发 | `orchestrator/tools/registry/tool-registry.ts`；`orchestrator/harness/tool-dispatcher.ts:147` | 执行前调用 `checkPermission` |
| 权限与审批 | `src/main/permission.ts` | 默认档位 `read-only`（`:39`）；`checkPermission`（`:228`）；`requestApproval`（`:155`）；`cancelPendingApprovalsForRun`（`:269`） |
| 设置 | `settings/settings-facade.ts` | `loadGeneralSettings`（`:415`）/ `saveGeneralSettings`（`:420`） |
| 任务与运行状态 | 见下方说明 | |
| Prompt 解析 | `prompts/prompt-loader.ts:8` → `external-content-paths.ts:104` | dev 模式读 `<appPath>/prompts`；打包后先读 `userData/prompts`，再读 `<install>/prompts`（`:34-54`） |
| 模式 Prompt 组成 | `orchestrator/mode-prompt-profile.ts:8-11` | 见 §3 B3 |

**Agent 循环的分支**（`cyrene-agent.ts`）：

- `:461`：Chat 且无工具时，走 `chat-loop.ts:103` `runChatLoop`。
- 其余情况：`:491` `runHarnessWithAdapter` → `harness/cyrene-harness.ts`。
- `:449`：只要 Chat 有工具（例如朋友圈工具），就改走 harness。

**任务与运行状态**由以下文件分别负责：

- `harness/run-store.ts`
- `harness/run-recovery.ts:24`
- `run-settlement.ts:23`：确保一次运行只记录一个终态。
- `plan-mode.ts`：计划模式状态机。
- `task-runtime.ts:69`：子任务。

---

## 3. 阻塞问题（按"流萤正常显示 → 人设生效 → Chat 可用"排序）

### B1 应用无法启动：Electron 二进制缺失 [S]

- `node_modules/electron/` 下没有 `dist/`，也没有 `path.txt`。版本 `electron@43.1.0` 的安装脚本没有执行。
- 其他依赖存在：`pixi-live2d-display`、`vitest`、`@lancedb/lancedb`。
- 本机 Node 为 v24.19.0，满足 `engines` 要求。

### B2 构建产物过期，默认启动方式会运行上游昔涟 [S]

- `dist/` 在 13:49 构建，早于全部迁移改动。
  - `dist/main/main/index.js` 中没有身份代码，也没有 `app-identity.js`。
  - `dist/renderer/models/` 只有 `cyrene/`，渲染 bundle 引用 `models/cyrene`。
- `start.bat` 执行 `cyrene run`，即 `dist/cli`；`npm start` 执行 `electron .`，即 `dist/main`。两者都会以上游身份和昔涟模型启动。
- 未改包名时，上游身份的 userData 为 `%APPDATA%\live2d-cyrene`（本机目前不存在）。
- 只有重新构建（`npm run build`，或用 `npm run dev`）后，迁移改动才会生效。

### B3 人设混合：每个模式实际加载的内容 [S]

`mode-prompt-profile.ts:8-11` 定义了各模式加载的文件：

| 模式 | 加载顺序 | 昔涟残留 |
|---|---|---|
| chat | `chat_system` → `chat_identity` → `soul` → `canon_quotes` | 见下方 |
| work | `work_system` → `work_identity` → `work_remark` → `canon_quotes_lite` → 黄金裔名单 | 见下方 |
| learn | `learn_system` → `learn_identity` → `canon_quotes` | 见下方 |
| code | `code_system` → `code_identity` → `code_remark` → `canon_quotes_lite` → 黄金裔名单 | 见下方 |

**chat**

- `chat_system.md:9` 写的是"你当前代表 Cyrene Agent 中的昔涟"。
- `chat_system.md:15-41` 是"Cyrene 与底层模型"一节。
- `chat_system.md:84` 例句为"人家有一点担心"，`:170` 也是昔涟。
- 另注入风格 prompt（`build-options.ts:706-708`，只在 chat/learn）。默认风格 `styles/01_default.md:3,18` 写着"这是昔涟的自然状态"和"`人家`与`我`自然混用"。

**work**

- `work_system.md:9` 写"你就是此刻通过 Cyrene 与用户交流的昔涟"。
- `work_system.md:20-21` 要求"始终保持 soul 定义的昔涟人格 / 善用♪为结尾"。
- 其余残留：`:26-42`、`:148`、`:219`（例句"人家"）、`:251`、`:278`。
- 非 chat 模式都会额外注入 **`cyrene_harness.md` 全文**（`harness/adapter/prompt-builder.ts:53-55`）：
  - `:18` 规定"「人家」是主要自称"。
  - `:20-22` 规定 ♪ 的用法。
  - `:104` 起是"昔涟的人设"一节。
- `work_remark.md:1` 的标题是 "Cyrene"。

**learn**

- `learn_system.md:1`、`:3` 是昔涟（Cyrene），且"当前处于 Learn 学习模式"重复了一次。
- `learn_system.md:148` 错写为"Work 模式"。
- 同样注入风格 prompt 和 `cyrene_harness.md`。

**code**

- `code_system.md:5` 是昔涟，并错写为"Learn 学习模式"。
- `code_system.md:13` 要求"沉浸式扮演昔涟"；`:69` 也是昔涟。
- 同样注入 `cyrene_harness.md`。

**其他 prompt 层问题**

- **黄金裔子代理名单**在 work/code 注入（`task-character-pool.ts:22-31`，包括风堇等翁法罗斯角色），同时要求调用 `task` 时必须填 `companion_id`（`harness/builtin-tools.ts:50`）。
- **Work 模式不加载 `soul.md`**，流萤背景只剩 `work_identity.md` 的 7 行加上语录。
- **Chat 加载的 `soul.md` 是原始 YAML**，和 `source-persona/firefly.yaml` 完全相同（15154 字节），其中包含与 Chat 无关的 `work_mode`（萨姆三态）等段落。
  - 原 Firefly 的做法是把 YAML **投影**成分节 prompt，见 `character-policy.ts:267-380`。原样复制 YAML 不等价于原 Firefly 的效果。
- **`canon_quotes.md` 和 `canon_quotes_lite.md` 完全相同**，"lite"失去了意义。

**运行时硬编码中模型可见的"昔涟"** [S]

- `orchestrator/agent-runtime.ts:135-137`：心情观察器写"以下是昔涟的完整人格设定"，然后拼接 `soul.md`。
- `orchestrator/context-manager.ts:5`、`:81`：上下文压缩摘要把助手称为"昔涟"。
- `orchestrator/tools/history-tools.ts:93`：历史召回结果中的角色标为"昔涟"。
- `orchestrator/build-options.ts:265`：飞书渠道提示"语气仍是昔涟"。
- `permission.ts:247`：拒绝提示为"设置 → 昔涟 → 本地文件权限"。
- 通知与测试文本：`proactive-lifecycle.ts:167`、`toast/toast-service.ts:130/150/219`、`settings-facade.ts:97`（TTS 测试文本"我是昔涟…♪"）、`call/call-manager.ts`。
- 通话模式 prompt：`phone_identity.md`、`phone_system.md` 全部是昔涟。

**这些文件应保留的运行约束**（不属于角色内容）：

- `chat_system.md`：上下文与事实边界（`:45-59`）、即时聊天表达（`:63-87`）、回复长度（`:91-104`）、富文本与 mermaid 限制（`:108-127`）、知识性回复（`:131-142`）、句式（`:144-163`）、禁止行为（`:167-177`，只需替换名字）。
- `cyrene_harness.md:75-101`：
  - 角色风格只作用于面向用户的文字，不写入工具参数。
  - 优先级为"任务正确性 > 信息清晰 > 角色风格"。
- `work_system` / `code_system` / `learn_system` 中的流程、证据、Markdown 和工具规则。

### B4 朋友圈（Moments）默认开启，把翁法罗斯角色注入 Chat [S]

- `settings-facade.ts:44-45`：`momentsEnabled` 和 `chatMomentsContextEnabled` 默认都是 `true`。
- `moments-tools.ts:60-164`：三个工具标为 `chatBuiltin` + `modes:["chat"]`。结果是 Chat 默认带工具，改走 harness（`cyrene-agent.ts:449`）。
- `prompts/moments_personas/` 下的 13 个人设（万敌、丹恒、遐蝶……）会参与互动。
- 新 userData 首次启动时会套用这些默认值。

### B5 UI 可见品牌与美术仍为昔涟 [S]

- 聊天窗口：`src/renderer/react/index.html:6` 标题为"昔涟 · 聊天（React）"。
- 桌宠窗口：`src/renderer/index.html:6` 标题为"Cyrene"。
- 聊天头像：`ChatMessageList.tsx:106` 仍使用 `avatars/cyrene-avatar.png`。
- 界面文案：`zh-CN.json` 有 35 处"昔涟"，`en.json` 有 10 处"Cyrene"。
- 辅助窗口标题：`create-aux-windows.ts:140/191/250`。
- 美术素材：
  - 心情图 `public/feeling/`（9 张）已抽查 `开心.png`，确认是昔涟 Q 版形象。
  - 表情包 `public/stickers/` 52 张，默认启用（`sticker-settings.ts`，未配置的 id 视为 `true`）。
  - `public/status/` 和 `react/avatars/`（翁法罗斯角色头像）同属昔涟世界观素材。
- 流萤侧只有 `firefly-avatar.png` 可以替换。

### B6 测试与迁移不一致 [预测]

- `character-migration.test.ts:70-76` 会失败，原因就是 B5 中的头像、`zh-CN.json` 和 `index.html`。
  - 其余 3 个用例按静态核对应当通过：模型文件齐全、动作目标存在、prompt 与 worldbook 中不含昔涟。
- `live2d-actions.test.ts:50-54` 仍断言 `Wink~`，会失败。
- `play-live2d-action.test.ts:16,32,37,65` 仍断言 `眨眨眼 / 戴墨镜 / 墨镜 / 笑一笑`，会失败。

### B7（显示层，不阻断渲染）桌宠点击无反应 [S]

- `Firefly.model3.json` 的 `HitAreas` 只有 `Name/Id`，没有 `Motion` 字段。`manager.ts:57-58` 因此全部跳过，`InteractionController` 拿到的命中定义是空的。
- 原 Firefly 有点击、触摸和拖拽反应（`Firefly-Pet/src/main/character/character-policy.ts:184` `handleInteraction`）。

---

## 4. Live2D 资源与加载契约 [S]

| 项 | 结论 |
|---|---|
| 资源完整性 | 已迁入。`public/models/firefly/` 共 21 个文件，除 README 外与 `Firefly-Pet/src/renderer/models/` **md5 完全一致**；manifest 引用的 Moc、Physics、1 张纹理、6 个动作、11 个表情全部存在。 |
| 头像 | 已迁入。`firefly-avatar.png` 与 `Firefly-Pet/src/renderer/head_portrait/firefly.png` md5 一致（58ac461c…），**但 UI 尚未引用**（B5）。 |
| 加载路径 | 已迁入。`renderer/main.ts:77` 指向 `models/firefly/Firefly.model3.json`。 |
| 动作索引 | 已适配。Firefly 的动作条目没有 `Name`，`model-manifest.ts:16-29` 按序号字符串建立索引。 |
| 眨眼与口型 | 兼容。模型没有 `Groups.EyeBlink/LipSync`，但 `blink.ts:20` 和 `mouth-sync.ts:161` 直接写参数 ID；moc 中存在 `ParamEyeLOpen/ParamEyeROpen/ParamMouthOpenY`。**缺少运行证据**。 |
| 说话动作 | 已适配。`main.ts:85-90` 说话时播放 `Idle/0`，`restoreParameterIds: []`。 |
| 默认表情 | 已迁入。`main.ts:83` 重置为 `expression00`，与原 Firefly `manager.ts:179` 一致。 |
| 动作目录 | 部分迁入。`live2d-actions.ts` 有 10 项，与原 `firefly-actions.ts` 的映射一致；**缺 `被拖拽`（Tap/0）和 `不适`（expression7）**。 |
| 动作工具可用模式 | 行为差异。`play-live2d-action.ts:85` 的 `modes:["work"]` 与上游一致（`dist` 对照），Chat 中无法做动作；原 Firefly 在日常对话中调用 `play_live2d_action`（`character-policy.ts:339`）。 |
| 点击命中 | 冲突，见 B7。 |
| 旧模型 | 上游昔涟模型仍在 `public/models/cyrene/`，会随 vite 构建进入 `dist/renderer`。 |

---

## 5. 功能对照表

状态图例：**可复用**（新底座已有）/ **已迁入** / **未迁入** / **差异**（存在冲突或行为差异）/ **缺运行证据**

| # | 功能 | 原 Firefly（HEAD f6f20f9） | 新底座 | 状态 |
|---|---|---|---|---|
| 1 | Chat | `chat/chat-ipc.ts`；人设由 `character-policy.ts:267` 投影生成 | `CyreneAgent` → `runChatLoop`/harness；prompt 来自 `mode-prompt-profile.ts` | **可复用**；人设冲突（B3）；缺运行证据 |
| 2 | Work 任务执行 | 见注 1 | 见注 1 | **可复用 + 差异**；见注 1 |
| 3 | Browser | 只读抓取服务：`browser/browser-read-service.ts:67`，带授权、代理和 TLS | `fetch_url`、`web_search` 工具；Playwright MCP 默认关闭（`sync-mcp-builtin.ts:42-62`） | **可复用**；缺运行证据 |
| 4 | 文件选择 | `work-file-selection-store.ts:348`，上限 8 个文件、单个 1MB、总计 4MB（`work-file-types.ts:24-28`） | 工作区目录选择（`chats-ipc.ts:563-583`）+ 输入框附件 + `read_file` 绝对路径 | **差异**：新底座以工作区和附件为中心，没有"选定文件集"对象 |
| 5 | 分段读取 | 分段 + coverage | `read_file` 支持 `startLine`/`maxLines`（≤2000 行）、10MB，并返回真实 `totalLines`（`fs-tools.ts:152-177`） | **可复用**（等价的分页能力） |
| 6 | 部分读取确认 | `WorkFileReadAcceptance` full/partial（`work-task-coordinator.ts:199-213, 690`） | 未发现 coverage/acceptance 机制 | **未迁入** |
| 7 | 工具目标与完成证据 | 见注 2 | 见注 2 | **部分可复用**；"必读证据"**未迁入** |
| 8 | 审批与取消 | `runtime/approval/*`、permission profile、capability pipeline、sandbox | `permission.ts` 五档（默认只读）、审批、按运行取消；每次运行有独立 `AbortController`（`agui-bridge.ts`） | **可复用**；不迁入 Firefly 的 profile，以免出现第二个权限所有者 |
| 9 | 历史 | `WorkHistoryStore` 仅在进程内保存（`work-history-store.ts:122-123`）；`chat-history.ts` | `chats-store.ts` 持久化会话、transcript store、`recall_history` 工具 | **可复用**（能力更强） |
| 10 | 导出 | Markdown 导出：`work-task-coordinator.ts:328-354`、`shared/work-markdown.ts` | 未发现会话或任务导出（没有导出类 `showSaveDialog`，i18n 中也没有"导出"） | **未迁入** |
| 11 | 音乐 | QQ 音乐桌面端 GSMTC 控制（`qqmusic-desktop-bridge.ts:51,80`）+ mpv | 网易云 OpenAPI + mpv + 本地音乐，共 16 个 `music_*` 工具 | **差异**：平台不同，需要用户决定（§9） |
| 12 | TTS | GPT-SoVITS v2ProPlus，固定 seed，默认参考文本（`shared/tts-types.ts:20-40`） | `tts/gptsovits-engine.ts` 请求契约相同（POST `/tts`，text_lang/ref_audio_path/prompt_text/prompt_lang）；默认 `ttsEngine:"off"`（`settings-facade.ts:70`） | **可复用**；缺 seed 和流萤默认配置；缺运行证据（需要本机服务） |
| 13 | Memory | memory v2（写入策略、衰减、整合、排序） | L2 DMAE、实体图、用户画像、`memory-user-ipc` | **可复用**；**用户数据不迁移** |
| 14 | RAG / 知识 | 预建知识库（`rag/knowledge/*.json`、`vector_index.json`）+ 约 800 个角色与世界资源（lore、curated_cards、facts.yaml、stories） | 触发词式 worldbook（`rag/worldbook.ts`）+ LanceDB 文档索引 | worldbook **部分迁入**（5 个简写条目）；知识语料**未迁入** |
| 15 | 长任务与恢复 | 检查点与续跑：`recovery/checkpoint-store.ts:152`、resume-protocol | `run-store.ts`、`run-recovery.ts:24` `prepareHarnessRecovery`、`compaction.ts`、后台 shell job | **可复用**；缺运行证据 |
| 16 | 情绪驱动表情 | `embodiment-adapter.ts` / semantic-state 自动切换表情；聊天中可调用动作 | 心情观察器只驱动侧栏心情图；动作工具仅 work 模式可用 | **差异** |
| 17 | 桌宠点击与拖拽反应 | `handleInteraction`（click/touch/drag） | 拖拽时冻结帧并显示截图覆盖层；命中定义为空 | **差异**（B7） |
| 18 | 主动消息 | `proactive-scheduler.ts` | `proactive-lifecycle.ts`（标题为昔涟） | **可复用**；需替换品牌 |
| 19 | 子代理 | `subagents/*` | `task-runtime.ts` + 黄金裔名单 | **可复用**；名单冲突（B3） |

**注 1：Work 任务执行（#2）**

- 原 Firefly 的 `WorkTaskCoordinator`（`work-task-coordinator.ts:286`）流程是：
  1. 生成计划（`bounded-planner`）。
  2. 用户确认。
  3. 逐步执行（`plan-execution-entry`）。
  4. 逐步校验（`step-verifier`）。
- 新底座对应的能力：
  - harness 统一执行循环。
  - `plan-mode.ts` 状态机：NORMAL / DISCUSSING / REVIEW / EXECUTING。按 `:10` 注释，work 模式只是预留。
  - todo 工作笔记、ask 卡片、`run_verification` 工具。
- 不应把 coordinator 移入新底座，否则会出现第二个运行循环。

**注 2：工具目标与完成证据（#7）**

- 原 Firefly 把计划步骤绑定到工具目标，并强制要求"必读文件"的读取证据：
  - 提交 `069efc3`、`0fea49e`。
  - `work-file-evidence.ts`（未提交）。
- 新底座对应的能力：
  - `tools/registry/tool-evidence.ts`：写文件时的 diff 证据。
  - `execution-ledger.ts:33`。
  - `uncertain-effect-guard.ts`。
  - `run-settlement.ts:23`。
  - `run_verification` 工具。

**新底座特有、原 Firefly 没有的能力**：朋友圈、通话、微信/飞书/QQ 渠道、Cita、Learn、Code-Git、插件、LSP。其中 moments、phone、channels 带有昔涟人设。

---

## 6. 身份、用户数据目录与单实例 [S]

### 开发模式

- `app-identity.ts:4-5, 19-24`：
  - `app.setName("Firefly Cyrene Base")`
  - `userData = %APPDATA%\Firefly-Cyrene-Base`
- 调用点是 `index.ts:30`，早于单实例锁（`pre-ready.ts:26`）和所有服务构造。
- 模块顶层唯一出现的 `getPath("userData")` 在 `memory/entity-graph.ts:55`，是延迟执行的箭头函数，不会读到旧路径。

### 目录与单实例对照

| 应用 | userData | 单实例 | 本机目录 |
|---|---|---|---|
| 迁移版 | `Firefly-Cyrene-Base` | 有，按 userData 独立加锁 | 不存在（从未以迁移后身份启动） |
| 原 Firefly | `firefly-agent`（来自 package 名） | 源码中没有 `requestSingleInstanceLock` | **存在**，内容未读取 |
| 上游 Cyrene | `live2d-cyrene` | 有 | 不存在 |

- **结论**：重新构建后，开发模式**不会与原 Firefly 共用真实用户数据**，也不存在锁冲突。
- **风险**：在 B2 的过期构建上启动，会以上游 `live2d-cyrene` 身份运行。

### 打包配置冲突（尚未改动）

- `electron-builder.yml`：
  - `appId: com.cyrene.live2d`、`productName: Cyrene`、`artifactName: Cyrene-Setup-*`。
  - `publish` 指向 `Playa-0v0/Cyrene-Agent`。
- `package.json`：`name: live2d-cyrene`、`bin: cyrene`。
- 如果直接打包：
  - 会与已安装的上游 Cyrene 共用 appId（安装和卸载注册、AUMID）。
  - electron-updater 会**从上游 Cyrene 的 Releases 自动更新**，从而覆盖流萤版本。

---

## 7. 重复循环、所有者、权限与状态源 [S]

- **没有重复运行循环**：新底座中搜索不到 `WorkTaskCoordinator`、`FireflyAgentCore`、`firefly-harness`、`CheckpointManager`、`PersonaLoader`，说明未复制原 Firefly 的 orchestrator。
- **没有重复的设置所有者**：迁移未新增设置存储。
- **权限未放宽**：
  - `permission.ts`、`permission/`、`runtime-policy/`、`orchestrator/harness/` 在迁移时间段内没有改动。
  - `play_live2d_action` 的 `modes`、`effectKind` 和 `enabled` 与 `dist` 上游编译结果一致。
- **状态源与真源问题**：
  1. `soul.md` 与 `source-persona/firefly.yaml` 是两份相同内容。运行时只读 `soul.md`，`source-persona/` 没有任何代码引用。需要明确哪一份是单一真源。
  2. `canon_quotes.md` 与 `canon_quotes_lite.md` 完全相同。
  3. `plan_identity.md` 没有任何代码引用，是死文件。
  4. `worldbook/Cyrene.md` 内容已换成流萤，但文件名会进入条目 ID（`worldbook.ts:525` `wb_${fileName}_…`），生成的 ID 仍是 `wb_Cyrene_*`。
  5. 原 Firefly 工作区有 47 个未提交改动。如果以它为功能参考，基线不确定。

---

## 8. 许可证、版权与来源 [S]

| 对象 | 现状 | 风险或待办 |
|---|---|---|
| 新底座代码 | MIT，Copyright (c) 2026 Playa | 衍生版本必须保留原 LICENSE 版权行 |
| 原 Firefly 代码 | MIT，Copyright (c) 2026 Serendipity-wu02 | 合并后可同时列出两方版权 |
| 昔涟 Live2D 模型 | `MODEL_LICENSE.md`：作者"是依七哒"，2026-06 授权在本项目中使用和再分发 | 不再使用时应从构建中移除，并在移除前保留 MODEL_LICENSE |
| **流萤 Live2D 模型** | 见下方说明 | **需要用户确认**（§9 问题 1） |
| 角色 IP（流萤、昔涟） | 属米哈游 / HoYoverse | 非商用，需要同人声明 |
| `canon_quotes*.md` | 文件自述为"官方剧情文本"，逐字收录角色语音；原 Firefly 仓库的 `linguistics/voice/角色语音.md` 等同理 | 公开分发存在版权风险，建议改为少量摘录或改写 |
| 昔涟 UI 美术 | feeling（9）、stickers（52）、status、`react/avatars` | 来源未核对；流萤版本不应继续展示 |
| GPT-SoVITS 流萤微调权重 | `reference_manifest.json` 标注来源为 HF `Waterwzy/GPT-SoVITS-firefly-finetuning`，许可 AGPL-3.0 | 只通过 HTTP 调用本机服务、不随包分发，静态判断不产生 AGPL 义务。**该 manifest 的 `reference_text` 字段已损坏**（U+FFFD 替换字符，不可恢复），应以 `tts-types.ts:28` 为准 |
| 第三方组件 | `THIRD_PARTY_NOTICES.md` 已列出 MinGit（GPL-2.0） | 无新增 |

**流萤 Live2D 模型的具体情况**：

- 没有任何作者、来源或授权记录。模型 README 只写了"第三方资产，**不在公开仓库分发**"。
- 但公开仓库 `Serendipity-wu02/Firefly_Agent` 的 `origin/firefly-v1.1.0` 和 `origin/firefly-v2.4-alpha1` **已包含** `Moc_0.moc3`、`Textures_0_0.png`、`head_portrait/firefly.png`（`git ls-tree` 每个分支计数 3）；`origin/main` 中没有。这与 README 的声明矛盾。

---

## 9. 需要用户提供的精确信息（现有文件无法确定）

1. **流萤 Live2D 模型**
   - 作者、来源链接和授权范围（是否允许再分发）。
   - 是否要处理公开分支 `firefly-v1.1.0` 和 `firefly-v2.4-alpha1` 中已推送的模型文件（是否处理、如何处理由你决定）。
2. **心情图、表情包、状态图**：是否有流萤版素材？如果没有，选"隐藏"还是"暂时只显示文字"？
3. **子代理名单（黄金裔）**：
   - A. 去角色化，清空名单。现有代码已支持无名单路径（`harness/builtin-tools.ts:31,46,50`）。
   - B. 换成星核猎手成员，需要头像素材和名单。
4. **音乐**：保留网易云、迁入 QQ 音乐桌面桥，还是两者并存？
5. **Firefly 仓库的 47 个未提交改动**：统一工作台、思考强度、`work-file-evidence` 是否算作"原功能"？建议先提交或暂存，固定基线。
6. **打包身份**（只在要打包时需要）：appId、productName、安装包名、自动更新源（例如 `Serendipity-wu02/Firefly_Agent` 的 Releases，或关闭更新）。
7. **TTS 验收**（只在做 TTS 批次时需要）：本机 GPT-SoVITS 服务地址，以及参考音频的本机路径（原配置 `refAudioPath` 为空）。

---

## 10. 下一批实施指令

原则：

- 以新底座为主。只替换角色内容，保留运行约束。
- 不移植原 Firefly 的 orchestrator、权限或设置所有者。
- 不预建 Jev / DecisionProvider 插槽，不引入新架构。

每个批次都要能独立构建、测试和实机验收。

### 批次 1：流萤可见、人设单一、Chat 可用（建议立即执行）

> 可直接交给实施者的指令：
>
> **范围**：`E:\Codex\Cyrene-Agent-master`。只做下列改动，不修改权限、审批、harness 循环和设置结构，不新增模块。
>
> **1. 固定基线**
>
> - 在仓库根目录 `git init`，把当前状态作为首个提交。提交说明中写明："Cyrene 1.2.2 zip 解压 + 2026-09-21 迁移 WIP（21 个文件见 docs/migration/firefly-migration-audit-2026-09-22.md §1.1）"。
> - 只在本地提交，不推送；远程策略由用户决定。
> - 确认 `.gitignore` 已排除 `node_modules/` 和 `dist/main|cli|preload|renderer/assets`。
>
> **2. 恢复 Electron 二进制**
>
> - 执行 `node node_modules/electron/install.js`（需要网络；不改动 `package.json` 和 lock 文件）。
> - 确认 `node_modules/electron/dist/electron.exe` 已存在。
>
> **3. Prompt 角色层替换**（保留 §3 B3 列出的运行约束段落，只替换角色内容）
>
> - `chat_system.md`：
>   - `:9` 改为流萤。
>   - `:15-41` 改写为"流萤与底层模型"，保留"模型不等于角色、记忆边界、如实回答技术身份"这些约束。
>   - `:84` 改为"我有一点担心"。
>   - `:170` 替换名字。
> - `work_system.md`：
>   - 在 `:3, :9, :20-21, :26-42, :148, :219, :251, :278` 替换角色内容。
>   - 删除"善用♪为结尾"。
> - `learn_system.md`：`:1, :3` 替换角色，并去掉重复句；`:148` 把"Work"更正为"Learn"。
> - `code_system.md`：`:5` 替换角色，并把"Learn 学习模式"更正为"Code 模式"；`:13, :69` 替换角色。
> - `cyrene_harness.md`：
>   - **保留文件名**（`prompt-builder.ts:55` 引用它）。
>   - 按原 Firefly 的 `work_mode` 与萨姆三态重写为流萤执行人设，来源是 `source-persona/firefly.yaml` 的 `work_mode`。
>   - 保留 `:75-101` 的通用约束，删除全部"人家 / ♪"规则与昔涟示例。
> - `styles/01-05*.md`：按流萤口吻重写，保留 5 个 ID 和采样语义。`05_sweet` 改为"亲近"，不写撒娇和"人家"。
> - `phone_identity.md`、`phone_system.md`、`phone_style.md`：替换为流萤。
> - `work_remark.md:1`、`code_remark.md:1`：标题改为流萤。
> - `soul.md`：
>   - 从 `firefly.yaml` 投影为分节 Markdown：身份、背景、性格、喜好、语言习惯、禁用词、角色边界、日常语气。
>   - 不再保留原始 YAML，`work_mode` 段不放进 Chat。
>   - 在 `source-persona/firefly.yaml` 文件头注明"来源存档，运行时不读取"。
> - `canon_quotes_lite.md`：从 `canon_quotes.md` 精选不超过三分之一的条目。
> - `worldbook/Cyrene.md`：重命名为 `worldbook/Firefly.md`。
> - 删除 `plan_identity.md`（没有引用）。
>
> **4. 运行时字符串（模型可见）替换为流萤**
>
> - `agent-runtime.ts:135-137`：心情值列表保持不变，以免破坏 `sidebar.ts:91` 的图片映射。
> - `context-manager.ts:5, :81`
> - `history-tools.ts:93`
> - `build-options.ts:265`
> - `permission.ts:247`
> - `proactive-lifecycle.ts:167`
> - `toast-service.ts:130/150/219`
> - `settings-facade.ts:97`：去掉♪。
> - `call-manager.ts`
> - `create-aux-windows.ts:140/191/250`
> - 只做字符串替换，不引入新的配置层。
>
> **5. 子代理名单**：按用户对 §9 问题 3 的回答处理。默认执行 A：清空 `task-character-pool.ts` 中的 `TASK_CHARACTERS`，并同步更新以下测试：
>
> - `mode-prompt-profile.test.ts:20-21`
> - `task-character-pool.test.ts`
> - 受影响的 moments 测试
>
> **6. 朋友圈默认关闭**：`settings-facade.ts:44-45` 中，`momentsEnabled` 和 `chatMomentsContextEnabled` 的默认值改为 `false`。只改默认值，不删除代码。
>
> **7. UI 品牌**
>
> - `react/index.html:6` 改为"流萤 · 聊天"。
> - `renderer/index.html:6` 改为"Firefly"。
> - `ChatMessageList.tsx:106` 改用 `avatars/firefly-avatar.png`。
> - `zh-CN.json` 的 35 处、`en.json` 的 10 处改为流萤 / Firefly。朋友圈相关键可以保留。
> - feeling、stickers、status 素材按 §9 问题 2 的回答处理。回答前不改动。
>
> **8. 测试**
>
> - `live2d-actions.test.ts:50-54` 和 `play-live2d-action.test.ts` 改为流萤动作别名。
> - 新增一个断言：以下"模型可见"文件中不含 `昔涟|Cyrene|人家|♪`：
>   - `prompts/*_system.md`
>   - `prompts/*_identity.md`
>   - `cyrene_harness.md`
>   - `styles/*.md`
>   - `soul.md`
>   - 第 4 步列出的源码文件
>   - 例外：`moments_personas/` 和注释。
>
> **9. 验证**
>
> - 运行 `npm run build`、`npm run check:renderer`、`npm test`。报告真实的通过和失败数；对失败项逐条说明，不得跳过。
> - 用户实机执行 `npm run dev`，按以下项目验收：
>   - 桌宠显示流萤，眨眼、说话口型和 `expression00` 默认表情正常。
>   - 聊天窗口标题和头像为流萤。
>   - Chat 发送一句问候，回复以流萤口吻、不自称"人家"、不带♪。
>   - Work 模式要求读取一个文件，回复中角色一致，工具审批仍按"只读"档位弹出。
>   - `%APPDATA%\Firefly-Cyrene-Base` 被创建，`%APPDATA%\firefly-agent` 未被修改（时间戳不变）。
>
> **不做**：打包配置、音乐、TTS、知识语料、Jev/DecisionProvider。

### 批次 2：桌宠交互与具身（依赖批次 1）

> - **点击命中**：让 `manager.ts:50-70` 的 `buildHitAreaDefs` 支持没有 `Motion` 字段的模型。在 `src/shared/live2d-actions.ts` 旁增加一张"命中区 → 动作别名"映射表，至少包括：
>   - Head → `害羞` 或 `开心`
>   - Body → `打招呼`
>
>   不修改第三方的 `Firefly.model3.json`。
> - **补齐动作**：`live2d-actions.ts` 增加 `被拖拽`（Tap/0）和 `不适`（expression7）。拖拽开始时播放 `被拖拽`：在 `main.ts:343` 的 pointerdown 之后、`manager.pause()` 之前触发，或在拖拽结束后补播，由实机效果决定。
> - **Chat 中的动作**：`play-live2d-action.ts:85` 改为 `modes:["work","chat"]`，并设 `chatBuiltin:true`。`effectKind` 保持不变，不放宽权限。
> - **心情驱动表情**：心情观察器的心情值按原 `embodiment-adapter.ts` 的映射驱动表情：
>   - 开心 / 感动 → expression4
>   - 思考 → expression5
>   - 害羞 → expression10
>   - 担心 → expression7
>
>   经现有的 `LIVE2D_PLAY_ACTION` IPC 下发，不新增通道。
> - **测试**：命中映射、新动作、Chat 模式工具可见性。实机验收点击、拖拽、情绪表情。

### 批次 3：Work 文件读取证据与导出（原 Firefly 能力的适配迁入）

> - **读取覆盖**：`read_file` 的返回结果（`fs-tools.ts`）增加 `coverage: "full" | "partial"` 和实际读取的行范围。`totalLines` 已存在，据此计算即可。
> - **部分读取声明**：在 `work_system.md` 和 `code_system.md` 加入约束——结论基于部分读取时，必须说明已读范围，并询问用户是否接受部分范围。这是原 Firefly `WorkFileReadAcceptance` 的等价表达，不复制 coordinator。
> - **必读文件证据**：用户在本轮明确附加或引用的文件，在运行收尾时检查是否至少读取过一次。复用 `execution-ledger` 或 `tool-evidence` 的已有记录，未读的文件作为 `uncertain` 提示给用户，而不是静默宣告完成。
> - **会话导出 Markdown**：把 `Firefly-Pet/src/shared/work-markdown.ts` 的渲染逻辑改写为读取 `chats-store` 的会话，经 `showSaveDialog` 保存；入口放在现有会话菜单。
> - **测试**：参考原 `tools/test/runtime/work-file-segmentation.test.ts`、`work-markdown-export.test.ts` 的用例语义改写。

### 批次 4：语音与音乐（依赖 §9 问题 4、7）

> - **TTS**：GPT-SoVITS 设置增加 `seed`（默认沿用原 `DEFAULT_GPTSOVITS_SEED`）和流萤默认参考文本（`Firefly-Pet/src/shared/tts-types.ts:28`）。默认引擎保持 `off`，由用户在设置中开启。实机验收需要本机服务。
> - **音乐**：如果用户选择迁入 QQ 音乐，把 `qqmusic-desktop-bridge.ts` 和 `qqmusic_gsmtc.ps1` 适配为 `music/music-router.ts` 下的一个 provider，复用现有 `music_*` 工具与 mpv；不新增第二个音乐服务。

### 批次 5：知识与世界观

> - 把 `Firefly-Pet/src/main/character/resources/{knowledge/curated_cards, knowledge/facts.yaml, world/lore, character/experience}` 转写为 `prompts/worldbook/*.md` 条目，写明触发词、优先级和内在价值。
> - 控制条目总量，不移植原 Firefly 的 RAG 引擎和预建向量索引。
> - `world/npc`、`world/quests` 等大体量语料暂不导入，另行评估后再用新底座的文档索引。

### 批次 6：打包身份（只在需要打包时执行，依赖 §9 问题 6）

> - 修改 `electron-builder.yml` 的 `appId`、`productName`、`artifactName`、`menuCategory`、`publish`；修改 `package.json` 的 `name`、`description`、`bin`。
> - 从构建中移除 `public/models/cyrene/` 和 `assets/models/cyrene/`。
> - 为流萤模型补充 MODEL_LICENSE（依赖 §9 问题 1）。

**Jev / DecisionProvider**：以上批次全部完成，并经实机验收稳定后再启动。本轮和以上批次都不预建插槽。
