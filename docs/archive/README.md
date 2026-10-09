# 历史设计与验收索引

本索引收录按阶段保存的技术设计、问题分析和验收结论，不作为当前实现规范。日期、平台、输入范围和未验证项决定历史结论的适用范围；旧测试数字、旧文件名和计划复选框不代表当前工作树状态。

## 来源与早期设计

- [原始基座来源对照](migration/firefly-source-diff-review-2026-09-25.md)
- [继承 Skills 来源与许可核验](refactor/2026-09-26-dependency-governance.md)
- [历史设计](design/)
- [历史重构与依赖核验](refactor/)
- [资源来源与 21 项贴图映射](reviews/resource-refresh-2026-09-26.md)

## 问题与验证记录

- [已解决问题](issues/)、[仍待核实的外部问题](../known-issues/README.md)
- [CI 故障条件与修正](ci/)
- [运行档案与存储边界验收](../architecture/task-a-verification.md)
- Moments 退役：[后端范围](../architecture/2026-10-04-moments-main-cleanup.md)、[代码与安全审查](../architecture/2026-10-04-moments-main-independent-review.md)、[Renderer 联动](../architecture/2026-10-04-renderer-layout-v1.md)
- [浏览器阶段验证](../testing/)

## 历史变更方案

- 默认记忆：[共同边界设计](../architecture/default-memory-and-parallel-roles-design.md)、[实施方案](../architecture/default-smh-implementation-plan.md)、[验收结论](../architecture/default-smh-acceptance.md)
- 角色并行：[实施方案](../architecture/parallel-roles-implementation-plan.md)、[验收结论](../architecture/parallel-roles-delivery-acceptance.md)
- 工作区与浏览器：[工作区方案](../architecture/right-agent-workspace-plan.md)、[网络模块方案](../architecture/browser-network-modules-plan.md)、[服务方案](../architecture/browser-service-native-plan.md)

历史方案用于说明设计依据和技术约束，不自动授权重新执行迁移、删除、提交、推送或部署。原先已从工作树移除的重复施工资料仍可通过 Git 历史追溯；本索引不将其恢复为当前待办。

当前架构以 [Firefly 运行结构](../architecture/firefly-runtime.md) 为入口，产品功能以根目录 [README](../../README.md) 为准。版权、第三方来源与模型声明在根目录原文件中完整保留。
