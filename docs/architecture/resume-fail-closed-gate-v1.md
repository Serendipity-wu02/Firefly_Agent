# Firefly V1.1.1 — Resume V1 R1 Fail-closed Gate

## 范围与状态

本轮只收紧既有 `resume()` API 的失败边界，不开放 IPC、Renderer 或应用层恢复入口，不修改 Checkpoint schema，不接入 `FileCheckpointStore`，不实现 R2 的恢复绑定、授权复查或预算续接。

版本保持 `1.1.1`。生产调用链仍没有 Chat、IPC、Renderer 或应用层 Resume 调用者。

## 当前入口

现有 API 链为：

```text
IAgentCore.resume()
  → FireflyAgentCore.resume()
  → FireflyHarness.resume()
  → CheckpointManager.restoreCheckpoint()
  → ResumeProtocol.evaluate()
```

定义位置：

- `src/shared/agent-core.ts`
- `src/main/orchestrator/firefly-agent-core.ts`
- `src/main/orchestrator/harness/firefly-harness.ts`
- `src/main/orchestrator/recovery/checkpoint-manager.ts`
- `src/main/orchestrator/recovery/resume-protocol.ts`

R1 删除了 `ResumeProtocol` 通过后调用普通 `run()` 的路径。旧快照只可读取和诊断，不能重新调用 Provider、ToolExecutionEngine 或 Approval。

## 结构化拒绝契约

新增共享返回类型：

- `AgentResumeRejectionCode`
- `AgentResumeRejection`
- `AgentResumeRejectionResult`
- `AgentResumeResult`

位置：`src/shared/agent-types.ts`。

拒绝码为：

| 拒绝码 | 含义 |
|---|---|
| `checkpoint_not_found` | 存储中没有指定快照 |
| `checkpoint_invalid_format` | 文件不是可解析的 Checkpoint 格式 |
| `checkpoint_unsupported_version` | 快照版本不受支持 |
| `checkpoint_terminal` | 快照处于完成、取消、失败或超时终态 |
| `checkpoint_facts_missing` | 非终态快照缺少 Resume V1 所需的不可变执行事实 |

拒绝结果使用现有非成功状态：`status: "error"`、`terminationReason.kind: "error"`、空 `finalText`、零工具调用和零轮次，并携带结构化 `rejection`。它不代表创建了新的 Agent 运行。

未知副作用不会生成“尚未执行”事实，也不会注入合成工具结果后继续运行；当前 schema 无法证明其安全状态时返回 `checkpoint_facts_missing`。

## Checkpoint 读取诊断

`ICheckpointStore` 新增读取诊断契约 `CheckpointReadResult`，但未改变保存格式：

- `found`
- `not_found`
- `read_error`
- `invalid_format`
- `unsupported_version`

文件不存在只产生 `not_found`。文件读取阶段的其他 I/O 异常产生
`read_error`，并携带 `errorCode: "io_error"`；不会被伪装成文件损坏或文件不存在。
JSON 解析失败，以及缺失或类型无效的 `version` 字段，产生 `invalid_format`。
只有格式为有限整数的版本字段才进入兼容性判断；格式有效但不是当前 schema
版本时才产生 `unsupported_version`。

`CheckpointManager.restoreCheckpoint()` 返回该读取结果。只有读取到有效快照时才发布已有的 `checkpoint:restored` 事件；R1 永远不发布 `run:resumed`。
Harness 将 `read_error` 映射为结构化拒绝码 `checkpoint_read_failed`，并保留
`readFailureCode: "io_error"`。所有这些读取结果仍然拒绝 Resume，不创建运行。

## ResumeProtocol 规则

`ResumeProtocol` 仍是唯一恢复资格判定位置：

1. 先检查 schema 版本。
2. 完成、取消、失败、超时快照返回 `checkpoint_terminal`。
3. 其他当前 schema 快照统一返回 `checkpoint_facts_missing`。
4. 不从消息、压缩摘要或 Plan 推导原始权限、执行 profile、Browser 目标或剩余预算。
5. 不构造可供 Provider 使用的恢复消息，不生成新的执行输入。

因此当前旧 Checkpoint 即使包含 Plan 或活动工具，也只能用于诊断。

## 必须保持关闭的能力

当前 Checkpoint 没有保存：

- 原始用户输入与来源的不可变绑定；
- execution profile 与工具面；
- Browser 目标、代理模式和 `networkRevision`；
- Capability、Sandbox、Approval 关联；
- 一次性授权消费状态；
- 工具调用与结果的结构化证据；
- 原始轮次、工具预算和总期限。

因此 R1 不允许同进程或跨进程继续执行。`FileCheckpointStore` 仍只是已有存储实现，未被组合根注入。

## 测试覆盖

新增和修改测试位于：

- `tools/test/core/recovery.test.ts`
- `tools/test/core/planning.test.ts`

覆盖：

- 真实 `FireflyAgentCore → FireflyHarness.resume()`；
- 完成、取消、超时、预算耗尽、Provider 失败；
- 等待审批和工具结果未知；
- 重复恢复同一快照；
- 缺失、损坏和不支持版本；
- 读取 I/O 异常、缺失版本、无效版本和格式有效但未知版本；
- Provider、工具、`run:resumed`、正常完成事件均为零；
- 原有保存/读取和运行内 Recovery 测试保持。

## 后续设计边界

R2 需要另行设计新的 Checkpoint schema 和不可变 Resume binding，至少包含原始输入、执行 profile、任务事实、工具 evidence、副作用状态、Browser scope/revision 及剩余预算。一次性授权票据不得写入或恢复。R2 未在本轮实现。
