# Firefly 统一收口与真实启动记录

## 状态

工作分支 `codex/firefly-migration`，HEAD `cee1097bcf7cdb426e2f0f4961183c4cdf21bcb2`。保留此前全部源码、资源和报告修改；未暂存、提交、推送或发布，未修改两个原目录。

**已完成本次真实迁移、公开 Chat 和一次正常退出重开验收。** 首次启动的日志模块初始化失败已取得直接原因并修正，后续结果见文末。后台观察与向量索引仍有告警，不将本轮局部验收写成全部功能通过。

## 本轮清理

- 移除 `docs/design` 中 36 份旧产品施工、设计、市场与参考稿；当前技术入口归并到 `docs/architecture/firefly-runtime.md`、`firefly-maintenance.md`。
- 移除 10 份旧内部问题稿、4 份旧重构施工稿及2份旧存储/渠道草案；维护约束与尚未复核的风险归并到 `firefly-reliability-boundaries.md`。删除文档不表示旧问题全部已修复，原始证据由 Git 历史保留。
- 修正保留文档及两处源码注释指向已退出工作树的文档链接。退出旧归档入口，不保留只有“历史声明”的旧施工入口。
- 完整 LICENSE、模型授权、上游贡献和第三方声明保留；BiliNote、March7thAssistant、SnowLuma 的真实研究来源及原有再分发边界集中补入 `THIRD_PARTY_NOTICES.md`，不声称第三方实现为本项目原创。
- 旧迁移报告保留当时的路径与验证事实，不作为当前产品接口；不改写过去的测试数字或 Git 历史。

## 真实启动失败与修正

执行迁移目录的 `npm start` 后，Electron 报错：`Cannot access 'legacy_firefly_contracts_1' before initialization`。堆栈明确来自本目录 `dist/main/shared/logger.js`，不是旧产物。

`src/shared/logger.ts` 在模块顶层调用 `readEnvLevel()`，而其使用的导入位于文件末尾；CommonJS 编译保持 require 的执行位置，造成初始化前访问。`src/main/logger.ts` 同样在末尾导入之前调用 `resolveDefaultLevel()`。两处导入均移到前部。

新增 `src/main/logger-commonjs.test.ts`：按生产 CommonJS 方式转译并加载这两份真实源码，避免只依赖测试框架的 ESM 导入提升。测试环境不访问真实设置。

该问题是本次真实启动取得的直接证据；**不将其写成此前首次历史空列表事件的原始根因**，后者仍未确定。

## 数据预检与备份

预检时无 Electron/Firefly 进程，随后才复制备份。备份目录：`%LOCALAPPDATA%\Firefly-Migration-Backups\2026-09-25T12-37-22-831Z`。共90个相关文件逐字节核验，未复制运行锁、缓存或日志。原数据与旧数据目录备份均保留，备份不在仓库或打包资源中。

| 项目 | 启动前数量 | 记录身份检查 | 新目录 |
|---|---:|---|---|
| 模型档案 | 1 | 只读取数量，不输出凭据 | 配置仍在当前用户目录 |
| 会话 | 14：Chat 7、Work 7 | 14个唯一 ID；索引与会话 ID 一致；无缺失/无效项 | 不存在 |
| 运行 | 18 | 18个唯一 ID；索引与会话 ID 一致；无缺失/无效项 | 不存在 |
| 子任务 | 1 | 1个唯一 ID；索引与会话 ID 一致；无缺失/无效项 | 不存在 |

本次实际数据不存在新旧目录并存，因此没有需合并的旧目录独有记录或同 ID 冲突。启动失败后再次检查，新目录仍不存在，未发生半迁移，不重新复制或覆盖数据。

限制：当前 `migratePath` 对已存在目标目录直接返回，不能把它描述成已实现任意并存数据的 ID 合并。后续启动前若发现两边并存且有独有记录，必须停止该项直接启动迁移，先按真实契约处理；不能静默忽略。

## 自动验证

- 本轮4文件33项通过，0跳过：共享日志、Main日志、新CommonJS加载测试、现有数据迁移测试。最后移动测试至 Main 测试目录后再次通过相同范围，不重复计算为66项。
- `npm run build` 通过，包含清理 dist、Main、Preload、CLI、Renderer。Vite仍提示大chunk，不作为性能通过证据。
- 新测试最初放在 shared 导致 Renderer 类型检查报 Node 内置类型缺失，已移动至 Main 测试目录；`npm run check:renderer` 随后通过。再次 `build:main` 清除了曾生成的 shared 测试输出。
- 真实编译后的两份日志模块经 Node require 加载通过；这只验证初始化，不代替应用实机。
- SDK 本地包与四个示例、面板协议安全测试沿用 contract-unification 报告的已通过记录；SDK及协议本轮未修改。此前面板测试的1项跳过是当前系统无法创建符号链接，不能混入通过数。
- 上述初始验证阶段未请求模型；后续集中验收仅发送一条公开测试消息。未重新全量测试、操作播放器或启动外部语音服务。

## 保留旧标识的具体入口

| 位置 | 具体读取用途 |
|---|---|
| `src/shared/legacy-firefly-contracts.ts:1` | 历史 `cyrene.*` 自定义事件转成当前事件，一次消费，不双发。 |
| 同文件 `:4` 至 `:16` | 已安装用户的旧环境变量读取；显式 Firefly 环境值优先。 |
| 同文件 `:21` 至 `:31` | 旧工作区、用户提示词、本地无授权占位、模式/模型偏好、渠道头和插件来源元数据的集中读取常量；不作为当前新写入名称。 |
| 同文件 `:53` 至 `:55` | 朋友圈发帖、反应开关与 feeling 字段迁移；新字段已有值优先。 |
| 同文件 `:64` | 持久化朋友圈作者、actor、mentions 的身份规范化；用户正文不替换。 |
| 同文件 `:76` | 旧压缩检查点解析。 |
| 同文件 `:77` | 旧渠道凭据解密派生常量，不能更名破坏解密。 |
| 同文件 `:78` 至 `:81` | 旧外部插件面板 scheme、协议、保留路径和桥别名的集中适配；当前示例使用新协议。 |
| 同文件 `:83` 至 `:88`；`src/renderer/types/legacy-firefly.d.ts:5` 至 `:10` | 旧外部 Window 调用别名，类型指向当前 Firefly 类型。 |
| `src/main/migration/firefly-data.ts:6` 至 `:8`、`:58` | 旧会话/运行/子任务目录及导出 manifest 的迁移源路径。 |
| `src/main/skills/skill-id-aliases.ts:2` 至 `:9` | 八项用户已保存 Skill 开关/命令的旧 ID 映射。 |
| `packages/plugin-sdk/src/legacy.ts:2` | 已有插件的类型导入别名，指向 `FireflyPlugin`，当前接口不反向依赖旧类型。 |
| `.gitignore:209` | 防止旧私有工作区迁移源进入 Git，不是业务存储路径。 |
| `MODEL_LICENSE.md`、`THIRD_PARTY_NOTICES.md`、`docs/CONTRIBUTORS.md:30` | 原模型、上游源码与贡献者的真实归属；LICENSE完整保留。 |

对应迁移、协议拒绝和旧资源负向回归测试仍包含旧值以防回归；不编码隐藏它们。当前 README、开发说明、架构、插件指南、Skills、示例及剩余 `docs/design` 的旧品牌文本检查无匹配。迁移报告中的旧文件名是被保护的真实操作记录，不是当前代码使用的标识。

## 后续真实启动与一次重开

用户关闭 Error 后结束了本次失败的 npm 会话；确认 Electron 已退出，再从迁移目录 `npm start`。没有强杀健康应用、清空用户数据或启动重复实例。

发现子任务目录原先只在 Work/Code 的 TaskSessionStore 初始化时迁移。补充 `migrateFireflyDataOnStartup()`，在主实例 ready 后、application.start 前调用现有目录迁移器；按存储类别返回失败状态，不输出正文。单项失败不建立空目标，也不阻碍其他类别迁移；访问失败类别时原有迁移错误仍会抛出。

新增启动覆盖和单项损坏隔离测试。`firefly-data.test.ts` 与 `application.test.ts` 合计 **2文件19项通过、0跳过**；与前述4文件33项有重叠，不相加宣称唯一测试总数。`npm run build:main` 通过，Renderer 未改动，沿用本轮完整构建及类型检查。

公开 Chat 完成后，通过真实 Preload `window.firefly.quit()` → APP_QUIT → 应用受控关闭入口正常退出，确认进程结束，再从同一迁移目录 `npm start` 一次。未再请求模型。

| 项目 | 初始旧数据 | 公开消息结束、重开前 | 最终重开后 | 界面证据 |
|---|---:|---:|---:|---|
| 模型档案 | 1 | 1 | 1 | 模型面板显示已保存模型 |
| Chat | 7 | 8 | 8 | 对话导航8项 |
| Work | 7 | 7 | 7 | 项目下历史7项，不把工作区父节点算作会话 |
| 运行 | 18 | 19 | 19 | 本轮不逐一打开运行历史 |
| 子任务 | 1 | 新目录尚未建立 | 1 | 本轮不重做子任务展示验收 |

最终索引会话15、运行19、子任务1，唯一 ID 数分别15、19、1；各旧目录独有 ID 均为0。公开消息使 Chat 与运行各增加1，重开没有再次增加记录。旧目录78个数据文件与预先备份逐一哈希一致；未覆盖旧源、未重新复制已存在的新目录。新旧同 ID 的内容不覆盖，任意并存独有数据合并仍不是本迁移器已实现的能力。

运行的 Main 来自迁移目录 dist/main；Renderer 实际页面 URL 为 `file:///E:/Codex/Firefly-Agent-migration/dist/renderer/react/index.html`。Electron 子进程使用 `%APPDATA%\Firefly`。Electron 可执行文件位于原目录的 node_modules，是迁移目录现有依赖 Junction 的解析结果，不表示加载了旧 Main/Renderer。另一个 Electron Node 子进程是现有 Playwright MCP helper，不是第二个 Firefly 主实例。

本次公开消息只发送一次，不调用工具。回复未混入旧角色或虚构共同经历；截图确认完成提示、输入区恢复空闲。持久化回复 `runSnapshot.status=terminal`、`terminalStatus=success`，无待派发消息；新增运行状态 `completed`，其事件文件有 `run_created` 1条、`checkpoint` 1条、`run_completed` 1条。新记录位于 firefly-chats/firefly-runs。这些是实际终态与单次运行证据；没有单独截获 AG-UI `firefly.*` 线上的完整事件序列，事件名称与旧回放兼容沿用已有自动测试，不以存储事件冒充协议抓取。

## 剩余问题与验证边界

- 观察后台出现 `Failed to parse URL from /v1/messages`，采用保留现有 feeling 的失败路径；本轮未改用户服务配置，未证明观察模型可用。
- 对话向量索引出现 addMemory/indexConversationTurn 失败告警；主 Chat 仍正常终态，不能据此声称 Memory 向量写入成功。未读取或记录私人正文与凭据。
- 首次历史空列表事件的原始根因仍未确定。本次 CommonJS 初始化修复、目录迁移及成功重开不能倒推该历史事件原因。
- SDK与四个示例沿用未变代码的本地构建验证，不将其写成此次插件界面操作；此前符号链接安全测试1项跳过继续单列。
- 真实TTS、QQ Music应用内审批、持续帧率、安装器及其他已记录未覆盖项不变。
- 最终工作树：298项修改、90项删除、47项未跟踪文件（展开统计）；暂存区为空，`git diff --check` 通过。未提交、推送、发布，两个原目录未编辑。

## 后续两项后台问题定向收口

此前真实启动日志的观察器错误为 `Failed to parse URL from /v1/messages`。用户模型设置当时的顶层 `baseUrl`、`model`、`apiKey` 均为空，已有一个完整的保存档案，`runtimeSync=llm`。聊天运行从档案展开设置，但完成回调重新读了未展开的顶层镜像，观察器于是构造出相对地址。这是完成回调配置传递缺口，不是已证明的服务故障。

桌面 AG-UI 完成上下文现传递本次运行实际选择的 `modelProfileId`；完成副作用用现有 `resolveModelSettingsProfile` 展开同一档案，不指定时沿用已保存默认档案。观察器在服务 URL 或模型无效时明确报告不可用并跳过队列和请求；有效设置继续走原有 LLM 队列、权限与心情平滑链。没有新增服务地址、独立模型配置或后台请求入口。定向测试验证选择档案能到达观察器、缺失地址不发请求、失败不改变当前心情。真实观察请求尚未在新 Main 上执行。

对话历史向量告警实际为 `RAG not initialized`。启动链以 `auto` 装配本地 BGE-M3；向量 provider 未就绪，原始 Chat 已单独正常保存。现有状态页已显示 BGE-M3 的安装状态。已核实本项目 `models/Xenova/bge-m3` 与用户 Hugging Face 缓存 `Xenova/bge-m3` 两处均缺少 `tokenizer.json`、`config.json` 和 `onnx/model_quantized.onnx`；当前环境未设置 `FIREFLY_MODELS_DIR`。没有把 Chat API 档案代作 embedding 服务，也没有下载模型。

历史索引现先读取 RAG 真实就绪状态：不可用时不调用 `addMemory`，返回 `{ status: "unavailable", indexed: 0 }` 并给出不含正文的日志；实际写入才增加成功计数，第二条失败返回 `partial`，首条失败返回 `failed`。`recall_history` 在未就绪时明确返回不可用，不再误称检索结果为空。原始对话写入与向量索引仍是各自原有存储；未触碰既有向量文件，后续模型就绪时可重新使用正常索引路径。当前旧轮次缺失的向量未补建，不能将代码修正等同于历史索引完成。

本轮自动验证：`agent-runtime.test.ts`、`history-tools.test.ts`、`build-options.test.ts` 共3文件81项通过；`agui-bridge.test.ts`、`model-status.test.ts` 共2文件70项通过。随后同一 `agui-bridge.test.ts` 53项因新增档案透传断言定向重跑通过；此53项已在前述70项内，不另累计。`npm run build:main` 通过；第一次编译指出桥接回调类型未声明新增字段，补齐类型后重新编译通过。当前运行实例仍是此前启动的 Main；本轮未重启或进行新的模型请求，服务实测保留未验证。

累计差异按完成本节前的展开工作树统计：90项删除、300项修改、48项未跟踪。新增及本次改动集中在 `src/main/agui-bridge.ts`、`agui-bridge.test.ts`、`src/main/orchestrator/agent-runtime.ts`、`agent-runtime.test.ts`、`src/main/orchestrator/tools/history-tools.ts` 和新 `history-tools.test.ts`；其余既有改动范围保持前述清单。无暂存、提交、推送或发布。

## 观察器与向量索引集中实机验收

按正常退出入口结束此前实例，并从本迁移目录 `npm start` 启动。第一次公开 Chat 一次运行完成，界面显示回复与正常输入区，磁盘会话为 user 1条、model 1条，终态 `success`、运行 `completed`。日志出现一次“对话向量索引未就绪”，没有 `RAG not initialized` 写入错误。该次观察器成功路径没有日志回执，不能从“无报错”判定它已成功。会话数从15到16、运行从19到20。

第一次消息的独立会话标题生成请求记录 `TypeError: fetch failed`；不属于心情观察请求，未改变 Chat 成功终态。第二次复测日志未再记录该失败，本轮未追查标题请求的偶发服务错误。

因此仅为观察器补充不含 URL、模型名、密钥或正文的请求和结果状态回执。重跑 `agent-runtime.test.ts` 19项通过，`npm run build:main` 通过；此19项与上一节81项重叠。正常退出、重开后再发送一次公开复测消息。最终 Main 来自本迁移目录构建；Renderer 仍来自本迁移目录的 `dist/renderer/react/index.html`。

第二次实测：会话使用已保存默认档案（会话 `modelProfileId` 与默认档案 ID 一致）；日志记录一次 `mood observation request { profileSelection: 'default', transport: 'responses' }` 和一次 `mood observation applied`，没有空地址错误、非法结果或观察失败。`default` 表示本次未手动切换档案，由已保存的默认档案展开；不会打印档案 ID。Chat 回复正常结束且输入恢复空闲，落盘一条 user 和一条 model，末条消息终态 `success` 且有完成时间，运行 `completed`，待发消息0。会话数17（Chat 10、Work 7）、运行21；第二次仅各增加1。该证据证明这一次观察请求已发出并解析为可应用心情，不推断其他服务或请求均成功。

本次 BGE-M3 仍未安装。第二次运行仅记录一次“对话向量索引未就绪”，无 `RAG not initialized` 异常；未调用失败的向量写入，原始 Chat 正常保存。`recall_history` 的“未就绪、未执行检索”返回由先前 `history-tools.test.ts` 确定性测试验证，未通过真实模型调用该工具。向量检索待配置、既往对话向量待补建，均未在本轮执行。缺少的完整本地资源是 `models/Xenova/bge-m3/` 下的 `tokenizer.json`、`config.json`、`onnx/model_quantized.onnx`；不使用 Chat API 配置代替 embedding 服务。

完整工作树路径清单与提交说明见 `firefly-precommit-inventory-2026-09-25.md`。本节是后续验收增补，前文历史快照数字保留其记录时间的意义；未暂存、提交、推送或发布。
