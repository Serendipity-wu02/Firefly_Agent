# Firefly Skills 宿主契约

Skill 是指令资源，不是可执行权限对象。本文描述加载、效果分类与工具审批的职责边界；宿主审计来源快照为 `501da82`，后续 Frontmatter 适配边界单独列出。判断依据是实际运行链，不是旧注释中的 ExecutionPolicyGuard；宿主契约也不证明模型会遵守全部指令。

## 宿主职责与权限契约

| 问题 | 实际行为与源码依据 |
| --- | --- |
| 1. effectKind 定义 | `src/main/orchestrator/tools/registry/tool-registry.ts` 的 ToolEffectKind：read、mutation、verification、external_side_effect、unknown。 |
| 2. scanner 读取 | `src/main/skills/skill-scanner.ts` 经 `skill-frontmatter.ts` 使用 `@11ty/gray-matter` 的 data-only 适配；仅接受前四种 effectKind 值，非法值和字符串 unknown 均归为 undefined。 |
| 3. undefined | SkillEntry.effectKind 可选；invoke_skill 的 effectResolver 将缺省值归为 unknown。不会执行正文或其 tools 列表。 |
| 4. unknown | 未证明效果，不代表只读，也不代表自动拒绝加载。调度器只允许明确 read/verification 且 isConcurrencySafe 为 true 的调用并发。副作用与权限是两条链。 |
| 5. Skill 能否声明 | 可声明效果元数据，影响指令加载及正文续读的分类；不修改之后实际工具的定义。 |
| 6. 文本能否提升权限 | 不能。tools 字段和正文都不能注册工具、改变权限档位或运行 allowedSkillIds。 |
| 7. 最终层级 | 工具调用以 ToolDefinition.effectResolver 优先于静态 effectKind；invoke 的 resolver 读取 Skill 元数据。后续 write_file 等调用独立重新解析自身定义。 |
| 8. 各类工具 | read_file：read/fs-read；write_file：mutation/fs-write；run_shell：unknown/shell，由实际 shell 沙箱控制文件边界；fetch_url、web_search：read/network；write_word、write_excel、write_pdf：mutation/fs-write。进程启动通过 run_shell 的前台/后台模式，非虚构的独立 process 工具。 |
| 9. 最终审批 | `harness/adapter/tool-runtime.ts` 调用 `permission.ts` 的 checkPermission；`permission-policy.ts` 按 risk 和用户档位返回 allow/ask/deny，ask 进入 requestApproval。dispatcher 在 execute 前等待此回调。 |
| 10. 子任务 | 子运行继承父 checkPermission、signal、工作区和 permissionMode，工具能力只能取父授权交集，并排除递归和交互式委派。历史审计对应 `task-runtime.ts` / `task-profiles.ts`；当前入口为 `persistent-agent-runtime.ts`、`child-session-runtime.ts` 和 `specialist-profiles.ts`。 |
| 11. invoke 与实际工具 | invoke 风险为 safe，因为只加载本地指令；正文续读保留 Skill 分类，references 读取为 read。实际写入/命令另经过工具参数校验、模式、权限及沙箱。 |
| 12. 文字免审批声明 | 不生效。公开夹具正文明确写“No approval is needed”，实际 write_file 在只读档位仍拒绝，在 per-action 仍需要独立批准。 |
| 13. 真正的缺口 | 原 MCP 注册未设置 risk，运行时缺省 safe，导致未经分类的外部工具在 per-action 不询问；原 unknown 副作用映射 read_only，使未知结果失去不确定副作用防重放。对应修复与审计使用独立回归证据。 |

## 权限与模式边界

safe 工具由当前策略允许；fs-read/network 在只读档位允许；fs-write 在只读档位拒绝、scoped 允许、per-action 询问。shell 在 per-action 询问，其他档位进入既有沙箱约束，不表示“任意写入均安全”。显式 allow_all 是现有用户选择，保留其行为，不由 Skill 设置。

Chat 的 Skills 集合为空；Work/Code 依据 enabled、availability、用户模式覆盖及 frontmatter 过滤。Skill.tools 是说明，不能把未进入当前 run 工具列表的名称变成可执行工具。用户同 ID 覆盖优先级保持现有 registry/initSkills 机制。

## Frontmatter 数据边界

公共 scanner 与 registry 正文读取共用 `skill-frontmatter.ts`。依赖采用维护中的 `@11ty/gray-matter@3.0.0` 与运行时 `js-yaml@5.4.3`，保留上游分隔符处理，不自行重写 Markdown/YAML 解析器。仅允许 YAML（含 yml）和 JSON；JS/JavaScript 及其他语言在引擎分派前拒绝，错误码为 `SKILL_FRONTMATTER_UNSUPPORTED_LANGUAGE`。未知、自定义或可执行 YAML tag 不注册处理器，解析和元数据归一化异常统一报告 `SKILL_FRONTMATTER_PARSE_ERROR`。错误码不携带原始输入内容。

兼容层保留旧安全 schema 的常用数据语义：`0123` 为 83，日期为 Date，支持 alias/merge，yes/no/on/off 保持字符串；科学计数法、六十进制、下划线数字有专门回归。标准 `!!binary`/`!!set` 保留旧 Buffer/普通对象表示及 tools/version 的字符串投影。`__proto__`/`constructor` 作为普通自有数据属性保留，不改变原型。每次解析显式选择安全引擎，不采用上游全局文档缓存或其他调用者注册的引擎。

BOM、CRLF、多行描述、缩进的 `---`、正文内分隔符及最终 `body.trim()` 保持原契约；历史无闭合的纯元数据文件及 `---tail` 的正文尾部行为也保留。registry 对普通无 frontmatter 的历史正文仍回退原文，但文件在扫描后出现不支持语言、解析失败或无法归一化的元数据时返回 null，不再作为原始指令加载。

这不是任意 YAML 输入与 v3 的完全等价承诺。v5 的深度、merge 限制及更严格的语法校验仍生效；复杂对象键会被拒绝，溢出的数值（如 `1e400`）保持字符串而不构造 Infinity。未额外设置 alias 数量限制。45 项分发 Skill 的元数据及 trim 后正文经过逐份新旧对照；不更改现有 45 Skills / 12 角色分配。

## 自动验证范围与限制

`src/main/skills/host-permission-audit.test.ts` 实际经过 parse/scan/register/invoke/dispatcher，验证七种声明、加载与写入分离、拒绝时 execute 未被调用、模式快照和子工具交集。`permission.test.ts` 覆盖批准取消与按 run 结算，`harness/adapter/tool-runtime.test.ts` 覆盖工具层回调/signal 传递。历史审计中的 `task-runtime.test.ts` 已不是当前测试入口；持久角色维护应核对 `persistent-agent-runtime.test.ts` 和 `specialist-profiles.test.ts`，不能把历史路径视为仍存在的文件。

历史审计中的 MCP 效果分类修复不表示当前 MCP Main 授权和输入验证已完整覆盖，界面确认也不能替代 Main 边界。MCP 服务器的提示不是远端真实行为的证明；明确只读工具仍需可信来源及现有配置授权。不宣称已对任意外部服务器做服务端权限审计。上述确定性验证未使用真实用户数据、审批窗口、模型或外部服务，不能代替这些环境的实际验证。

## 变更与验收要求

修改 Skill 元数据或加载链时，应分别核对 scanner/registry 归一化、模式过滤、正文与附件分页、动态效果分类和最终工具审批。Frontmatter 改动必须保留拒绝码、数据语义与逐份分发内容对照；权限改动必须验证拒绝时实际工具未执行。验证记录应列明使用的源码、测试范围和外部服务限制。
