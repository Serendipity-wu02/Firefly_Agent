# 文档、依赖与 Skills 技术验收报告（2026-09-26 至 2026-09-28）

> **日期**：2026-09-26 至 2026-09-28
> **状态**：历史报告；以下事实、依赖版本、源码位置与验证结果只对应各阶段日期，未在本次文档整理中重新执行。
> **范围**：文档准确性、依赖修补、ZIP 安全层、Skills 来源及宿主适配、独立构建和隔离启动。
> **结论**：截至 2026-09-28，自动化与基础隔离启动取得明确通过记录；外部服务、深度实机和完整再分发许可仍保留独立验收边界。当前维护入口见[文档导航](../../README.md)。

## 宿主与源层适配结果（2026-09-28）

正式快照包含 39 项、257 个文件。该阶段只改变五个 Skill 目录，另外 34 个目录保持原字节；15 个变化文件由 `license-provenance.json.currentDistribution` 记录。来源、历史产品、适配中间态与托管识别哈希分别保留。


### 宿主真值与必要修复

`docs/architecture/skills-host-contract.md` 逐项回答 effectKind、scanner、默认/unknown、Skill 文本与工具权限分离、模式、子任务、审批及实际工具风险等十三项问题。确定性回归经过 parse→scan→registry→`invoke_skill`→dispatcher→permission：Skill 正文声称免审批并不能授权 `write_file`；read-only 拒绝、per-action 仍询问。另发现并修正三个实际运行问题：MCP 工具此前未设 risk，默认 safe；服务器自称只读可降低风险，但当前配置没有可信服务器标记；未知效果原被记为 read_only。当前本地有效覆盖以外的 MCP 声明按 unknown/input-control，未知副作用按 non-idempotent 处理并保留不确定结果防重放。外部注解不可信的依据为 [MCP 2025-03-26 Tools 规范](https://modelcontextprotocol.io/specification/2025-03-26/server/tools)。Skill 附件已读记录也从进程全局 Set 改为单次 ToolContext WeakMap，避免不同运行互相误判“已读”。这些修复不增加 Skill 工具权限；外部 MCP 服务未实测。

### 来源明确的 35 项 Skill 宿主兼容判断

下表是对 canonical 正文、固定来源/许可记录、modes、工具与附件、跨 ID 和外部宿主假设的检查结果；`KNOWN_BOUNDARY` 表示明确保留外部宿主或未实机能力，不表示当前 Firefly 自动执行它们。三项 `FIXED` 仅修正文中已证实的无效宿主指令，未扩大权限。其余 32 项正文未改，37 项此前已确认的版本决策没有因该阶段整体升级。

| Skill ID | 结果 | Skill ID | 结果 |
|---|---|---|---|
| as-api-and-interface-design | PASS | as-code-review-and-quality | KNOWN_BOUNDARY |
| as-code-simplification | PASS | as-context-engineering | PASS |
| as-debugging-and-error-recovery | PASS | as-doubt-driven-development | KNOWN_BOUNDARY |
| as-frontend-ui-engineering | KNOWN_BOUNDARY | as-git-workflow-and-versioning | PASS |
| as-incremental-implementation | PASS | as-planning-and-task-breakdown | FIXED |
| as-security-and-hardening | PASS | as-source-driven-development | PASS |
| as-spec-driven-development | PASS | as-using-agent-skills | PASS |
| docx | FIXED | ecc-agent-introspection-debugging | FIXED |
| ecc-ai-regression-testing | PASS | ecc-code-tour | PASS |
| ecc-codebase-onboarding | KNOWN_BOUNDARY | ecc-coding-standards | PASS |
| ecc-plan-canvas | KNOWN_BOUNDARY | ecc-security-review | PASS |
| ecc-tdd-workflow | PASS | pptx-generator | KNOWN_BOUNDARY |
| self-improving-agent | KNOWN_BOUNDARY | skill-creator | KNOWN_BOUNDARY |
| sp-brainstorming | KNOWN_BOUNDARY | sp-dispatching-parallel-agents | KNOWN_BOUNDARY |
| sp-requesting-code-review | PASS | sp-subagent-driven-development | PASS |
| sp-systematic-debugging | PASS | sp-using-git-worktrees | KNOWN_BOUNDARY |
| sp-using-superpowers | PASS | sp-verification-before-completion | PASS |
| sp-writing-plans | PASS |  |  |

`as-planning-and-task-breakdown` 的 `/build` 改为上游约定而非 Firefly 命令；`ecc-agent-introspection-debugging` 不再要求未分发的 `workspace-surface-audit`，改用现有授权的文件/Git 检查；`docx` 删除虚构 `run-script` 可执行示例，并对照其实际 `.csproj` 声明 `DocumentFormat.OpenXml 3.5.1`，保留独立 .NET 项目是外部环境条件。`ecc-plan-canvas` 在起始正文已有 Firefly 可选外部 CLI 警示，因此没有无意义重写；原 hook 行只属外部宿主示例。Claude/Codex/Cursor 等名字仍可出现在来源、比较或明确的外部流程里，不据此声称 Firefly 注册了相应工具。

### 两项工作流及办公版本判断

`office-design` 当前正文、token 契约、四套配色及只读 Python 校验器按现有 PDF/PPTX/XLSX/DOCX 消费者重写；保留 ID、原主题路径和 schema。PDF 只读共享颜色，PPTX loader 把 `foreground` 映射到 `secondary`，Excel/Word 需显式本地样式映射；没有虚构 PowerPoint writer。`write-expense-report` 对真实 `query_expense` 文本和 `write_excel` 二维行契约重写，要求范围、日期、币种、文件不存在与写入确认；标准库 helper 只校验已确认数据并准备参数，不读取用户账本或生成工作簿。两项都沿用现有审批，不自动执行脚本；历史 Playa/Cyrene 能力来源与当前 Firefly 维护实现分开写入各自 NOTICE，完整 MIT 保留。旧已分发正文及其受控附件通过 `managed-skill-versions.json` 的真实哈希识别，用户修改不覆盖；另外三项宿主指引变化也纳入相同保护。

| 项目 | 当前 Firefly 路径 | 固定上游比较输入 | 决定与未证明处 |
|---|---|---|---|
| pdf | Windows Python `make.py`、表单、`render_preview.py` 和视觉检查；`write_pdf` 仅 Work 简易写入，脚本需实际依赖与授权 | MiniMax-AI/skills `60aaae52bb2af8162732751a4332f62a5fef518b` 的 `skills/minimax-pdf`；其 cover 走 `render_cover.js`/浏览器，附件与本地 Python 管线不同 | RETAIN_CURRENT；输入/输出、脚本、Windows 依赖、质量与安全等价性未证明，不替换现有 PDF 渲染流程 |
| xlsx | Windows workspace/XML helper、公式保护、`find-label` 工作表关系修复、可选 LibreOffice 重算；`write_excel` 仅 Work 简易新表 | 同一固定提交的 `skills/minimax-xlsx`；现有更多 Windows wrapper、样式、引用和测试，且本地关系修复有独立回归 | RETAIN_CURRENT；公式、已有文件保护、重算及 Windows 路由的完整等价性未证明，不覆盖现有 `xlsx_workspace.py` |

### 残留与验证边界

对 39 个 canonical 目录扫描 `Cyrene`/`cyrene`/`昔涟`/`.cyrene`/`Playa-`，仅 `office-design/NOTICE.md` 和 `write-expense-report/NOTICE.md` 含历史来源及版权，该阶段产品指令残留为零。`CLAUDE_PLUGIN_ROOT`、OpenClaw、Claude、Codex 和 hooks 的命中按来源文本、外部示例与已警示的可选能力分类，不能把字面存在当作 Firefly 自动钩子。正式 ZIP 的全部 Markdown 链接/标题锚点、39 ID、附件哈希由现有打包回归核对。真实模型、外部 Office、GUI、用户安装环境和公开分发许可仍各自是独立验收边界；较早阶段的许可缺口与技术限制见对应历史章节，不能套用到不同快照。

### 最终验证摘要（2026-09-28）

验证使用独立项目副本与临时用户目录，Node 24.19.0、npm 11.17.0。Bash 集成测试由实际检测到的 Git Bash 提供 `FIREFLY_TEST_BASH`；取消退避夹具已对齐注册的 `read_file` 工具，生产重试策略、超时与断言未放宽。

| 检查 | 历史结果与范围 |
| --- | --- |
| 完整 Vitest | 527 文件，4677 通过、1 跳过、0 失败，退出 0。此结果属于 2026-09-28，不能推定后续版本通过。 |
| 正式快照 | 39 vendor / 8 builtin，257 文件，835450 字节，SHA-256 `6d3ec335cbd5f39282e3f8f0878140d5275f6f96afc75b172b365824fce92ee7`；重复 `prepare:skills` 保持字节一致。 |
| 打包回归 | `build-skills-snapshot.test.mjs` 与 `adapt-skills-snapshot.test.mjs` 共 16 项通过；覆盖 ZIP Markdown 目标/锚点、ID、附件哈希、未知源拒绝、历史归档适配及确定性。 |
| 类型与构建 | `check:renderer`、完整 `build` 退出 0；既有大 chunk 警告保留。 |
| 真实旧 ZIP 升级 | 以 SHA-256 `667740966cf7f06139ab4cf65bb41489b207e3ab54627c1e2d0cfc297b9a5e72` 的正式旧归档为输入，经编译后的生产迁移函数更新；五个变化 Skill 的正文/附件与 canonical 源逐字节一致，备份存在，重复执行不变。 |
| 隔离 Electron Smoke | 加载该项目 Main/Renderer；临时 appData/userData/sessionData；registry 47、UI 46、隐藏 1；Chat/Work/Learn/Code 四入口切换并正常退出。测试路径包装器不属于生产入口。 |

首次完整验证曾因 Bash 环境缺项及取消退避夹具工具名不一致失败；以上为修正验证环境和夹具后的完整结果，不将前后两次拼为一次通过。用户修改保护与失败恢复由定向回归覆盖。验证未使用真实用户设置、模型或外部服务。


## 独立维护与运行边界（2026-09-27）

该阶段确认 Firefly 仓库为唯一产品源码基线。工程独立不改变上游来源、版权或素材授权边界。结构职责集中于 `docs/architecture/firefly-runtime.md`：`migration` 承担持久数据兼容与托管升级；`startup/application`、`chat/chats`、`services/cita/cita` 分别按实际职责维护，不因名称相近而合并。

产品显示名 Firefly_Agent、技术包 firefly-agent、应用/数据目录 Firefly、appId com.serendipitywu02.firefly、CLI firefly、SDK @firefly/plugin-sdk 保持既有契约。

### 已确认的缺陷与处理

1. 旧官方附件曾被当作用户修改而拒绝更新 XLSX/PDF/DOCX/PPTX/SP using 五项。修正以 14 个实际旧附件 SHA 识别受控版本，逐文件备份并最后写正文；未知附件、用户修改和备份冲突不覆盖。
2. 单包备份冲突曾中断全部 Skills 初始化。修正使每包保留规范化失败诊断并继续其他包；初始化继续扫描现有文件、注册 meta-tools，仍传播设置读取异常。失败不能记为升级成功。
3. Main/preload 各输出 13 个 shared `.test.js`，会被 builder 的 dist glob 打包。两份 tsconfig 排除 `src/**/*.test.ts` 后，正式输出不再含测试 JS/映射；Vitest 扫描及原测试保留。
4. 进程级 `readRefs` 缺少 run/session 作用域，曾阻止其他任务重读同一页；2026-09-27 记录为 P2，2026-09-28 已改为 ToolContext WeakMap，见本文首节。Main 额外编译 sim 与工具副作用 import 仍属按模块维护事项。

### 独立性证据与限制

- TypeScript AST 检查 5713 个 import/require/字面动态引用边，相对引用未越出仓库；运行、构建及脚本未发现对来源项目工作树的绝对路径依赖。
- 独立副本的 Node 包装器拒绝来源项目的文件、模块和子进程访问，负向自测生效；后续构建、测试和 Smoke 未新增拒绝。该方法不是 OS 级断盘或全部 native 系统调用审计。
- 构建条件为当前源码、声明依赖及明确的 Rust/MSVC/Git/下载环境。Rust 截图 helper 构建与 MinGit 2.55.0.3 准备/校验通过；extraFiles/extraResources 输入存在，不等于安装器或截图实机验收。
- 该阶段定向 Vitest 16 文件/134 项、Node 打包回归 5 文件/19 项均通过且无跳过；SDK 检查及四示例编译/Mock 通过（工具数 2/1/4/1）。这些范围不与 2026-09-28 完整结果累加。
- Skills 安装、快照及插件解压共同依赖安全 ZIP 层，依赖更新与调用端变更必须作为可构建整体维护；运行层、架构说明和产品介绍按用途分离。

### XLSX 关系解析与 Electron 验证环境

XLSX 的 `find-label` 原来对 worksheet `Target="/xl/worksheets/sheet1.xml"` 固定拼接 `xl/`，错误访问 `xl/xl/worksheets/sheet1.xml`。修正分别处理根相对与来源 part 相对目标，规范化 POSIX 分段及 `.`/`..`，拒绝越界、外部/URL、非 worksheet 或缺失目标；公式与原文件保持不变。公开夹具成功返回 `Sheet!A1`，关系形式、工作表名、非法目标与公式字节保护均有回归。

来源脚本 SHA-256 `676a2521264b2c87425233df12591f9fe5e0b207289806bad9d8ea828e680545`；Firefly 适配 SHA-256 `7743ec3e6cb37a0d632b3133ca068b4ddff70288a5f493fbd8d35867dc413320`。构建器只接受已识别内容。依据：[来源 part 关系解析](https://learn.microsoft.com/en-us/dotnet/api/system.io.packaging.packagerelationship.targeturi)、[根相对 worksheet 示例](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/structure-of-a-spreadsheetml-document)。

Electron Smoke 若替换 Windows `USERPROFILE`，即使其他目录变量不变，也会使 `app.getPath("appData")`/`userData` 失败，退出 2147483651；单独改 APPDATA、LOCALAPPDATA、HOME 或 TEMP/TMP 不触发同一失败。验证因此保持系统 profile，并在加载 Main 前将应用目录重定向至隔离目录；该包装器不进入产品。

当时办公环境有 Python/openpyxl/python-pptx 与 .NET 命令，没有 python-docx、.NET SDK、LibreOffice/soffice、pptxgenjs、markitdown、reportlab、pypdf。XLSX 只读夹具通过不能外推为其他办公管线通过。


## 安全解压与依赖修补（2026-09-26）

### 决策依据

- [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv)：归档链接目标可指向目标目录外。
- [GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3)：同名链接后跟文件，导致通过链接写出。
- 核对原已安装 `extract-zip@2.0.1` 源码、全部五个直接入口及锁树；当日核对 npm 公布版本为 2.0.1，没有可做兼容小升级的修复版本。
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

两次真实命令 `npm audit --omit=dev --json`、`npm audit --json` 均退出 **0**；该阶段新锁报告各级漏洞数均 **0**。这是本次公告数据库结果，不是整个应用安全认证。没有改变 audit 阈值、关闭门禁或吞退出码。

CI 的 `.github/workflows/test.yml` 在该阶段之前已有 `continue-on-error: true`，仍是留存报告而非阻断门禁。该阶段只修正其过时注释，没有新增该设置或调整失败策略；本地命令退出 0 不依赖该设置。是否将未来 CI 审计改为阻断，需要单独确认，不能把当前 CI 通过等同于审计强制通过。

`npm ls extract-zip --all` 返回空树（不存在包时该命令退出 1）；锁文件无 unscoped `extract-zip` 节点和依赖边。`@electron-internal/extract-zip@1.0.4` 仍由开发依赖 Electron 43.1.0 引入，明确作为不同的第三方工具链依赖保留，不声称所有同名后缀依赖均已移除。其内部下载/解压不是本适配层覆盖范围。

### 依赖解析与验证条件

最终声明为 61 个生产、28 个开发直接依赖，1327 个锁记录（含根）、23 个顶层 override。冻结安装与 `npm ls --all --offline --ignore-scripts` 均退出 0；安装共 1197 个包。完整逐包版本、风险和许可见[依赖治理报告](2026-09-26-dependency-governance.md)。

- jszip 3.10.1 明确列入开发依赖，供三个真实 ZIP 测试使用；此前只是生产依赖提升到根。保留其 `(MIT OR GPL-3.0-or-later)` 声明及实际 MIT 全文，不据此删除生产传递用途。
- workflow-core 要求 RxJS ^7.8.2；根从 7.8.1 升至 7.8.2 后，AG-UI 固定的嵌套 7.8.1 导致 Observable/Subscriber 名义类型冲突和 TS2416。父包限定 `@ag-ui/client → rxjs: "$rxjs"` 后只保留根版本，同路径、同类对象回归通过；未用类型强转绕过。
- jsdom 的 `undici ^8.10.2` 与全局 7.29.0 override 冲突；采用 jsdom 专属 8.10.2，其余构建链保留 7.29.0，未降级 jsdom 或全树升级。
- 核对 esbuild 0.28.2 与 electron-winstaller 5.4.0 的安装脚本后记录精确版本；pending 脚本列表为空。npm 11.17.0 的 allowScripts 仅警告未记录项，不能称作强隔离沙箱。

验证输入：package.json SHA-256 `bc848e7f2ed00b6e1a098b087a0acb634c204e9c08303ebbac8ed9e714130d7e`；package-lock.json SHA-256 `ee0b9282f8275972fceb25d5d01d32b229150888037504e754e900105947fb50`。这些哈希用于对应历史证据，不是当前版本承诺。


## Firefly 继承 Skills 适配验收（本次状态）

本节标题保留用于原链接；描述 2026-09-26 技术适配，后续来源和宿主决策另列。

### 适配与运行契约

- `scripts/packaging/skill-adaptations/`：九项 Superpowers 完整 MIT 与来源 NOTICE；两篇 Firefly 维护正文、四个可按需读取的参考 brief、三个新的 Node 辅助实现；PPTX 修复通知。保留原 ID/modes，不改工具权限。
- `scripts/packaging/skill-repairs.json`：按精确源/结果 SHA 修复 PPTX 六个锚点，并明确 LF 规范化。不是完整原包冒充，也不是删除链接。未知修改输入拒绝处理。
- `adapt-skills-snapshot.mjs` 与既有 `build-skills-snapshot.mjs`：固定排序/时间戳/压缩生成，输入输出均经现有安全解压校验；普通 `npm run prepare:skills` 无展开第三方目录时也应用已维护适配。源适配不另外打包；实际资源仍是 extraResources 的 ZIP/manifest。
- `migration/managed-skill-update.ts` 与 `skill-snapshot.ts`：精确原文件 SHA 识别托管版本，附件冲突或用户改写不覆盖；拒绝链接祖先，备份、失败保留旧正文、重试和重复安装。仅隔离夹具执行，不触碰真实 userData。
- `skills/skill-tools.ts`：沿现有 `read_skill_reference` 增加有界续读，修复正文/附件截断后无法读取后续内容。新参数为 `source=body|reference`、非负整数 `offset`；正文只接受 `ref=SKILL.md`。首段仍 6000 字符、每页仍 8000，模式白名单、enabled、路径边界与默认状态不变。安全复核发现新增正文入口不能固定归类为 read，现已让 body 续读解析为与 invoke_skill 相同的 Skill effectKind（缺失仍 unknown），原附件默认 read 不变；回归先验证 read/unknown 差异失败，再覆盖 read/mutation/external_side_effect。并非另一套加载链。
- 对应三处 Skills/迁移测试及两个新回归文件、打包 node:test；运行说明、第三方通知、本报告和治理附件同步更新。没有删除继承能力、合并不同能力或改变模式/默认开关。

### 来源、缺件及最终归档

七处缺失链接实际是四类文档，三项脚本是另外三个文件；没有按十处独立能力统计。旧原归档依然保持其缺件事实。该阶段从公开 Superpowers 历史找到两篇正文匹配提交，并进一步确认全部九篇正文匹配 `ebdd4ec61f2f560bada4f6ded7b0806e62bf33f7`（只去 YAML frontmatter 和外层空白）。同内容还存在另一历史提交，不能据此推定原归档唯一版本。

MIT 依据是[该提交完整许可](https://github.com/obra/superpowers/blob/ebdd4ec61f2f560bada4f6ded7b0806e62bf33f7/LICENSE)，保留 Jesse Vincent 版权。平台参考中的 antigravity-tools.md 另匹配 `a868631a8a4a942656b7837b60f24c393f86547a` / `55d28ddf1066736bc10483c3c29f8770d911f7a9`；其余三个参考与固定提交字节一致。新 Node 脚本及 brief 明确是 Firefly 维护适配，不冒称原版 Bash 复原、不混入现装开发插件最新版。

- 原来源 ZIP：`9b5b115c81c1629013603ca5b8c5f03145e4fecbe1587f0e55f54e0cd20ac336`。
- 该阶段前产品 ZIP：`98005bbb2126c231679d60373f1b50f9219b562c5f33fa98de0a130477c32b27`；仓库外保留原字节。
- 该阶段 ZIP：`ed49a7b26a45a1b87b34d90ef0c551c2045ecefcc34bbbb8aa768d5c405117f5`，817193 字节、252 个文件条目、39 项继承 Skill；3 个正文变化，26 个新增附件/通知/脚本/许可，零文件删除。其余原文件字节保持。
- manifest 同步全部八项该阶段自有 Skill，记录 29 个适配条目哈希。用该阶段前真实 ZIP 重建与再次重建获得同一产物 SHA。
- 最终 ZIP 的 108 篇 Markdown、79 个本地文件/标题引用无断链；188 项选定文本（108 MD、53 代码/脚本文本、14 JSON、13 LICENSE）有内容与哈希索引；所有 252 文件有哈希。非文本资源不能由链接通过推导功能已实测。

### Skill—能力—加载—分发—兼容映射

所有条目经 `initSkills → installSkillsSnapshot → migrateInstalledSkillSnapshot → scanSkills → SkillRegistry`，用 `invoke_skill/read_skill_reference` 按需加载。分发路径为 `resources/firefly-skills/skills-snapshot.zip → userData/skills`；完整关联文件路径/哈希逐项见 distribution.json 的当前 `zip.skillGroups/entries`。保留用户 enabled/mode override 优先级和自定义目录覆盖。Chat 不因本次获得工具 Skill；Work/Learn/Code 仍按下面模式门控。运行、审批、取消、子代理、记忆、历史、插件所有者不变。

| Skill | 既有能力（取自实际 description） | 原模式 | 处理与许可边界 |
| --- | --- | --- | --- |
| `as-api-and-interface-design` | Guides stable API and interface design. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `as-code-review-and-quality` | Conducts multi-axis code review. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `as-code-simplification` | Simplifies code for clarity. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `as-context-engineering` | Optimizes agent context setup. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `as-debugging-and-error-recovery` | Guides systematic root-cause debugging. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `as-doubt-driven-development` | Subjects every non-trivial decision to a fresh-context adversarial review before it stands. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `as-frontend-ui-engineering` | Builds production-quality, accessible, responsive user-facing UIs. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `as-git-workflow-and-versioning` | Structures git workflow practices. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `as-incremental-implementation` | Delivers changes incrementally. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `as-planning-and-task-breakdown` | Breaks work into ordered tasks. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `as-security-and-hardening` | Hardens code against vulnerabilities. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `as-source-driven-development` | Grounds every implementation decision in official documentation. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `as-spec-driven-development` | Creates specs before coding. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `as-using-agent-skills` | Discovers and invokes agent skills. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `docx` | 使用 OpenXML SDK (.NET) 进行专业的 DOCX 文档创建、编辑和格式化。 | work, code, learn | 保留既有功能，未改写；包内有许可文件 |
| `ecc-agent-introspection-debugging` | Structured self-debugging workflow for AI agent failures using capture, diagnosis, contained recovery, and introspection reports. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `ecc-ai-regression-testing` | Regression testing strategies for AI-assisted development. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `ecc-code-tour` | Create CodeTour `.tour` files — persona-targeted, step-by-step walkthroughs with real file and line anchors. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `ecc-codebase-onboarding` | Analyze an unfamiliar codebase and generate a structured onboarding guide with architecture map, key entry points, conventions, and a starter CLAUDE.md. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `ecc-coding-standards` | Baseline cross-project coding conventions for naming, readability, immutability, and code-quality review. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `ecc-plan-canvas` | Open plans and HTML artifacts in a local browser canvas where the human annotates elements, chats, and approves or requests changes without leaving the page. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `ecc-security-review` | Use this skill when adding authentication, handling user input, working with secrets, creating API endpoints, or implementing payment/sensitive features. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `ecc-tdd-workflow` | Use this skill when writing new features, fixing bugs, or refactoring code. | code | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `office-design` | 为 Word、Excel、PDF 和 PowerPoint 选择并校验统一品牌主题。仅在需要跨格式保持颜色、字体、间距和数据语义一致时使用；单一格式的编辑仍优先使用对应技能。 | work, code, learn | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `pdf` | Create, inspect, fill, reformat, and visually verify PDFs on Windows with local Python rendering. | work, code, learn | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `pptx-generator` | 生成、编辑和读取 PowerPoint 演示文稿。使用 PptxGenJS 从零创建（封面、目录、内容、章节分隔、总结幻灯片），通过 XML 工作流编辑已有 PPTX，或使用 markitdown 提取文本。触发词：PPT、PPTX、PowerPoint、演示文稿、幻灯片、slide、deck、slides。 | work, code, learn | Firefly锚点适配；该阶段许可来源仍不足 |
| `self-improving-agent` | Captures learnings, errors, and corrections to enable continuous improvement. | work, code, learn | 保留既有功能，未改写；该阶段许可来源仍不足 |
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
| `write-expense-report` | 当用户要生成记账/支出报告时用。读取近期支出数据，按类目汇总，输出 Excel | work | 保留既有功能，未改写；该阶段许可来源仍不足 |
| `xlsx` | Create, read, edit, recalculate, and verify Excel workbooks on Windows while preserving formulas and existing workbook structure. | work, code, learn | 保留既有功能，未改写；该阶段许可来源仍不足 |

未因名称相似合并 as/sp/ecc 审查与调试能力，亦未因缺静态 import 撤下任何 Skill。文档生成继续由保留的 docx/pdf/pptx-generator/xlsx 及原 document-tools 承担；支出报告的 `query_expense` / `write_excel` 仍分别由 life-tools / document-tools 注册。子任务适配直接使用当前 `task(description,prompt,subagent_type,task_id?)`，不引入独立代理。

### 该阶段最终验证（2026-09-26）

隔离副本使用 Node 24.19.0、npm 11.17.0。继承 Skills 适配的受影响 Vitest 组合为 **21 文件 / 204 项通过，0 跳过，退出 0**；`adapt-skills-snapshot.test.mjs` 打包回归为 **3 项通过，0 跳过，退出 0**，覆盖确定性重建、最终 ZIP 全部 Markdown 本地链接/锚点及未知正文拒绝。两组分列；本节 21 文件组合与依赖冻结阶段的 15 文件 / 204 项是不同验证，不互相替代或累加。

- 从最终 ZIP 扫描、注册 39 项 Skill；所有正文与 references 经真实 meta-tool 逐页核对源字节，包括 28 篇长正文，覆盖禁用状态、运行白名单、穿越、重复页和非法偏移。
- 模式、权限与取消覆盖 catalog/scanner/registry、prompt-builder/run-preparation、task/dispatcher、参数校验及工具快照；默认状态和审批语义不变。
- 用户保护覆盖首次安装、哨兵重装、自定义内容、旧版迁移接线、附件/备份冲突、链接、复制失败、重试与重复执行。该阶段旧入口集成夹具仅对识别哈希使用替身，不冒充后续真实旧归档链路；真实用户目录未操作。
- `prepare:skills` 确认 39 项继承 / 8 项自有声明及对应产物哈希；Main、Preload、Renderer 类型检查与完整构建通过，最终正文 effectResolver 变更已补验 Main。prod/all audit 当次均退出 0、各级告警为 0。

这些结果限于该日期的自动化与隔离夹具，不证明真实模型逐项调用、外部办公程序、GUI 或完整再分发许可已通过。

## 上游版本与宿主兼容（2026-09-27）

### 固定来源获取与许可检查（2026-09-27）

获取工具仅导入已核对的脚本、配置、测试与使用说明，八份输入校验和匹配。原始源码暂存在正式分发范围之外，不执行上游脚本或安装 hooks。

按 ID 去重后取得 37 项源码：35 条获取路线及 PDF/XLSX 两项比较材料；office-design 与 write-expense-report 使用已有明确来源的维护内容。docx 的嵌套 MIT 与根 MIT 不同，核对完整文本、MiniMaxAI 署名和 Git blob `53218a2ed6d176e4c189e0c2925aeea64996e348` 后采用严格许可哈希配置，未绕过嵌套许可检查。

`self-improving-agent` 改用 `pskoett/pskoett-ai-skills@8a71d7098d7c39494dcaa46254885225ddb5d259:plugin/skills/self-improvement`：完整 plugin/LICENSE 无冲突嵌套许可；七个复用文件与固定来源字节相同。保留 LRN/ERR/FEAT 记录、解决、复查、关联、提升与手工提炼能力，四个模板、实例、脚本、MIT/NOTICE 随包；不引入外部 hooks 或不存在的 self-healing。旧 15 个文件退出新分发，不倒推其授权，也不删除用户旧附件或备份。

22 项 as/ecc 正文只去 frontmatter、外层空白和 CRLF 后比较：12 项等价、10 项不同；不代表整个目录一致。原始获取材料仍有 MiniMax Apache 目标、ECC plan-canvas 外部设计资料和 self-healing 等引用缺口，不进入正式快照，不宣称原始来源闭包完整。获取成功不等于完成宿主适配。


### 三项上游更新与保护

- `as-api-and-interface-design`：纳入固定 Addy Osmani 提交 `2686b620fc1fed2e8f60c704839c766b8594c6b6` 的幂等改进：意图稳定键、原子认领、同键载荷一致性、处理中状态、成功/失败/未知结果与保留周期。不存在的独立退役 Skill 指令适配为正文中的兼容迁移步骤，不编造新工具。
- `as-context-engineering`：纳入同提交的已完成任务交接、75%上下文整理建议及提交授权条件。额外明确进程监督属于外部机制，不是 Firefly 重启命令，不增加运行循环或自动重启。
- `as-using-agent-skills`：在相同固定来源的工作流基础上编写 Firefly 维护的路由适配。调用使用真实ID/skill_id、已交付的TDD工作流及授权内联执行；未交付流程明确不伪称已调用。上游名称仅作为映射说明，不注册全局别名，不影响用户同名Skill优先级。保持按需使用和禁止自身递归，task字段依据 `src/main/orchestrator/harness/builtin-tools.ts`。
- 三项均保留原 frontmatter、Code模式、效果分类与权限；加入完整原作者 MIT 和改动通知。新许可与已获取固定提交的 LICENSE 字节哈希一致。旧正文只放测试夹具，不进入分发 ZIP；用户备份仍由原托管更新机制保存。
- 快照构建只接受三项已记录原目录哈希或该阶段完整适配目录；未知修改拒绝替换。生产迁移仅增加三个原正文的真实 SHA 识别，复用既有备份、同名附件保护、重复执行和用户修改保护，没有双加载链。

### 39 项版本决策与阶段边界

治理 JSON 的 `upstreamCompatibilityReview.entries` 为逐项清单，记录原/现正文 SHA、固定上游提交/目录/许可 blob、正文比较、附件名称与字节差异、决策及验证边界。该阶段正式 ZIP SHA 为 `1fc7191304ec3fad2daeb158c3f885dc3f2bf40e58c5985c51541f7adfdbc773`。

汇总：37项上游源码此前已取得；12项 as/ecc 正文等价且无新增附件，不为版本标签重写；该阶段3项升级适配；其余24项保留现版（包含已完成的 self-improving-agent 及2项明确来源的本地维护内容）。没有把保留现版计为获取失败，也没有把它等同于所有宿主假设已验证。

该阶段尚待补齐的语义项如下；后续 2026-09-27 宿主适配已处理这些问题，外部运行验证仍独立保留：

1. 发现流程的实际 ID 路由已经修正并通过所有声明目标均已注册/Code可用的断言；但其他 Skill 直接单独调用时的跨Skill假设仍需逐篇处理，不能依赖用户一定先读取发现流程。
2. SP 的 `superpowers:*` 调用与 Firefly `sp-*` ID、缺失 executing-plans/TDD 调用尚未形成完整闭环；当前 task 适配的两个 Skill 保留不回退，但不能以它们通过推导另外七项全部宿主兼容。
3. 新安全/前端/规划正文的包外 security/accessibility/definition-of-done 资料，以及 plan-canvas 的外部 CLI、后台等待、hooks 假设，未适配进入正式快照；保留当前版本的决定不等于这些已有正文中的隐含引用已修复。
4. 9项SP及7项办公内容的逐附件语义审查、所有39项的明文路径/Skill调用闭环仍未全部完成。办公类明确保留 Windows 文件保护、公式、重算、渲染与主题实现，没有拿新版本替换缺失的等价能力。

这些项目属于当时尚未完成的语义适配与验证。Markdown标准本地链接通过与正文分页读取通过不能抵消它们。既有 Windows 真实符号链接权限跳过继续保留；Git源树符号链接拒绝夹具不冒充真实文件系统链接逃逸的等价验证。

## 来源许可专项（2026-09-26，接续技术验收）

该阶段在技术适配之外复核 28 项来源许可，以及 docx、skill-creator、九项 SP 的既有许可。原 28 项中 27 项取得可核实来源链及随分发材料；self-improving-agent 仍有十个改写文件证据不足。该缺口属于下表所列历史版本，2026-09-27 后采用不同的有据来源替换，不能倒推旧文件已获许可。

新增六份完整许可及 `LICENSE-NOTICES.md`、`license-provenance.json`，保留 Addy Osmani、Affaan Mustafa、MiniMax、Anthropic、Playa、Peter Skøtt Pedersen 的署名与具体覆盖范围。相邻许可材料通过既有 extraResources 进入 `resources/firefly-skills`；不能只分发 ZIP 而遗漏这些文件。许可材料布局的字节核对不等于安装器或法律合规认证。


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
- 基座 `cb54b1aa…` 导入历史只说明继承，不替代原权利人的许可。未取得足以覆盖全部文件的新增发布资产证据。

待权利人澄清的具体问题：上述十个路径及哈希对应的 OpenClaw 改写内容是否允许修改与再分发、适用哪份许可、需保留哪些署名/通知？该阶段没有对外联系或取得新增授权。此缺口阻碍“整套继承 Skills 许可与分发材料全部完备”的结论，不否定已通过的技术测试，也不撤下任何能力。

### 许可与旧版兼容验证

2026-09-26 的真实旧 ZIP/manifest 输入分别为 `98005bbb2126c231679d60373f1b50f9219b562c5f33fa98de0a130477c32b27`、`d95798a20ca71d4cc554e2fe7c9e4ab690192e8823541fac26ebc6dfde65501a`。隔离链路 `installSkillsSnapshot → migrateInstalledSkillSnapshot → scanSkills → SkillRegistry → read_skill_reference` 共 2 项通过，无 crypto、解压或生产托管哈希替身；39 项注册，正文与 references 完整分页读取，备份、重复安装、用户改写及同名附件保护均覆盖。

2026-09-27 材料核对覆盖 22 篇单文件正文、其余 192 文件的既有哈希、九份 SP/一份 docx/三份 skill-creator 包内许可、六份新增许可及 extraResources 布局，检查通过。未执行第三方办公脚本、真实模型或 GUI。


## 最终检查补记

本节保留 2026-09-26 的验证范围，供原链接引用；不替代 2026-09-28 完整结果。

| 检查对象 | 历史最终结果 | 限制 |
| --- | --- | --- |
| ZIP 层及五个调用入口相关组合 | 7 文件/71 项通过，无跳过；ZIP 单文件 33 项为其中子集 | 不累加为全量测试 |
| MinGit node:test | 3 项通过，无跳过 | 本地归档夹具，不是下载或安装器验证 |
| 编译后 CommonJS ZIP 模块 | 解压真实 Skills 快照，取得 39 个顶层条目 | 验证模块加载及真实提取 |
| 类型与完整构建 | Main、Preload、Renderer 类型检查及 Main/Preload/CLI/Renderer 构建通过 | 保留 Vite 大 chunk 与 MODULE_TYPELESS_PACKAGE_JSON 警告 |
| 依赖冻结安装后的受影响组合 | 15 文件/204 项通过，无跳过；SDK/四例 Mock/schema 通过，SDK pack dry-run 含 14 文件及 LICENSE | 非完整套件；Mock 不证明示例持久化/取消正确 |
| 文档路径与脚本 | 本地链接与 npm script 目标存在；后续标题检查为 139 Markdown/327 链接，失败 0 | 统计不含 ZIP 内文档 |
| 公共外链 | 仓库 136 个目标、归档 15 个目标 HTTP 200 | 只证明当日可达，不证明服务、许可或内容正确 |

恶意 ZIP 回归使用真实条目，覆盖两种公告攻击链、路径穿越、重复写入、链接、异常展开量、元数据预算、加密、关闭失败和原文件保护；正常 ZIP 与实际 Skills 快照同时覆盖。实现曾暴露路径预算、DOS 属性、Unicode 原始名称计费及关闭错误问题，均由对应回归确认后修正。

### 历史定向验证命令

以下命令说明上表的具体覆盖范围，属于 2026-09-26 记录，不作为当前复测结果。

```powershell
npx vitest run src/main/character-migration.test.ts src/main/prompts/prompt-loader.test.ts src/main/orchestrator/mode-prompt-profile.test.ts src/main/skills/skill-scanner.test.ts src/main/skills/skill-catalog.test.ts src/main/agui-bridge.test.ts src/main/orchestrator/firefly-agent-runtime.test.ts src/main/orchestrator/firefly-agent.test.ts src/shared/zip-extraction.test.ts src/plugins/installer.test.ts src/main/skills/snapshot-zip-security.test.ts src/main/skills/snapshot-install.test.ts src/main/migration/skill-snapshot.test.ts src/main/dependency-security.test.ts src/main/structure-cleanup.test.ts
npx vitest run src/main/character-migration.test.ts src/main/prompts/prompt-loader.test.ts src/main/orchestrator/mode-prompt-profile.test.ts
```

## 接续逐项验收

此节保留原技术索引入口，汇总长期有效的验收口径。

- 归档、来源、适配及正式分发哈希分别维护，不能将前一阶段的统计当成当前内容。
- 托管 Skill 只更新已识别且未修改的版本；同名用户附件、未知内容、备份冲突和恢复重试必须单独测试。
- `read_skill_reference` 的正文续读与 `invoke_skill` 使用同一动态 effectKind；原 reference 读取语义、白名单、模式、enabled、路径边界和 6000/8000 字符预算保留。
- 静态链接通过、全文分页读取与注册成功不能替代模型实际选择、工具审批或外部程序运行。
- 初始原包确有七处文档链接和三个脚本缺件，来源 ZIP SHA-256 为 `9b5b115c81c1629013603ca5b8c5f03145e4fecbe1587f0e55f54e0cd20ac336`。Superpowers 6.4.2 的同名文件与原正文不属同版，不能无依据拼装；后续补件明确标为 Firefly 维护适配。

### 文档修正与资料依据

README、开发/构建、渠道、Learn、SDK 和插件说明按真实脚本、加载方式、API、事件、副作用分类与权限边界校正；历史审计的 1 high 与原测试结果仍按发生时点保留。审查覆盖见[通用文档登记](2026-09-26-document-review-register.md)与[Skills/SDK 审查](2026-09-26-skills-sdk-document-review.md)。

Diagram 的 autoInject 不由加载器消费，已删除该无效声明并验证实际按需加载；没有新增注入机制。[HoYoLAB 官方 2024-06-19 展示](https://www.hoyolab.com/article/30028409) 使用 Type-IV，两份角色摘录据此由 V 更正为 IV；错误重复的“心愿”段撤下，未凭非官方转录补写。其他台词未逐字官方核验；保留“原作经历不等于用户共同经历”边界与角色身份。

### 未覆盖项与维护边界

1. ZIP 的逻辑字节预算不是进程堆硬上限，也不是归档真实性/CRC 安全认证。可写祖先被同用户恶意进程并发替换、防御所有 native 系统调用及 ZIP/manifest 跨文件原子事务均未证明；清理被 OS 拒绝时不能保证删除成功。
2. 外部办公程序、真实模型与 Work 执行/取消、GUI 深度交互、真实用户环境、安装器升级、跨平台原生加载、TTS、QQ Music 审批及持续帧率均需独立实机验收。
3. 插件示例的注销/持久化顺序、Map JSON、分页、可选 finalMessageId 及 ASR 取消 Promise 限制仍按示例说明保留；编译和 Mock 不等于生产方案完整。
4. 源码 MIT 不覆盖全部素材、模型或品牌权利；公开资产再分发范围与最终安装器通知完整性仍需单独核查。不能把 audit 0 或链接可达当作许可认证。
5. 后续按模块维护当前 Firefly 的调用与落盘契约；历史方案、验证记录和上游比较不构成自动重新迁移、运行第三方脚本或扩大权限的依据。
