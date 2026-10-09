# Main BrowserService 与 WebContentsView 实施方案

- **记录日期**：2026-10-05
- **状态**：Main 服务、原生适配器及内部 IPC/lifecycle 模块已实现；保留该阶段验收结果
- **范围**：复用 Session、policyEpoch 和 CONNECT 网络模块，建立受限手动浏览器服务
- **后续状态**：共享入口已接入，见[服务接线说明](browser-service-integration.md)；全量测试的历史环境失败有后续独立验证，不在本文改写为当时通过。

## 1. 背景与目标

离线网络模块需要与实际宿主身份、WebContentsView、导航和关闭生命周期组合。服务必须消费真实 `prepare(context)` 返回的 Session、epoch 和 binding，不采用早期设计中的未实现接口。

原生 `createView` 使用同一个固定 Session 和 WebContents；仅在 prepare 成功、owner/abort/epoch 复验后才执行 `loadURL`。服务内部实现完成不等于 N1–N10 安全证明全部闭合。

## 2. 已实现职责

1. Main 注册精确 host、topFrame、profile 和 owner；跨 await 重新验证取消与撤销，隔离错误及过期响应。
2. Electron 43.1.0 WebContentsView 适配器创建未加载、未附着视图，固定安全 preferences，拒绝 popup、POST 上传请求、设备权限、client certificate 与站点 login。
3. 代理认证只接受精确原生身份；隐藏、视口矩形、历史、关闭和强制销毁受 Main 生命周期控制。
4. Main-only IPC 与 lifecycle adapter 提供可集成模块；外部导航按精确 guest 对象路由，不回退系统浏览器。
5. 审查修复了同文档 history 等待、blur/hide 后迟到 layout 重新挂载、负坐标裁剪及重复 availability 注册问题。

当时依赖版本为 Electron 43.1.0、TypeScript 5.9.3、Vitest 4.1.11。文件选择器、完整跨协议出口和前台 native 绘制不属于已完成证明。

## 3. 集成边界

原生实现阶段仅增加 `src/main/browser` 模块及相应文档和测试。`application/default-dependencies.ts`、`windows/external-link.ts`、公共 preload/shared 接口在后续共享集成阶段完成。

保留默认关闭的 `gateOpen` 构造路径，不以 QA 显式开关代替产品授权。当前源码另有 Main permission grant 路径，不能仅凭 `gateOpen` 省略就断言所有浏览能力不可用；本历史阶段的 gate HOLD 结论只描述当时验收范围。

本阶段未调整目录边界、原生历史后端、真实用户数据、系统证书或系统网络配置。

## 4. 历史验收及失败保留

| 检查项 | 2026-10-05 阶段结果 |
| --- | --- |
| 原生 r2 | 8 项生命周期/隔离检查通过，0 errors，0 focus events |
| 真实调用链 | renderer IPC → Main owner → Session/epoch → WebContentsView → 受控 CONNECT 代理认证 |
| 公网页面 | example.com 当时解析为 198.18.0.162；真实结果为 `ERR_TUNNEL_CONNECTION_FAILED` / `load_failed` |
| 定向回归 | browser + IPC 契约 12 个文件，241 passed |
| 类型与构建 | Main、preload、renderer、测试类型及 `npm run build` 均 exit 0 |
| 独立复审 | 最终无 Important 或 Critical 遗留项 |

隐藏 host 不允许 layout 挂载；上述 smoke 未验收前台 native 绘制或截图。没有通过 TLS/DNS 放行规则绕过保留网段限制。

该阶段最终全量结果为 638 个文件中 637 passed、1 failed；测试 6388 passed、14 failed、2 skipped，exit 1。14 项失败位于 `native-history-presence-process.test.ts`，依赖机器特定的 TEMP/native helper 前置条件；未将失败改为跳过或降低检查标准。该问题与新增浏览器定向回归结果分开记录。

后续[共享服务验证](../testing/browser-service-shared-integration.md)在满足原有前置条件后记录了全量通过。该后续结果不覆盖本阶段失败历史；完整原生材料见[Main 服务验收记录](../testing/browser-service-native.md)。

## 5. 后续变更与验收

- 按当前真实接口维护共享宿主、会话刷新、preload DTO、guest 导航路由及 shutdown 消费者。
- 分别验证可信 DNS/TLS、所有 worker 请求入口、权限/文件选择器、跨协议 egress 及存储清理。
- gate 或 permission grant 的任何启用决定均需对应安全范围与实际证据，不能由内部模块或普通单元测试通过自动推导。
