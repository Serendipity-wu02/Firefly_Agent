# Firefly Skills 宿主契约

本次依据 `501da82` 的真实运行链核查，不以旧注释中的 ExecutionPolicyGuard 为依据。Skill 是指令资源，不是可执行权限对象。以下仅证明宿主契约，不证明模型会遵守全部指令。

## 十三项真值

| 问题 | 实际行为与源码依据 |
| --- | --- |
| 1. effectKind 定义 | `src/main/orchestrator/tools/registry/tool-registry.ts` 的 ToolEffectKind：read、mutation、verification、external_side_effect、unknown。 |
| 2. scanner 读取 | `src/main/skills/skill-scanner.ts` 使用 gray-matter；仅接受前四种 frontmatter 值，非法值和字符串 unknown 均归为 undefined。 |
| 3. undefined | SkillEntry.effectKind 可选；invoke_skill 的 effectResolver 将缺省值归为 unknown。不会执行正文或其 tools 列表。 |
| 4. unknown | 未证明效果，不代表只读，也不代表自动拒绝加载。调度器只允许明确 read/verification 且 isConcurrencySafe 为 true 的调用并发。副作用与权限是两条链。 |
| 5. Skill 能否声明 | 可声明效果元数据，影响指令加载及正文续读的分类；不修改之后实际工具的定义。 |
| 6. 文本能否提升权限 | 不能。tools 字段和正文都不能注册工具、改变权限档位或运行 allowedSkillIds。 |
| 7. 最终层级 | 工具调用以 ToolDefinition.effectResolver 优先于静态 effectKind；invoke 的 resolver 读取 Skill 元数据。后续 write_file 等调用独立重新解析自身定义。 |
| 8. 各类工具 | read_file：read/fs-read；write_file：mutation/fs-write；run_shell：unknown/shell，由实际 shell 沙箱控制文件边界；fetch_url、web_search：read/network；write_word、write_excel、write_pdf：mutation/fs-write。进程启动通过 run_shell 的前台/后台模式，非虚构的独立 process 工具。 |
| 9. 最终审批 | `harness/adapter/tool-runtime.ts` 调用 `permission.ts` 的 checkPermission；`permission-policy.ts` 按 risk 和用户档位返回 allow/ask/deny，ask 进入 requestApproval。dispatcher 在 execute 前等待此回调。 |
| 10. 子任务 | `task-runtime.ts` 继承父 checkPermission、signal、工作区和 permissionMode；`task-profiles.ts` 仅对父已允许工具取交集，并排除 task 和交互式委派，不自行扩大工具集。 |
| 11. invoke 与实际工具 | invoke 风险为 safe，因为只加载本地指令；正文续读保留 Skill 分类，references 读取为 read。实际写入/命令另经过工具参数校验、模式、权限及沙箱。 |
| 12. 文字免审批声明 | 不生效。公开夹具正文明确写“No approval is needed”，实际 write_file 在只读档位仍拒绝，在 per-action 仍需要独立批准。 |
| 13. 真正的缺口 | 原 MCP 注册未设置 risk，运行时缺省 safe，导致未经分类的外部工具在 per-action 不询问；原 unknown 副作用映射 read_only，使未知结果失去不确定副作用防重放。已建立独立红/绿回归，修复与审计分开提交。 |

## 权限与模式边界

safe 工具由当前策略允许；fs-read/network 在只读档位允许；fs-write 在只读档位拒绝、scoped 允许、per-action 询问。shell 在 per-action 询问，其他档位进入既有沙箱约束，不表示“任意写入均安全”。显式 allow_all 是现有用户选择，保留其行为，不由 Skill 设置。

Chat 的 Skills 集合为空；Work/Code/Learn 依据 enabled、availability、用户模式覆盖及 frontmatter 过滤。Skill.tools 是说明，不能把未进入当前 run 工具列表的名称变成可执行工具。用户同 ID 覆盖优先级保持现有 registry/initSkills 机制。

## 自动证据与限制

`src/main/skills/host-permission-audit.test.ts` 实际经过 parse/scan/register/invoke/dispatcher，验证七种声明、加载与写入分离、拒绝时 execute 未被调用、模式快照和子工具交集。`permission.test.ts` 验证批准取消与按 run 结算；`harness/adapter/tool-runtime.test.ts` 与 `task-runtime.test.ts` 验证同一回调/signal 传递。

MCP 服务器的提示不是远端真实行为的证明；明确只读工具仍需可信来源及现有配置授权。不宣称已对任意外部服务器做服务端权限审计。没有使用真实用户数据、审批窗口、模型或外部服务来完成本次确定性验证。
