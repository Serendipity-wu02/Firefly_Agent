# Skills、Prompts、插件 SDK 与示例文档逐项审查（2026-09-26）

> **日期**：2026-09-26
> **状态**：历史技术记录。下文描述记录时的实现、设计与验证结论，不代表当前版本复测。
> **范围**：Skills、Prompts、插件 SDK 与示例文档静态审查。当前维护入口见[文档导航](../../README.md)。

## 范围与方法

- 审查对象：Firefly 仓库中的文档、对应接口、加载路径与示例；范围约束依据根 `AGENTS.md`。
- 初始清单来自真实目录枚举：`skills/**/*.md` 28 个、`prompts/**/*.md` 46 个、SDK README 1 个、`docs/plugins/**/*.md` 2 个、`src/**/README.md` 2 个，共 79 个已有文件。初始 `examples/` 只有源码、manifest、tsconfig、HTML 和图标，没有 Markdown/文本说明；新增 `examples/README.md` 后审查表为 80 行。
- 每个已有文件均阅读全文；下表每行记录结论、源码依据与修正。源码是核对文档的证据，不是本次修改范围。
- 修改限于文档校正；实现缺陷单独列示，示例业务逻辑未改变。文中命令是核实过 scripts/脚本内容的说明，不代表文档子范围执行过；集中验证记录见本文末节。
- 保留角色身份、世界观、运行约束、第三方来源与署名；未通过 frontmatter/manifest 变更扩大能力，外部来源项目不在修改范围。
- SDK LICENSE、工具 snapshot、根文档、依赖和安装器的其他变更不计入本报告的文档审查成果。

## 源码依据索引

| 编号 | 实际文件 / 符号 | 核对内容 |
| --- | --- | --- |
| P1 | `src/plugins/api.ts`（PluginManifestInput、PluginTool、PluginContext）、`src/plugins/manifest.schema.json`、`src/plugins/manifest-validation.ts`、`src/plugins/loader.ts`（inspectPluginDir、resolveIcon、resolveSettingsPanel） | 字段、枚举、必填项、两层校验、真实入口与面板限制。 |
| P2 | `src/plugins/prompts.ts`、`src/plugins/events.ts`、`src/plugins/api.ts`、`src/main/plugin-agent.ts`、`src/main/orchestrator/agent-runtime.ts` | 四个 Provider 来源、模式过滤、配额、事件旁路/生命周期屏障、runGoal 与调度模式。 |
| P3 | `src/plugins/context.ts`、`src/plugins/manager.ts`（deactivate）、`src/plugins/storage.ts`、`src/plugins/cleanup.ts`、`src/plugins/installer.ts` | 渠道所有权、停止顺序、JSON 存储、清理超时与安装限制。本次仅核对文档与接口说明，不修改安装器或依赖安全实现。 |
| P4 | `package.json`、`packages/plugin-sdk/package.json`、`packages/plugin-sdk/src/index.ts`、`packages/plugin-sdk/src/api.ts`、`packages/plugin-sdk/src/testing/index.ts`、`scripts/plugin-sdk/test-examples.mjs`、`scripts/plugin-sdk/smoke-examples.mjs` | 实际 scripts、SDK 0.2.0 私有包、exports、仅类型导入与运行时导入、Mock 覆盖边界。 |
| E1 | `examples/system-status/manifest.json`、`examples/system-status/index.cjs`；四个 TypeScript 示例的 `manifest.json`、`index.ts`；`examples/weather-tool/tsconfig.json` | 实际署名、函数、默认盘符、示例服务声明、编译产物和生命周期缺陷；不变更实现。 |
| S1 | `src/main/skills/skill-scanner.ts`、`skill-registry.ts`、`skill-catalog.ts`、`skill-tools.ts`、`index.ts`（均在 `src/main/skills/`）；各 Skill 实际存在的 manifest | frontmatter、目录 ID、reference 裸文件名、模式过滤、manifest.autoInject、启用状态。 |
| S2 | `vendor/firefly-skills/skills-snapshot-manifest.json`、`scripts/packaging/build-skills-snapshot.mjs` | 第三方 Skill 名称存在于快照清单；不解压、不重写第三方归档。 |
| L1 | `src/main/learn/obsidian/obsidian-tools.ts`、`obsidian-workspace-service.ts`、`obsidian-markdown.ts`、`vault-templates.ts`（均在该目录）；`src/main/orchestrator/pop-quiz.ts` | 真实编辑操作、headingPath、includeChildren、hash、模板与抽查字段。 |
| R1 | `src/main/prompts/prompt-loader.ts`、`src/main/orchestrator/mode-prompt-profile.ts`、`build-options.ts`、`harness/adapter/prompt-builder.ts`（后两者在 orchestrator 下）；`src/main/style-prompt.ts` | 模式文件组合、工具规则注入、Chat opt-in、风格边界与空自定义模板。 |
| R2 | `src/main/orchestrator/tone-injector.ts` | 通用语气读取，不做场景分类。 |
| R3 | `src/main/orchestrator/plan-mode.ts`、`src/main/orchestrator/build-options.ts` | 计划状态、用户批准、Plan Skill 条件注入；未查到 plan_identity.md 的生产加载。 |
| R4 | `src/main/services/cita/cita-service.ts`、`src/main/cita/schema.ts` | CITA prompt 与结构化输出。 |
| R5 | `src/main/call/call-prompt-builder.ts`、`src/main/call/call-manager.ts` | 通话文件组合、天气正则与直接回复路径。 |
| R6 | `src/main/moments/character-personas.ts`、`src/shared/task-characters.ts` | 12 个精确角色文件名、共享注入头、角色池交集。 |
| R7 | `src/main/rag/worldbook.ts`（parseMarkdown） | 六个 worldbook 文件的元数据解析；不以加载器证明原作剧情事实。 |
| V1 | `src/renderer/main.ts`、`src/renderer/live2d/manager.ts`、`src/renderer/public/models/firefly/Firefly.model3.json`、`MODEL_LICENSE.md`、`THIRD_PARTY_NOTICES.md`、`git ls-files` | 模型路径、子资源路径、已跟踪资产与既有来源说明；未补写授权条款。 |
| V2 | `src/renderer/react/features/settings/` 实际目录、`src/renderer/settings/plugin-panels.ts` | React Settings 仍只有 README；插件设置面板分区由现有 renderer settings 实现。 |
| V3 | `src/renderer/react/styles/react-root.css`、`src/renderer/react/features/chat/components/MermaidBlock.tsx`、`svg-sanitize.ts`、`mermaid-block.test.ts`、`file-link.ts`（后四者同组件目录） | 主题 token、图形支持、消毒策略、file:/// 行号链接。测试文件仅阅读，没有执行。 |

## 逐文件清单与审查记录

“保留”表示已阅读、核对相应加载路径或文档引用，并保留其职责范围；不表示本次验证了所有运行行为或原作事实。

| 序号 | 文件 | 结论 | 依据 | 审查与修正 |
| --- | --- | --- | --- | --- |
| 1 | `docs/plugins/plugin-authoring.md` | 已修正 | P1、P2、P3、P4 | 补齐设置面板字段、Schema/文件校验边界、plugin-agent、runGoal、SDK 运行时依赖与 Mock 限制；保留信任、启用、停止与卸载边界。 同步普通事件不等待异步监听器、仅 ready/stopping 为屏障的语义。 |
| 2 | `docs/plugins/plugin-dev-guide.md` | 已修正 | P1、P2、P3、P4、E1 | 修正 write 枚举、Promise<string>、普通 script 顶层 await、tsc 输出名、事件清单、Provider 来源；明确提醒片段未实现通知并链接示例限制。 修正事件等待语义。 |
| 3 | `examples/README.md` | 新增说明 | E1、P3 | 初始 examples 没有说明文件；新增五例入口、依赖、署名、真实命令与已证实的实现限制，不修改源码。 |
| 4 | `packages/plugin-sdk/README.md` | 已修正 | P1、P2、P4 | 校准 exports/包版本/打包命令；补充 plugin-agent、校验覆盖边界、实际导入产生的运行时依赖和 Mock 停止语义。 |
| 5 | `prompts/canon_quotes_lite.md` | 保留；资料需确认 | R1 | 核对 Work/Code 加载；记录同样的重复/型号冲突及与完整稿人物标题用字差异，不改角色资料。 |
| 6 | `prompts/canon_quotes.md` | 保留；资料需确认 | R1 | 全文阅读并核对模式加载；分享·心愿与烦恼·虫子重复，装甲型号与 world.md 不一致；保留来源与原文，不代拟官方台词。 |
| 7 | `prompts/chat_identity.md` | 保留 | R1 | 核对 chat 模式加载顺序；保留身份、称呼与共同经历边界。 |
| 8 | `prompts/chat_system.md` | 保留 | R1、V3 | 核对 chat prompt 与 Mermaid 渲染分支；保留身份、事实和外部内容约束。 |
| 9 | `prompts/cita_system.md` | 保留 | R4 | 核对 CITA 服务加载及 rewriteStatus/contextualizedQuery 契约；保留 JSON-only 和外部内容隔离。 |
| 10 | `prompts/code_identity.md` | 保留 | R1 | 核对 code 模式身份加载与 lite 台词文件引用；保留证据和审批边界。 |
| 11 | `prompts/code_remark.md` | 保留 | R1 | 实际被 code 模式加载；空补充节是现有用户扩展位置，不擅自填入规则。 |
| 12 | `prompts/code_system.md` | 保留 | R1、R3、V3 | 核对计划工具、审批门槛、五类图与 file:/// 行号解析；不删除重复图示规则或改变行为约束。 |
| 13 | `prompts/firefly_harness.md` | 保留 | R1 | 核对非 Chat Harness 注入位置；保持角色风格只影响自然语言。 |
| 14 | `prompts/learn_identity.md` | 保留 | R1 | 核对 learn 模式加载；保留平等教学与事实边界。 |
| 15 | `prompts/learn_system.md` | 保留 | R1、L1、V3 | 核对 Vault 模板、编辑 hash、工具名、图示支持；保留首课导学和用户跳过规则。 |
| 16 | `prompts/moments_personas/_header.md` | 保留 | R6 | 核对注入头二级标题提取；保留外部内容隔离和共同经历边界。 |
| 17 | `prompts/moments_personas/艾利欧.md` | 保留 | R6 | 核对 艾利欧 文件名与角色池加载；保留原作身份、关系及当前用户经历边界。 |
| 18 | `prompts/moments_personas/大黑塔.md` | 保留 | R6 | 核对 大黑塔 文件名与角色池加载；保留原作身份、关系及当前用户经历边界。 |
| 19 | `prompts/moments_personas/丹恒.md` | 保留 | R6 | 核对 丹恒 文件名与角色池加载；保留原作身份、关系及当前用户经历边界。 |
| 20 | `prompts/moments_personas/姬子.md` | 保留 | R6 | 核对 姬子 文件名与角色池加载；保留原作身份、关系及当前用户经历边界。 |
| 21 | `prompts/moments_personas/卡芙卡.md` | 保留 | R6 | 核对 卡芙卡 文件名与角色池加载；保留原作身份、关系及当前用户经历边界。 |
| 22 | `prompts/moments_personas/帕姆.md` | 保留 | R6 | 核对 帕姆 文件名与角色池加载；保留原作身份、关系及当前用户经历边界。 |
| 23 | `prompts/moments_personas/刃.md` | 保留 | R6 | 核对 刃 文件名与角色池加载；保留原作身份、关系及当前用户经历边界。 |
| 24 | `prompts/moments_personas/三月七.md` | 保留 | R6 | 核对 三月七 文件名与角色池加载；保留原作身份、关系及当前用户经历边界。 |
| 25 | `prompts/moments_personas/瓦尔特.md` | 保留 | R6 | 核对 瓦尔特 文件名与角色池加载；保留原作身份、关系及当前用户经历边界。 |
| 26 | `prompts/moments_personas/星期日.md` | 保留 | R6 | 核对 星期日 文件名与角色池加载；保留原作身份、关系及当前用户经历边界。 |
| 27 | `prompts/moments_personas/银狼.md` | 保留 | R6 | 核对 银狼 文件名与角色池加载；保留原作身份、关系及当前用户经历边界。 |
| 28 | `prompts/moments_personas/知更鸟.md` | 保留 | R6 | 核对 知更鸟 文件名与角色池加载；保留原作身份、关系及当前用户经历边界。 |
| 29 | `prompts/phone_identity.md` | 保留 | R5 | 核对通话 prompt 组合；保留陪伴定位及文件/搜索限制。 |
| 30 | `prompts/phone_style.md` | 保留 | R5 | 核对通话专用风格加载；保留简短口语、中文场景表达规则。 |
| 31 | `prompts/phone_system.md` | 保留 | R5 | 核对天气正则快捷路径与无通用 FC loop；保留通话长度/格式/工具限制。 |
| 32 | `prompts/plan_identity.md` | 保留；记录未接入 | R1、R3 | 源码全文检索未发现生产加载此文件；已有 Plan 由 Skill 条件注入，不新接入角色加载机制。 |
| 33 | `prompts/soul.md` | 保留 | R1、R5 | 核对各模式/通话共同加载；人格、装甲身份与共同记忆边界不变。 |
| 34 | `prompts/styles/01_default.md` | 保留 | R1 | 全文阅读默认温和表达；核对风格加载边界，Work/Code 不注入风格块；保留现有表达规则。 |
| 35 | `prompts/styles/02_lively.md` | 保留 | R1 | 全文阅读轻快表达；核对风格加载边界，Work/Code 不注入风格块；保留现有表达规则。 |
| 36 | `prompts/styles/03_healing.md` | 保留 | R1 | 全文阅读安慰节奏；核对风格加载边界，Work/Code 不注入风格块；保留现有表达规则。 |
| 37 | `prompts/styles/04_focused.md` | 保留 | R1 | 全文阅读专注表达；核对风格加载边界，Work/Code 不注入风格块；保留现有表达规则。 |
| 38 | `prompts/styles/05_sweet.md` | 保留 | R1 | 全文阅读克制亲近表达；核对风格加载边界，Work/Code 不注入风格块；保留现有表达规则。 |
| 39 | `prompts/styles/custom/custom.md` | 保留 | R1 | 全文阅读空自定义文件；核对风格加载边界，Work/Code 不注入风格块；保留现有表达规则。 |
| 40 | `prompts/tone-rules.md` | 保留 | R2 | 核对 tone-injector 加载入口；不修改称呼或语气规则。 |
| 41 | `prompts/tool_usage.md` | 已修正 | R1 | 将 Chat 无工具的过时描述改为开关、模式覆盖及门控；仍不向 Chat 注入此文件，其他运行约束原样保留。 |
| 42 | `prompts/work_identity.md` | 保留 | R1 | 核对 work 模式加载与 lite 台词引用；保留事实、权限及人格边界。 |
| 43 | `prompts/work_remark.md` | 保留 | R1 | 实际被 work 模式加载；保留用户扩展空节。 |
| 44 | `prompts/work_system.md` | 保留 | R1、V3 | 核对模式加载、富文本及文件链接解析；保留任务与事实边界。 |
| 45 | `prompts/worldbook/_glossary.md` | 保留 | R7 | 核对二级标题、触发词、常驻、内在价值、优先级及连带字段解析；保留世界观原文。 |
| 46 | `prompts/worldbook/characters.md` | 保留 | R7 | 核对二级标题、触发词、常驻、内在价值、优先级及连带字段解析；保留世界观原文。 |
| 47 | `prompts/worldbook/firefly-relations.md` | 保留 | R7 | 核对二级标题、触发词、常驻、内在价值、优先级及连带字段解析；保留世界观原文。 |
| 48 | `prompts/worldbook/Firefly.md` | 保留 | R7 | 核对二级标题、触发词、常驻、内在价值、优先级及连带字段解析；保留世界观原文。 |
| 49 | `prompts/worldbook/story.md` | 保留 | R7 | 核对二级标题、触发词、常驻、内在价值、优先级及连带字段解析；保留世界观原文。 |
| 50 | `prompts/worldbook/world.md` | 保留；资料需确认 | R7 | 核对二级标题、触发词、常驻、内在价值、优先级及连带字段解析；保留世界观原文。记录 IV 型与两份台词 V 型的冲突，不自行确定原作型号。 |
| 51 | `skills/firefly-diagram/SKILL.md` | 保留；记录实现差异 | S1、V3 | 逐色核对主题 token 与 SVG 消毒器；保留图形预算。frontmatter autoInject 没有对应 manifest，加载器不据此自动注入；不通过文档修订增加运行能力。 |
| 52 | `skills/firefly-exam-paper/references/concept.md` | 保留 | S1、L1 | 全文阅读概念辨析、解释与反例评分；附件名与 Skill 引用清单相符，属于教学策略，不变更出题功能。 |
| 53 | `skills/firefly-exam-paper/references/language.md` | 保留 | S1、L1 | 全文阅读词汇/语法/阅读/写作与记忆题比例；附件名与 Skill 引用清单相符，属于教学策略，不变更出题功能。 |
| 54 | `skills/firefly-exam-paper/references/mathematics.md` | 保留 | S1、L1 | 全文阅读步骤评分、公式与证明规则；附件名与 Skill 引用清单相符，属于教学策略，不变更出题功能。 |
| 55 | `skills/firefly-exam-paper/references/physics.md` | 保留 | S1、L1 | 全文阅读物理过程、单位与实验规则；附件名与 Skill 引用清单相符，属于教学策略，不变更出题功能。 |
| 56 | `skills/firefly-exam-paper/references/programming.md` | 保留 | S1、L1 | 全文阅读代码追踪、排错与设计分析；附件名与 Skill 引用清单相符，属于教学策略，不变更出题功能。 |
| 57 | `skills/firefly-exam-paper/SKILL.md` | 保留 | S1、L1 | 核对 learn modes、manifest autoInject、五个实际 reference 与工具名；保留确认、蓝图、试卷/答案分离和目录约定。 |
| 58 | `skills/firefly-learn-tutor/SKILL.md` | 保留 | S1、L1 | 核对 manifest 依赖及自动注入、Vault 模板和 progress 路径；保留教学流程与材料只读规则。 |
| 59 | `skills/firefly-obsidian-workspace/SKILL.md` | 已修正 | L1 | replace_all 改为真实 replace_file；列全四种编辑的 hash 要求；纠正 headingPath 与 includeChildren 的返回范围。 |
| 60 | `skills/firefly-original-voice/references/boundary.md` | 保留 | S1、R2 | 核对能力与证据边界；文件由 reference 按需读取，明确为表达示例而非官方引文，保留。 |
| 61 | `skills/firefly-original-voice/references/comfort.md` | 保留 | S1、R2 | 核对安慰与专业帮助边界；文件由 reference 按需读取，明确为表达示例而非官方引文，保留。 |
| 62 | `skills/firefly-original-voice/references/concern.md` | 保留 | S1、R2 | 核对以用户明示信息表达关心；文件由 reference 按需读取，明确为表达示例而非官方引文，保留。 |
| 63 | `skills/firefly-original-voice/references/encourage.md` | 保留 | S1、R2 | 核对鼓励不承诺结果；文件由 reference 按需读取，明确为表达示例而非官方引文，保留。 |
| 64 | `skills/firefly-original-voice/references/farewell.md` | 保留 | S1、R2 | 核对尊重离开；文件由 reference 按需读取，明确为表达示例而非官方引文，保留。 |
| 65 | `skills/firefly-original-voice/references/gratitude.md` | 保留 | S1、R2 | 核对感谢不虚构陪伴；文件由 reference 按需读取，明确为表达示例而非官方引文，保留。 |
| 66 | `skills/firefly-original-voice/references/greeting.md` | 保留 | S1、R2 | 核对问候与称呼规则；文件由 reference 按需读取，明确为表达示例而非官方引文，保留。 |
| 67 | `skills/firefly-original-voice/references/playful.md` | 保留 | S1、R2 | 核对轻松但不沿用他人口癖；文件由 reference 按需读取，明确为表达示例而非官方引文，保留。 |
| 68 | `skills/firefly-original-voice/references/praised.md` | 保留 | S1、R2 | 核对坦然回应已核实成果；文件由 reference 按需读取，明确为表达示例而非官方引文，保留。 |
| 69 | `skills/firefly-original-voice/SKILL.md` | 保留 | S1、R2 | 核对 hiddenFromUi 与九个 reference；没有自动场景分类入口，保留人格与事实/权限优先级。 |
| 70 | `skills/firefly-plan-mode/references/coverage-check.md` | 保留 | S1、R3 | 核对14 项相关性维度与最终查漏及上层 Skill 引用；保留既有规划流程，不改审批语义。 |
| 71 | `skills/firefly-plan-mode/references/execution-handoff.md` | 保留 | S1、R3 | 核对真实工作区优先、范围变更与验证交接及上层 Skill 引用；保留既有规划流程，不改审批语义。 |
| 72 | `skills/firefly-plan-mode/references/plan-templates.md` | 保留 | S1、R3 | 核对推荐骨架与章节调整规则及上层 Skill 引用；保留既有规划流程，不改审批语义。 |
| 73 | `skills/firefly-plan-mode/SKILL.md` | 保留 | S1、R3 | 核对三个 reference、条件注入及 write_plan/审批状态转换；不改变审批门槛。 |
| 74 | `skills/firefly-plugin-dev/references/api-spec.md` | 已修正 | P1、P2、P3、P4 | 修正渠道注册前置条件、scheduler 模式、effectKind；补充面板、plugin-agent、Schema 和 SDK 运行时边界。 同步事件旁路派发语义。 |
| 75 | `skills/firefly-plugin-dev/references/example-walkthrough.md` | 已修正 | E1 | 按 manifest 恢复 Playa、0.2.0、description 与 panel.html；纠正函数名、盘符默认值、首次采样、GPU 回退和清理片段。 |
| 76 | `skills/firefly-plugin-dev/references/getting-started.md` | 已修正 | P1、E1 | 修正副作用枚举、返回类型、普通 script 顶层 await；撤下示例未使用的子进程参数及解码保证，标明提醒回调未实现。 |
| 77 | `skills/firefly-plugin-dev/SKILL.md` | 已修正 | P1、P3、P4、E1 | 校准副作用枚举、权威来源、CJS 冒烟片段、Mock 边界与目录复制语义；撤下不存在的收录入口，不更改第三方归属。 |
| 78 | `skills/firefly-work-hygiene/SKILL.md` | 保留 | S1、S2 | 核对 work modes、mutation 与第三方快照 manifest 中 xlsx/docx/pptx-generator/pdf 的真实 ID；保留目录组织与删除确认规则。 |
| 79 | `src/renderer/public/models/firefly/README.md` | 已修正 | V1 | 安装路径改为真实 renderer public 目录；按 model3.json 保留 Expressions/Motions 子目录；校正产品名称和已跟踪资产说明，链接原授权记录，不新增授权结论。 |
| 80 | `src/renderer/react/features/settings/README.md` | 保留 | V2 | 目录当前只有 README，仍是待迁移说明；保留 Settings 不直接依赖 Chat 的边界。 |

## 修正归纳

1. 插件工具契约：移除示例中的无效 `write`，按 API 使用 `mutation` / `external_side_effect`；返回类型改为 `Promise<string>`。
2. 插件说明：补齐 `settingsPanel` / `settingsSection` 与 `plugin-agent`、可选 `runGoal`；纠正调度模式固定为 work、渠道注册必须 deps 的说法。Schema 校验与加载器校验分开，字段错误类型不能被描述为装饰字段静默忽略。
3. 事件语义：普通发布不等待异步监听器完成；仅 ready/stopping 使用生命周期屏障。超时是停止等待/记录，不是强制终止代码。
4. SDK 与命令：保持本地 tarball 安装；补上 tsc 的 `index.js` 与 manifest 的 `index.cjs` 组装关系；实际导入 SDK 运行时函数的插件必须打包依赖。CJS/普通 script 示例不再混用顶层 await。
5. 上游示例：按真实 manifest 恢复 Playa 署名、0.2.0、面板字段；修正不存在的采集函数名、错误磁盘默认行为与不存在的收录指南引用。
6. Learn：以工具 schema 校正 `replace_file`、四种编辑的 hash 前提及标题路径/章节范围，保留材料保护和确认规则。
7. Chat 与 Live2D：说明现有 Chat 工具 opt-in，而不改变注入逻辑；校正模型目录、资源子目录与产品名，保留并链接来源记录。

## 未修改的实现问题与资料冲突

| 项目 | 证据与影响 | 本次处置 |
| --- | --- | --- |
| 示例停止前清空待保存数据 | `PluginManager.deactivate()` 先 unregister 再 dispose；weather-tool 清空 lastCity，long-term-memory 清空 memories，scheduled-automation 清空 ownTaskIds，然后才执行保存回调 | 写入 examples 说明；实现缺陷登记后续处理，本轮不修改示例业务逻辑 |
| Map 与 JSON 持久化不兼容 | long-term-memory 直接存 Map；真实 storage 使用 JSON，Mock 保留原值 | 文档撤下完整可靠实现的暗示；不改代码 |
| 冻结分页未完整使用 | long-term-memory 只读一页且不强制 finalMessageId 存在 | 明确只是展示 API，不能宣称严格全量归档 |
| ASR 取消后等待未结束 | local-asr-contract 中止计时器后未结束识别 Promise | 说明取消路径需实现修正与宿主验证 |
| Diagram 自动注入声明未生效 | 初次检查时 SKILL frontmatter 有 autoInject；scanner 不读取该字段，catalog 读取 manifest.autoInject；该 Skill 没有 manifest | 本次接续已删除无效声明并解释按需加载；新增真实目录扫描/清单/非自动注入回归。未增加 manifest 或更改加载器 |
| Plan identity 未接入 | 全 src 检索仅测试引用 plan_identity.md，生产 Plan 使用 Skill 条件注入 | 保留文件，未新建第二套加载机制 |
| 原作资料冲突 | 初次检查时两份 canon_quotes 的“分享·心愿”重复“烦恼·虫子”；两份台词为 V 型，world.md 为 IV 型 | 本次接续依据官方展示改为 IV 型；移除误标的重复心愿段，不编造替代台词；lite 的卡夫卡修正为已确认的卡芙卡。摘录来源说明不再宣称逐字完整官方原文。见集中报告的来源及剩余证据边界 |
| 空提示词扩展位 | custom/custom.md 为空；work_remark/code_remark 含空扩展节 | 保留用户扩展入口，不填充功能规则 |

## 静态核对与边界

- 本次修改 10 个已有文档，新增 examples 说明与本报告。逐文件表覆盖全部 79 个初始文件和新增说明。
- 只读静态核对结果：目录 80 项、报告 80 行，无遗漏或多余项；9 个相对链接目标全部存在；宿主与 SDK 的 api.ts 文本完全一致。范围内 `git diff --check` 未发现空白错误；Git 的 LF/CRLF 提示是工作区换行配置提示，不是构建结果。
- 相对链接按实际文件位置核对；移除不存在的 CONTRIBUTING.md/registry.json/收录表入口。本范围没有需要替换的真实外部文档 URL；`https://example.com` 是示例数据，未当成失效服务检查。
- 运行约束、角色台词、世界书、12 张朋友圈角色卡及第三方快照归档均未改写；仅对 tool_usage 中 Chat 能力说明作现有实现对齐。
- 文档子范围未单独执行测试、类型检查、构建、打包或真实 Electron 安装与联调，不重复运行集中测试；汇总验证见 `docs/refactor/2026-09-26-documentation-dependency-closeout.md`。本次仅文档校正，实现缺陷登记后续处理，不宣称示例已经端到端通过。

## 接续最终状态

此前接续阶段（历史）：Diagram、两份摘录、隔离 Skills/提示词/SDK/示例 Mock 验证及原 ZIP 的 153 项文本检查均保留原结果；彼时两篇 Superpowers 的七处链接及三个脚本缺文件，匹配来源哈希的原 ZIP 同样缺件。现装 6.4.2 正文不同的事实未改写，Mock 不解决已记录示例业务缺陷。

Firefly 维护适配的两篇正文、四个 reference brief、三个 Node helper、PPTX 六处锚点及 39 项原 meta-tool 续读验证维持原结论。来源许可专项随后为原 28 项中的 27 项补齐可核实来源及分发材料，另复核 docx、skill-creator 与九项 SP 许可范围；`self-improving-agent` 的十个文件仍缺 OpenClaw 改写版本许可证据。新增真实旧 ZIP 经生产识别、更新、注册及完整读取的隔离验证已通过，不等于真实模型、办公外部工具或 GUI 全功能通过。最新材料与精确未解决清单见[集中报告](2026-09-26-documentation-dependency-closeout.md)的来源许可专项节。
