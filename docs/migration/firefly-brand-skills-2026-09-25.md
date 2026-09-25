# Firefly 品牌、角色、Skills 统一与集中验收（2026-09-25）

## 基线和范围

- 工作目录：`E:\Codex\Firefly-Agent-migration`；分支 `codex/firefly-migration`；HEAD `8775af95008c9f5b8922ec94cef6491d145df0a6`；origin 为 `https://github.com/Serendipity-wu02/Firefly_Agent.git`。
- 起点保留两项旧音乐视图文件删除和 `firefly-source-diff-review-2026-09-25.md`，没有覆盖已有工作树。
- 原始底座版本依据继续沿用该对照报告，不把已改动的 Cyrene-Agent-master 当原版。本轮没有重新审计全仓。
- 两原目录只读核对；Cyrene-Agent-master 仍为 610 项、旧 Firefly-Pet 仍为 47 项（`status --porcelain=v1 --untracked-files=all`）。
- 不更换 Agent Loop、审批、工具权限、记忆和任务所有者；不加入 Jev，不迁入第二套 Harness，不提交、推送或发布。

## 实际修正

| 范围 | 修改与原因 | 当前源码依据 |
| --- | --- | --- |
| Agent/Harness 名称 | 原入口、类型、函数与导入改为 Firefly；执行流程保留。不是新增 Harness | `src/main/orchestrator/firefly-agent.ts`、`harness/firefly-harness.ts`、`src/shared/run-terminal.ts`，对应调用方和测试 |
| 执行人设资源 | 内置改为 `firefly_harness.md`；打包用户目录旧文件名仍兼容读取，不覆盖用户自定义内容 | `prompts/firefly_harness.md:1`、`src/main/orchestrator/harness/adapter/prompt-builder.ts:55`、`src/main/external-content-paths.ts` |
| **真实语气遗漏** | 旧报告未覆盖：tone-rules.md 原先不存在，实际兜底仍规定“人家”、♪、花/涟漪意象、禁止教学/分点。已替换为流萤，并补同内容外部 prompt；这不是单纯更名 | `src/main/orchestrator/tone-injector.ts:10`、`prompts/tone-rules.md:1` |
| 模式/事实边界 | 仍在原位置注入；我、偏好优先→昵称→开拓者；任务模式允许步骤/解释，世界观不冒充共同经历，工具/审批约束优先 | `mode-prompt-profile.ts`、`build-options.ts:672`、`prompts/soul.md`、`tone-rules.md` |
| 语气 Skill | 原先仍有旧人物九份台词与不存在的自动场景分类说明。改为九份明确标为“表达示例”的流萤场景资料，不冒充官方引文；不恢复 embedding 分类 | `skills/firefly-original-voice/SKILL.md` 及九个 references |
| 八个自有 Skills | 名称、目录、manifest、交叉引用、Plan 注入、快照排除清单同步；保留教程、试卷、Obsidian、文件安全和插件能力 | `skills/firefly-*`、`src/main/orchestrator/build-options.ts:758`、`scripts/packaging/build-skills-snapshot.mjs` |
| Skill 兼容 | 精确八 ID 别名；兼容禁用状态、模式覆盖、旧斜线命令、工具白名单与用户目录覆盖，防止更名重启能力。新设置优先，未设置模式继承旧设置；正文缓存统一并在重注册时失效 | `src/main/skills/skill-id-aliases.ts:1`、scanner/registry/index/commands/tools/slash-activation、settings-facade、external-content-paths |
| Mermaid/SVG | 查到 Mermaid 仍硬编码粉色。改为既有 Firefly 色值；diagram Skill 色值同步，不改错误/警告/语法颜色 | `src/renderer/react/features/chat/components/MermaidBlock.tsx:15`；`skills/firefly-diagram/SKILL.md`；来源 `react-root.css:2-17` |
| UI/内部方法 | Chat 头像组件、朋友圈内部方法及调用方、日志标签改名；不改历史作者 `cyrene` 或持久化开关值 | ChatMessageList、moments-*、reaction-queue、logger-tags、设置保存状态模块及测试 |
| 资源 | 装饰 SVG 改为 firefly-surface-pattern 并同步 CSS/测试；桥类型文件改为 firefly.d.ts；删除无引用且默认表情字符串已损坏的旧 expression-reset.ts，实际 FireflyExpressionState 不变 | `assets/ui/firefly-surface-pattern.svg`、`src/renderer/types/firefly.d.ts`、`src/renderer/live2d/expression-state.ts` |
| 人物名称 | 台词参考标题“卡夫卡”改为已确认的“卡芙卡”；不重写原作引文、不重新建立角色池 | `prompts/canon_quotes.md` |
| 文档/CLI | 当前指南品牌更新；修复问题模板旧数据目录；新增 firefly CLI、保留 cyrene 同入口别名；补当前架构和历史索引。Learn 文档纠正“不会上传”的过度承诺 | README、README.en、DEVELOPMENT、docs/user-guide、docs/architecture/firefly-runtime.md、docs/archive/README.md、package/lock、src/cli |
| 上游与许可 | 原 MIT、版权、第三方资源许可不改写；插件 SDK/市场/示例保留真实上游身份，描述改为第三方而非 Firefly 官方 | LICENSE、THIRD_PARTY_NOTICES、MODEL_LICENSE、firefly-plugin-dev |

### 八项精确映射

| 旧 ID（兼容读取） | 当前内置 ID | 能力 |
| --- | --- | --- |
| cyrene-diagram | firefly-diagram | SVG 学习卡片、安全与布局约束 |
| cyrene-exam-paper | firefly-exam-paper | 学科试卷、答案分离、批改 |
| cyrene-learn-tutor | firefly-learn-tutor | Learn 教学流程 |
| cyrene-obsidian-workspace | firefly-obsidian-workspace | 已绑定 Vault 文件操作契约 |
| cyrene-original-voice | firefly-original-voice | 隐藏语气参考，不新增工具 |
| cyrene-plan-mode | firefly-plan-mode | 原 Plan Mode 流程 |
| cyrene-plugin-dev | firefly-plugin-dev | 插件开发、原 SDK 与接口 |
| cyrene-work-hygiene | firefly-work-hygiene | 原文件工作纪律 |

## 保留的旧标识与用途

不是“搜索零命中”。以下不作为当前角色注入或品牌宣传：
- 数据目录内 `cyrene-chats`、`cyrene-runs`、`cyrene-tasks`、`cyrene-tts-cache`、`cyrene.log`、导出 manifest，以及 CLI/工作区 `.cyrene`：现有数据或恢复/诊断路径，不迁移、不清空。
- `cyreneMomentsPostingEnabled` / `cyreneMomentsReactionsEnabled`、朋友圈作者/队列 actor `cyrene`、压缩检查点 `cyrene_compaction_checkpoint`：历史数据契约，不改写历史。
- `window.cyrene*`、既有 IPC、设置 section/DOM、`cyrene-react-root` 与相关 CSS/性能探针：既有桥和选择器调用链保留；当前界面名称、颜色和角色文案不由这些字符串决定。本轮没有把全部底层标识机械改写。
- `cyrene-plugin://`、`cyrene-panel/1`、`window.CyrenePanel`、`@playa0v0/cyrene-plugin-sdk`、Cyrene-Plugins：实际外部插件协议/SDK/第三方市场，不能伪装为 Firefly 自有服务。
- `X-Cyrene-Channel-Secret`、渠道凭据编码常量、验证配置 discriminant 和环境变量：现有协议、读取或诊断兼容，未改变权限。
- `native/cyrene-screenshot`、`cyrene-screenshot.exe`：原生助手现有构建/调用和分发路径；本轮未替换助手或重打安装包。
- `vendor/cyrene-skills`：第三方快照来源，内容与许可未重写。
- 历史报告、上游示例作者、MIT/第三方来源：真实来源，集中在归档索引/许可位置保留。
- 用户自定义旧文件名或角色正文未批量修改；优先级保持原样，因此不能承诺用户自定义内容也已统一。

## 自动验证

- 第一组 36 文件 / 448 项通过，覆盖 Skills、tone、模式、角色资源、设置读取保护、朋友圈、CLI。
- 更名实际涉及的测试与上述范围集中运行：55 文件 / 702 项，其中 54 文件先通过；唯一失败是本轮文件链接测试样本只改了小写路径、未同步大写工作区名。已统一测试输入为 Firefly-Agent，原大小写边界断言保留；该文件 13/13 重跑通过。**不是修改路径逻辑或删除测试**。
- 相关测试覆盖旧 Skill 禁用/模式限制、旧命令、工具白名单、旧用户目录、prompt 优先级、八 Skill 正文/manifest/附件加载、语气缺失/读取失败兜底、Mermaid 绿色及消毒、原 Agent/Harness 与 UI 导入。
- `npm run build` 全部 Main/Preload/CLI/Renderer 通过；`npm run check:renderer` 通过；Main/Preload 类型由构建及此前 noEmit 检查通过。
- Vite 仍有既有 >500 kB chunk 提示；没有为此扩展重构。
- `git diff --check` 通过；无暂存内容。不把测试输出中的故障注入 warning 当作真实用户数据失败。
- 本轮没有重新跑无关完整套件、截图助手、安装器或真实语音。

## 本轮实机证据

实际启动命令参数包含 `E:\Codex\Firefly-Agent-migration`；初始主 PID 24604。依赖 node_modules 是指向原目录的既有 junction，因此系统显示的 electron.exe 物理路径位于原目录，**不代表加载了原目录源码**。窗口的 document URL 已核对为：
`file:///E:/Codex/Firefly-Agent-migration/dist/renderer/react/index.html`。

| 项目 | 本轮结果与边界 |
| --- | --- |
| 启动与已有数据 | Main 13:20:13 记录模型 1 / Chat 6 / Work 4，readFailed=false；UI 已看到 6 条 Chat、4 条 Work 历史和已选择模型。未输出密钥/配置正文 |
| Chat 两条连续发送 | 同一新会话 `1fef84c3-22b7-40c3-a36e-87d2071b6d10`：4 条消息、2 个不同 run，逐一绑定不同 user message；两者 terminal/success；pendingCount=0。第二条正常发送与结束 |
| 人设 | 第一回复使用当前上下文称呼（具体值不留档），明确不把烟花世界观当作用户共同经历；第二回复表达希望作为“人”而非兵器生活；未观察到旧角色口吻。结合实际 tone 层修复与模式测试，不只凭自称判断 |
| Work 自动派发 | 新会话 `f7b2146e-4b79-4a8d-9258-b0801a4b8869`，一次提交后未切会话或另发消息；1 个 run `run-1790314041017-471jk6`，terminal/success，pendingCount=0 |
| 本次读取证据 | Main 持久化报告 full.txt complete、coveredLines=requiredLines=totalLines=4；不是从旧历史文字推断 |
| 导出/取消 | 新任务右键→导出 Markdown；第一次 Escape 取消后任务仍2消息/成功/完整；第二次原生保存到公开样本目录 work-task.md，1058 bytes，含本次4行读取和最终表格，不含内部 run ID；没有覆盖已有文件。最终回答引用随回答导出，未承诺回答不含路径/原文 |
| 绿色/Skills | Work 表格表头、行内代码、输入焦点、绿色按钮及 Skills 选中/开关实机可见；内置 firefly-diagram/plan-mode/plugin-dev/exam-paper/learn-tutor 已显示。没有逐个改变开关。随机 Skill 图标底色不直接等同旧角色品牌 |
| 桌宠 | 流萤模型可见。用户本轮明确确认点击、复位完成；拖动、连续点击及新心情事件本轮未单独确认。自动点击被判落在其他应用后已停止 |
| QQ Music | 通过当前编译后的原服务进行一次 get-state，只返回状态元数据：available=false、QQ_MUSIC_SESSION_NOT_FOUND。未播放/暂停/切歌；这不是 Firefly UI 审批链验收 |
| TTS | 仅检查配置存在性：engine=off；有服务地址字段，缺参考音频和参考文本。未调用或启动服务，未复制音频/权重，不记真实语音通过 |
| 朋友圈/12角色 | 当前 momentsEnabled=false，未启用。角色卡/头像映射沿用已有实现和定向测试；本轮未逐一实机展示 |
| 退出重开/剩余页面 | 尚待用户正常退出后重开核对；不能把第一次启动成功替代重开保留或所有视觉状态通过 |

Chat 两个成功 run：`run-1790313724461-qevztt`、`run-1790313783946-0qi07d`。只记录关联与终态，不保存隐藏思考、用户配置或完整回复。

## 集中验收剩余清单

### 本次用户反馈与子任务实测补充

- 用户反馈已完成第1项及桌宠点击/复位、第3项未进行。随后实际页面显示 partial.txt 已覆盖 2001/2001 行，因此只能确认用户做了读取操作；不能将这条完整读取记录作为“接受缩小范围且未覆盖全文”的通过证据。
- 按用户要求，仅发送一次公开 Work 请求，通过真实 task 工具委托 document 子任务，展示角色卡芙卡。父会话 `58e10ef4-c08b-44ab-b27d-099ea64c0114`，父 run `run-1790314929253-fncrsv` 为 terminal/success、2条消息、pendingCount=0；子 task `d4db5bc7-dd64-4286-86dc-af7581b9444b`、子 run `00c624c4-398b-4b69-a3b9-6da37a338ad4` 为 completed，轨迹有两次 read_file 开始及两次 success。没有修改工具开关、权限或模型配置。
- 完成过程面板实际看到卡芙卡头像、正确姓名和“已完成”；持久化映射为卡芙卡→卡夫卡.png。回复明确 partial.txt 只读取前3行，不把本次样本比较说成全文完成。未捕获运行中头像，未验失败状态，也未逐一调用其他11位。
- 实机发现切换到另一公开历史再返回后委托头像行消失。Main 原始记录仍完整，根因为 `src/renderer/react/features/chat/pages/chat-page-normalizers.ts` 的 `toUiMessages` 漏传 `taskDelegations`。已补字段，不改存储、子任务职责或权限；不是首次历史空列表事件的根因结论。
- 新增 completed/failed/cancelled 三种状态的反序列化恢复和原数据不变断言；normalizers 与 ChatMessageList 两个测试文件40项通过，Renderer类型检查和单次Renderer构建通过。Main未修改、不重启。尝试刷新时两次检测到用户正在操作，已停止自动输入；新修复刷新后实机复核尚未完成，不宣称已通过。
- 设置与弹层仍待用户体验；正常退出重开保留仍未进行。已完成证据不因这些未覆盖项撤销。
- 用户随后明确允许刷新：只刷新当前聊天 Renderer，document URL 仍为迁移目录构建。刷新后展开同一已完成子任务，卡芙卡头像、正确姓名和“已完成”均正常显示；再切到公开 full.txt 历史并返回，委托头像行仍保留。此次历史恢复修复实机复核通过，输入区显示空闲提示。没有重启 Main、再次请求模型或重复构建；不将此结果扩大为12位逐一展示或应用退出重开验收。
- 用户随后确认已退出。检查没有 electron.exe / Firefly.exe 进程后，于13:51:44仅启动一次迁移目录现有构建，Main PID29204，命令行明确指向 `E:\Codex\Firefly-Agent-migration`。新数据目录日志13:51:45记录模型1项、Chat7项、Work7项、readFailed=false。实机看到Work历史与本轮子任务结果、Chat七条历史与本轮公开对话、模型页原有一项默认档案；期间出现正常“正在读取历史/加载中”再转为列表，没有误判为空。退出重开后的模型及Chat/Work保留本轮通过；没有请求模型、修改配置或重新构建。设置与弹层的全部视觉状态、12位角色逐一展示仍未覆盖。

当前实例已加载上述迁移目录构建，不启动原目录的旧产物；不要运行旧 release 包。

1. Work 新任务选择公开 `partial.txt`，勾“本任务必须读取所选文件”，按范围对话框选择前2000行；看明确未覆盖全文。保存范围确认与最终完整性状态，不贴原文。
2. 执行中失败/拒绝/取消不得显示完整；这部分本轮仅沿用定向测试，不把此前名字为 unreadable.txt 的成功读取当作失败验收。
3. 已存在文件覆盖确认、导出时切会话的隔离仍以定向测试为证据；本轮新文件保存和取消已验证。
4. 桌宠头/身体单击、拖动松手、连续点击与动作复位；子任务执行/完成/失败/历史头像沿同一 task ID 检查。无真实新心情事件时不报心情联动通过。
5. 设置→用户信息的称呼提示，模型列表、Code/Learn、弹层和审批的悬停/焦点/禁用/绿色样式；不改变设置来凑验收。
6. QQ Music 当前不可用；用户准备好会话后再在应用 UI 只读查看。控制须当次明确同意，未准备时不循环调用。
7. TTS 由用户在设置准备外部服务与参考资料后再验收；当前跳过。
8. 正常退出并从迁移目录 `npm start` 重开，核对模型配置、Chat/Work 新旧列表及本次公开记录保留。只记录数量和错误状态。

## 等用户体验决定，不自行迁入

旧音乐上下文/偏好、大规模额外知识语料、旧 Browser 特定行为；删除仍可用的模式/功能、改变默认行为或审批；更改历史数据/外部协议。上述不等同当前源码缺失或实机失败。

首次空列表事件的原始根因仍未知；已完成的读取失败显错与写保护不被本轮品牌调整改变。真实语音、QQ 应用内审批、DXGI、持续60 FPS、安装器和素材公开再分发范围仍按原记录留档。

## 文件范围

完整工作树清单另见 `firefly-brand-skills-files-2026-09-25.md`。其中 D + ?? 包含未暂存的移动，不代表能力删除；继承的网易云两项删除与旧复核报告明确保留。所有构建产物、公开验收输出、用户数据都不纳入源码清单。

## 透明头像与品牌收口补充

- 12 位任务头像均保留原文件名与 1254×1254 尺寸，现有 PNG 具有透明通道；源图保存在仓库外 `E:\Codex\Firefly-avatar-originals-2026-09-25`，未进入打包资源。`npm run build:renderer` 成功，12 张头像均进入 Renderer 构建。当前实机仅复核了已完成公开子任务中的卡芙卡：刷新后头像、姓名、任务描述和完成状态正常，未见白色方框；其他 11 位尚未逐一实机展示。去底过程改变了部分前景像素，不宣称逐像素无损。
- 本轮再核对 prompt 装配：`mode-prompt-profile.ts` 的 Chat/Work/Learn/Code 文件组合、`harness/adapter/prompt-builder.ts` 的执行人设、`build-options.ts` 的称呼/语气/Skills 注入仍按原位置生效；`prompts/` 与自有 `skills/` 中没有发现仍生效的昔涟身份指令。既有两轮 Chat 的身份、终态和共同经历边界证据沿用；本轮未再请求模型。
- 当前产品的插件教程与 API 文档改为 Firefly 宿主、流萤称呼和 `%APPDATA%\Firefly` 数据目录；上游 SDK 类型、包名、示例作者及 Cyrene-Plugins 第三方名称保持真实。CLI 与 Main 的纯展示 logo 常量同步改为 `FIREFLY_LOGO`，调用方和测试已同步。
- 清理会在实际页面显示的粉色悬停底色：会话列表/菜单，以及 Review、运行卡片和插件面板的背景，改用现有绿色主题变量。未改错误、警告及语法高亮颜色。
- 定向测试 5 文件 26 项通过；`npm run build`（Main/Preload/CLI/Renderer）、`npm run check:renderer`、`git diff --check` 均通过。构建仍有既有大 chunk 提示。未因文档末次措辞修改重复构建。
- 当前进程参数与 Renderer document URL 指向 `E:\Codex\Firefly-Agent-migration`。实机查看 Work 的卡芙卡历史、Chat 既有第二条已结束回复、Code/Learn 入口、Skills 内置列表及已有禁用状态、设置的称呼示例“例如：开拓者”和绿色聚焦框；未改变开关、模型配置、权限或播放器。设置所有选项、审批弹层和全部 Markdown 状态尚未逐态实机确认；QQ Music 会话不可用，TTS 未配置。
- 本轮末工作树 278 项：176 修改、48 删除、54 未跟踪，均未暂存；HEAD 仍为 `8775af95008c9f5b8922ec94cef6491d145df0a6`。此前文件分类清单的 255 项是编写时快照，不代表本轮最终状态；历史记录未改写。
