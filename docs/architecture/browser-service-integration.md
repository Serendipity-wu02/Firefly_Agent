# Main BrowserService 接线与生命周期契约

- **原始方案日期**：2026-10-05
- **状态**：方案中的核心共享接线已存在于当前源码；本文区分已接入职责与尚未闭合的验收
- **源码核对日期**：2026-10-07，仅核对指定入口，未执行运行时验收
- **结论**：Main 负责宿主身份、授权、原生 guest 路由及退出清理；renderer 只提交受限命令和布局。

## 1. 背景与当前实现

`src/main/application/default-dependencies.ts` 通过 `createStartupBrowserService` 创建服务，并调用 `installBrowserServiceLifecycle` 和 `registerBrowserServiceIpc`。Chat Window 使用 `registerBrowserHostOwner` 绑定真实 `activeChatTargetRegistry` 与 `chatsStore.getSession`。

Main 为实际 host、topFrame、profile 和 current target 建立私有 owner 对象与不透明 `ownerSessionId`。浏览命令不能指定 conversation、owner、profile 或 generation 作为权限来源；每次 await 后重新验证同一个 owner，Session 切换、clear、deletion、reload 时先同步撤销。

早期方案要求省略 `gateOpen`，且普通启动入口仍不传该开关。当前 `browser-service.ts` 另支持 `manualBrowsing`、`permissionPolicy` 与 Main `confirmPermission` 形成的 grant，因此“未传 gateOpen”只代表未使用全局开关，不等同于所有权限路径都关闭。本文不宣称这些新增路径已完成全出口安全验收。

## 2. 服务与宿主组合

- 服务与现有 IpcScope、ShutdownCoordinator 共享应用生命周期；`onChanged` 只向当前登记、未销毁的精确 chat host 发送 DTO。
- Chat 窗口重建时释放旧 binding，再注册新宿主。命令 sender/senderFrame 必须是该窗口的精确 topFrame。
- `CHATS_SET_ACTIVE_SESSION` 的 setActive/clearActive 完成后同步刷新 browser owner。普通会话切换不能仅依赖 registry 的 invalidated 通知；其既有语音 lease 语义独立保留。
- `registerBrowserServiceIpc` 统一 availability、permission 与 command 注册，避免重复 availability handler。
- `BROWSER_SERVICE_CHANNELS.command`（`browser:command`）与 `.changed`（`browser:changed`）对应共享 IPC 常量；当前完整公共类型以 `src/shared/manual-browser.ts` 为准。早期仅有 availability/execute/onChanged 的方案不应继续当作完整现行接口。

## 3. 导航与可信 UI 边界

`src/main/windows/external-link.ts` 已在 popup 和 `will-navigate` 路径中优先调用 `routeBrowserGuestNavigation`。只有 native factory 登记的精确 WebContents 对象进入专用路由；准备阶段及撤销后继续拒绝，不转交 `openExternalUrl`。其他窗口保留原有全局守卫。

已登记 guest 的原生导航保留原始 HTTP 方法，由 Session GET/HEAD 过滤及受控 CONNECT 出口继续检查。不能先 `preventDefault` 再统一重发为 GET `loadURL`，否则可能把原 POST 改写为 GET。重定向、subframe 和 popup 仍受 guest 与 Session 唯一请求 handler 约束，远程页面没有宿主 preload。

Renderer 按 `conversationId`、`browserId`、`requestId` 过滤 DTO，仅在可见 native viewport 提交 `layout(bounds)`。非活动标签、compact 布局、设置或审批覆盖时提交 `layout(null)`。Main 在宿主 blur/hide 和 trusted overlay 时卸下 view，并在每次 layout 复验实际 `isVisible`/`isFocused`。show/focus 恢复后须重新提交当前矩形，因为焦点变化未必触发 ResizeObserver。

初始化即发布带 browserId 的 pending/loading DTO，使 close 能取消异步 prepare；取消回复可以先返回，dispose 仍遵守总预算，失败保持 `cleanup_failed`。已关闭或过期 ID 的响应不得恢复视图。

## 4. 认证、证书与退出

`installBrowserServiceLifecycle` 只处理已登记 guest 的精确代理 login；目标站点挑战、未知身份及不匹配 endpoint/realm/scheme 不获得凭据。客户端证书默认拒绝；服务器证书沿正常 TLS 验证，错误证书由统一 one-shot refusal helper 拒绝。

实际 shutdown 注册为：

| 注册 ID | phase | 职责 |
| --- | --- | --- |
| `browser-service-quiesce` | `quiesce` | 同步 `revokeAll()`，拒绝后续请求及凭据 |
| `browser-service-dispose` | `stopExternalConsumers` | await `service.dispose(signal)`；失败抛出固定错误供 coordinator 记录 |

ShutdownCoordinator 记录单项失败后仍继续最终退出。因此 coordinator 的完成不能替代浏览器 dispose 成功证据；必须保留实际清理结果及超时状态。

## 5. 历史结果与剩余验收

2026-10-05 的[共享服务验证](../testing/browser-service-shared-integration.md)覆盖了普通回归、IPC/preload、host 生命周期和合成 native 几何布局。后续[可信 DNS 共享验证](../testing/browser-resolver-shared-integration.md)记录了实际 example.com/GitHub 正常 TLS 与过期证书拒绝；早期“环境仅返回 198.18.0.*，无法验证公网”的状态已被该受控路径补充，不能继续作为全部当前路径的结论。

N1–N10、跨协议 egress、worker/domain 撤销及完整存储/权限证明仍按[网络门槛](../security/browser-public-page-gate.md)逐项判断。真实公网成功、内部模块完成和普通测试通过均不能替代所有门槛；历史 HOLD 不在本次文档整理中解除。
