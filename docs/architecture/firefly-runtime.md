# Firefly 当前运行结构

本文描述当前源码，不是上游历史设计。项目地址为 https://github.com/Serendipity-wu02/Firefly_Agent 。上游贡献与 MIT 许可见根目录 LICENSE 和 THIRD_PARTY_NOTICES.md，不把沿用实现标为原创。

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

第三方快照与 `@playa0v0/cyrene-plugin-sdk` 保留真实身份；插件市场是兼容的上游第三方来源，不是 Firefly 自有发布地址。

## 兼容与数据

`%APPDATA%\Firefly`、历史列表和配置读取保护不变。旧作者 ID、窗口桥、IPC、插件 scheme、`.cyrene` 工作区/CLI 状态与既有渠道协议不因品牌更名而改写。原生截图助手现有可执行文件名与打包契约仍保持兼容。CLI 新增 `firefly` 命令，`cyrene` 是同入口别名。

打包版用户 prompts 仍优先于内置文件；旧 `cyrene_harness.md` 文件名可在同一优先级目录中兼容读取，不覆盖用户文件。用户自定义内容不是本轮批量改写对象。

## 验证边界

源码与测试证明接线和约束，不证明真实模型、音频、播放器或全部视觉状态通过。当前实机步骤与结果见 `docs/migration/firefly-brand-skills-2026-09-25.md`；历史记录统一从 `docs/archive/README.md` 查阅。
