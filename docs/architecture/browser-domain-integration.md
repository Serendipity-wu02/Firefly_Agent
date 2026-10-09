# Session 授权域 Main 接线契约

- **记录日期**：2026-10-04
- **状态**：离线模块接口已实现；本文的 shutdown 与 external-link 片段为初始接线方案
- **后续状态**：实际共享入口由[BrowserService 接线](browser-service-integration.md)实现，不能重复安装本文历史示例
- **范围**：授权域、精确代理身份、Session 准备/撤销/清理及职责边界

## 1. 背景与实现接口

授权域模块将 Session 对象与 Main owner 身份绑定，使页面及 worker 在同一个不可变 epoch 下继承策略。renderer/model DTO 不能建立 Main authority，代理凭据不能进入公开接口。

- `browser-authorization-domain.ts`：`createBrowserAuthorizationDomainRegistry<S>`、`BrowserDomainContext`、`BrowserDomainPolicy`。Main 对象身份与 `isOwnerCurrent` 核验真实归属。`gateOpen` 构造时快照，缺省 false，无原地开启 API；当前源码另有 Main-only `isContextAuthorized` 授权回调。
- `browser-domain-proxy.ts`：`startBrowserDomainProxy(domain, contents, proxyFactory?)`。保留 CONNECT 代理的 endpoint、realm、Basic 与原生 ID 检查；准备阶段或缺失/克隆 contents 不返回凭据。
- `browser-network-binding.ts`：`createBrowserNetworkController(registry, dependencies)` 与 `createElectronBrowserSessionPort(session)`。controller 提供 `prepare/revokeAll/disposeAll`；binding 保留原生 `session`、不可变 `epoch`、`isCurrent/revoke/dispose/credentialsFor`，全部只在 Main 使用。

`prepare(context, policy?)` 使用 Main 生成的随机非 persist partition，在拒绝 persistent/重复 Session 后才安装 handler。共享 registry 永久记录已接收的 Session，包括取消后未形成域的分配；`retireSession` 只能消耗 Session，不能授予权限。不得创建独立 registry 复用这些 Session，也不得将其他消费者的 Session 作为 factory 返回值。

## 2. 身份与政策边界

context 的 owner/profile 来自 Main 私有注册表，conversationId/browserId/generation 与当前登记精确匹配。回调同时核验原生宿主联系、存活与未撤销，不能仅检查对象形状、字符串、活动会话标签或 URL。

owner 切换先 revoke/dispose 旧 binding，成功清理后才创建新 Session 和 epoch；失败槽不释放。方法固定 GET/HEAD，资源沿既有白名单。可选 `hosts` 收窄目标；当前 `resourceHosts` 扩展以实际模块契约为准，不能解释为通用网络许可。

Session 默认拒绝先于 view 生效。没有 request WebContentsId 的 worker 继承已注册 Session 的请求策略，但不能因此获得 login 或其他原生身份。DNS 数值固定和公网过滤仍由 CONNECT 模块执行。

## 3. 默认拒绝的 Main 构造示例

以下是只提供 owner 校验、未提供 gate 或授权回调的最小构造，不代表完整现行 BrowserService：

```ts
import { session, type Session } from "electron";
import { createBrowserAuthorizationDomainRegistry, type BrowserDomainContext } from "../browser/browser-authorization-domain";
import { createBrowserNetworkController, createElectronBrowserSessionPort, type BrowserNetworkDependencies } from "../browser/browser-network-binding";

function createOfflineBrowserModules(
  isOwnerCurrent: (context: BrowserDomainContext) => boolean,
  createView: BrowserNetworkDependencies<Session>["createView"],
) {
  const registry = createBrowserAuthorizationDomainRegistry<Session>({ isOwnerCurrent });
  return createBrowserNetworkController(registry, {
    createSession: (partition) => createElectronBrowserSessionPort(session.fromPartition(partition, { cache: false })),
    createView,
  });
}
```

该示例的 prepare 返回 `permission_denied`，createSession/createView/proxyFactory 调用均为零。不能在 renderer/model/IPC 中增加 gate 参数，也不能因为离线测试通过而设置生产全局 gate。

`createView` 必须使用传入的精确 Session，返回真实 native contents 与 destroy 操作。创建时隐藏、未导航，不执行 loadURL/loadFile、可见 attach 或脚本。Main 固定 `sandbox/contextIsolation/webSecurity=true`，`nodeIntegration/nodeIntegrationInWorker/nodeIntegrationInSubFrames/allowRunningInsecureContent=false`，无第三方 preload。

prepare 成功只表示该层编排完成，不证明公网 TLS、全部协议或实际 worker login 已验收；失败不输出原始异常、用户名或密码。

## 4. Shutdown 接线与清理契约

初始方案使用真实 `ShutdownCoordinator` 的已有 phase，不修改其单项错误继续及最终退出语义：

```ts
shutdown.register({
  id: "browser-domains-quiesce", // 历史方案注册 ID，现行服务使用自己的参与者
  phase: "quiesce",
  dispose: () => network.revokeAll(),
});
shutdown.register({
  id: "browser-domains-dispose",
  phase: "stopExternalConsumers",
  dispose: async (signal) => {
    const result = await network.disposeAll(signal);
    if (!result.ok) throw new Error("browser domain cleanup_failed");
  },
});
```

quiesce 同步拒绝请求/凭据、取消 prepare 并尝试关闭 proxy、销毁 view。disposeAll 对所有域尝试连接、storage/cache/auth/resolver 清理。默认总预算 10000ms；真实销毁和 worker=0 观察在剩余预算内最多 3000ms，不能以 `clearStorageData` resolve 替代。

caller signal 与已撤销 owner signal 分开。超时、原生销毁/清理异常或迟到代理回收失败均为 `cleanup_failed`；重复 dispose 复用原结果，不能升级为成功。A 清理失败不得跳过 B。coordinator resolve 不代表 browser 清理成功，close reply 与验证记录必须消费实际 dispose 结果。

## 5. Login 与导航路由

Login 路由以 `Map<实际 WebContents, 实际成功 binding>` 的精确对象身份为依据：prepare 成功才进入可认证集合，revoke/dispose 后移除。对归属该服务的 native login 先 preventDefault，再调用 `binding.credentialsFor(contents, { ...authInfo })`，以凭据或无参 callback 结束。

缺失/未登记 contents、站点 Basic、错误 endpoint/realm/scheme 拒绝；不能用 PID、URL、proxy realm 或 endpoint 推导 Session。Electron 43 类型虽将 app.login contents 声明为必填，历史固定源码存在缺失可能，运行时仍需处理。无 ID 的 Session request 通过不代表无 contents 的 login 能认证。

external-link 初始方案是在 `installGlobalNavigationGuard` 中增加 Main 路由参数；现行实现采用 `routeBrowserGuestNavigation`。两者共同要求精确对象路由覆盖撤销后尚未销毁的 tombstone，避免 fallthrough 到系统浏览器，popup 始终 deny。

早期“preventDefault 后重发 GET”的导航提案已由后续实现修正：保留原生请求方法，再执行 Session GET/HEAD 过滤，防止将 POST 改写为 GET。禁止按 URL 前缀、同源或 Session 形状绕过全局守卫。

## 6. 历史验收与剩余证明

该离线阶段未新增真实浏览器整体测试、可信公网 TLS、HTTPS 主 worker 脚本成功、全协议/权限入口或 owner/login/navigation/shutdown 整体证明；其余平台未测。对应状态为 HOLD，不能用模块测试代替放行。

后续实际共享接线及可信 TLS 结果见[服务说明](browser-service-integration.md)和[resolver 说明](browser-trusted-resolver.md)。这些后续证据按各自范围补充原结论，不取消尚未完成的跨协议、worker 和完整生命周期验收，也不授权证书绕过或系统网络变更。
