# Main BrowserService / WebContentsView 接续

基线 c98e5fd2bfa89f3b477330798d93c48a6ceb820d；现有 worktree，分支 feat/browser-service-native-20261005。用户授权真实功能交付，复用既有 Session/epoch/CONNECT 模块。原工作区、renderer/preload/shared、R1/H backend、生产 gate、系统证书/网络配置不修改。

- [x] TDD：Main 注册的精确 host/topFrame/profile/owner 身份、跨 await 取消/撤销、真实 network controller 准备、导航/历史/关闭/显示矩形、错误/过期响应隔离。
- [x] TDD：Electron43 WebContentsView 原生 adapter，未加载/未附着创建、安全偏好、拒绝 popup/POST 上传请求/设备/client-cert/站点login、代理精确身份鉴权、隐藏和强制销毁。文件选择器与跨协议出口不据此宣称验收通过。
- [x] Main-only IPC/lifecycle adapter（不修改公共 channel/type/preload），向唯一集成者给最小接线提案；全局导航守卫动态精确 guest 路由必须由集成者接入，绝不 fallback 系统浏览器。
- [x] 定向测试、严格类型/build、fresh-context Codex review；复用 E fixture 验证真实 native view、取消/清理，真实匿名 HTTPS 按实际公网DNS/TLS约束尝试并记录失败限制。全量最终复验结果另见测试交付文档，不宣称全部绿色。
- [x] 保留默认 gate；记录内部实现完成项与确切剩余外部验收差项，local commit/no push。

Ruling: 现有网络 controller API 而非旧文档提案为执行接口；service 消费 prepare(context) 返回的 Session/epoch/binding，createView 使用同一固定原生 WebContents，loadURL 只在 prepare 成功且 owner/abort/epoch 再验后发生。

Ruling: native Service/IPC/lifecycle 只新增 src/main/browser 模块，现有 application/default-dependencies/windows/external-link 和公共 preload/shared 改动由集成者实施。Main helper可直接调用真实模块，交付最小patch提案，不把“集成者尚未接线”误报为外部网络问题。

既有 full verification（b11fd69）：631 files/6327 pass/2skip；此次新功能必须重新验证，不继承旧GUI通过。本机可读取 using-superpowers（delegated SUBAGENT-STOP）、context-engineering、executing-plans、TDD/writing-good-tests、source-driven-development、security-and-hardening、constraints、verification/review 文件；服务技能目录未暴露不等于宣称不存在磁盘技能。未发现 .agents/skills/vendor/firefly-skills/skills，未伪造该目录。

官方参考固定 Electron43.1.0：WebContentsView、WebContents/NavigationHistory、Session、App 事件；实际依赖43.1.0、TS5.9.3、Vitest4.1.11。既有生产gate关、不借QA bypass宣称真实公网TLS通过。

审查闭环：修复同文档 history 等待、blur/hide 后延迟 layout 重新挂载、负坐标裁剪；独立 Astra medium reviewer 对实际实现做只读复现，最终无 Important/Critical 剩余。复用旧 availability 注册点，消除重复注册及不可达注册的 IPC 契约失败，未修改检查策略。

native r2：新建 E smoke profile，实际 renderer IPC→Main owner→Session/epoch→WebContentsView→受控 CONNECT 代理认证。8 项生命周期/隔离检查通过、0 errors、0 focus events；example.com DNS 198.18.0.162 非公网，实际 ERR_TUNNEL_CONNECTION_FAILED / load_failed。无 TLS/DNS 绕过。隐藏 host 不允许 layout 挂载，前台 native 绘制/截图不验收。

全量首轮：638 files，636 passed，16 failed tests。其中本轮两个 IPC 契约问题已修复；其余 14 项位于基线 native-history-presence-process.test.ts，硬编码 E:\\Codex\\2026-10-03\\task-10 的 TEMP/native helper。该 H backend/外部 fixture 不在本任务修改授权范围内，保持不变，交唯一集成者处理。

最终全量：638 files，637 passed / 1 failed；6388 tests passed / 14 failed / 2 skipped，exit 1。唯一失败仍是基线 H fixture 前置条件。browser + IPC 契约定向 12 files / 241 passed，Main/preload/renderer/测试类型及 npm build 全部 exit 0。没有将全量失败改成跳过或降低门禁。
