# Firefly V1.1.1 — Compaction Task Facts Design V1

## 文档状态

本文件保留前置审计与设计记录；本轮已按该设计落地当前运行任务事实契约、普通／emergency 投影接入和结构化工具结果裁剪。

- 分支：firefly-v1.1.0
- HEAD：30ac278cdf0f7419510ae575737ab0ee44d1d744
- 版本：1.1.1
- 工作树：存在上一轮及更早轮次的大量已跟踪修改和未跟踪文件，本轮保留。
- 本轮生产源码修改：已完成，详见第 16 节。
- 本轮应用、模型、网络和公网访问：未启动、未请求、未访问。
- 本轮测试：定向测试已运行并通过；最终验证结果见第 16 节。

当前源码和测试是事实来源；历史架构文档只作为背景。当前工作树未发现 AGENTS.md。

## 1. 实施前审计结论摘要（历史基线）

本节记录实施前的源码状态；本轮实施后的有效状态、验证结果和边界以第 16 节为准。

当前实现已经有三类重要的结构保护：

1. AgentRunInput、AgentRunResult 和 AgentToolCallEvidence 能表达一部分当前运行事实。
2. PairedSafeCut 能避免在消息切分时留下孤立的 assistant.toolCalls 或 tool 结果。
3. Checkpoint 能保存一份消息、活动工具调用、恢复次数和 Plan 快照。

但这些保护没有形成一个跨 Harness、ContextManager、Compactor 和 CheckpointManager 的任务事实契约：

- 当前用户原始请求只有 userPrompt 和消息历史两个文字来源，没有独立的不可改写事实记录。
- Main 拥有的 browserRequestTargets 只沿工具执行路径传递，没有进入 ContextProjector 或 Compactor 的结构化输入。
- requiredToolExecution 在 Harness 中参与工具面、纠正轮和最终结果结算，但不进入压缩事实或 Checkpoint。
- toolCallEvidence 只在 Harness 当前 run 的局部数组和最终 AgentRunResult 中存在；Checkpoint 与 AgentEvent 不完整承载它。
- Plan 会进入初始 system prompt 和 Checkpoint，但压缩后的系统消息没有稳定的 Plan 保留契约；emergency compaction 的调用还省略了部分初始上下文参数。
- Compactor 只做消息修剪和通用历史摘要。默认摘要没有任务目标、硬约束、未完成事项或执行证据身份。
- 消息级配对安全不等于结果语义安全。工具调用与结果可以成对保留，但 success、failure、unknown、not_called 等当前运行语义没有被压缩器认识。

因此，当前不能声称普通压缩或 emergency compaction 已可靠保留当前任务事实。

## 2. 实施前实际生产调用图（历史定位）

### 2.1 普通用户 Chat 到 Provider

实际主链为：

1. Main Chat IPC 在 E:/Codex/working/Firefly-Pet/src/main/chat/chat-ipc.ts:65-76 读取 Main 拥有的 ChatHistoryStore，种子历史只在当前进程历史为空时使用，然后追加当前用户消息。
2. 同文件 :78-82 继续执行既有普通 Chat Memory 提取和写入；这不是压缩任务事实，也不是 Browser 读取结果写入。
3. 同文件 :139-150 由当前用户消息提取 browserRequestTargets，解析 BrowserReadIntent，并在单一目标时创建 AgentRequiredToolExecution。
4. 同文件 :151-163 调用唯一 AgentCore，传入 userPrompt、effectiveHistory、browserRequestTargets、MAIN 执行配置和可能的 requiredToolExecution。
5. FireflyAgentCore 将调用交给 FireflyHarness；组合和委派边界仍由现有 AgentCore/Harness 所有者负责。
6. E:/Codex/working/Firefly-Pet/src/main/orchestrator/harness/firefly-harness.ts:365-386 评估并创建可选 Plan。Plan 通过 formatPlanContext 形成初始 planContext。
7. 同文件 :394-410 通过 ContextManager 构建初始消息。普通 Main 运行使用 buildInitialMessagesWithSlots，Worker 运行使用 project。
8. ContextManager 在 E:/Codex/working/Firefly-Pet/src/main/orchestrator/context/context-manager.ts:149-180 执行已注册 slot，再把结果交给唯一 ContextProjector。
9. ContextProjector 在 E:/Codex/working/Firefly-Pet/src/main/orchestrator/context/context-projector.ts:60-160 组装 system message、历史、角色／Memory／RAG／工具信息并计算预算；:164-176 选择 normal、soft、hard 或 emergency 投影。
10. Harness 在 :536-558 用 AgentSession 当前消息向 Provider 发请求；工具 Schema 只在当前工具面允许时传递。
11. Provider 返回工具调用时，Harness 将 assistant 工具调用和对应 tool 结果写回 AgentSession，并由 ToolExecutionEngine 负责真正的工具授权、执行、取消、超时和结果策略。
12. 工具观察在 firefly-harness.ts:799-857 形成 AgentToolCallEvidence、更新 ActiveToolCallState、发出 agent:tool-result，并追加 role=tool 消息。
13. 没有工具调用且满足现有完成路径时，Harness 在 :925-1006 结算 completed；预算耗尽路径在 :1010-1045 结算非成功状态。
14. Harness 最终在 :1088-1170 写入终态 Checkpoint、构造 AgentRunResult，并发出 agent:finished。
15. Chat IPC 在 chat-ipc.ts:203-219 只用当前 AgentRunResult 的 Browser 证据解析本次 Browser 可见结果；Browser 历史结果不会成为当前运行证据。

### 2.2 正常压缩与 emergency compaction（实施前状态）

当前生产 Harness 中可确认的正常自动压缩主要发生在初始上下文投影：

- buildInitialMessagesWithSlots → ContextManager.projectWithSlots → ContextProjector.project → ContextCompactor.compact。
- firefly-harness.ts 的主循环没有发现“每个工具轮次结束后自动重新 normal compact”的独立生产路径；工具轮次通常继续使用 AgentSession。

Provider 返回上下文超限时，Harness 在 firefly-harness.ts:565-637 走 RecoveryManager，再调用 ContextManager.project，并强制 forceCompactionStrategy="emergency"。之后 Harness 清空 AgentSession，将压缩后的 messages 重新写回。

因此必须区分两个事实：

- ContextCompactor 本身只对传入的投影数组返回新数组，并不修改 AgentSession；其实现注释和 compactor.ts:32-40 明确了这一点。
- emergency 路径由 Harness 在 firefly-harness.ts:622-625 主动 clear 和 append，因此 emergency 结果会替代当前 Session 的可见模型输入。

当前没有一个专门的“任务事实保留层”位于这两条路径之上。

## 3. 实施前契约事实与保留矩阵（历史记录）

| 事实 | 当前所有者和源码 | 当前是否进入模型上下文 | 当前压缩后是否有独立保留保证 |
|---|---|---|---|
| 当前用户原始请求 | AgentRunInput.userPrompt，src/shared/agent-types.ts:98-115；Main 入口来自 chat-ipc.ts:151-154 | 作为当前 user ChatMessage 进入 ContextProjector；system prompt 也会引用它 | 否。ContextProjector 会在历史末尾不是同一 userPrompt 时追加当前消息（context-projector.ts:120-132），但 Compactor 没有“当前请求必须保留”的事实规则 |
| 用户明确硬约束 | 目前通常只存在 userPrompt 文字中；没有独立字段或解析契约 | 原文在 user message 中；除已有 Main 专用结构外没有额外结构化投影 | 否。不能把摘要中的普通文字当作完整、不可改写的硬约束 |
| Main 当前 Browser URL 集合 | chat-ipc.ts:139-150 调用 browser-user-targets.ts:158-191；AgentRunInput.browserRequestTargets 由 src/shared/agent-types.ts:110-111 定义 | 传给 ToolExecutionEngine/ToolContext 和 Browser 工具；不是 ContextProjector 的选项，也不是稳定 system fact | 否。Compactor 只看到消息文字；压缩后的摘要不能证明集合仍完整、精确或未扩大 |
| required-tool 约束 | AgentRequiredToolExecution，agent-types.ts:37-47；Harness 用于工具 Schema、toolChoice、纠正轮和最终 resolve | 部分通过工具 Schema、toolChoice 和纠正消息进入模型；原始结构不作为通用 task fact 进入 | 否。AgentRunResult.requiredToolExecution 在最终结算存在，但 Checkpoint/Compactor 没有它的结构化副本 |
| 当前工具调用身份 | AgentSession 中 assistant.toolCalls 与 role=tool 的 toolCallId；AgentToolCallEvidence 在 Harness 局部数组 | 成对消息进入后续 Provider 请求 | 只有消息级配对保证。PairedSafeCut 保护切点，但不保留完整的结果语义或 runId 事实 |
| 工具结果状态 | AgentToolCallEvidence.outcome 是 success、failure、unknown、not_executed（agent-types.ts:49-59） | 当前轮的 role=tool 文本进入模型；Harness 的 roundObservation 也给 Planning | 否。agent:tool-result 事件只有 output/isError（agent-types.ts:156-165）；Checkpoint 不保存 toolCallEvidence |
| required-tool 最终状态 | AgentRequiredToolExecutionResult，agent-types.ts:61-72 | 最终回答可以依据它修正文本；不是独立的初始上下文事实 | 仅在 AgentRunResult 中保留，压缩中不保留；not_called、unknown 与历史成功的区分不能依赖摘要 |
| Browser 外部不可信结果 | browser-tool.ts 的成功 JSON 含 sourceUrl、finalUrl、标题、正文、截断和 untrustedContent；进入 role=tool | 以工具结果消息进入模型 | 只有原始 JSON 文本和 toolCallId 的弱保护。ToolResultPruner 对 raw content 修剪，不能保证修剪后仍是可解析结构，也没有独立保护 untrustedContent 语义 |
| Plan 目标和步骤 | BoundedPlanner 与 Plan 类型，src/main/orchestrator/planning/plan-types.ts:28-49；Harness 在 firefly-harness.ts:365-407 使用 | 初始 planContext 追加到 system prompt；工具轮后 Plan 状态在 Harness 内更新 | 部分。Plan 进入 RunExecutionState 和 Checkpoint，但没有稳定 task-facts 消息；emergency 调用未传 planContext，后续模型输入可能缺失计划上下文 |
| Plan 步骤验证 | StepVerifier，src/main/orchestrator/planning/step-verifier.ts:3-37；非空 observation 且无简单错误标记即可 success | 通过 planContext、事件和后续消息间接可见 | 否。Plan completed 是模型编排状态，不是用户任务完成证明；摘要不能把它提升为权威完成事实 |
| Memory/RAG 上下文 | ContextManager 插槽，src/main/orchestrator/context/context-manager.ts:50-61、:149-168；MemorySlot/RagSlot 使用 userPrompt 查询 | 普通 Chat 初始投影可以进入 system prompt；proactive 会被清空 | 无任务事实保留。完整 Memory/RAG 不应复制进任务事实；其自身所有者仍负责提供/不提供上下文。emergency 参数缺失还可能使这类上下文不再生成 |
| 角色和语义状态 | CharacterPolicyEngine、SystemPromptBuilder、ContextProjector:62-81、:138-146 | system prompt 和状态字符串进入模型 | 不是本轮任务事实；不应被压缩摘要替代或当作用户约束 |
| 运行状态和恢复次数 | RunExecutionState，src/main/orchestrator/recovery/execution-state.ts:48-60；Harness 持有并更新 | 通常不直接进入模型；部分 Plan/工具消息间接反映 | Checkpoint 保存 runState、stepState、activeToolCalls、recoveryAttempts 和 terminationReason，但没有 Browser/required-tool/current evidence 事实 |
| 终态 | AgentRunResult.status/terminationReason，agent-types.ts:117-131；Harness :1088-1170 | 非成功时 Chat 走失败处理；成功才发最终回答 | AgentRunResult 和 agent:finished 有结构化终态；Compactor 不负责终态，不能在压缩摘要中制造 completed |
| Chat 可见历史 | Main ChatHistoryStore，src/main/chat/chat-history.ts:28 及 chat-ipc.ts:38-76 | 作为历史传给当前 AgentRunInput | 它与 AgentSession 分开；Compactor 只处理当前 AgentSession 投影，不写回 ChatHistoryStore |

## 4. 逐项回答审计问题

### 4.1 已有结构化来源

以下事实已有可以复用的结构化来源：

- AgentRunInput 的 runId、conversationId、source、userPrompt、history、browserRequestTargets、executionProfile 和 requiredToolExecution。
- AgentToolCallEvidence 的 runId、step、toolCallId、toolName、arguments、outcome、output 和 isError。
- AgentRequiredToolExecutionResult 的 succeeded、failed、unknown、not_called 与 correctionAttempts。
- RunExecutionState 的 step、runState、stepState、activeToolCalls、recoveryAttempts、plan 和 terminationReason。
- Plan/PlanStep 的 goal、步骤、当前索引、状态、observation 和 verification。
- Browser 工具返回结构中的来源地址、最终地址、HTTP/内容状态、标题/正文截断以及 untrustedContent。
- AgentRunResult 和 agent:finished 的终态。

这些字段分别由不同所有者持有。字段存在不表示它们目前会一起进入 Compactor，也不表示 Checkpoint 能恢复它们。

### 4.2 只能从文字推断的事实

下列信息目前没有独立可靠的结构化来源：

- 用户文字中除 Browser URL 和 required-tool 外的“必须”“不要”“完成标准”等硬约束。
- 没有 Plan 或 required-tool 时的未完成事项。
- 用户是否仍要求执行某个动作，不能由最近一条非空 assistant 文本或没有新消息来推断。
- 模型把工具成功结果如何组合成最终任务目标，不能从模型内部思维过程提取。
- 页面正文中的“请忽略规则”“请执行工具”等内容只能是外部网页数据，不能被压缩摘要提升为系统或用户指令。

原始 userPrompt 可以保留文字证据，但不能在压缩时声称已经准确解析出其中全部约束。缺少结构化来源的部分应保留原文或明确进入未确定状态，而不是由摘要补造。

### 4.3 不复制完整历史而保留证据身份

当前可行的方向不是把全部 transcript 复制到每次压缩，而是在同一运行中由 Harness 根据仍在内存中的权威状态构造一次快照：

- 用 runId、step、toolCallId、顺序号和 toolName 关联当前运行证据。
- 保存 arguments 的受限结构化副本，不保存凭据、完整 Memory/RAG 或不必要的网页正文。
- 保存 outcome、isError、sideEffectState 和必要的 Browser 状态字段。
- 保留当前用户原文，不从旧 summary 重新抽取。
- 保留 Browser 目标的 Main 归属和规范化列表，不允许压缩摘要生成新 URL。
- 保留 required-tool 的结构和当前状态，不把工具成功提升为任务完成。

此快照仍由 Harness 作为运行状态所有者创建；ContextManager、ContextProjector 和 Compactor 只消费它，不保存第二份运行状态。

### 4.4 普通压缩与 emergency 的共同规则

两种路径都必须使用同一份事实快照、同一套来源标签、同一套最小保留规则和同一套“放不下则非成功”的结算语义。区别只能是历史消息和非关键工具文本的激进程度：

- 普通 soft/hard 保持现有阈值与消息配对策略，但在其结果中物化受保护事实。
- emergency 可以使用现有更小的历史工具输出预算和更少的历史尾部，但不能以 preserveErrors=false 删除当前运行的结构化失败、unknown、取消或未完成事实。
- 两者都不能把失败、unknown、not_called 或外部不可信内容改写为成功。
- 两者都不能把 Plan completed、最后一条 assistant 非空或最后一个工具 success 当作整个任务 completed。

当前实现的差异是事实而非目标：compactor.ts:223-246 的 emergency 将 maxResultChars 设为 1024、retainCount 默认设为 2、preserveErrors 设为 false；普通默认值在 compactor.ts:17-22 和 tool-result-pruner.ts:11-17。当前没有事实层覆盖这些差异。

### 4.5 关键事实超过预算时

如果最低保护集合不能在现有单一 ContextManager/TokenMeter 预算内物化，不能静默退回 generic summary、删除当前约束或继续调用 Provider。

后续实现应：

1. 在 ContextManager/Projector 返回结构化的事实保留失败；
2. 由 Harness 将运行结算为非成功；
3. 不发送正常 agent:final-answer；
4. 不额外请求模型生成收尾；
5. 保留已确定的工具执行事实和失败原因；
6. 不把事实超预算改记为取消、普通 timeout 或模型故障。

错误代码或终止原因需要新增时，必须在实现轮明确新增契约。当前 AgentTerminationReason 只有 completed、cancelled、timeout、error 和 budget_exhausted，不能假装已有专门的 task-facts-over-budget 枚举。

### 4.6 重复压缩的稳定性

当前 hard compaction 每次使用带时间戳的新 system message，并可能把旧 summary 当作 olderMessages 再次摘要（compactor.ts:170-185、:259-262）。这会造成摘要叠加和来源丢失。

设计上应让事实物化具有稳定身份：

- 由 runId 加事实 schema 版本标识一份受保护事实信封；
- 每次新快照按序号替换同一身份，而不是追加第二份；
- 旧生成的 facts envelope 和旧 generic summary 不作为新的权威来源；
- 每次 compaction 都从 Harness 当前权威状态重建，不能从上一次摘要反向抽取；
- 可选的历史摘要只能标记为 history_summary，不能与 authoritative_user 或 current_run_evidence 合并。

上述名称是设计提案，不是当前已有字段。

### 4.7 工具调用和结果配对

PairedSafeCut.findCutIndex 和 validateIntegrity（safe-cut.ts:19-95）已经保护：

- 切点不落在 role=tool；
- 不把携带 toolCalls 的 assistant 放在切点前而把结果留在切点后；
- 不允许孤立 tool message；
- 不允许未解决工具调用后直接插入 user message；
- 不允许最终留下 dangling assistant toolCalls。

这应继续作为所有压缩策略的消息级前提。后续事实层还需要：

- 将一个 assistant tool-call 与其所有结果视为不可拆分组；
- 当前未完成的调用在结构化事实中保存 sideEffectState 和 outcome unknown/not_executed 的区别；
- 如果完整配对和最小事实都放不下，返回非成功，不制造合成成功结果；
- 不以 toolName+arguments 相同为循环或重复执行依据。合法的下一次切歌、重新读取或其他重复操作必须依赖新的 runId、toolCallId、step、任务目标和结果事实分别判断。

### 4.8 生产状态与测试状态的区别

文件存在和单元测试调用不能证明生产传递：

- ContextProjector 和 Compactor 的测试证明消息投影、摘要节点、头尾修剪和配对边界，不证明任务事实保留。
- planning.test.ts:308-434 证明 Plan 可被序列化、ResumeProtocol 可返回 restoredPlan 或插入中断标记，不证明恢复后的 run 继续使用原 Plan，也不证明授权/配置复查。
- browser-chat-routing.test.ts:267-464 和 browser-authorization.test.ts:226-509 证明当前用户目标、required-tool 和当前 AgentRunResult 证据的 Browser 路由，不证明压缩后的目标集合仍存在。
- harness.test.ts:290-313、:624-697 覆盖 canonical ContextManager、初次 emergency compaction 和恢复预算，不覆盖任务目标、Browser 目标、required-tool 或证据的语义保留。

## 5. [设计提案] 任务事实契约

建议新增共享契约文件：

E:/Codex/working/Firefly-Pet/src/shared/compaction-task-facts.ts

建议新增类型名：

[设计提案] CompactionTaskFactsV1

它是一次运行的不可变投影快照，不是第二个运行时状态所有者。建议最小分区如下：

    schemaVersion
    runId
    source
    authoritativeUser
    trustedExecutionConstraints
    currentRunEvidence
    unfinishedWork
    modelPlan
    untrustedObservations

字段语义：

- authoritativeUser：保存当前用户原始 userPrompt 原文及其 Main 归属；不得把摘要改写的目标当原文。
- trustedExecutionConstraints：保存已有 AgentRequiredToolExecution 的受限副本、Main 解析出的 browserRequestTargets 和其他当前调用必需的结构化约束。它不包含权限票据、代理密码或授权秘密。
- currentRunEvidence：保存当前 run 的 AgentToolCallEvidence 受限副本、runId/step/toolCallId/toolName、outcome、isError 和必要状态元数据。Browser 只保存来源、最终地址、状态、标题/正文截断和 untrusted 标记等有界字段，不默认复制完整正文。
- unfinishedWork：只保存有结构化所有者的活动工具调用、required-tool 尚未满足状态和当前 Plan 步骤。没有结构化来源时标记未知，不由“没有回复”推导。
- modelPlan：如果保留 Plan，必须显式标记 model_plan，不得并入 authoritativeUser，不得成为权限或目标授权。
- untrustedObservations：对 Browser 正文和外部工具观察保留不可信来源标签；不得生成 Memory、RAG 或偏好写入。

建议通过 ContextProjectionOptions 增加内部字段：

[设计提案] taskFacts?: CompactionTaskFactsV1

这不是 AgentRunInput 的新公开用户字段。Harness 应从已有 AgentRunInput、RunExecutionState、requiredToolExecution 和当前 toolCallEvidence 构造快照，再交给 ContextManager/Projector。ContextManager 仍是唯一上下文入口，Compactor 不自行读取 Main、Memory、权限或 Browser 服务。

## 6. [设计提案] 物化、优先级与失败语义

### 6.1 稳定物化

建议由 Projector 物化一条具有稳定标识的 system message，例如：

[设计提案] task-facts-[runId]

该标识只表示当前运行任务事实信封，不应依赖时间戳。新快照替换旧信封；不追加重复副本。消息内容分开标注：

- authoritative user facts；
- trusted execution constraints；
- current run evidence；
- unfinished work；
- model plan；
- untrusted external observations。

具体消息格式是实现契约的一部分，不能让模型自行重建 JSON，也不能把完整网页正文嵌入受保护区。

### 6.2 单一预算中的优先级

仍使用现有 ContextManager、TokenMeter 和 ContextBudget，不新增第二套 token 预算。逻辑优先级建议为：

1. system/security boundary 与当前用户原文；
2. 当前 active required-tool 约束和未完成调用状态；
3. 当前 Browser 目标集合、精确匹配事实和 untrusted 标记；
4. 当前 Plan 步骤及其未完成状态，明确标为 model_plan；
5. 当前运行工具结果的有界状态字段；
6. 最近普通对话；
7. 较旧历史摘要和可丢弃的低优先级工具正文。

这是保留顺序设计，不是新增产品比例或数值参数。关键事实仍须通过 TokenMeter 估算；如果最小集合放不下，进入结构化非成功出口。

### 6.3 结果和完成条件

CompactionTaskFactsV1 只能帮助后续轮次理解任务事实，不能授予权限或直接决定 completed。最终 completed 仍由 Harness 的明确完成路径决定：

- AgentRunResult.requiredToolExecution 的 succeeded 只证明对应 required-tool 操作；
- Plan.status=completed 只证明现有 Planner 的步骤状态；
- Browser 读取成功必须仍由当前 run 的工具证据和 Browser 结果契约证明；
- failure、unknown、not_called、cancelled、timeout 和提交未知保持各自语义；
- 压缩不改变 AgentRunResult、AgentEvent 或 Checkpoint 的终态。

## 7. 普通压缩与 emergency 的实现边界

下一轮实现时应优先扩展现有 ContextManager、ContextProjector、ContextCompactor 和 Harness 的参数传递，不新建 CompactionService 或第二个事实仓库。

建议调用关系：

1. Harness 在创建/更新当前运行证据后生成一次 CompactionTaskFactsV1 快照。
2. ContextManager 接收快照并将其传给 ContextProjector。
3. ContextProjector 在 normal、soft、hard、emergency 四条入口使用相同事实物化函数。
4. ContextCompactor 只对低优先级历史和非受保护工具文本执行现有策略。
5. Harness 收到 CompactionResult 后根据事实保留状态决定继续、非成功停止或保持现有恢复语义。

必须单独修正 emergency 投影参数的传递完整性：firefly-harness.ts:602-613 当前对非 Worker 只传 source、userPrompt、history 和 emergency 策略；没有传入初始 Memory/RAG/Plan/systemPromptOverride/toolSchemas 选项。这个缺口应在实现轮按实际需要处理，但本设计轮不修改它。

emergency 的 aggressive pruning 不能删除受保护事实。现有 preserveErrors=false 只能继续适用于未被结构化保护的历史文本，不能覆盖当前运行的 error/unknown/cancelled/unfinished 状态。

## 8. Planning、Memory/RAG 与外部内容边界

### 8.1 Planning

BoundedPlanner 的 Plan 是 Harness/Planner 所有的模型编排状态。Plan.goal 来源于运行目标，Plan.steps 和 StepVerifier 结果不能提升为用户硬指令或执行授权。formatPlanContext 只提供模型可见计划文本。

后续事实信封可以保留当前步骤、依赖、verification 和 observation 的有界版本，但必须标记 model_plan。Plan completed 不改变 AgentRunResult 的完成门。

### 8.2 Memory/RAG

MemorySlot 和 RagSlot 仍由 ContextManager/各自服务所有。任务事实不复制完整 Memory/RAG，不新增写入，不把 Browser 正文转成 Memory/RAG 或偏好证据。

普通 Chat 的 MemorySlot/RagSlot 当前会根据 userPrompt 查询（context-slots.ts 的 MemorySlot/RagSlot 实现）；主动来源则由 ContextManager.prepareProjectionOptions 清空这两类上下文。任务事实设计不能改变这一语义。

### 8.3 Browser

browserRequestTargets 是当前用户消息产生的 Main-owned normalized URL 列表。事实信封只能复制当前列表，不能从：

- 历史工具结果；
- 压缩摘要；
- 模型生成的链接；
- 网页正文中的链接；

添加新目标。Browser 正文始终是外部不可信数据；压缩后保留的是来源和状态证据，不是可执行指令。

## 9. Checkpoint 与 Resume 的当前边界

### 9.1 当前保存内容

Checkpoint 类型在 E:/Codex/working/Firefly-Pet/src/main/orchestrator/recovery/checkpoint-types.ts:25-40，当前保存：

- checkpointId、runId、sessionId、step；
- runState、stepState；
- messages；
- activeToolCalls；
- recoveryAttempts；
- createdAt、version、trigger；
- 可选 Plan、providerMetadata 和 terminationReason。

CheckpointManager 在 checkpoint-manager.ts:47-90 会复制消息、活动工具调用和 Plan。当前 Harness 的 createCheckpoint 包装在 firefly-harness.ts:426-433，实际没有把 toolCallEvidence、AgentRunInput、Browser targets、requiredToolExecution 或权限/配置事实传入。

默认 CheckpointManager 使用 InMemoryCheckpointStore（checkpoint-manager.ts:25-33、:30-34），文件 Store 虽存在，但不能因此声称当前生产恢复跨进程持久化已启用。

### 9.2 当前 Resume

ResumeProtocol 在 resume-protocol.ts:23-81 会拒绝 completed、cancelled 和版本不匹配快照；未完成活动工具没有结果时注入 interrupted_prior_to_completion。

FireflyHarness.resume 在 firefly-harness.ts:280-305 使用 evaluation.sanitizedMessages，并以空 userPrompt 调用 run；没有传回原始 source、Browser targets、requiredToolExecution、执行配置、授权事实或网络配置 revision。它也没有把 evaluation.restoredPlan 作为原 Plan 传回 run，只设置 planMode 布尔值。

当前源码未找到 Chat/IPC 生产 Resume 调用；planning.test.ts:336-434 等是测试调用。文件存在和测试通过不能证明生产恢复已接入。

### 9.3 本轮设计范围

本轮设计不修改 Resume、权限、Browser 执行或 Checkpoint schema。第一批实现应先覆盖“当前运行发生 normal/emergency compaction”这条链。

后续若要让 Resume 使用任务事实，需另立实现契约：

[设计提案] Checkpoint.taskFacts 或 Checkpoint.taskFactsSnapshot

这将要求：

- 提升 CHECKPOINT_SCHEMA_VERSION；
- CheckpointManager 深拷贝和脱敏任务事实；
- ResumeProtocol 恢复任务事实并校验来源；
- Harness.resume 恢复原始用户身份和结构化要求；
- 重新校验当前权限、Sandbox、Browser 配置 revision、允许 URL 和一次性授权；
- 对 unknown/started/提交未知工具禁止自动重放；
- 明确旧版本 Checkpoint 是拒绝恢复、还是只允许非执行性查看。

在这些契约没有实现以前，不能把压缩后的消息当作足以安全恢复旧任务的授权依据。

## 10. 预算和配置来源分裂

当前发现的相关配置及来源如下，均为现有事实：

| 配置 | 当前来源 | 实际影响 |
|---|---|---|
| AgentConfig.compactionThreshold=0.7 | src/shared/agent-types.ts:74-96 | Agent 配置字段存在；本审计没有找到它被统一传入 ContextManager 的证据 |
| AgentConfig.compactionRetainCount=4 | src/shared/agent-types.ts:74-96 | 字段存在；Compactor 实际保留值来自 ContextManager 的 CompactorOptions/默认值 |
| ContextBudgetConfig.compactionThreshold=0.75 | src/main/orchestrator/context/context-budget.ts:1-16、:46-69 | ContextProjector 的 pressure 计算使用 ContextManager 持有的 ContextBudgetConfig |
| Compactor softThreshold=0.7、hardThreshold=0.85、retainCount=4、emergencyRetainCount=2 | src/main/orchestrator/compaction/compactor.ts:8-22 | compactor.compact、hardCompact 和 emergencyCompact 的默认选择/保留边界 |
| ToolResultPolicy maxResultChars=8192 | src/main/orchestrator/tools/execution/tool-result-policy.ts:4-36 | 工具执行结果在 Harness 看到之前可能先被执行层修剪 |
| ToolResultPruner maxResultChars=4096 | src/main/orchestrator/compaction/tool-result-pruner.ts:3-17 | Context 压缩阶段再次修剪 tool message |
| emergency maxResultChars=1024、preserveErrors=false | src/main/orchestrator/compaction/compactor.ts:223-246 | emergency 对未保护的历史工具文本更激进，且当前不能保证结构化错误保留 |
| maxRecoveryAttempts=3、maxOverflowRetries=1、maxProviderRetries=3、maxResumeAttempts=2、initialBackoffMs=500 | src/main/orchestrator/recovery/recovery-manager.ts:8-20、:59-113 | Recovery 预算和退避；long-task-reliability-audit-v1.md 已记录 maxProviderRetries/maxResumeAttempts 当前没有消费位置 |

具体影响：

- 初始 ContextProjector 的 pressure 门和 Compactor 的策略门来自不同配置对象，可能在不同入口产生不同压缩时机。
- ToolResultPolicy 可能先于 ContextCompactor 改变结果文本，事实层若只从压缩后的文字重建会丢失原始状态。
- emergency 的 1024 字符和 preserveErrors=false 不能作为当前运行证据的保护方案。
- AgentConfig 中存在的值不能自动视作生产生效值；本轮只记录分裂，不调整数值或归并所有者。

## 11. 现有测试证据与后续测试计划

### 11.1 已有测试

本轮不运行测试。当前源码中可确认的已有测试位置：

- E:/Codex/working/Firefly-Pet/tools/test/core/compaction.test.ts：工具结果头尾修剪、配对安全切点、soft/hard/emergency 结构、投影不修改输入和压力触发。
- E:/Codex/working/Firefly-Pet/tools/test/core/context.test.ts：TokenMeter、ContextBudget、ContextProjector 和 ContextManager facade。
- E:/Codex/working/Firefly-Pet/tools/test/core/harness.test.ts：工具结果进入下一轮、消息配对、canonical ContextManager、Checkpoint 边界、Plan 路径、emergency recovery。
- E:/Codex/working/Firefly-Pet/tools/test/core/planning.test.ts：Plan Checkpoint 序列化、ResumeProtocol 的 Plan/中断工具消息行为和轮次终止。
- E:/Codex/working/Firefly-Pet/tools/test/core/recovery.test.ts：Checkpoint Store、版本、取消、恢复判断和 RecoveryManager。
- E:/Codex/working/Firefly-Pet/tools/test/runtime/browser-chat-routing.test.ts：当前用户 URL、Browser required-tool 和当前运行证据。
- E:/Codex/working/Firefly-Pet/tools/test/runtime/browser-authorization.test.ts：Browser 目标与授权边界。

这些测试没有覆盖“压缩后任务事实仍可用”的语义，不应标为本设计已通过。

### 11.2 [设计提案] 后续定向测试

建议新增：

[设计提案] E:/Codex/working/Firefly-Pet/tools/test/core/compaction-task-facts.test.ts

并扩展真实 Harness/ContextManager 测试，覆盖：

1. 多轮工具后当前 userPrompt 原文、required-tool 和 Browser targets 仍在下一次 Provider 输入中。
2. 当前 run 的 success、failure、unknown、not_called、cancelled、timeout 各自保持状态。
3. 历史成功不能替代当前未调用、拒绝、404、超时或取消。
4. Browser 目标集合只来自当前用户消息；不同路径、查询、协议或模型/网页新增链接不能进入授权事实。
5. Browser 恶意正文保留 untrusted 标记，不能生成新的工具调用、权限或 Memory/RAG 写入。
6. assistant toolCalls 与 role=tool 结果在 normal/emergency 两条路径都保持成对，不能出现孤立消息。
7. 同一合法操作重复发生时不因参数相同而误报循环；不同 toolCallId/step 的证据分别保留。
8. 连续两次压缩替换同一事实信封，不重复注入，不以旧摘要作为权威来源。
9. emergency 不丢失当前运行的 failure、unknown、取消和未完成状态。
10. 最小事实放不下时返回结构化非成功，不调用 Provider 生成“完成”收尾。
11. Plan completed 不被提升为任务完成；required-tool success 只证明对应操作。
12. 当前生产 Browser、Worker、主动无工具、四档权限和授权链没有因事实投影获得额外能力。

Resume、权限复查和 Checkpoint 任务事实属于后续轮，应在独立契约完成后单独测试，不在本轮把测试替身结果写成生产恢复通过。

## 12. 严重程度排序的缺口

### 高

1. 当前运行的 Browser targets、required-tool 和 toolCallEvidence 没有进入统一压缩事实；压缩后无法独立证明目标、要求和结果仍与当前 run 绑定。
2. emergency compaction 对非 Worker 调用遗漏初始上下文参数，可能丢失 Plan、Memory/RAG 和相关系统提示输入。
3. ToolResultPruner 对 JSON 结果按原文本修剪；结果结构和外部不可信标记可能在模型输入中变得不可解析。
4. 当前没有“必要任务事实放不下即非成功”的出口，generic summary 可能替代真实目标/约束。

### 中

5. agent:tool-result 事件不包含 AgentToolCallEvidence.outcome，事件消费者不能单独区分 failure、unknown 和 not_executed。
6. Checkpoint 没有原始 AgentRunInput、Browser targets、required-tool、授权/配置 revision 或当前运行证据；Resume 也没有复查这些事实。
7. Plan context 只在初始 system prompt 形成；Plan 的后续状态和压缩后的模型可见状态没有稳定物化。
8. 带时间戳的 generic summary 会在重复压缩时产生摘要叠加、来源丢失。

### 低但需要记录

9. AgentConfig、ContextBudgetConfig、CompactorOptions 和两个工具结果裁剪层的阈值来源分裂，尚未统一。
10. 当前生产没有发现 Chat/IPC Resume 调用，但公共 resume API 和测试容易被误解为已经提供生产恢复能力。

## 13. 最小首批实现范围与依赖

### 第一阶段：当前运行压缩事实

解决：

- Harness 在当前 run 内形成不可变任务事实快照；
- ContextManager/ContextProjector 接收并物化快照；
- normal/soft/hard/emergency 共用保护规则；
- 保持工具调用／结果配对；
- 事实超预算进入非成功出口；
- 不改变模型参数、权限、Browser 后端、Memory/RAG 写入、Resume 或主动行为。

主要接入点：

- [设计提案] src/shared/compaction-task-facts.ts；
- src/main/orchestrator/harness/firefly-harness.ts；
- src/main/orchestrator/context/context-projector.ts；
- 必要时 src/main/orchestrator/context/context-manager.ts；
- src/main/orchestrator/compaction/compactor.ts；
- src/main/orchestrator/compaction/tool-result-pruner.ts；
- 与现有 AgentRunResult/AgentEvent 一致性所需的共享类型。

验收条件：

- 真实 Harness 初始投影与 Provider overflow emergency 都能看到同一来源分区的事实；
- 目标、required-tool、证据身份和结果状态不由摘要重建；
- 压缩重复执行不重复注入；
- 放不下时不调用 Provider、不发正常完成事件；
- 现有 Browser/Worker/主动无工具和工具配对回归通过。

不包含：

- Checkpoint/Resume schema；
- 权限、Sandbox、Approval；
- 新 Browser 行为；
- Memory/RAG 模型；
- 新重试、预算或产品策略。

### 第二阶段：恢复事实与授权复查

仅在第一阶段稳定后另行设计：

- Checkpoint.taskFactsSnapshot；
- 原始用户请求、Browser targets、required-tool 和 execution profile 的恢复身份；
- 当前权限、Sandbox、配置 revision、一次性授权和 unknown 副作用复查；
- 版本不兼容和旧快照处理。

这不是本轮批准的实现范围。

## 14. 不确定项和需要补证据的内容

以下不能从当前源码安全确定：

- Provider 是否在外部服务侧另有不可见的上下文裁剪或工具选择策略；当前仓库只能核对传入 request。
- 浏览器公开网页正文在所有传输后端中的完整结构化字段是否都能在统一 facts envelope 中稳定取出；需按当前 Browser 工具结果类型逐项实现。
- 未来是否要把 task facts 放入 AgentEvent；现有 event contract 不足以推导所有消费者需求。
- Checkpoint 在产品环境是否会注入 FileCheckpointStore；当前 FireflyHarness 默认创建 CheckpointManager，源码未显示生产组合根注入文件 Store。
- “任务完成”在没有 required-tool 或 Plan 时的产品级判断仍由现有 Harness 完成路径决定；本设计不新增语义推断。

这些项目需要下一轮依据真实调用方或运行日志补证据，不能通过扩大摘要内容猜测解决。

## 15. 设计阶段停止条件（已由第 16 节实施记录更新）

以下是实施前设计轮的历史状态，不是当前工作树的最终状态：

- 生产代码：未修改。
- 测试：未运行。
- 应用：未启动。
- Provider/模型：未请求。
- Browser/公网：未访问。
- Settings、Memory、RAG、权限、Resume、主动行为：未修改。
- Commit：NONE。
- Push：NONE。
- Publish：NONE。

## 16. 本轮实施记录

### 16.1 新增契约与所有者

- `src/shared/compaction-task-facts.ts` 定义 `CompactionTaskFactsV1`、来源分区、当前运行工具证据、未完成工作、required-tool 状态、Plan 非权威投影、`CompactionTaskFactsStatus` 以及结构化结果超预算错误码。共享文件只定义序列化契约，不拥有运行状态。
- `src/main/orchestrator/compaction/task-facts.ts` 是唯一的 Main 侧事实构造与有界结构化观察投影实现。它先复制调用方输入，再只冻结自己的深层快照；网页结果只保留受限正文预览，并保留 `untrustedContent` 和字段级截断事实。
- `src/main/orchestrator/harness/firefly-harness.ts` 仍是运行事实的唯一所有者。每个非 Worker 运行保存 `CompactionTaskFactsMessageIdentity`，精确关联本运行的 `baseSystemMessageId`、`compaction-task-constraints:${runId}`、可选的 `compaction-task-plan:${runId}` 和 `summaryMessageId`，不通过前缀扫描历史。工具轮次后刷新同一身份集合，不追加重复事实消息；每个真实工具证据同时记录其原始 assistant/tool transcript message id。
- `src/main/orchestrator/agent-session.ts` 的 `replaceMessagesById()` 只替换运行持有的精确 id 集合；历史中同名但未被该运行持有的消息不会被删除。没有新增第二个 Session 或上下文所有者。

### 16.2 普通与 emergency 投影

- `ContextProjectionOptions.taskFacts` 将同一事实快照传入 `ContextProjector`。`ContextProjector` 仅移除由当前 `CompactionTaskFactsMessageIdentity` 指定的旧消息，再插入当前快照；不删除仅因文本或前缀相似的历史。没有事实快照时，兼容的 `planContext` 也以精确 id 的 `assistant` 消息保留，不拼进 system。
- 普通投影和 `forceCompactionStrategy: "emergency"` 都通过同一个 `ContextProjector`、`ContextCompactor` 和保留规则处理。Harness 的 emergency 调用复用本轮已捕获的 `memoryContext`、Plan、system override、工具 Schema 与事实；它不重新执行异步 Memory/RAG slots，也没有单独的 emergency RAG 重新获取路径。可选上下文只有在实际最终 system 消息中被移除后才计为削减，随后按实际消息数组和本次仍会发送的 Schema 重新计算预算。
- 来源按 Provider 合法消息角色保留：`system` 只承载可信运行约束索引；当前用户原文保持 `user`；模型计划是独立且标明非权威的 `assistant`；真实工具调用和结果保持原有 `assistant.toolCalls` 与配对的 `tool` 消息。网页正文、工具错误文本和计划观察不会复制到 system；不创建孤立 `tool` 消息或伪造调用。
- 事实信封中的 `[trusted_execution_constraints]`、`[current_run_evidence]`、`[unfinished_work]`、`[model_plan_non_authoritative]` 与 `[untrusted_external_observations]` 仅表达来源和执行状态，不把计划提升为用户指令，也不授予权限。Worker 不注入该信封，主动运行继续由 `toolSurface: none` 约束。
- 当前用户消息、计划消息以及带有精确 transcript id 的当前运行工具 assistant/tool 对由 projector 传给 compactor 作为精确受保护 id；重复 emergency 从 Harness 当前状态重建并替换它们。受保护的当前消息不会作为摘要输入，避免摘要再次复制任务事实。历史摘要不作为新的权威事实来源。
- 最小任务事实预算只计算可信约束、当前用户、模型计划和必要的真实 assistant/tool 证据及本次 Schema；在该判断前，ContextProjector 先使用当前 Compactor 对实际投影消息执行一次可安全的结构化工具正文裁剪，随后再以裁剪后的配对消息计算最小事实。完整发送预算则计算最终实际消息数组和实际 Schema。若裁剪后的最小事实仍放不下，投影返回 `taskFactsStatus: "exceeded_budget"`，Harness 返回 `status: "error"` 与错误码 `context_task_facts_exceed_budget`，不调用 Provider；若最小事实能放下但完整投影仍放不下，Harness 使用独立的 `context_input_exceeds_budget` 非成功错误，不误标为任务事实超限。

### 16.3 结构化工具结果

`src/main/orchestrator/compaction/tool-result-pruner.ts` 对超限 JSON 对象先解析。状态、错误代码、执行身份、URL、HTTP 状态、连接证据和 `untrustedContent` 等必要字段完整保留；可选的 message/title/body/bodyPreview 等字段逐字段压缩，并设置对应的 `*Truncated` 标记。自身生成的 `_fireflyResultPruned: true` 是可再次裁剪的内部元数据，不属于业务事实；它不会放宽未知根字段检查，带有新增未知字段的已裁剪结果仍返回明确失败。未识别的根字段或不支持的 JSON 形状不会按白名单静默清空，返回原始可解析文本和明确失败（分别为 `structured_result_unknown_fields_exceed_budget` 或 `structured_result_shape_exceeds_budget`）。`src/main/orchestrator/compaction/task-facts.ts` 对正文与既有 observation preview 统一按 Unicode 码点建立有界预览，并保留原有截断事实。嵌套错误按 JSON 深拷贝保留，必要结构自身超限时返回可解析的明确失败（`structured_result_required_fields_exceed_budget`），不返回只有修剪标记的对象；空的可选字段也会被移除或结算为明确失败，不会让裁剪循环停滞。普通非结构化错误超限时也返回明确失败，不用头尾截断掩盖错误身份；长度计量按 Unicode 码点。`ToolResultPolicy` 在结果进入模型前保持原始结果，Compaction 层负责显式报告无法安全修剪的情况；同一结构化结果可按 `4096 → 1024 → 1024` 重复处理，仍保持可解析和事实字段准确。

### 16.4 Checkpoint 与边界

本轮没有修改 `Checkpoint` 类型、schema、`ResumeProtocol` 或恢复入口。事实消息作为当前 Session 投影消息参与既有快照，但没有建立 `taskFactsSnapshot` 字段，也没有开放 Resume。没有新增 Memory、RAG、权限、Browser、音乐、主动行为或事件总线写入。

### 16.5 验证记录

- `npm run typecheck`：已通过，包含 main、preload、root、tests 和 tools；工具类型检查覆盖 `tsconfig.tools.json` 及 `tsconfig.cli.json`。
- `npm run build`：已通过；现有 Vite 的 Live2D 非 module 提示和大 chunk 提示仍为既有构建提示，不是本轮失败。
- `tools/test/core/compaction.test.ts`：31/31 通过，覆盖来源角色、精确身份、重复 emergency、输入快照复制、无当前所有权时不误删固定兼容计划 ID、两组工具调用中较早 assistant/tool 对的保留、结构化嵌套错误与字段截断、重复 4096→1024→1024 裁剪、已裁剪结果的未知字段失败、未知 JSON 形状的显式失败、既有 observation preview 的截断事实、空可选字段的裁剪终止、受保护消息不进入摘要、最小事实超预算以及实际消息/Schema 预算。
- `tools/test/core/harness.test.ts`：29/29 通过，覆盖真实 Harness→Provider 来源分层、事实刷新、运行中事实增长预算阻断、实际 Schema 重新计量、Provider 前实际预算门、工具正文安全裁剪后继续调用 Provider、必要来源字段超限失败及普通历史超限与最小事实超限的区分；既有上下文压力断言使用本运行精确摘要身份。
- `npm test`：通过；默认测试链实际执行本轮更新后的 `tools/test/core/compaction.test.ts` 29/29、`tools/test/core/harness.test.ts` 28/28，以及 Browser、授权、Worker、Memory/RAG、普通 Chat 和既有回归测试。
- TypeScript Guard：通过；仅保留已批准的第三方/生成运行库 `src/renderer/live2d/live2dcubismcore.min.js`。
- Architecture Guard：通过。
- `git diff --check`：通过；Git 仅报告现有工作树文件的 LF/CRLF 转换警告，没有空白错误。
- 应用、真实模型、公网和 Browser 请求：未启动、未请求、未访问。

本轮不修改 Checkpoint schema、ResumeProtocol 或恢复入口。Compaction 只在当前运行 Session 投影内保存事实，不提供跨进程恢复。后续仍需关注 generic Compaction 摘要本身的业务语义，以及未来若重新开放 Resume 时对权限／配置 revision／一次性授权的重新校验；本轮不提前实现这些事项。
