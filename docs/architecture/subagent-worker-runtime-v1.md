# Firefly V1.1.1 — SubAgent Worker Runtime V1

## 状态

Worker Runtime V1 已接入本地工作树，未提交、未推送。该轮只提供受边界约束的功能型 worker，不接入 Main Agent 的委派决策。

## 唯一执行链

```text
SubAgentTask
  ↓
SubAgentWorkerRuntime
  ↓
WORKER execution profile
  ↓
canonical FireflyHarness loop
  ↓
HarnessAuthorizationAdapter
  ↓
CapabilityAuthorizationPipeline
  ↓
AuthorizedInvocationBridge
  ↓
ToolExecutionEngine
  ↓
structured SubAgentResult
```

`SubAgentWorkerRuntime` 只负责任务到运行的编排、预算、取消和生命周期写回。它不创建新的循环、工具注册表、授权管线、沙箱评估器、审批服务、执行引擎或事件总线。

## 生产组成

生产组合根是 `src/main/index.ts`。当前只注册一个功能描述：

- id: `music-status-worker-v1`
- name: `Music Status Worker`
- capability: `music.status.read`
- capability 不等于授权；实际请求仍须经过完整授权链
- `music.control` 不在 worker 的声明能力面内

描述元数据位于 `src/main/runtime/subagents/subagent-worker-runtime.ts`，任务状态仍由 `SubAgentTaskService` 持有，描述查找仍由 `SubAgentRegistry` 持有。

## Worker 执行配置

`WorkerExecutionProfile` 只携带以下内容：

- `SubAgentId`
- `TaskId`
- `CapabilityRequester`（`type: "subagent"`，含 `subAgentId`、`taskId`、可选 `parentRunId`）
- 当前 worker 的 `AbortSignal`
- 功能目标
- 显式只读上下文投影
- 由 capability binding 推导的工具 id
- `maxSteps`、`maxToolCalls`、`timeoutMs`、`maxDepth`

Worker 使用独立的功能型 system prompt。它不会携带 Main transcript、Main 的角色状态、长期记忆、RAG 上下文或渲染层状态。生产实现只投影 `task_input`，不从其他上下文服务读取数据。运行时的 `activeRuns` 只保存 task 到 AbortController/runId 的短暂关联，不是第二个任务状态源。

Worker 运行跳过持久化 checkpoint；工作 transcript 只存在于该次 Harness 调用的内存 session 中。返回值只写回结构化 `SubAgentResult`，不直接进入用户聊天、语音或 renderer。

## 工具面与授权

Harness 在向模型发出请求前，按 `allowedToolIds` 过滤 canonical registry 的 schema。模型即使返回未声明的 tool call，也会在 `executeToolRound` 中得到确定性错误：

```json
{
  "ok": false,
  "error": "worker_capability_not_declared"
}
```

该调用不会直接落到执行引擎，也不会绕过授权适配器。已声明的 `music_status` 仍经过：

1. `HarnessAuthorizationAdapter`
2. `CapabilityAuthorizationPipeline`
3. `SandboxPolicyEvaluator`
4. 共享 `ApprovalService`（策略需要时）
5. `AuthorizedInvocationBridge`
6. 共享 `ToolExecutionEngine`

多工具同轮请求继续遵守审批 barrier：前一个调用等待审批时，后续调用不执行并返回 deferred observation。

## 任务生命周期

`SubAgentWorkerRuntime` 只允许 V1 root task：`depth` 必须为 `0`，不能带 `parentTaskId`。嵌套 worker 任务被 `INVALID_DELEGATION_DEPTH` 拒绝。

正常生命周期为：

```text
pending → running → succeeded
                  ↘ failed
                  ↘ cancelled
```

terminal record 不会被再次改写。取消会沿 `AbortSignal` 传递给 Harness、审批等待和工具执行；取消与完成之间的竞态由 task state 再检查保证只产生一个 terminal transition。

超时产生 `TIMEOUT` 结构化失败。运行预算由 task constraints 覆盖到 Harness 的 step、tool-call、timeout 边界；worker 不可递归创建新的 worker task。

## 事件

共享 `AgentEventBus` 增加以下 worker 生命周期事件：

- `subagent:started`
- `subagent:completed`
- `subagent:failed`
- `subagent:cancelled`

事件只表达生命周期事实，不承载完整 worker transcript，也不触发 TTS 或 renderer 行为。

## 测试覆盖

`tools/test/runtime/subagent-worker-runtime.test.mjs` 覆盖：

- canonical Harness loop 与共享执行引擎
- capability/tool schema 过滤
- 未声明工具的确定性拒绝
- subagent requester 与 parent lineage
- Sandbox、Approval、Bridge、Engine 同链路
- approval pending → approved
- cancellation、timeout、terminal race 保护
- tool-call 与 step budget
- nested worker depth rejection
- 功能 prompt、上下文隔离和 checkpoint 跳过
- 不创建第二套 runtime owner 的架构守卫

## V1 明确不做

- Main Agent 委派决策与 delegation tool
- worker-to-worker delegation
- worker 对 Memory、RAG 或偏好记忆的写入
- `music.control` worker 能力
- 独立 Harness、独立 tool registry、独立授权或独立执行器

后续若需要委派入口，应单独设计 `MAIN AGENT DELEGATION INTEGRATION V1`，并继续复用本契约定义的唯一执行链。
