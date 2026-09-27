# 文档与依赖集中收口（2026-09-26）

## 当前最终状态（2026-09-27，Firefly 独立维护基线）

**当前仓库是 Firefly 的唯一产品源码基线，已完成本轮结构整理、差异审查与已验证范围内的独立构建/基础启动验证。** 未处理 P0/P1 为 0；一项已证实的分页去重作用域 P2 和其他维护事项明确保留。39 项 Skills 来源、版本决策、静态宿主适配及正式 ZIP 不重开；没有开始后续模块新功能。工程独立不代表抹除上游来源，也不代表整个应用、全部资产许可或公开发布已验收。

### 本轮基线与实际改动

- 起点：`firefly-mini-v1.1.x`，HEAD `890bc6165d7b3a476d6069c436145c181bd8a16b`，171 项展开工作树差异、暂存 0；仓库外 `E:\Codex\Firefly-independent-baseline-20260927\start.json` 保存状态及 1849 个现有源码文件哈希。这只是本轮起点，不冒充此前迁移/治理起点。此前已有的 171 项保留，不能仅凭 HEAD 差异确定它们更早的具体会话归属。
- 本轮增量为 16 个路径：14 个已有文件修改，2 个新文件，无删除或移动。架构/指令/导航为 `AGENTS.md`、`docs/architecture/firefly-runtime.md`、`docs/README.md` 和本报告；注释为 `scripts/packaging/build-skills-snapshot.mjs`、`src/main/app-identity.ts`、`src/cli/commands/run.ts`；正式编译入口为 `tsconfig.main.json`、`tsconfig.preload.json` 及 `scripts/packaging/electron-builder-config.test.mjs`；托管修复为 `src/main/migration/managed-skill-update.ts`、同名测试、`src/main/migration/skill-snapshot.ts`、`src/main/skills/index.ts`，新增 `src/main/migration/managed-skill-files.json` 与 `src/main/skills/initialization.test.ts`。精确增量哈希在仓库外 `current-delta.json`。
- 结构地图写入现有 `docs/architecture/firefly-runtime.md`：一级目录、重要 Main 子模块、运/构/包/测边界、唯一入口、调用方向、来源/历史用途及命名判断。无需新增八份重复文档；`docs/README.md` 和 AGENTS 指向该入口。没有纯美观更名：`migration` 承担长期数据兼容和托管升级，`startup/application`、`chat/chats`、`services/cita/cita` 各自职责不同。产品展示 Firefly_Agent、技术包 firefly-agent、应用/数据 Firefly、appId com.serendipitywu02.firefly、CLI firefly 和本地 SDK @firefly/plugin-sdk 保持原契约。

### 完整差异审查与修复

使用 differential-review 方法审查 HEAD→完整工作树（含未跟踪源码）并以起点哈希区分本轮增量；独立只读审查覆盖生产入口、依赖/锁、ZIP安全、安装/托管更新、effectKind、Agent/Task/审批取消、插件、持久化、IPC、资源和包配置。没有把单个 diff 当成完整工作树，也没有把历史审查报告改写为本次结论。

1. **P1，已修复：旧官方附件被当成用户修改而拒绝整包升级。** 原 `managed-skill-update.ts` 只接受与新版相同的附件；真实 HEAD ZIP → 当前 ZIP 时 XLSX/PDF/DOCX/PPTX/SP using 五项无法更新。现在仅增加实物提取的 14 个旧附件 SHA；精确已知旧内容逐文件备份/替换，正文最后写入。用户改动、未知附件和冲突备份不覆盖。先失败的回归和真实归档复现保留。
2. **P1，已修复：一个备份冲突阻断全部 Skills 初始化。** 每包升级异常保留规范化诊断并继续其他包；初始化对迁移失败继续扫描现有文件和注册 meta-tools。不把失败写成升级成功，不吞设置读取异常，不修改审批、默认 modes 或启停状态。失败重试回归证明已有附件/正文备份保留。
3. **正式输出缺陷，已修复：Main/preload 编译包含 shared 测试。** 修改前各输出 13 个 `.test.js`，builder 的 dist glob 会带入它们。两份 tsconfig 统一排除 `src/**/*.test.ts`；真实 TS 入口解析回归先红后绿，最终输出为 0 个测试 JS/映射，不删除测试或改变 Vitest 扫描。
4. **P2，未修复：`src/main/skills/skill-tools.ts` 进程级 `readRefs`。** reset 函数未被生产执行循环调用，去重键没有 run/session 作用域，会阻止另一次任务重新读取相同页。属于本轮起点已有代码，单独登记到架构文档，不能与静态跨 Skill 绑定混同，也不宣称完整动态 Skills 行为全部无缺陷。另保留 Main 额外编译 sim、工具副作用 import 的按模块维护事项；本轮不重写核心。

前两项来自本轮开始前的累计托管修改，不是本轮结构文档引入；修复只补升级兼容及错误隔离，没有重开39项版本选择、许可或正文治理。历史报告当时“未发现 P1”只是当时检查结果，本节覆盖其当前结论。

### 本轮验证证据与独立边界

证据根目录：`E:\Codex\Firefly-independent-baseline-20260927`。隔离项目是包含当前未提交/未跟踪文件的普通副本，不是 Git worktree。依赖 junction 指向之前冻结的声明依赖安装目录，不指向两个原项目；未复制用户配置、凭据或历史。Node 24.19.0 / npm 11.17.0。

| 检查 | 本轮实际结果及证据 |
|---|---|
| 独立引用 | TypeScript AST 5713 个 import/require/字面动态边，相对边解析无越出仓库；运行/构建/脚本无原工作树绝对路径依赖。`source-edges.json`、`structure-files.json` 保存范围。 |
| 访问防护 | 仓库外 Node wrapper 拒绝两个原路径的文件/模块/子进程入口；负向自测确实拒绝一次，构建/测试/Smoke 无新增拒绝。原目录未删除/改名。此为 Node 入口防护加静态/原生脚本核对，**不是操作系统卸载或所有 native 系统调用的审计证明**。 |
| 依赖冻结 | package SHA `bc848e7f2ed00b6e1a098b087a0acb634c204e9c08303ebbac8ed9e714130d7e`、lock SHA `ee0b9282f8275972fceb25d5d01d32b229150888037504e754e900105947fb50` 未变；复用原 `isolated-ci-20260926` 的 npm ci、npm ls、prod/all audit 退出0，不声称本轮重跑或完整安全认证。 |
| 快照 | `npm run prepare:skills` 退出0，确定性 ZIP仍为 `07b2d86b6e7757051f44f1caab6799527ede2e7daddbe8a0104c3d2a613b444a`；来源/许可/通知沿用现有内容。 |
| 构建/类型 | `npm run build` Main/Preload/CLI/Renderer 全部退出0；`npm run check:renderer` 退出0。P1修复后再执行 `npm run build:main` 退出0，其余构建输入未变。`build-final.log`、`renderer.log`、`main-upgrade.log`；保留既有 Vite chunk 警告。首次隔离 wrapper 丢失 realpathSync.native 的失败已修 wrapper，并非产品缺陷，原日志保留。 |
| 最终定向 Vitest | `final-vitest.log`：16文件134项通过、0跳过、退出0，覆盖应用生命周期、身份、task/permission、Skills读取/语义/快照、托管保护及失败初始化、ZIP恶意/正常归档、插件安装。不是完整全仓测试，不与较早130/20项叠加。Bash夹具固定为已存在的 `E:\Git\usr\bin\bash.exe`。 |
| Node/打包回归 | `independent-node.log`：5文件19项通过、0跳过、退出0，包含builder配置、快照适配/替换、XLSX、MinGit；后续P1不改变这些输入。打包配置单独7项是重叠子集，不另加总。 |
| 真实旧 ZIP 升级 | `real-upgrade-red.log` 先失败；修复后 `real-upgrade-green.log` 退出0。旧ZIP取自当前 Git HEAD对象，SHA `98005bbb2126c231679d60373f1b50f9219b562c5f33fa98de0a130477c32b27`，未读原项目。五项完整新文件匹配、39项扫描、重复执行全树不变、XLSX备份冲突不阻断DOCX、用户修改附件保留。单测另覆盖中途正文写入失败后恢复重试。 |
| SDK与示例 | `npm run check:plugin-sdk`、`npm run test:plugin-examples` 均退出0；四示例编译/Mock（2/1/4/1工具）通过，无发布、外部服务调用；后续P1不改变SDK输入。 |
| 原生/打包准备 | `npm run build:screenshot-helper`、`npm run prepare:mingit` 退出0；只为当前进程补已安装Cargo路径，锁定Rust构建及MinGit 2.55.0.3校验通过。`package-inputs.json` 所列 extraFiles/extraResources 全部存在，无测试JS输出。本轮没有制作安装器或重新做截图实机。 |
| 新 Main 隔离 Smoke | `smoke-final.log` 退出0；appPath为隔离project，userData仅 `smoke-user-final/Roaming/Firefly`，实际加载当前dist Main及React Renderer；Chat/Work/Learn/Code可见并切换，继承39安装、registry47、UI46，正常 app.quit 后退出。没有真实模型、QQ Music、TTS、邮件或用户历史。 |

构建准备只依赖当前源码、声明依赖及明确的 Rust/MSVC/Git/网络下载运行条件。正常 `npm start` 对应的同一 Main/Renderer 在测试包装器路径重定向后启动；没有为证明独立性启动真实用户配置或物理删除两个原工作树。未验证所有原生依赖的系统调用，不能声称已经完成操作系统级断盘试验。

### 保留边界与交付判断

当前可进入 Firefly 独立项目维护阶段，在上述已验证边界内不再以原工作树为实现或构建基线。后续先按模块处理登记的 P2，再按授权补功能。本轮没有新增产品功能、更换执行核心或扩权。

真实模型及Work端到端执行/取消、深度GUI、外部Office/LibreOffice/.NET完整工作流、真实用户环境、安装器/升级/跨平台、TTS、QQ Music审批及持续帧率仍待独立实机验收。现有XLSX和基础Smoke已通过范围保留，不重复表述为外部Office全通过。许可保留既有证据，不宣称所有第三方资产已具备公开再分发条件。

结束保持同一分支/HEAD，展开差异179项、暂存0：起点171项全部保留，另6个原先干净的已跟踪文件变更、2个新增路径；本轮16路径增量与累计179项是不同统计口径。`git diff --check` 退出0。不提交、推送、合并、切分支。两个原项目、真实用户数据、服务及Codex插件保持未操作。最终清单及校验记录见仓库外 `current-delta.json` 和 `final-state.json`；历史章节仅用于追溯，不作为重新启动全仓迁移的待办。

## 独立维护基线提交与 Draft PR 准备（2026-09-27）

用户已授权将累计本地结果提交到 `firefly-mini-v1.1.x`、普通推送并创建面向 `main` 的 Draft PR。本节起点仍是 `890bc6165d7b3a476d6069c436145c181bd8a16b`，展开179项，暂存为空；origin fetch/push 均为 `https://github.com/Serendipity-wu02/Firefly_Agent.git`。获取远程后开发分支与本地0/0差异，main为 `35457af3279fccaf0ab462f8744f47183fce79f1`；PR会包含此前已推送的资源整理和安全修复两次提交，不将它们归为本次新增提交。查询本仓库时无现有同head/base开放PR。

### 路径归属及拆分依据

| 归属 | 起点路径数 | 本次处理 |
|---|---:|---|
| Firefly独立维护基线 | 7 | 稳定身份/CLI注释、构建测试隔离、真实工具说明和CI注释；与执行行为关联一起提交 |
| Skills来源/适配/快照/迁移 | 81 | 受控适配源层、获取工具、正式快照/许可、托管兼容与保护；不重新治理版本 |
| ZIP安全与依赖修复 | 5 | package/lock、ZIP安全层及插件/MinGit入口 |
| 架构和入口文档 | 30 | 当前架构、治理附件、指南、AGENTS和双语README |
| 测试与验证 | 18 | 对应代码/快照/工具行为回归；不提交测试运行日志 |
| 资源/命名整理 | 5 | 第三方通知、角色摘录及现有模型说明；本轮没有新图像或头像改动 |
| 历史/迁移记录 | 31 | 增加历史状态标识/导航，不改写当时结果 |
| 排除的无内容差异标记 | 2 | SDK LICENSE及built-in-tools快照经Git clean filter计算与HEAD对象完全相同，保留工作树标记、排除提交 |

实际纳入 **177路径：87修改、90新增，0删除、0更名**。`packages/plugin-sdk/LICENSE` 和 `src/main/orchestrator/tools/__snapshots__/built-in-tools.snapshot.test.ts.snap` 的内容对象与HEAD相同，不将status标记当作内容差异。完整分类路径和SHA-256在仓库外 `E:\Codex\Firefly-independent-baseline-20260927\submission-inventory.json` / `.md`，初始status和diff统计为 `precommit-start-status.txt` / `precommit-start-stat.txt`。所有原始修改保留。

按依赖拆为3个提交：①运行、Skills、依赖、安全、测试与必要分发通知116路径；②架构、当前指南、治理和历史记录59路径；③中英文README2路径。Skills安装/托管/快照与插件解压共用新ZIP层，而移除依赖后旧调用不能独立构建，因此合在第一提交，避免制造不可构建的中间提交。各组使用明确路径列表暂存，不使用 `git add .`。本次普通推送后只创建Draft，不合并main。

### README与本次验证

两份README均改为Firefly_Agent独立产品介绍；9个章节在两种语言中事实对应，包含四模式、角色、39+8 Skills、插件、记忆、外部服务、真实命令、数据保护和上游许可。没有经确认的当前预览图，故不新增图片。当前生产面没有对两个原工作树的绝对路径读取；测试的合成Windows路径及历史报告中的取证路径保留。

- `submission-check.json`：179项核对、177项纳入；无产物/日志/备份/模型/用户数据路径；未发现凭据模式或生产机器专属目录引用。双语README28处本地链接存在，18处npm脚本引用存在；正式ZIP253文件、39项Skills，未带缓存/日志/备份。模式扫描只是附加检查，安全结论仍沿用实际源码和既有差异审查。
- 本次提交前隔离Vitest首次15文件中126通过、1项旧SP归档升级5秒超时，保留 `submission-vitest.log`。当时同时运行Node归档测试；单独复测4项通过，原超时用例1.271秒；再串行原组合 **15文件127通过、0跳过、退出0**，`submission-vitest-serial.log`，16.44秒。未修改代码、超时或断言；资源并发是核查线索，首次超时没有直接根因证明，不能称为已修复。单独4项与组合127项重叠，不累加。
- 本次Node `--test` 指定builder/快照适配/替换/XLSX四文件，首次16项通过。暂存检查进一步发现5个新增Markdown的行末/文件末空白：已仅规范化格式，并更新self-improving-agent修改通知。PPTX通知中旧“许可未核实”表述与现有已核实来源材料矛盾，依据已有 `license-provenance.json` / `LICENSE-NOTICES.md` 修正，不重新调查或编造许可。源层重建同步ZIP、manifest和治理附件当前索引；历史归档证据保持原样。
- 构建适配器新增对前一个已知完整适配目录的逐文件哈希识别，原上游哈希保留；修改或追加任何文件均拒绝。先新增回归得到 `REPLACEMENT_SOURCE_MISMATCH`，再实现最小识别并通过；不用于覆盖用户目录。最终Node **17通过、0跳过、退出0**，`submission-node-frozen.log`，含确定性、全ZIP Markdown链接/标题锚点、未知源拒绝和XLSX真实路径回归。
- 格式与通知更新后先串行原Vitest组合 **15文件127通过、0跳过、退出0**，`submission-vitest-final.log`；最后PPTX通知内容冻结后再跑受影响快照/托管组合 **6文件33通过、0跳过、退出0**，`submission-snapshot-frozen.log`。两组重叠，不累加为160项或全量通过。正式ZIP SHA-256 `667740966cf7f06139ab4cf65bb41489b207e3ab54627c1e2d0cfc297b9a5e72`，819507字节。
- 最终快照隔离真实旧ZIP升级：旧归档 SHA-256 `98005bbb2126c231679d60373f1b50f9219b562c5f33fa98de0a130477c32b27`，通过当前构建Main更新并逐文件核对XLSX/PDF/DOCX/PPTX/SP目录，扫描39项、重复安装无变化、备份冲突隔离、用户修改保留，退出0；记录 `submission-real-upgrade-frozen.log`，不涉及真实用户配置。
- 生产运行代码、package/lock的最终验证输入没有后续变更，沿用此前完整build、Renderer检查、P1修复后Main构建、冻结npm ci/ls/audit、SDK/示例编译Mock和隔离Smoke；上述源层格式、通知与快照生成器变化使用相应回归重新验证，不冒称沿用旧ZIP检查。没有重启真实应用或重复模型调用；39项版本决策不变。
- 获取工具的既有Windows符号链接权限跳过仍明确保留，不计入本次通过数量。CI会按开发分支push和面向main的PR触发；尚未产生的CI结果不得在PR中写成通过。审计的现有非阻断策略不改变。

保留P2分页去重、真实模型E2E、深度GUI、外部Office、安装器/跨平台、TTS/QQ Music审批、持续帧率和公开资产再分发边界。当前许可和上游归属继续保留，README没有原创或生产就绪承诺。提交之后，前节171→179工作树统计成为提交前历史状态；最终提交SHA、推送/PR身份以Git/GitHub实际回执为准。

## 历史阶段：两个阻塞复验（2026-09-27）

**当前 Firefly 开发分支在已验证范围内完成本阶段技术收口。** 39 项继承 Skills 的来源、版本决策、静态宿主适配沿用此前结论；本轮修复 XLSX `find-label` 的真实关系路径缺陷，并以测试包装器修正 Electron 隔离 Smoke 宿主。没有改变生产应用身份或 Agent/审批。真实模型、深度 GUI/Work 执行、外部 Office、真实用户环境、安装器/跨平台及公开再分发仍各自待验。下方按日期排列的“部分完成”“缺许可”等是当时的历史状态，不覆盖本节与现行治理附件。

- 基线与归属：本次开始为 `firefly-mini-v1.1.x`、HEAD `890bc6165d7b3a476d6069c436145c181bd8a16b`、展开工作树 169 项、暂存 0。此前 169 项均保留；本轮新增两个路径（XLSX 源层脚本和回归测试），并修改已有快照生成器/回归、哈希配置、正式 ZIP/manifest、分发通知和本报告/治理附件。结束仍为同一分支与 HEAD、展开 171 项、暂存 0。两个原项目、真实 userData 和现有服务未操作；未暂存、提交、推送、合并或切分支。
- 最终差异复核：以 HEAD 对当前工作树（含必要未跟踪文件）为审查范围，优先检查依赖与锁、ZIP 解压和安装、托管 Skill 更新、`invoke_skill` 的 effectKind、文档工具描述、插件 SDK 与资源分发。`extract-zip` 的项目直接入口已转用带路径/重复项/体积限制及暂存发布边界的解压层；Skill 更新按已识别完整哈希保护用户改动。Agent/Task 执行核心和审批门槛没有本次差异。针对审查范围未发现新引入的 P0/P1；这不是整个应用或第三方脚本的安全认证。先前报告所列并发路径替换等残余边界未改写为已解决。
- 依赖冻结证据复用：本次 `package.json` SHA-256 为 `bc848e7f2ed00b6e1a098b087a0acb634c204e9c08303ebbac8ed9e714130d7e`，`package-lock.json` 为 `ee0b9282f8275972fceb25d5d01d32b229150888037504e754e900105947fb50`，与下方最终冻结安装记录完全相同；因此沿用当时 `npm ci` 退出 0、`npm ls --all --offline --ignore-scripts` 退出 0 和 prod/all audit 各退出 0 的证据，不冒称本次重跑。audit 0 仅是当次公告匹配结果。
- 隔离自动验证：仓库外 `E:\Codex\Firefly-doc-security-review-20260926\isolated-final-20260927` 包含当前相关源码/快照，依赖复用此前冻结安装的 junction，未复制用户数据。此前总验收的 16 文件/141 项 Vitest、6 项快照 Node 测试、plugin SDK/示例/schema、类型检查和完整构建均是**先前输入**的结果，不拼接成本轮全量结果。本轮新增的受影响 Vitest 先因缺少真实 `FIREFLY_TEST_BASH` 夹具 93/94 通过、1 失败；使用已核实的 `E:\Git\usr\bin\bash.exe` 后 **11 文件/94 项通过、0 跳过**。最终源层的 Node 快照/XLSX 测试 **9 项通过、0 跳过**；`npm run check:renderer`、`npm run build`（Main/Preload/CLI/Renderer）退出 0。打包器哈希护栏变更后隔离副本再次 9/9，并确定性重建；未重跑不相关全量测试、依赖审计或 SDK。构建保留既有 Vite 大 chunk 警告。
- XLSX 真实缺陷：公开 openpyxl 工作簿在 `xl/_rels/workbook.xml.rels` 中给 worksheet `Target="/xl/worksheets/sheet1.xml"`；旧脚本固定拼 `xl/`，因此错误读 `xl/xl/worksheets/sheet1.xml`。根相对 part 关系由 OOXML 官方示例实际使用；普通相对关系应按来源 part `xl/workbook.xml` 的目录解析，而非按 `_rels` 目录。Firefly 受控源层 `scripts/packaging/skill-adaptations/xlsx/scripts/xlsx_workspace.py` 现在分别处理根相对和 part 相对目标，规范化 POSIX 分段及 `.`/`..`，拒绝越界、外部/URL、非 worksheet 或缺失目标；不改公式与输入。已观察失败回归再修复，合成不同工作表名/相对形式、公式字节保持及非法目标测试通过；正式 ZIP 脚本对原公开 `public.xlsx` 执行 `find-label` 退出 0，返回 `Sheet!A1` 的公开文本。来源文件 SHA-256 `676a2521264b2c87425233df12591f9fe5e0b207289806bad9d8ea828e680545`，Firefly 适配 SHA-256 `7743ec3e6cb37a0d632b3133ca068b4ddff70288a5f493fbd8d35867dc413320`；打包器对这两个已识别状态做哈希护栏，未知内容拒绝覆盖。正式 ZIP/manifest SHA-256 `07b2d86b6e7757051f44f1caab6799527ede2e7daddbe8a0104c3d2a613b444a`；`hostSemanticReview` 的当前快照及附件哈希、分发 NOTICE 已同步，其他历史索引仍表示各自日期的旧归档，不伪改历史来源。官方 OPC 依据：[part 关系以来源 part 为基准](https://learn.microsoft.com/en-us/dotnet/api/system.io.packaging.packagerelationship.targeturi)、[根相对 worksheet 示例](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/structure-of-a-spreadsheetml-document)。
- Electron 宿主根因与基础 Smoke：最小 probe 在正常环境的 `appData/userData/temp` 全部可用；仅替换 `USERPROFILE` 即使 `appData`/`LOCALAPPDATA` 不变，也使 Electron 的 `app.getPath("appData")`/`userData` 失败（退出 2147483651）；单独替换 `APPDATA`、`LOCALAPPDATA`、`HOME` 或 `TEMP/TMP` 不触发同一失败。故此前“完全替换 Windows profile”的 Smoke 宿主不成立，不是已证明的产品身份缺陷。仓库外测试 wrapper 在加载构建 Main 前将 `appData/userData/cache/temp/crashDumps` 指向仓库外临时目录，保持正常 Windows profile，**不进入生产路径**。最终一次隔离运行：Main ready、React 主窗口与 Renderer 加载、Chat/Work/Learn/Code 四入口点击可见、正式 39 项继承 Skill 首装、运行时 registry 47 项（UI 46，另 1 项原本隐藏）、`appData` 为临时 `Roaming`、`userData` 为临时 `Roaming/Firefly`，`app.quit()` 后进程退出 0。没有使用真实模型、播放器、语音或私人文件。未调用需要模型的 Work 执行及取消，故它们仍是模型实机/更深层任务验收边界；不能把本次基础导航 Smoke 说成完整 Work 成功。
- 本机办公边界：当前有 Python/openpyxl/python-pptx 与 .NET 命令；没有 python-docx、.NET SDK、LibreOffice/soffice、pptxgenjs、markitdown、reportlab、pypdf。XLSX 本机只读路径已按上述公开夹具复测；DOCX/PDF/PPTX 的 Skill 外部工具链未执行，不能据静态正文宣称实机通过。此前公开临时夹具仍在 `E:\Codex\Firefly-doc-security-review-20260926\office-smoke-7d76a5a8-bb4f-46ae-8dc7-e4b74a8b8a5c`；清理操作曾被执行策略拒绝，需人工删除的仅是仓库外公开测试数据，不在快照或应用包内。
- 独立验收边界继续保留：真实模型、真实用户环境、GUI 深度交互、外部 Office/.NET/LibreOffice、安装器升级和跨平台；此前 TTS、QQ Music 审批、持续帧率也未因本次自动矩阵而变为通过。本轮没有重启真实应用或更改其设置。

## 39 项 Skills 宿主语义兼容（2026-09-27，本轮最新结果）

**正式快照的静态宿主调用闭环已验证；真实模型、GUI、外部 Office/LibreOffice、.NET 与用户环境启用仍未实测。** 本节不重开前次 3 upgraded-adapted / 12 equivalent-body-retained / 24 current-version-retained 决策。下方“上游版本兼容适配”节保留其当时尚未收口的历史事实，不代表本轮最终状态。

- 起点：`firefly-mini-v1.1.x`、HEAD `890bc6165d7b3a476d6069c436145c181bd8a16b`、展开工作树 164 项、暂存区为空。保持分支与 HEAD；最终 169 项展开状态、暂存区为空。未改两个原项目、真实 userData、现有服务或 Codex 开发技能。本轮仅在当前工作树和包含全部修改的隔离副本操作，未下载上游、改变依赖或重做 self-improving-agent。
- 正式 ZIP 为 39 个 Skill、253 个文件、109 篇 Markdown、SHA-256 `998e3ec7d13ffc5bca3d4a3ce94ffc8fceeea1148737aadfa6dcd960ecc6c5f2`，manifest 与实物相符。治理附件 `hostSemanticReview` 逐项列出 ID、modes、正文出现的跨 Skill 真实 ID、reference/script/template 数及 9 项 SP + 7 项办公内容关联的 200 个文件的路径、字节数、哈希、正文直引和宿主字面标记；同名治理 Markdown 中有 39 行人可读闭环表。字面标记不是脚本执行证明。
- 在原有快照适配链中加入哈希受控的正文/附件修补，修正 SP 的计划、TDD、审查、task 委派及 worktree 授权语义；当前 Firefly 没有 executing-plans Skill，不伪造它，按获准内联执行或现有 task 链处理。精确 `sp-*`、`as-*`、`ecc-*` ID 在直接调用和正文续读中可定位，未注册全局 alias、未双发事件或新增 Agent Loop。
- 办公类：`write_word`、`write_excel`、`write_pdf` 为 Work 的 mutation 工具；`query_expense` 为 Work 的 read 工具。`write_pptx` 和 `ask_user_choice` 不在注册表，当前说明不要求调用它们。PDF/XLSX/DOCX/主题脚本改从 `invoke_skill` 返回的实际本地目录定位；XLSX 的固定临时目录已改为独立 workspace。六份 XLSX 参考说明把 Bash、`SKILL_DIR` 与 `/tmp` 示例标为非 Windows 直接命令；两份 DOCX 参考给出 PowerShell 预览入口，PPTX 编辑参考改用隔离 Windows 临时工作区。原文件保护、公式/重算与视觉核验要求保留；没有模拟外部程序回执。
- 生产托管更新保留现有完整哈希识别、备份、重复安装、用户修改及同名附件保护；只让已识别且未修改的旧正文/通知进入新快照。快照生成器支持同文件多阶段修补的幂等重建，manifest 适配文件索引按最终文件去重；未知内容仍拒绝。`invoke_skill` 增加所加载 Skill 的本地资源目录，明确路径不授权执行，原 effectKind 与工具审批不变。

本轮隔离验证：Node `--test` 两个快照脚本共 **6 项通过/0跳过**（确定性、未知源拒绝、全 ZIP Markdown 路径及标题锚点、39 项/200 附件治理哈希）；指定的 Vitest **8 文件 56 项通过/0跳过**（39 项直接 invoke、跨 ID/模式续读、用户同名覆盖、工具 effectKind、真实旧 ZIP 到托管更新、附件完整读取、重复安装与修改保护）。后续仅为测试映射补入 `skill-creator→docx/xlsx`，同一隔离副本定向该文件 **1 项通过**，不与前述 56 项累加。正式 ZIP 中 Python 39、JavaScript 1、PowerShell 4 个源文件仅做语法解析，未执行不可信上游脚本。隔离 `npm run check:renderer` 退出 0；`npm run build` 的 Main、Preload、CLI、Renderer 全部退出 0，保留 Vite 大 chunk 提示。`git diff --check` 退出 0（既有 LF/CRLF 提示）。依赖和锁本轮未变，未重复 `npm ci`/audit；先前 audit 结果不冒充本轮复测。

边界：浏览器/模型/外部办公程序与 GUI 未执行；四份非 Firefly 宿主 reference 只保留为第三方来源说明，不作为 Firefly 工具指令；Skill Creator 的 Claude/Cowork 评测流程为可选外部流程。此前获取工具测试的 Windows 真实符号链接权限 1 项跳过仍是旧证据，本轮没有重跑或改写为通过。隔离测试不表示真实用户 Skills 已升级或实际应用授权已更改。许可范围沿用此前专项证据，本轮未做新来源判定。上述外部运行验收不妨碍本轮静态宿主语义闭环，但后续功能使用时必须实际验证其环境及产物。

## 上游版本兼容适配（2026-09-27，本轮结果）

**当时部分完成，未宣布“39项来源与Firefly适配收口完成”。** 本节保留上游版本兼容适配阶段的历史状态；本轮宿主语义闭环以文首 2026-09-27 最新结果为准。下面的获取、许可专项也保留各自发生时间与验证范围，不把历史结果计为本次重跑。

本轮起点：仓库外 `compatibility-start-20260927.json`，分支 `firefly-mini-v1.1.x`，HEAD `890bc6165d7b3a476d6069c436145c181bd8a16b`，150项展开路径差异、1831个文件哈希、暂存区为空。`git status --short` 默认合并未跟踪目录，不能与展开路径数混用。这是本轮基线，不是历史迁移起点。使用已获取的两个固定提交暂存树，没有重新下载、来源调查或重做 self-improving-agent。

### 已实际接入与保护

- `as-api-and-interface-design`：纳入固定 Addy Osmani 提交 `2686b620fc1fed2e8f60c704839c766b8594c6b6` 的幂等改进：意图稳定键、原子认领、同键载荷一致性、处理中状态、成功/失败/未知结果与保留周期。不存在的独立退役 Skill 指令适配为正文中的兼容迁移步骤，不编造新工具。
- `as-context-engineering`：纳入同提交的已完成任务交接、75%上下文整理建议及提交授权条件。额外明确进程监督属于外部机制，不是 Firefly 重启命令，不增加运行循环或自动重启。
- `as-using-agent-skills`：在相同固定来源的工作流基础上编写 Firefly 维护的路由适配。调用使用真实ID/skill_id、已交付的TDD工作流及授权内联执行；未交付流程明确不伪称已调用。上游名称仅作为映射说明，不注册全局别名，不影响用户同名Skill优先级。保持按需使用和禁止自身递归，task字段依据 `src/main/orchestrator/harness/builtin-tools.ts`。
- 三项均保留原 frontmatter、Code模式、效果分类与权限；加入完整原作者 MIT 和改动通知。新许可与已获取固定提交的 LICENSE 字节哈希一致。旧正文只放测试夹具，不进入分发 ZIP；用户备份仍由原托管更新机制保存。
- 快照构建只接受三项已记录原目录哈希或本轮完整适配目录；未知修改拒绝替换。生产迁移仅增加三个原正文的真实 SHA 识别，复用既有备份、同名附件保护、重复执行和用户修改保护，没有双加载链。

### 39项版本决策与尚未达到的验收

治理 JSON 的 `upstreamCompatibilityReview.entries` 为逐项清单，记录原/现正文 SHA、固定上游提交/目录/许可 blob、正文比较、附件名称与字节差异、决策及验证边界。原始比较证据在仓库外 `compatibility-review/comparison.json`，当前正式 ZIP SHA 为 `1fc7191304ec3fad2daeb158c3f885dc3f2bf40e58c5985c51541f7adfdbc773`。

汇总：37项上游源码此前已取得；12项 as/ecc 正文等价且无新增附件，不为版本标签重写；本轮3项升级适配；其余24项保留现版（包含已完成的 self-improving-agent 及2项明确来源的本地维护内容）。没有把保留现版计为获取失败，也没有把它等同于所有宿主假设已验证。

仍需补齐的本轮范围内工作：

1. 发现流程的实际 ID 路由已经修正并通过所有声明目标均已注册/Code可用的断言；但其他 Skill 直接单独调用时的跨Skill假设仍需逐篇处理，不能依赖用户一定先读取发现流程。
2. SP 的 `superpowers:*` 调用与 Firefly `sp-*` ID、缺失 executing-plans/TDD 调用尚未形成完整闭环；当前 task 适配的两个 Skill 保留不回退，但不能以它们通过推导另外七项全部宿主兼容。
3. 新安全/前端/规划正文的包外 security/accessibility/definition-of-done 资料，以及 plan-canvas 的外部 CLI、后台等待、hooks 假设，未适配进入正式快照；保留当前版本的决定不等于这些已有正文中的隐含引用已修复。
4. 9项SP及7项办公内容的逐附件语义审查、所有39项的明文路径/Skill调用闭环仍未全部完成。办公类明确保留 Windows 文件保护、公式、重算、渲染与主题实现，没有拿新版本替换缺失的等价能力。

这些是本轮尚未完成的语义适配/验证，不是缺少用户授权或网络环境阻塞。Markdown标准本地链接通过与正文分页读取通过不能抵消它们。既有 Windows 真实符号链接权限跳过继续保留；Git源树符号链接拒绝夹具不冒充真实文件系统链接逃逸的等价验证。

### 本次验证（与历史结果分开）

先增加两个回归并实际观察失败：旧正文缺新规则、未登记托管识别。适配后两项通过；随后增加全39项 frontmatter不变回归，最终该文件3项通过。另有一次夹具未创建 references 目录的失败，已修正夹具目录准备，未删断言或调整超时。

隔离副本包含当前未提交/未跟踪源码；没有复制用户数据、凭据或清除当前运行环境。

- 最终隔离 `npx vitest run` 指定 upstream-compatibility、inherited-snapshot、skill-scanner、skill-tools、managed-skill-update、skill-snapshot、真实旧 ZIP 7文件：50项通过、0跳过、退出0。覆盖真实旧 ZIP/manifest→生产哈希识别→最终三项升级快照→39项扫描→正文/附件分页读取→重复安装/更新及用户保护；不是完整应用测试。
- 全39项元数据、三项行为指引和托管保护、发现流程真实ID路由均在 upstream-compatibility 文件3项回归内。中间49项和该文件定向复测不与最终50项累加。
- Node归档回归4项通过：快照确定性重建、所有最终ZIP Markdown本地文件与标题锚点、未知源拒绝和完整目录替换。该检查不把反引号内路径、示意图节点或 Skill名称当成已验证调用。
- 隔离 `npm run check:renderer`、`npm run build` 退出0；追加发现流程与第三个Main识别哈希后，再运行 `npm run build:main` 退出0，更新最终Main。Renderer/Preload/CLI未再修改，沿用本轮构建结果。保留已有大chunk与无package type提示。依赖及锁文件本轮不变，未机械重跑npm ci/audit；旧audit 0仍仅属于此前验证。

最终日志保存在仓库外 `compatibility-final-targeted-20260927.log`、`compatibility-final-archive-20260927.log`、`compatibility-final-main-20260927.log`；Renderer与早先完整构建记录为 `compatibility-renderer-20260927.log`、`compatibility-build-20260927.log`，真实旧产品夹具沿用已有取证文件。没有真实模型、GUI、办公外部工具或真实用户Skills启用；不宣称实际用户安装已更新。分支与HEAD不变，不暂存、提交、推送、合并或操作两个原目录。

本轮相对起点新增14文件、修改9文件、删除0；累计164项展开路径差异，起点文件均保留，暂存区为空。仓库外 `compatibility-final-delta-20260927.json` 保存完整路径/哈希。36项保留Skill的正式ZIP目录逐文件哈希与起点完全相同；三项升级的元数据与起点相同。最终ZIP为252文件、108 Markdown，manifest哈希一致，`git diff --check`退出0（既有LF/CRLF提示保留）。

## 统一上游获取与现有适配（2026-09-27）

本轮起点是仓库外 `upstream-unified-start.json`：当前分支 `firefly-mini-v1.1.x`，HEAD `890bc6165d7b3a476d6069c436145c181bd8a16b`，134 项已有差异、1815 个文件哈希、暂存区为空。这不是原始迁移基线。以下来源许可专项是此前结果，旧十文件许可缺口已不属于新快照交付内容；其历史事实未改写。

处理清单及实际执行：

1. 用户工具包 ZIP 的八份校验和全部匹配。检查获取脚本、配置、测试和补丁，补丁只新增工具目录，不应用到旧远端基线。仅导入脚本、配置、测试及当前使用说明；原始交接材料保留在仓库外。历史“隔离分支”建议不执行，当前工作树修改、隔离副本验证。
2. 工具最初在本机 23 项通过、1 项因 Windows 符号链接权限跳过；`--plan` 退出 0。联网获取在含当前修改的隔离项目执行，不在正式 `vendor` 写入原始源码，避免 `vendor/**/*` 打包包含它。无上游脚本、安装 hooks 或收费模型调用。
3. 首次收据：36 下载成功、docx 1 项失败、2 项无独立获取路线，退出 1。失败准确原因为固定提交 `skills/minimax-docx/LICENSE` 不同于根 MIT；读完整子目录 MIT、核对 MiniMaxAI 版权及 Git blob `53218a2ed6d176e4c189e0c2925aeea64996e348` 后增加严格的已审查许可哈希配置，不移除检查。先看到新回归失败，再实现；最终工具 24 通过、1 跳过。仅重新获取 docx，1 下载成功、退出 0。两份收据的完整性检查均退出 0。合并按 ID 去重后为 37 项取得源码：35 条路线及 PDF/XLSX 两项比较材料；office-design、write-expense-report 继续采用此前明确来源的维护内容，不冒称独立下载。
4. `self-improving-agent` 以 `pskoett/pskoett-ai-skills@8a71d7098d7c39494dcaa46254885225ddb5d259:plugin/skills/self-improvement` 替换。读完整 `plugin/LICENSE`、检查所选树没有嵌套许可；七个复用文件与下载字节一致。保留 ID、work/code/learn、原效果分类和 LRN/ERR/FEAT 记录、解决、复查、关联、提升及提炼能力。正文明确为 Firefly 维护适配，使用既有授权文件工具；不要求不存在的 self-healing，不引入外部宿主自动 hooks。四个模板、实例、手动提炼脚本和完整 MIT 进入新快照；旧 15 文件全部退出分发，其中十文件不被倒推授权。用户目录旧附件和备份不删除。
5. 新快照生成先核对被替换目录的全部文件哈希，仅接受已识别的完整旧目录或当前适配结果；未知改写/额外文件拒绝替换。先建立失败用例，再实现；保持此前路径/链接/预算安全解压。生产托管更新仅增加真实旧正文哈希识别，沿用备份、同名附件及用户修改保护。真实旧 ZIP 的安装→识别→更新→39 项注册→正文/附件完整读取→重复安装/修改保护，在隔离目录重新通过。
6. 22 项 as/ecc 正文与新取得版本比较：只除 frontmatter、外层空白及 CRLF/LF，12 项相同、10 项不同；不是整个目录字节一致。不同项及新九项 SP 不整包覆盖已验证版本。PDF/XLSX 不替换 Windows 实现；现有八项项目内置 Skills 不变。全部 39 项的获取状态、固定提交、保留/替换和入快照状态见治理 JSON 的 `upstreamManagementExecution.entries`；此前 `upstreamManagementPreparation` 为起点记录。

本轮相关源码：`tools/firefly-upstream-fetch/`；`scripts/packaging/skill-replacements.json`、self-improvement 适配目录及快照生成器/新回归；`src/main/migration/skill-snapshot.ts` 的一个已识别正文哈希；self-improvement 来源回归；ZIP、manifest、许可通知、provenance 和本集中报告/治理附件。依赖与锁文件本轮未改，此前修改保留。

验证环境为 Windows、Python 3.13.12、Node 24.19.0，隔离副本 `E:\Codex\Firefly-doc-security-review-20260926\isolated-ci-20260926`，包括当前未提交及未跟踪文件，不只是旧 HEAD：

- `python -B -m unittest discover -s tools/firefly-upstream-fetch/tests -q`：24 通过、1 跳过，退出 0；跳过原因是 Windows 创建符号链接无权限，不混入通过数。
- `node --experimental-strip-types --test scripts/packaging/adapt-skills-snapshot.test.mjs scripts/packaging/skill-replacement.test.mjs`：4 通过、0 跳过，退出 0；检查整个最终 ZIP 的 Markdown 文件目标和标题锚点、完整目录替换、拒绝未知内容及重复生成。
- `npx vitest run` 指定 self-improvement、真实旧 ZIP、inherited-snapshot、managed-skill-update、skill-snapshot、skill-tools、skill-scanner 七文件：50 通过、0 跳过，退出 0；不是全量测试。Bash 夹具为实际 `E:\Git\usr\bin\bash.exe`，子进程局部 PATH 加入同目录，验证 dry-run、实际输出、重复目标不覆盖和拒绝越界名字；不修改全局 PATH。初次缺 dirname 的夹具错误已记录，未增超时或吞失败。
- `npm run check:renderer`、`npm run build`、`npm audit --json` 均退出 0，audit 实际 0 漏洞；构建仍有已有大 chunk 和无 package type 警告，未放宽标准。未改依赖，因此未重复 npm ci。

两份真实获取收据及日志在仓库外 `E:\Codex\Firefly-doc-security-review-20260926`；第一次暂存为 `staging-20260927T033035Z-9a03593e6635`，docx 单项为 `staging-20260927T033631Z-00359901d09b`，均在隔离项目的 `vendor/firefly-upstream/`。新正式 ZIP 为 246 文件、105 Markdown、39 项 Skill，self-improvement 9 文件；具体 SHA 以当前 manifest 为准。原始源码暂存不参与正式扫描/快照/打包。

准确验收状态：获取路线与优先 self-improvement 替换已实施且有自动防回归；其余 38 项现版继续提供原能力，不计为新上游适配完成。原始获取材料还有四个链接记录（MiniMax 同一 Apache 目标两次、ECC plan-canvas 设计资料、self-healing），未混入正式快照，也不宣称原始来源闭包完整。10 篇不同 as/ecc 正文及新 SP/办公/creator 的宿主工具和交叉调用差异尚未全部适配；PDF/XLSX 公式/重算/渲染等价性未验证，不自动替换。故整体新版本适配仍为**部分完成**，不把37次取得源码或audit 0当成39项运行验收。真实模型、外部办公工具及GUI未执行；现有服务、用户数据、两个原目录和Codex开发插件不动，不暂存、提交、推送或切分支。

本轮最终差异：起点之后新增16文件、修改9文件、没有删除原工作树文件；累计150项差异，起点134项全部保留，暂存区为空，分支与HEAD不变。详细逐路径/哈希差异位于仓库外 `upstream-unified-final-delta.json`；package.json与锁文件相对本轮起点字节不变。最后署名/通知定稿后，最终归档4项及self-improvement 3项再次通过（退出0），不与前述50项重叠累加。`git diff --check`退出0。

## 来源许可专项（2026-09-26，接续技术验收）

本专项不重开已经通过的技术适配。起点为 `license-specialist-start.json` 保存的 126 项工作树状态、1807 个源码文件及哈希，HEAD 仍为 `890bc6165d7b3a476d6069c436145c181bd8a16b`。该起点不是前一轮 88 项状态的历史基线。

处理清单：逐项对照 28 项来源和许可覆盖；复核 docx、skill-creator 与九项 SP 的现有许可；将已经确认的完整许可和限定范围通知纳入既有分发目录；在隔离副本补真实旧 ZIP、生产识别哈希、注册和完整读取链路。只改许可/来源材料和治理记录，不修改生产执行链。

### 本专项结果与证据

**阶段性交付：技术适配维持已验证状态；来源许可专项仍部分完成。** 原 28 项中，27 项已具备可核实来源链和随分发许可/通知；剩余 1 项的 10 个文件尚不能宣布许可覆盖。另复核 docx、skill-creator 与九项 SP 的许可内容、来源和范围，不用文件存在代替核查。本结论不是整体项目、外部办公依赖或角色素材的法律认证。

#### 本次实际改动与分发

新增 `vendor/firefly-skills/licenses/` 六份完整许可（Addy Osmani、Affaan Mustafa、MiniMax、Anthropic、Playa、Peter Skøtt Pedersen），新增 `LICENSE-NOTICES.md` 和 `license-provenance.json`。后者逐文件保留来源 URL、提交、原/当前哈希、比较方法、作用范围及未解决目标；不是以目录前缀认定归属。更新根第三方声明、集中报告与现有治理附件。没有改写归档正文、执行脚本、生产代码、依赖、安装逻辑或模式。

相对本专项 126 项起点：修改 6 个已有报告/声明路径，新增 8 个许可/来源文件，删除 0。当前 134 项工作树状态不是本轮全部产生；完整前后哈希与逐路径差异在仓库外 `license-final-delta.json`。分支、HEAD 未变，暂存区为空，`git diff --check` 退出 0（仅既有 LF/CRLF 提示）。两个原目录及真实用户数据保持不动。

ZIP 与 manifest 相对本专项起点均未变化；当前 ZIP 仍为 `ed49a7b26a45a1b87b34d90ef0c551c2045ecefcc34bbbb8aa768d5c405117f5`。六份许可和通知放在 ZIP 同级分发目录，`electron-builder.yml` 的现有整目录 extraResources 规则将其带入 `resources/firefly-skills`，无需变更哈希识别或迁移用户目录。不能单独分发 ZIP 而遗漏这些相邻材料。独立隔离复制布局的 10 个文件已逐字节核对，不把该检查称为新安装器验证。

#### 原 28 项逐项结果

| Skill | 实际来源/内容对应 | 比较与版本边界 | 许可及所需材料 |
| --- | --- | --- | --- |
| `as-api-and-interface-design` | [addyosmani/agent-skills fea75b16](https://github.com/addyosmani/agent-skills/blob/fea75b16472ba87e8c11f13a9e000c3ffdb2d1f5/skills/api-and-interface-design/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `as-code-review-and-quality` | [addyosmani/agent-skills 01cc8847](https://github.com/addyosmani/agent-skills/blob/01cc88474c67c98331953ce5a286df516b517445/skills/code-review-and-quality/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `as-code-simplification` | [addyosmani/agent-skills fea75b16](https://github.com/addyosmani/agent-skills/blob/fea75b16472ba87e8c11f13a9e000c3ffdb2d1f5/skills/code-simplification/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `as-context-engineering` | [addyosmani/agent-skills fea75b16](https://github.com/addyosmani/agent-skills/blob/fea75b16472ba87e8c11f13a9e000c3ffdb2d1f5/skills/context-engineering/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `as-debugging-and-error-recovery` | [addyosmani/agent-skills cda4542a](https://github.com/addyosmani/agent-skills/blob/cda4542ade0f3c532494b9a48837eb01d39925f1/skills/debugging-and-error-recovery/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `as-doubt-driven-development` | [addyosmani/agent-skills cda4542a](https://github.com/addyosmani/agent-skills/blob/cda4542ade0f3c532494b9a48837eb01d39925f1/skills/doubt-driven-development/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `as-frontend-ui-engineering` | [addyosmani/agent-skills 91d4d075](https://github.com/addyosmani/agent-skills/blob/91d4d07522de9577caf5d213e5bf1acc38fa3df2/skills/frontend-ui-engineering/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `as-git-workflow-and-versioning` | [addyosmani/agent-skills cda4542a](https://github.com/addyosmani/agent-skills/blob/cda4542ade0f3c532494b9a48837eb01d39925f1/skills/git-workflow-and-versioning/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `as-incremental-implementation` | [addyosmani/agent-skills cda4542a](https://github.com/addyosmani/agent-skills/blob/cda4542ade0f3c532494b9a48837eb01d39925f1/skills/incremental-implementation/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `as-planning-and-task-breakdown` | [addyosmani/agent-skills 91d4d075](https://github.com/addyosmani/agent-skills/blob/91d4d07522de9577caf5d213e5bf1acc38fa3df2/skills/planning-and-task-breakdown/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `as-security-and-hardening` | [addyosmani/agent-skills 91d4d075](https://github.com/addyosmani/agent-skills/blob/91d4d07522de9577caf5d213e5bf1acc38fa3df2/skills/security-and-hardening/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `as-source-driven-development` | [addyosmani/agent-skills cda4542a](https://github.com/addyosmani/agent-skills/blob/cda4542ade0f3c532494b9a48837eb01d39925f1/skills/source-driven-development/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `as-spec-driven-development` | [addyosmani/agent-skills 7d36add8](https://github.com/addyosmani/agent-skills/blob/7d36add8cfbfbb4d79714c57f55b9bbea08f0be7/skills/spec-driven-development/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `as-using-agent-skills` | [addyosmani/agent-skills 91d4d075](https://github.com/addyosmani/agent-skills/blob/91d4d07522de9577caf5d213e5bf1acc38fa3df2/skills/using-agent-skills/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `ecc-agent-introspection-debugging` | [affaan-m/ECC d29cf651](https://github.com/affaan-m/ECC/blob/d29cf651c795869f733669c33e3d33dfd8307d10/skills/agent-introspection-debugging/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `ecc-ai-regression-testing` | [affaan-m/ECC d29cf651](https://github.com/affaan-m/ECC/blob/d29cf651c795869f733669c33e3d33dfd8307d10/skills/ai-regression-testing/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `ecc-code-tour` | [affaan-m/ECC d29cf651](https://github.com/affaan-m/ECC/blob/d29cf651c795869f733669c33e3d33dfd8307d10/skills/code-tour/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `ecc-codebase-onboarding` | [affaan-m/ECC db7f2a6f](https://github.com/affaan-m/ECC/blob/db7f2a6fd5b013d56ec0ba0cfc547ba77baddbce/skills/codebase-onboarding/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `ecc-coding-standards` | [affaan-m/ECC d29cf651](https://github.com/affaan-m/ECC/blob/d29cf651c795869f733669c33e3d33dfd8307d10/skills/coding-standards/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `ecc-plan-canvas` | [affaan-m/ECC d29cf651](https://github.com/affaan-m/ECC/blob/d29cf651c795869f733669c33e3d33dfd8307d10/skills/plan-canvas/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `ecc-security-review` | [affaan-m/ECC 3a46c82b](https://github.com/affaan-m/ECC/blob/3a46c82b0c074d8c872be26b8141708c2771ab87/skills/security-review/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `ecc-tdd-workflow` | [affaan-m/ECC 7976e6fa](https://github.com/affaan-m/ECC/blob/7976e6faf24640fe660c8137ec9ff4fc8625b3d5/skills/tdd-workflow/SKILL.md) | 单篇正文匹配（只去 frontmatter/外层空白）；无额外脚本资源 | MIT；完整许可已随分发补齐；非唯一原始版本 |
| `office-design` | [上游新增提交](https://github.com/Playa-0v0/Cyrene-Agent/commit/edca2be98b1899769d18faa7239ba7b398ef13c6) | 8 文件；7 个原字节/LF 匹配，validator 仅既有 Firefly 名称改写 | 上游自身贡献 MIT；补完整 Playa 许可及改写说明 |
| `write-expense-report` | [上游新增提交](https://github.com/Playa-0v0/Cyrene-Agent/commit/be1c6824f4add5efc85eca377eadf7b010301477) | 2 文件与归档前版本对应 | 后续同时包含文件与 MIT 的 `734bfeea…`；不谎称初次新增时已有 LICENSE |
| `pdf` | [MiniMax](https://github.com/MiniMax-AI/skills/tree/60aaae52bb2af8162732751a4332f62a5fef518b/skills/minimax-pdf) → 具名导入 `54b15782…` → Windows/PDF 改写 | 17 文件逐项列出原字节/LF 匹配与后续贡献历史；不是单版原包 | MiniMax MIT + 上游自身贡献 MIT；新增完整许可、来源与改写通知 |
| `pptx-generator` | [MiniMax](https://github.com/MiniMax-AI/skills/tree/60aaae52bb2af8162732751a4332f62a5fef518b/skills/pptx-generator) → `54b15782…` → Office 主题/Firefly 锚点修正 | 9 文件；新增 NOTICE 与正文修正不冒充原版 | MiniMax MIT + 上游贡献许可；保留既有 Firefly 修正通知 |
| `xlsx` | [MiniMax](https://github.com/MiniMax-AI/skills/tree/60aaae52bb2af8162732751a4332f62a5fef518b/skills/minimax-xlsx) → `54b15782…` → Windows/样式目录 | 33 文件；中译参考及平台适配以具名导入和历史证明派生，不称字节匹配 | MiniMax MIT + 上游自身贡献 MIT；补材料，不执行办公外部工具 |
| `self-improving-agent` | [OpenClaw 改写仓库](https://github.com/pskoett/self-improving-agent)、[原插件](https://github.com/pskoett/pskoett-ai-skills) | 15 文件；13 个可对应改写仓库，5 个另可对应带 MIT 的原插件；两个集合重叠，不能相加 | 5 文件范围已确认；其余 10 文件仍未取得足够许可依据，详见下表 |

22 个单文件 Skill 的全部历史匹配及本地 SHA-256 在分发的 provenance JSON 中；没有强行选定唯一原始提交。MiniMax 四目录共 144 文件：83 个能与已检索上游历史作原字节/LF 比较，其余是中译资料、具名导入后贡献和 Firefly 修正；不是 144 文件字节一致。公开基座的归档前版本 `734bfeeab97b0cdaf5a29ee8fd8f0d61efb88948` 用于逐文件追溯，不使用当前改写后的本地基座冒充原版。MiniMax 的完整 CREDITS 已核对：其中 frontend/react-native/flutter 的额外来源不属于当前四个目录，不将其许可套给这里，也不抹去其真实来源。

#### 已有许可的范围复核

- docx：85 文件；完整包内 `docx/LICENSE` 与 MiniMax 的 `ce4855d1…:skills/minimax-docx/LICENSE` 经 LF 规范化一致，版权为 MiniMaxAI；MiniMax 根 MIT 的 MiniMax 署名另外保留。中译参考、Windows 脚本与样式贡献分别保留来源，不将根 MIT 当作其他作者的授权。
- skill-creator：23 文件中 22 个能与 Anthropic 官方插件历史作原字节/LF 对照；正文差异明确包含产品 frontmatter、安装目录和平台更新指引，不称原版。三份包内 Apache 文本已与对应官方提交逐一比较；README/.gitignore 来自官方插件仓库根目录，同版根 Apache 许可已核对。原文附录占位符未擅自填写。
- 九项 SP：沿用原版本/正文/参考来源证据，本次进一步将 ZIP 内九份完整 MIT 与 `ebdd4ec6…:LICENSE` 比较，全部一致；版权 Jesse Vincent。其 MIT 只覆盖已明确的 SP 来源内容，不覆盖其余 30 项。

#### 尚未解决的十个文件

| 目标 | 当前 SHA-256 | 缺少的准确证据 |
| --- | --- | --- |
| `self-improving-agent/assets/ERRORS.md` | `5fbeff84392739b394621635b0e0de053054696382456052e0439254da956148` | 缺此版本 OpenClaw 改写的许可授予或可对应的带许可来源 |
| `self-improving-agent/assets/FEATURE_REQUESTS.md` | `b54946a2657d390152a6d4169c9d6e96353c4938d47f8ce1948bd63190f40ae0` | 缺此版本 OpenClaw 改写的许可授予或可对应的带许可来源 |
| `self-improving-agent/hooks/openclaw/handler.js` | `325b7ec5fb2316a91140d206a9256dda7b375bd3bfa4a808de1fd4372cd20bfd` | 缺此版本 OpenClaw 改写的许可授予或可对应的带许可来源 |
| `self-improving-agent/hooks/openclaw/handler.ts` | `25896788e06aa6f31574c489e4c27056c312b1670c9952f8c1f19a32071ac402` | 缺此版本 OpenClaw 改写的许可授予或可对应的带许可来源 |
| `self-improving-agent/README.md` | `356dd8b5ff2f6d61f48d290377c91cb1e4393aed6ba511bf05419462f5efb4b7` | 缺此版本 OpenClaw 改写的许可授予或可对应的带许可来源 |
| `self-improving-agent/references/examples.md` | `6903a6d63890bafd39fc1f34740ba49906f2137e64e1614bfefdea781d508aa3` | 缺此版本 OpenClaw 改写的许可授予或可对应的带许可来源 |
| `self-improving-agent/references/hooks-setup.md` | `ea5c7a5eec2ce65b23f7d61d2d529cfc8dc0a75b3067da6ebafd01870084d9eb` | 缺此版本 OpenClaw 改写的许可授予或可对应的带许可来源 |
| `self-improving-agent/references/openclaw-integration.md` | `d6ac0beabe487a230bccae03542e19b810f2dcc863bec69d3c15a98de31f940a` | 缺此版本 OpenClaw 改写的许可授予或可对应的带许可来源 |
| `self-improving-agent/scripts/extract-skill.sh` | `2904d2b3448321b949989d71f7f012b021f2958c68698c160e0505a22ba4322a` | 缺此版本 OpenClaw 改写的许可授予或可对应的带许可来源 |
| `self-improving-agent/SKILL.md` | `8477a270061ce850c3e580e613dd18f87ccfcdb556348687fce66b5ec77a9158` | 缺此版本 OpenClaw 改写的许可授予或可对应的带许可来源 |

已核查渠道及结果：

- `pskoett/self-improving-agent` 的实际 HEAD 为 `b889ef0724c27b7181111b8dd1ac3a108d0b5160`；读取仓库树、README 归属、相关文件历史及 LICENSE 历史。13 个文件可对应公开内容，但该改写仓库当前树及已查许可历史没有提供覆盖它们的许可文本。内容一致只证明来源，不证明授权。
- `pskoett/pskoett-ai-skills` 的 plugin/agent-plugin 历史：确认 `d01217a5…` 与 `9c293c17…` 同时包含匹配文件和 Peter Skøtt Pedersen 的 MIT；仅覆盖 JSON 中枚举的五个文件。不是把整个改写包套成 MIT。
- 基座 `cb54b1aa…` 导入历史只说明继承，不替代原权利人的许可。没有新的可验证发布资产线索，停止重复空查；这不是环境阻塞或等待用户安装工具。

待权利人澄清的具体问题：上述十个路径及哈希对应的 OpenClaw 改写内容是否允许修改与再分发、适用哪份许可、需保留哪些署名/通知？本轮未对外联系、未代表用户取得授权。此缺口阻碍“整套继承 Skills 许可与分发材料全部完备”的结论，不否定已通过的技术测试，也不撤下任何能力。

#### 真实旧归档隔离链路

2026-09-26 22:48（本地时间）在包含本轮工作树的隔离副本运行 `vitest run src/main/skills/real-legacy-license.test.ts --reporter=verbose`，最终退出 0，**1 文件 / 2 测试通过，0 跳过，3.84 秒**。不与前一轮 204 项累加成一次完整测试。真实输入为本项目 HEAD 的旧 ZIP（`98005bbb2126c231679d60373f1b50f9219b562c5f33fa98de0a130477c32b27`）及原 manifest（`d95798a20ca71d4cc554e2fe7c9e4ab690192e8823541fac26ebc6dfde65501a`），不是合成哈希。

- 实际 `installSkillsSnapshot → migrateInstalledSkillSnapshot → scanSkills → SkillRegistry → read_skill_reference`，不 mock crypto、解压或生产托管哈希。升级后每个当前 ZIP 文件均与落盘结果比较；39 项注册，正文及 references 经原有分页工具完整读取。
- 三个变化正文的原字节备份校验；再迁移、再安装后文件树不变。用户改写正文、同名 `references/implementer-prompt.md` 和自建 Skill 保持原样。
- 隔离测试初写时把附件放在根目录而非实际 references 目录，第一次失败；修正路径后第二次因夹具未创建父目录失败；补齐夹具后最终两项通过。三次日志均保存，不将夹具错误报为生产回归，也不省略失败历史。
- 测试文件、公开夹具和日志在仓库外 `E:\Codex\Firefly-doc-security-review-20260926`；真实用户数据、服务和当前安装配置未访问或改写。调用覆盖是生产处理函数/注册/读取，不是收费模型、GUI 或办公外部程序实机验证。

#### 本次材料检查与未重跑边界

2026-09-27 运行 `node E:\Codex\Firefly-doc-security-review-20260926\verify-license-delivery.mjs`，退出 0。校验 22 篇单文件正文、其余 192 文件的既有哈希、九份 SP/一份 docx/三份 skill-creator 包内完整许可、六份新增许可原文和实际 extraResources 隔离复制布局。记录见 `license-delivery-verification.json`。没有修改执行代码/依赖/ZIP，因此不重跑已通过的完整构建、安装或全量测试；这些旧结果继续保留旧时间和覆盖范围。真实模型、办公外部工具与 GUI 未验收边界维持原记录。

## Firefly 继承 Skills 适配验收（本次状态）

> 此节标题为既有链接保留；内容是来源许可专项之前的技术适配记录。当前来源许可结论以上方专项节为准。

**部分完成。** 技术缺件、按需加载、重复安装与安全归档已实际补齐并验证；仍有 28 个继承目录缺独立许可/对应版本来源证据，不能宣布全部交付验收通过或公开再分发已核准。以下为本次状态；后文初次及追溯阶段的数据保持历史时间边界。

### 起点与实际修改

起点：`firefly-mini-v1.1.x`，HEAD `890bc6165d7b3a476d6069c436145c181bd8a16b`；88 项已有状态，1773 个源码文件哈希见仓库外 `inherited-skills-start.json`。本次不是此前所有工作的历史基线。原有 ZIP 安全替换、依赖修复、Diagram 声明与文档修改均保留，package/lock 本次未变化。

本次相对起点实际改变 15 个既有路径，新增 34 个路径，删除 0 个起点路径；当前共 1807 个源码文件、126 项完整工作树状态，暂存区为空。49 个本次内容变化不能写成 126 项均由本次产生：其中 11 个既有路径在起点已处于修改状态，本次继续补齐；其余 4 个既有路径本次首次变化。完整路径及前后哈希保存在仓库外 `inherited-final-delta.json`。新增适配目录是开发输入，运行分发只有重建 ZIP；证据、隔离安装环境和备份均不进入仓库。

- `scripts/packaging/skill-adaptations/`：九项 Superpowers 完整 MIT 与来源 NOTICE；两篇 Firefly 维护正文、四个可按需读取的参考 brief、三个新的 Node 辅助实现；PPTX 修复通知。保留原 ID/modes，不改工具权限。
- `scripts/packaging/skill-repairs.json`：按精确源/结果 SHA 修复 PPTX 六个锚点，并明确 LF 规范化。不是完整原包冒充，也不是删除链接。未知修改输入拒绝处理。
- `adapt-skills-snapshot.mjs` 与既有 `build-skills-snapshot.mjs`：固定排序/时间戳/压缩生成，输入输出均经现有安全解压校验；普通 `npm run prepare:skills` 无展开第三方目录时也应用已维护适配。源适配不另外打包；实际资源仍是 extraResources 的 ZIP/manifest。
- `migration/managed-skill-update.ts` 与 `skill-snapshot.ts`：精确原文件 SHA 识别托管版本，附件冲突或用户改写不覆盖；拒绝链接祖先，备份、失败保留旧正文、重试和重复安装。仅隔离夹具执行，不触碰真实 userData。
- `skills/skill-tools.ts`：沿现有 `read_skill_reference` 增加有界续读，修复正文/附件截断后无法读取后续内容。新参数为 `source=body|reference`、非负整数 `offset`；正文只接受 `ref=SKILL.md`。首段仍 6000 字符、每页仍 8000，模式白名单、enabled、路径边界与默认状态不变。安全复核发现新增正文入口不能固定归类为 read，现已让 body 续读解析为与 invoke_skill 相同的 Skill effectKind（缺失仍 unknown），原附件默认 read 不变；回归先验证 read/unknown 差异失败，再覆盖 read/mutation/external_side_effect。并非另一套加载链。
- 对应三处 Skills/迁移测试及两个新回归文件、打包 node:test；运行说明、第三方通知、本报告和治理附件同步更新。没有删除继承能力、合并不同能力或改变模式/默认开关。

### 来源、缺件及最终归档

七处缺失链接实际是四类文档，三项脚本是另外三个文件；没有按十处独立能力统计。旧原归档依然保持其缺件事实。本次从公开 Superpowers 历史找到两篇正文匹配提交，并进一步确认全部九篇正文匹配 `ebdd4ec61f2f560bada4f6ded7b0806e62bf33f7`（只去 YAML frontmatter 和外层空白）。同内容还存在另一历史提交，不能据此推定原归档唯一版本。

MIT 依据是[该提交完整许可](https://github.com/obra/superpowers/blob/ebdd4ec61f2f560bada4f6ded7b0806e62bf33f7/LICENSE)，保留 Jesse Vincent 版权。平台参考中的 antigravity-tools.md 另匹配 `a868631a8a4a942656b7837b60f24c393f86547a` / `55d28ddf1066736bc10483c3c29f8770d911f7a9`；其余三个参考与固定提交字节一致。新 Node 脚本及 brief 明确是 Firefly 维护适配，不冒称原版 Bash 复原、不混入现装开发插件最新版。

- 原来源 ZIP：`9b5b115c81c1629013603ca5b8c5f03145e4fecbe1587f0e55f54e0cd20ac336`。
- 本次前产品 ZIP：`98005bbb2126c231679d60373f1b50f9219b562c5f33fa98de0a130477c32b27`；仓库外保留原字节。
- 本次 ZIP：`ed49a7b26a45a1b87b34d90ef0c551c2045ecefcc34bbbb8aa768d5c405117f5`，817193 字节、252 个文件条目、39 项继承 Skill；3 个正文变化，26 个新增附件/通知/脚本/许可，零文件删除。其余原文件字节保持。
- manifest 同步全部八项当前自有 Skill，记录 29 个适配条目哈希。用本次前真实 ZIP 重建与再次重建获得同一产物 SHA。
- 最终 ZIP 的 108 篇 Markdown、79 个本地文件/标题引用无断链；188 项选定文本（108 MD、53 代码/脚本文本、14 JSON、13 LICENSE）有内容与哈希索引；所有 252 文件有哈希。非文本资源不能由链接通过推导功能已实测。

### Skill—能力—加载—分发—兼容映射

所有条目经 `initSkills → installSkillsSnapshot → migrateInstalledSkillSnapshot → scanSkills → SkillRegistry`，用 `invoke_skill/read_skill_reference` 按需加载。分发路径为 `resources/firefly-skills/skills-snapshot.zip → userData/skills`；完整关联文件路径/哈希逐项见 distribution.json 的当前 `zip.skillGroups/entries`。保留用户 enabled/mode override 优先级和自定义目录覆盖。Chat 不因本次获得工具 Skill；Work/Learn/Code 仍按下面模式门控。运行、审批、取消、子代理、记忆、历史、插件所有者不变。

| Skill | 既有能力（取自实际 description） | 原模式 | 处理与许可边界 |
| --- | --- | --- | --- |
| `as-api-and-interface-design` | Guides stable API and interface design. | code | 保留既有功能，未改写；许可来源仍不足 |
| `as-code-review-and-quality` | Conducts multi-axis code review. | code | 保留既有功能，未改写；许可来源仍不足 |
| `as-code-simplification` | Simplifies code for clarity. | code | 保留既有功能，未改写；许可来源仍不足 |
| `as-context-engineering` | Optimizes agent context setup. | code | 保留既有功能，未改写；许可来源仍不足 |
| `as-debugging-and-error-recovery` | Guides systematic root-cause debugging. | code | 保留既有功能，未改写；许可来源仍不足 |
| `as-doubt-driven-development` | Subjects every non-trivial decision to a fresh-context adversarial review before it stands. | code | 保留既有功能，未改写；许可来源仍不足 |
| `as-frontend-ui-engineering` | Builds production-quality, accessible, responsive user-facing UIs. | code | 保留既有功能，未改写；许可来源仍不足 |
| `as-git-workflow-and-versioning` | Structures git workflow practices. | code | 保留既有功能，未改写；许可来源仍不足 |
| `as-incremental-implementation` | Delivers changes incrementally. | code | 保留既有功能，未改写；许可来源仍不足 |
| `as-planning-and-task-breakdown` | Breaks work into ordered tasks. | code | 保留既有功能，未改写；许可来源仍不足 |
| `as-security-and-hardening` | Hardens code against vulnerabilities. | code | 保留既有功能，未改写；许可来源仍不足 |
| `as-source-driven-development` | Grounds every implementation decision in official documentation. | code | 保留既有功能，未改写；许可来源仍不足 |
| `as-spec-driven-development` | Creates specs before coding. | code | 保留既有功能，未改写；许可来源仍不足 |
| `as-using-agent-skills` | Discovers and invokes agent skills. | code | 保留既有功能，未改写；许可来源仍不足 |
| `docx` | 使用 OpenXML SDK (.NET) 进行专业的 DOCX 文档创建、编辑和格式化。 | work, code, learn | 保留既有功能，未改写；包内有许可文件 |
| `ecc-agent-introspection-debugging` | Structured self-debugging workflow for AI agent failures using capture, diagnosis, contained recovery, and introspection reports. | code | 保留既有功能，未改写；许可来源仍不足 |
| `ecc-ai-regression-testing` | Regression testing strategies for AI-assisted development. | code | 保留既有功能，未改写；许可来源仍不足 |
| `ecc-code-tour` | Create CodeTour `.tour` files — persona-targeted, step-by-step walkthroughs with real file and line anchors. | code | 保留既有功能，未改写；许可来源仍不足 |
| `ecc-codebase-onboarding` | Analyze an unfamiliar codebase and generate a structured onboarding guide with architecture map, key entry points, conventions, and a starter CLAUDE.md. | code | 保留既有功能，未改写；许可来源仍不足 |
| `ecc-coding-standards` | Baseline cross-project coding conventions for naming, readability, immutability, and code-quality review. | code | 保留既有功能，未改写；许可来源仍不足 |
| `ecc-plan-canvas` | Open plans and HTML artifacts in a local browser canvas where the human annotates elements, chats, and approves or requests changes without leaving the page. | code | 保留既有功能，未改写；许可来源仍不足 |
| `ecc-security-review` | Use this skill when adding authentication, handling user input, working with secrets, creating API endpoints, or implementing payment/sensitive features. | code | 保留既有功能，未改写；许可来源仍不足 |
| `ecc-tdd-workflow` | Use this skill when writing new features, fixing bugs, or refactoring code. | code | 保留既有功能，未改写；许可来源仍不足 |
| `office-design` | 为 Word、Excel、PDF 和 PowerPoint 选择并校验统一品牌主题。仅在需要跨格式保持颜色、字体、间距和数据语义一致时使用；单一格式的编辑仍优先使用对应技能。 | work, code, learn | 保留既有功能，未改写；许可来源仍不足 |
| `pdf` | Create, inspect, fill, reformat, and visually verify PDFs on Windows with local Python rendering. | work, code, learn | 保留既有功能，未改写；许可来源仍不足 |
| `pptx-generator` | 生成、编辑和读取 PowerPoint 演示文稿。使用 PptxGenJS 从零创建（封面、目录、内容、章节分隔、总结幻灯片），通过 XML 工作流编辑已有 PPTX，或使用 markitdown 提取文本。触发词：PPT、PPTX、PowerPoint、演示文稿、幻灯片、slide、deck、slides。 | work, code, learn | Firefly锚点适配；许可来源仍不足 |
| `self-improving-agent` | Captures learnings, errors, and corrections to enable continuous improvement. | work, code, learn | 保留既有功能，未改写；许可来源仍不足 |
| `skill-creator` | Create new skills, modify and improve existing skills, and measure skill performance. | work, code, learn | 保留既有功能，未改写；包内有许可文件 |
| `sp-brainstorming` | You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. | code | 保留正文并补齐许可；包内有许可文件 |
| `sp-dispatching-parallel-agents` | Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies | code | 保留正文并补齐许可；包内有许可文件 |
| `sp-requesting-code-review` | Use when completing tasks, implementing major features, or before merging to verify work meets requirements | code | Firefly维护适配；包内有许可文件 |
| `sp-subagent-driven-development` | Use when executing implementation plans with independent tasks in the current session | code | Firefly维护适配；包内有许可文件 |
| `sp-systematic-debugging` | Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes | code | 保留正文并补齐许可；包内有许可文件 |
| `sp-using-git-worktrees` | Use when starting feature work that needs isolation from current workspace or before executing implementation plans - ensures an isolated workspace exists via native tools or git worktree fallback | code | 保留正文并补齐许可；包内有许可文件 |
| `sp-using-superpowers` | Use when starting any conversation - establishes how to find and use skills, requiring skill invocation before ANY response including clarifying questions | code | 保留正文并补齐许可；包内有许可文件 |
| `sp-verification-before-completion` | Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always | code | 保留正文并补齐许可；包内有许可文件 |
| `sp-writing-plans` | Use when you have a spec or requirements for a multi-step task, before touching code | code | 保留正文并补齐许可；包内有许可文件 |
| `write-expense-report` | 当用户要生成记账/支出报告时用。读取近期支出数据，按类目汇总，输出 Excel | work | 保留既有功能，未改写；许可来源仍不足 |
| `xlsx` | Create, read, edit, recalculate, and verify Excel workbooks on Windows while preserving formulas and existing workbook structure. | work, code, learn | 保留既有功能，未改写；许可来源仍不足 |

未因名称相似合并 as/sp/ecc 审查与调试能力，亦未因缺静态 import 撤下任何 Skill。文档生成继续由保留的 docx/pdf/pptx-generator/xlsx 及原 document-tools 承担；支出报告的 `query_expense` / `write_excel` 仍分别由 life-tools / document-tools 注册。子任务适配直接使用当前 `task(description,prompt,subagent_type,task_id?)`，不引入独立代理。

### 要求与验收依据

| 要求 | 实际操作与证据 | 状态 |
| --- | --- | --- |
| 缺失文档/脚本修复 | 两篇适配正文通过 references 加载四篇 brief；三脚本在临时 Git 项目真实执行工作区、Task 1 提取、审查包与不存在任务失败 | 自动验证通过；无自动提交/安装 |
| 扫描、注册、按需读取及完整内容 | 39 项从最终 ZIP 扫描；所有正文和 references 经真实 meta-tool 分页逐段与源字节比较，包括 28 篇长正文；禁用/运行白名单/穿越/重复页/非法偏移覆盖 | 自动验证通过；不等于真实模型逐项调用 |
| 首次、旧版、重复与用户保护 | 新安装+哨兵重装、自定义保留；迁移真实哈希 helper，旧入口接线（集成夹具仅其识别哈希用替身）、冲突/链接/复制失败/备份冲突/重试 | 隔离夹具通过；真实用户目录未操作 |
| 模式、任务、权限与取消 | catalog/scanner/registry、外部路径、prompt-builder/run-preparation、task/dispatcher、取消及参数/工具快照回归 | 受影响自动回归通过；默认状态不变 |
| 当前归档与源层链接 | ZIP 内 79 引用与锚点；PPTX 六处旧锚点修复。源层不伪装为独立完整包：PPTX 使用哈希绑定修复规则，不放一个缺 references 的展开副本 | 本地引用通过 |
| 许可证与版本对应 | 九项 SP MIT 有公开历史依据，来源/改动有 NOTICE；其余 28 目录材料不充分 | 未完成，不由根 MIT 推导 |
| 用户数据/原项目/开发技能保护 | 所有运行使用隔离项目副本及合成临时数据；没有卸载或修改 Codex 开发插件；没有停止服务或迁移真实数据 | 本轮没有此类写入 |
| 依赖/安装 | package/lock 与起点哈希一致；沿用此前冻结安装与依赖树证据。新增打包实现使用此前已声明 JSZip 3.10.1 | 本次未重跑 npm ci，不冒称新安装 |
| 实机与第三方脚本 | 本次只执行已审查的三个新 Node helper，不运行第三方 setup/install，也不逐个请求模型 | 其余 office 脚本及实机不宣称通过 |

### 自动验证与检查边界

环境：隔离副本 `E:\Codex\Firefly-doc-security-review-20260926\isolated-ci-20260926`，Node 24.19.0/npm 11.17.0，包含当前未提交源与必要未跟踪文件，未复制用户数据。缺件、脚本不存在、备份冲突、PPTX 锚点和续读先有失败记录，再修复。过程中一次 3 文件集成检查在源目录执行（20 项通过，使用临时公开夹具）；最终判定使用隔离副本，不把那次当作隔离验证。

本次命令、范围和结果如下；日志均在上述仓库外证据目录，未输出用户正文、密钥或完整环境变量。

| 实际命令与范围 | 本次结果 | 证据/时间（本地 UTC+8） |
| --- | --- | --- |
| `npx vitest run src/main/skills src/main/migration/skill-snapshot.test.ts src/main/migration/managed-skill-update.test.ts src/shared/zip-extraction.test.ts src/main/external-content-paths.test.ts src/main/orchestrator/harness/adapter/prompt-builder.test.ts src/main/orchestrator/harness/builtin-tools.test.ts src/main/orchestrator/harness/adapter/run-preparation.test.ts src/main/orchestrator/harness/tool-dispatcher.test.ts src/main/orchestrator/harness/firefly-harness-cancel.test.ts src/main/orchestrator/tools/registry/tool-argument-validator.test.ts src/main/orchestrator/tools/built-in-tools.snapshot.test.ts` | 21 文件 / 204 项通过，0 跳过，退出 0；受影响组合，不是全量套件 | `inherited-final-tests-v6.log`，22:17:20，10.58 秒 |
| `node --test scripts/packaging/adapt-skills-snapshot.test.mjs` | 3 项通过，0 跳过，退出 0；确定性、最终全部 Markdown 本地链接/锚点、未知正文拒绝修复 | `inherited-final-repack-v5.log`，22:15:50 结束；与 Vitest 分列，不合成全量总数 |
| `npm run prepare:skills` | 退出 0，39 项继承 / 8 项自有声明；SHA 与源项目最终 ZIP 一致 | `inherited-prepare-v5.log`，22:15:51 结束；从前产品备份重建同 SHA 另见 `inherited-original-rebuild.log` |
| `npx tsc -p tsconfig.main.json --noEmit`；`npm run build:main` | 各退出 0，包含最终正文 effectResolver 修正 | `inherited-final-types-v6.log` / `inherited-final-main-v6.log`，22:17 后 |
| `npx tsc -p tsconfig.preload.json --noEmit`；`npm run check:renderer`；`npm run build` | 各退出 0；Main/Preload/CLI/Renderer 完整构建，之后仅 Main 变化已补建 | `inherited-preload-types.log` / `inherited-renderer-types.log` / `inherited-build.log`，21:51–21:52 |
| `npm audit --json`；`npm audit --omit=dev --json` | 各退出 0，当次各严重度 0；package/lock 此后未变 | `inherited-audit.json` / `inherited-audit-production.json`，21:52:28 / 21:52:30 |
| `git diff --check`；治理 JSON/ZIP/manifest/当前副本哈希检查 | 退出 0；所有 1807 当前源码文件与隔离副本相同，起点文件无删除、暂存为空 | `inherited-final-delta.json` 与 `inherited-final-inspection.json`；源/产物分别核对 |

一次归档拒绝回归先出现失败：隔离副本残留了本次已撤下的 PPTX 展开正文，覆盖了故意损坏的测试输入；源项目没有此文件。核对归属/绝对路径后仅删除隔离副本中该自有残留，未改变测试断言或用户工作树。重新验证 3 项全通过，失败日志 `inherited-final-repack-v4.log` 保留。Node 模块类型告警与 Renderer 大块警告仍存在，没有为静默更改配置。此前 204 项/其他批次结果仅为旧证据，不与本次恰好同数的 204 项混同或叠加。

原 139 MD / 327 链接 / 136 外部目标只覆盖当时仓库展开文档，明确不含第三方 ZIP。原 ZIP 的 153 项文本 / 7 缺链另有历史索引。本次最终源层为 155 MD、350 链接、138 个不同外部目标，本地失败 0；由 `check-markdown-links.mjs` 检查并保留 `inherited-repository-links.json`。当前 ZIP 为独立的 108 MD / 79 本地引用，不混用统计。未对所有外部目标重新联网；固定上游来源已通过实际 Git 历史和公开 LICENSE 核对。全部 audit 0 只表示当次公告数据库结果，不解决许可或未实机边界。

### 本次差异安全审查

审查基准为本次 88 项状态/文件哈希快照而不是干净 HEAD；已有 ZIP 落盘/依赖修改不归为本次原创。追踪 initSkills 的唯一生产迁移调用、meta-tools 的 Run 白名单、用户覆盖、build 两条分支与直接 CLI、归档生成/解压及新脚本；查阅 skill-tools 的 Git blame。托管更新 helper 只有迁移入口一个生产调用，不是通用用户文件写入 API。

保留原权限分类（未声明效果仍 unknown）、6000/8000 预算、反穿越及新旧同名用户附件的默认 reference 语义。正文续读只读当前已允许 Skill 的既有缓存，不接受任意路径，并沿用 invoke_skill 的动态效果分类，不能从新增续读入口降为 read；新脚本仅公开夹具执行。没有增加 CI 跳过或非阻断行为。可写祖先目录被同用户恶意进程并发替换、进程在 ZIP/manifest 两次写入间崩溃的原子性未证明；校验可识别不匹配，但不宣称跨文件事务。

### 剩余事项与验收影响

1. 28 个目录仍缺可确认的版本/完整许可来源：14 项 as-、8 项 ecc-，以及 office-design、pdf、pptx-generator、self-improving-agent、write-expense-report、xlsx，逐项列在当前治理附件。实际情况是证据不足，不是范围外、等待授权或已经解决；保留能力不等于许可获准。该项阻止整体验收完成/完整公开分发许可结论。
2. 现有 effectKind 未声明的 Skill 仍受原 unknown 策略约束，本次没有借适配放宽；自动 meta-tool/dispatcher 回归不等于全部真实模型调用获准或成功。现有办公外部工具、服务和 GUI 未逐项实测，不能宣称全功能运行通过。
3. 正文 continuation 已技术补齐，不保证模型会自动读取所有后续页；按需读取和预算仍由当前执行流程约束。TTS、QQ Music 审批、持续 FPS、安装器等旧未覆盖项保留，不在本次重复验收。
4. 没有证据证明任何保留继承资产无用，故本次零 Skill 删除/零合并。后续许可处理需要各目录真实来源与适用分发许可，不能仅套九项 SP 的 MIT。

## 当前授权的继承 Skills 处理清单（实施起点）

本节接续前述调查，但验收目标已经调整为 Firefly 当前交付能力；不要求复原独立 Cyrene 产品。起点为当前开发分支及同一 HEAD，88 项已有工作树标记；仓库外 `inherited-skills-start.json` 保存本轮文件哈希与完整状态，不冒充历史基线。

1. 按实际扫描、注册、模式门控、按需读取、安装迁移和 extraResources 记录 39 项继承能力与关联资产；保留默认开关和用户覆盖机制。
2. 优先修复两篇审查/子代理 Skill 的四种缺失辅助文档、三个缺失脚本，以及一个目录引用错位。追溯明确来源；原版不可确认时只使用清楚标记的 Firefly 适配，不冒称原版。
3. 新旧归档分开保留哈希与来源证据；检查最终分发全文、链接和脚本。许可不能由前缀或项目根 MIT 推导。
4. 更新仅处理可证实未修改的托管 Skill；同名用户文件或修改保留，必要更新只在临时夹具验证，不操作真实 userData。
5. 先运行暴露缺件/更新保护问题的回归，再实现；在当前工作树隔离副本验证扫描/按需读取、首次及重复安装、兼容、脚本及受影响基础能力。依赖不变时不重装依赖；只做必要类型/构建/audit。
6. 直接更新本报告和治理附件，分开记录本轮变化、既有证据和未解决许可/实机边界。不暂存、提交、推送、合并、切分支或清理工作树。

追溯阶段结论（历史）：**部分完成**。当时已补齐本地可验证的声明、依赖图、链接、资料冲突和测试，但两篇说明的七处链接及三个脚本仍缺文件；哈希匹配原归档也缺件。该阶段未取得完整同版输入与许可依据。此事实保留，不作为上文 Firefly 维护适配后的当前结论。

## 基线、范围和证据

- 工作目录 `E:\Codex\Firefly-Agent-migration`；分支 `firefly-mini-v1.1.x`；HEAD `890bc6165d7b3a476d6069c436145c181bd8a16b`。本轮不提交、推送、合并或发布。
- 保留原有 AGENTS.md、上一轮审查报告及两个无内容差异标记；不修改两个原项目、用户数据、应用设置或 CI 失败策略。
- 起始文档清单共 137 项：57 项根目录/通用文档、79 项 Skills/SDK/插件/提示词相关资料，以及上一轮审计报告。逐文件判断见[通用文档登记](2026-09-26-document-review-register.md)和[Skills/SDK 登记](2026-09-26-skills-sdk-document-review.md)。后者另记录本轮新增 examples/README.md。
- 完整依赖分类、锁版本、源码调用、许可、风险及路线见[依赖治理](2026-09-26-dependency-governance.md)，附直接依赖、传递图、第三方分发三个 JSON。覆盖 61 个直接生产依赖、27 个直接开发依赖、1327 个锁包路径。
- 仓库外证据目录：`E:\Codex\Firefly-doc-security-review-20260926`。原始 audit JSON 与文档路径/哈希检查保存在该目录；治理附件亦保存 audit 原文。不得将该证据目录或用户数据加入发布产物。

## 文档修正

1. README、开发/构建说明、渠道和 Learn 指南对应实际脚本及加载方式；澄清本地构建、服务配置、历史验证和当前安全状态的区别。
2. SDK、插件指南与 Skills 对齐实际 API、工具副作用分类、事件语义、资源路径及异步返回契约；没有改变运行权限。
3. 33 份历史记录添加历史标记并与当前操作入口分离；保留原测试结果和旧 1 high 证据。没有将旧“缓解”改写为当时已经修复。
4. 模型 README 按实际受 Git 跟踪并进入 public 构建的资源修正，不再声称仓库不带模型。保留用户已确认授权的事实，再分发范围和原文归档继续属于发布检查。
5. 本轮没有仅为减少数量删除历史施工稿。逐项保留理由见登记表；没有删除版权、完整 MIT 或第三方来源。

## extract-zip 处置

### 决策依据

- [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv)：归档链接目标可指向目标目录外。
- [GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3)：同名链接后跟文件，导致通过链接写出。
- 核对原已安装 `extract-zip@2.0.1` 源码、全部五个直接入口及锁树；npm 公布版本仍为 2.0.1，没有可做兼容小升级的修复版本。
- 评估 [Electron 维护分支](https://github.com/electron/extract-zip)：其接口不支持本项目现有 onEntry 契约，且保留链接创建/覆盖行为，README 明示面向 Electron 内部用途，因此不直接用作本项目安全解压入口。
- 采用维护中的 [yauzl](https://github.com/thejoshwolfe/yauzl) 3.4.0 解析/解压 ZIP，项目仅维护文件落盘适配层。没有自行重写 ZIP 格式解析，没有复制、更名或发布 extract-zip 包。

### 实际变更

- package.json/package-lock.json：移除直接 `extract-zip`，增加精确 `yauzl@3.4.0` 与开发类型 `@types/yauzl@3.4.0`；无无关升级。
- `src/shared/zip-extraction.ts`：统一安全落盘；对应 `zip-extraction.test.ts`。
- 五个入口：`src/plugins/installer.ts`、`src/main/skills/snapshot-install.ts`、`src/main/migration/skill-snapshot.ts`、`scripts/packaging/prepare-mingit.mjs`、`scripts/packaging/build-skills-snapshot.mjs`。保留原调用端预算、哈希、备份和安装隔离；迁移测试同步替身。
- 默认拒绝符号链接、特殊文件、加密条目、路径穿越、危险 Windows 名称、重复文件及文件/目录冲突；这些限制不再依赖调用方是否传 onEntry。
- 完整预检后才创建同父目录的暂存目录，独占创建文件；成功关闭归档后才交付。非空目标不覆盖，失败清理暂存目录；关闭错误不伪报成功，读取和关闭同时失败时保留两个错误。
- 保留 DOS 目录属性识别和祖先目录大小写别名的原兼容行为；重复完整文件路径仍拒绝。
- 默认预算：归档 512 MiB、20,000 条目、单文件 256 MiB、展开 1 GiB；大于 1 MiB 条目的压缩比不超过 200；路径 1024 字节/64 层、元数据 8 MiB。原始名称、Unicode 解码名称、额外字段、注释及目录前缀均计费，避免 Unicode Path extra 隐藏超大原始名称。
- THIRD_PARTY_NOTICES 保留 yauzl MIT 与 Josh Wolfe 版权归属；本项目适配层不是第三方解析器原创声明。

### 全树检查与 audit

两次真实命令 `npm audit --omit=dev --json`、`npm audit --json` 均退出 **0**；本轮新锁报告各级漏洞数均 **0**。这是本次公告数据库结果，不是整个应用安全认证。没有改变 audit 阈值、关闭门禁或吞退出码。

CI 的 `.github/workflows/test.yml` 在本轮之前已有 `continue-on-error: true`，仍是留存报告而非阻断门禁。本轮只修正其过时注释，没有新增该设置或调整失败策略；本地命令退出 0 不依赖该设置。是否将未来 CI 审计改为阻断，需要单独确认，不能把当前 CI 通过等同于审计强制通过。

`npm ls extract-zip --all` 返回空树（不存在包时该命令退出 1）；锁文件无 unscoped `extract-zip` 节点和依赖边。`@electron-internal/extract-zip@1.0.4` 仍由开发依赖 Electron 43.1.0 引入，明确作为不同的第三方工具链依赖保留，不声称所有同名后缀依赖均已移除。其内部下载/解压不是本适配层覆盖范围。

## 自动验证

- 恶意 ZIP 使用真实归档条目，不仅 mock：两条公告攻击链、路径穿越、重复写入、目标链接、异常展开量、元数据预算、加密、关闭失败及原文件保护；正常归档和仓库内真实 Skills 快照亦覆盖。
- 开发过程保留失败证据：旧实现的覆盖/残留/链接目标问题；新适配层评审发现的路径预算、关闭错误、DOS 属性及 Unicode 原始名称预算问题均先验证后修正。
- 最终解压单文件 33 项通过。组合验证及最终文档检查结果在本节末补记；不把开发中单项复测拼成全量套件通过。
- 已执行一次 `npm run build`，Main/Preload/CLI/Renderer 成功；Renderer 大块体积警告仍存在。最终适配层评审修正后又执行受影响的 `npm run build:main` 成功，不重复完整构建。
- Main、Preload、Renderer 类型检查通过；不新增 lint 体系。没有运行完整测试套件、启动应用、下载 MinGit 或制作安装器。

## 未解决项与维护边界

- 插件示例的注销/持久化顺序、Map JSON 存储、分页、可选 finalMessageId 和 ASR 取消 Promise 问题已在示例说明准确列出；本轮不顺带改变这些业务行为。修复前不能把示例当作完整生产方案。
- 初次 firefly-diagram frontmatter 的 autoInject 不由当前加载器读取；接续已删无效声明并验证实际按需加载，没有增加运行机制。
- 初次原作引文重复、装甲 IV/V 存在冲突；接续已找到型号的官方依据并改为 IV，撤下误标的重复心愿段。其余摘录没有逐字官方校验，不宣称全部原文已经核准。
- 第三方归档中部分 Skills 的独立许可材料缺失，见分发索引；不将“未找到许可”当成允许再分发。素材授权范围及安装器内许可完整性仍需发布检查。
- 解压预算是逻辑字节预算，不是进程堆内存硬上限；不提供归档真实性/CRC 安全认证。未验证可写目标祖先目录被同用户恶意进程并发替换的防御；操作系统拒绝清理时亦不能保证删除暂存目录成功。
- 未实测真实 MinGit 下载、跨平台权限、安装器、GUI。TTS、QQ Music 应用内审批、持续帧率等既有未覆盖项不变。没有因本轮 audit 0 自动改写它们。
- 后续只需维护本项目落盘契约与回归，并按 yauzl 上游发布记录评估更新；不需要独立 npm 发布、scope 或账户权限。

## 最终检查补记

- `npx vitest run src/shared/zip-extraction.test.ts src/plugins/installer.test.ts src/main/skills/snapshot-zip-security.test.ts src/main/skills/snapshot-install.test.ts src/main/migration/skill-snapshot.test.ts src/main/dependency-security.test.ts src/main/structure-cleanup.test.ts`：7 个文件、71 项通过，0 跳过，退出 0（3.04 秒）。此前一次组合检查因本汇总文件尚未落盘造成导航断链，1 失败/70 通过；补齐真实目标后复验通过，没有删除断言。
- `node --test scripts/packaging/prepare-mingit.test.mjs`：3 项通过、0 跳过、退出 0（约 194 毫秒）。Node 对 .mjs 导入 TS 的 module 类型探测发出 `MODULE_TYPELESS_PACKAGE_JSON` 性能警告；未为消除警告更改根包 CommonJS 契约。
- 最终 `npx tsc -p tsconfig.main.json --noEmit`、`npx tsc -p tsconfig.preload.json --noEmit`、`npm run check:renderer` 均无类型诊断；命令链退出 0。
- 直接 require `dist/main/shared/zip-extraction.js`，用编译后 CommonJS 模块解压仓库真实 Skills 快照：成功读到 39 个顶层条目，退出 0；临时目录随即清除。不是仅凭 TypeScript 编译宣称运行加载通过。
- 文档检查最终枚举 142 项文本/许可文件；本地 Markdown 文件链接无断链，文档引用的 `npm run` 脚本均存在。检查不验证所有远程 URL 的在线状态或 Markdown 标题锚点，也不执行历史文档命令；这些范围不宣称全面通过。
- `git diff --check` 通过；暂存区为空，工作分支/HEAD 未改变，CI 工作流仅修正注释，步骤和失败策略未变。本轮无新 CI 或实机结果，不把自动回归写成用户体验验收。

## 接续逐项验收

### 起始状态及本次实际修改

- 本次接管起点仍为 HEAD `890bc6165d7b3a476d6069c436145c181bd8a16b`、`firefly-mini-v1.1.x`，工作树 82 项（70 个已跟踪标记、12 个未跟踪文件），暂存区为空。它是本次起点，不是原始迁移或上一轮任务的历史基线。两个已跟踪标记没有内容差异，继续保留。
- 上一轮的安全 ZIP 适配层、五个解压入口、通用文档/SDK/渠道修正、历史标记、AGENTS 和示例说明均为接管前已有；本次没有将它们重新认领为新增实现。没有保存更早轮次开始时的完整内容快照，无法进一步分配那些已有行的历史归属。
- 本次补改八个源码/元数据/测试路径：`package.json`、`package-lock.json`（jszip 测试声明、RxJS peer/类型统一、jsdom 的定向 undici 规则、精确安装脚本记录）；`skills/firefly-diagram/SKILL.md`（删除无效 autoInject，说明实际选择机制）；`prompts/canon_quotes.md`、`prompts/canon_quotes_lite.md`（IV 型、重复段撤下、准确来源说明与已确认名字）；`src/main/character-migration.test.ts`、`src/main/dependency-security.test.ts`、`src/main/skills/skill-scanner.test.ts`（对应回归）。不修改 Agent、权限、数据存储或用户设置。
- 同步七个现有报告/附件：本报告、通用文档登记、Skills/SDK 登记、依赖治理 Markdown 及三个治理 JSON。新增证据放仓库外，没有再新建重复汇总。附件原快照保留时间，新增 `closeoutRevision` 明确最终证据。
- 工作树最终为 88 项（76 个已跟踪标记、12 个未跟踪文件），完整清单保存到仓库外；只增加此前干净的 Diagram、两份摘录和三个测试路径，其他本次操作是在既有修改上补齐，不覆盖既有内容。原工作目录 node_modules 未清除或重装，两个原项目、用户数据、CI 失败策略均未改。

### 要求—检查对象—操作—证据—状态

| 要求 | 检查对象 | 本次实际操作 | 验证证据 | 验收状态 |
| --- | --- | --- | --- | --- |
| 补外部链接检查 | Git 跟踪与未跟踪 Markdown、第三方归档中的 Markdown 链接 | 发出公共链接 HEAD；失败时 GET，保留结果及真实重定向 | 最终 `external-links-closeout.json`；归档 15 个 URL 的独立结果 | 最终 136 个仓库目标和归档 15 个目标均 200。只证明 HTTP 可达，不证明登录、服务、许可或技术内容正确 |
| Markdown 标题锚点 | 本地链接与目标标题 | 解析 Markdown 标题，核对初次四处本地片段引用及接续新增的“接续逐项验收”片段 | `markdown-links-closeout.json`：139 个 Markdown、327 个链接，失败 0 | 文件/标题无断链；不是以普通文本零命中替代 |
| Diagram 声明/加载一致 | `skill-scanner.ts`、`skill-catalog.ts`、真实 Skill 目录 | 删除被忽略的 frontmatter 字段；保留没有 manifest 时的按需选择 | 实际目录扫描、清单可见、自动注入为空的回归；原 catalog/scanner 测试 | 通过；未新增 manifest、加载器或权限 |
| 角色资料冲突来源 | 两份摘录、worldbook、确认的卡芙卡名字 | 官方资料核对型号 IV；移除误标重复段，修正 lite 名字和来源口径 | 角色提示词与模式装配回归；下文来源 | 已修正明确冲突；其他逐字台词与缺失心愿原文未核准，不编造 |
| 第三方说明逐项核验 | ZIP 39 个 Skill、231 条目、153 项文本 | 流式读取全部文本并核对原索引哈希；检查正文声明、资源/链接、许可和来源；对照哈希匹配原始归档和安装的 Superpowers 6.4.2 | distribution.json 的逐路径 `closeoutRevision.documents`；`skill-archive-content-review.json`、`original-skill-source-proof.json` | 部分完成：七处链接和三个脚本缺文件，原包同样缺失；同版完整输入与部分独立许可不足。未执行第三方脚本，未擅改原文或补造许可 |
| jszip 测试依赖声明 | 三个实际 import、锁、许可全文 | 根 devDependencies 明确固定 3.10.1；保留原传递生产用途 | 真 ZIP 测试、MinGit node:test、冻结安装；治理最终声明 | 通过；不再依赖偶然提升 |
| 当前工作树干净安装 | 跟踪及必要未跟踪源码，不是旧 HEAD | 仓库外复制 1773 个文件，并核对 package/lock 内容；在副本运行 npm ci | `isolated-npm-ci-final-deduped.log`，Node 24.19.0/npm 11.17.0，退出 0、1197 个包 | 通过；未复制 .git、原 node_modules、dist、用户数据或凭据 |
| 依赖图与安装脚本 | npm 全树、实际第三方生命周期源码 | 修正 RxJS peer/双类型及 undici 覆盖矛盾；只记录核对后的精确脚本版本 | npm ls 全树退出 0；pending 列表为空；AG-UI/RxJS 同路径同类回归 | 通过当前环境；allowScripts 非强制隔离，未擅改策略 |
| 调用、类型、构建和审计 | 本轮受影响提示词、Skills、依赖、安全解压及 SDK | 隔离副本定向回归、类型检查、构建与两份完整 audit | 下列真实命令与日志 | 通过记录的自动范围；不宣称全量、GUI、安装器或跨平台通过 |
| 各报告最终状态一致 | 三份登记/治理与集中报告、JSON 时间戳 | 原结果保留为初次证据；最终状态互链、声明/哈希/缺口同步 | 最终链接、JSON 与差异检查 | 通过；未改写历史测试结果 |

### 第三方说明的实际缺口与来源追查

- 实际文本构成为 94 篇 Markdown、41 个源码/测试文本、14 个 JSON、4 份许可；不是把 153 项都称为“说明文档”。逐项证据含全文哈希、正文标题、内部/外部链接和命令说明。解析、引用及静态核验不等于每个第三方流程或归档脚本已经执行验证。
- `sp-requesting-code-review/SKILL.md` 的两处 `code-reviewer.md` 均指向缺失的 `sp-requesting-code-review/code-reviewer.md`。
- `sp-subagent-driven-development/SKILL.md` 的 `implementer-prompt.md`、`task-reviewer-prompt.md`、两处 `re-review-prompt.md` 及 `../requesting-code-review/code-reviewer.md` 共五处缺失；最后一项还没有适配快照的 `sp-` 目录名。快照只包含这两篇 SKILL，没有所需辅助文件。
- 已只读找到 `E:\Codex\Cyrene-Agent-master\vendor\cyrene-skills\skills-snapshot.zip`，SHA-256 为 `9b5b115c81c1629013603ca5b8c5f03145e4fecbe1587f0e55f54e0cd20ac336`，与当前 manifest 的 sourceSha256 完全相同。原包也是 231 条目，七个链接目标全部不存在；不是 Firefly 适配时丢失。原目录没有修改，证据为仓库外 `original-skill-source-proof.json`。
- 同一原包的 subagent 正文还要求 `scripts/sdd-workspace`、`scripts/task-brief`、`scripts/review-package`；该 Skill 对应的三个脚本路径也不存在。它们不是 Markdown 链接，不能用七处链接统计掩盖。没有执行不存在的脚本或擅自生成替代实现。
- 实际安装的 Superpowers 6.4.2 有同名辅助文件，但两篇 SKILL 正文与 ZIP 不相同：review 的 base SHA 示例有差别，subagent 文档的调度/决策/脚本等内容有多处差别。因此不能把这个版本的辅助文件当作原快照同版输入。manifest 的 generatedAt、sourceSha256、adaptedAt 没有给出可唯一对应的上游提交；已经找到的原 ZIP 本身不完整，重新运行归档脚本也无法凭空恢复。
- 缺口类别是**原任务内证据不足**，不是范围外或缺少本地修改授权。仍需该原包所用的上游提交/完整同版辅助文件及缺失独立许可依据，而不是再次索取已找到的原 ZIP。现有 6.4.2 不能自动替代；这阻碍“全部第三方说明/引用已完整收口”的验收，不阻碍已完成的本地依赖和 ZIP 安全回归。
- 多篇第三方 Skill 的独立许可证据仍不足，完整路径/39 组状态保留在原分发清单；四份已有许可、原作者和来源未改写。泛用说明里的 `npm run lint`、`test:coverage` 是外部模板例子，本项目没有这些 scripts，不自动执行、不为了文档补建检查机制。实际 Firefly 命令仍以 package.json 为准。
- 其他归档指南涉及 Office/LibreOffice、Python/PPTX 依赖及外部宿主映射；未盲目执行这些脚本，未将静态文本读取标为其运行能力已通过。没有引用证据的来源不编造，第三方内容也不冒称全部自研。

### 已核准的资料修正来源

[HoYoLAB 官方 Honkai: Star Rail 账号的 2024-06-19 展示](https://www.hoyolab.com/article/30028409) 明确使用 Type-IV，与本地 worldbook 的 IV 一致。两份摘录据此更正 V，不宣称整个语音段逐字校验。重复“心愿”实际与“虫子”字节内容相同，本次仅撤下错误标签和重复正文；未凭非官方转录补写心愿台词。保留运行约束及“原作经历不等于用户共同经历”的边界，12 位角色身份不变。

### 本次真实验证与失败过程

所有安装、执行和构建均在 `E:\Codex\Firefly-doc-security-review-20260926\isolated-ci-20260926`；日志/证据位于其父目录，不加入仓库。使用 Node `v24.19.0`、npm `11.17.0`。`npm ci` 的 `--no-audit --no-fund` 仅分离安装阶段输出，随后 prod/all audit 均独立执行并保留真实退出码，没有放宽 CI 审计阈值。

| 实际命令 | 结果/退出码 | 证据文件及边界 |
| --- | --- | --- |
| `npm ci --foreground-scripts --no-audit --no-fund` | 0；1197 个包 | `isolated-npm-ci-final-deduped.log`；当前工作树副本，不是原运行环境 |
| `npm ls --all --offline --ignore-scripts` | 0 | `isolated-npm-ls-final-deduped.log`；原始冻结安装全树曾退出 1，未隐去 |
| `npm approve-scripts --allow-scripts-pending --json` | 0；`allowScripts=[]` | 只读核对；不冒称强制脚本沙箱 |
| 15 个相关文件的 `npx vitest run` | 204 通过，0 跳过，退出 0；10.30 秒 | `targeted-tests-final-deduped.log`；非完整套件，完整调用范围列于下方；日志使用精简 reporter，未逐项打印路径 |
| `node --test scripts/packaging/prepare-mingit.test.mjs` | 3 通过，0 跳过，退出 0 | `mingit-final.log`；本地 fixture，无真实 MinGit 下载 |
| `npx tsc -p tsconfig.main.json --noEmit` | 0 | `tsc-main-final-deduped.log` |
| `npx tsc -p tsconfig.preload.json --noEmit` | 0 | `tsc-preload-final-deduped.log` |
| `npm run check:renderer` | 0 | `tsc-renderer-final-deduped.log` |
| `npm run build` | 0 | `build-final-deduped.log`；Main/Preload/CLI/Renderer，大块体积警告保留 |
| `npm run check:plugin-sdk` | 0 | `sdk-final.log`；当前本地 SDK，非 npm publish |
| `npm run test:plugin-examples` | 0；四个示例编译/Mock 冒烟 | `examples-final.log`；不证明业务持久化与取消缺陷已修复 |
| 在 SDK 目录 `npm pack --dry-run --json` | 0；14 个文件，含 LICENSE，实际路径无额外项 | `sdk-pack-files-final.json`；没有发布包，独立核对实际 JSON 文件清单 |
| 最后仅来源说明文本修改后的三个提示词文件 `npx vitest run` | 13 通过，0 跳过，退出 0 | `prompt-final-text-tests.log`；不与前述 204 项相加成不重复的测试总数 |
| `npx electron --version` | 0；v43.1.0 | `electron-version-final.log`；证明隔离安装的二进制可调用，不是应用 GUI 验收 |
| `npm audit --json` / `npm audit --omit=dev --json` | 各 0；各级漏洞 0 | `audit-all-final-deduped.json` / `audit-prod-final-deduped.json`；不是整个应用安全认证 |

上述两次 Vitest 的实际调用范围：

```powershell
npx vitest run src/main/character-migration.test.ts src/main/prompts/prompt-loader.test.ts src/main/orchestrator/mode-prompt-profile.test.ts src/main/skills/skill-scanner.test.ts src/main/skills/skill-catalog.test.ts src/main/agui-bridge.test.ts src/main/orchestrator/firefly-agent-runtime.test.ts src/main/orchestrator/firefly-agent.test.ts src/shared/zip-extraction.test.ts src/plugins/installer.test.ts src/main/skills/snapshot-zip-security.test.ts src/main/skills/snapshot-install.test.ts src/main/migration/skill-snapshot.test.ts src/main/dependency-security.test.ts src/main/structure-cleanup.test.ts
npx vitest run src/main/character-migration.test.ts src/main/prompts/prompt-loader.test.ts src/main/orchestrator/mode-prompt-profile.test.ts
```

中间实际失败保留：根 RxJS 升到 7.8.2 后，AG-UI 的嵌套 7.8.1 导致 Main TS2416 和 build 退出 2（`tsc-main-final.log`、`build-final.log`）。依据报错定位两份 Observable 名义类型，使用父包定向共用规则和锁去重后再验证成功；没有忽略编译错误、改 Agent 或强转类型。最终完整测试没有重跑，既有全量/实机结果仍只作为历史证据。

### 本次差异安全复核与交付边界

- 已加载 `differential-review:differential-review` 及方法/报告参考。基准分支为当前开发分支，已提交范围基准为 `890bc6165d7b3a476d6069c436145c181bd8a16b`；接管前工作树的差异另按起点记录区分，没有切分支审查。
- 本次修改风险集中于依赖解析：RxJS 有五处直接源码/测试引用及 AG-UI、workflow peer；Diagram 的 scanner/catalog 和四种模式装配有定向回归；两份摘录经模式文件读取。不增加工具、数据写入、网络服务地址或安全旁路。没有把官方名称更正扩大成事实完整认证。
- 本次未发现新增的权限/路径校验降级；既有 ZIP 适配层和五个入口的恶意归档/正常归档回归随最终隔离安装复验。其并发祖先目录替换、物理内存硬限制等原报告边界仍保留，不能从 audit 0 推导不存在。
- 保留已明确待确认的第三方许可/素材再分发、跨平台原生加载、真实 MinGit、安装器和 GUI；本次未启动/停止服务、请求模型或访问用户数据。插件示例的持久化/取消问题仍是已有行为问题，本次仅确保说明准确及编译/Mock 边界，不扩为业务开发。
- **本轮状态仍为部分完成**：第三方七处链接、三个脚本引用以及同版完整输入/部分独立许可证据仍未解决；哈希匹配原包已经找到且证实也缺文件。不能用记录该问题代替修正，更不能将它改称范围外。其余本次可执行的依赖/声明/安装/自动验证已实际完成；全部已有工作树保留，不暂存、提交、推送、合并、发布或重启实机。
