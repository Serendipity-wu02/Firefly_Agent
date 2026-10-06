# 交付②：多角色并行与写入协调 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有角色委派协议内实现有实证的多角色并行、安全读共享、写入协调与完整失败证据。

**Architecture:** 委派调度池与叶子工具共享/独占许可分离；Main 按规范工作区 key 复用协调器，父运行及其全部子运行继承同一对象。组内规范文件所有权只在获批工具实际进入写阶段时产生；原始操作 Promise、持久化证据与用户等待状态分别结算。复用交付①的已准备模型请求发送边界，不另造发送层。

**Tech Stack:** TypeScript、Node 24、Electron、React、现有 Vitest；不新增依赖。

**Spec:** `docs/architecture/parallel-roles-delivery-design.md`；共同来源 `docs/architecture/default-memory-and-parallel-roles-design.md`（2026-10-06 03:06 UTC 修订）。

## Global Constraints

- 本文件只是计划，尚未实现；必须在交付①独立完成、验收并记录提交后实施②，不能互相代替验收。此轮不改产品、不提交、不调用付费模型、不操作用户电脑或真实资料。
- 计划核对基线为云端 `master` / `c5e9441`；设计中的 `771f302` 是设计来源，实施时重新核对①后的增量，保护现有修改。`context-engineering` 未在已提供技能或仓库中找到，不声称已使用。
- 沿用 12 个角色、45 项技能、`delegate_agent({agent_id, prompt})`、独立持久会话及现有工具结果/UI链；Chat 不自动委派，Work/Code 工具、工作区、模型、审批范围不扩大。
- 角色池上限严格为 `Math.min(3, maxParallelToolCalls)`（使用现有归一化值，默认工具值为 4）；同角色仍单飞。不要添加 worktree 子系统、第二组用户并发设置或新模型供应商。
- 模型执行不占叶子工具许可；委派调用不持叶子许可等子任务。安全读只复用现有 `classifyToolExecutionMode` 的严格 true 判定；写入、Shell、未知插件、网页动作默认独占。
- 独占许可阻塞同一 Main 进程内绑定同一规范工作区的全部父/子工具读取与写入，包括另一顶层会话；模型思考可继续。不同根、其他应用实例和外部进程不在锁保证范围；未知 Shell 不做臆测路径提取，不宣称任意外部副作用事务隔离。
- 实际 Promise 未结算就不能释放许可、所有权组或角色单飞租约；取消等待不等于操作停止。先获批、后取得许可、再校验并认领实际写路径；拒绝、排队取消、预览、校验失败不认领。
- 冲突码固定 `AGENT_WRITE_CONFLICT`，只终止冲突子任务且禁止其后续 Shell 绕写；已完成写入原位保留，不回滚。每路径保留 `applied`、`partially_applied`、`unknown`、`not_applied` 及可用哈希/版本和工具事件。
- 自动验证只用合成配置/模型服务/临时目录，必须完成本地逻辑验收；真实 API 联调由用户自行执行。明确标注合成证据，缺少凭据不能当作推迟并发逻辑验收的理由。

## Review Focus

1. 规范别名、缺失叶子路径、Windows 大小写/8.3 与符号链接变化：同一真实文件不能多次获权，校验不能绕过原有路径授权（任务3）。
2. 审批期间取消或策略变化、写者后不断加入读者：零未授权写入且等待写者不饥饿（任务1、2）。
3. PDF/Excel/Shell 取消后仍在执行、子任务恢复：锁和角色租约不早放，tool call/result 一一闭合，未知副作用不重放（任务4、5）。
4. 补丁多路径移动、先写成功再冲突或落盘失败：不半组认领，已有写入不消失，兄弟结果不丢（任务3、4、7）。
5. 流式模型失败、回退与串行假阳性：真实执行入口/出口事件使用同一单调时钟；串行对照不能被判为并行（任务6）。

## 文件与接口约定

- 新增 `src/main/orchestrator/harness/execution-coordinator.ts`：父运行许可队列、组生命周期；新增 `src/main/orchestrator/harness/write-ownership.ts`：规范文件所有权；新增 `src/main/orchestrator/tools/registry/file-write-evidence.ts`：写前/后证据；新增 `src/shared/agent-execution-evidence.ts`：可序列化证据契约。
- 新增 `src/main/orchestrator/child-run-lifecycle.ts`：组取消/冲突与①子运行闭合的编排；新增 `src/main/orchestrator/harness/model-execution-evidence.ts`：单调事件记录。原有 scheduler、dispatcher、runtime、TaskSessionStore 与 UI 各守现有职责，不把状态堆入适配器门面。
- `ExecutionScope = {workspaceId:string; parentRunId:string; groupId:string; agentId:string; childRunId:string; toolCallId:string}`，只由 Main 构造，不接受模型参数。父工具使用父运行身份；所有子工具沿用同一协调器和规范 workspaceId。
- `TaskWriteEvidence = {path:string; canonicalPath:string; agentId:string; childRunId:string; toolCallId:string; state:"applied"|"partially_applied"|"unknown"|"not_applied"; before?:{sha256?:string;version?:string}; after?:{sha256?:string;version?:string}; eventIds:string[]}`；未知/不可读值省略，不捏造哈希。删除后的不存在是明确版本状态。
- `ModelExecutionEvent = {id:string; seq:number; monotonicMs:number; clockDomainId:string; agentId:string; parentRunId:string; childRunId:string; executionId:string; phase:"start"|"end"|"terminal"; terminal?:"completed"|"failed"|"cancelled"}`；运行身份及事件无需模型正文/密钥。

### Task 1: 共享/独占协调器与实际操作寿命

**Files:** Create `src/main/orchestrator/harness/execution-coordinator.ts`, `src/main/orchestrator/harness/execution-coordinator.test.ts`, `src/shared/agent-execution-evidence.ts`; Modify `src/main/orchestrator/tools/registry/tool-context.ts`, `src/main/orchestrator/harness/tool-dispatcher.ts`, `src/main/orchestrator/harness/tool-round.ts`, `src/main/orchestrator/harness/adapter/tool-runtime.ts`, `src/main/orchestrator/child-session-types.ts`, `src/main/orchestrator/child-session-runtime.ts`.
**Interfaces:** `getWorkspaceExecutionCoordinator(workspaceRoot:string):RunExecutionCoordinator` 是 Main 内规范路径 key 的唯一 registry；`runLeaf<T>(scope:ExecutionScope, mode:"shared"|"exclusive", signal:AbortSignal|undefined, execute:(permit:LeafPermit)=>Promise<T>):Promise<T>`、`whenSettled(groupId:string):Promise<void>`、`whenChildSettled(childRunId:string):Promise<void>` 只等待实际叶子 Promise；`closeGroup(groupId:string):Promise<void>` 在 drain 后释放组认领。`ToolContext.execution?:{coordinator:RunExecutionCoordinator;scope:ExecutionScope;permit?:LeafPermit}` 为 Main 注入 opaque 许可，不序列化。
- [ ] 写红测 `shared_read_overlap_writer_fairness`、`same_workspace_top_level_runs_share_coordinator`：两读同时进入；写者排队后新读不能插队；写期间共享/独占活跃数分别为 0/1；别名根的另一顶层会话同样被 Shell 阻塞。
- [ ] 写红测 `aborted_waiter_does_not_release_running_operation`：取消排队项不执行；取消已发起但尚未结束的可控 Promise 后，第二工具仍未进入；resolve/reject 后才释放，且无悬空 rejection。
- [ ] 运行 `npm test -- src/main/orchestrator/harness/execution-coordinator.test.ts`，确认新契约断言失败而非测试环境失败。
- [ ] 实现 Main registry 与 FIFO 写者公平队列；workspace key 使用 canonicalPath 与平台规范化，活动许可/排队/未结算组存在时不移除 registry 项。普通工具审批及策略复核之后取得许可，包住 `executeToolDefinition` 原始 Promise；安全读沿用现有分类，未知全独占，委派不进入叶子队列。
- [ ] 修改 `executeToolCallWithRetry`：保留取消感知但跟踪原始 dispatch 的 settle；在许可清理、组关闭和最终证据结算前 drain 已发起操作；排队取消不得标成 started，取消后不重试/补派发。
- [ ] 重跑该测试及 `npm test -- src/main/orchestrator/harness/tool-dispatcher.test.ts src/main/orchestrator/harness/firefly-harness.test.ts src/main/orchestrator/harness/adapter/tool-runtime.test.ts`，全部 PASS 后审查锁释放位置。

### Task 2: 独立委派池、身份隔离与父子接线

**Files:** Modify `src/main/orchestrator/harness/tool-call-scheduler.ts`, `src/main/orchestrator/harness/tool-round.ts`, `src/main/orchestrator/harness/tool-dispatcher.ts`, `src/main/orchestrator/harness/builtin-tools.ts`, `src/main/orchestrator/harness/types.ts`, `src/main/orchestrator/harness/adapter/tool-runtime.ts`, `src/main/orchestrator/persistent-agent-runtime.ts`, `src/main/orchestrator/child-session-types.ts`; Test `src/main/orchestrator/harness/tool-call-scheduler.test.ts`, `src/main/orchestrator/harness/delegate-agent.test.ts`, `src/main/orchestrator/persistent-agent-runtime.test.ts`, `src/main/orchestrator/specialist-integration.test.ts`.
**Interfaces:** `ToolExecutionMode` 增加 `"delegation"`，不把委派伪称安全叶子读；`ToolCallExecution.delegationScope?:{groupId:string;toolCallId:string}`。内部 executor 增加可选第二参数 `DelegationScope`，`AgentExecuteRequest` 与模型工具 schema 保持不变。
- [ ] 写红测 `distinct_roles_have_separate_pool`：4 个不同角色峰值为 3；maxParallelToolCalls=1/2 时峰值为 1/2；委派与安全读取使用独立容量，控制工具仍形成原有屏障，提交按模型原始顺序。
- [ ] 写红测 `duplicate_role_and_failed_sibling_are_local_failures`、`child_leaf_does_not_deadlock_parent_delegate`、`approval_cancel_and_scope_inheritance`：同角色无重叠、兄弟可完成、获批晚到仍零写入，工作区/模型/工具/读范围/审批快照不扩大。
- [ ] 运行 `npm test -- src/main/orchestrator/harness/tool-call-scheduler.test.ts src/main/orchestrator/harness/delegate-agent.test.ts src/main/orchestrator/persistent-agent-runtime.test.ts src/main/orchestrator/specialist-integration.test.ts`，确认新断言 RED。
- [ ] 连续非独占段内为委派创建一个可信 groupId；委派池滚动派发，组终止需所有子任务和实际叶子操作结算。原有 AgentSessionRegistry/角色租约保留单飞；一个子任务失败转换为该委派结果，不抛成整组基础设施失败。
- [ ] dispatcher 通过内部 scope 传递给 executor，再注入子 ToolContext；所有后台回调按 childRunId 防串线。父调度器在该组所有原始子 Promise 结算后调用 closeGroup；子终态只等待自己的叶子，不能等包含自身的子任务组。重跑同命令为 PASS，并审查 Chat 无 executor、非法 schema 保持拒绝。

### Task 3: 规范路径所有权与原子整组认领

**Files:** Create `src/main/orchestrator/harness/write-ownership.ts`, `src/main/orchestrator/harness/write-ownership.test.ts`; Modify `src/main/orchestrator/harness/execution-coordinator.ts`, `src/main/orchestrator/tools/registry/tool-context.ts`, `src/main/runtime-profile.test.ts`; Reuse `src/main/runtime-profile.ts:canonicalPath(value:string):string`.
**Interfaces:** `canonicalWriteIdentity(path:string):string` 复用真实现存祖先解析、追加缺失后缀，再按实际平台规范化；`WriteOwnership.claim(permit:LeafPermit, paths:readonly string[]):void` 先去重/全量检查再一次登记；`terminateChild(childRunId:string, code:"AGENT_WRITE_CONFLICT"):void` 禁止该子运行后续任何叶子调用。
- [ ] 写红测 `aliases_share_owner`、`missing_leaf_and_symlink_retarget_revalidate`：相对/绝对/符号链接别名同身份；拿到许可后重新校验真实路径，原有授权不被 canonical helper 取代；Windows 大小写/8.3 专项单列。
- [ ] 写红测 `claim_all_patch_sources_and_destinations_or_none`：一次补丁已有冲突目标时，其余目标均未认领；移动源/目标都参与检查；同组同角色可续写，不同角色返回精确冲突码。
- [ ] 写红测 `denied_dryrun_invalid_and_queued_cancel_claim_nothing`、`conflict_cannot_fallback_to_shell`、`new_sequential_group_can_reclaim_after_settlement`，断言调用次数及磁盘零新增副作用。
- [ ] 运行 `npm test -- src/main/orchestrator/harness/write-ownership.test.ts src/main/runtime-profile.test.ts` 为 RED；实现只接受持有的独占 permit、获批且通过前置校验的认领，不在参数解析/排队/审批阶段占位。
- [ ] 保留组内所有权直到全部实际操作结算；冲突使用 `ToolExecutionError("AGENT_WRITE_CONFLICT", ..., "fatal", false, "not_applied")`，终止当前子运行，不升级成父运行 fatal。重跑为 PASS。

### Task 4: 每个真实写点记账与读版本证据

**Files:** Create `src/main/orchestrator/tools/registry/file-write-evidence.ts`, `src/main/orchestrator/tools/registry/file-write-evidence.test.ts`; Modify `src/main/orchestrator/tools/fs-tools.ts`, `src/main/orchestrator/tools/life-tools.ts`, `src/main/orchestrator/tools/apply-patch-tools.ts`, `src/main/orchestrator/tools/ast-grep-tools.ts`, `src/main/orchestrator/tools/document-tools.ts`, `src/main/orchestrator/tools/registry/tool-executor.ts`; Test 上述五个工具现有 `.test.ts` 及 `src/main/orchestrator/tools/registry/tool-executor.test.ts`。
**Interfaces:** `beginWriteBatch(context:ToolContext, paths:readonly string[]):WriteBatch` 在校验完毕后认领；`WriteBatch.run<T>(paths:readonly string[], mutate:()=>T|Promise<T>):Promise<T>` 记录开始、实际完成及前后哈希；`finish():TaskWriteEvidence[]` 返回每路径事实，写入进度即时交父协调器保存，不靠成功返回 JSON 才留证。
- [ ] 写红测 `write_then_conflict_preserves_first_file`、`partial_patch_and_ast_failure_preserve_applied_paths`：A 成功后 B 冲突，A 原内容/哈希及事件保留；写入抛错时已完成、部分完成、未知与未触达路径分别正确，不能统一 not_applied。
- [ ] 写红测 `read_waits_for_write_settlement_and_hashes_actual_bytes`：阻塞写操作未 settle 前 read_file 不进入；settle 后哈希匹配新字节，旧 read_file 结果仍引用旧哈希；未知 Shell 同时阻塞读/写但不阻塞模型事件。
- [ ] 运行 `npm test -- src/main/orchestrator/tools/registry/file-write-evidence.test.ts src/main/orchestrator/tools/fs-tools.test.ts src/main/orchestrator/tools/life-tools.test.ts src/main/orchestrator/tools/apply-patch-tools.test.ts src/main/orchestrator/tools/ast-grep-tools.test.ts src/main/orchestrator/tools/document-tools.test.ts` 为 RED。
- [ ] 在 write_file/str_replace 校验后、首个 mkdir/写之前进入 batch；apply_patch 先收齐所有 hunk.path 和 movePath 并完成预验证，再认领；ast_grep_replace 使用实际 pendingWrites，dryRun 不认领。保持已有 review baseline 与路径授权。
- [ ] write_excel/word/pdf 使用解析后的实际输出路径；PDF 的临时路径及最终目标纳入同批，许可覆盖 pipeline、rename 和 finally 清理；Excel 覆盖整个 writeFile Promise。内部账本/费用文件不冒充用户文件 diff，仍受独占许可约束。
- [ ] 修复 tool-executor 当前 legacyFailure 只留下错误文本导致部分写入证据丢失的问题，证据经独立可信字段传递；不要只扩大 ToolEffectState 后误称所有工具都能确定效果。重跑同命令及 registry/tool-executor.test.ts 为 PASS。

### Task 5: 子任务取消、中断与恢复协议闭合

**Files:** Create `src/main/orchestrator/child-run-lifecycle.ts`, `src/main/orchestrator/child-run-lifecycle.test.ts`; Modify `src/main/orchestrator/child-session-runtime.ts`, `src/main/orchestrator/child-session-types.ts`, `src/main/orchestrator/persistent-agent-runtime.ts`, `src/main/tasks/task-session-store.ts`, `src/shared/task-session.ts`, `src/main/orchestrator/harness/types.ts`, `src/main/orchestrator/harness/tool-round.ts`; Test `src/main/tasks/task-session-store.test.ts`, `src/main/orchestrator/persistent-agent-runtime.test.ts`, `src/main/orchestrator/harness/run-recovery.test.ts`。
**Interfaces:** 消费①已实现的 `createTranscriptSink({store:ConversationTranscriptStore,conversationId:session.id,runId:session.childRunId,assistantTurnId}):TranscriptSink`、子 `HarnessRunStore.create/checkpoint/recordTool/markTerminal` 和 `closeInterruption({reason:"user_cancel",runSession}):Promise<void>`。新增 `settleChildExecution(input:{coordinator:RunExecutionCoordinator;childRunId:string;close:()=>Promise<void>}):Promise<void>` 仅调用 whenChildSettled→已有闭合；不另造消息修复器或权威 transcript。
- [ ] 写红测 `cancel_then_resume_pairs_every_declared_call`、`restart_preserves_unknown_without_replay`：assistant 每个 toolCall 恰有一个 result；排队未执行为 not_executed，已开始未确定为 unknown；恢复不得自动重放未知写入或重新使用旧来源能力。
- [ ] 写红测 `late_settlement_keeps_lease_and_evidence`、`conflict_returns_failed_child_with_prior_writes`：操作实际结束前角色/组不释放；终态保留工具事件、先前写入和 AGENT_WRITE_CONFLICT；兄弟成功结果还在。
- [ ] 运行 `npm test -- src/main/orchestrator/child-run-lifecycle.test.ts src/main/tasks/task-session-store.test.ts src/main/orchestrator/persistent-agent-runtime.test.ts src/main/orchestrator/harness/run-recovery.test.ts` 为 RED。
- [ ] 核对①已经接好的 child `onToolLifecycle`/run-store/取消闭合，②将其 started 移到真正获得许可的执行点；派发前持久化 planned，结果落盘后 committed。取消/冲突先停新派发，再 drain 该子实际操作、走已有 transcript 闭合，最后落终态/释放角色；恢复复用①闭合规则。
- [ ] 父取消传给每个子 controller；冲突仅 abort 对应子运行。扩展 TaskSession 的可选证据字段并校验/克隆/恢复；旧 schemaVersion=2 文件缺字段视为缺证据，不能补造历史写入。重跑同命令为 PASS。

### Task 6: 实际模型执行事件与合成并发实证

**Files:** Create `src/main/orchestrator/harness/model-execution-evidence.ts`, `src/main/orchestrator/harness/model-execution-evidence.test.ts`, `src/main/orchestrator/parallel-roles-integration.test.ts`; Modify `src/main/orchestrator/child-session-runtime.ts`, `src/main/orchestrator/child-session-types.ts`, `src/main/orchestrator/persistent-agent-runtime.ts`, `src/main/orchestrator/task-events.ts`; Consume ①新增 `src/main/orchestrator/vendors/prepared-model-call.ts`。
**Interfaces:** `createModelExecutionRecorder(clock:{domainId:string;now:()=>number}, emit:(event:ModelExecutionEvent)=>void):ModelExecutionRecorder`；`ModelExecutionRecorder.observe(identity:{agentId:string;parentRunId:string;childRunId:string;executionId:string}):(phase:"start"|"end",terminal?:"completed"|"failed"|"cancelled")=>void`。同一父 recorder 使用 performance.now，seq 严格递增；回调 best-effort/nonthrowing，不影响权限、发送、结算。
- [ ] 写红测 `synthetic_provider_entry_intervals_overlap`：两个不同角色实际进入合成服务 handler 后均等待 barrier；共享同一 recorder/时钟，先证实两个 entered，再放行；断言 `A.start < B.start < Math.min(A.end,B.end)`，保留角色和父/子运行 ID。
- [ ] 写红测 `serial_control_has_no_overlap`、`failed_cancelled_and_fallback_requests_close_events`：上限 1 对照不重叠；拒绝/流中取消/零增量回退各 request executionId 唯一，start/end 配对，terminal 如实；禁止用 Promise 创建顺序、running UI 或 mock 调用次数代替执行证据。
- [ ] 运行 `npm test -- src/main/orchestrator/harness/model-execution-evidence.test.ts src/main/orchestrator/parallel-roles-integration.test.ts` 为 RED。
- [ ] 只给① `dispatchPreparedModelCall(input:PreparedModelCallInput):Promise<ChatResponse>` 的 `onModelExecution` 注入 observer；接口固定为上述 phase/terminal 回调，在单次授权 callback 内、真正 SDK/fetch 前发 start，流消费/拒绝 settle 后 finally 发 end 与实际 terminal。复用冻结 counted body，不重新 buildRequest。
- [ ] 合成服务屏障和事件日志位于临时目录/测试进程；通过现有模型档案接口覆盖配置错误/超时/拒绝反馈，无凭据也能跑。重跑同命令为 PASS，报告标题明确“合成模型并发证据”，不称真实 API 已验证。

### Task 7: 结构化结果与可恢复 UI 展示

**Files:** Modify `src/shared/chat-types.ts`, `src/shared/task-session.ts`, `src/main/orchestrator/child-session-types.ts`, `src/main/orchestrator/persistent-agent-runtime.ts`, `src/main/orchestrator/harness/task-result-evidence.ts`, `src/main/orchestrator/harness/adapter/event-mapper.ts`, `src/renderer/react/features/chat/pages/run/AgentRunController.ts`, `src/renderer/react/features/chat/workspace/workspace-artifacts.ts`, `src/renderer/react/features/chat/workspace/WorkspaceRunResults.tsx`, `src/renderer/react/i18n/zh-CN.json`, `src/renderer/react/i18n/en.json`; Test 对应已有 `.test.ts`。
**Interfaces:** `AgentExecuteResult`、`ChildSessionResult`、`ToolTaskResult` 追加可选 `writes:TaskWriteEvidence[]`、`error:{code:string;message:string}`、`executionEvents:ModelExecutionEvent[]`；原 agentId/sessionId/status/text 保留。`extractTaskResult` 逐字段校验，不信任模型 prose，也不从 preview 重建证据。
- [ ] 写红测 `failed_child_shows_prior_writes_and_sibling_success`、`all_effect_states_survive_restore`：失败子任务逐行显示路径、4 种状态、可用前后哈希/版本/工具事件，成功兄弟仍显示，刷新恢复一致，不把失败标作零修改。
- [ ] 写红测 `foreign_run_and_malformed_evidence_rejected`、`long_result_does_not_truncate_write_ledger`：维持 AgentRunController runId 防串线；正文截断不抹除独立证据，旧无证据结果如实显示不可用。
- [ ] 运行 `npm test -- src/main/orchestrator/harness/task-result-evidence.test.ts src/renderer/react/features/chat/pages/run/AgentRunController.test.ts src/renderer/react/features/chat/workspace/workspace-artifacts.test.ts src/renderer/react/features/chat/workspace/WorkspaceRunResults.test.ts` 为 RED。
- [ ] 沿现有 tool_end → event-mapper → AgentRunController → chat持久化 → WorkspaceRunResults 展示；新增写证据区域与中英状态文案，unknown/not_applied 不冒充成功 diff，可见内容不包含子提示词或密钥。重跑同命令及 `npm run check:renderer` 为 PASS。

### Task 8: 独立交付验收与剩余外部条件

**Files:** Create `docs/architecture/parallel-roles-delivery-acceptance.md`; Modify 本计划勾选及结果链接；沿用 `scripts/testing/run-tests.mjs` 和 `scripts/testing/archive-reporter.mjs`，不改测试阈值/skip 策略。
- [ ] 完成任务1–7后运行 `npm test`、`npm run check:renderer`、`npm run build`、`npm run check:storage-boundary`、`git diff --check`；保存退出码、准确通过/失败/skip 数、源码版本、Node/OS 与归档路径。测试失败先修复，不把未执行当通过。
- [ ] 验收报告包含串行对照/并发 event 表、叶子最大活跃数、取消后未 settlement 阻塞记录、冲突前后真实临时文件哈希、恢复配对计数、UI证据断言及权限零副作用断言；每项注明合成/静态/真实平台证据类别。
- [ ] Windows 单列 DPAPI、native helper、8.3 短路径、符号链接四类；每个未执行/skip 写名称、原因、源码条件与环境，不改系统设置获取绿色。真实 API 联调列用户自行执行的现有配置入口、测试入口和预期错误反馈，不将合成逻辑验收列为待用户完成。
- [ ] 单独审查②源码增量与产物；确认①无回退、②无越权/第二发送层/隐瞒部分写入。此轮只交计划，实施后的②提交与发布须另按用户已确认的执行授权进行，完成状态分别报告。

## 实施前源码核对补充（2026-10-06，尚未开始交付②）

以交付①最终验收提交重新核对以下接点；不改变原验收目标：

- Shell 独占期必须覆盖真实子进程退出。现有 run_in_background 在创建 job 后立即返回，stop/timeout 状态也可能先于 close；不能把工具返回或终态标签当作实际结算。任务 1/4/5 文件范围补入 tools/builtin-tools/run-shell-tool.ts、shell-job-manager.ts、shell-job-tool.ts 及其测试。停止当前 job 的控制路径不能被自己持有的独占锁排在后面。
- 任务 6 复用 prepared-model-call 现有实际 start/end observer。可信子运行身份需通过 memory-context/main-memory-runtime.ts、main-default-memory.ts、background-memory-ingress.ts 的现有入口传递，禁止新增发送通道或由模型提供事件身份。
- 任务 4 的写入证据经过 orchestrator/types.ts 的 ToolExecutionOutcome；错误转换不能吞掉独立写入记录。复用 read_file 对实际读取字节的 canonicalPath/sha256，不重复实现哈希。
- applyPatchHunks 当前为同步导出，写入批次若需异步许可，要同步调整真实调用方与直接测试，保持整体预验证。AST 工具已有 pendingWrites，应复用真实完成状态而非预期 diff。
- 并行分工按文件所有权：协调器/调度、叶子操作、子运行/持久化/模型事件、结果 UI 四组；shared evidence 合约先固定再接消费者。交付①被独立验收并提交之前不实施②。
