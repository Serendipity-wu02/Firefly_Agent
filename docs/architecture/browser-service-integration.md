# 唯一集成者最小接线提案

Main 浏览器 owner 实现消费实际 `activeChatTargetRegistry`（src/main/plugin-host/active-chat-target.ts）与 `chats-store.getSession`，不让浏览命令指定 conversation/owner/profile/generation。Main 为实际 host/topFrame/profile/current target 生成私有不透明手动 ownerSessionId，并保持对象身份；每次 await 再验同一个 owner，Session 切换/clear/deletion/reload 先同步撤销。

本任务只修改 src/main/browser 与本篇文档/测试，不抢 renderer/preload/shared/application/window接线。

1. Main composition：`createElectronBrowserService({profile: runtimeProfile, onChanged: (owner,page)=>实际已注册chatWindow.webContents.send(BROWSER_SERVICE_CHANNELS.changed,page)})`。暂时**省略 gateOpen**；仅隔离 QA harness 显式 true，生产 gate不放行。service创建于 ready 后，与现有 IpcScope/ShutdownCoordinator同生命周期。
2. 以真实 chat Window 调用 `registerBrowserHostOwner({host:chatWindow,profile:runtimeProfile,targets:activeChatTargetRegistry,service,readSession:getSession})`。Chat 窗口重建要重新绑定；旧 binding.dispose()。本 helper registerHost 只接受 Main 注册对象，命令 sender/senderFrame 必须是该窗口的精确 topFrame。
3. 在现有 `chat-ui-ipc.ts` 的 `CHATS_SET_ACTIVE_SESSION` 处理结束（setActive/clearActive 后）同步 `browserHostOwner.refresh()`；这是必需的共享小补丁。既有 registry 对普通 session switch/clear 不发 invalidated，不能伪称它已经会通知浏览器；不改它对语音 lease 的现有语义。
4. 替换旧 `registerBrowserAvailabilityIpc` 调用为 `registerBrowserServiceIpc(ipc,service)`，避免重复 availability handler；`installBrowserServiceLifecycle(app,service,shutdown)`注册精确代理 login、client cert/TLS deny、quiesce先revoke和stopExternalConsumers await cleanup，失败交现有coordinator记录。
5. `windows/external-link.ts` 的既有 will-navigate listener 在 preventDefault/openExternalUrl 前插入：

```ts
import { routeBrowserGuestNavigation } from "../browser/browser-guest-routing";
// inside existing contents.on("will-navigate", (event,url)=>...)
if (routeBrowserGuestNavigation(contents,event,event.url ?? url)) return;
```

只有 native factory 登记的精确 WebContents 对象会被路由；默认准备阶段/关闭后继续deny，永不转openExternal。guest factory 的 popup handler一律deny，远程页不获得宿主preload。其它窗口继续原守卫。重定向/subframe由guest+Session唯一请求handler控制。

6. Main-only提案常量 `BROWSER_SERVICE_CHANNELS.command="browser:command"`、`.changed="browser:changed"`。公共shared/preload由集成者加入已有 BrowserAvailabilityApi（true分支尚不属于旧false-only type），以及 execute(command)、onChanged(listener) unsubscribe；不要传gate/owner/profile/run/partition/token。command及 BrowserPageDto 精确类型见 src/main/browser/browser-service.ts。
7. renderer按当前会话接收 BrowserPageDto（conversationId/browserId/requestId过滤），只在native viewport显式layout(bounds)；隐藏标签/compact布局/设置或审批覆盖时layout(null)。Main还在宿主blur/hide和trusted overlay卸下view，并保持禁止挂载状态；layout 时复验实际 native isVisible/isFocused。宿主 show/focus 恢复后，renderer须重新提交当前 viewport layout（焦点变化未必触发 ResizeObserver）。关闭返回closed DTO，过期ID拒绝。初始化开始即发布带 browserId 的 pending/loading DTO，可用 close 取消异步准备；取消回复立即返回，dispose 有总预算，失败保持 cleanup_failed。没有agent/CDP/executeJavaScript/download接口。

Ruling：网页原生导航不preventDefault后改为新的GET loadURL，因为该做法可能把原POST改写为GET。精确guest路由验证active epoch/HTTPS/public URL；原始请求继续经过Session GET/HEAD过滤及受控CONNECT出口，原POST保持原方法并拒绝。未登记页面继续原guard。这沿用批准的双边界，不增加网络权限或新架构；需要集成者采用上述route调用，而非仅移除全局guard。

生产启用条件仍是既有N1–N10、可信公网DNS/TLS与跨协议egress/worker/domain撤销全链路验收；内部service/native消费者的完成不替代这些证明。当前环境DNS对example.com/Wikipedia/GitHub返回198.18.0.*，属于现有策略拒绝的保留网段；不会忽略或改分类。
