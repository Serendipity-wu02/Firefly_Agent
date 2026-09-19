# Firefly Work 本地文件只读 V1

## 实施边界

本记录对应基线 `069efc3e177592896e268658bf9655017d30f197`，当前分支为 `firefly-v1.1.0`。本轮只增加 Work 的文本／Markdown 选择与只读读取链，不改变普通 Chat、Browser 网络、Music、Worker、主动执行、R2 或 Resume。源码与测试整理阶段不额外启动应用；实机验收阶段在构建完成后正常退出旧进程，并于 2026-09-19 19:21:54 启动最新构建，主 Electron PID 为 `2564`，加载入口为 `dist/main/main/index.js`。本轮不修改设置、不提交、不推送、不发布。

`file_read` 是新增的 Main-owned 工具能力，但它没有成为全局文件权限。只有带有当前 Work 文件绑定、`planExecutionMode: "required"`、MAIN 执行者和当前运行身份的调用才能进入文件读取链。计划确认不是文件审批；文件读取仍经过 Capability → Sandbox → Approval → AuthorizedInvocationBridge → ToolExecutionEngine → `file_read`。

本轮修正了“文件未读取也能完成”的边界。文件选择本身只建立可读范围；是否必须读取由 Work IPC 的结构化请求 `WorkCreatePlanRequest { task, fileReadMode: "optional" | "required" }` 明确表达，不能从用户文字、文件名或模型自述推断。`optional` 不把选择范围传入规划或执行，因此不会把所有附件自动升级为必读；`required` 由 Main 根据当前选择创建 `WorkFileReadRequirement`，其中包含本次选择的全部不透明 `fileId`。该要求随提案、`MainRequiredPlanRequest`、`AgentRunInput` 和当前压缩事实传递，不能由 Provider 修改。

## 实际调用链

```text
Work window
  -> preload window.work.selectFiles()
  -> WORK_SELECT_FILES (Main dialog)
  -> WorkTaskCoordinator.selectFiles()
  -> WorkFileSelectionStore.createSelection()
       (Main keeps selectedPath, resolvedPath, file identity)
  -> WorkTaskCoordinator.createPlan()
  -> FireflyAgentCore.proposeRequiredPlan()
  -> FireflyHarness.proposeRequiredPlan()
       (one no-tool Provider request; only opaque file metadata)
  -> Main proposal validation + bindProposal(selectionId, proposalId)
  -> renderer confirmation sends proposalId only
  -> WorkTaskCoordinator.confirmPlan()
  -> bindRun(selectionId, proposalId, runId)
  -> per-run exact Sandbox filesystem lease
  -> FireflyAgentCore.runRequiredPlan()
  -> the same FireflyHarness loop
  -> active plan step exposes only its bound tool
  -> authorization and ToolExecutionEngine
  -> WorkFileSelectionStore.readFile()
```

在 `required` 模式，Main 计划校验要求每个必读 `fileId` 都有独立的 `file_read` 工具步骤，步骤必须使用当前 `selectionId` 和 `fileId`；全分析提案、只读取部分文件、越界文件或缺少结构化要求均不能生成可确认提案。执行结算再次检查当前 `runId` 的真实 `toolCallEvidence`：工具名、选择身份、文件身份、成功状态、`ok: true`、`complete: true`、`contentTruncated: false`、`integrity: "verified"`、严格 UTF-8、`untrustedContent: true` 及正文字段必须同时成立。缺少任何一份本次成功证据时，Work 终态为失败 `required_file_read_evidence_missing`，不能沿用历史结果或最终回答。

本次修正补齐了压缩事实中的执行目标：`CompactionPlanStepFact.toolBinding`（本轮新增事实字段）由已确认的 Main 计划步骤复制到 assistant 来源的模型计划消息，并在连续投影时再次独立复制。它只保留已确认的工具名及必要参数，不改变 system 约束、用户原文或授权状态；因此 Provider 在执行轮能够看到当前文件的精确不透明身份，仍必须通过 Harness 的调用／结果匹配、授权和证据门控才能读取。

随后根据真实运行的空参数结果修正了流式 Provider 解析：`sse-tool-parser.ts` 现在跨 HTTP chunk 保留未完成的 `data:` 行，并在流结束时处理尾行；它不补写工具参数，缺失或不匹配仍由 Harness 拒绝。该修正只影响流式响应的解析完整性，不改变工具绑定、授权或完成门。

本次回归还覆盖了同一 Provider 轮内的审批屏障：前一个 `file_read` 已获授权并成功，而后续同时返回的调用会被 `tool-round.ts` 标记为 `deferred_after_approval` 或 `deferred_after_delegation`、`outcome: "not_executed"`。Harness 保留这两类延后结果的完整工具证据和消息，但不把它们当作当前步骤的执行失败；步骤结算只使用本轮实际执行的证据，后续轮次仍必须重新调用并验证所需文件。其他失败、拒绝、未知和参数不匹配仍按原错误契约终止或保持未验证。

计划步骤绑定沿用 `AgentRequiredToolExecution.correction: "once"` 的既有契约。若当前必需工具步骤首次没有产生工具调用，Harness 只追加一次内部纠正，并在下一轮通过 Provider 的 `tool_choice` 强制当前步骤已确认的工具名；纠正次数随计划步骤切换重置，参数仍由执行前绑定和 `executeToolRound` 核验。第二次仍无调用时步骤保持未验证并由完成门拒绝；实际失败、错误参数或拒绝不进入该纠正路径，轮次、取消、超时和其他终态预算仍保持原优先关系。

`WORK_GET_FILE_SELECTION` returns only the metadata snapshot needed to render the current selection. The renderer never receives an absolute path, resolved path, `dev`/`ino`, or a file handle. The Provider receives a separate `user` message tagged `untrusted_file_metadata` containing opaque IDs and bounded metadata; the original user task remains a separate user message. Planning has no `tools` field and cannot read file content.

## Selection identity and lifecycle

`src/shared/work-file-types.ts` makes `selectionId` and `fileSelectionId` one branded identity: both fields contain the same Main-created opaque value. Each file has a separate opaque `fileId`. The snapshot contains only display name, type, byte length and whether the selected entry was a symbolic link.

`WorkFileSelectionStore` is the sole owner of selected paths and identities. It accepts at most 8 absolute paths, only `.txt`, `.md` and `.markdown`, rejects non-regular targets, records `lstat`/`realpath`/`stat` information, enforces the 1 MiB per-file and 4 MiB selection limits, and rejects duplicate persistent identities. A selection is first bound to one proposal and then atomically moved to one run. The binding includes the selection identity and exact file IDs; it is not inferred from a task string or a model response.

The coordinator refuses reselection while a proposal or run is active. A picker cancellation returns the current snapshot without replacing it. A successful new selection releases the previous unbound selection. Planning failure/cancel, proposal invalidation, run completion, task cancellation, coordinator disposal and application shutdown release the corresponding selection or run lease. An old proposal therefore cannot acquire a later selection.

## Handle-based read and integrity

`readFile()` re-checks the selected path and target, compares persistent and metadata identity, opens the resolved target once, and uses that same `FileHandle` for chunked reads and the post-read `handle.stat()` check. It does not perform a path read after a separate check. The read loop checks cancellation, enforces the byte limit while reading, uses fatal UTF-8 decoding, counts Unicode code points, and enforces both the per-file 4096 and per-run 16384 code-point limits. Every return path closes the handle in `finally`.

Results distinguish `file_missing`, `file_replaced`, `file_changed`, `not_regular_file`, `permission_denied`, `unsupported_encoding`, `cancelled`, and limit/read failures. A failure has `complete: false`, no body, `untrustedContent: true`, and an integrity state. A success is marked `complete: true`, `contentTruncated: false`, `integrity: "verified"`, and `untrustedContent: true`.

This is a bounded verified read, not an OS-level atomic snapshot. On Windows the implementation relies on the Node `fs`/`FileHandle` operations available in the current runtime. A target can still change after the final check; that platform limitation is not described as eliminated by `lstat → realpath → stat`.

## Authorization and Sandbox

`default-dependencies.ts` registers `file_read` and its `file.read` capability, but its static filesystem profile has an empty root list. The coordinator registers exact resolved-file scopes in `SandboxPolicyEvaluator` under the current run and releases them with an idempotent lease. The evaluator accepts only an exact path/run/profile match; it does not rewrite a shared profile or use a directory prefix as file selection.

The authorization facts resolver accepts exactly `selectionId` and `fileId`, resolves the file through the current run binding, and builds the read-only filesystem scope and approval presentation in Main. `file_read` rejects missing upstream authorization, non-MAIN requester provenance, wrong tool identity, wrong scope kind/access, a missing approval grant, a foreign run, and an unbound file. Worker and proactive surfaces filter the tool out or reject it before authorization; the registration alone grants them no file scope.

## Safe execution diagnostics

当前 Main 组合根创建 `FileWorkDiagnosticSink`，写入 Electron `app.getPath("logs")/firefly-work/work-file-runs.jsonl`。记录只包含任务／运行／选择不透明身份、文件不透明身份、工具名称和数量、授权状态、`ok`／错误代码、字节数、码点数、完整性、截断标志和不可信标志；不写用户原始任务、完整路径、文件正文、令牌或审批请求正文。`file_read` 的授权 pending/resolved 和实际结果分别记录，未出现审批回调时仍以实际工具证据为准，不能用“未见卡片”推断未执行。

2026-09-19 的手动比较运行均在诊断日志中留下了关联事实。前两次运行生成两个必需 `file_read` 步骤，但执行调用缺少文件身份并被记录为 `required_tool_mismatch`／`not_executed`；随后两次运行正确携带不透明文件身份，第一份文件读取 88 字节、37 个 Unicode 码点并得到 `complete: true`、`integrity: "verified"`，第二份同轮调用先记录为 `deferred_after_approval`。运行 `work-run-1789816453281-um5bqs` 在第一项成功后进入第二步骤，但 Provider 返回纯文字，旧实现未应用步骤绑定中的一次纠正，因此页面与 Main 均以 `plan_incomplete` 结束。修复后实机运行 `work-run-1789817133714-gvstf9` 记录了同一运行内两次授权通过和两份成功读取：第一份 88 字节、37 个 Unicode 码点，第二份 87 字节、39 个 Unicode 码点，均为 `complete: true`、`contentTruncated: false`、`integrity: "verified"`、`untrustedContent: true`；第二份先延后后重新调用并成功，最终 `run_finished` 为 `completed / ok: true`。这次页面终态与 Main 日志一致，双文件比较具有两份本次成功证据。

## Content trust and context limits

File bodies are returned as untrusted tool results and are not written to Memory/RAG. No body is written to diagnostics. `ToolResultPruner` preserves file identity, byte/code-point counts, `complete`, `contentTruncated`, integrity, encoding and the untrusted marker as exact structured fields. If body pruning occurs, it also sets `bodyTruncated`, `contentTruncated: true` and `complete: false`, so later UI/context consumers cannot call a partial body complete. Compaction task facts preserve file selection bindings and file-result identity/integrity/truncation observations without moving body text or external observations into the trusted system constraint message.

The fixed limits are:

| Limit | Value |
| --- | ---: |
| Files per selection | 8 |
| Bytes per file | 1 MiB |
| Bytes per selection | 4 MiB |
| Unicode code points per file body | 4096 |
| Unicode code points per run | 16384 |

## Automatic verification

`tools/test/runtime/work-file-read.test.ts` has 15 passing tests covering opaque metadata, proposal/run isolation, replacement detection, strict UTF-8, pre-cancel, byte/file-count/selection/body limits, authorization provenance, the existing Capability → Sandbox → Approval → Bridge → ToolExecutionEngine chain, exact per-run Sandbox leases, a real Harness Provider round trip whose assistant plan message carries the exact `toolBinding` and file identities, proposal/run binding, reselection blocking, no-path/no-body planning metadata, optional-versus-required file mode, all-analysis proposal rejection, one-file evidence rejection, two-file evidence completion and safe diagnostics without body/path. `tools/test/core/harness.test.ts` has 44 passing tests, including the new real Harness regression in which a later required tool step first returns no call, receives exactly one bound-tool correction, executes successfully and reaches a tool-free final synthesis. `tools/test/core/work.test.ts` also covers the real Harness all-analysis rejection under a required file-read contract.

The targeted run used temporary files only:

```text
npm run typecheck
npm run build:main
node --experimental-strip-types tools/test/runtime/sse-tool-parser.test.ts
node --experimental-strip-types tools/test/runtime/work-file-read.test.ts
node --experimental-strip-types tools/test/core/work.test.ts
node --experimental-strip-types tools/test/core/harness.test.ts
node --experimental-strip-types tools/test/core/planning.test.ts
```

本次定向命令全部通过。最终收口又运行了完整项目测试套件 `npm test`，退出码为 `0`，各列出的 node:test 子套件均为 `fail 0`；`npm run verify:typescript` 与 `npm run verify:architecture` 均通过，`git diff --check` 没有空白错误（仅有既有的 LF/CRLF 提示）。公网访问和私人文件测试没有运行；生产应用没有被当作自动化测试夹具。

## Manual operation and remaining limits

1. Open Work from the existing Work window entry.
2. Choose one or more `.txt`/`.md`/`.markdown` files with the file picker.
3. Confirm that only names, types, sizes and opaque selection state are shown; the disclosure says that execution sends file content to the configured model service.
4. Enter a summary/analysis/comparison task and generate the pending plan.
   When the selected files are required for the task, enable the explicit “执行时必须读取所选文件” option before generating the plan. Selecting files without that option is an optional scope and must not be treated as a read request.
5. Confirm the plan. File reading then causes the existing approval surface to appear when the current permission profile requires it; approval is separate from plan confirmation.
6. Observe the step evidence and final state. Missing, replaced, changed, invalid UTF-8, cancelled or truncated input must remain incomplete.

The following are not claimed by automated tests in this round: Windows symlink creation under every host policy, a GUI picker cancellation race, a live model selecting an invalid binding, an in-flight OS replacement exactly between the final handle check and later filesystem activity, and the complete real approval GUI path with a private local file. No atomic snapshot guarantee is made.

The post-fix manual double-file comparison passed on `work-run-1789817133714-gvstf9` in the restarted PID `2564`: both selected files were read successfully in the same run, the deferred second call was reissued after approval, and the UI showed all three steps plus the final run as completed. The earlier failed run `work-run-1789816453281-um5bqs` remains recorded only as failure evidence.

Two final boundary checks were performed against the same dedicated temporary-file set. In `work-run-1789819129409-42r27r`, the selected file was changed after proposal generation and before confirmation; the authorized `file_read` returned `failure` with `errorCode: "file_changed"`, `bytesRead: 0`, `bodyCodePoints: 0`, `complete: false`, `integrity: "changed"`, and the run ended `failed`. In `work-run-1789819353080-i52l3t`, the selection was 4098 bytes (below the byte limit) but the body contained 4098 Unicode code points; `file_read` returned `failure` with `errorCode: "body_code_point_limit_exceeded"`, `bytesRead: 4098`, `bodyCodePoints: 4098`, `complete: false`, `contentTruncated: true`, `integrity: "unverified"`, and the run ended `failed`. Neither run supplied a complete file result or was reported as successful. The earlier screenshot-only result is not treated as file-read evidence. The application and user settings were not changed.
