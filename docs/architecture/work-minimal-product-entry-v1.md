# Firefly Work 最小产品入口 V1

## 范围与状态

本轮增加独立的 Work 产品入口，普通 Chat 仍使用原有 `registerChatIpc` 与 `IAgentCore.run` 路径。Work 不新增 Agent 循环、ToolExecutionEngine、权限链、Memory/RAG 所有者、Worker 或 Resume 入口。版本保持 `1.1.1`，本轮未提交、未推送、未发布。

## 收口基线与累计工作树边界

- 分支：`firefly-v1.1.0`。
- 当前 HEAD：`f2ebc50b42a49557a960504365c3355b35ee58f6`。
- `package.json` 版本：`1.1.1`；本次实机启动命令为 `npm run start`。
- 当前工作树相对 HEAD 仍有累计未提交修改；本文件只记录 Work V1，不把累计差异描述成只有 Work。
- 当前 HEAD 已包含 Browser V1、Settings、Capability/Sandbox/Approval 基础及其网络策略；本次 HEAD→工作树的待提交差异没有重新添加 Browser 后端，而是继续复用这些既有能力。
- HEAD→工作树的待提交差异还包括 Agent/Harness 轮次、预算、任务事实、无进展与终态；Planning/步骤完成证据；Compaction；Recovery/Resume R1、R2 Provider 边界与快照校验；以及本 Work 入口、组合根接入、Renderer/Preload 和审批展示修复。
- 用户设置、代理凭据、Memory/RAG 数据、日志、`node_modules`、`dist` 和打包输出均未纳入版本控制范围。

## 实际调用链

```text
Pet context menu / Tray
  -> WINDOW_OPEN_WORK
  -> WindowManager.createWorkWindow()
  -> renderer view=work
  -> preload window.work
  -> WORK_CREATE_PLAN / WORK_CONFIRM_PLAN / WORK_CANCEL
  -> registerWorkIpc()
  -> WorkTaskCoordinator
  -> FireflyAgentCore.proposeRequiredPlan() / runRequiredPlan()
  -> the same FireflyHarness
```

`default-dependencies.ts` constructs one `FireflyAgentCore`, one `WorkTaskCoordinator` and one `AgentEventBus`. `registerWorkIpc` is registered by `DefaultApplicationRuntime.start` and disposed by the same runtime. `WorkTaskCoordinator.dispose()` runs during application stop and cancels planning or the active Work run before its event listener is removed.

## 计划生成

`FireflyHarness.proposeRequiredPlan()` is the Work planning stage. It sends one Provider request containing the fixed Work planning system message and the original user task. The request has no `tools` field and no tool choice, so this stage does not execute tools, request approval, read Memory/RAG, or create an Agent run. Provider timeout and the supplied `AbortSignal` use the Harness round timeout and cancellation path; invalid JSON, invalid steps, tool calls, timeout, cancellation, and Provider failure produce `WorkPlanGenerationResult` failure and no proposal ID.

Each generated step must contain both `description` and `completionRequirement` (`analysis` or `tool`). The Main-side `createMainRequiredPlanInput` validator is reused for the structured contract. The plan text is never used as the original user task and cannot add Browser targets. Browser targets are extracted once from the original task by `extractBrowserUserTargetUrls`; the resulting normalized list is copied into the Main-owned request.

## 提案与确认

`WorkTaskCoordinator` owns the process-local task state. Its `WorkTaskSnapshot` contains the original task, Main-owned Browser target list, proposal/run identifiers, immutable step descriptions and completion requirements, current phase, verification observations, cancellation state, terminal reason and error.

The renderer sends only the Main-created `proposalId` to `WORK_CONFIRM_PLAN`. Main checks task ownership through the Work window sender check, requires `awaiting_confirmation`, and consumes `proposalConsumed` synchronously before calling `runRequiredPlan`. A second or concurrent confirmation therefore returns `not_confirmable` and cannot create another run. The confirmed step array is copied into `MainRequiredPlanRequest` and is not editable by the renderer.

Confirmation is not tool approval and does not grant permission. Browser and Music operations continue through their existing capability, sandbox, approval, authorized-invocation and ToolExecutionEngine paths. A required Browser URL remains limited to the URL set extracted from the original user task.

Only one Work task may be in `planning`, `awaiting_confirmation`, or `running`. A new request during those phases returns `busy`; it cannot replace the active task. Terminal snapshots remain available until a later explicit Work request replaces them.

## Renderer、窗口与审批

`src/renderer/ui/components/WorkView.tsx` loads the Main snapshot on mount, subscribes to `WORK_STATE_CHANGED`, displays the pending plan and completion requirements, and exposes Generate, Confirm, and Cancel actions. It never confirms or reruns a task automatically on window open. Closing and reopening the Work window reads the same Main-owned snapshot.

`WindowManager.createWorkWindow()` is the sole Work window constructor. Its sender is checked by `registerWorkIpc`. `ApprovalPresentationCoordinator` treats `WindowManager.isWorkTaskActive()` as a presentation constraint: while Work is planning, awaiting confirmation, or running, pending approvals use the dedicated Approval window instead of an inline Chat card. Approval state remains owned by `ApprovalService`.

本次实机暴露并已修复一条审批展示竞态：旧审批窗口完成结算后，若窗口关闭回调迟到，新的待审批记录不能被旧的 `waitingForTerminalWindowClose` 状态吞掉；复用已经打开的审批窗口时，也必须发送新的结构化审批记录。修复位于 `approval-window-coordinator.ts` 与 `WindowManager.isApprovalWindowOpen()`，并由 `tools/test/runtime/approval-ux-v2.test.ts` 覆盖。Work 活跃期间即使 Chat 已满足内嵌条件，也强制使用独立审批窗口；同一请求仍由 `ApprovalService` 单一结算，不重复展示或重复消费。Work 结束后，Chat 的内嵌审批与窗口回退测试保持通过。

## 终态与迟到事件

Work event updates are accepted only when an event carries the current Work `runId`. The final `MainPlanExecutionResult` is authoritative for the task phase: `completed` maps to Work completed; `cancelled` maps to cancelled; all other Agent statuses map to failed with the original termination reason and error. A late result after disposal or task replacement is ignored and cannot overwrite the current task.

Plan completion and step verification remain governed by the existing Harness required-plan completion gate. A model sentence cannot replace tool evidence. Cancellation, timeout, budget exhaustion, no-progress and other existing Harness terminal reasons are not converted to Work success. Work does not add retries, extra tool calls, or Resume behavior.

## 生命周期与未开放范围

- Work state is process-local and is not persisted across application restarts.
- No Work IPC is exposed to Chat, Worker, proactive execution, or external callers; `registerWorkIpc` rejects non-Work window senders.
- No new tools or capabilities were added. Existing Browser and Music tools are the only available Main tools.
- No Resume UI, cross-process checkpoint, parallel execution, or Work-specific permission is added.
- No real-model or public-network test is part of the default automated suite. The manual evidence below is recorded separately and is not inferred from automated tests.

## 自动验证

- `tools/test/core/work.test.ts`: original task and Browser target preservation, one no-tool planning request, structured-step rejection, planning cancellation, atomic proposal consumption and duplicate-confirmation rejection.
- `tools/test/runtime/approval-ux-v2.test.ts`: active Work forces the dedicated approval window even when Chat inline approval is ready.
- `tools/test/runtime/approval-ux-v2.test.ts`: delayed approval-window close callback does not hide a new pending request; the next request is presented exactly once through the canonical service.
- `tools/test/presentation/integration.test.ts`: shared renderer view contract retains existing views and includes Work.
- The final verification before this record was updated ran `npm run typecheck`, `npm run build`, `npm test`, `npm run verify:typescript`, `npm run verify:architecture`, and `git diff --check`; all exited successfully. The build retained its existing Vite warnings only.

## 实机通过

The following evidence came from the current compiled build and the same Main process, not from model text alone:

- Work opened from the Pet menu and tray without simultaneous duplicate Work windows. Closing and reopening Work restored the Main-owned task snapshot without regenerating the proposal.
- A pure-analysis task displayed a pending three-step proposal before confirmation, then reached a consistent completed plan after confirmation. Planning cancellation and the visible execution-cancelled terminal state were also exercised.
- With temporary `ASK_EVERY_TIME` and `http://127.0.0.1:7897`, approval denial produced no Browser read and the Work result remained incomplete.
- The repaired approval path produced `OPEN APPROVAL WINDOW`, then `AUTHORIZED` for `runId=work-run-1789793261503-qs44yv`. The subsequent Browser trace recorded `httpStatus=200`, `connection=http_proxy`, `proxyConnected=127.0.0.1`, `proxyMatchesEndpoint=true`, `tlsVerified=true`, `titleLength=14`, `bodyLength=127`, and `bodyTruncated=false`. The two Work steps ended in `success`, and the task ended `completed`.
- Ordinary Chat opened and replied independently of the Work task. A normal tray exit ended the Firefly main process and its Electron children; a later `npm run start` restarted the current build, and Chat opened normally.

## 环境阻断

- The earlier direct-mode Browser attempt was correctly blocked by the active TUN fake-IP result: `non_public_target`. No DNS, TUN, Clash, hosts, certificate, or address-policy change was made. This is an environment result, not a successful direct-read result.

## 最终设置与未覆盖项

- The temporary acceptance settings were restored and read back from the canonical settings file as `FULL_ACCESS`, `direct`, no HTTP proxy endpoint, and `allowedOrigins=[]`. Restoring the settings created the expected new configuration revision; it did not revive an old authorization.
- The exact Provider-call count for the separate GUI proposal-generation request was not retained as an independent production log assertion; the UI proposal and no-pre-confirmation execution boundary were observed, while automated `work.test.ts` covers the no-tool planning contract.
- The deep in-flight cancellation race during an active Provider/network operation was not stably observable in the GUI. The visible planning and execution cancellation paths passed; this timing race remains unclaimed by the manual record.
- The complete four-profile permission matrix and real music control were not repeated in this Work acceptance. Existing automated authorization/music regressions remain the evidence for those boundaries.
- The application was left running after the final clean restart so the post-exit Chat check could be observed. No commit, push, or publish was performed.
