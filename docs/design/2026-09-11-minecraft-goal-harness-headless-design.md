# Minecraft 自主任务接入 CyreneHarness（无头 run）设计

> 日期：2026-09-11（2026-09-12 二次评审修订）
> 涉及仓库：E:\Cyrene-Agent（宿主）+ E:\Cyrene-Minecraft（插件）+"E:\Cyrene-Plugins"（插件仓库）
> 状态：已二次评审修订，待开工

---

## 〇、评审修订记录

外部 review 提出 1 个阻断项 + 6 个高风险缺口，逐条对照代码验证后**全部属实**，本版全部采纳。另有一项自查新发现。

| # | review 指出的问题 | 验证位置 | 本版处置 |
|---|---|---|---|
| 1 (P0) | "不声明依赖但运行时探测"不可行：deps 白名单只注入 manifest 声明过的服务，PluginCapability 无 `agent` | src/plugins/context.ts:108-131（DEP_TO_FIELD 白名单）、src/plugins/api.ts:15 | 改为**扩展 llm 服务**：`PluginLlmService` 新增可选 `runGoal` 方法，manifest 继续只声明 `"llm"`（§6） |
| 2 | 先 buildOptions 再过滤工具，stablePrefix 工具目录与真实工具集不一致 | build-options.ts:777-792（目录由全局 capabilities 生成进 stablePrefix） | 工具集改由**插件随 runGoal 传入**；宿主用 `buildToolSystemPrompt` 对同一份冻结集合重生成目录，再拼 promptLayers（§6.3） |
| 3 | 前缀全量白名单暴露递归入口（goal 工具）与生命周期工具（connect/disconnect） | 插件 index.ts:775-796（goal 工具）、index.ts:909/928（提示词引导多步任务调 goal 工具） | goal 工具集由插件**显式策划**，排除 goal/connect/disconnect/set_cowardice；stop 拆成"只停物理动作"的任务内变体（§5） |
| 4 | "工具结果自带最新状态"不成立：goto 即发即返，等待逻辑在旧 GoalRunner 私有方法里 | 插件 index.ts:201-211（goto 立即返回）、goal-runner.ts:354（moveToAndWait 私有） | goal 工具集加**薄包装层**：等待终态 + 动作类结果附加状态行；follow 显式声明"已发起"语义（§5.2） |
| 5 | maxRounds 结算无法生成模型报告；文档的 success / 服务层 limit_reached / 现有 timeout 三套语义冲突 | cyrene-harness.ts:163-167,184-187（上限边界无模型调用）、terminal-mapper.ts:31（既有映射 max_rounds→timeout） | **沿用既有映射**（status=timeout, reason=max_rounds），不伪装成功、不发明第三语义；上限报告**确定性生成**（§11、§7） |
| 6 | "后台立即返回"与"报告进工具结果"矛盾 | 插件 index.ts:794（goal 工具立即返回"任务已开始"） | 保持后台契约不变；报告通道 = 终态时 bridge.say 播报 + goalState.lastSummary 供 status 查询，**不进 goal 工具结果**（§7） |
| 7 | 只存最后一个检查点会把正常完成误报为中断：HarnessCheckpoint 无终态字段 | types.ts:203-211 | 改存**包装记录** {runId, goal, phase, terminal}，终态时原子标记；v1 不落 per-round 检查点（检测-only，续跑留 v2）（§9） |
| 自查 | wrapLlmPurpose 只透传 generateText，宿主工厂附加的 runGoal 会被静默丢弃 | context.ts:77-84 | C2 必须同步修复该包装器（§6.3） |

二次复审继续发现 3 个高风险问题与 2 个契约澄清项，本版同样全部采纳：

| # | 二次复审问题 | 本版处置 |
|---|---|---|
| 8 (P1) | 新建 `PluginAgentGoalTool` 重复 `PluginTool`，且丢失副作用、风险、`ExecutionLedger`（执行账本）与上下文字段 | 删除平行类型，`runGoal.tools` 直接复用 `ReadonlyArray<PluginTool>`；goal 工具逐个显式声明 `effectKind`（§5.2、§6.1） |
| 9 (P1) | SDK 草案使用不存在的类型名，`error` 也不属于 canonical 终态；直接调用 Harness 不能假设 terminal 已填 | 改用既有 `PluginLlmMessage`、`PluginLlmGenerateOptions`、`PluginTurnStatus`；宿主显式调用 terminal-mapper（§6.1、§6.3） |
| 10 (P1) | `totalTimeoutMs` 只在轮次间检查，不能单独保证 15 分钟硬截止 | 复用平台 `AbortSignal.timeout` + `AbortSignal.any` 建立 run 级 deadline，并保留 Harness 时钟作第二层兜底（§6.3、§8、§11） |
| 11 (P2) | 持久化需要 runId，但接口未定义其生成与归属 | runId 由插件在启动前生成并作为必填参数传入，宿主/Harness/工具上下文/包装记录全链共用（§6.1、§9） |
| 12 (P2) | “只开放 Minecraft 工具”没有说明 Harness 固有的 Todo/长输出读取工具 | 明确保留 `update_todo` 与 `read_tool_result`，后者接既有 `FileToolOutputStore`；仍关闭 Ask/确认/计划/子任务（§5.1） |

---

## 一、背景与动机

minecraft-bot 插件的自主任务循环（GoalRunner）目前是自研的"文本指令"协议：LLM 每轮输出一条 `!attack zombie` 风格的指令行，插件自行解析分发。这个设计在真机上暴露了四类问题：

| 问题 | 现状 | 后果 |
|---|---|---|
| 格式漂移 | 弱模型（MiniMax）经常输出带解释、多行、跑偏格式的"指令" | 解析失败、任务中断（已靠提示词强约束缓解，未根治） |
| 长任务失忆 | `MAX_HISTORY = 12` 硬截断 | "先建房再种田"跑到第 13 轮就忘了建房目标 |
| 无缓存 | 每轮全量重发系统提示词 + 历史 | 50 轮任务成本翻数倍 |
| 无幂等/无结构化压缩 | 无 | 重复副作用、上下文无限膨胀 |

CyreneHarness（src/main/orchestrator/harness/）恰好逐项解决：原生 function calling（schema 校验 + 失败重试）、mid-loop compaction（结构化压缩检查点）、缓存周期管理（stablePrefix 跨轮命中）、取消传播 + exactly-once 终态、可选 ExecutionLedger 幂等。

**决策**：自主任务从自研循环迁移到 CyreneHarness，跑"无头 run"——同一套执行核心，没有聊天窗口这个"头"。

**已确认的产品决策**：
- 人设全量注入（soul + worldbook + 台词示例 + 记忆检索），不做精简——她在自主干活时也是"她自己"，与游戏频道聊天同一套自我；
- 游戏内业务工具只开放插件显式策划的 goal 工具集，无审批（allow_all）；Harness 内部保留 `update_todo` 与 `read_tool_result`，不暴露 Ask/确认/计划/子任务工具；
- 缓存命中优先：分层必须保证前缀稳定。

---

## 二、现状盘点：三个可抄的先例

代码库里已有三条"无 UI 驱动 Harness"的路径，本方案不发明新范式，只组合：

| 先例 | 文件 | 提供的范式 |
|---|---|---|
| 子任务委托 | src/main/orchestrator/task-runtime.ts | **最贴身**：直接调 runCyreneHarness + 自定义 promptLayers + 检查点 + onEvent 投影成 trace（不进 AG-UI） |
| 调度任务 | src/main/scheduler/scheduler-runner.ts | 完整 buildOptions 人设管线 + 无桌面会话（threadId 合成、事件发送可选） |
| 频道聊天 | src/main/channels/bootstrap.ts + agent-policy.ts | buildOptions(channel) 全量人设 + permissionMode: allow_all + exposeTools 收紧（catalog 置空先例） |

关于插件工具的一个**修正认知**：插件工具确实注册在主 toolRegistry 里（registerTool 当前直接 cast 写入），聊天场景零改造可用；但**注册版工具是聊天语义**（goto 即发即返、goal 后台启动），不满足自主任务的"等待终态 + 状态回传"需求。因此 goal 工具集**不经 registerTool**，由插件单独定义并随 runGoal 传入。类型直接复用现成 `PluginTool`；宿主必须显式校验并转换为 `ToolDefinition`，不得用一次裸 cast 掩盖必填字段或副作用元数据缺失。

---

## 三、总体架构

```
┌─ E:\Cyrene-Minecraft（插件）────────────────────────────┐
│ GoalRunner（重写）                                       │
│   ├─ 探测 ctx.deps.llm.runGoal 存在 → 走 Harness 路径    │
│   ├─ 不存在 → 旧文本指令循环（legacy 回退）               │
│   ├─ 定义 goal 工具集（等待语义 + 状态行 + 排除清单）      │
│   └─ 终态报告 → bridge.say() → 游戏聊天播报              │
└──────────────┬─────────────────────────────────────────┘
               │ ctx.deps.llm.runGoal({ goal, tools, ... })
               │   ← PluginLlmService 可选方法（新宿主附加）
┌──────────────▼─ E:\Cyrene-Agent（宿主）─────────────────┐
│ plugin-agent.ts（新文件，参照 plugin-llm.ts）             │
│   ├─ buildOptions(plugin-agent source) 合成全量人设       │
│   ├─ buildToolSystemPrompt 对传入工具集重生成目录          │
│   │   （替换 buildOptions 产物中的 toolSystemContent）     │
│   ├─ FileToolOutputStore 承接长工具输出                    │
│   ├─ ExecutionLedgerStore 按 runId 提供短期执行去重        │
│   ├─ AbortSignal deadline 提供 15 分钟硬截止               │
│   └─ 无头装配（参照 task-runtime，不接 AG-UI/runStore UI）│
│ runCyreneHarness                                         │
│   ├─ 原生 function calling + 压缩 + 缓存周期 + 终态结算    │
│   └─ 工具执行 → 插件传入的 goal 工具集 → bridge → 子进程  │
└─────────────────────────────────────────────────────────┘
```

职责边界：
- **插件**：持有游戏状态、定义 goal 工具集（含等待语义与副作用元数据）、通过 plugin-agent Provider 生成开局任务上下文、管理目标生命周期与持久化；
- **宿主**：人设管线、目录生成、Harness 执行——插件不接触 harness 内部结构。

---

## 四、提示词分层与缓存设计（重点）

### 4.1 分层结构

| 层 | 内容 | 生命周期 | 缓存 |
|---|---|---|---|
| stablePrefix | soul 系统基底 + Harness 固定规则 + 台词示例 + **goal 工具目录（由传入工具集重生成）** | 整个 run 冻结（构建一次，绝不重建） | 第 2 轮起命中前缀缓存 |
| runtimeContext | buildOptions 产出的 worldbook/记忆检索/关系等动态人设上下文 + plugin-agent Provider 的开局游戏状态快照（坐标/背包/饥饿/本能上报） | **开局物化一次** | 首轮写入 transcript 后不再变化 |
| messages | `[goal]`（user）→ 工具调用/结果轮次 | 逐轮追加 | 自然追加不破坏前缀 |

### 4.2 缓存不破的三条铁律

1. **runtimeContext 只物化一次**。Harness 已有此契约（HarnessInput.initialInternalContext：`首次请求前物化一次的内部事实；后续轮次不得重新注入`）——直接遵守。任务目标仍是首条 user message，不在 runtimeContext 重复注入。开局之后模型对世界的认知更新**全部来自工具结果**：goal 工具集的包装层保证动作类结果附带最新状态行（§5.2），这是天然缓存友好的状态刷新通道。
2. **一个 run 内 buildOptions 只调用一次**，且**目录与工具定义出自同一份冻结列表**。工具集在 runGoal 入口由插件传入后立即冻结，`buildToolSystemPrompt(mode, 冻结集合)` 生成的目录文本、HarnessInput.tools 的工具定义二者永不分叉（测试断言目录中不出现集合外工具名，见 §13）。goal 之间互不共享缓存（新 run 新前缀，正常现象）。
3. **压缩只推进缓存周期，不清空缓存语义**。mid-loop compaction 触发时 harness 自动 `cacheEpoch+1, epochReason=compaction`，压缩后从检查点继续命中新前缀——harness 现成行为，无需插件参与。

### 4.3 与频道聊天的关系

游戏频道聊天的 game-context Provider（每轮注入实时状态）继续照旧服务聊天场景；goal run 不走"每轮 Provider 注入"路径，改用 4.1 的"开局快照 + 工具结果更新"模式。两条路径互不影响。

Provider 文案拆分：现有游戏情境 Provider 的工具速查按**聊天工具全集**书写（含 goal/connect 等 goal run 里不存在的工具）。不能按 `GoalRunner.state.running` 选择版本——后台 goal 运行期间，普通游戏频道聊天也会看到 running，使用全局运行态会污染并发聊天的提示词。

C2/C3 为 Plugin Prompt Provider 增加显式来源 `"plugin-agent"`：

- `AguiRunInput` 增加仅主进程使用的 `promptSource?: "conversation" | "plugin-agent"`，缺省仍为 `"conversation"`；
- `PluginPromptSource` / `PluginPromptBuildInput` 增加 `PluginAgentPromptBuildInput` 分支；既有 Provider 的默认来源仍只有 conversation + scheduler，不会被无意扩大调用；
- plugin-agent 调 `buildOptions` 时传 `promptSource: "plugin-agent"`；Minecraft Provider 显式声明 `sources: ["conversation", "plugin-agent"]`，按 `input.source` 返回频道版或任务版；
- 任务版只引用 goal 工具集，并只生成一份开局状态快照。GoalRunner 不再另外拼一份重复状态；它只负责提供构建任务版上下文所需的 bridge 状态。

---

## 五、工具、权限与交互边界

### 5.1 goal 工具集（插件显式策划，非前缀过滤）

| 项 | 取值 | 依据 |
|---|---|---|
| 工具来源 | 插件定义的 goal 工具集，随 runGoal 传入；**不经 registerTool 注册**（不进聊天工具目录） | 聊天工具是即发即返语义，goal 需要"等待终态 + 状态回传"（评审项 2/4） |
| 排除清单 | `minecraft-bot_goal`（递归入口——goal run 里再启动 goal 会嵌套）、`connect` / `disconnect`（生命周期归玩家和外部信号管）、`set_cowardice`（人格偏好是聊天场景的事） | 评审项 3 |
| stop 变体 | 任务内的 stop **只停物理动作**（bridge.stopTask），不取消 goal run 本身；聊天版 stop 保持"停移动+停任务"双语义不变 | 评审项 3：拆分两种停止能力 |
| 保留 | say（模型自主汇报进展）、status/inventory（观察）、其余全部动作类工具 | — |
| Harness 内置工具 | 保留 `update_todo`（长任务工作清单）与 `read_tool_result`（读取被截断的完整工具结果）；关闭 Ask/确认/计划/子任务工具 | Harness 当前无条件注入 Todo/读取工具；本方案显式承认并接好依赖，不再声称模型只看到 `minecraft-bot_*` |
| ToolOutputStore | 复用宿主现有 `FileToolOutputStore`，按 plugin runId 隔离 | 让 `read_tool_result` 有真实数据源，不另造存储实现 |
| ExecutionLedger | 复用宿主现有有界 `ExecutionLedgerStore`，按 runId 获取隔离域 | 对同一逻辑调用的成功结果做短期去重，不另造幂等基础设施 |
| permissionMode | `allow_all` | 用户决策：游戏内不进行任何审批 |
| includeInteractiveTools | `false` | 模型看不到 ask_user / confirm_uncertain_effect，游戏里没法弹审批卡 |
| planState | `undefined` | 不注入计划工具组 |
| checkPermission | 直通函数 | 与 allow_all 配套 |
| maxParallelToolCalls | **1（强制串行）** | 身体只有一具；等价旧循环"一轮一指令"的已验证行为，避免并行寻路互相打架 |

任务如何"自我了结"：模型不再调用工具、只输出文本 = 自然收尾（success 终态，文本即报告）。模型不需要"取消自己"的工具。

### 5.2 goal 工具包装层（评审项 4 的解法）

goal 工具集不是注册工具的直接复用，而是包一层薄适配：

1. **等待终态**：移动类（goto/goto_player/goto_block/dig_down/go_surface）走等待语义——把旧 GoalRunner 的私有 `moveToAndWait`（goal-runner.ts:354，监听 bridge.onTaskResult 的 arrived/failed/stopped + 3 分钟超时兜底）**提升为 BotBridge 公有方法**，包装层直接调用。攻击/收集/合成/熔炼等本来就是 reqId 请求-应答式（子进程报结果），无需改造。
2. **状态行**：动作类工具的结果尾部统一附加一行紧凑快照（`[状态] 坐标(x,y,z) 生命 h/20 饥饿 f/20`，取 bridge.status() 缓存，零子进程开销）。查询类（status/inventory）与 say 不附加（自带信息或无状态变化）。
3. **允许"已发起"语义的工具显式声明**：follow（持续跟随无自然终态，结果注明"已开始跟随，用停止工具结束"）。这是唯一豁免，文档化在工具 description 里。
4. **取消接线**：包装层将 bridge 请求与 runGoal 的 signal 赛跑，abort 时先 bridge.stopTask() 再返回；插件持有同一个 AbortController（玩家喊停/断线/插件停用三源合一，§8）。
5. **副作用元数据不得缺省**：goal 工具直接使用 `PluginTool`，每个工具必须显式填写 `effectKind`。status/inventory 为 `read`；固定目标移动、固定坐标放置/挖掘等可安全重放的操作才可标为 `mutation`；say/give/discard/craft/smelt/attack/pickup/chest_put/chest_take/villager_trade/use_tool_on 等可能重复消费、重复广播或作用到不同实体的操作标为 `external_side_effect`，禁止 Harness 自动重试。C4 用表驱动测试保证没有 goal 工具落到 `unknown`。

`ExecutionLedger` 只负责同一调用标识下的成功结果去重，是副作用分类的补充，不是替代。对于结果未知的外部副作用，不能仅凭账本假定动作未发生或可以安全重放。

---

## 六、SDK 服务接口设计

### 6.1 接口定义（宿主 src/plugins/types.ts + api.ts 注释 + SDK 包同步）

```typescript
/** 无头 agent 循环的进度事件（稳定元数据投影，不透传 harness 内部结构）。 */
export type PluginAgentEvent =
  | { kind: "round_started"; round: number }
  | { kind: "tool_started"; toolName: string }
  | { kind: "tool_finished"; toolName: string; ok: boolean };

export interface PluginAgentRunOptions {
  /** 插件在启动前生成；插件记录、Harness、ToolContext 与日志全链共用。 */
  runId: string;
  /** 任务目标（自然语言，作为首条 user message）。 */
  goal: string;
  /**
   * 不注册的冻结工具集；直接复用 PluginTool 完整契约。
   * 同一份列表驱动工具目录与 HarnessInput.tools；每项必须显式声明 effectKind。
   */
  tools: ReadonlyArray<PluginTool>;
  /** 诊断标签，拼进 purpose 用。 */
  purpose?: string;
  /** 取消信号（插件持有：停止工具/断线/插件停用）。 */
  signal?: AbortSignal;
  /** 进度事件投影；只读，不得在回调内发起工具调用。 */
  onEvent?: (event: PluginAgentEvent) => void;
  /** 轮次上限（默认 50）。 */
  maxRounds?: number;
  /** 整体硬截止毫秒（默认 15 分钟；deadline signal 强制执行，Harness 时钟二次兜底）。 */
  maxWallMs?: number;
}

export interface PluginAgentRunResult {
  /** 任务报告：成功 = 模型 finalAnswer；上限/异常 = 确定性文本。 */
  text: string;
  /** canonical 终态；宿主从 HarnessResult 显式映射，不假设 terminal 一定存在。 */
  terminal: {
    status: PluginTurnStatus;
    /** max_rounds / timeout / user_cancelled / E_HARNESS_FAILURE 等机器可读原因。 */
    reason?: string;
    /** cancelled / timeout / runtime_error 一律 true；普通成功按 uncertainEffects 决定。 */
    externalEffectsMayContinue: boolean;
  };
  /** 实际执行轮数。 */
  rounds: number;
}

export interface PluginLlmService {
  generateText(messages: PluginLlmMessage[], options?: PluginLlmGenerateOptions): Promise<string>;
  /**
   * 无头 agent 循环（较新宿主附加的可选方法）。
   * 老宿主的 llm 服务没有此方法，插件需回退自研循环。
   */
  runGoal?(options: PluginAgentRunOptions): Promise<PluginAgentRunResult>;
}
```

**不新增** PluginDeps 字段、不新增 PluginCapability、manifest 不变（继续 `["llm"]`）。

### 6.2 为什么挂在 llm 服务上而非新依赖（评审项 1 的解法）

deps 白名单机制（context.ts）：只有 manifest 声明且 DEP_TO_FIELD 登记的服务才注入；`"agent"` 不在表里——声明了老宿主直接拒载（`宿主未提供已声明的依赖`），不声明则永远拿不到。两条路都死。

挂 llm 服务则三态通吃：

| 场景 | 行为 |
|---|---|
| 新宿主 + 新插件 | `typeof ctx.deps.llm.runGoal === "function"` → Harness 路径 |
| 老宿主 + 新插件 | llm 服务存在但无 runGoal → legacy 文本指令循环（现有代码保留） |
| 任意宿主 + 老插件 | 不受影响（不调用新方法） |

类型层面：runGoal 是 PluginLlmService 的可选方法，结构类型天然兼容——老 SDK 类型编译的插件在新宿主上运行时探测照样工作；插件 dev 仓库升级 SDK 依赖获得完整类型。

### 6.3 宿主实现（src/main/plugin-agent.ts，新文件）

参照 plugin-llm.ts 的组装方式 + task-runtime.ts 的无头调用范式：

1. **人设组装**：走 `agentRuntime.buildOptions`（与频道聊天同管线），传 `executionMode: "work"`、`mode: "work"`、`channel: "minecraft"`、`promptSource: "plugin-agent"`，messages 只放 `[goal]`；合成会话参数的取值在施工时验证（调度任务路径已证明支持无真实会话的合成调用）。`plugin-agent` 来源使 Minecraft Provider 返回任务版上下文，不依赖 GoalRunner 全局运行态，也不会污染并发频道聊天。
2. **工具校验与目录重生成（评审项 2/8 的解法）**：入口先复制并冻结 `ReadonlyArray<PluginTool>`，逐项校验 id 属于调用方插件前缀、enabled=true、inputSchema 为 object 且有 properties、effectKind 非空且非 unknown。随后显式映射为 `ToolDefinition`，完整保留 risk/effectKind/verificationPolicy/ledgerPolicy/needsContext/execute 等字段，不做裸 cast。buildOptions 产物中的 `toolSystemContent` **整字段替换**为 `buildToolSystemPrompt("work", 同一冻结工具集)` 的产物，之后才拼 promptLayers——顺序不可颠倒，保证 stablePrefix 目录与 HarnessInput.tools 永不分叉。
3. **vendorConfig**：`resolveModelSettingsProfile(loadModelSettings())` 合成（与 plugin-llm 同源）。
4. **硬截止与取消来源**：复用 Node 现成 `AbortSignal.timeout(maxWallMs)` 和 `AbortSignal.any([options.signal, deadlineSignal])`，不自研定时器组合器。记录 first-source-wins：外部 signal 先触发映射 cancelled/user_cancelled；deadline 先触发映射 timeout/timeout。组合信号同时传给 Harness 与工具上下文，确保正在进行的模型请求、移动等待和 bridge 请求都能被打断；`config.totalTimeoutMs=maxWallMs` 继续作为 Harness 内部第二层兜底。
5. **无头调用**：直接 `runCyreneHarness`——runId = options.runId、tools = 已校验转换的冻结集合、includeInteractiveTools=false、planState=undefined、taskExecutor=undefined、checkPermission 直通、maxParallelToolCalls=1、toolOutputStore 复用 `FileToolOutputStore(app.getPath("userData"))`、executionLedger 复用进程级 `pluginExecutionLedgers.forScope(runId)`、signal 使用组合信号、onEvent 投影成 PluginAgentEvent（不进 AG-UI/runStore）。同时显式构造 `toolContext = { userQuery: goal, conversationId: "plugin:<pluginId>", runId, signal: combinedSignal, mode: "work", permissionMode: "allow_all" }`；这是工具取消传播、账本隔离和 FileToolOutputStore 定位记录的必要条件。Harness 固有的 `update_todo` 与 `read_tool_result` 保留，后者由该 ToolOutputStore 提供完整输出。
6. **终态显式映射**：直接 Harness 路径不能假设 `result.terminal` 已存在。使用 `result.terminal ?? mapTerminateReasonToTerminal(result.terminateReason, result.finalState.uncertainEffects.length > 0)` 生成 canonical terminal；若 deadline 是首个取消来源，则覆盖为 `{ status: "timeout", reason: "timeout", externalEffectsMayContinue: true }`。C1 同步把 `HarnessResult.terminateReason` 联合补上 `"max_rounds"`。
7. **wrapLlmPurpose 修复（自查新发现）**：context.ts:77-84 的 llm 包装器目前只返回 `{ generateText }`，宿主工厂（host-services）附加的 runGoal 会被**静默丢弃**。C2 必须同步改为条件透传 runGoal，否则服务永远到不了插件手里。
8. **runId 与 purpose 归因**：插件在启动前生成唯一 runId 并传入；宿主校验为非空短字符串后全链透传。runGoal 内部模型调用统一使用 `plugin:<插件id>:goal` purpose（工厂闭包持有 pluginId，与 generateText 的 purpose 包装同机制）。
9. **并发约束**：同一插件同时只允许一个 goal run——**选插件自律**（GoalRunner 本就有互斥检查），宿主不加锁，保持服务无状态。

---

## 七、进度播报与终态（评审项 5/6 的解法）

- **`minecraft-bot_goal` 工具契约保持现状**：后台启动、立即返回"目标已开始执行"（index.ts 现有行为与描述均不变）。任务报告**不进该工具结果**——原设计的"双通道"之一作废。
- **报告的真实通道**：① 终态时 `bridge.say()` 播报（"任务报告：……"）；② `goalState.lastSummary` 落状态，聊天 Agent 被问"她做完了吗"时经 status 工具/IPC 查询转述。
- **中途汇报由模型自主驱动**：goal 工具集含 say 工具，模型想汇报就调用（等价旧循环的 `!say`）；游戏聊天频道的逐行拆分与间隔节流机制（channel 层）自动生效。不再做工具事件的机械播报（原设计的"每轮最多一句"规则废弃——事件投影只留诊断用途）。
- **上限/异常报告为确定性文本**：达到 maxRounds 或 run 级 deadline 时，不追加模型调用（评审项 5：上限边界本就无模型调用机会，且禁用工具的总结调用会破坏 allToolSpecs 全程不变量），由插件用 `rounds + terminal.reason + bridge.status()` 拼确定性报告（"已达轮次上限（50 轮），任务未声明完成。当前状态：……。可重新发起或让玩家协助。"）。模型自然收尾的报告（success）不受影响。
- **终态映射**：完全沿用 terminal-mapper 既有映射——`max_rounds → { status: "timeout", reason: "max_rounds" }`，不伪装 success，不发明 limit_reached 第三语义。`PluginAgentRunResult.terminal` 透传 `status/reason/externalEffectsMayContinue`，插件按 terminal.reason 组文案；运行异常使用 canonical `runtime_error`，不另造 `error` 状态。

---

## 八、生命周期与取消

signal 链路（全部既有机制，无新发明）：

```
玩家喊停(聊天 stop 工具) ─┐
断开连接(disconnect) ─────┼→ GoalRunner 置位 AbortController → runGoal(options.signal)
插件停用(onDispose) ──────┘       → harness 取消传播（已有专项测试覆盖）
15 分钟 deadline ───────────────→ AbortSignal.timeout(maxWallMs) ─┐
外部 signal ─────────────────────────────────────────────────────┼→ AbortSignal.any → Harness + 工具包装层
                                                               └→ first-source-wins 终态映射
                              → 工具包装层收到组合 signal：bridge.stopTask() 打断子进程侧移动
宿主退出 ─→ 插件信号同样触发 → 终态 cancelled，exactly-once 结算
```

GoalRunner 现有的互斥检查（"已有任务进行中先停止"）保留。goal run 内部的 stop 工具只停物理动作、不停 run（§5.1），取消 run 只能来自外部信号——保证"玩家永远是喊停的那个人"。

---

## 九、持久化与恢复（评审项 7 的解法）

- **runId 所有权**：GoalRunner 在调用 runGoal 前生成唯一 runId；同一个值写包装记录并作为 `PluginAgentRunOptions.runId` 传给宿主。宿主、Harness、ToolContext、事件诊断和日志不得再生成第二个运行标识。
- **包装记录而非裸检查点**：插件 storage 存单键记录 `{ runId, goal, startedAt, phase: "running" | "terminal", terminal?: { status: PluginTurnStatus, reason?: string, externalEffectsMayContinue: boolean, at: number } }`。开始 run 时写 `phase: "running"`；run 终态返回后立即改写 `phase: "terminal"` + 终态摘要（单键 set，无中间态）。
- **误报消除**：HarnessCheckpoint 本身无终态字段、harness 正常结算也会写检查点——所以 v1 **不落 per-round 检查点**（检测-only 用不上，还引入 onCheckpoint 活引用同步克隆的契约成本）。重启后只看包装记录：`running` → 上次任务被中断（提示）；`terminal` / 无记录 → 沉默。
- **残余竞态诚实声明**：run 结束到改写 terminal 之间崩溃，会把"刚完成"误报为"被中断"——概率极低且后果良性（多一句提示），v1 接受；v2 若做自动续跑再引入原子标记强化。
- **恢复 v1 做检测不做续跑**：提示"上次的任务（目标 X）被中断了"，玩家可重新发起。自动恢复（initialState 续跑）留 v2——harness 支持，先验证主路径。

---

## 十、兼容与回退

| 场景 | 行为 |
|---|---|
| 新宿主 + 新插件 | Harness 路径（本方案） |
| 老宿主 + 新插件 | `ctx.deps.llm.runGoal` 不存在 → GoalRunner 走 legacy 文本指令循环（现有代码保留，文件头注明 legacy 与淘汰条件） |
| 新宿主 + 老插件 | 无影响（老插件不调用 runGoal） |

淘汰节奏：宿主发布含 runGoal 的版本 → 插件 0.10.0 跟进 → 观察一个版本周期无回退需求 → 下个插件版本删除 legacy 循环（约 380 行）。

SDK 包（@playa0v0/cyrene-plugin-sdk）随宿主发版：PluginLlmService 新增可选 runGoal 类型族；插件 dev 仓库升级依赖。施工期间若不想等发版，插件可临时用结构类型断言访问（`(ctx.deps.llm as { runGoal?: ... }).runGoal`），正式提交前换回正式类型。

---

## 十一、宿主侧小改动：HarnessConfig.maxRounds

HarnessConfig 现无轮次上限（主循环只查 totalTimeoutMs 时钟，cyrene-harness.ts:97）。新增：

```typescript
/** 工具轮上限；0 表示不限（默认）。达到上限以 max_rounds 原因结算。 */
maxRounds: number;   // DEFAULT_HARNESS_CONFIG = 0
```

- 检查点在循环顶部（进入下一轮 LLM 调用前）：`run.rounds >= config.maxRounds` 即止，**不产生额外模型调用**；
- 终态走 terminal-mapper **既有**分支：`{ status: "timeout", reason: "max_rounds", externalEffectsMayContinue: true }`——映射代码与单测已存在（terminal-mapper.ts:31），零新增语义；
- 上限时的 finalAnswer 由 harness 用确定性文案给出（类似 buildTimeoutReply 的兜底风格），插件侧再按 §7 拼完整报告；
- `HarnessResult.terminateReason` 的类型联合同步加入 `"max_rounds"`，避免 mapper 与结果类型继续分叉；
- 有头调用方不传（默认 0 不限），行为零变化；
- 双保险：maxRounds（goal 默认 50）+ run 级 deadline（goal 默认 15 分钟，即旧 GoalRunner 的 MAX_WALL_MS）。`totalTimeoutMs` 只作为 Harness 内部时钟兜底，不再被描述为单独可保证硬截止。

---

## 十二、施工顺序

每步全量测试后独立 commit，先后按依赖排：

- **C1（宿主）**：HarnessConfig.maxRounds + HarnessResult.terminateReason 类型补全 + 循环顶检查 + 确定性兜底文案 + 单测（边界处**无额外 LLM 调用**、终态 timeout/max_rounds、默认 0 行为不变）。
- **C2（宿主）**：PluginLlmService.runGoal 类型 + `plugin-agent` Prompt Source + **wrapLlmPurpose 透传修复** + plugin-agent.ts（PluginTool 校验/转换 → buildOptions → 目录重生成 → deadline 组合 → FileToolOutputStore / ExecutionLedgerStore 复用 → 无头装配 → terminal-mapper 显式映射）+ host-services 接线 + 单测。
- **C3（宿主/SDK）**：SDK 包同步 `PluginLlmService.runGoal` 与 `PluginPromptSource="plugin-agent"` 类型并发版（或插件侧临时结构断言先行）。
- **C4（插件）**：moveToAndWait 提升为 bridge 公有方法 → goal `PluginTool` 集定义（排除清单 + 等待语义 + 状态行 + stop 变体 + effectKind + signal 接线）→ GoalRunner 重写（生成/透传 runId、探测 runGoal / legacy 回退 / canonical 终态文案）→ 包装记录持久化（running/terminal 标记 + 重启检测）→ 游戏情境 Provider 按 source 拆双版本 → 版本 0.10.0。
- **C5（联调）**：Paper 服务器真机测试（清单见下节）→ 修问题 → install-dev 部署。

---

## 十三、测试与验证

**宿主单测**（C1/C2）：
- maxRounds 到达 → 终态 timeout/max_rounds、**模型调用次数不再增加**、finalAnswer 非空、轮数正确；
- 工具目录一致性：stablePrefix **包含**全部传入工具名，且**不包含**任何未传入的工具名（聊天工具、harness 内置交互工具一个不漏地排除）；
- promptLayers：stablePrefix 含人设与重生成目录、runtimeContext 不混入 stablePrefix；
- 工具契约：复用 PluginTool；缺 id 前缀、object schema、enabled 或 effectKind 时入口拒绝；转换后副作用/风险/Ledger/上下文字段完整保留；
- Prompt Source：plugin-agent 只触发显式声明该 source 的 Provider；后台 goal 运行时普通 conversation 仍拿频道版；开局状态不重复注入；
- 外部 signal 中途 abort → terminal cancelled/user_cancelled；deadline 在模型请求或工具执行中触发 → terminal timeout/timeout，且实际耗时不超过小幅清理宽限；
- runId：插件传入值与 HarnessInput、ToolContext、事件诊断一致；
- canonical 映射：自然完成 success、异常 runtime_error、max_rounds timeout，均带 externalEffectsMayContinue；
- Harness 内置工具：仅保留预期的 update_todo/read_tool_result，后者能从 FileToolOutputStore 读取被截断结果；Ask/确认/计划/子任务不出现；
- 执行账本：同一 runId 与逻辑调用的成功结果被重复分发时命中去重；结果未知的 external_side_effect 仍不自动重试；
- wrapLlmPurpose：带 runGoal 的服务包装后 runGoal 仍在、无 runGoal 的服务包装后不产生 runGoal；
- 事件投影：tool_started/tool_finished 与模拟序列一致，不泄漏 harness 内部字段。

**插件侧**（C4）：
- goal 工具集：排除清单生效（goal/connect/disconnect/set_cowardice 不在集合内）；移动类工具返回含终态与坐标（等待语义）；动作类结果尾带状态行；
- goal 工具元数据：每项 effectKind 显式且非 unknown；非幂等动作均为 external_side_effect，不因 timeout/transient 自动重试；
- 包装记录：正常完成 → 重启**不提示**中断；模拟崩溃（running 残留）→ 重启**提示**；
- 无 runGoal 服务 → legacy 路径行为与现状一致（既有测试不动）；
- 终态文案：success（模型报告）/ max_rounds（确定性报告）/ timeout / cancelled / runtime_error；包装记录与宿主共用同一 runId。

**真机清单**（C5，Paper 离线服）：
1. 简单目标（挖 10 木头）→ 完成、报告播报、缓存命中（onCacheDiagnostic 日志）；
2. 长目标（建房+种田）→ 触发压缩、目标不丢；
3. 中途喊停 → 秒停、终态 cancelled；
4. 断线重连 → 任务终止、包装记录 terminal 标记正确；
5. MiniMax 弱模型跑 1 和 2（格式漂移是否根治——本迁移的核心验收点）；
6. 长跑目标故意触达 50 轮上限 → 确定性报告、无额外模型调用、无嵌套 goal。

---

## 十四、风险与缓解

| 风险 | 概率 | 缓解 |
|---|---|---|
| 全量人设 + 弱模型注意力稀释，工具选择准确率下降 | 中 | 真机验收点 5 专项观察；若退化，收窄 worldbook 为游戏关键词命中子集（不改分层结构） |
| buildOptions 对合成会话的容忍度不足（隐性依赖真实会话） | 低 | C2 首个任务就是验证；调度任务路径已证明可行，最坏情况加一个合成会话适配分支 |
| 长任务 token 成本 | 中 | 缓存 + 压缩 + maxRounds/run deadline 双保险 |
| goal 工具副作用误分类导致自动重放 | 中 | 直接复用 PluginTool 完整契约；每项 effectKind 必填且表驱动测试禁止 unknown，非幂等动作统一 external_side_effect |
| deadline 与用户取消同时触发导致终态误分类 | 低 | 组合信号外记录 first-source-wins，只由首个来源决定 timeout 或 cancelled |
| 宿主/插件版本错配 | 低 | llm 可选方法探测 + legacy 回退（§10） |
| runGoal 语义挂在 llm 服务上不够正交 | 低 | 类型注释明确标注归属与淘汰条件；若未来插件生态出现第二个 agent 循环消费者，再升级为独立 capability（届时可 bump apiVersion） |
| 包装记录残余竞态误报"被中断" | 极低 | 后果良性（多一句提示），v1 接受，v2 原子标记（§9） |
