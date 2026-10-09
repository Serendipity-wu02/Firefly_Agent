# Firefly 文档导航

当前实现、设计契约和历史验收分别阅读。带日期的验证记录仅说明对应阶段，不代表当前工作树、其他平台或真实外部服务已通过验收。

## 产品与运行

- [产品与运行指南](../README.md)
- [独立项目结构、主入口与运行架构](architecture/firefly-runtime.md)
- [维护入口](architecture/firefly-maintenance.md)
- [可靠性边界](architecture/firefly-reliability-boundaries.md)
- [开发与验证命令](../DEVELOPMENT.md)
- [脚本范围与副作用](../scripts/README.md)
- [Work 知识工作区与学习能力](user-guide/knowledge-workspace.md)
- [飞书接入](user-guide/feishu.md)、[NapCat 接入](user-guide/napcat-onebot.md)、[QQ 官方机器人接入](user-guide/qqbot-official.md)：本地接线已核对，外部平台操作仍需人工核验
- [插件开发](plugins/plugin-dev-guide.md)、[插件接口](plugins/plugin-authoring.md)

## 开发设计与职责边界

- 运行与存储：[运行档案](architecture/runtime-profile-storage.md)、[早期存储边界验收](architecture/task-a-verification.md)
- Skills：[宿主契约](architecture/skills-host-contract.md)、[角色分配](architecture/skills-role-allocation.md)
- 默认记忆：[S/M/H 设计](architecture/default-smh-delivery-design.md)、[阶段验收](architecture/default-smh-acceptance.md)
- 角色并行：[调度设计](architecture/parallel-roles-delivery-design.md)、[阶段验收](architecture/parallel-roles-delivery-acceptance.md)
- 工作区与浏览器：[工作区设计](architecture/right-agent-workspace.md)、[BrowserService 集成](architecture/browser-service-integration.md)、[域授权与生命周期](architecture/browser-domain-integration.md)
- 导航与设置：[布局规格](architecture/2026-10-04-renderer-layout-v1.md)、[设置交互](architecture/2026-10-04-ui-settings-followup.md)、[连接状态语义](architecture/2026-10-04-api-status-indicator.md)

## 安全与验证

- [依赖与归档安全维护](security/dependency-management.md)
- [浏览器公网边界及验收条件](security/browser-public-page-gate.md)
- [已知问题](known-issues/README.md)
- [历史设计与验收索引](archive/README.md)：各记录保留适用阶段和未验证范围，不作为当前命令或完整安全认证

## 来源与许可

- [资源更新与来源记录](archive/reviews/resource-refresh-2026-09-26.md)
- [源人设参考](reference/persona/README.md)：不加载、不分发，不作为当前提示词
- [MIT 许可](../LICENSE)、[第三方来源](../THIRD_PARTY_NOTICES.md)、[模型许可](../MODEL_LICENSE.md)
