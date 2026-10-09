# 浏览器与右侧工作区离线集成方案

- **记录日期**：2026-10-04
- **状态**：离线集成及隔离 GUI 验证已完成；本文保留该阶段的范围和证据
- **范围**：Main 只读可用性、preload DTO、单一 Inspector 浏览器入口及既有 UI 回归
- **后续状态**：真实 BrowserService 与共享接线已由后续阶段实现，见[服务接线说明](browser-service-integration.md)。历史离线结果不代表当前浏览器的完整安全验收。

## 1. 背景与目标

本阶段将匿名浏览器离线模块与右侧工作区 UI 组合，提供可见且状态真实的浏览器入口。在公网 DNS、可信 TLS 与全协议出口证明尚未完成时，产品入口保持不可用，不创建真实 guest、代理或导航请求。

已有音乐、聊天声明、头像、设置及模型状态变更纳入 UI 回归；原生历史后端及未完成的其他功能不属于本阶段范围。

## 2. 实现边界

- Main 发布只读 browser availability，经受限 preload DTO 传递到现有单一 Inspector。
- gate 关闭时禁用表单导航、历史和刷新；关闭标签或切换会话时清空展示。
- 不新增模型或 Agent 浏览器 API，不接入实际 BrowserService、login、navigation 或 shutdown 消费者。
- 匿名交互 fixture 只存在于 QA 入口及独立非 persist Session，不扩展产品 URL、证书或网络策略。
- 隔离 profile 不读取真实 userData、模型/API 凭据或登录档案，不使用外部服务。

## 3. 历史验收

实际 Windows Electron GUI 通过既有 Playwright/Electron QA 方案验证。检查覆盖布局、模型状态及设置、右侧文件树、真实 fixture 预览、浏览器不可用入口和匿名 fixture 交互。该验证不包含操作系统前台鼠标键盘、原生 tray 或完整桌面行为。

| 检查项 | 2026-10-04 记录结果 |
| --- | --- |
| 完整自动化测试 | 631 个文件，6327 passed，2 skipped |
| 联合定向测试 | 25 passed |
| 类型检查 | Main、preload、renderer 及包含 5 个测试文件的检查均 exit 0 |
| 构建 | exit 0 |
| 独立安全与质量审查 | 无 Critical、Required 或 Important 遗留项 |
| 隔离 GUI | 11 passed，1 blocked，errors 0；6 张截图逐张检查 |

完整证据及限制见[离线候选验证](../testing/browser-ui-candidate.md)。这些数字是历史记录，本次文档整理未重新执行相应测试。

## 4. 遗留问题与后续验收

历史 QA 记录了重启后未发送草稿为空、英文深色模式未实现、设置外部更新缓存及未知 provider 风险；这些问题不通过本阶段引入额外持久化或新功能修复。

后续真实服务验收应分别核对共享接线、原生生命周期、可信公网传输、worker/存储撤销及跨协议出口，不能沿用离线 GUI 数字宣称网络门槛通过。后续进展见[服务原生实现](browser-service-native-plan.md)与[可信 DNS 接线](browser-trusted-resolver.md)。
