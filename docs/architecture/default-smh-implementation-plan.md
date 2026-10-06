# 交付①：默认 S/M/H Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 普通启动的全部约定入口使用可信 S/M/H，停用旧个人记忆运行链，并保留原始数据、模型档案、权限和非个人记忆功能。
**Architecture:** 在现有 Main actor/source authority、单写 Worker、canonical transcript、M policy、H native reader 和 context permit 上增量接线；抽取共同运行所有者，桌面与其他来源使用独立可信适配。模型调用统一经过实际厂商请求准备、预算、单次许可和同一请求发送；不重写存储/溯源核心，不用提示词替换或诊断开关冒充集成。
**Tech Stack:** TypeScript、Electron、Vitest、Node 24、既有 SQLite Worker/Rust Windows helper、OpenAI/Anthropic SDK 与现有厂商适配器。
**Spec:** `docs/architecture/default-smh-delivery-design.md`；共同约束见 `default-memory-and-parallel-roles-design.md` §§1–4、6–7。

## Global Constraints

- 源码基线 `771f302`，文档基线 `c5e9441` 加本次设计修订；只修改自有云端源码，不操作用户电脑，不调用付费 API/真实渠道账号。
- 先单独完成交付①，再实施交付②；本计划不增加角色并行、文件冲突协调或更改角色/技能配置。
- 保留全部保存模型档案，包括 OpenRouter `openai/gpt-6-luna`；不强制 GPT-5.2，不把隔离 smoke 的固定 USD 1 账本变成生产费用策略。
- 保留原始会话/文件；不自动迁移、修剪、补造历史 snapshot。保留世界书/人设、`imported_doc`、Work 知识工作区、表情/心情、ASR、提示音及普通音频。
- 取消、编辑、删除、配置变更和关闭均保留失效证明与等待真实结算；授权能力留在 Main，Renderer/模型传来的字符串不产生权限。
- 真实 API 联调由用户自行执行；交付可配置接口、显式测试入口与错误反馈。未做真实 API 验证不阻塞接口/离线测试实现，但须独立标明。
- 每项按 RED → 最小实现 → GREEN → 小提交执行；本文件仅为实施计划，不代表已完成；执行依用户确认的清单进行。以下“新增”签名是施工目标，不是声称仓库已有接口。

## Review Focus

1. 同一 sender 在不同渠道账号/群聊出现，或群聊成员引用主人的话：不得串用主人 M/H（任务 3）。
2. 图片、中文、超长工具 schema、rawAssistant、stream 降级与 Code 字段名讨论：正确计数/重获许可，普通字段名不被秘密策略误伤（任务 2、4）。
3. 编辑/删除与已计数、已发请求及取消同时发生：旧证据/迟到提交明确拒绝；已启动操作结算前不释放生命周期（任务 5）。
4. 旧会话缺 snapshot、32 会话/索引大小边界、helper/本地模型缺失：明确覆盖不足，零补写、无 recall_history 回退（任务 7、10）。
5. 设置页双击/过期候选/恶意窗口请求，与摘要准备期间来源变化：拒绝旧 revision/伪造权限，保持原文件（任务 6、8）。

## 已核验入口与先决条件

- `application/default-dependencies.ts` 仅以 `firefly-memory-controlled` 装配 `createMainDesktopMemory`；`main-desktop-session-authority.ts` 限活动窗口 Chat；`desktop-memory-backend.ts` 默认只认 GPT-5.2 Responses，OpenRouter 仅测试/烟测。
- `agent-runtime.ts` 的 controlledResponses 绕过常规工具循环；`main-s-runtime-port.ts` 拒绝 stream tools；`conversation-transcript-adapter.ts` 拒绝附件、thinking/rawAssistant/internal；`main-context.ts` 拒绝 bounded summary。这些都必须真实解限并补证明。
- `IncomingMessage`/`ChannelAdapter` 尚无统一可信账号标识；`ModelSettings` 有上下文/超时但没有数值型档案输出上限；公开 ChatSession 尚无通用 temporary 标记。任务 1 下列新增契约补齐这些缺口，不编造已有字段，不把缺身份映射为主人。
- 依赖方向：1 → 2/3 → 4 → 5/6/7 → 8/9 → 10/11。可独立写测试；同一文件修改按序合并。现有存储/安全测试继续保留。

### Task 1: 固定运行入口与模型契约
**Files:** 新增 `src/main/memory-context/main-memory-contracts.ts`、`main-memory-contracts.test.ts`；修改 `src/main/channels/{types.ts,adapters/base.ts,manager.ts,adapters/wechat/ilink-bot-adapter.ts,adapters/feishu/index.ts,adapters/qq/napcat-adapter.ts,adapters/qqbot/qqbot-adapter.ts}`；新增 `src/main/memory-context/memory-session-modes.ts`；核对 `src/main/settings/model-settings.ts`、`src/main/orchestrator/harness/types.ts`、`src/shared/chat-types.ts`。
**Interfaces:** 新增 `MemoryEntryKind = "desktop" | "channel" | "scheduler" | "child" | "proactive"`；`MemoryRunIdentity = {entry:MemoryEntryKind; sessionId:string; runId:string; modelProfileId:string; sessionMode:"persistent"|"temporary"}`。新增 opaque `MemoryRunGrant`；`createMemoryRunAuthority({actors,sessionModes,resolveProfile,resolveEntry,canRead})` 绑定现有 Main 权威，返回 `issue(input):MemoryRunGrant`、`require(grant):Readonly<MemoryRunContext>`、`revoke(grant):void`。issue 输入含 identity、actorToken、sourceProvider、readActorTokens、signal；Main 来源回调验证账号/entry revision及生命周期信号，不能由 Renderer 同形 JSON 重建。撤销同时 abort 活跃运行。
**Interfaces:** 新增 `ChannelAdapter.getMemoryAccountIdentity():{accountKey:string;revision:number}|null`，只读 Main 已认证连接身份：微信 `creds.ilinkBotId`，飞书启动捕获的 `settings.appId`，QQBot 启动捕获的 `config.appId`，NapCat 经 `get_login_info` 核验后的 `selfId`；键加 channel 命名空间，停用/账号变更/reconnect 撤销旧 revision。`IncomingMessage` 中的原始 payload 不能覆盖该值。
**Interfaces:** 新增 Main-only `createMemorySessionModes():{bind(sessionId:string,mode:"persistent"|"temporary"):void;require(sessionId:string):"persistent"|"temporary";remove(sessionId:string):void}`；已加载的既有会话由 Main 注册 persistent，新临时会话由经认证创建入口注册 temporary，同一会话不可原地提升为 persistent；运行 DTO 不决定模式，缺注册拒绝。
- [ ] RED：新增 `rejects_missing_account_profile_or_session_mode_authority`，断言缺可信身份不能得到 grant、不能打开 Worker/发送/写 M；`accepts_saved_nondefault_profile_without_mutating_settings` 断言配置字节不变。
- [ ] Run: `npm test -- src/main/memory-context/main-memory-contracts.test.ts`；新契约缺失应 FAIL。
- [ ] 实现上述三个契约；账号为空只阻塞该渠道记忆，不映射主人。输出 reserve 取有效 Harness 配置（缺省 `DEFAULT_HARNESS_CONFIG.reservedOutputTokens=8192`）与实际 wire maxTokens 的较大值，安全余量缺省沿用 512；保留 Anthropic 既有 32768 wire 上限、主动消息 600，以及 Chat/OpenAI/Responses 原本不写上限的行为。无 wire 上限时 exact 分支另取已核验模型最大输出参与 reserve，缺证据则用明确 estimate 分支，绝不把 reserve 宣称为硬上限。超时沿用该入口有效 timeoutMs，不修改档案。
- [ ] GREEN：重跑上述命令，额外断言四渠道 accountKey 只取上述 Main 字段、reconnect 前 grant 拒绝、temporary 无持久 M/H、缺省 reserve=8192/margin=512，实际 wire 上限/超时不变。若某适配器启动状态不能证明以上身份，先只读追到它的认证/重连代码并补齐字段来源与撤销测试，记录具体阻塞，不猜值；其他入口继续。
- [ ] Commit: `git add src/main/memory-context/main-memory-contracts* && git commit -m "feat: define trusted default memory run contracts"`（同时显式加入本任务实际修改的宿主文件）。

### Task 2: 冻结实际请求与生产预算
**Files:** 新增 `src/main/orchestrator/vendors/prepared-model-call.ts`、`prepared-model-call.test.ts`、`src/main/memory-context/model-counting.ts`、`model-counting.test.ts`；修改 `vendors/sdk-stream/runtime.ts`、`memory-context/{context-contracts.ts,token-budget.ts,main-responses-binding.ts,desktop-memory-backend.ts}`。
**Interfaces:** 新增 `PreparedModelCall = Readonly<{request:PreparedRequest; endpoint:string; serializedBody:string}>`；`prepareModelCall(adapter:ChatVendorAdapter, request:ChatRequest, config:VendorConfig, identity:RequestIdentity, options?:{validateCurrent?:()=>void}):PreparedModelCall`。`PreparedModelCallInput = {prepared:PreparedModelCall; config:VendorConfig; timeoutMs:number; signal?:AbortSignal; onDelta?:(delta:UnifiedStreamDelta)=>void; onModelExecution?:(phase:"start"|"end", terminal?:"completed"|"failed"|"cancelled")=>void}`；`dispatchPreparedModelCall(input:PreparedModelCallInput):Promise<ChatResponse>`。
**Interfaces:** 沿用 `TokenCounter` 的 `mode:"exact"|"estimate"`、`framingVersion`、`inputTypes` 与既有 `admissionMode:"bounded"`；新增 `resolveMemoryCounter(config:VendorConfig, profileRevision:number, options?:{exactCount?:(request:Readonly<PreparedRequest>,options?:{signal?:AbortSignal})=>Promise<number>;validateCurrent?:()=>void}):TokenCounter`，只为已验证能力返回 exact，其余复用 `orchestrator/context-manager.ts` 的 `estimateTokens`，针对最终 wire JSON 计数、图片使用已支持的估算输入契约，版本标为 `memory-wire-estimate-v1`，安全余量取既有 context budget 配置；未知输入类型拒绝，不能按传输名猜 tokenizer。
- [ ] RED：`sends_identical_counted_body_for_each_transport` 比较实际 mock SDK/fetch body 与冻结 JSON；`estimated_receipts_are_not_exact`、`revokes_on_profile_change`、`preserves_existing_output_timeout_limits`；覆盖中文/图片/tool schema/rawAssistant/鉴权更新，断言失败零发送。
- [ ] Run: `npm test -- src/main/orchestrator/vendors/prepared-model-call.test.ts src/main/memory-context/model-counting.test.ts src/main/memory-context/token-budget.test.ts`；新增路径应 FAIL。
- [ ] 实现 prepare 一次、私有凭证分离、同序列化内容验证及计数 receipt；准备对象须经 Main 私有 WeakMap 认证，同时绑定 endpoint、真实档案及配置 revision，伪造同形对象/变更地址拒绝；SDK 需要重新序列化时验证所得字节完全一致。估算记录版本/安全余量/服务端 usage 差异，明确没有生成前精确窗口保证。生产路径不导入 `createOpenRouterExpense`，保留隔离诊断工具原范围。
- [ ] GREEN：重跑命令。`dispatchPreparedModelCall` 仅由现有 `context.dispatch` 单次 permit 回调进入；observer 在最终验证后的实际调用前 start，消费流/拒绝真正结算后的 finally end，不能抛错改变行为。这是交付②唯一模型计时接缝。
- [ ] Commit：仅本任务文件，`feat: bind memory budgets to prepared provider requests`。

### Task 3: 共用 Main 所有者与可信来源
**Files:** 新增 `src/main/memory-context/main-memory-runtime.ts`、`main-memory-runtime.test.ts`、`src/main/memory-sources/channel-source-provider.ts`、`channel-source-provider.test.ts`、`task-source-provider.ts`、`task-source-provider.test.ts`；修改 `memory-context/{main-desktop-memory.ts,main-desktop-session-authority.ts,desktop-memory-backend.ts}` 及任务 1 的宿主账号契约。
**Interfaces:** 新增 `SharedMemoryBackend = Pick<DesktopMemoryBackend,"transport"|"localRetrieval"|"endpointFactory"|"close">`，资源与模型 binding 分离；`createMainMemoryRuntime(options:{backend:SharedMemoryBackend; store:ConversationTranscriptStore; resolveModel:(grant:MemoryRunGrant)=>{profileId:string;revision:number;settings:ModelSettings}}):MainMemoryRuntime`，其 `openRun(grant:MemoryRunGrant):Promise<MainMemoryRun>`、`quiesce():void`、`close():Promise<void>`；`MainMemoryRun = {call(input:SdkStreamRunInput):Promise<ChatResponse>; bindSink(sink:TranscriptSink):TranscriptSink; close():Promise<void>}`。binding 按真实档案/revision 获取；同一存储上下文只开一个 Worker；bindSink 返回沿用真实 sink binding 的守卫 facade，原始 sink 不交给循环绕过。
**Interfaces:** 新来源实现已有 `MainSourceProvider.authorize(scopeKey,identity)`、`withLease(identity,operation,previous?)`，通过已有 `createMainSourceProvider`/registry/actor authority 创建能力；不新增平行数据库或 provenance 系统。
- [ ] RED：`isolates_channel_account_sender_group`、`does_not_promote_task_prompt_or_model_output`、`temporary_run_has_zero_persistent_mh_commands`；伪造 grant 拒绝 `MEMORY_ACTOR_DENIED`，非交互无已有读取授权拒绝，旧账号重连 grant 失效。
- [ ] Run: `npm test -- src/main/memory-context/main-memory-runtime.test.ts src/main/memory-sources/channel-source-provider.test.ts src/main/memory-sources/task-source-provider.test.ts`；FAIL。
- [ ] 抽取 `main-desktop-memory.ts` 现有组合到共用 owner，桌面保留 sender/frame/窗口授权，允许 Chat/Work/Code；渠道身份由账号+sender+chat/thread 绑定。任务/委派/主动提示标为 system/model trust，只读授权集合；临时 S 采用内存会话，不读写持久 M/H。
- [ ] GREEN：重跑命令及 `npm test -- src/main/memory-core/main-access.test.ts src/main/memory-sources/source-registry.test.ts src/main/memory-policy/main-user-fact-coordinator.test.ts`；确认原能力边界未放宽。
- [ ] Commit：上述运行/来源文件，`feat: share Main memory ownership across trusted entries`。

### Task 4: 接入真实 Chat 与多轮工具循环
**Files:** 修改 `src/main/orchestrator/{agent-runtime.ts,firefly-agent.ts,chat-loop.ts,harness-adapter.ts,harness/harness-llm.ts,harness/firefly-harness.ts,harness/types.ts}`、`memory-context/{main-s-runtime-port.ts,conversation-transcript-adapter.ts,context-contracts.ts,main-transcript-provider.ts,main-context.ts}`；新增 `src/main/memory-context/{default-model-loop.test.ts,source-secret-screen.ts,source-secret-screen.test.ts}`。
**Interfaces:** 新增 `screenContextSecret(text:string):"allow"|"secret"`，仅供 S 对原始 transcript 的读取/衍生秘密检查，M 的 `extractPreference`/`extractMaintenance` 自动提取策略保持独立。向 `FireflyRunOptions`、`HarnessInput` 及 `callLLM` 的尾部可选参数注入 `memoryRun?:MainMemoryRun`；每个模型 round、合法 stream→nonstream fallback、压缩请求均使用该 run；缺注入的普通产品入口 fail closed；既有 `streamChatWithSdk` 保留给非记忆调用，但这些产品入口不得绕回。保留原 `ChatResponse`、`TranscriptSink` 和工具调度协议。
- [ ] RED：`chat_work_code_complete_two_tool_rounds`、`retry_requires_fresh_permit`、`interrupted_pairs_restore_without_reexecution`，断言每轮最终 system/角色/工具 schema/完整 call-result/厂商 reasoning envelope 都进入计数与恢复，无第二条发送通道。新增 `code_field_names_are_not_secrets`：仅讨论 api_key/password/access_token 字段名可正常进入 S，但不自动成为 M；`actual_synthetic_secret_is_denied`：含合成凭证值时 `MEMORY_CONTEXT_TRANSCRIPT_SECRET`，零 provider 发送/M/H/summary 明文持久化，既有原会话不删除。
- [ ] Run: `npm test -- src/main/memory-context/default-model-loop.test.ts src/main/memory-context/source-secret-screen.test.ts src/main/orchestrator/harness/firefly-harness.test.ts src/main/orchestrator/chat-loop.test.ts`；新增集成应 FAIL。
- [ ] 将预算/发送接在最终 promptLayers 与 cache hints 之后；扩充现有 ContextMessage/验证/adapter 对已支持多模态、rawAssistant、thinking/internal 的保真表示，不把内部提示或模型回复标为用户事实。每轮提交继续使用现有 mutation observer、responseProgress 与单次 permit；不能只移除拒绝分支。将 adapter 和 main-context 对 S 的粗粒度 `extractMaintenance(...).rejected` 调用改为专门秘密筛查，真实赋值/凭证格式与既有 secret-canary 测试仍拒绝；不是删除安全防护。
- [ ] GREEN：重跑命令及 `npm test -- src/main/memory-context src/main/orchestrator/conversation-transcript-context.test.ts src/main/orchestrator/transcript-sink.test.ts`；summary/工具输出不破坏 canonical 配对。
- [ ] Commit：本任务文件，`feat: run default memory through complete model tool rounds`。

### Task 5: 附件、取消、编辑、删除四项拒绝证据
**Files:** 修改 `src/main/agui-bridge.ts`、`src/main/chats/chats-ipc.ts`、`memory-sources/desktop-user-source-provider.ts`、`memory-context/main-desktop-memory.ts`、`orchestrator/transcript-sink.ts`；新增 `src/main/memory-context/default-memory-rejection.test.ts`。
**Interfaces:** 继续使用 `appendUser(event,id,message,commit)`、`mutate(event,id,changedUsers,commit)`、`registry.prepareIdentityChange(...)`、`TranscriptAppendGuard`；必要的 guard 扩展同时覆盖 assistant/tool_result，不能绕过既有附件 `WorkReadScope` 校验。
- [ ] RED 附件：`rejects_unauthorized_attachment` → `MEMORY_ATTACHMENT_DENIED`（新增稳定边界码），零文件读取/发送/M 写入；合法附件正常进入当前 S，附件正文不自动转 M。
- [ ] RED 取消：`rejects_late_send_and_commit_after_cancel` → `MEMORY_CONTEXT_CANCELLED`，零迟到发送/提交；已有外部操作允许真实结算后关闭。
- [ ] RED 编辑：`rejects_prior_revision_after_edit` → `MEMORY_SOURCE_STALE`；删除：`rejects_deleted_source_and_capability` → `MEMORY_SOURCE_DELETED`/`MEMORY_ACTOR_DENIED`，分别断言无旧证据读取、无未授权持久化；不能只断言空数组。
- [ ] Run: `npm test -- src/main/memory-context/default-memory-rejection.test.ts`；四项新入口测试先 FAIL。
- [ ] 实现来源版本失效、附件权限和关闭结算；保留 source/native invalidation 在实际修改前完成，增加编辑附件的正向用例，取消不自动重发 unknown 请求。
- [ ] GREEN：重跑命令及 `npm test -- src/main/memory-context/response-history-union.test.ts src/main/chats/chats-ipc.test.ts src/main/orchestrator/transcript-sink.test.ts`；Commit `fix: reject invalid default memory sources and late work`。

### Task 6: S 摘要真正参与运行
**Files:** 新增 `src/main/memory-context/runtime-summary.ts`、`runtime-summary.test.ts`；修改 `main-context.ts`、`context-contracts.ts`、`context-repository.ts`、`token-budget.ts`、`main-memory-runtime.ts`。
**Interfaces:** 新增 `prepareRuntimeSummary(context:ReturnType<typeof createMainContext>, actor:object, input:{sessionId:string; transcriptTokens:object[]; summaryIds:string[]; leaseMs:number}, signal?:AbortSignal):Promise<SummaryReceipt>`；消费现有 `prepareSummary`、`readSummaryInput`、`commitSummary`，通过 `assemble(...summaryIds)` 用于下一请求。
- [ ] RED：`summary_is_used_by_next_request`、`estimated_summary_stays_estimated`、`no_benefit_keeps_original_units`、`edit_during_summary_rejects_old_lease`；完整工具单元不可截断，临时摘要不持久化。
- [ ] Run: `npm test -- src/main/memory-context/runtime-summary.test.ts src/main/memory-context/canonical-summary.test.ts`；新生产接线/估算分支 FAIL。
- [ ] 先沿用已证明的整轮选择型摘要，不把生成文本伪造为直接事实；触发采用既有 S/上下文预算。取消 bounded-summary 禁用前扩充 summary receipt 的计数模式/版本，估算改善仅写估算指标；保留来源 lease、无收益不提交及来源变化失效证明。
- [ ] GREEN：重跑命令，另验证重启后的摘要重新验证来源再使用；Commit `feat: activate provenance-backed runtime summaries`。

### Task 7: H 覆盖与非桌面入口接线
**Files:** 修改 `src/main/channels/{bootstrap.ts,dispatcher.ts}`、`scheduler/{bootstrap.ts,scheduler-runner.ts}`、`proactive/{proactive-lifecycle.ts,proactive-model.ts}`、`orchestrator/{child-session-runtime.ts,child-session-types.ts,persistent-agent-runtime.ts}`、`memory-context/main-memory-runtime.ts`、`memory-sources/native-history-coverage.ts`；新增 `memory-context/default-entry-adapters.test.ts`。
**Interfaces:** 每个入口消费任务 3 的 `openRun`/`MainMemoryRun.call`；H 沿用 `createMainHistory`、`createNativeHistoryProvider` 和 `PresenceCoverage`。子任务以 `session.id`/`session.childRunId` 使用已有 `createTranscriptSink(...)` 和 `HarnessRunStore.create/checkpoint/recordTool/markTerminal`，`closeInterruption({reason:"user_cancel",runSession})` 等实际操作结算。
- [ ] RED：`every_entry_uses_its_own_trusted_run`、`child_instruction_never_becomes_user_fact`、`missing_snapshot_is_partial_not_empty`、`history_budget_limit_never_repairs_sources`；逐入口 spy 旧 recall/index 调用为零；子任务取消/恢复有完整 call-result、unknown 状态和原权限边界。
- [ ] Run: `npm test -- src/main/memory-context/default-entry-adapters.test.ts src/main/channels/bootstrap.test.ts src/main/scheduler/scheduler-runner.test.ts src/main/orchestrator/persistent-agent-runtime.test.ts`；新接线 FAIL。
- [ ] 入口绑定已有授权读集合、模型档案、父取消与 canonical 轨迹；非交互 prompt 不调用用户事实 coordinator。H 不再因无全部覆盖而暗示没有历史；显式携带 partial/reason，超过当前 32 会话上限保留明确 budget-exhausted 覆盖状态，不悄悄扩大读取范围，缺 snapshot 不补写。
- [ ] GREEN：重跑命令及 `npm test -- src/main/memory-history src/main/memory-sources src/main/proactive`；子会话记忆/恢复由①交付，②仅扩展并行协调，不另建发送/存储路径。
- [ ] Commit：入口文件，`feat: connect scoped memory to all existing run sources`。

### Task 8: 新 M 管理与来源状态界面
**Files:** 新增 `src/main/memory-policy/memory-settings-ipc.ts`、`memory-settings-ipc.test.ts`、`src/shared/memory-panel-contracts.ts`、`src/renderer/settings/memory/smh-panel.ts`、`smh-panel.test.ts`；修改 `src/shared/ipc-channels.ts`、`src/preload/index.ts`、`src/renderer/settings/{index.html,settings.ts,memory/panel.ts}`。
**Interfaces:** 新增 `MemoryPanelAction = {kind:"confirm"|"reject"|"correct"|"forget"; id:string; expectedRevision:number; text?:string}`；Main `applyMemoryPanelAction(event:IpcMainInvokeEvent, action:MemoryPanelAction):Promise<PolicyOutcome>` 与 `getMemoryPanelState(event:IpcMainInvokeEvent):Promise<MemoryPanelState>`。State 明确定义 `facts:FactView[]; candidates:PolicyCandidate[]; coverage:PresenceCoverage; backendStatus:{available:boolean;reason?:string}`，不包含能力/路径/密钥。
- [ ] RED：确认候选、纠正、遗忘后重新检索真实变化；`stale_revision_or_foreign_window_rejected`、`double_submit_has_one_effect`；partial/不可用不得渲染成“无历史”。
- [ ] Run: `npm test -- src/main/memory-policy/memory-settings-ipc.test.ts src/renderer/settings/memory/smh-panel.test.ts`；FAIL。
- [ ] Main 验证设置窗口 sender/frame，以独立 settings 用户事件来源持久化明确确认/纠正文本，再调用既有 `policy.event/act`；不信任 Renderer 的 SourceRef/actor。新界面替代 L0/L1 编辑，保留导入文档管理独立入口。候选确认/事实纠正必须引用独立 settings 用户事件，保留 `MEMORY_CONFIRMATION_NOT_INDEPENDENT` 保护；来源详情调用既有 `policy.audit`，另定义只读 provenance DTO。
- [ ] GREEN：重跑命令和 `npm run check:renderer && npm run build:preload`；Commit `feat: connect memory management to verified policy events`。

### Task 9: 旧个人记忆退出，保留混合功能
**Files:** 修改 `src/main/application/default-dependencies.ts`、`settings/settings-ipc.ts`、`memory/memory-user-ipc.ts`、`orchestrator/{index.ts,build-options.ts,agent-runtime.ts,context-builder.ts}`、`orchestrator/tools/{history-tools.ts,registry/tool-registry.ts,registry/tool-registration.ts}`、`src/main/rag/index.ts`；新增 `src/main/memory-context/legacy-retirement.test.ts`。
**Interfaces:** 保留 `buildAlwaysOnContext(userInput,recentMessages):Promise<string>` 的世界书职责及 `buildMemoryInjection(userInput):Promise<string>` 的 imported_doc 职责；拆分 `onAgentRunFinished` 的个人记忆维护与表情/心情副作用。旧工具与 IPC 返回新增稳定码 `MEMORY_LEGACY_RETIRED`，不读写旧个人数据。
- [ ] RED：`ordinary_startup_never_calls_legacy_personal_memory` 遍历所有入口；旧 PMRS/L0/L1/L2、user_memory/chat_history、recall_history、RAG reconciliation、Vault watcher 调用/写入均零；worldbook/imported_doc/Work 知识/sticker/mood/ASR/音频仍可用。
- [ ] Run: `npm test -- src/main/memory-context/legacy-retirement.test.ts src/main/orchestrator/build-options.test.ts src/main/orchestrator/build-memory-injection.test.ts`；FAIL。
- [ ] 取消启动和设置变化的旧 reconciliation、工具注册、自动维护与 Vault 回流；拆分 RAG 初始化中个人索引的加载/协调，保留文档/世界书索引。逐项清理 `entityGraph`/L2 DMAE 个人事实注入，界定关系/社交抽取是否仍写旧个人事实，不能保留旁路。删除 controlled 分支“整段完成回调跳过”；禁用旧 UI 控件，不删旧原文件/整个 RAG 目录。
- [ ] GREEN：重跑命令及 `npm test -- src/main/application src/main/rag src/main/proactive src/main/channels src/main/asr src/main/audio`；Commit `refactor: retire legacy personal memory without removing document features`。

### Task 10: 普通装配、依赖状态与打包
**Files:** 修改 `src/main/application/default-dependencies.ts`、`src/main/memory-context/desktop-memory-backend.ts`、`package.json`、`electron-builder.yml`；新增 `scripts/build/history-helpers.mjs`、`scripts/verify/history-helpers.mjs`、`src/main/memory-context/default-startup.test.ts`，扩充 `scripts/packaging/electron-builder-config.test.mjs`。
**Interfaces:** 普通 `createDefaultApplicationDependencies()` 始终创建任务 3 owner，注册 quiesce/close；history read/presence helper 使用现有 `native/Cargo.toml` 的 `history-read` feature；依赖不可用状态通过任务 8 DTO 返回。
- [ ] RED：无诊断 flag、两个保存模型档案、helper/密钥保护/本地模型逐一缺失，明确状态且原文件哈希不变；`close_waits_for_owned_operations`；安装清单缺任一需要的 helper 应失败。
- [ ] Run: `npm test -- src/main/memory-context/default-startup.test.ts && node --test scripts/packaging/electron-builder-config.test.mjs`；新装配 FAIL。
- [ ] 拆开存储资源与每档案模型 binding；Windows 构建两 helper，校验资源/本地模型许可与存在性，不自动下载模型、不伪造 native 可用、不在 Linux 使用不安全替代。
- [ ] GREEN：重跑命令；Windows 独立执行 `cargo build --release --locked --manifest-path native/Cargo.toml --features history-read --bin firefly-history-read --bin firefly-history-presence`、`npm run package:win:dir`、`npm run verify:installer`，记录真实工件路径/哈希；无环境则保留未执行状态。
- [ ] Commit：装配/打包文件，`feat: enable default memory with verified resource readiness`。

### Task 11: 独立验收与用户 API 交接
**Files:** 新增 `src/main/memory-context/default-smh.acceptance.test.ts`、`docs/architecture/default-smh-acceptance.md`；扩充 `scripts/testing/archive-reporter.mjs`、`scripts/testing/archive-reporter.test.mjs`，必要时在任务 8 设置页提供沿用现有档案的显式测试入口。
**Interfaces:** 报告每个 case 的名称、源码条件、环境、结果/原因及代码 revision；保持 reporter 不猜 skip 原因，源码条件由测试显式注记；分别列 DPAPI、native helper、8.3 短路径、symlink 四类 Windows 项，缺项也写“未执行”，不合并成一个 Windows skip。
- [ ] RED：普通启动执行 Chat/Work/Code/渠道/定时/子任务/主动入口、正向附件、多轮/重试/摘要/M 管理和任务 5 四项负向断言；mock 各传输 HTTP 成功、鉴权失败、429、超时、超限与不支持，错误不回退旧链。
- [ ] Run: `npm test -- src/main/memory-context/default-smh.acceptance.test.ts`；新增产品验收先 FAIL，再仅修实际集成缺口至 PASS。
- [ ] 完整自动验证：`npm test`；`npm run check:renderer`；`npm run build`；`npm run check:storage-boundary`；`node --test scripts/testing/*.test.mjs scripts/packaging/electron-builder-config.test.mjs`。保存原始输出和 archive JSON；任何失败单列修复，不把 skip 变成功。
- [ ] Windows 专项在可用 Windows 环境按现有 `FF_HISTORY_HELPER`/`FF_HISTORY_RELEASE_HELPER` fixture 要求执行 `npm run test:memory-history-zero-write`，归档原生证据；不改变 DPAPI/8.3/符号链接系统设置来取得绿色。Linux 合成测试不能替代。
- [ ] 用户交接文档提供自选档案/地址/模型/已有凭证的手动测试步骤、预算模式和错误字段、预期成功/拒绝结果；不把密钥写报告，不自动发付费请求，不声称账户已验证。
- [ ] Commit：验收/报告文件，`test: verify independent default SMH delivery`；报告分别写代码实现、自动测试、整合、Windows 发布验证与用户真实 API 验证状态，再交付①评审。交付②未实施不能算完成。
