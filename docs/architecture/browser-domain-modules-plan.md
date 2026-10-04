# Session授权域离线生产模块实施计划

> For agentic workers: 使用superpowers:executing-plans，按既有已批准契约与本次明确实施授权续接；TDD、独立审查及本地可回退提交。共享接线由唯一集成者写，不重开原型调查或请求重复授权。

**Goal:** 提交可整合的Main授权域、代理域适配和prepare/dispose模块，默认gate关闭。
**Architecture:** Session对象与Main owner身份私有注册，policyEpoch冻结目标/方法/资源快照，状态与取消在闭包内。网络准备与清理消费注入Session/view端口；原proxy/public-target模块保持，未知鉴权挑战拒绝。
**Tech Stack:** 本机Electron43.1.0、TypeScript5.9.3、Node24.19.0、Vitest4.1.11；无依赖/CI变更。
**Spec:** [已批准Session/epoch契约](right-agent-workspace.md#2026-10-04-会话授权域验证契约)，及[当前清理失败证据](../testing/browser-cleanup-failure.md)。

## 冻结的文件与接口

1. `src/main/browser/browser-authorization-domain.ts`及同名`.test.ts`：`createBrowserAuthorizationDomainRegistry<S extends object>({isOwnerCurrent,gateOpen?})`。gateOpen构造时快照，默认false，无原地开门API。`BrowserDomainContext`固定Main owner/profile对象、conversationId/browserId/generation/signal；`create(context,session,policy?)`只分配不可复用Session，返回Main私有句柄。句柄提供`epoch/signal/isCurrent/isActive/activate/revoke/registerContents/ownsContents/allows`，epoch/目标数组冻结；可选hosts只收缩目标，方法永远GET/HEAD、资源沿现有白名单。owner回调异常、取消、销毁或撤销持续拒绝。
2. `src/main/browser/browser-domain-proxy.ts`及测试：`startBrowserDomainProxy(domain,contents,proxyFactory?)`消费真实Main注册contents及未改`startAuthenticatedConnectProxy`。准备前后复验，迟到proxy撤销；`credentialsFor(contents,challenge)`只接受相同原生对象/Session/ID、活动域及原精确proxy条件，无contents挑战拒绝。返回凭据只留Main。
3. `src/main/browser/browser-network-binding.ts`及测试：`createBrowserNetworkController(registry,{createSession,createView,proxyFactory?,cleanupTimeoutMs?,workerStopTimeoutMs?})`，生产端口适配`createElectronBrowserSessionPort(session)`仅type import Electron。`prepare(context,policy?)`返回结构化reply，先gate/owner校验、同步独占owner/browser槽，再新partition/默认deny/权限拒绝、创建未导航view、proxy、setProxy/closeAllConnections，每await及激活前复验。binding提供`session/epoch/isCurrent/revoke/dispose`，controller提供`revokeAll/disposeAll`。

## Global Constraints

- 默认gate关闭且零Session/view/proxy副作用；开启配置只属于Main构造，不能来自renderer/model/DTO。本轮集成说明仍要求省略gateOpen，不实际创建浏览器。
- Main提供`isOwnerCurrent`，必须从实际host/profile/conversation注册表核验完整快照，不能只检查字段或活动标签；本模块不伪造现有注册。
- Session端口须明确非persist且新对象；重复/持久Session拒绝，不能清理借来的旧/真实用户Session。新partition由Main模块randomUUID生成，不接受renderer分区键。
- 旧策略/R2权限/原proxy/DNS预算不改；Worker继承同域，无默认禁Worker；公网数值dial/GETHEAD/资源/协议/撤销限制保留。
- 方法/目标权限变化先revoke/dispose旧绑定、确认清理，再prepare新域；同owner/browser同时prepare拒绝，不能替换活跃域或改epoch内容。
- 清理先同步deny/abort/proxy revoke/destroy，然后分别尝试连接/存储/cache/auth/resolver；异常/超时保留cleanup_failed，不跳过后域。默认总清理预算沿现有shutdown的10000ms，worker观察每绑定最多3000ms，不能恢复域。
- 无bootstrap/IPC/preload/renderer/shutdown/external-link实际写入，无R1、目录迁移、记忆、真实userData、持久登录、POST放行、外部服务、证书或系统网络设置。
- Windows优先；productiongate HOLD、可信TLS/公网DNS及全协议出口缺口保留。

## Review Focus

- reused/persistent/default Session：必须在权限handler或清理副作用前拒绝，保护其它域数据。
- await期间撤销/owner换代：不能晚激活、发凭据或启动下一个副作用；迟到资源回收且失败可观察。
- 模型构造owner/contents DTO与缺ID/frame：不授予Main注册权；已注册Session workers按方法/目标继承。
- 首个清理reject、超时或destroy异常：其它步骤与其它绑定仍尝试，回cleanup_failed而非成功；重复dispose复用结果。
- policy/配置/contents对象后续变动、未知challenge：快照不被扩大，假contents或Session/ID变化拒绝，原proxy条件保留。

## 执行任务

- [x] Domain RED：默认gate/owner未知拒绝；冻结输入复制；Session不可复用；准备deny→activate；缺ID/frame继承GET而POST/私网/资源拒绝；主contents拷贝/Session或ID变化、owner换代/abort/revoke拒绝。
- [x] 最小实现domain；定向GREEN并保留旧request-policy回归。
- [x] Proxy RED：缺/假contents、准备阶段、错误端点/realm/owner拒绝；真实core proxy或注入端口共享执行；start await撤销后晚proxy回收。
- [x] 最小实现proxy；定向GREEN。
- [x] Controller RED：默认gate零工厂；defaultdeny先于view；persistent/reused保护；多prepare；代理/setProxy/关闭连接各await取消；owner换代；原生端口所有权限拒绝；A清理失败后B仍清理、重复dispose/销毁异常/清理超时、worker状态延迟与超时。
- [x] 最小实现controller/nativeSession端口；定向GREEN。
- [x] 独立安全/质量审查，Required修正保留RED/GREEN；执行浏览模块、全量Vitest、Main/preload/renderer类型检查、实际npm build。
- [x] 提交Main新模块、验证记录和唯一集成者接线说明；shared shutdown/external-link只给最小patch提案，不写共享文件。

## 接线交付约束

审查后的接口增量：共享registry的`retireSession(session)`永久消耗取消的分配，避免跨controller重新授权；binding提供`credentialsFor`供唯一Main login路由。清理同时有界观察原生contents实际销毁与worker=0。迟到proxy清理失败通过固定`BrowserProxyCleanupError`保留为cleanup_failed，不回传原始错误。接线示例及共享最小patch提案见[browser-domain-integration.md](browser-domain-integration.md)。

提供新模块函数的可编译Main调用示例与真实Electron Session端口适配；view由父创建但保持未导航且隐藏。父必须冻结真实owner注册、global app.login的精确registered contents路由、shared导航及shutdown参与者。默认调用不传gateOpen，prepare应permission_denied且零工厂；无gate正式验收前不要加启动/IPC消费。完整最小patch提案随实现接口更新，不引用不存在的BrowserService实现，不自动修改shared文件。
