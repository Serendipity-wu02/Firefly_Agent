# Firefly V1.1.1 — 长任务可靠性只读审计 V1

## 1. 审计边界与实际基线

本文件先记录了只读审计基线，随后记录了依据该审计实施的 Harness 预算终态修复。本轮没有启动应用、请求真实模型或访问公网；没有改变预算数值、Browser 网络行为、Recovery 重试、Compaction、Resume、权限或主动生产者。

| 项目 | 实际值 |
| --- | --- |
| 分支 | `firefly-v1.1.0` |
| HEAD | `30ac278cdf0f7419510ae575737ab0ee44d1d744` |
| 版本 | `1.1.1`（由当前项目文件与既有架构文档确认） |
| 工作树 | 非干净，包含旧养成退役、应用组合根、目录迁移、Browser、TypeScript 测试与架构文档等既有修改；本轮保留全部既有修改，未回退、未覆盖 |
| Browser | 视为已阶段收口；本轮不重做后端、不重复公网验收 |
| 旧养成与自动主动触发 | 当前组合根未恢复旧数值服务和自动主动生产注册 |

当前源码与文档存在历史差异：`docs/architecture/firefly-agent-architecture.md` 仍包含旧的 `src/main/index.ts` 组合根、`CharacterStateManager` 和主动调度图；较新的 `docs/architecture/application-composition-root-v1.md` 与当前源码已经把组合根移到 `src/main/application/`，并明确旧主动生产者未注册。`docs/architecture/runtime-integration-v1.md` 仍写有 Browser 未接入生产图，但当前 `src/main/application/default-dependencies.ts` 已注册 `browser_read`。以下结论以当前源码为事实，旧文档只作为历史记录，不作为已启用功能证据。

## 2. 当前生产调用图

```text
src/main/index.ts
  → FireflyApplication
  → DefaultApplicationRuntime
  → createDefaultApplicationRuntime()
  → FireflyAgentCore
  → FireflyHarness.run()
  → ContextManager / AgentSession
  → IFireflyLlmProvider
  → executeToolRound()
      ├─ HarnessAuthorizationAdapter（已登记的授权路由）
      │   → CapabilityAuthorizationPipeline
      │   → ApprovalService（需要时）
      │   → AuthorizedInvocationBridge
      │   → 同一个 ToolExecutionEngine
      └─ 其他工具直接进入同一个 ToolExecutionEngine
  → 工具结果写回 AgentSession
  → 下一轮 Provider 请求或最终 AgentRunResult
  → chat-ipc.ts 写入可见 Chat 历史
```

准确接入点：

- `src/main/application/default-dependencies.ts:519-541` 创建 Browser/Memory/Music 等服务和工具；`:578-594` 将工具注册到同一个 `globalToolRegistry` 并解析绑定；`:622-736` 组装授权管线、`ToolExecutionEngine`、授权桥和 `FireflyAgentCore`。
- `src/main/orchestrator/firefly-agent-core.ts:50-75` 创建或接收同一组 `ContextManager`、`ToolExecutionEngine`、`CheckpointManager`、`RecoveryManager`、`BoundedPlanner`，并只委托给 `FireflyHarness`。
- `src/main/chat/chat-ipc.ts:68-151` 是普通 Chat 的生产入口；它维护进程内可见历史、构建当前用户请求的 Browser 目标集合，并在 `:151` 调用 `agentCore.run()`。
- `src/main/orchestrator/harness/firefly-harness.ts:178-205` 是唯一 Harness 组装点；`:435` 开始唯一轮次循环；`:624-796` 处理模型消息、工具轮、授权等待、工具结果和 Transcript；`:1004-1049` 结算 checkpoint 与 `AgentRunResult`。
- `src/main/orchestrator/harness/tool-round.ts:220-351` 负责同一模型工具消息的顺序、授权屏障、Worker/主动边界和工具结果聚合；它不创建第二个 Agent Loop。

生产中已连接 Planning、Recovery、Checkpoint 和 Compaction；它们不是只存在于测试的文件。但部分接口只有测试调用或只提供可注入基础设施，见第 7 节。

## 3. 所有权表

| 所有者 | 当前实际职责 | 生产状态 |
| --- | --- | --- |
| `FireflyHarness` (`src/main/orchestrator/harness/firefly-harness.ts`) | 唯一 LLM 轮次、运行 AbortSignal、轮次/工具预算、工具轮衔接、Recovery 调用、Checkpoint 调用、最终状态和最终文本映射 | 生产调用 |
| `FireflyAgentCore` | 稳定的 `IAgentCore` 外观和依赖组合；不执行第二个循环 | 生产调用 |
| `AgentSession` | 当前运行的消息 Transcript；工具结果和助手消息按轮写入 | 生产调用 |
| `ContextManager` / `ContextProjector` | Context Slot、Memory/RAG 投影、Token 预算和 Compaction 投影 | 生产调用 |
| `BoundedPlanner` / `StepVerifier` | 触发有限计划、拆分步骤、用非空且非错误观察推进步骤 | 生产调用；验证语义较弱 |
| `ToolExecutionEngine` | 工具级 allow/deny、超时、每次调用重试、并发计划、结果裁剪和分发 | 生产调用 |
| `executeToolRound` | 对一轮模型工具调用做顺序处理、授权屏障、required-tool 一次提交保护和结果收集 | 生产调用 |
| `RecoveryManager` / `ErrorClassifier` | Provider 异常分类与运行级恢复动作决定 | 生产调用 |
| `CheckpointManager` / `ICheckpointStore` | 按触发点快照运行状态、消息、活动工具和计划 | 生产调用；默认使用内存 Store |
| `ResumeProtocol` | 校验 checkpoint 版本/终态，给中断工具调用注入结构化中断结果 | 由 `FireflyHarness.resume()` 调用；无 Chat IPC 生产调用者 |
| `AgentEventBus` | 运行、轮次、工具、Recovery、计划和 checkpoint 事件 | 生产调用 |
| `ChatHistoryStore` | Main 进程内可见 Chat 历史；不等同 Harness Transcript、Memory 或 checkpoint | 生产调用 |

## 4. 实际预算、重试和停止规则

### 4.1 Harness 与 Context

`src/shared/agent-types.ts:77-87` 的默认 Agent 配置为：

- `maxRounds = 10`；
- `totalTimeoutMs = 120_000`；
- `roundTimeoutMs = 45_000`；
- `toolTimeoutMs = 25_000`；
- `contextWindowTokens = 128_000`；
- `reservedOutputTokens = 8_192`；
- `safetyMarginTokens = 512`；
- `compactionThreshold = 0.7`；
- `compactionRetainCount = 4`。

实际生产使用存在分裂：`firefly-harness.ts:319-325` 使用 `maxRounds`、工具引擎策略中的 `maxToolCallsPerRun` 和 `totalTimeoutMs`；`roundTimeoutMs`、`toolTimeoutMs`、`compactionRetainCount` 在生产 Harness 中没有读取。Provider 请求只收到运行级 AbortSignal（`harness-llm.ts`），没有由 Harness 建立独立的 45 秒轮次计时器。工具超时来自 `ToolPolicyEvaluator`，不是 `AgentConfig.toolTimeoutMs`。

Context 的实际默认预算来自 `src/main/orchestrator/context/context-budget.ts:12-16`：同样是 128,000 / 8,192 / 512，但 Context 自己的 compaction threshold 是 `0.75`。Compactor 的阈值和保留值来自 `src/main/orchestrator/compaction/compactor.ts:17-21`：soft `0.7`、hard `0.85`、普通保留 4 条、emergency 保留 2 条。Agent 配置中的 `0.7` 与 Context 配置的 `0.75` 没有统一来源。

### 4.2 工具级执行

`src/main/orchestrator/tools/execution/tool-policy.ts:45-52` 的默认策略为：

- 单次工具超时 30,000 ms；
- 默认 `maxRetries = 2`，退避基数 200 ms；
- 每个运行逻辑工具调用上限 25；
- 最多 4 个可并行工具。

`tool-policy.ts:208-213` 只在工具 `retryable === false` 时把重试数置零；没有按 `sideEffect` 自动推导“未知提交不得重试”。`tool-execution-engine.ts:176-348` 对暂态结构化错误或抛出的异常执行重试。重试等待使用不可中断的 `sleep()`；父级取消会在下一次循环检查到，但不会立即打断当前退避等待。重试尝试不增加 Harness 的 `toolCallsCount`，因此逻辑调用预算和实际 dispatch 次数不是同一个计数。

当前已知的外部副作用工具 `music_control` 和 Browser 工具显式设置 `retryable: false`（分别为 `src/main/orchestrator/tools/adapters/music-tools.ts:187-191`、`src/main/browser/browser-tool.ts:176-180`）。这不能替代通用 ToolPolicy 对以后新增副作用工具的保护。

### 4.3 Provider Recovery

`src/main/orchestrator/recovery/recovery-manager.ts:15-20` 声明：

- `maxRecoveryAttempts = 3`；
- `maxProviderRetries = 3`；
- `maxOverflowRetries = 1`；
- `maxResumeAttempts = 2`；
- `initialBackoffMs = 500`。

实际 `evaluate()` 只使用 `maxRecoveryAttempts`、`maxOverflowRetries` 和 `initialBackoffMs`（`:67-109`）；`maxProviderRetries` 与 `maxResumeAttempts` 只有类型/默认值，没有消费位置。

`FireflyHarness:539-648` 现在把 `executionState.recoveryAttempts` 定义为已完成的恢复动作数，并把该值传给 RecoveryManager 判断下一次动作。恢复动作获准后，事件中的 `attempt` 使用“已完成次数 + 1”；只有压缩或退避动作完成后才递增状态。取消错误直接失败，不自动恢复。429 按已完成次数计算指数退避；5xx/网络错误按下一次恢复动作计算退避；上下文超限走 emergency compaction 分支。

首次真实 Harness 上下文超限现在以 0 次已完成恢复进入 `retry_with_compaction`，压缩完成后计数变为 1；下一次同类超限在 `maxOverflowRetries = 1` 下停止。RecoveryManager 的 `maxProviderRetries` 与 `maxResumeAttempts` 仍只有类型和默认值，没有消费位置。

### 4.4 Planning

`src/main/orchestrator/planning/plan-types.ts:67-70` 的默认值为 `maxSteps = 5`、`maxPlanFailures = 2`、`maxVerificationAttempts = 2`、`enabled = true`。

`BoundedPlanner.shouldPlan()`（`bounded-planner.ts:31-58`）根据用户文本中的多步骤关键词、工具 Schema 数量和显式 `planMode` 决定是否规划。普通 Chat 的 `chat-ipc.ts:151` 没有主动传 `planMode`，所以生产是否进入 Planning 由该启发式决定；显式 `planMode` 由其他可信调用者或测试传入。

`advanceStep()`（`bounded-planner.ts:118-174`）调用 `StepVerifier.verifyStep()`。`step-verifier.ts:4-29` 只要求观察非空、`isError` 为 false 且不含有限的错误标记，即返回 `success`；它不比较步骤描述、用户目标、前后状态或外部执行证据。`maxPlanFailures` 与 `maxVerificationAttempts` 没有在 `BoundedPlanner` 的推进逻辑中消费。计划完成因此是“有非空无错误观察”的证据，不是任务目标完成的证明。

### 4.5 停止条件

`FireflyHarness:457-469` 的循环受轮次预算、总 AbortSignal 和总计时器约束；工具预算在 ToolExecutionEngine 入口检查；主运行的委派预算通过 `delegatedStepsReserved` 预留并在同一循环边界阻断。循环结束后不再把 `status === "running"` 兜底为 `"completed"`。只有收到无工具助手最终回答并进入现有最终回答分支，或既有 required-tool 专用成功结算路径明确完成，才会进入 `completed`。

本轮新增的 `AgentTerminationReason`（`src/shared/agent-types.ts`）作为 `AgentRunResult` 与 `agent:finished` 的结构化终止事实，区分 `completed`、`cancelled`、`timeout`、`error` 和 `budget_exhausted`；预算耗尽再区分 `rounds`、`tool_calls`、`delegation`。预算耗尽时 Harness 返回 `status: "error"`、空 `finalText`、结构化 `terminationReason`，发出 `agent:error` 而不发出 `agent:final-answer`。工具证据仍逐项写入 `toolCallEvidence`，不因整体未完成而改写为“未执行”。

最后允许的一轮若返回无工具最终回答，仍在循环内完成结算，不因轮次计数达到上限而失败。工具预算恰好用完但下一轮仍在既有轮次和总时限内返回最终回答时，也保持 `completed`；只有实际阻断继续执行且没有完成依据时才记为预算耗尽。取消和总超时在预算结算前保持各自终态，工具失败或提交未知不触发工具重试。

## 5. 七个固定场景的证据表

| 场景 | 当前实际路径 | 已有保护 | 当前缺口与测试证据 |
| --- | --- | --- | --- |
| 1. 同一工具、相同参数、相同失败 | ToolExecutionEngine 先按暂态错误重试；失败结果写入 Transcript，Harness 再让 Provider 继续下一轮 | 单工具最多默认 2 次重试；总轮数 10、逻辑工具调用 25；required-tool 路径在 `tool-round.ts` 先标记一次提交 | 没有跨轮的参数/结果无进展识别。普通工具可以被模型再次发出；合法重复操作也没有目标级区分。`tools/test/runtime/tool-execution.test.ts:108-142` 只覆盖一次 ToolExecutionEngine 暂态重试，不覆盖跨轮相同失败。 |
| 2. 工具成功但任务不推进，模型重复调用 | 工具成功结果进入 `AgentSession`，下一轮 Provider 继续；计划模式调用 `advanceStep` | `maxRounds`、工具预算和计划步数上限提供硬边界；工具结果保留 `toolCallId`；预算边界现在返回非成功终态 | `StepVerifier` 把任意非空无错误观察视为成功，不验证任务状态；无“成功但无推进”判定。`planning.test.ts:439-475` 已改为断言预算耗尽，不再固定错误的 `completed` 结果，但无进展识别本身仍未实现。 |
| 3. 传输结果不确定，重试可能重复副作用 | ToolExecutionEngine 根据工具元数据决定重试；required-tool 结果通过 `AgentRequiredToolExecutionResult` 区分 `unknown`，最终文本明确“不自动重试” | Browser 和 `music_control` 显式 `retryable:false`；required-tool 在一次运行内先标记已提交，后续同一 required call 被拒绝 | 通用 `sideEffect` 不自动关闭重试；抛异常/暂态 JSON 可能在工具层重新 dispatch。Provider Recovery 只包围 Provider，不包围工具结果，但模型后续仍可再次提出普通工具调用。没有统一的“提交未知→禁止后续同操作”契约。 |
| 4. 用户取消发生在重试或 Recovery 期间 | 输入 Signal → Harness AbortController → Provider/Tool/授权等待；`cancel()` 调用 AbortController 并从 `activeRuns` 移除（`firefly-harness.ts:1068-1083`） | Provider 取消不进入 Recovery；`cancellable-delay.ts` 同时服务 Provider Recovery 与 ToolExecutionEngine 退避；取消清理定时器/监听器并返回 `cancelled`，后续 Provider/dispatch 次数不增加 | 底层 Provider 或工具若忽略 Signal，仍只能等其本次调用返回后由上层丢弃；本轮未改变底层调用的可取消能力。`harness.test.ts` 与 `tool-execution.test.ts` 已覆盖退避期间取消。 |
| 5. Compaction 后遗漏目标/约束或复用旧成功 | ContextManager/Projector 根据压力调用 Compactor；Recovery 上下文超限分支使用 `forceCompactionStrategy:"emergency"`，Harness 清空 Session 并写回压缩后的消息（`firefly-harness.ts:566-586`） | `PairedSafeCut` 保持 assistant toolCalls 与 tool result 配对；system 消息保留；工具结果按头尾修剪 | 默认摘要只记录交流轮数、工具数和“相处愉快”（`compactor.ts:259-262`），不保留当前用户目标、硬约束、未完成事项或每个成功结果的结构化身份。Emergency 还设置 `preserveErrors:false`。活跃 Session 会被压缩投影替换，旧 `toolCallEvidence` 不进入 checkpoint。已有 `harness.test.ts:287-313` 和 `compaction.test.ts` 主要验证结构/摘要节点，不验证语义保存。 |
| 6. 配置/权限变化后恢复旧任务 | 当前恢复入口为 `FireflyHarness.resume()`；先 `CheckpointManager.restoreCheckpoint()`，再 `ResumeProtocol.evaluate()`，然后用空 `userPrompt` 和 `evaluation.sanitizedMessages` 重新 `run()`（`firefly-harness.ts:259-286`） | ResumeProtocol 拒绝已完成/已取消/版本不匹配；未完成活动工具没有结果时注入 `interrupted_prior_to_completion`；普通当前工具调用仍会经过现行 Tool/授权路径 | Checkpoint 没有 `AgentRunInput`、execution profile、required tool、Browser targets、授权事实、配置 revision 或一次性授权票据；Harness.resume 不把 `restoredPlan` 传给 run，只把 `planMode` 设为布尔值，且 `userPrompt` 为空导致新 Plan 不会创建。ResumeProtocol 本身不复查权限、配置 revision 或一次性授权。当前源码未找到 Chat/IPC 生产 resume 调用；`planning.test.ts:335-437` 是测试调用，不等于生产恢复。 |
| 7. 达到预算后仍生成“任务完成” | 循环退出后的 `firefly-harness.ts:973-1000` 结算为 `status: "error"` 与 `budget_exhausted`；`AgentRunResult.finalText` 对该状态为空 | 正常无工具最终回答在循环内立即完成；取消/总超时保持独立状态；工具证据保留；Worker 将预算终态映射为 `BUDGET_EXHAUSTED` | 本轮已修复 Harness 预算终态、事件和结果一致性。`harness.test.ts` 覆盖轮次最后回答、工具预算阻断、工具预算恰好用完后的下一轮最终回答；`planning.test.ts` 覆盖连续工具调用耗尽轮次预算。后续仍需单独决定任务目标证据与计划验证强度。 |

合法重复操作的边界：当前代码没有因参数相同而自动拒绝普通工具调用；`requiredToolExecution` 的一次提交保护只适用于 Main 预先声明的单个 required tool。任何后续无进展策略都必须以用户目标、工具副作用状态和结果证据共同判断，不能只用工具名+参数去重。

## 6. 取消、失败和最终回答的一致性

当前 required-tool 证据路径已经比普通工具路径严格：`resolveRequiredToolExecutionResult()`（`firefly-harness.ts:102-147`）要求匹配当前 run、工具名/参数和 `json_ok_true` 的结构化 `ok:true`，并把失败、未知、未调用映射为不同状态。它对音乐和 Browser 这类显式 Main 意图提供了“没有本次证据就不能声称成功”的边界。

普通任务没有同等的最终回答证据门。模型可以在工具失败结果之后生成一段看似完成的自然语言；只要 Provider 返回了无工具的助手消息，Harness 就把该消息作为 `completed` final answer。Planning 的 `StepVerifier` 也不能补上这个缺口，因为它只检查非空/错误标记。

取消和迟到 Provider/工具结果的主路径是安全的：Harness 在工具轮或 Provider 返回后复查 AbortSignal，取消状态不会进入正常 final-answer 事件；应用关闭时 `DefaultApplicationRuntime.stop()` 先调用 Agent/Worker `cancelAll()`。但工具和 Recovery 退避不是 AbortSignal-aware，故“最终不投递”已有保护，“立即停止所有等待”未完成。

## 7. Checkpoint / Resume 的实际接入与未接入部分

### 已接入

- `DefaultCheckpointPolicy`（`checkpoint-policy.ts:9-18`）默认记录 `run_initialized`、`step_start`、`llm_completed`、`waiting_permission`、`tool_round_completed`、`compaction_completed`、`recovery_started`、`run_completed`。
- Harness 在上述边界调用 `CheckpointManager.createCheckpoint()`；Worker run 跳过 checkpoint。
- `CheckpointManager` 默认以 `new InMemoryCheckpointStore()`（`checkpoint-manager.ts:30-32`）保存；`FileCheckpointStore` 存在于 `checkpoint-store.ts:58`，但当前 `default-dependencies.ts:730` 创建 `FireflyAgentCore` 时未注入 `CheckpointManager`，因此生产默认是进程内快照，进程重启后没有恢复来源。
- `ResumeProtocol` 对版本、已完成、已取消和中断工具调用有结构化处理；相关测试覆盖文件 Store、损坏隔离、取消/完成禁止恢复和中断工具标记。

### 未接入或不足

- `validateRunStateTransition()` 只在 `tools/test/core/recovery.test.ts:218-226` 被调用；生产 Harness 直接写 `executionState.runState`（`firefly-harness.ts:414,567,585,996`），没有运行时状态迁移校验。
- `Checkpoint` 只保存消息、活动工具、恢复次数、计划和可选 `providerMetadata`（`checkpoint-types.ts:24-39`）。Harness 创建 checkpoint 时没有传 `providerMetadata`（`firefly-harness.ts:405-412`），也没有保存授权范围、配置 revision、required-tool 事实、当前用户目标、execution profile 或一次性授权关联。
- `ResumeProtocol.evaluate()` 返回 `restoredPlan`，但 `FireflyHarness.resume()` 未把该 Plan 传回 `run()`；测试只验证恢复调用返回文本和中断标记，没有断言恢复后的计划继续从原步骤运行。
- 当前 `resume` 在源码中只有 `FireflyAgentCore`/`FireflyHarness` 的 API 和 `tools/test/core/planning.test.ts` 的测试调用；没有发现 Chat IPC 或应用生命周期的生产恢复入口。

因此，当前存在的是“同进程、可注入 Store 的恢复基础”和“测试可调用的 resume”，不是已经完成的跨进程安全恢复协议。

## 8. 旧入口、未接入实现与文档状态

| 项目 | 当前事实 | 结论 |
| --- | --- | --- |
| `FileCheckpointStore` | 生产代码存在，测试使用；默认 `CheckpointManager` 不注入它 | 可复用基础，当前不是生产默认持久化 |
| `resume(checkpointId)` | `IAgentCore`、`FireflyAgentCore`、`FireflyHarness` 暴露；测试调用 | API 存在，未发现 Chat/应用生产入口 |
| `validateRunStateTransition` | 导出并有单元测试；无生产调用 | 约束函数存在，运行时状态机未真正接入 |
| `maxProviderRetries` / `maxResumeAttempts` | RecoveryBudget 字段和默认值存在 | 没有实际消费，不应作为已生效预算报告 |
| `AgentConfig.roundTimeoutMs` / `toolTimeoutMs` / `compactionRetainCount` | shared 配置字段存在 | Harness 不读取；实际值来自 Provider/ToolPolicy/Context 各自配置 |
| `PlannerConfig.maxPlanFailures` / `maxVerificationAttempts` | 类型和默认值存在 | `BoundedPlanner.advanceStep()` 未使用 |
| 旧主动生产入口 | 当前组合根未注册旧 `setInterval` 主动生产者；`src/main/proactive/` 仅保留断开模块 | 本轮未恢复；不属于长任务修复范围 |
| Browser V1 | 当前工具/授权/Reader 代码已有生产接入；本轮不重做网络后端和公网验收 | 长任务审计只检查其作为一种工具的预算/恢复边界，不改变 Browser |

## 9. 缺口按严重程度

### 高严重度

1. **恢复快照没有绑定原始执行事实。** 权限、配置 revision、一次性授权、Browser 用户目标和 required-tool 约束均不在 checkpoint 契约内；`resume()` 也没有恢复这些字段。当前没有生产恢复入口降低了触发面，但不能把 API 说成安全恢复。
2. **Compaction 摘要不保留任务语义。** 结构配对有保护，目标/约束/未完成事项/证据身份没有保护；本轮已修复首次上下文超限的 Recovery 计数，但没有改变摘要内容或保留策略。
3. **普通任务的完成证据仍弱。** 无工具助手文本仍是 Harness 的正常完成依据；`StepVerifier` 仍不验证外部目标状态，不能把本轮预算终态修复扩大解释为任务目标验证。

### 中严重度

4. **副作用安全依赖每个工具手工声明 `retryable:false`。** `sideEffect` 没有统一约束；未声明的新副作用工具会继承两次重试。
5. **底层调用的取消能力仍取决于 Provider/工具实现。** Recovery/Tool retry 退避本身已能立即响应取消；若底层调用忽略 Signal，上层仍只能等待该调用返回后丢弃结果。
6. **计划完成证据过弱，两个计划失败预算字段未接入。** 非空模型文字可以完成步骤，不能证明外部目标完成。
7. **声明的 round/tool AgentConfig 与实际执行来源分裂。** 这会让配置审计和运维日志对实际时限产生误读。

### 低严重度/收敛项

8. 运行状态迁移校验函数未进入生产写入点。
9. `maxProviderRetries`、`maxResumeAttempts` 和恢复后的计划接续是未完成的契约，不应继续用“已实现”文案描述。

## 10. Harness 预算终态修复（本轮已实施）

本轮只修复预算耗尽的终态、结构化原因和消费者一致性，不改变预算数值，也没有引入第二个 Loop、Planner、Memory、事件总线或新模型参数。

### 实际修改

- `src/shared/agent-types.ts` 新增 `AgentBudgetKind` 与 `AgentTerminationReason`，并把终止事实加入 `AgentRunResult` 和 `agent:finished`。
- `src/main/orchestrator/harness/firefly-harness.ts` 移除循环退出后的成功兜底；轮次、工具调用、委派预算分别记录结构化耗尽原因。预算耗尽返回非成功结果、空最终文本、`agent:error`，不发送 `agent:final-answer`；正常最终回答不受最后轮边界误伤。
- `src/main/orchestrator/recovery/execution-state.ts`、`checkpoint-types.ts`、`checkpoint-manager.ts` 保存终止事实，避免返回值与 checkpoint 分裂。
- `src/shared/subagent-types.ts`、`subagent-task-service.ts`、`subagent-worker-runtime.ts` 保留 Worker 预算耗尽原因，并映射为 `BUDGET_EXHAUSTED`；Main 委派不会把 Worker 未完成结果提升为成功。
- `tools/test/core/harness.test.ts`、`tools/test/core/planning.test.ts`、`tools/test/runtime/subagent-worker-runtime.test.ts` 增加或修正真实 Harness/Worker 断言。旧的 Planning `completed` 断言此前固定了错误行为，现已改为预算耗尽非成功；新增测试同时覆盖最后一轮最终回答和工具预算恰好用完后的正常收尾。

### 保持不变

45 秒检查、180/300 秒等主动策略参数不在本轮范围；本轮也不改变 Agent 默认轮次、工具上限、总时限、Recovery 计数/退避、Compaction 摘要、Resume 快照结构、Browser 网络／授权、音乐权限、TTS、Live2D、UI 或主动生产注册。Browser 当前生产接入事实保持不变；本轮只确保它作为普通工具受 Harness 预算终态约束，没有重新做 Browser 公网验收。

### 验收条件

- 连续工具调用达到轮次预算：非成功、`budget_exhausted: rounds`、无正常最终事件，工具证据仍保留。
- 工具预算阻断：非成功、`budget_exhausted: tool_calls`，执行次数不越界。
- Worker 预算耗尽：结构化 `BUDGET_EXHAUSTED`，Main 不提升为成功。
- 最后一轮返回无工具最终回答，或工具预算恰好用完后仍有剩余轮次返回最终回答：成功且 `agent:final-answer` 只发一次。
- 取消、总超时、工具失败和提交未知保持各自事实，不被预算结算覆盖。

语义压缩摘要、安全 Resume、普通任务目标证据和跨轮无进展识别仍是后续独立范围；Recovery 计数与退避取消已在下一节收敛。

## 11. Recovery 重试记账与取消修复（本轮已实施）

### 实际修改

- `src/main/orchestrator/recovery/recovery-manager.ts` 将 `evaluate()` 的计数契约明确为“已完成恢复动作数”。首次 Provider 异常以 `0` 进入判断；恢复动作获准后，Harness 以 `completed + 1` 记录即将开始的 attempt，并在压缩或退避完成后递增 `recoveryAttempts`。
- `src/main/orchestrator/harness/firefly-harness.ts` 修复首次上下文超限跳过 emergency compaction 的偏差；恢复耗尽仍走非成功错误路径，取消和总超时优先结算，不重置轮次或总期限。
- `src/main/orchestrator/cancellable-delay.ts` 新增无调度状态的可取消等待；`FireflyHarness` 的 Provider Recovery 与 `ToolExecutionEngine` 的两条工具重试退避路径共用该实现。取消会清理计时器和监听器，不进入下一次 Provider 或 dispatch。

### 保持不变

预算数值、工具 `retryable` 策略、Browser 与 `music_control` 的 `retryable: false`、Recovery 的类型字段 `maxProviderRetries`/`maxResumeAttempts`、Compaction 摘要、Resume、安全权限链、Browser 网络行为和主动生产者均未扩展。本轮没有启用仍未被消费的配置字段。

### 验收条件

- 真实 Harness 首次上下文超限进入 emergency compaction，压缩完成后只在剩余轮次和总期限内重试；达到 `maxOverflowRetries` 后停止。
- 压缩失败只执行一次，不无限重试。
- Provider 退避期间取消或总期限到达时，后续 Provider 调用次数不增加，并分别返回 `cancelled` 或 `timeout`。
- 工具退避期间取消时，后续 dispatch 次数不增加；取消不被当作可恢复错误。
- 上一轮预算终态、Worker、Main Delegation、Browser 与音乐工具的重试边界保持回归通过。

## 12. 本轮验证记录

| 验证项 | 本轮状态 |
| --- | --- |
| Git 分支、HEAD、工作树读取 | 已执行；见第 1 节 |
| 生产源码审计 | 已执行；见第 2-8 节 |
| 既有 Harness/Planning/Recovery/Compaction 测试源码核对 | 已执行；本轮另有定向回归 |
| Browser 公网读取 | 未执行 |
| 应用启动、模型调用、GUI 验收 | 未执行 |
| `npm run typecheck` | 已通过；先完成 build 刷新编译声明后再次通过 |
| `npm run build` | 已通过；主进程、Preload、Renderer、CLI 与资源复制完成 |
| 定向回归 | 已通过：Harness 22 项、Recovery 13 项、ToolExecution 14 项、Planning 18 项、Worker Runtime 16 项、Main Delegation 15 项；覆盖首次真实上下文超限、压缩失败、恢复退避取消、工具退避取消和总期限优先级 |
| `npm test` | 已通过；完整默认测试链退出码 0，包含 Browser、权限、Worker、Memory/RAG、TTS、Music、GUI 契约回归 |
| TypeScript Guard / Architecture Guard / `git diff --check` | 已通过；`git diff --check` 仅输出现有工作树的 LF/CRLF 转换提示，没有 whitespace error |
| 生产源码修改 | 有；本轮新增可取消退避、Recovery 计数修复及 Harness/ToolExecutionEngine 接入；上一轮预算终态契约与消费者同步继续保留 |
| 本轮文件变更 | `cancellable-delay.ts`、RecoveryManager、Harness、ToolExecutionEngine、Harness/Recovery/ToolExecution 定向测试，以及本架构文档；既有工作树修改全部保留 |
| Commit / Push / Publish | NONE |
