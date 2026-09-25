# Firefly 维护入口与回归边界

本文替代旧产品施工计划作为当前维护入口。源码是接口与行为依据；旧计划的工期、当时测试数量和拟议功能不转写成当前完成状态。运行主线见 [Firefly 运行结构](./firefly-runtime.md)。

| 技术主题 | 当前源码入口 | 保留的维护约束 |
|---|---|---|
| 主进程装配 | `src/main/application/` | 服务沿现有组合根初始化，不增设第二套所有者。 |
| Chat 与排队 | `src/renderer/react/features/chat/pages/pending-queue-flow.ts`、`src/main/chats/chats-store.ts` | 同一消息只能认领一次；切换会话、取消与终态按对应运行结算；临时回答不是执行证据。 |
| 工具执行、并行与恢复 | `src/main/orchestrator/harness/` | 复用权限、取消、副作用和存储契约；不以模型文字覆盖执行结果。 |
| Code 工作区刷新 | `src/main/code-git/git-workspace-watcher.ts` | 监听归属于实际工作区，切换后不让旧结果覆盖当前页面。 |
| 文件与审查 | `src/main/chats/workspace-files-ipc.ts`、`src/main/orchestrator/review/` | 路径与工作区边界由 Main 校验；预览不冒充写入或读取完成；审查证据与最终文字分开。 |
| 图片上下文 | `src/main/orchestrator/image-router.ts`、`vision-captioner.ts` | 使用现有路由和实际模型能力，不重复永久注入图片或猜测图像已被模型读取。 |
| 会话轨迹 | `src/main/orchestrator/conversation-transcript-store.ts`、`conversation-transcript-coordinator.ts`、`transcript-sink.ts` | 使用现有提交与读取协议；更名不建立第二份业务事件流，不丢失会话与运行引用。 |
| Learn | `src/main/orchestrator/pop-quiz.ts`、`src/main/learn/`、`skills/firefly-learn-tutor/` | 复用现有教学和工具链，不把旧施工计划作为额外功能授权。 |
| 子任务与通知展示 | `src/main/tasks/`、`src/renderer/react/features/chat/` | 展示身份不改变子代理权限；通知和预览不能作为终态或完成证据。 |
| 朋友圈 | `src/main/moments/`、`src/renderer/react/features/moments/` | 名称、角色卡与头像按当前注册表；用户身份由 Main 持有；不开启未由用户启用的行为。 |
| SDK 与面板 | `src/plugins/`、`packages/plugin-sdk/`、`src/main/plugin-host/` | 本地可构建 SDK；保留来源、协议、路径与生命周期校验；无默认线上市场。 |

## 精确回归而非重复全量验收

持久化、图片预算、Shell 和历史问题的维护约束见 [Firefly 可靠性边界](./firefly-reliability-boundaries.md)。

修改排队或终态时检查单次发送、快速重复、切换会话、取消和再次发送；修改存储时检查缺失文件、损坏数据、读取失败保护及重开；修改协议时检查历史回放只消费一次及错误来源拒绝。测试与实机结论分开记录，不能把旧方案中的验收清单直接记为本轮通过。

GameBot、Minecraft、视频笔记和 SnowLuma 的旧专属施工/参考文档不再作为当前开发入口。本轮没有删除或启用相应运行功能；没有复核的能力不在本文宣称完成。原第三方研究来源保留于根目录 `THIRD_PARTY_NOTICES.md`。既有问题记录中的未解决项不因施工稿移除而视为已修复。

历史施工内容保留在 Git 中；当前开发者应从以上源码、对应测试、插件规范和实际批次报告开始，而不是执行已经过时的拆分/提交步骤。
