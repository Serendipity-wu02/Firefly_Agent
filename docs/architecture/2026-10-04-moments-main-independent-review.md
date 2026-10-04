# Moments Main 清理独立代码与安全审查

日期：2026-10-04。审查者：独立 review agent；未修改产品文件。

## 结论

针对 `refactor/remove-moments-main` 的未提交工作树，基线与 HEAD 均为 `9660c584c0c191def41906a62802a4ca932bd809`。发现一项 P2 兼容问题，主任务已修正且已独立复核；另有一项可选注释修正也已完成。未发现权限、MCP、Memory、共享语音、渠道或 Work 学习功能的误删。

| 级别 | 数量 | 状态 |
|---|---:|---|
| P0 / Critical | 0 | 未发现 |
| P1 / High | 0 | 未发现 |
| P2 / Medium | 1 | 安装选项写回兼容，已修正并验证 |
| P3 / Nit | 1 | 模式注释，已修正 |

建议：接受本次 Main 范围改动，无剩余阻断级审查发现；当前独立工作树不能作为完整产品发布，因为 Renderer 联动尚未完成。审查结束后的完整测试复验已通过，证据见末尾补充记录。

## 发现

### P2：首次启动消费安装选项时，归一化写盘会剔除旧设置字段

位置：`src/main/settings/settings-facade.ts:379`–`:389`；对应测试 `src/main/settings/settings-facade.test.ts:162`。

触发条件：已有 `app-settings.json` 含旧 Moments 字段，同时存在有效 `installer-options.json` 开机启动选择。`loadGeneralSettings0` 会把 `normalizeGeneralSettings(withInstallerSelection)` 写回磁盘。删除归一化中的旧字段后，这条保留的启动路径会清除磁盘旧字段，违反此次“读取时忽略旧字段，升级不改写旧字段”的兼容约束。普通读取不写盘的新增测试没有覆盖这一情形。

影响是旧配置数据被剔除；未证明权限升级或敏感数据外泄。安装选择消费路径本身是基线已有行为，问题来自本次归一化字段删除与它的组合。外部攻击者不需要被假设为有此能力；合法安装/升级即可触发。

修正：`settings-facade.ts:387` 现写原始合并对象 `withInstallerSelection`，返回给运行时仍归一化。安装选项消费仍只更新用户明确选择的 `launchAtLogin`，消费生命周期保持原样。新增测试验证磁盘旧值保留且运行时旧字段不可见。主任务 RED 日志显示该测试修复前失败；修复后独立重跑设置文件 24 测试全部通过。

### P3 / Nit：Skill 模式注释出现重复 Work

位置：`src/shared/ipc-channels.ts:308`。注释 `work/code/Work` 不准确，不影响运行行为。已修正为实际保留的 Skill 覆盖模式 `work/code`；工具覆盖层仍为 `chat/work/code`。

## 删除边界与共享能力复核

| 范围 | 证据与结论 |
|---|---|
| Moments 装配链 | `application/default-dependencies.ts` 删除服务导入、媒体匹配装配、IPC 注册和扫描器构造；`background.ts` 删除扫描器启动/受控退出；`agent-runtime.ts` 与 `build-options.ts` 删除朋友圈背景注入、成功收尾发帖调度。没有留下该功能后台消费者。 |
| 工具、协议和桥 | `tools/registry/tool-registration.ts` 删除 Moments 工具注册；`protocols/bootstrap.ts:14` 和 `:31` 仅移除 `moment-media` 注册及 handler；`preload/index.ts` 和 `shared/ipc-channels.ts` 删除 Moments API 与事件。旧媒体文件不会再由该协议提供，但未新增删除/迁移操作。 |
| 社交和记忆收尾 | `agent-runtime.ts:269` 保留 `buildChatSocialContext`；`:296` 保留社交抽取调度；`build-options.ts:975` 保留社交抽取/旧记忆写入分支、关系记录与贴图返回。删除 `finishedContext` 的唯一消费者是 Moments 发帖快照，非共享事件 threadId。 |
| RAG、Worldbook、搜索与贴图 | `rag/index.ts:293` 关键词查找函数完整保留，仅注释删除 Moments 例子；共享 `search_text` 注册及实现保留。贴图匹配、embedding 服务创建/刷新、渠道 outgoing-composer 保留；`firefly-sticker-resources.test.ts` 仅删除专属 Moments matcher 断言，渠道路径、ID 冲突、用户 GIF 元数据和不写回配置的正向断言保留。 |
| Work 学习和 Call / Learn 退役 | Work `knowledge_workflow.md` 注入、pop_quiz、knowledge workspace 和 progress 模块保留。未把 `learn-post-turn` 或 `learn/progress.md` 当旧模式入口误删。`ipc-contract.test.ts:39` 保留 Call 桥退役检查；`plugin-host/speech-input-service.ts:129` 保留在取得资源前明确拒绝 `active-call`；模式校验与 Work 覆盖测试保留。 |
| 调度归属 | `scheduler/scheduler-runner.ts:113` 的 Agent threadId 与 `:201` 的 RUN_ERROR threadId/runId/schedulerRunId/schedulerTaskId 未改。 |
| 敏感边界 | 权限、shell、MCP 事务、Memory 存储、Renderer、license/notice/model authorization 文件的目标路径没有本次差异；顶层目录未更名。审查和补充测试仅操作隔离工作树与临时夹具，没有访问真实用户文件。 |

## 插件输入验证及安全边界

`src/plugins/prompts.ts:88` 在写入 registry 之前检查非空数组和允许来源；`moments-post` 明确抛 sources 非法错误，混合活动来源与旧来源的声明也被完整拒绝。不存在 silently remap 到 conversation 的扩大调用。`src/plugins/api.ts:568` 与 `packages/plugin-sdk/src/api.ts:568` 保持相同活动来源联合；SDK README 明确要求旧插件移除旧声明并重新构建。

`prompts.ts:109` 保留显式来源过滤、未声明来源仅 conversation/scheduler、取消信号和模式过滤；删除的是仅 Moments 场景绕过 modes 的例外。活动来源、plugin-agent opt-in、多来源模式过滤、非法来源后正常注册，以及 provider 失败/超时/长度限制的正向测试保留。

本地协议权限并未因删除 Moments 协议而扩张：`bootstrap.ts:33` 继续调用 sticker URL 解析及目录内解析，字体 handler 继续解码、文件名白名单、父目录和存在性检查。`sticker-protocol.ts` 与 `ui-font-protocol.ts` 不变；对应有效资源及拒绝路径穿越的测试保留并独立执行通过。

对恶意 Renderer 请求旧 Moments IPC 或 `moment-media` URL，路径已经不暴露且无 handler，不能落入通用文件访问。对恶意插件提交 `sources: ["moments-post"]`，注册在 entries.set 前拒绝。没有发现删除校验后保留外部访问入口的情形。

## 引用、历史与影响范围

本仓库源码规模超过 200 文件，采用 SURGICAL 策略：完整检查本次共享生产文件差异和修改测试、优先跟踪协议/插件/设置安全路径，删除的专属模块按归属、导出和反向调用审查；未逐行重新审计约一万行删除实现。

参考 `reference-audit.json`：38 个删除文件、153 个导出符号；非 Renderer 的剩余生产引用为 0，Renderer 47 个文本命中，通用同名符号 36 个命中。已按真实导入鉴别 `initialize` 等同名误命中，不把存储、调度或 Live2D 的 initialize 删除。独立 `git grep` 在 Main/preload/shared/plugins/SDK 非测试 TS 源码中没有 Moments 残余链。

协议 bootstrap 生产调用分别来自 pre-ready 与 shell-bootstrap，删除媒体协议分支影响两个启动注册路径，sticker/font 共用代码保持不变。插件来源验证的生产注册入口是 `src/plugins/context.ts:205`–`:207`；没有新增第二条绕过 registry 的来源路径。`onAgentRunFinished` 唯一生产调用在 `agent-runtime.ts:365`，删除参数未影响其他生产调用。

`git blame` 显示被删除的媒体协议注册/handler 和来源过滤例外来自 `f1f6579540c8ce3faa792dbc40f44d9a9119fe6a`（2026-09-25，建立 Firefly desktop runtime）；保留的安全校验也出自该基线。未发现安全修复校验被删除而其受保护入口保留。历史分析限于本次关键删除路径及一跳调用。

## 验证证据

- 已读取主任务 `green-targeted.log`：10 文件、148 测试通过，覆盖设置、IPC、协议 bootstrap、插件 prompt、build-options、background、agent-runtime、贴图资源、能力过滤和图像路由。这是主任务日志证据，不冒充独立重跑。
- 独立运行补充正向测试：8 文件、64 测试通过，退出码 0，11:43 UTC 耗时 2.20s。文件为 `sticker-protocol`、`ui-font`、`sticker-embedding-cache`、`knowledge/progress/learn-post-turn`、`plugin-host/speech-input-service`、`scheduler/scheduler-runner`、`orchestrator/tools/search-code-tools`、`settings/launch-at-login` 的 `.test.ts`。
- 修正后独立运行 `npm test -- src/main/settings/settings-facade.test.ts`：1 文件、24 测试通过，11:45:58 UTC 耗时 350ms。另已读取主任务 `red-installer-settings.log`（新增安装选项测试失败）和 `green-installer-settings.log`（设置与登录选项共 29 测试通过），确认修复前后证据。
- 首次独立补充运行因默认临时目录 mkdir EPERM 在导入前失败，0 测试执行；将该命令进程的 TEMP/TMP 指向 `E:\Codex\2026-10-04\task-3\review-temp` 后重跑通过。未改产品配置。
- 已读取 `build-main.log`、`build-preload.log`、`check-schema.log`，主任务报告成功，schema 日志确认一致。本审查未重新构建。
- 独立 `git diff --check 9660c584` 退出码 0。
- Renderer 的 16 个类型错误属于独立 UI 删除尚未联动的已知依赖，不创建 stub、不改 Renderer；联动前不能发布。
- `full-tests.log` 已完成：599 文件中 596 通过、3 失败；5841 测试中 5828 通过、11 失败、2 跳过。失败为 shell-job（8）、built-in-tools-shell（2）、self-improvement-source（1）；这些实现不在本次差异。本审查未复现基线全量测试，不能断言这些失败都是既有或仅由环境造成，也不能声称全量通过。
- 主任务随后报告：99 个共享文件、839 测试通过；受控升级执行权限后 shell-job 单文件 13/13 通过，支持初次 8 个进程存活失败来自执行沙箱限制的归因；其余 3 个 Bash 夹具失败将使用已核验的 `E:\Git\bin\bash.exe` 重跑全量。这些为主任务反馈，未由本审查独立重跑；最终全量结果由主任务追加。
- `built-in-tools.snapshot.test.ts.snap` 曾在 status 中出现换行/stat 变化，独立 git diff 无语义差异；主任务确认工作树与 HEAD blob hash 相同，不提交此文件。

## 尚未验证范围

最终安装选项修正已复核代码并独立重跑回归测试。真实 GUI、真实模型、网络供应者、ASR/TTS 服务、安装器和打包未执行。本审查无浏览器或真实用户数据检查，不扩展为整仓安全审计。完整发布仍需要 UI 联动和完整 renderer 验收。

## 主任务最终复验补充

以下为独立审查结束后主任务核验的原始日志证据，并非额外的独立审查运行：

- `full-tests-verified.log`：批准的执行环境及实际 Git Bash 夹具 `FIREFLY_TEST_BASH=E:\Git\bin\bash.exe`，`npm test` 退出码 0；599 个测试文件全部通过，5840 项通过、2 项跳过，共 5842 项；用时 360.56 秒。首轮 11 项失败在相同源码下复验通过，没有修改 shell、测试约束或 CI。
- `plugin-examples-verified.log`：本地 SDK 打包及四个示例编译、冒烟契约均通过；首次尝试的网络沙箱 `connect EACCES` 已通过批准环境复验解决。
- 审查日志的 `11:43` / `11:45:58` 为测试进程输出的本机时间（UTC+08），上文标注 UTC 不准确；以原始日志为准。
- renderer 类型检查与构建仍依赖另一 UI 分支删除 Moments 类型及入口；本分支没有提供兼容空壳。
