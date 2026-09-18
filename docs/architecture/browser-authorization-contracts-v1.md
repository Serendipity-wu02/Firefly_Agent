# Firefly V1.1.1 — Browser Authorization Contracts V1

## 状态与生产边界

本文件记录 Browser 授权契约的实现状态。版本保持 `1.1.1`，当前工作树继续使用
`firefly-v1.1.0` 分支的既有基线与未提交修改。

本轮已完成 Browser 静态读取的生产路由接入，但没有自动网页请求；只有普通 Chat 运行在当前
用户消息明确提供 URL、通过现有授权链并实际执行工具时，才会进入 Browser Reader。当前生产状态为：

| 项目 | 状态 |
| --- | --- |
| Browser Tool 注册 | `browser_read` |
| Browser Capability 注册 | `browser.static.read` |
| Browser 网络请求 | 仅显式用户 URL 的授权工具执行；启动与设置操作为 `NONE` |
| Browser 允许 Origin 配置 UI | 已接入现有 Settings 页面 |
| 新授权许可 | `NONE` |

Browser 不创建进程级许可，也不复用音乐控制许可；Browser 结果仍是外部不可信观察数据，
不写入 Memory、RAG 或偏好证据。

## 共享契约与所有者

### 新的网络读取副作用

`src/shared/tool-types.ts` 的 `ToolSideEffect` 新增：

```ts
"external_network_read"
```

它表示对外部网络执行有界、静态读取，不等于本地只读，也不授予网页操作、写入、登录、
Cookie、表单提交或任意请求头权限。Capability 描述、Approval 元数据、Tool Policy 和
审批展示均沿用同一个副作用值；现有 `read_only`、`idempotent`、`state_mutation` 和
`external_action` 的语义未改变。

`src/main/runtime/authorization/permission-profile-policy-resolver.ts` 的实际规则是：

- `READ_ONLY` 允许 `external_network_read`，但返回 `required`，因此每次需要 Approval；
- `RESTRICTED_SCOPE` 和 `ASK_EVERY_TIME` 对该副作用同样返回 `required`；
- `FULL_ACCESS` 不额外强制 Approval，仍保留 Capability 自己声明的 `required`；
- 未知 Capability、其他被拒绝的副作用和 Sandbox 拒绝仍由原有管线硬拒绝；Approval
  不能解除 Sandbox 拒绝。

### Browser Sandbox 范围

`src/shared/sandbox-types.ts` 新增 `BrowserScope`：

```ts
{
  kind: "browser",
  initialUrl: string,
  targetOrigin: string,
  originAccess: "public" | "configured",
  transportMode: "direct" | "http_proxy",
  proxyEndpoint?: BrowserProxyEndpoint,
  networkRevision: number
}
```

`proxyEndpoint` 只在 `http_proxy` 模式存在；它不复用或塞入既有
`NetworkScope.host`。`BrowserScope` 的相等和包含判断要求初始规范化 URL、Origin、模式、
代理端点和修订号全部相同。因而同 Origin 的其他路径或查询参数不能替换已经捕获的
初始 URL。`cloneSandboxScope()` 对 Browser 的代理端点执行嵌套冻结，Approval 和执行
边界共用 `isSandboxScopeShape()` 与 `isSandboxScopeExactlyEqual()`。

`BrowserSandboxRule` 也位于同一 `SandboxRule` 联合：

```ts
{
  kind: "browser",
  allowedOrigins: readonly string[],
  originAccess: "public" | "configured",
  transportMode: "direct" | "http_proxy",
  proxyEndpoint?: BrowserProxyEndpoint,
  networkRevision: number
}
```

`src/main/runtime/sandbox/sandbox-policy.ts` 使用规范化 Origin 的精确成员判断，空
`allowedOrigins` 拒绝全部 Browser 目标，不做后缀或子域继承。模式、代理端点和修订号
也必须精确匹配。网页目标和代理端点的本地例外仍由 Browser 后端各自的策略负责，不能
通过 Sandbox 的 Browser 规则互相扩大。

### 动态授权事实

`src/main/browser/browser-authorization.ts` 的
`createBrowserAuthorizationFactsResolver()` 是可信 Main 侧动态范围构造函数。它只接受唯一的
`requestUrl` 输入，并要求该规范化 URL 出现在 Chat IPC 从当前用户消息提取的
`browserRequestTargets` 集合中，调用现有
`normalizeBrowserUrl()`，读取 `getBrowserSettingsSnapshot()`，然后生成冻结的
`BrowserScope`、审批摘要和审批原因。

它的执行顺序和边界为：

```text
Tool input validation
  -> normalizeBrowserUrl
  -> SettingsManager.getBrowserSettingsSnapshot()
  -> unavailable => structured denial
  -> immutable BrowserScope + approval facts
  -> existing CapabilityAuthorizationPipeline
```

该 resolver 不调用 DNS、Socket、`BrowserReadBackend` 或解析 Worker。`BrowserSettingsSnapshot`
来自 `src/main/settings/settings-manager.ts` 的唯一 Settings 所有者；配置缺失时已有
快照是直连默认，已有损坏配置则是 `unavailable`，不会静默回退直连。快照中的
`revision`、规范化模式和代理端点一起绑定到本次授权。

### Harness 动态路由

`src/main/orchestrator/harness/harness-authorization-adapter.ts` 保留原有静态路由：
音乐路径继续使用 `requestedScope`、`approvalSummary` 和 `approvalReason`。同时新增
可信 `resolveAuthorizationFacts` 路径，类型为 `HarnessAuthorizationFactsResolver`，
返回 `HarnessAuthorizationRouteResolution`。

动态路由的事实不会进入 Tool 参数之外的第二个状态所有者。一次执行的顺序是：

```text
resolve initial facts
  -> pipeline.authorize()
  -> if pending: resolve current facts + resumeAfterApproval(expected scope)
  -> resolve current facts again before bridge
  -> pipeline.revalidateAuthorizedInvocation()
  -> existing AuthorizedInvocationBridge
  -> existing ToolExecutionEngine
```

准备、审批恢复和最终执行都使用同一 `HarnessAuthorizationAdapter` 与
`CapabilityAuthorizationPipeline`。动态事实构造失败返回结构化 ToolCall 错误，不使
Harness 进程异常退出。

`CapabilityAuthorizationPipeline` 新增的
`revalidateAuthorizedInvocation()` 会重新检查当前 Capability、Binding、Sandbox、
权限 Profile、Approval requirement 和进程授权资格，并用
`isSandboxScopeExactlyEqual()` 比较已授权范围。审批恢复中的 scope 变化由
`invalidatePending()` 终止；它不会重新授权、重新排队或自动读取。A→B→A 仍因修订号
变化而失效。一次性 Approval 的消费和执行去重仍由既有 ApprovalService、Pipeline 与
AuthorizedInvocationBridge 分工负责。

## 权限与受限档限制

设置页通过现有 Settings IPC 由 `SettingsManager` 持久化精确 `allowedOrigins`。默认列表为空，
因此 `RESTRICTED_SCOPE` 的 Browser 请求明确拒绝；只有可信设置快照中的精确 Origin 命中才
允许进入审批。模型、网页内容和审批结果不能添加条目；不支持通配符、子域继承或前缀匹配。
有效网络配置（包括允许列表）变化会递增进程内修订号，A→B→A 仍使旧授权失效。

`FULL_ACCESS` 在本轮只改变 `external_network_read` 的 Approval policy：当 Capability
没有显式声明必须 Approval 时，可直接形成 sandbox-only invocation；它不创建进程级
Browser 许可，不改变其他能力，也不替代后续实际执行时的 Sandbox 和动态范围复查。

Browser 配置身份仍由 `SettingsManager` 的规范化配置与进程内单调 `revision` 共同表达。
`BrowserReadService` 由 Main 组合根唯一创建并维护一个后端及一个并发读取门。Settings IPC
确认有效网络配置修订变化后更新 Browser Sandbox Profile 并使当前后端失效；在途读取收到
取消，迟到结果不能进入成功出口。执行开始后使用授权绑定的配置快照，不中途切换模式。

## 既有所有权保持

```text
FireflyToolRegistry
  -> CapabilityRegistry / CapabilityBindingResolver
  -> CapabilityAuthorizationPipeline
  -> SandboxPolicyEvaluator
  -> ApprovalService
  -> AuthorizedInvocationBridge
  -> ToolExecutionEngine
```

Browser 的实际生产接入为：

```text
当前用户消息 URL
  -> Chat IPC browserRequestTargets
  -> FireflyHarness MAIN tool schema
  -> browser_read
  -> 动态 BrowserScope / Approval / Sandbox 复查
  -> AuthorizedInvocationBridge
  -> ToolExecutionEngine
  -> BrowserReadService（唯一实例/并发门）
  -> 现有直连或 HTTP 代理后端
  -> 静态内容解析 Worker
  -> 结构化外部不可信结果
```

没有建立第二个 Registry、Sandbox、Approval、Harness、Agent Loop、Settings owner 或事件
总线。音乐的 `music_status -> music_status` 与 `music_control -> music_control` 授权路径、
FULL_ACCESS 的现有音乐进程许可、Worker 复用 Main Harness，以及主动 `MAIN + toolSurface: none`
边界均未改变。Worker 不获得 Browser Schema；主动执行仍无工具面。

## 验证

`tools/test/runtime/browser-authorization.test.ts` 走实际的
`HarnessAuthorizationAdapter`、CapabilityRegistry、BindingResolver、SandboxPolicyEvaluator、
ApprovalService、CapabilityAuthorizationPipeline、AuthorizedInvocationBridge 和
ToolExecutionEngine；测试工具本身是本地内存替身，不执行 Browser Reader。

覆盖范围：

1. 四档 `external_network_read` 权限矩阵；
2. `unavailable`、空 Origin 列表和精确 Origin/子域边界；
3. 初始 URL 路径/查询、模式、代理端点和修订号变化；
4. A→B→A 的旧请求失效；
5. 审批恢复后权限变化与最终执行前配置变化；
6. 取消、拒绝、过期不进入 ToolExecutionEngine；
7. 冻结范围、输入校验和授权准备阶段零 DNS/Socket/Reader 调用；
8. Browser 动态范围只接受当前用户 URL，Settings 允许列表精确匹配。

`tools/test/runtime/browser-production-integration.test.ts` 进一步使用真实
`browser_read` ToolDefinition、同一个 Registry/BindingResolver、动态 Harness 路由、
CapabilityAuthorizationPipeline、AuthorizedInvocationBridge、ToolExecutionEngine、
BrowserReadService 和实际静态提取器；传输通过受控本地替身，不访问公网。覆盖连续独立
读取、READ_ONLY 审批、网页脚本不进入正文、结构化不可信结果、用户 URL 边界、配置失效取消
及单一后端释放。

测试不会读取用户 Clash 配置或发起公网请求；真实公网、真实代理和 GUI 读取仍需单独
人工验收。类型检查、构建、定向测试和完整测试的实际结果以本轮最终报告为准。

## 下一轮边界

后续工作只包括独立的 GUI、真实代理和公网人工验收，以及按需要修正实际发现的问题；不得
将 Browser 工具参数、网页内容或模型文字提升为 Sandbox 允许列表、权限许可或执行成功
证据。当前接入仍不提供点击、脚本、登录、下载、写入、Browser Worker 或主动浏览。

## 当前读取结果真实性边界

`src/main/chat/chat-ipc.ts` 在构建用户回合时调用
`resolveBrowserReadIntent()`，只把当前消息提取出的规范化 URL 交给
`createBrowserReadExecutionRequirement()`；该函数只构造 Harness 的必需工具契约，
不直接调用 Reader。单一 URL 请求会把精确 `requestUrl` 绑定到本次 `runId`，因此模型
漏调工具时 Harness 只允许一次纠正，其他 URL、历史文本和模型自行生成的地址不能满足
该要求。

`src/main/browser/browser-read-intent.ts` 的
`resolveBrowserReadExecution()` 只接受当前 `AgentRunResult.toolCallEvidence`：证据必须
同时匹配当前 `runId`、`browser_read`、当前规范化目标、工具输出 `ok: true` 和
`sourceUrl`。历史 Chat 消息、上一轮工具结果、审批通过或模型文字都不是读取成功证据。
当前工具未调用、目标不匹配、拒绝、失败、取消或超时分别落入非成功状态；Chat IPC 使用
结构化结算文本，避免将历史成功回答重新包装成当前读取成功。明确回顾此前结果且没有
新的读取意图时，不创建该结算状态，因此可以引用历史但必须由模型说明其来源。

`FireflyHarness` 在必需工具成功后保留模型对当前工具结果的后续回答；在必需工具未调用
或失败时仍使用结构化失败文本。该机制仍经过原有授权、Sandbox、AuthorizedInvocationBridge
和 ToolExecutionEngine，不改变 Browser 权限、代理、URL 提取或 Sandbox 规则。诊断日志只
记录关联状态、目标数量和工具调用 ID，不记录正文或密钥。

本轮验证新增在 `tools/test/runtime/browser-chat-routing.test.ts`，覆盖历史成功后漏调、
当前 404、超时/取消、目标不匹配、明确回顾历史和连续独立 run；这些测试证明的是
Harness 证据边界，真实模型仍需单独人工验收。

## 本次真实运行的根因与修复

在 `run-1789458387849-xf8tq` 中，生产构建已经把 `browser_read` Schema 发送给 Provider，
Provider 也返回了两次 `browser_read` 工具调用；但日志没有出现授权适配器或
`BrowserReadService` 结果。该运行最终被记为当前读取失败，不能证明网页读取成功，也没有使用
历史读取结果替代当前结果。

阻断发生在 Harness 必需工具检查：旧逻辑对工具参数执行原始结构相等比较。模型返回的
`https://example.com` 与当前消息规范化后的 `https://example.com/` 表示同一 HTTP(S) 目标，
但文本不同，因此调用在进入授权链之前被拒绝。

修复位于：

- `src/shared/agent-types.ts`：新增 `AgentRequiredToolExecution.argumentMatching`，默认仍为
  `exact`；
- `src/main/browser/browser-read-intent.ts`：Browser 必需调用明确使用 `normalized_url`；
- `src/main/orchestrator/harness/tool-round.ts`：仅对该显式模式按标准 URL 规范化
  `requestUrl` 后比较，其他工具继续使用原始精确匹配，且实际 Browser 工具仍执行当前目标、
  授权范围和 Sandbox 复查。

`tools/test/runtime/browser-chat-routing.test.ts` 新增等价 URL 格式回归测试。该测试验证的是
规范化参数可以通过 Harness 必需工具门，不把工具调用本身当作读取成功；只有当前 run 的工具
输出 `ok: true` 且 `sourceUrl` 与目标匹配时，读取真实性结算才会成功。

修复后的实机复测使用 `run-1789458821441-y6o9z`。该运行的 Provider 请求包含
`browser_read` Schema，第二步工具调用进入授权适配器并以 `FULL_ACCESS` 获准，随后真实
Browser 后端返回 `status=blocked`、`reason=non_public_target`，没有 HTTP 状态、连接证据、
标题或正文。主进程最终记录 `Browser Truth Trace state=failed`，因此本次没有形成网页读取
成功证据；该结果与 Chat 回复一致。阻断来自当前直连环境的 fake-IP 地址被既有公开地址策略
拒绝，不是历史结果替代，也不是权限绕过。

## Browser V1 最终验收记录

本次整理只读取已有源码、测试和运行记录；没有启动应用，没有重复公网请求，也没有修改
生产源码、权限、代理、URL 提取或 Sandbox 配置。

### 真实性分支与实际断言

| 分支 | 状态 | 证据 |
| --- | --- | --- |
| 历史成功，本次零工具调用 | 已覆盖 | `tools/test/runtime/browser-chat-routing.test.ts` 的 `A fresh Browser request cannot be satisfied by a successful historical answer` 断言 `not_called`、`not_executed`，并拒绝历史标题与“读取成功”文本。 |
| 本次工具失败/拒绝 | 已覆盖 | 同文件的 `A current Browser failure cannot be replaced by historical success`；授权拒绝、空受限范围和不进入执行引擎由 `tools/test/runtime/browser-authorization.test.ts` 覆盖。 |
| 本次超时 | 已覆盖 | 同文件的 `A timeout or cancellation cannot be replaced by historical success`；后端总期限与 DNS 挂起由 `tools/test/runtime/browser-read-backend.test.ts` 覆盖。 |
| 本次取消 | 已覆盖 | 同上；后端测试还断言取消后不建立连接、调用 Transport cancel，并隔离迟到响应。 |
| 本次 404 | 已覆盖 | `tools/test/runtime/browser-chat-routing.test.ts` 新增 `An HTTP 404 result is a current failure and cannot become a historical success`，使用 `httpStatus: 404`、`ok: false` 和错误页字段，断言结算为 `failed` 且不返回标题成功结论。 |
| 本次读取其他 URL | 已覆盖 | `A different URL cannot satisfy the current Browser target` 断言不同目标为 `not_executed`；授权测试还覆盖 Markdown 标签 URL 不能替代真实目标。 |
| 用户明确回顾历史 | 已覆盖 | `History review remains distinct from a fresh Browser read` 断言回顾请求不创建新的读取意图；当前读取意图仍单独要求当前工具证据。 |
| 本次成功使用当前执行证据 | 已覆盖（自动） | 成功分支、等价 URL 回归，以及 `browser-production-integration.test.ts` 均要求本次 `runId` 的工具输出 `ok: true`、匹配 `sourceUrl` 后才结算成功。 |

URL 匹配修复不等同于所有真实性分支都通过；每个已覆盖分支仍以当前 run 的结构化证据结算。

### 规范化 URL 匹配边界

`argumentMatching: "normalized_url"` 只由 Browser 必需工具契约显式启用。Harness 使用标准
`URL` 解析，仅接受 HTTP/HTTPS；去除 HTTP 80、HTTPS 443 的默认端口和片段后比较规范形式，
其余路径、查询、协议和非默认端口仍必须相同。其他工具仍使用原有 `exact` 匹配。

该匹配只解决模型把 `https://example.com/` 写成等价的 `https://example.com` 的格式差异，
不改变 Main 当前用户目标集合。实际 `browser_read` 仍由当前目标、授权范围、配置修订号和
Sandbox 复查约束；不同路径、查询、协议或端口不能借此获得授权，也不能绕过网页目标与代理
端点的分离校验。

本轮新增的 Browser Chat 矩阵通过 Harness 必需工具门并统计测试 Reader 执行次数：根路径、
HTTPS 默认端口的显式/省略形式可执行；`/hello` 与 `/hello/`、不同路径、查询、协议和非默认
端口均为 `not_executed`，执行次数为零。生产集成测试继续通过同一授权适配器、BrowserReadService
和 Transport 验证显式默认端口，以及同 Origin 但不在当前用户目标集合的请求不产生 Transport
请求。非默认端口的既有策略拒绝由后端 URL 规范化测试直接断言。

### 自动验证

- `npm run typecheck`：PASS；覆盖 Main、Preload、Renderer、测试、工具和 CLI。
- `npm run build`：PASS。
- Browser Chat 路由定向测试：本轮 PASS，14/14；包含 URL 匹配矩阵与精确 404。
- Browser 生产集成定向测试：本轮 PASS，3/3。
- Browser 后端定向测试：本轮 PASS，12/12。
- `npm test`、`npm run build`、两项 Guard：沿用上一轮已记录的 PASS，本轮按要求未重复执行。
- `git diff --check`：本轮 PASS；Git 仅报告既有工作树的换行转换提示，没有差异格式错误。

### 实机验证

此前已有代理模式下的 GUI 读取成功记录，本轮未重复该场景。最新修复后的复测运行是
`run-1789458821441-y6o9z`：权限为 `FULL_ACCESS`，`browser_read` 进入授权链并获准，真实
后端返回 `blocked / non_public_target`，没有 HTTP、连接、标题或正文证据；因此该次被正确结算为
读取失败，没有使用历史结果替代当前结果。

该失败由当前直连环境的 fake-IP `198.18.0.87` 触发现有公开地址策略，未修改 TUN、DNS、
hosts、证书或代理配置。此前运行中发现的旧 Harness URL 比较阻断已经通过本轮自动测试与该次
实机日志确认修复；公网成功读取在当前直连环境仍受网络限制。

### 当前保存设置

只核对与本轮有关的字段，未输出或修改其他配置：

- 权限：`FULL_ACCESS`；
- Browser 传输：`direct`；
- 代理端点：未配置；
- `allowedOrigins`：空列表。

应用保持停止。恢复为直连不代表 fake-IP 环境下可以成功读取公网网页；Browser 直连仍要求
DNS 返回符合公开地址策略的目标。

### 未覆盖项与网络限制

1. 最新修复后在当前直连/fake-IP 环境下没有新的公网成功读取；
2. 代理模式的真实公网读取没有在本次整理中重复；
3. 模型在不同上下文下是否主动选择调用工具，仍需独立人工观察，不能由 Schema 测试替代。

Browser 不会因直连失败自动切换代理，也不会把代理 socket 地址当成网页服务器 IP；当前验证没有
新增网络请求、生产能力或授权许可。
