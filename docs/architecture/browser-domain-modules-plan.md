# Session 授权域与网络编排模块实施方案

- **记录日期**：2026-10-04
- **状态**：离线 Main 模块已实现；后续 BrowserService 与共享接线另有记录
- **范围**：Main 授权域、代理域适配、prepare/revoke/dispose 及 Electron Session 端口
- **约束**：本阶段默认 gate 关闭；离线测试不能替代真实网络和退出链路验收

## 1. 背景与目标

以 Session 对象和 Main owner 身份建立私有授权域，通过不可变 `policyEpoch` 固定目标、方法及资源策略。状态与取消保留在闭包中；网络准备和清理通过注入的 Session/view 端口完成。原 CONNECT 代理及公网目标分类继续负责数值地址固定，未知鉴权挑战拒绝。

依据为[会话授权域契约](right-agent-workspace.md#2026-10-04-会话授权域验证契约)与[清理失败证据](../testing/browser-cleanup-failure.md)。历史实现环境为 Electron 43.1.0、TypeScript 5.9.3、Node 24.19.0、Vitest 4.1.11，无依赖或 CI 策略变更。

## 2. 模块与接口

| 模块 | 核心契约 |
| --- | --- |
| `browser-authorization-domain.ts` | `createBrowserAuthorizationDomainRegistry<S extends object>`；注册 Main owner/profile、conversationId/browserId/generation/signal 与不可复用 Session |
| `browser-domain-proxy.ts` | `startBrowserDomainProxy(domain, contents, proxyFactory?)`；只向登记的精确原生 contents、活动域和匹配代理挑战发凭据 |
| `browser-network-binding.ts` | `createBrowserNetworkController(registry, dependencies)`；有序 prepare、撤销及有界清理 |
| Electron Session 端口 | `createElectronBrowserSessionPort(session)`；生产适配器只使用 Electron type import，实际 Session 由 Main 提供 |

授权域句柄提供 `epoch/signal/isCurrent/isActive/activate/revoke/registerContents/ownsContents/allows`。epoch 和目标数组冻结，方法固定 GET/HEAD，资源沿既有白名单。owner 回调异常、取消、销毁和撤销后持续拒绝。

网络 controller 提供 `prepare/revokeAll/disposeAll`；binding 保留原生 `session`、不可变 `epoch`、`isCurrent/revoke/dispose/credentialsFor`。prepare 在每次 await 后及激活前重新验证 owner/abort/epoch，不允许迟到资源激活。

历史最小 registry 构造参数为 `{ isOwnerCurrent, gateOpen? }`。当前源码已增加 Main-only `isContextAuthorized`，目标政策已扩展 `resourceHosts`；这些增量不能由旧阶段“仅 gateOpen”描述覆盖。无授权回调且省略 gateOpen 的最小示例仍为拒绝路径，现行授权接线见[服务说明](browser-service-integration.md)。

## 3. 安全与资源边界

- Session 必须是新的非 persist 对象。Main 用 `randomUUID` 生成 partition，不接受 renderer 分区键；persistent/default/reused Session 在 handler 或清理副作用前拒绝。
- 共享 registry 的 `retireSession(session)` 永久消耗已取消的分配；不得创建第二个 registry 重新授权旧 Session。
- `isOwnerCurrent` 通过实际 host/profile/conversation 注册表核验完整快照，不能仅检查字段形状或活动标签。
- 同 owner/browser 的并行 prepare 被拒绝。目标或方法权限变化先 revoke/dispose 旧 binding，确认清理后才创建新域，不原地改写 epoch。
- 新 Session 的 deny 与权限 handler 先于 view 创建；view 隐藏且未导航。worker 继承已注册 Session 的请求策略，不通过缺失 ID/frame 推导登录权限。
- 撤销先同步 deny/abort/proxy revoke/destroy，再分别尝试 connections/storage/cache/auth/resolver 清理。单项失败不跳过其他步骤或其他 binding。
- 默认清理总预算 10000ms；原生销毁和 worker=0 观察在剩余预算内最多 3000ms。`clearStorageData` resolve 不能替代 worker 停止证明。
- destroy 异常、超时和迟到代理回收失败保留 `cleanup_failed`；`BrowserProxyCleanupError` 不携带原始秘密错误，重复 dispose 复用原结果。

## 4. 历史实现与验收

该阶段已完成以下测试驱动实现和独立审查，详细数量及退出码见[模块验证](../testing/browser-domain-modules.md)：

1. Domain：默认拒绝、owner 未知、冻结输入复制、Session 不可复用、准备 deny 到 activate、worker 缺 ID/frame 的同域 GET 继承及 POST/私网/资源拒绝。
2. Proxy：缺失或伪造 contents、准备阶段、错误 endpoint/realm/owner 拒绝；异步撤销后的迟到 proxy 回收。
3. Controller：默认配置零工厂调用、deny 先于 view、重复和 persistent Session 保护、各 await 取消、owner 换代与所有权限拒绝。
4. Cleanup：首域失败仍清理后域、重复 dispose、destroy 异常、总预算超时、worker 状态延迟与超时。
5. 审查修正后执行浏览器定向模块、全量 Vitest、Main/preload/renderer 类型与实际构建；不将历史结果作为本次文档整理的重跑结果。

## 5. 后续接线与验收

[模块接线说明](browser-domain-integration.md)保留了默认拒绝的 Main 构造、shutdown/login 与 external-link 初始方案。后续实现以[BrowserService 接线](browser-service-integration.md)为准，不重复注册旧的示例参与者。

模块阶段没有修改 bootstrap、IPC、preload、renderer、shutdown 或 external-link，也没有操作真实 userData、持久登录、外部服务、证书或系统网络。Windows 以外平台未验收。可信 TLS、公网 DNS、跨协议出口及完整 owner/login/navigation/shutdown 链路在当时保持 HOLD，后续部分证据须逐项读取，不能将模块完成推导为生产放行。
