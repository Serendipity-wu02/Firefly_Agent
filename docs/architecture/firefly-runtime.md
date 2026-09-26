# Firefly 当前运行结构

本文描述当前源码，不是上游历史设计。项目地址为 https://github.com/Serendipity-wu02/Firefly_Agent 。上游贡献与 MIT 许可见根目录 LICENSE 和 THIRD_PARTY_NOTICES.md，不把沿用实现标为原创。

各技术主题的现行维护入口见 [Firefly 维护与回归边界](./firefly-maintenance.md)。

## 执行与身份

- `src/main/orchestrator/firefly-agent.ts` 是原有统一入口；无工具 Chat 与 Harness 的分工不变。
- `src/main/orchestrator/harness/firefly-harness.ts` 沿用原执行循环、权限、审批、取消、任务状态与恢复机制；本轮只同步名称和调用方。
- `mode-prompt-profile.ts` 按 Chat、Work、Learn、Code 选择各自 system、identity、Markdown soul 与台词参考。Work/Code 继续按现有位置加入任务角色展示说明。
- `harness/adapter/prompt-builder.ts` 在非 Chat 模式加载 `prompts/firefly_harness.md`；工具和运行规则仍按原层次组装。
- `build-options.ts` 将环境中的称呼、当前上下文、风格、Skills、语气和工具约束放在原注入位置。`tone-injector.ts` 读取 `prompts/tone-rules.md`，缺失或不可读时使用同一流萤兜底。
- 不加载旧 Firefly YAML 架构。世界书按现有触发、优先级和预算使用；原作经历不等于与当前用户共同经历。

## Skills

自有目录为 `skills/firefly-{diagram,exam-paper,learn-tutor,obsidian-workspace,original-voice,plan-mode,plugin-dev,work-hygiene}`。教学、试卷、计划、Obsidian 和文件安全契约保留；语气样本改为标明来源性质的流萤表达示例，不冒充原作引文。

扫描、注册、模式过滤、按需正文与附件读取、autoInject 规则保持原机制。`skill-id-aliases.ts` 对八个旧 ID 做明确映射，兼容开关、模式覆盖、旧命令、工具白名单及用户 Skill 覆盖；新 ID 的显式设置优先，未设置的模式继承旧设置。更名不启用被关闭的 Skill、不增加工具权限。

项目 SDK 为本地构建的 `@firefly/plugin-sdk`，通过本地 tarball 验证和安装，尚未发布到 npm。插件市场未配置；保留本地 ZIP 安装，默认不请求第三方市场。

## 兼容与数据

`%APPDATA%\Firefly`、历史列表和配置读取保护不变。当前事件、角色身份、配置字段、插件协议和新数据目录使用 Firefly；旧数据由集中迁移入口读取，保留来源或备份，新数据优先。原生截图助手使用 `firefly-screenshot`，CLI 使用 `firefly`。

打包版用户 prompts 仍优先于内置文件；历史文件名通过集中旧格式适配入口读取，不覆盖用户自定义内容。

## 生命周期与数据完整性

运行入口、适配器与工具分发器仍分别承担模型调用、事件转换、执行和权限控制；不恢复旧施工稿中的第二套规划或强制完成工作流。`src/main/agui-bridge.ts`、`orchestrator/harness-adapter.ts` 与 `harness/firefly-harness.ts` 使用同一次运行身份，正常完成、失败和取消必须结算原运行，迟到事件不得覆盖下一次运行。临时流式文字不代表工具执行或文件完整读取成功。

历史列表由 `chats/chats-store.ts` 管理，运行和子任务分别由 `harness/run-store.ts`、`tasks/task-session-store.ts` 管理。读取失败不是首次使用或空列表；失败状态不得触发空数据写回。重命名后的数据路径由 `migration/firefly-data.ts` 处理，原目录保留。实际迁移前需备份，并按索引中的记录身份核对数量、缺失项及冲突，不按目录存在就推断迁移完整。

## 插件与朋友圈边界

当前插件开发入口为 [插件开发指南](../plugins/plugin-dev-guide.md) 和 [接口规范](../plugins/plugin-authoring.md)，不再使用旧市场施工方案。SDK 为本地构建产物，不宣称存在已发布的新 npm 包或官方市场。插件注册、停用和资源清理由现有 `src/plugins/`、`src/main/plugin-host/` 与 `src/main/plugin-runtime.ts` 负责；更名不开放权限决策或替换运行循环。

面板使用 `firefly-plugin`、`firefly-panel/1` 与 `FireflyPanel`。来源窗口、origin、版本、启用状态和资源真实路径校验继续有效；已移除旧面板协议、scheme 与桥别名；历史数据规范化仍由独立迁移入口完成，不双发事件。

朋友圈通过 `moments-policy.ts`、`moments-service.ts`、`moments-store.ts`、`character-personas.ts` 及现有 Renderer 面板运行。角色资料与任务执行职责分开。当前默认开关以 `settings-facade.ts` 为准；迁移不得因字段更名改变用户已经保存的开关。用户发帖身份由 Main 决定，不能由 Renderer 提交角色身份来冒充角色。旧角色社交示例和旧名单不再作为当前实现依据。

## 文档替代范围

旧 Harness 初建、评审、施工进度、运行边界计划，旧插件系统草案、发布与市场计划，以及旧角色朋友圈设计稿已退出当前工作树。其技术边界由本文及当前插件规范承接；原始方案和当时的验证结论可在 Git 历史查阅。删除文档不删除功能，也不把旧文档中的待办宣称为已完成。

## 验证边界

源码与测试证明接线和约束，不证明真实模型、音频、播放器或全部视觉状态通过。当前实机步骤与结果见 `docs/migration/firefly-brand-skills-2026-09-25.md`；历史记录统一从 `docs/archive/README.md` 查阅。
