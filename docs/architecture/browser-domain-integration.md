# Browser Session/epoch 模块接线交付

本轮只交 Main 可离线模块。生产 gate 默认关闭，无 IPC、真实浏览器创建、导航、shutdown 或 external-link 接线副作用。共享接线由唯一集成者写；以下代码/patch 是提案，不是已安装的入口。

## 实际 API 与权限来源

- `browser-authorization-domain.ts`：`createBrowserAuthorizationDomainRegistry<S>`、`BrowserDomainContext`、`BrowserDomainPolicy`。Main 对象身份及 `isOwnerCurrent` 为唯一权限来源。`gateOpen` 构造时快照，省略为 false，没有原地开启方法。
- `browser-domain-proxy.ts`：`startBrowserDomainProxy(domain, contents, proxyFactory?)`。严格保留原 CONNECT 代理的端点、realm、Basic、原生 ID 检查。准备阶段和缺失/克隆 contents 的挑战不返回凭据。
- `browser-network-binding.ts`：`createBrowserNetworkController(registry, dependencies)`、`createElectronBrowserSessionPort(session)`。返回 `prepare`、`revokeAll`、`disposeAll`。绑定返回原生 `session`、不可变 `epoch`、`isCurrent/revoke/dispose/credentialsFor`，全部仅留 Main。

`prepare(context, policy?)` 使用 Main 生成的随机非 persist partition；拒绝 persistent/重复 Session 后才安装 handler。共享 registry 永久记住已接收的 Session，包含取消而未形成域的分配；`retireSession` 只能消耗 Session，不能授予权限。不得创建第二个独立 registry 来复用这些 Session，也不得把其他消费者的 Session 作为 factory 返回值。

context 的 owner/profile 必须来自 Main 私有注册表；conversationId/browserId/generation 必须与当前登记精确匹配。回调需确认这些字段与原生宿主的联系、宿主存活且未撤销，不能仅检查对象形状、字符串、活动会话标签或 URL。owner 切换先 revoke/dispose 旧绑定；成功清理后才创建新 Session 和新 epoch。失败的槽不会释放。

policy 可选 hosts 只收窄目标，缺省不新增站点限制；GET/HEAD 与现有资源白名单固定。Session 的默认拒绝在 view 之前生效；无 request webContentsId 的 worker 继承已注册 Session 的请求策略，不能因此获得 login 或其他原生身份。DNS 数值地址固定和公网过滤仍由未修改的 CONNECT 模块执行。

## 默认关闭的 Main 构造示例

以下依赖参数是集成者必须提供的真实 Main 能力。它们不是仓库中已经存在的 BrowserService，也不是 model/renderer DTO。

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

省略 gateOpen 时，prepare 返回 permission_denied，createSession/createView/proxyFactory 调用均为零。不要在 renderer/model/IPC 中加入 gateOpen 参数，也不要因为本轮离线测试通过而在生产构造中设置 true。

createView 必须使用传入的确切 Session，创建隐藏、未导航的视图，并将实际原生 contents 与 destroy 操作返回。安全 WebPreferences 必须由 Main 固定：sandbox/contextIsolation/webSecurity=true，nodeIntegration/nodeIntegrationInWorker/nodeIntegrationInSubFrames/allowRunningInsecureContent=false，无第三方 preload。不得在 factory 中 loadURL/loadFile、attach 可见内容或执行脚本。唯一集成者还需冻结窗口/导航/权限策略并验证实际销毁行为。本模块不提供导航或 Electron runtime 入口。

prepare 成功仅表示离线编排完成；它不是公网 TLS、所有协议或实际 worker 登录链路已经获证。失败不会输出原始异常、用户名或密码。

## shutdown 最小接线提案

实际共享类型为 `src/main/application/shutdown.ts` 的 ShutdownCoordinator；阶段名已核对。不修改 coordinator 的错误继续/最终退出行为。

```ts
shutdown.register({
  id: "browser-domains-quiesce", // 新增注册 ID 提案
  phase: "quiesce",
  dispose: () => network.revokeAll(),
});
shutdown.register({
  id: "browser-domains-dispose", // 新增注册 ID 提案
  phase: "stopExternalConsumers",
  dispose: async (signal) => {
    const result = await network.disposeAll(signal);
    if (!result.ok) throw new Error("browser domain cleanup_failed");
  },
});
```

quiesce 同步拒绝所有请求/凭据、取消准备并尝试关闭代理/销毁视图；disposeAll 对所有域并行尝试连接、storage/cache/auth/resolver 清理。默认总预算 10000ms，视图实际销毁及 worker=0 观察在剩余总预算内最多 3000ms；不是 clearStorageData 一 resolve 就认为 worker=0。caller signal 与已撤销的 owner signal 分开。超时、原生销毁/清理异常、迟到代理回收失败均为 cleanup_failed；重复 dispose 复用原结果，不升级为成功。

coordinator 当前会记录 dispose 抛错后继续最终退出，因此它的 requestControlledShutdown resolve **不是** browser 清理成功凭据。浏览器 close reply、验证 ledger 必须记录实际 dispose reply。单个 A 失败不得跳过 B。

## app.login 的 Main 身份路由提案

集成者应建立 `Map<实际 WebContents, 实际成功 binding>`，在 prepare 成功后加入，在 revoke/dispose 时删除。不记录准备域为可认证域。native app.login 中仅对 exact map key 调用 `binding.credentialsFor(contents, { ...authInfo })`；先 preventDefault，再凭据或无参 callback 结束。缺失 contents、未登记 contents、服务端 Basic、错误端点/realm/scheme 一律拒绝，不能用 PID、URL、proxy realm 或 endpoint 推导 Session。不得把凭据写到 renderer、日志、DTO 或 storage。

现有 Electron43 声明的 app.login webContents 是必填，但此前固定版本源码显示可能缺失；入口仍需运行时检查。无 ID 的 Session request 能通过请求策略，不代表无 contents 的 login 能获得认证；相应真实 HTTPS worker 正向验证仍 HOLD。

## external-link 最小 patch 提案（未应用）

实际共享文件 `src/main/windows/external-link.ts`，实际调用 `src/main/application/normal-main.ts` 的 `installGlobalNavigationGuard()`。集成者可增加一个可选 Main 路由参数，保持缺省行为，并在 popup / will-navigate 两处分流：

```diff
-export function installGlobalNavigationGuard(): void {
+export function installGlobalNavigationGuard(browserRoute?: {
+  owns(contents: Electron.WebContents): boolean;
+  onNavigation(contents: Electron.WebContents, url: string): void;
+}): void {
   app.on("web-contents-created", (_event, contents) => {
     contents.setWindowOpenHandler(({ url }) => {
-      openExternalUrl(url);
+      if (browserRoute?.owns(contents)) browserRoute.onNavigation(contents, url);
+      else openExternalUrl(url);
       return { action: "deny" };
     });
     contents.on("will-navigate", (event, url) => {
       event.preventDefault();
-      openExternalUrl(url);
+      if (browserRoute?.owns(contents)) browserRoute.onNavigation(contents, url);
+      else openExternalUrl(url);
     });
```

这只提案导流接口，不授予导航权限。owns 必须是私有精确原生对象 map，包括已撤销但尚未销毁的 tombstone，防止撤销后 fallthrough 到系统浏览器。onNavigation 需重新验证活跃 binding/policy/owner、固定 GET/HTTPS，再走集成者的 Main 导航入口；生产 gate 关闭时拒绝。popup 始终 deny，不能用 URL 前缀、同源或请求 Session 形状绕过全局守卫。这里没有实现 route、Main 导航服务或共享 patch。

## 尚未验证与禁区

Windows 优先。没有新增真实浏览器/native 整体测试、公网 DNS/可信 Chrome TLS 正向证据、真实 HTTPS 主脚本 worker 成功证据、所有跨协议/权限入口验证或 owner+login+导航+shutdown 接线验证。其余平台未测。production gate 保持关闭，不能安装根证书、禁用校验、另建外部服务或用原生 backend 绕过阻塞。本轮未改 R1/renderer/CI/真实 userData。
