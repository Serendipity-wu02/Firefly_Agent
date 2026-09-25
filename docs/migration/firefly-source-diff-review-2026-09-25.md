# Firefly 迁移源码差异复核与集中实机验收

## 基线与证据边界

- 当前迁移目录 `E:\Codex\Firefly-Agent-migration`：`codex/firefly-migration`，复核起点 `8775af95008c9f5b8922ec94cef6491d145df0a6`；起点工作树干净。本报告及下述死代码删除尚未提交。
- 迁移工作来源 `E:\Codex\Cyrene-Agent-master`：`main`，`46610b9df82eecbfea03dffe7de1f340bf42080c`，610 项未提交状态；旧 Firefly `E:\Codex\working\Firefly-Pet`：`firefly-v1.1.0`，`f6f20f962568432f782abe0bdff5b2f9e2686498`，47 项未提交状态。两目录均未修改。
- **原始 Cyrene 对照点**：上游 `Playa-0v0/Cyrene-Agent` 的 `664c6022e428f6301c2b59b12c88efb1997a6ed7`，提交时间 2026-09-21 12:37 +08:00，版本 `1.2.2`。历史审计 `firefly-migration-audit-2026-09-22.md:21-55` 记录 ZIP 解压在同一时段，原目录当时没有 Git。与后建本地基线 `46610b9` 的树比对：共同路径有 1885 个 Git blob 完全相同；另有 127 个仅 CRLF/LF 不同；仅 19 个同路径文件内容不同，均在审计记录的最初角色／资源改动范围。另外本地基线新增 31 个资源、测试和记录路径，上游有 18 个主要为设计文档／旧生成物的独有路径。相邻上游提交 `ae7c3409` 为 25 个内容差异，之后的 `87ee73a6` 为 22 个，故选用差异最小且时间吻合的 `664c6022`；不使用 9 月 8 日 `v1.2.2` 标签或 9 月 23 日上游最新版本。原 ZIP 没有提交标识，以上是可由 Git 树和当时记录复核的最精确来源；不把本地 WIP 误称原版。
- 下表“源码依据”均指当前迁移目录；旧版／上游另行注明。`[S]` 本轮静态核对；`[T]` 既有记录或本轮定向测试；`[R]` 既有实机记录。既有记录不等于本轮重测，更不等于未覆盖的链路已经通过。

## 两条对照

| 功能 | 原始 Cyrene（`664c6022`） | 旧 Firefly（含实际工作树） | 当前实现与状态 | 源码依据 | 自动验证 | 待实机验证 | 建议处理 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 主入口与 Agent Loop | `CyreneAgent`：无工具 Chat 走 chat-loop，其余走 harness | 独立 FireflyHarness、Work 协调器 | **底座原样复用**循环；只传入本轮 Work 读取范围，无第二套循环 | `src/main/orchestrator/cyrene-agent.ts:447-488`；`src/main/orchestrator/harness/cyrene-harness.ts`；旧 `src/main/work/work-task-coordinator.ts:286` | `[S]` harness 主文件与上游同内容；既有完整测试记录见 Batch 6 | Chat／Work／Code 各一次终态 | 保留现有所有者；不叠加旧 Harness |
| 人设、称呼、模式 Prompt | 昔涟身份、system、worldbook | 流萤 character-policy 与 YAML 人设 | **已替换／已适配**：四模式组装 Markdown soul、示例及环境称呼；系统约束保留 | `src/main/orchestrator/mode-prompt-profile.ts:8-20`；`src/main/orchestrator/build-options.ts:831-872`；`src/main/orchestrator/environment.ts:167-188`；`prompts/soul.md:1`；`prompts/chat_identity.md:1` | `[S]` 加载顺序与默认称呼；Batch 1 已有 Chat 记录 | 自定义称呼优先、无设置时“开拓者”；核对实际语气与共同经历 | 不按旧 YAML 长度补写；用户经历仅当前对话／有效记忆 |
| 世界书／知识 | DMAE worldbook、按触发与预算注入 | facts.yaml、精选卡、旧 RAG | **已适配**流萤关系与匹诺康尼条目；大规模旧语料**尚未迁入**，并非全部应迁 | `src/main/rag/index.ts:45-49,264-288`；`src/main/rag/worldbook-constants.ts:39`；`prompts/worldbook/firefly-relations.md:1`；旧 `src/main/character/resources/knowledge/facts.yaml` | `[T]` `worldbook-firefly.test.ts` 实际加载／触发／非触发 | 一次相关与一次无关话题，不要求逐条调用 | 先体验；需更多旧知识时逐项决定，不常驻灌入 |
| 12 位 task 展示 | 黄金裔展示素材与 task 工具 | 独立子代理运行时 | **已替换／底座原样复用**：12 名单、PNG、lease 与 task 事件共用；职责仍为 general/document/search | `src/shared/task-characters.ts:6-19`；`src/renderer/react/character-portraits.ts:1-30`；`src/main/tasks/task-character-pool.ts:9-30`；`src/main/orchestrator/harness/builtin-tools.ts:45-69` | `[T]` Batch 3／5 映射测试；12 文件存在 | 运行、完成、失败、历史头像按同一任务 ID 展示；未逐人实机 | 卡芙卡显示名正确，保留实际文件名 `卡夫卡.png`；不加权限 |
| 朋友圈角色 | 原黄金裔角色卡、动态机制 | 无等同机制 | **已替换／底座原样复用**：12 同名卡与共用头像，默认关闭；历史 `cyrene` 作者标识兼容 | `src/main/moments/character-personas.ts:195-260,385-389`；`src/main/settings/settings-facade.ts:45-48`；`src/renderer/react/character-avatars.ts:1-7`；`prompts/moments_personas/_header.md:1` | `[T]` 12 卡目录加载测试，非真实模型逐人运行 | 只有用户主动开启后检查动态、@ 名称与头像 | 不默认开启；不改写历史作者与关系 |
| Live2D 资源与动作 | 昔涟模型、动作工具 | 流萤模型／点击配置 | **已替换／已适配**：Firefly manifest 有 3 Idle、3 Tap、11 表情、Head/Body；动作别名只映射真实资源 | `src/renderer/public/models/firefly/Firefly.model3.json:4-42`；`src/shared/live2d-actions.ts:1`；`src/renderer/live2d/manager.ts:137-166,238-268` | `[T]` Batch 2 资源／失败／复位测试；`[R]` 一次 Chat Tap/1 → Idle/0 | 连点、重载、动作失败；一次真实 Chat 工具回执 | 不用无资源动作冒充；复位失败不能写完成 |
| 点击、拖动、心情、帧率 | 旧点击与 ticker | 桌宠拖动／表情 | **已适配**点击与拖动区分、心情过期事件过滤；ticker 上限 60，不是实测 60 FPS | `src/renderer/live2d/interaction.ts:29-82`；`src/renderer/live2d/expression-state.ts:18-48`；`src/renderer/main.ts:97-101,333-406`；`src/renderer/live2d/manager.ts:16,120` | `[T]` Batch 2／5；`[R]` 用户确认拖动、点击正常 | 连点、表情恢复、真实心情变化和持续帧时间 | 不叠加第二循环；无测量时仍标未测 |
| Chat／Work／Code／Learn | 四模式共用界面与桥、Chat/Harness 分流 | Chat、Work | **底座原样复用**入口；Chat 单次派发／终态已修 | `src/main/agui-bridge.ts:533-650`；`src/renderer/react/features/chat/pages/ChatPage.tsx:1038-1067`；`src/main/orchestrator/cyrene-agent.ts:447-488` | `[T]` Batch 1 队列及终态测试；既有一次 Chat 实机 | 四入口各确认载入，Work 自动派发，Code 工作区 | 不删除现有模式／改变交互 |
| Browser／文件选择／分段 | `fetch_url`、web_search、read_file、工作区与附件 | BrowserReadService 含目标／代理约束；所选文件集与分段 | **已有等价实现／行为差异**：网页抓取、工作区读取可用；旧 Browser 特定目标授权及选集语义未逐一移植 | `src/main/orchestrator/tools/builtin-tools/fetch-url-tool.ts:272`；`src/main/orchestrator/tools/fs-tools.ts:44-154`；`src/main/chats/chats-ipc.ts:374-406`；旧 `src/main/browser/browser-read-service.ts:67` | `[T]` 现有工具测试；Work 公开样本记录 | 公开网站与公开文本，确认授权、只读范围 | 不因名称不同判缺失；旧特殊授权行为待体验决定 |
| Work 必读证据、部分确认 | 分段 read_file，无本次必读结算 | `work-file-evidence.ts`、范围接受 | **已适配**：仅显式必读才建 Main 范围；hash、行区间、runId 与真实成功工具结果结算；超 2000 行可选完整或部分 | `src/main/chats/chats-ipc.ts:374-406`；`src/main/chats/work-read-scope.ts:6-44`；`src/main/chats/work-file-evidence.ts:5-59`；`src/main/agui-bridge.ts:450,985` | `[T]` Batch 3 完整／部分／失败单测；`[R]` 公开样本完整、部分、派发 | 执行中失败与范围变更后的提示 | 不把选中文件、模型文字或历史读作本次证据 |
| Work 状态、历史、导出 | 持久会话、harness run store，未有本类导出 | 内存 WorkHistoryStore、Markdown 导出 | **底座原样复用／已适配**：任务状态与持久历史；结束任务快照经 Main 保存对话框导出 | `src/main/chats/chats-store.ts:1-45`；`src/main/chats/work-markdown-export.ts:3-34`；`src/main/chats/chats-ipc.ts:97-115`；`src/renderer/react/features/chat/components/ConversationSidebar.tsx:259,376` | `[T]` 导出／取消测试；`[R]` 公开样本导出与取消 | 覆盖已有文件、失败任务导出；细节错误目前只保证终态标签与展示回答，不导出内部工具参数 | 不扩大导出到原文件正文；错误明细是否增加待用户看样例 |
| 审批、取消、恢复 | `permission.ts`、tool-dispatcher、run store 与恢复 | 独立授权及检查点 | **底座原样复用**；仅角色拒绝文案已替换 | `src/main/permission.ts:228-263`；`src/main/orchestrator/harness/tool-dispatcher.ts:147-150`；`src/main/orchestrator/harness/run-recovery.ts:23`；`src/main/orchestrator/cyrene-agent.ts:447-488` | `[S]` dispatcher 与恢复文件和上游同内容；既有相关测试 | 一次安全审批／取消及重开保留，勿用私人目标 | 不导入第二个授权、循环或状态所有者 |
| Memory、历史检索、长任务 | L2 DMAE、实体图、recall_history、恢复 | Memory v2／RAG／checkpoint | **已有等价实现／行为差异**：用户私有旧库未迁；旧策略细节不保证等同 | `src/main/rag/index.ts:245-288`；`src/main/orchestrator/tools/history-tools.ts:40-99`；`src/main/orchestrator/harness/run-recovery.ts:23`；旧 `src/main/memory/memory-service.ts` | `[S]` 接线；旧数据未导入 | 在公开内容中验证记忆边界与恢复，不要求导入旧私有数据 | 保持独立用户数据；不自动写记忆 |
| GPT-SoVITS／TTS | 通用设置、会话、播放／取消 | GPT-SoVITS 流萤参数与本机资源 | **已适配**通用 `/tts` 协议；默认 off、地址／音频／提示文本为空，外部服务自备 | `src/main/settings/settings-facade.ts:71-86`；`src/main/services/tts/tts-synthesis-service.ts:188-208`；`src/renderer/settings/tts/panel.ts:440-453` | `[T]` Batch 4 成功／失败／取消／迟到测试；无真实服务 | 配置后才测合成、播放、停止；当前服务未配置 | 不复制 E:\GPT-SoVITS 或猜参数 |
| QQ Music | 网易云服务／播放器 UI | QQMusic.exe GSMTC、音乐上下文与偏好 | **已替换／实现不完整**：QQ 状态及基础控制接入工具权限与 UI；旧音乐上下文、偏好服务没有接线 | `src/main/music/bootstrap.ts:20-46`；`src/main/music/qqmusic-service.ts:106-152`；`src/main/orchestrator/tools/music-tools.ts:4-47`；旧 `src/main/music/music-context-service.ts:98`、`music-preference-service.ts:275` | `[T]` Batch 4 单测；`[R]` 已同意的底层暂停／恢复（非界面审批） | Firefly 内工具审批、取消与状态展示；用户许可后才操作播放 | 不自动带入旧 Memory 服务；偏好／上下文是否需要由体验决定 |
| 网易云残留 | 网易云 OpenAPI、mpv 与独立播放器 | 无 | **已删除**生效注册、窗口和 vendor；本轮再删仅测试引用的旧视图映射；通用 mpv 探测仍供飞书音频转码 | `src/main/music/bootstrap.ts:20-46`；`src/main/channels/adapters/feishu/audio-transcode.ts:5`；`electron-builder.yml:18-24` | `[S]` 静态引用核对；本轮类型检查 | QQ 页面不出现网易云控制 | 不删共用 mpv 功能／旧用户历史 |
| 数据读取与错误态 | 既有 settings/chats store；原异常可回退空值 | Chat／Work 历史与设置分散存储 | **已适配**：ENOENT 与解析／读取失败分开，失败锁定写入并通过 IPC 拒绝；初次空列表事件原始根因仍**证据不足** | `src/main/chats/chats-store.ts:43-45,78-155`；`src/main/settings/model-settings.ts:452-505`；`src/main/settings/settings-facade.ts:402-438`；`src/renderer/react/features/chat/components/ConversationSidebar.tsx` | `[T]` 8 文件 75 项读失败回归见可靠性记录；`[R]` Main 曾加载 1 模型、6 Chat、4 Work | 正常退出重开后逐项看列表；异常时保存脱敏错误码与时间 | 不以一次重启恢复证明根因；不清空、不重复迁移数据 |
| 绿色主题与 Markdown | 昔涟粉色变量 | Firefly 绿色 | **已替换**共享 token，旧 `--rb-pink-*` 名称作为 CSS 兼容别名实际值为绿；语法／警告色独立 | `src/renderer/ui/tokens.css:10-18,43-44`；`src/renderer/ui/theme.css:51-59`；`src/renderer/react/features/chat/components/StreamdownMessageContent.css:14-25` | `[T]` Batch 4 计算样式核对；非全页面实机 | 设置／Chat／Work／Code 的焦点、悬停、选中、弹层、表格、行内代码 | 先集中视觉验收；不机械清除变量名或语义色 |
| 身份、更新、打包与资源 | 上游产品身份／发布、旧角色资源 | 旧 Firefly 安装与数据目录 | **已替换／已删除**：Firefly 链接、包名、appId、独立 `%APPDATA%\Firefly`；自动更新关闭；旧模型源文件已删；保留兼容命令／键与上游许可 | `package.json:2-14`；`electron-builder.yml:1-55`；`src/main/app-identity.ts:4-24`；`src/main/updater/github-app-updater.ts:8-22`；`README.md:36-50` | `[T]` 已有解包／截图助手记录；未做安装器 | 下一轮须确认实际启动迁移目录构建及资源、设置、历史 | 素材再分发范围和安装器／更新元数据仍是公开发布前项 |

## 明确差异与残留处置

1. **本轮已清除**：`src/shared/music-view-state.ts` 的 `deriveNeteaseViewState` 及唯一引用它的 `src/renderer/settings/music-view-state.test.ts`。真实界面入口为 `src/renderer/settings/music/qqmusic-panel.ts`；旧视图映射没有运行 import，删除不改变音乐控制、审批或用户数据。
2. **保留兼容标识**：`cyrene` CLI、`cyrene-chats`／`cyrene-runs` 数据键、`cyrene.*` 事件名、朋友圈旧作者 ID、`--rb-pink-*` CSS 变量名、截图助手文件名与 `cyrene-skills` 来源名称均存在实际读取方，不能为改名直接删除。`src/main/channels/settings-store.ts:50-75` 的 `obf:` 兜底 key 派生还包含 userData 路径与应用名：曾经复制过来的渠道凭据若采用此兜底格式，新目录不具备原 key；当前没有对应用户配置证据，本轮不读私人值、不迁数据、不改加密格式，实机检查渠道时若异常再处理。
3. **第三方／历史**：`MODEL_LICENSE.md`、`THIRD_PARTY_NOTICES.md`、历史迁移记录以及插件目录显示的 `Cyrene-Plugins` 是来源／外部名称，不能伪装为 Firefly 原创。`assets/ui/cyrene-surface-pattern.svg` 仍由两处 React CSS 引用，是背景图而非昔涟角色图；不在无新设计时删除。`src/main/sim/scenarios/four-tier-mix.ts` 的昔涟文字属于未在正常运行入口注册的模拟样本，保留时不能用它证明正式 Prompt 污染。
4. **仍待决定／缺实机证据**：旧音乐偏好与上下文、旧 Browser 的目标授权细节、Work 导出错误明细形式、全页面视觉状态、12 位逐一展示、真实语音、Firefly UI 内 QQ 审批、持续 60 FPS、安装器与素材再分发。不为消除差异更换底座行为。
5. **已删除路径核对**：昔涟模型、旧 task 图、旧朋友圈卡、网易云 Main／窗口／vendor 和音乐页没有生效 import／注册；`electron-builder.yml` 对旧模型目录另留排除保险。`mpv-controller.ts` 仍由飞书音频转码调用，不属于可全删的网易云模块。当前 `src/renderer/public/models/` 实际包含流萤模型；隐藏旧图不等于清理源资源，因此本项以目录与引用双重核对。

## 下一轮一次性实机清单

下一轮从 **`E:\Codex\Firefly-Agent-migration` 执行 `npm run start`**，让 Electron 加载该目录的 `dist/main/main/index.js`、`dist/preload/preload/index.js` 与最新的 `dist/renderer`。这三处构建入口均已存在；本轮只改了没有运行 import 的音乐死代码，Renderer 已重新构建。当前迁移目录没有 `release/win-unpacked/Firefly.exe`，不要拿 `E:\Codex\Cyrene-Agent-master` 的解包产物或旧 Firefly 当本轮版本。正式验收前核对进程加载路径与 `%APPDATA%\Firefly`。下列运行记录只摘录时间、runId、状态、错误码与数量；不发送密钥、聊天正文、隐藏思考、曲名或私人路径。正常模式日志级别为 warn，详细运行轨迹要以页面运行状态／持久化 runSnapshot／主进程运行事件为准，不能把日志缺行推定为未执行。

| 验收项 | 从哪里进入 | 配置／公开文件 | 操作 | 应显示 | 执行记录确认 | 失败时保留 |
| --- | --- | --- | --- | --- | --- | --- |
| Chat 与称呼 | 顶栏 Chat → 新对话；设置 → 用户信息 | 已有模型档案；无需新密钥 | 发两条短公开消息，含一条明确称呼偏好；不要工具 | 每条一次回复且结束回空闲；默认／自定义称呼正确，无虚构共同经历 | 两条消息各自 `runSnapshot.runId`／终态，Main 的 RUN_STARTED/RUN_FINISHED 对齐 | 会话 ID、两次 runId、错误码、脱敏截图与时间 |
| Work 自动派发 | 顶栏 Work → 项目工作区 | 公开临时目录，不用私人文件 | 新任务只发送一次，勿用第二消息或切会话催发 | 自动开始、一次执行、结束后队列与输入区空闲 | 当前任务 runId、Main 运行登记与 terminal；无第二个 run | 任务 ID、队列状态、时间与脱敏错误 |
| 必读完整／部分／失败 | Work 输入框附件与“本任务必须读取所选文件” | 公开小文本及 >2000 行文本 | 小文件要求全文；大文件在范围对话框选完整或只读前 2000 行；失败样本只用公开文件 | 每文件本次覆盖行数；部分明确未覆盖全文；失败不宣称完成 | 工具 `read_file` 成功区间、runId、Main `workReadReport`；不以模型回答代替 | 范围选项、文件版本 hash 的非私人摘要、report 状态和错误码 |
| Markdown 导出 | Work 已结束任务 → 侧栏右键 → 导出 Markdown | 公开已结束任务 | 保存一次，再取消一次；覆盖已有文件仅在愿意时确认 | 只含任务状态、步骤状态、最终回答、读取说明；取消不变任务 | 导出 IPC `CHATS_EXPORT_WORK_MARKDOWN` 结果与文件内容的脱敏核对 | 导出前后任务 ID、取消／覆盖结果；不贴原文件正文 |
| 历史与配置重开 | Chat／Work 侧栏及设置 → API 设置 | 原有个人配置，不展示值 | 记录列表数量；正常退出后从同一构建重开 | 模型档案、Chat／Work 列表与退出前一致；失败显示错误而非“暂无” | Main 只看 `readFailed` 与三类数量；Renderer 列表可见计数 | 启动路径、时间、三项计数、脱敏错误码；勿上传历史正文 |
| 桌宠与动作 | 桌宠模型；Chat 的现有动作工具开关 | 当前流萤模型 | 头／身体单击、拖动松手、连续点击；可用动作由 Chat 工具触发一次 | 拖动不误点击；动作开始、结束后复位；心情仅在真实新事件时变 | 同一动作请求的发送、加载、开始、完成／复位回执；ticker 帧率另测 | 动作标识、阶段和耗时；录像遮住私人窗口 |
| 子任务与朋友圈 | Work／Code task 展示；侧栏动态 | 12 PNG 与 12 卡已随构建；朋友圈默认关闭 | 用公开任务看执行／完成／失败与历史头像；朋友圈仅用户主动开启时查看 | 姓名／头像一致；卡芙卡显示正确；默认无自动朋友圈 | task 事件 taskId／companion_id／终态；卡加载数量及跳过日志 | 缺失的具体姓名、资源路径及任务 ID，不贴用户数据 |
| QQ Music | 设置 → 音乐工具 → QQ Music；Work 工具面板 | 用户已运行 QQMusic.exe；播放控制另须用户即时同意 | 先只读；同意后才试一次安全控制与审批／取消 | 显示真实会话状态；工具审批与结果区分命令提交、状态观察；不误控其他播放器 | toolCallId／runId、审批结果、`commandSubmission` 与 `playerStateObservation` | 状态码、审批结论、时间；不记曲名；未知状态不自动恢复 |
| 语音 | 设置 → TTS；Chat 回复的朗读／停止 | GPT-SoVITS 服务、参考音频和对应文本当前**未配置** | 未配置时只看缺项提示；以后用户自行配置再试一轮回复与停止 | 文字回复不被服务错误阻断；播放／停止有真实回执 | TTS session 状态与请求结果，不能用音频请求发出等同播放成功 | 仅错误码与时间；不保存音频、URL、密钥 |
| 主题与保留模式 | 设置、Chat、Work、Code、Learn 及现有弹层／审批 | 本地展示内容 | 依次看默认、悬停、焦点、选中、禁用；表格／代码／引用与链接 | Firefly 绿强调、清晰可读；错误／警告保留语义色，无错误角色图 | 此项以计算样式或页面截图核对，不用模型调用证明视觉 | 页面名、组件名、状态及脱敏截图 |

## 本轮验证与边界

- 本轮只删除了两个已无运行引用的网易云视图文件，报告为新增文档。受影响的 QQ 接线测试 3 文件／14 项通过；`npm run check:renderer`、`npx tsc -p tsconfig.main.json --noEmit`、`npm run build:renderer`、`git diff --check` 通过。Renderer 构建有既有大 chunk 警告。不重跑全量测试、不启动应用、不请求模型或控制播放器；构建只更新迁移目录的 Renderer `dist`，未更新解包产物。
- 首次空列表事件根因未知。近期可靠性修复确认 Main 读取失败不再伪装为空列表且不能写回覆盖；既有 Main 记录为 1 项模型档案、6 Chat、4 Work，最近一次 UI 显示未得到明确答复，仍待上表重开验收。
- 本地解包运行与截图助手调用已有记录，不代表安装器、公开素材许可、真实语音、QQ UI 审批、持续帧率已验证。本轮不提交、推送、发布或修改旧工作目录。
