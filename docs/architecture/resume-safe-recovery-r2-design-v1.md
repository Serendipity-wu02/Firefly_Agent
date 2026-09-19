# Firefly V1.1.1 — Resume R2 同进程安全恢复契约（首批实施版）

## 1. 状态、基线与范围

本文保留前期设计依据，并以文末“本轮实际实施”作为当前有效实现说明。

- 分支：`firefly-v1.1.0`
- HEAD：`f2ebc50b42a49557a960504365c3355b35ee58f6`
- 远程跟踪：`origin/firefly-v1.1.0`，`HEAD...@{u} = 0 0`
- 工作树：保留前期未提交修改；本轮新增 R2 首批实现、测试和文档修改
- R1：旧快照及缺失 R2 事实继续拒绝；完整的新 R2 快照可在同进程首批边界内恢复

本轮不启动应用、模型或网络，不提交或推送。Browser、Worker、审批恢复、委派恢复、跨进程恢复和生产自动停止入口仍未开放。

### R2 首批固定边界

首批只讨论以下恢复路径：

- 同一进程；
- `MAIN` 执行 profile；
- 原运行已经停止并完成资源释放；
- 没有在途工具调用；
- 没有待处理审批；
- 没有委派执行或待消费的 delegated steps；
- 只从结构化记录的、明确可恢复的 Provider 失败边界继续；
- 已完成工具只能作为原证据继续携带，绝不重放。

以下内容后置并在本批一律拒绝：工具前状态恢复、等待审批恢复、Worker 恢复、委派恢复、取消、总超时、预算耗尽、工具结果未知、快照保存失败以及跨进程恢复。

## 2. 当前实际调用图与 R1 事实

```text
IAgentCore.resume(checkpointId, signal?)
  -> FireflyAgentCore.resume(checkpointId, signal?)
    -> FireflyHarness.resume(checkpointId, signal?)
      -> CheckpointManager.restoreCheckpoint(checkpointId)
        -> ICheckpointStore.read(checkpointId)
      -> ResumeProtocol.evaluate(checkpoint)
      -> AgentResumeRejectionResult
```

源码依据：

| 事实 | 源码位置 |
| --- | --- |
| `resume()` 接口与结果 | `src/shared/agent-core.ts`、`src/shared/agent-types.ts` |
| Core 委托 | `src/main/orchestrator/firefly-agent-core.ts` |
| R1 恢复实现 | `src/main/orchestrator/harness/firefly-harness.ts:322-376` |
| Checkpoint 读取 | `src/main/orchestrator/recovery/checkpoint-manager.ts:31-120` |
| R1 资格判定 | `src/main/orchestrator/recovery/resume-protocol.ts:16-78` |
| 当前 schema | `src/main/orchestrator/recovery/checkpoint-types.ts`，`CHECKPOINT_SCHEMA_VERSION = 1` |

当前 R1 对不存在、读取 I/O 失败、格式错误、版本不支持、终态和缺失恢复事实分别返回结构化拒绝。R1 不调用普通 `run()`，不调用 Provider、ToolExecutionEngine 或 Approval，不发送 `run:resumed`，不创建新运行。

当前没有 Chat、IPC 或应用组合根的生产 Resume 调用者。`CheckpointManager` 默认使用 `InMemoryCheckpointStore`；应用组合根没有注入 FileCheckpointStore，因此没有跨重启恢复依据。

## 3. Provider 可恢复失败边界

### 3.1 当前分类与动作

`src/main/orchestrator/recovery/error-classifier.ts` 产生以下 `ClassifiedErrorType`；`src/main/orchestrator/recovery/recovery-manager.ts` 的 `evaluate(err, completedRecoveryAttempts)` 决定下一动作。

| 分类 | 当前 `ErrorClassifier` 证据 | 当前 `RecoveryManager` 动作 | 首批 R2 |
| --- | --- | --- | --- |
| `context_overflow` | `context_length_exceeded`、`maximum context length`、`context window`、`token limit`、`413`、`payload too large` | 未超过 `maxOverflowRetries` 时 `retry_with_compaction` | 允许，必须保存结构化分类和下一动作；压缩失败或额度耗尽拒绝 |
| `rate_limit` | `429`、`rate_limit`、`too many requests`、`quota exceeded` | `retry_with_backoff` | 允许，必须仍有恢复预算且不是超时/取消 |
| `server_error` | `500`、`502`、`503`、`504`、`internal server error`、`bad gateway`、`service unavailable` | `retry_immediate` | 允许，必须仍有恢复预算且不是超时/取消 |
| `network_error` | `econnreset`、`etimedout`、`enotfound`、`fetch failed`、`network error`、`socket hang up` | `retry_immediate` | 首批不允许；当前 `ETIMEDOUT` 与网络抖动共用分类，源码不足以证明不是超时 |
| `cancelled` | abort/cancel 文本或 `AbortError` | `fail_run` | 拒绝 |
| `fatal` | 未知错误、认证/权限/模型不存在等 | `fail_run` | 拒绝 |

首批允许集合因此严格为：

```text
context_overflow + retry_with_compaction
rate_limit      + retry_with_backoff
server_error    + retry_immediate
```

这不是根据最终错误文字猜测资格。未来快照必须保存来自 Provider catch 路径的结构化 `classifiedError.type`、`retryable`、`RecoveryDecision.action`、已完成恢复次数和 `timedOut/cancelled` 判定。当前错误分类器主要使用消息字符串匹配，不能直接把任意 `error` 文本作为 R2 资格证据。

### 3.2 明确排除

- `runAbortController.signal.aborted === true`：拒绝；
- Harness 的 `timedOut === true` 或总期限已到：拒绝；
- `terminationReason.kind === "budget_exhausted"`：拒绝；
- `RecoveryManager.evaluate()` 返回 `fail_run`：拒绝；
- `context_overflow` 已消费 `maxOverflowRetries` 或 emergency compaction 失败：拒绝；
- Provider 已返回工具调用但工具边界尚未稳定：后置，不进入首批；
- 任意工具 `started`、`unknown` 或提交状态未知：拒绝。

当前 Harness 在 Provider catch 中先检查 AbortSignal，再调用 `RecoveryManager.evaluate()`；恢复失败会抛出并最终进入 `error`，取消和总超时分别进入 `cancelled`/`timeout`。R2 必须保留这个优先级，不能仅凭分类结果覆盖取消或超时。

## 4. 原运行停止、释放、保存与资格建立顺序

以下顺序是首批设计提案；当前源码尚未实现该状态机。

1. **确认 Provider 边界**：Provider 请求已经返回失败；读取结构化分类和 RecoveryDecision。先检查取消信号、总期限、预算和恢复动作是否仍有效。
2. **冻结并封存原运行**：同步把原运行标记为 `resumable`（设计使用，当前 `RunState` 已有该值），禁止新的 Provider、工具、审批、委派和自动 Recovery 进入；同一原运行不再回到普通 `run()`。
3. **复制不可变事实**：在释放 session 之前深复制用户来源、MAIN profile、无工具/无审批/无委派状态、当前消息、已完成工具证据、Provider 失败边界、预算和单调时间事实。
4. **释放瞬时资源**：清理总期限计时器、Abort listener、Provider 连接和本次运行临时订阅；从 Harness 的执行中集合移除运行，但保留由 CheckpointManager 持有的原运行链占用记录。不得丢弃已复制的事实。
5. **保存 Checkpoint**：将完整快照写入存储。保存失败返回独立的 `checkpoint_save_failed`（设计提案），不建立恢复资格，不发送 `run:resumed`，也不把保存失败改写成 Provider 失败或工具未执行。
6. **读回并验证**：保存成功后由 CheckpointManager 读回并校验版本、完整性、原运行身份、允许的 Provider 失败边界、无工具/无审批/无委派条件和剩余预算。
7. **建立可恢复资格**：只有读回校验成功后，ResumeProtocol 才返回首批 `eligible`（设计提案），并把 Checkpoint 置为可一次性 claim。任何资格缺失都返回独立的 `resume_eligibility_invalid`（设计提案）。

如果第 4 步释放成功但第 5 步保存失败，原运行已经停止且不可恢复；这是有意的 fail-closed 结果。不得为了保留恢复机会而继续保留 Provider 或工具资源。

## 5. 首批保存事实、当前字段与所有者

以下新增名称均标为**设计提案**，不是当前字段。

| 事实 | 当前字段/来源 | 当前所有者 | 首批需要的新增事实 |
| --- | --- | --- | --- |
| 原始用户请求 | `AgentRunInput.userPrompt`、Harness 局部变量 | Harness / ContextManager 输入 | `ResumeUserInputSnapshot`（设计提案），保持用户来源 |
| 执行 profile | `AgentRunInput.executionProfile` | Harness | `ResumeMainProfileSnapshot`（设计提案），必须是 MAIN |
| 无在途工具 | `RunExecutionState.activeToolCalls`、`stepState` | Harness | `toolBoundary = none`（设计提案） |
| 无待审批 | Authorization pipeline 的 pending map、Harness approval wait | CapabilityAuthorizationPipeline / Adapter | `approvalBoundary = none`（设计提案） |
| 无委派 | Harness `delegatedStepsReserved`、Worker profile | Harness / Main Delegation | `delegationBoundary = none`（设计提案） |
| Provider 失败 | `ErrorClassifier` / `RecoveryManager` 当前只在运行内存中产生 | RecoveryManager | `ProviderFailureBoundary`（设计提案） |
| 已完成工具证据 | Harness `toolCallEvidence`、assistant/tool 消息 | Harness | `ResumeToolEvidence[]`（设计提案）；只读证据，不重放 |
| 预算 | `maxRounds`、`maxToolCallsPerRun`、`runDeadline`、`recoveryAttempts` 为局部值 | Harness / ToolExecutionEngine policy | `ResumeBudgetSnapshot`（设计提案） |
| 时间 | 当前 Harness 使用 `Date.now()` 计算 `runDeadline` | Harness | `ResumeMonotonicBudget`（设计提案） |
| 恢复消费状态 | 当前无字段、无 claim | 无单一所有者 | `ResumeChainClaim`（设计提案），由 CheckpointManager 与 Harness 恢复门共同维护 |
| 资格失败 | 当前 R1 `checkpoint_facts_missing` | ResumeProtocol | `resume_eligibility_invalid`（设计提案） |
| 保存失败 | 当前 `createCheckpoint()` 异常进入运行错误 | CheckpointManager / Harness | `checkpoint_save_failed`（设计提案） |

当前 Checkpoint 仍只有 `messages`、`activeToolCalls`、`recoveryAttempts`、`plan`、`providerMetadata` 等 v1 字段；本轮不修改 schema。没有这些新事实，R1 继续拒绝。

## 6. 首批恢复执行规则

### 6.1 单一 Harness 循环

恢复路径只做读取、资格检查、排他占用、事实重建和预算重建，随后进入同一个 `FireflyHarness` 执行循环。不得复制第二个 Agent loop，不得重新调用普通 `run()` 的空 `userPrompt`、默认 MAIN 或重置预算路径。

首批恢复实例必须：

- `executionProfile.kind === "MAIN"`；
- 没有 Worker、SubAgent 或 Main Delegation 状态；
- 不恢复 pending approval；
- 不恢复工具前/工具等待状态；
- 只允许 Provider 继续和无工具最终回答；
- 若恢复后的 Provider 返回新的工具调用，立即以非成功终态结束，不进入授权或 ToolExecutionEngine。

### 6.2 已完成工具

已完成工具的 assistant call、`toolCallId`、tool message、canonical result、错误状态和来源事实随快照保留，作为后续 Provider 的上下文证据。恢复时：

- 不再次 dispatch；
- 不重新审批；
- 不重新消费一次性授权；
- 不把工具成功提升为整个任务完成；
- 不把旧成功结果当作当前新的工具执行证据。

任何工具结果为 `unknown`、`started`、提交未知或 assistant/tool 配对缺失，均不是首批恢复资格，而是独立的 `resume_tool_result_unknown`（设计提案）。

### 6.3 工具预算耗尽与无工具总结

恢复实例沿用原始 `maxToolCallsPerRun` 与已消费量。若剩余工具预算为零：

- 若 `requiredToolExecution` 未完成，拒绝恢复，不调用 Provider；
- 若当前上下文仍可能产生工具调用，拒绝恢复，不发送带工具 Schema 的 Provider 请求；
- 只有在没有未完成 required-tool、发送给 Provider 的工具 Schema 为空、轮次预算和总期限仍有剩余时，才允许一次无工具总结请求；
- 该请求必须返回明确的无工具最终回答才算完成；否则返回非成功终态；
- 工具预算耗尽本身绝不证明任务完成。

这是首批明确的“无工具总结”例外，不恢复任何工具执行路径。

## 7. 剩余预算与单调时间

当前主运行预算来自 `firefly-harness.ts:409-416`：`DEFAULT_AGENT_CONFIG.maxRounds = 10`、`totalTimeoutMs = 120000`，主工具上限从 `ToolExecutionEngine.getPolicyConfig().maxToolCallsPerRun` 获取，缺省回退 `25`；Worker 预算来自 profile。当前实现使用 `Date.now()` 计算 `runDeadline`，R2 不能直接复用为安全恢复时钟。

### `ResumeBudgetSnapshot`（设计提案）

```text
originalMaxRounds
originalMaxToolCalls
originalDelegatedStepsLimit = 0
originalDeadlineOnMonotonicClock
consumedRounds
consumedToolCalls
consumedRecoveryAttempts
remainingRecoveryAction
```

同进程首批使用进程内单调时钟（设计提案名称 `ResumeMonotonicClock`）：

- 原运行建立 `monotonicDeadline`；
- 快照保存原始 deadline 与当前单调时间的差值；
- 恢复计算 `max(0, originalMonotonicDeadline - monotonicNow)`；
- 墙上时钟 `Date.now()` 只用于诊断和事件时间，不参与剩余时长增加；
- 系统时钟回拨不能增加可用时长；
- deadline 已到立即拒绝或进入 timeout，不能发送 Provider。

恢复不能把停止期间的时间归零，也不能用当前配置替换原限制。`maxProviderRetries` 与 `maxResumeAttempts` 当前虽存在于 `RecoveryBudget`，但没有被现有 Resume 流程消费；本轮不启用或删除它们。

## 8. 原运行、快照与恢复链的唯一执行者

### 8.1 原运行封存

原运行从 Provider 失败边界进入 `resumable` 后，原 Harness loop 必须结束，AbortController、计时器、监听器和执行资源释放。原 `runId` 的链状态保持为已封存，不能重新进入 `run()`。

### 8.2 同一快照

同一 `checkpointId` 只能被一次恢复 claim：

1. 读取、R1/R2 资格检查与 claim 必须由同一恢复门完成；
2. claim 是同步 compare-and-set，不在检查后等待；
3. 首个调用者获得 `ResumeClaim`（设计提案）；
4. 其他调用者返回 `resume_already_claimed`（设计提案）；
5. claim 前不创建恢复 run、不调用 Provider、不审批、不执行工具；
6. claim 一旦进入 `committed` 或 `rejected`，不自动释放给第二次调用。

### 8.3 同一原运行的不同快照

恢复占用不能只按 `checkpointId`。同一个原始 `runId` 的所有快照共享一个 `ResumeChainClaim`（设计提案）：

- 第一个合法快照占用原运行链；
- 其他同源快照即使来自不同 `checkpointId` 也拒绝 `resume_chain_claimed`（设计提案）；
- 更早的快照不能覆盖已经占用或已经成功恢复的较新边界；
- 仅由当前唯一执行者生成的 successor checkpoint 才能成为下一代恢复来源；
- 旧快照、已消费快照和祖先快照不可再次消费。

由于当前 schema 没有单调 checkpoint generation，本规则需要新增 `originRunId`、`checkpointGeneration` 和 `parentCheckpointId`（均为设计提案），不能用 `step` 或 `createdAt` 猜测新旧关系。

### 8.4 连续恢复

一次合法恢复成功后，源快照立即消费，恢复实例成为该链唯一执行者。若恢复实例随后在允许的 Provider 边界再次停止，只能由它保存新的 successor checkpoint；不能并行恢复父快照，也不能让另一个调用者抢占同一原运行链。恢复次数继续受原始预算和未来明确的 Resume chain budget 约束，不启用当前未消费的 `maxResumeAttempts`。

## 9. 授权重验

首批没有待审批和工具执行，因此恢复资格阶段必须证明：

- 当前 profile 仍为 MAIN；
- capability/binding/sandbox 当前仍存在且未改变；
- Browser 若出现在已完成工具证据中，来源 URL、Origin、传输模式、代理端点和 `networkRevision` 仍与原事实一致；
- 当前用户目标集合不从模型计划、历史工具结果或网页内容重建；
- 没有要恢复的 approval request 或 AuthorizedCapabilityInvocation。

后续工具前和审批恢复重验仍由现有 `HarnessAuthorizationAdapter`、`CapabilityAuthorizationPipeline` 和 `AuthorizedInvocationBridge` 负责，但不属于首批开放范围。一次性 approval、`consumedApprovals`、`consumedRequestIds` 不保存、不恢复、不重放。

## 10. 结果分类不能互相替代

| 事实 | 当前来源 | 首批处理 |
| --- | --- | --- |
| Provider 可恢复失败 | `ErrorClassifier` + `RecoveryManager` | 只有允许集合可建立恢复资格 |
| 工具结果未知 | `AgentToolCallEvidence.outcome` / `ActiveToolCallState.sideEffectState` | `resume_tool_result_unknown`，拒绝，不改写为未执行 |
| Checkpoint 保存失败 | `CheckpointManager.createCheckpoint()` 的存储异常 | `checkpoint_save_failed`，无恢复资格 |
| 恢复资格失效 | ResumeProtocol 当前只返回 `checkpoint_facts_missing` | `resume_eligibility_invalid`，不调用 Provider |
| 取消 | AbortSignal、Harness `cancelled` | 拒绝/取消，不覆盖为 Provider 可恢复失败 |
| 总超时 | Harness `timedOut`、`timeout` | 拒绝，不延长期限 |
| 预算耗尽 | `AgentTerminationReason.kind = budget_exhausted` | 拒绝，不发送总结请求 |
| 正常成功 | `AgentRunResult.status = completed` | 终态，不恢复 |

不允许用历史工具成功填补本次 Provider 失败，不允许用保存失败解释为工具未知，也不允许用资格失效解释为 Provider 暂态错误。

## 11. `run:resumed` 唯一发送时点

现有事件类型位于 `src/shared/agent-types.ts`，但 R1 当前不发送它。R2 设计规定：

`run:resumed` 只在以下全部完成后发送一次：

1. Checkpoint 读取成功；
2. R2 Provider 失败边界资格通过；
3. 原运行已封存且资源已释放；
4. 同一原运行链与指定 Checkpoint 已排他 claim；
5. 当前 profile、能力边界和 Browser 配置事实复查通过；
6. 原始预算、已消费量和单调 deadline 重建成功；
7. 新 `resumeRunId` 的 active execution 已登记；
8. 同一 Harness 恢复循环即将开始执行。

在这些条件之前失败，不发送 `run:resumed`。发送后如果取消，使用现有 `agent:cancelled`/最终取消状态；如果 Provider 再失败、预算耗尽或资格在执行前失效，使用相应非成功终态，不能再次发送 `run:resumed`，不能发送正常完成事件。

## 12. 固定验收矩阵

后续实现使用受控 Provider、CheckpointStore、授权替身和可控单调时钟，验证实际调用计数：

1. `context_overflow`、`rate_limit`、`server_error` 在无工具、无审批、无委派的 MAIN 快照中按结构化动作恢复；Provider 调用和 `run:resumed` 各符合一次语义。
2. `network_error`、`ETIMEDOUT`、取消、总超时、预算耗尽、fatal、Recovery `fail_run` 均拒绝，不因字符串相似而放行。
3. 原运行先封存、释放资源、保存成功并读回验证后，才建立恢复资格；保存失败没有恢复入口。
4. 同一快照两个并发恢复只有一个 claim 成功；另一个 Provider/工具/审批次数均为零。
5. 同一原运行的两个不同快照并发恢复只有一个链占用；旧快照和祖先快照均拒绝。
6. 连续恢复只能使用唯一执行者生成的 successor checkpoint，父快照不能重放。
7. 已完成工具证据保留准确 assistant/tool 配对，工具 dispatch 次数为零；工具未知、started 或提交未知一律拒绝。
8. 工具预算为零时，未完成 required-tool 或仍需工具 Schema 的恢复拒绝；无工具 Schema、轮次和期限足够时才允许总结 Provider 调用。
9. Provider 恢复预算和轮次沿用原始已消费量，不能重置；系统时钟回拨不增加单调剩余时间。
10. Browser 配置 revision、Origin、传输模式或代理端点变化时拒绝，不 DNS、不连接；当前 Browser 工具链不改变。
11. `run:resumed` 在资格、排他 claim、复查和 active registration 完成后只发送一次；此前失败零次，之后取消/失败不重复发送。
12. MAIN 以外 profile、Worker、委派、待审批、工具前/等待审批快照均保持 R1/首批拒绝。
13. 普通 Chat、Worker、Browser、音乐授权和主动无工具边界回归保持；R2 不新增调用者或 UI/IPC 入口。

## 13. 最小实施顺序（后续轮次）

1. **Provider 失败边界契约**：增加版本化、结构化的 Provider failure boundary；只允许前三类，明确排除 network timeout、取消、预算和 fatal。
2. **原运行封存与保存结果**：在 Harness/CheckpointManager 现有所有权内实现停止、事实复制、资源释放、保存失败分类和读回验证；旧 v1 继续拒绝。
3. **同进程 chain claim**：在同一恢复门中实现 Checkpoint 与 origin chain 的原子占用，禁止检查与占用之间的 await 窗口；保持单一 Harness loop。
4. **MAIN Provider-only resume**：重建原始预算和单调 deadline，只允许无工具 Schema 的 Provider continuation；工具前、审批、Worker、委派路径明确拒绝。
5. **事件和终态**：仅在恢复实际开始前发送一次 `run:resumed`，并验证取消、失败、超时和预算终态不被覆盖。
6. **固定测试**：先完成本节验收矩阵，再由架构端决定是否进入工具前/审批/Worker 后续范围。

本轮没有执行上述实现步骤，没有修改 schema，也没有开放恢复入口。结论是：R1 fail-closed 继续有效；首批 R2 只能从已结构化记录的 Provider 可恢复失败边界进入同一 MAIN Harness 循环。

## 14. R2 第一批 Provider Failure Boundary 实际收敛

本轮已实现的范围仅为纯契约与纯校验：

- 新增 `src/main/orchestrator/recovery/provider-failure-boundary.ts`；
- 新增版本 `PROVIDER_FAILURE_BOUNDARY_VERSION = 1`；
- `validateProviderFailureBoundary()` 只接受三组错误分类/恢复动作配对；
- `createProviderFailureBoundary()` 只接收现有 `ErrorClassifier` 结果、`RecoveryManager` 决策和显式预算/取消/超时事实，不重新解析历史消息或最终错误文案；
- 缺失字段、无效格式、未知版本、未知分类、动作错配、取消、超时、预算耗尽、恢复额度耗尽均返回结构化拒绝；
- 校验顺序是：先完成字段格式校验，再确认版本与来源；对格式有效且版本/来源受支持的输入，先处理取消、超时、运行/恢复预算终止条件，再判断错误分类、溢出预算、动作配对和 `retryable` 资格；错误分类映射只接受 `ACTION_BY_ERROR_TYPE` 的自有属性，不接受原型链属性名；
- 校验不访问 Provider、ToolExecutionEngine、Approval、CheckpointStore、时钟或事件总线；
- `tools/test/core/recovery.test.ts:16-21` 覆盖允许组合、错配、`network_error`/`fatal`/`fail_run`、带冲突分类/动作的取消/超时/预算优先拒绝、缺失/无效/未知版本、原型属性名称拒绝和现有分类/Recovery 输入。

本轮明确未实现：

- 没有在 Harness Provider catch 中创建或保存边界；
- 没有改变普通 Recovery、退避、emergency compaction 或恢复计数；
- 没有封存运行、创建 R2 快照、修改 Checkpoint schema 或接入 `resume()`；
- 没有 claim、单调时钟、恢复循环、`run:resumed` 发送或授权重验；
- 没有新增 UI/IPC、Provider 请求、工具执行、审批或网络行为；
- R1 `resume()` 仍全部返回原有 fail-closed 拒绝。

因此该实现只证明“传入的 Provider/Recovery 事实符合首批边界”，不证明完整 Resume 资格，也不产生执行授权。

## 15. Provider 失败三分流复核：当前实现与待实施停止机制

本节是对当前生产调用路径的复核。除明确标为“设计提案”的部分外，均为当前源码事实。本轮没有把 Provider Failure Boundary 接入 Harness，也没有改变普通自动 Recovery。

### 15.1 当前普通自动 Recovery 的实际顺序

当前 `FireflyHarness` 的 Provider 请求位于 `src/main/orchestrator/harness/firefly-harness.ts:788-842` 的内层 `while (true)`。异常在 `:843-961` 捕获，实际判断顺序如下：

1. 先检查 `runAbortController.signal.aborted`。已取消或总期限定时器已触发时，直接重新抛出 Provider 异常，不调用 `RecoveryManager.evaluate()`。
2. 未取消时，以 `executionState.recoveryAttempts` 作为已完成恢复次数，调用 `RecoveryManager.evaluate(providerErr, completedRecoveryAttempts)`（`:848-852`）。
3. `RecoveryManager` 先处理 `cancelled`，再检查 `completedRecoveryAttempts >= maxRecoveryAttempts`，然后按分类选择动作（`src/main/orchestrator/recovery/recovery-manager.ts:59-128`）。
4. `fail_run` 只发出 `recovery:failed`，重新抛出原 Provider 异常（Harness `:854-863`）；外层 catch 将运行结算为 `error`，不进入下一次 Provider 请求。
5. 非 `fail_run` 动作先发出 `recovery:started`、保存 `recovery_started` checkpoint，然后执行动作：
   - `context_overflow + retry_with_compaction`：使用 `forceCompactionStrategy: "emergency"` 投影上下文；压缩失败、任务事实超预算、取消或实际请求预算不足会结束运行；成功后替换 session，才将 `recoveryAttempts` 更新为当前次数并继续内层循环（`:879-932`）。
   - `rate_limit + retry_with_backoff`：调用可取消退避；等待完成后才更新次数并继续（`:935-957`）。
   - `server_error + retry_immediate`：同样经过可取消等待；当前延迟由 `RecoveryManager` 计算，动作完成后才更新次数并继续。
   - 当前普通自动 Recovery 还对 `network_error + retry_immediate` 生效（`recovery-manager.ts:111-119`）。这不属于 R2 首批 Provider Failure Boundary 的允许集合，但本轮不能因此删除或改变普通自动行为。

因此，自动 Recovery 的“继续”是同一 `run()`、同一 Harness 内层循环的 `continue`，不是 `resume()`，也不创建新的 Agent 循环。恢复动作未完成前不会消费恢复次数；恢复动作完成后才写入 `executionState.recoveryAttempts = completedRecoveryAttempts + 1`。该计数没有被重置，`maxProviderRetries` 和 `maxResumeAttempts` 仍是 `RecoveryBudget` 字段，但当前运行路径没有消费它们。

### 15.2 三分支条件表

| 结果 | 当前是否可达 | 当前触发条件与判断顺序 | 决定者与结果 |
| --- | --- | --- | --- |
| **继续自动 Recovery** | 是 | Provider 异常返回；AbortSignal 未取消；`RecoveryManager.evaluate()` 不是 `fail_run`；普通运行预算、总期限和后续压缩/请求预算仍有效。`context_overflow`、`rate_limit`、`server_error` 以及当前普通路径的 `network_error` 分别按既有动作继续。 | `RecoveryManager` 选择动作，Harness 执行动作并继续原内层循环。R2 Boundary 校验目前只是一项未接入的纯校验，不能触发停机或 checkpoint。 |
| **停止并建立可恢复点** | **否** | 当前没有可信的停止请求、分流字段、保存触发器或 Harness 分支。`RunState` 虽声明了 `resumable`，但 `firefly-harness.ts` 中没有将 Provider catch 的运行写入 `resumable`；最终结算只写 `completed`、`cancelled`、`timed_out` 或 `failed`（`:1406-1414`）。 | 当前不存在决定者。`provider-failure-boundary.ts` 也没有被 Harness 导入或调用；它只返回纯校验结果，不封存、不保存、不释放资源。 |
| **直接终止且不可恢复** | 是 | 最高优先级是 AbortSignal/总期限；其次 `RecoveryManager` 返回 `fail_run`（取消分类、恢复次数耗尽、上下文压缩额度耗尽、fatal/未知错误）；自动压缩失败、任务事实超预算、完整输入预算不足、工具/委派/轮次预算耗尽也会设置错误或超时终态。 | Harness、`RecoveryManager` 和现有预算门共同决定。运行随后保存 `run_completed` 诊断 checkpoint；当前 `ResumeProtocol` 对这些旧快照仍 fail-closed，不重新调用 Provider 或工具。 |

### 15.3 当前源码不存在“停止并建立恢复点”的触发来源

不能把以下事实当作该触发来源：

- 允许的分类/动作组合：它只表示 Provider/Recovery 事实符合 `provider-failure-boundary.ts` 的 R2 首批格式，当前不会改变自动 Recovery；
- 恢复次数耗尽：当前 `RecoveryManager` 直接返回 `fail_run`，且本轮固定要求不得将其升级为 R2；
- `RunState.resumable` 或允许的状态转移：`src/main/orchestrator/recovery/execution-state.ts:6-17,62-88` 只声明类型和合法转移，未提供实际写入路径；
- `recovery_started`、`compaction_completed`、`run_completed` checkpoint：这些是运行内诊断保存触发器，不是可恢复资格建立；
- `run:resumed` 事件类型：`src/shared/agent-types.ts:329-334` 只是类型声明，R1/R2 当前没有发送点。

当前生产代码因此只能实际到达“自动继续”或“直接终止”两类，不能诚实地给出一条已经存在的“Provider 失败 → 停止原运行 → 保存可恢复点”路径。声称该路径已经可达会与 `FireflyHarness` 的 Provider catch 和 R1 `resume()` 实现矛盾。

### 15.4 必要的最小机制（设计提案，尚未实施）

要增加第三分支，必须新增一个由同一 Harness/R2 恢复所有者控制的、非用户输入、非模型输出、非公共 IPC 的内部分流事实。下面名称均为**设计提案**，不是当前字段：

```text
RecoveryDisposition =
  | "automatic_recovery"   // 保持当前行为
  | "stop_for_resume"       // 停止并尝试建立可恢复点
  | "terminal_failure"      // 直接终止
```

最小规则如下：

1. Provider catch 先按当前顺序处理取消、总期限和运行/恢复预算，再由现有 classifier/RecoveryManager 产生结构化事实。没有显式的内部 `stop_for_resume` 请求时，选择 `automatic_recovery`，不因 Boundary 校验通过而自动停止。**当前生产代码尚未确定 `stop_for_resume` 的触发者或触发条件。**
2. 只有在可信 R2 内部调用方明确请求 `stop_for_resume` 时，才调用 `createProviderFailureBoundary()` 并要求三组首批分类/动作精确匹配。缺失、错配、`network_error`、取消、超时或预算耗尽都不能进入可恢复点；显式停止模式下应直接返回结构化资格失败，不静默改成另一次自动重试。
3. 分流必须发生在当前 `recovery:started` 和具体退避/压缩动作之前，并且三种 disposition 互斥。`stop_for_resume` 选择后不能调用 `waitForCancellableDelay`、不能做 emergency compaction、不能 `continue` 到 Provider 请求，也不能发出 `recovery:completed`。
4. 停止分支不把尚未执行的动作记为已完成。它保存 `ProviderFailureBoundary.action`、当前已完成恢复次数、原始轮次/工具/总期限剩余量和无工具/无审批/无委派事实；恢复动作保留为“可执行的下一动作”，而不是制造一次成功或已执行记录。
5. 只有原运行已经排他封存、资源释放、快照写入成功并读回验证后，才建立恢复资格；任一步失败都直接终止且不可恢复。既有文档第 4、8、11 节的 claim、单调时钟、读回和 `run:resumed` 规则继续适用。
6. 恢复时先消费源快照/恢复链 claim，再以保存的剩余动作和剩余预算进入同一 Harness 循环。恢复实例不继承旧的 `stop_for_resume` 请求；Provider 再次失败时必须重新产生新的结构化边界并重新判断，不能因为旧边界仍在消息或摘要中而再次无条件停止。这样可避免“恢复后再次自动停机”与“旧快照重放”。

这项设计需要的最小新增机制是：内部 disposition 输入及其唯一所有者、停止分支的互斥状态转换、可恢复快照的结构化保存/读回结果、恢复链的排他 claim，以及恢复时携带剩余动作/预算的同一 Harness 入口。它不要求新增 Agent loop、审批、IPC 或产品入口；但它也不是当前已有开关，不能在本轮伪装成已经存在。

### 15.5 当前可达的自动路径与尚不可达的停止设计

#### 当前实际可达的自动路径（不停止）

`tools/test/core/recovery.test.ts:679-724` 的端到端测试提供了实际生产调用链证据：Provider 第一次返回 `503 Service Unavailable`，`ErrorClassifier` 得到 `server_error`，`RecoveryManager.evaluate(..., 0)` 返回 `retry_immediate`，Harness 完成一次恢复后再次调用 Provider，第二次返回正常 assistant 消息并完成。该路径没有 `run:resumed`，也没有 R2 快照资格；它证明当前自动 Recovery 会继续，而不是停止。

`tools/test/core/harness.test.ts:628-702` 还覆盖了首次上下文超限进入 emergency compaction、压缩额度耗尽和压缩失败；`:704-751` 覆盖退避期间取消/总超时。这些测试支持“自动动作完成才继续、取消/超时不被预算结算覆盖”的现状，但没有覆盖停机保存恢复点，因为生产入口不存在。

#### 设计中的“停止并保留动作”路径（当前不可达，不是生产恢复路径）

在不虚构当前入口的前提下，最小、可审查的后续路径是：

```text
503 Provider failure
  -> AbortSignal/总期限/预算仍有效
  -> ErrorClassifier: server_error
  -> RecoveryManager: retry_immediate
  -> 可信内部 disposition = stop_for_resume
  -> ProviderFailureBoundary 校验通过
  -> 不执行 retry_immediate，不发 recovery:completed
  -> 停止原运行、释放资源、保存并读回恢复点
  -> 记录剩余 retry_immediate 与原始剩余预算
  -> 后续同进程唯一 claim 后，进入同一 Harness 循环执行一次恢复动作
```

这只是后续机制的设计示意，不是当前生产路径。若未来实现，它不会同时进入自动重试，是因为 disposition 在当前动作执行前一次性选择且互斥；`retry_immediate` 只是保存的尚可执行事实，不是本次已执行动作。恢复后不会再次无条件停止，是因为源 claim/stop intent 已消费，恢复实例从“继续执行已保存动作”阶段开始；后续只有新的 Provider 失败、新的边界和新的可信停止请求才能再次选择 `stop_for_resume`。

这条路径在当前工作树仍是**待实施设计路径**，不是当前测试或生产行为，也不能称为可达的生产恢复路径。当前缺口的精确触发输入是：没有内部 `stop_for_resume` 事实，且该事实的生产触发者与触发条件尚未确定；当前还缺少与之配套的封存、保存/读回、claim 和剩余动作载体。下一轮实施前必须先确认该内部触发由谁产生；不能用恢复次数耗尽、模型文本、历史摘要或最终错误文案替代。

### 15.6 本轮复核结论与验证边界

- 已核对 `provider-failure-boundary.ts`、`RecoveryManager`、`ErrorClassifier`、Harness Provider catch、自动压缩/退避、预算门、checkpoint 触发和 `ResumeProtocol`。
- 现有定向测试的位置和断言已记录：`recovery.test.ts:11-15` 覆盖运行内分类/恢复/取消等待，`:16-21` 覆盖 Boundary 纯校验及本轮新增冲突优先级/原型属性拒绝；`harness.test.ts:18-22` 覆盖上下文恢复、压缩失败、退避取消和总超时。
- 本轮执行了 `npm run build:main` 和 `node --experimental-strip-types tools/test/core/recovery.test.ts`；未启动应用、未请求模型、未访问网络。R1 继续全部拒绝，生产自动 Recovery 未改变。
- 本轮只更新本设计文档；R1 继续全部拒绝，生产自动 Recovery、Checkpoint schema、Resume、Browser、音乐、Worker 和授权边界未修改。

## 16. R2 内部验证入口设计（实施前记录）

本节只定义下一批实施封存前的**测试控制注入**。它不是生产停止请求、不是恢复入口，也不改变当前自动 Recovery。当前源码中不存在下列新增字段、类型或方法；名称均标注为**设计字段**。

### 16.1 当前唯一可用的构造与调用边界

| 位置 | 当前源码事实 | 本轮结论 |
| --- | --- | --- |
| `src/main/orchestrator/harness/firefly-harness.ts:56-70` | `FireflyHarnessOptions` 是 Harness 构造依赖入口，当前没有 R2 停止控制字段。 | 测试控制只能从此依赖边界注入；不放入用户运行输入。 |
| `src/main/orchestrator/harness/firefly-harness.ts:241-269` | `FireflyHarness` 持有唯一执行循环、`RecoveryManager`、`CheckpointManager` 和 `activeRuns`；构造时接收选项。 | Harness 是分流调用者和本次运行生命周期所有者。 |
| `tools/test/core/harness.test.ts:41-46` | 现有测试辅助函数直接 `new FireflyHarness({...})`，并可传入 `Partial<FireflyHarnessOptions>`。 | 下一批验证可沿用这个实际入口，不需要改 `AgentRunInput` 或公共 IPC。 |
| `src/main/orchestrator/harness/firefly-harness.ts:378-431` | `run()` 生成/接收 `runId`，建立本次 `AbortController`，写入 `activeRuns` 并设置总期限。 | 测试使用现有 `AgentRunInput.runId` 指定目标运行；不新增目标字段。 |
| `src/main/orchestrator/harness/firefly-harness.ts:843-961` | Provider 异常先检查 AbortSignal，再调用 `RecoveryManager.evaluate()`；当前随后直接进入 `recovery:started`、emergency compaction 或可取消退避。 | 唯一分流点位于 `evaluate()` 返回后、`:865` 的恢复次数计算和 `:866-877` 的 `recovery:started` 之前。 |
| `src/main/orchestrator/firefly-agent-core.ts:24-38,51-73` | `FireflyAgentCoreOptions` 是稳定公共组装契约，构造时没有测试控制，也没有向 Harness 转发该字段。 | 不向 `FireflyAgentCoreOptions` 增加控制字段，避免生产 Core 暴露停止入口。 |
| `src/main/application/default-dependencies.ts:730-738` | 生产只组装 `FireflyAgentCore`，没有直接创建 Harness。 | 默认生产组合不启用测试控制；该字段保持 `undefined`。 |

当前 `resume()` 在 `firefly-harness.ts:322-376` 通过 `ResumeProtocol` 读取后直接返回 R1 拒绝，不进入 `run()`。本轮设计不改变这一点。

### 16.2 唯一注入方案（设计字段）

下一批只在 `FireflyHarnessOptions` 增加一个可选的内部测试依赖：

```text
RecoveryTestStopControl（设计类型）
  requestStopForRun(runId: string): void
  consumeStopForResume(runId: string, boundary: ProviderFailureBoundary): boolean
  clearRun(runId: string): void

FireflyHarnessOptions.recoveryTestControl（设计字段）
  类型：RecoveryTestStopControl | undefined
```

所有名称都是设计名称，不是当前源码字段。其边界和所有权如下：

- 测试夹具创建一个与单个 Harness 实例绑定的控制对象，并在调用现有 `run({ runId })` 前用 `requestStopForRun(runId)` 预置精确目标。测试必须使用明确且唯一的 `runId`；不支持全局通配符。
- `RecoveryTestStopControl` 只保存测试请求的短生命周期状态；`consumeStopForResume()` 必须按精确 `runId` 查找，并在返回 `true` 的同一同步调用中删除该请求，保证一次性消费。不同 `runId` 不共享消费结果。
- `FireflyHarness` 是唯一调用 `consumeStopForResume()` 的生产执行所有者；测试控制对象不能调用 `RecoveryManager`、`CheckpointManager`、Provider、工具、Approval 或事件总线。
- `clearRun(runId)` 由 Harness 的本次运行清理路径调用，用于目标运行在没有合格边界就取消、超时、预算耗尽或正常终止时清除未消费请求。已消费请求也保持清除后的状态。
- 控制对象不放入 `AgentRunInput`、`FireflyAgentCoreOptions`、Settings、Renderer、用户消息、模型输出或公共 IPC。`FireflyAgentCore` 和 `default-dependencies.ts` 不转发、不创建该字段。
- 默认生产组装中 `recoveryTestControl` 为 `undefined`。字段缺失时，Provider catch 必须保持当前自动 Recovery 分支，不产生任何停止选择。

该方案没有新增全局 Map、事件总线或第二个运行循环；请求状态属于测试控制实例，运行清理仍由 Harness 的 `finally` 生命周期协调。

### 16.3 测试控制的实际生效门

控制请求不是“收到 Provider 错误就停”。Harness 只有在以下事实全部成立时才调用 `consumeStopForResume()`：

1. 当前 `runAbortController.signal.aborted === false`，且 `timedOut === false`；现有 Provider catch 的 AbortSignal 优先级保持不变。
2. 当前运行仍未触发轮次、工具、委派、总期限或任务事实预算终止；预算门仍由现有 Harness 检查，不由测试控制覆盖。
3. `RecoveryManager.evaluate(providerErr, executionState.recoveryAttempts)` 返回的动作不是 `fail_run`。
4. 当前分类和动作通过现有 `createProviderFailureBoundary()` / `validateProviderFailureBoundary()` 的首批规则：仅 `context_overflow + retry_with_compaction`、`rate_limit + retry_with_backoff`、`server_error + retry_immediate`；取消、超时、预算耗尽、恢复额度耗尽、`network_error`、`fatal` 和动作错配不能通过。
5. 当前运行满足 R2 首批的 MAIN、无在途工具、无待审批、无委派条件。现有 Harness 已有 `executionProfile`、`workerRun`、`mainDelegationService` 等局部事实，但没有一个现成的“R2 合格性快照”字段；下一批实施必须在 Harness 内用实际状态形成一次性门控，不得从消息文本推断这些事实。

第 4 项只证明 Provider Failure Boundary 合格，不建立恢复资格；第 5 项也不是当前已有的恢复入口。若任一门不满足，测试请求不消费，当前自动 Recovery 继续按现有 `RecoveryManager` 决策执行，或按现有终止路径结束。

### 16.4 预期调用顺序

下一批实现时，Provider catch 的唯一顺序应保持为：

```text
Provider 请求异常
  -> 现有 AbortSignal / 总超时优先检查
  -> 读取 executionState.recoveryAttempts
  -> RecoveryManager.evaluate(providerErr, completedRecoveryAttempts)
  -> 若 action = fail_run：现有 recovery:failed + 终止，不调用测试控制
  -> 构造并纯校验 ProviderFailureBoundary
  -> 若边界不合格：不调用测试控制，继续现有自动 Recovery 或现有终止
  -> 检查 MAIN / 无在途工具 / 无待审批 / 无委派及剩余预算
  -> recoveryTestControl.consumeStopForResume(runId, boundary)
  -> 若返回 false：进入现有 recovery:started、压缩/退避、完成后递增次数并 continue
  -> 若返回 true：选择 stop_for_resume；本次不发送 recovery:started，不执行压缩/退避，不递增恢复次数，不发送 recovery:completed，不 continue 到下一次 Provider
```

选择 `stop_for_resume` 必须发生在当前 `firefly-harness.ts:865` 的 `recoveryAttempt` 计算、`:866-877` 的 `recovery:started`/checkpoint 和 `:879-957` 的压缩/退避之前。它只保留尚可执行的 Boundary 动作事实；本轮尚未实现封存、保存、读回或恢复，因此不能在这里发送 `run:resumed` 或声称建立了恢复点。

### 16.5 一次性、并发和恢复实例规则

- 同一测试控制实例按 `runId` 隔离；目标运行的第一次**合格** Boundary 消费一次请求。合格之前的取消、超时、预算耗尽或不允许分类不消费该请求，但运行终止时由 `clearRun()` 清理。
- 另一个运行的 Provider 失败不能消费目标运行请求。两个不同 `runId` 可以各自有独立测试请求；不允许使用一个共享布尔值代表所有运行。
- 同一原运行的 Provider catch 只有当前 Harness 循环可以调用控制；消费动作必须同步完成，不能在“检查是否存在”与“标记已消费”之间 `await`，以免同一边界并发消费两次。
- 当前 `activeRuns` 只按 `runId` 保存 AbortController（`firefly-harness.ts:253,418-423,1370-1373`），因此测试不得复用相同 `runId` 并发启动；这属于测试前置条件，不新增第二个并发所有者。
- 恢复实例不接收 `recoveryTestControl`，不复制原控制对象的未消费请求，也不继承 `stop_for_resume`。未来恢复实际开始后，Provider 再次失败回到当前 `RecoveryManager.evaluate()` 的自动判断；只有新的测试预置、新的 Boundary 和新的明确分流决定才能再次选择停止。
- R1 当前仍拒绝所有 `resume()`；因此上述“恢复实例”规则是后续 R2 设计约束，不是当前可执行行为。

### 16.6 测试入口可达与生产入口未启用

| 范围 | 本轮状态 | 判定方式 |
| --- | --- | --- |
| 测试入口 | **设计可达，尚未实施** | 沿用 `tools/test/core/harness.test.ts:41-46` 的直接 Harness 构造，在下一批传入 `recoveryTestControl`，用显式 `runId` 和受控 Provider 失败验证一次性消费。 |
| 生产入口 | **未启用** | `FireflyAgentCoreOptions`、`default-dependencies.ts`、`AgentRunInput` 和 IPC 均不接收该控制；默认 `FireflyHarnessOptions` 不提供它。 |
| 当前生产恢复路径 | **不可达** | `provider-failure-boundary.ts` 当前仍未接入 Harness；`resume()` 仍在 `run()` 之前返回 R1 fail-closed。 |

下一批固定验证顺序为：目标运行的合格失败只触发一次停止选择；非目标运行不受影响；取消/超时/预算/不允许分类不建立恢复点；停止选择发生在退避/压缩前且不递增恢复次数；控制请求不出现在恢复实例；默认未注入时现有自动 Recovery 测试保持原结果。以上均需通过真实 Harness 调用验证，不能只测试控制对象纯函数。

### 16.7 实施前边界记录

- 本节记录的是实施前的边界：当时只允许更新设计，不修改 `FireflyHarness`、`FireflyAgentCore`、`AgentRunInput`、Checkpoint schema、`ResumeProtocol` 或任何公共入口。实际实施结果以第 17 节为准。

## 17. 本轮实际实施（以本节为当前有效契约）

本轮已将首批 R2 从设计接入同一个 `FireflyHarness` 循环。第 4、5、8、11、16 节中标为“尚未实施”的描述是实施前记录；当前有效事实以本节和源码为准。

### 17.1 实际新增/修改位置

| 文件 | 实际职责 |
| --- | --- |
| `src/main/orchestrator/recovery/resume-types.ts` | 新增 R2 快照事实、预算、进程单调时钟标识、内部 `RecoveryTestControl` 和 claim 结果契约。 |
| `src/main/orchestrator/recovery/provider-failure-boundary.ts` | 从现有 Provider 分类与 RecoveryDecision 生成并校验三组允许边界；保存已有退避毫秒数。 |
| `src/main/orchestrator/recovery/checkpoint-types.ts` | 为同一 v1 Checkpoint 增加可选 `resumeFacts` 和 `resumable` 触发器。旧 v1 快照没有该事实，仍被 R1 拒绝。 |
| `src/main/orchestrator/recovery/checkpoint-manager.ts` | 保存 R2 事实的深拷贝；在本进程内以同步 Set/Map 完成同一快照和同源恢复链 claim。 |
| `src/main/orchestrator/recovery/checkpoint-policy.ts` | 将 `resumable` 纳入默认诊断快照触发器。 |
| `src/main/orchestrator/recovery/resume-protocol.ts` | 对新 `resumable` 快照校验原运行、消息身份、无活动工具、R2 Provider 边界、预算和时钟事实；旧快照继续返回 R1 拒绝。 |
| `src/main/orchestrator/harness/firefly-harness.ts` | 在 Provider catch 的现有 `RecoveryManager.evaluate()` 之后接入一次性测试控制；封存/释放/保存；`resume()` claim 后重建同一循环的消息、证据、计划、预算和待执行 Recovery 动作。恢复实例强制 `MAIN + toolSurface:none`。 |
| `src/shared/agent-types.ts` | 增加 R2 结构化拒绝代码和原运行返回的 `resumeCheckpointId` 可选字段。 |
| `tools/test/core/recovery.test.ts` | R2 三种边界、保存恢复、并发/重复 claim、已完成工具证据、恢复无工具、网络错误自动 Recovery 回归。 |
| `tools/test/core/harness.test.ts` | 更新唯一 Harness 循环源码断言以匹配预算变量。 |

### 17.2 实际停止顺序

生产默认构造没有 `recoveryTestControl`，因此普通自动 Recovery 的路径不变。只有直接构造 Harness 的内部测试可以注入该控制；`FireflyAgentCore`、组合根、`AgentRunInput`、Settings、Renderer 和 IPC 均不接收它。

合格 Provider 失败的实际顺序是：

```text
Provider catch
  -> AbortSignal 已在原有位置优先检查
  -> RecoveryManager.evaluate()
  -> createProviderFailureBoundary() 纯校验
  -> MAIN / user / 无活动工具 / 无委派 / 无 required-tool 门控
  -> recoveryTestControl.consumeStopForResume(runId, boundary)
  -> 一次性停止选择
  -> abort 当前 Controller、清理总期限 timer、移除 activeRuns
  -> 清空已完成调用的 activeToolCalls（证据留在 completedToolEvidence）
  -> 保存 trigger=resumable 的 R2 Checkpoint
```

停止选择发生在 `recovery:started`、退避和 emergency compaction 之前；不递增 `recoveryAttempts`，不发送 `recovery:completed`，不继续原 Provider 请求。保存异常或策略关闭返回 `checkpoint_save_failed` 运行错误，不能建立恢复资格。保存成功的原运行返回非成功 `AgentRunResult`，同时带 `resumeCheckpointId`；不发送正常 `agent:final-answer`，也不追加 `run_completed` 覆盖该可恢复快照。

### 17.3 实际恢复顺序与排他规则

`FireflyHarness.resume()` 先读取 Checkpoint，再由 `ResumeProtocol.evaluate()` 验证 `runState=resumable`、`resumeFacts.protocol/version`、原始 user prompt、Main 边界、任务事实消息身份、活动工具为空、三组 Provider 边界、剩余预算和原始进程时钟。随后检查原 run 不在 `activeRuns`、期限未到且调用信号未取消。

所有检查通过后，`CheckpointManager.claimResume()` 在同一同步调用中占用：

- 同一 `checkpointId` 第二次或并发调用返回 `resume_already_claimed`；
- 同一 `originRunId` 的不同非 successor 快照返回 `resume_chain_claimed`；
- 只有 generation 加一且 `parentCheckpointId` 指向上一代的 successor 才满足链关系；
- claim 在本进程内不自动释放，进程重启不继承该 claim；新的进程时钟也会使旧 R2 事实返回 `resume_clock_mismatch`。

claim 成功后，恢复调用 `runInternal()`，不是普通 `run()` 的空 prompt 路径。恢复使用快照中的消息和已完成 `AgentToolCallEvidence`，从原始 `consumedRounds`、`consumedToolCalls`、`consumedRecoveryAttempts`、原始上限和 `monotonicDeadline` 继续。已保存的 Provider action 在同一循环中先执行：`retry_with_compaction` 使用现有 ContextManager emergency 路径；`retry_with_backoff`/`retry_immediate` 使用现有可取消等待。只有动作成功进入 Provider 后才递增恢复次数。

`run:resumed` 在 active execution 已登记、claim 和预算重建完成、同一循环即将开始时发送一次。恢复后的 `toolSchemas` 为空；如果 Provider 返回工具调用，返回 `resume_tool_execution_not_allowed`，不进入授权或 ToolExecutionEngine。已完成工具只作为原始 assistant/tool 配对和证据保留，不重放。

工具预算耗尽时，R2 不恢复工具调用；如果仍有轮次和期限，空工具面 Provider 总结仍可执行，因为本批把工具预算解释为“禁止新工具调用”，而不是把已完成证据抹掉。若轮次或单调期限没有余量，则在 Provider 前返回 `resume_budget_expired`。

### 17.4 实际自动 Recovery 保持范围

`RecoveryManager` 仍是普通运行的 Recovery 决定者。`network_error` 仍按原有 `retry_immediate` 自动恢复；它不满足 R2 Boundary 的三组允许集合，内部测试控制不会截停它。`maxProviderRetries`、`maxResumeAttempts` 仍未被现有运行路径消费，本轮没有启用或删除。取消、总超时、预算耗尽、`fail_run`、未知工具副作用、审批和 Worker 均不能建立 R2 快照。

### 17.5 实际测试覆盖

当前定向测试已使用编译后的 Main 实现通过：

| 测试 | 实际断言 |
| --- | --- |
| `recovery.test.ts:22` | `context_overflow + retry_with_compaction`、`rate_limit + retry_with_backoff`、`server_error + retry_immediate` 分别封存并在同一 Harness 恢复；Provider 两次，`run:resumed` 一次。 |
| `recovery.test.ts:23` | 同一快照的 `Promise.all` 并发恢复和再次恢复只有一个 Provider 执行，另一侧精确返回 `resume_already_claimed`。 |
| `recovery.test.ts:24` | 已完成工具调用的 assistant/tool 配对和证据随快照保留；恢复 Provider 无工具 Schema，工具执行次数不增加。 |
| `recovery.test.ts:25` | 恢复 Provider 产生新工具调用时直接非成功结束，不授权、不 dispatch。 |
| `recovery.test.ts:26` | 内部控制请求不截停 `network_error`，既有自动 Recovery 仍完成。 |
| `recovery.test.ts:5-9` | 旧快照、终态、损坏、缺失和不支持版本继续 R1 结构化拒绝，Provider/工具调用为零。 |
| `harness.test.ts:1-29` | 普通 Chat、工具循环、普通 Recovery、emergency compaction、取消、超时、预算和任务事实回归。 |

本轮已执行并通过 `npm run build:main`、`node --experimental-strip-types tools/test/core/recovery.test.ts`（33/33）、`node --experimental-strip-types tools/test/core/harness.test.ts`（29/29）、`npm run typecheck`、`npm run build`、`npm test`、`npm run verify:typescript`、`npm run verify:architecture` 和 `git diff --check`。完整测试入口以退出码 0 完成；测试运行中的既有警告不改变通过结果。

### 17.6 尚未开放与限制

- 没有生产默认的 `stop_for_resume` 触发来源；只有内部 Harness 测试控制可建立 R2 快照。
- 没有新的 IPC/UI/Chat 恢复入口；没有应用组合根自动保存 R2 快照。
- 只支持同一进程时钟和同一个 `CheckpointManager` 所有者；跨进程文件快照因 clock/claim 事实不能恢复。
- 不恢复工具前、审批、Worker、委派或工具结果未知状态；不重放任何外部副作用。
- R2 首批没有 Browser/音乐/TTS/Memory/RAG/主动行为接入变化。
- `Checkpoint` 版本号仍为 `1`，`resumeFacts` 是可选扩展；缺少该字段的历史 v1 快照不会被当作新 R2 快照。
- 原运行封存、R2 快照保存/读回、同进程 claim、单调时钟复查和 `run:resumed` 已在本批实现；本批没有新增公共授权入口，也没有扩大到工具前、审批、Worker 或委派恢复。
- 本批未启动应用、未请求真实模型、未访问公网；R1 对旧快照和不完整事实继续拒绝，生产自动 Recovery 保持原行为。

### 17.7 本轮审阅返修

- `CheckpointManager.createCheckpoint()` 在保存后重新读取并按序列化结果核验；R2 可恢复快照延迟发布 `checkpoint:created`，只有核验且通过取消/期限复查后才发布。读回失败、保存异常或保存期间用户取消/原始期限耗尽都会使该快照进入进程内失效表，`resume()` 返回 `resume_checkpoint_invalidated`，不创建运行。
- Harness 使用独立的内部资源中止标记；内部封存释放不会被误记为用户取消，`input.signal` 取消和原始单调期限在保存返回后再次复查，分别结算为取消或超时。Checkpoint ID 增加本管理器序号，避免同毫秒收尾快照覆盖已写入的 R2 快照。
- `ResumeProtocol` 在读取任何嵌套字段前校验 `resumeFacts`、`budget`、工具证据、消息身份和 Provider boundary；缺失或 `null` 返回 `resume_eligibility_invalid`，不抛未处理异常、不调用 Provider 或工具。
- `ResumeCheckpointFacts` 新增 `executionRunId`：`originRunId` 表示恢复链原始运行，`executionRunId`/`Checkpoint.runId` 表示当前快照所属执行；同链 claim 另外保存上一轮实际恢复执行者，后继快照必须与该执行者匹配，不能仅凭父快照和代数通过。
- 新增 `recovery.test.ts:27-32` 覆盖保存期间取消/期限、读回不一致、嵌套损坏输入、实际执行者 claim 和合法后继快照；定向 Recovery 测试实际为 33/33。

### 17.8 计划执行入口接入 V1（当前有效补充）

`FireflyAgentCore.runRequiredPlan()` 是新增的 Main-only 结构化入口，实际
实现位于 `src/main/orchestrator/planning/plan-execution-entry.ts` 和
`src/main/orchestrator/firefly-agent-core.ts`。调用方必须明确提供
`planExecutionMode: "required"`、非空有界 `steps`，并为每一步预先提供
`completionRequirement: "analysis" | "tool"`。入口固定使用现有
`source: "user"` 与 `MAIN + allowSubAgentDelegation`，复制步骤后进入同一个
`FireflyHarness.run()`；它没有新增 Agent 循环、权限链或执行引擎。

当前 `registerChatIpc()` 仍只接受普通 `{ message, history }` 请求，Renderer
不能选择该模式；组合根也没有用户可达的执行计划页面或 IPC 调用者。因而
该入口在 Main 源码层可调用，但默认 Chat 产品路径本轮不会启用 required，
也不会通过关键词、`daily/work` 或模型文字推断。普通 Chat 与旧辅助规划
行为保持不变。

`FireflyAgentCore.run()` 对直接传入的运行输入再次执行运行时校验：非法模式、
缺失/畸形结构化步骤和旧字符串步骤在 Provider、工具、事件和 Checkpoint
之前返回非成功结果。旧字符串步骤仍可用于 assist/未指定的辅助计划，但不会
被当成 required 计划的分析步骤。

R2 尚未保存并重建 required 计划的完整事实。因此 Harness 的内部
`stop_for_resume` 边界明确排除 `planExecutionMode: "required"`；这类运行继续
走既有自动 Recovery，但不建立 `resumable` 快照。`ResumeCheckpointFacts` 的
新增可选 `planExecutionMode` 仅记录新生成的 assist 标记；若诊断快照明确标为
`required`，`ResumeProtocol` 以 `resume_eligibility_invalid` 拒绝，因为当前
快照没有足够的计划事实可安全恢复。R2 不把 required 降级为 assist，也没有
新增恢复入口。该规则不改变普通/assist R2 恢复。

本轮受影响定向验证为 planning 33/33、Recovery 36/36、Harness 37/37、
AgentCore 13/13；另通过 `npm run typecheck`、`npm run build`、TypeScript
Guard、Architecture Guard 和 `git diff --check`。本轮没有启动应用、请求真实
模型或访问网络，也没有重复完整 `npm test`；此前完整验证记录保留为历史结果。
