# 文档集中审查登记（2026-09-26）

> **日期**：2026-09-26，含后续阶段结论
> **状态**：历史技术记录。下文描述记录时的实现、设计与验证结论，不代表当前版本复测。
> **范围**：文档审查覆盖、技术依据、测试限制及来源许可状态。当前维护入口见[文档导航](../../README.md)。

## 范围与证据口径

- 审查对象：2026-09-26 的 Firefly 维护文档、历史资料与对应源码入口。
- 先读取 `AGENTS.md` 并列出真实文件，再按文件阅读、核对当前源码/脚本入口。下表为该次静态审查清单，不是测试通过清单。
- 当前指南核对实际配置、调用点和边界；历史正文按原阶段保留，新增历史提示。历史方案中的示例代码、原始路径大表、外部证据与每项验收没有重新执行或逐条重建当时环境；不把历史数量当作当前覆盖率。
- 本表覆盖 57 项；其余范围见 [Skills 与 SDK 文档审查](2026-09-26-skills-sdk-document-review.md)及[文档与依赖集中汇总](2026-09-26-documentation-dependency-closeout.md)。历史审计不是最新状态。
- 本登记所述文档子范围未运行测试、构建、应用、安装、npm audit 或 npm ls；此限制不代表整个交付未执行这些验证。该范围没有修改源码、依赖、锁文件或完整许可。
- 既有修改保持不变；源码、插件、Skills 与依赖审查成果分别在对应报告及集中汇总中记录。

## ZIP 当前状态与许可

静态文件证据为 `package.json`、`package-lock.json`、`src/shared/zip-extraction.ts` 及其调用点：`src/plugins/installer.ts`、`src/main/skills/snapshot-install.ts`、`src/main/migration/skill-snapshot.ts`、`scripts/packaging/prepare-mingit.mjs`、`scripts/packaging/build-skills-snapshot.mjs`。

项目直接 ZIP 解析依赖已改为 `yauzl@3.4.0`；`src/shared/zip-extraction.ts` 是项目安全落盘适配，不是 fork，不是自主 ZIP 解析器，未复制 extract-zip 代码；实现依据为该阶段源码及上述调用点。`node_modules/yauzl/LICENSE` 的完整 MIT 文本及 `Copyright (c) 2014 Josh Wolfe` 保留，根 NOTICE 只补充归属说明。锁中 unscoped `extract-zip` 节点已退出；`@electron-internal/extract-zip` 仍供 Electron 使用，不是项目替代实现。

依赖修正范围的实际 lock/npm ls 检查已确认 unscoped 节点退出，并已记录 prod/all audit 均退出 0、0 漏洞。最终解压回归、调用集成与构建记录见集中汇总；不把开发中间态计数作为最终验证。两份 2026-09-26 早期审计保留安全解压替换前的 1 high 及原测试结果。

## 逐文件审查表

“修改”表示当前说明修正；“仅增历史标记”表示不改正文、旧命令、数字和来源；“核对保留”说明不需要改写的依据。路径是审查发生时的仓库相对路径，部分文件之后已重新归档。

| 文件 | 处理 | 检查、修改或保留原因 | 证据路径/基线 |
| --- | --- | --- | --- |
| `.github/CONTRIBUTING.md` | 修改 | 注明 Bash 前提、Vitest 范围与未执行检查的如实记录。 | `package.json`；`vitest.config.ts`；`.github/workflows/test.yml` |
| `.github/pull_request_template.md` | 修改 | 删除与当前兼容政策不一致的硬性清单，保留实际验证与未运行说明。 | `AGENTS.md`；`package.json` |
| `AGENTS.md` | 只读保留 | 已先读；遵守范围及命名约束，不修改。 | `AGENTS.md` |
| `DEVELOPMENT.md` | 修改 | 拆分历史提交方案与当前开发命令，标明测试/构建边界。 | `package.json`；`vitest.config.ts`；`.github/workflows/test.yml` |
| `Firefly_DIFFERENTIAL_REVIEW_2026-09-26.md` | 仅增历史标记 | 该日依赖修补阶段；保留当时 1 high 和所有测试结论，不用后续结果回写。 | `2026-09-26 对应历史文件`；`package-lock.json` |
| `LICENSE` | 核对保留 | 保留完整 MIT、两位版权持有人及许可正文。 | `LICENSE`；`electron-builder.yml` |
| `MODEL_LICENSE.md` | 核对保留 | 保留 Cyrene 模型原授权、作者与限制；不将旧模型授权改称流萤授权。旧 README 免责声明标签保留，不把它作为新授权证明。 | `MODEL_LICENSE.md`；`electron-builder.yml`；`THIRD_PARTY_NOTICES.md` |
| `README.en.md` | 修改 | 对齐中文现状、测试范围与 ZIP 阶段结果；不承诺当前全量通过。 | `package.json`；`vitest.config.ts`；`src/shared/zip-extraction.ts` |
| `README.md` | 修改 | 区分历史验证与当前指南，注明 Bash 前提及 ZIP 最终验证边界。 | `package.json`；`vitest.config.ts`；`src/shared/zip-extraction.ts` |
| `THIRD_PARTY_NOTICES.md` | 修改 | 新增 yauzl@3.4.0 MIT/Josh Wolfe 来源与落盘适配边界；区分 Electron 内部依赖。MinGit 改述配置而非已验证发布；其他来源和许可不伪改。 | `node_modules/yauzl/LICENSE`；`package-lock.json`；`src/shared/zip-extraction.ts`；`vendor/mingit-manifest.json`；`electron-builder.yml` |
| `docs/CONTRIBUTORS.md` | 修改 | 注明上游贡献历史与旧模型贡献范围，不重写贡献者事实。 | `MODEL_LICENSE.md`；`LICENSE` |
| `docs/README.md` | 修改 | 当前指南、审查登记、来源历史分区；加入集中汇总入口。 | `DEVELOPMENT.md`；`docs/archive/README.md`；本登记 |
| `docs/architecture/firefly-maintenance.md` | 核对保留 | 维护入口及约束不是功能验收声明；源码路径与职责保持。 | `src/main/application/`；`src/main/orchestrator/harness/`；`src/main/chats/chats-store.ts`；`src/main/code-git/git-workspace-watcher.ts` |
| `docs/architecture/firefly-reliability-boundaries.md` | 核对保留 | 现有文案已区分维护约束、历史问题与未实测项；不宣称旧问题全部解决。 | `src/main/orchestrator/context-manager.ts`；`src/main/orchestrator/harness/harness-llm.ts`；`src/main/channels/conversation-binding-store.ts` |
| `docs/architecture/firefly-runtime.md` | 修改 | 补充当前 FIREFLY_* 与渠道鉴权契约，分离历史兼容说明和验证结论。 | `src/shared/firefly-environment.ts`；`src/main/channels/inbound-server.ts`；`src/main/app-identity.ts`；`src/main/orchestrator/mode-prompt-profile.ts` |
| `docs/architecture/resource-refresh-2026-09-26.md` | 仅增历史标记 | 该次资源更新阶段记录；保留用户提供素材的来源与各项实测边界，不作为该阶段重新验收或再分发授权。 | `2026-09-26 对应历史文件`；`docs/archive/README.md`；`src/shared/task-characters.ts` |
| `docs/architecture/structure-cleanup-2026-09-26.md` | 仅增历史标记 | 该次结构整理阶段记录；其中 52 张贴图和卡夫卡.png 的状态由后续资源报告接续，不改写原结果。 | `2026-09-26 对应历史文件`；`docs/archive/README.md`；`src/shared/task-characters.ts` |
| `docs/archive/README.md` | 修改 | 按历史阶段索引；明确旧提交清单、原始 txt 和旧验收不能直接执行或视为当前结果。 | `docs/migration/`；`docs/ci/`；`docs/architecture/resource-refresh-2026-09-26.md` |
| `docs/archive/design/2026-08-30-main-process-composition-root-redesign.md` | 仅增历史标记 | 2026-08-30 设计稿；旧入口行数、建议接口及实施步骤保留供追溯，当前以 src/main/application/ 为准。 | `2026-09-26 对应历史文件`；`docs/archive/README.md`；`src/main/application/application.ts` |
| `docs/archive/design/2026-09-15-right-panel-ide-layout-design.md` | 仅增历史标记 | 2026-09-15 设计及当时验收记录；保留外部参考来源，不据此承诺当前全部界面状态通过。 | `2026-09-26 对应历史文件`；`docs/archive/README.md` |
| `docs/ci/bash-test-timeout-2026-09-26.md` | 仅增历史标记 | 所列 CI 运行及定向修正记录；保留原结果，不代表后续提交或该阶段完整套件通过。 | `2026-09-26 对应历史文件`；`docs/archive/README.md`；`.github/workflows/test.yml`；`vitest.config.ts` |
| `docs/ci/vitest-worker-exit-2026-09-26.md` | 仅增历史标记 | 所列 Windows worker 事故及修正记录；仓库外现场未在该阶段重新取证，不改写原结论。 | `2026-09-26 对应历史文件`；`docs/archive/README.md`；`.github/workflows/test.yml`；`vitest.config.ts` |
| `docs/ci/watcher-skill-timeouts-2026-09-26.md` | 仅增历史标记 | 所列文件监视与 Skills 超时修正记录；文档子范围不重跑。当前 ZIP 已接入 yauzl 与项目落盘适配，最终验证见集中汇总。 | `2026-09-26 对应历史文件`；`docs/archive/README.md`；`.github/workflows/test.yml`；`vitest.config.ts` |
| `docs/internal-issue/2026-08-26-maxtoken-model-switch-glm53-known-issues.md` | 仅增历史标记 | 当日问题与修复记录；模型表、源码行号和测试数字不作为当前服务能力或复测结果。 | `2026-09-26 对应历史文件`；`docs/archive/README.md` |
| `docs/internal-issue/2026-09-05-minimax-m3-write-markdown-param-loss-report.md` | 仅增历史标记 | 保留 Playa 的厂商反馈与当时报文说明；不是当前厂商能力结论，也不表示该阶段重新复现或发送反馈。 | `2026-09-26 对应历史文件`；`docs/archive/README.md` |
| `docs/internal-issue/2026-09-20-cross-run-context-discontinuity-report.md` | 仅增历史标记 | 当日跨 run 问题与方案决策；后续会话轨迹实现已有独立源码，本文不作为当前未实现声明或施工授权。 | `2026-09-26 对应历史文件`；`docs/archive/README.md`；`src/main/orchestrator/conversation-transcript-store.ts` |
| `docs/migration/firefly-batch1-implementation-2026-09-23.md` | 仅增历史标记 | Batch 1 阶段记录；旧 Agent/Harness 名称、空角色名单和当时构建状态不代表当前实现。 | `2026-09-26 对应历史文件`；`docs/archive/README.md` |
| `docs/migration/firefly-batch2-implementation-2026-09-24.md` | 仅增历史标记 | Batch 2 阶段记录；当时动作回执和局部实机结果不外推为当前全部动作、心情或帧率通过。 | `2026-09-26 对应历史文件`；`docs/archive/README.md` |
| `docs/migration/firefly-batch3-implementation-2026-09-24.md` | 仅增历史标记 | Batch 3 阶段记录；旧头像目录、姓名与分支状态按当时保留，当前资源以共享角色表为准。 | `2026-09-26 对应历史文件`；`docs/archive/README.md`；`src/shared/task-characters.ts` |
| `docs/migration/firefly-batch4-implementation-2026-09-25.md` | 仅增历史标记 | Batch 4 阶段记录；当时保留的网易云源码已由后续批次清理，桥接控制不等于应用审批链验收。 | `2026-09-26 对应历史文件`；`docs/archive/README.md` |
| `docs/migration/firefly-batch5-implementation-2026-09-25.md` | 仅增历史标记 | Batch 5 阶段记录；卡夫卡.png 是当时素材名，当前映射见 src/shared/task-characters.ts；60 FPS 未实测结论保留。 | `2026-09-26 对应历史文件`；`docs/archive/README.md`；`src/shared/task-characters.ts` |
| `docs/migration/firefly-batch6-implementation-2026-09-25.md` | 仅增历史标记 | Batch 6 阶段记录；截图助手缺失、旧命令和本地包状态均为当时事实，后续记录另行接续。 | `2026-09-26 对应历史文件`；`docs/archive/README.md` |
| `docs/migration/firefly-brand-skills-2026-09-25.md` | 仅增历史标记 | 品牌与 Skills 阶段记录；旧 Window、插件协议、环境变量和 CLI 兼容说明已有后续变更，不作为当前接口指南。 | `2026-09-26 对应历史文件`；`docs/archive/README.md`；`src/shared/firefly-environment.ts`；`src/main/channels/inbound-server.ts` |
| `docs/migration/firefly-brand-skills-files-2026-09-25.md` | 仅增历史标记 | 该阶段工作树快照；路径、状态和数字不代表当前待提交集合，不授权暂存或提交。 | `2026-09-26 对应历史文件`；`docs/archive/README.md`；`src/shared/firefly-environment.ts`；`src/main/channels/inbound-server.ts` |
| `docs/migration/firefly-contract-residuals-2026-09-25.md` | 仅增历史标记 | 旧名称检索快照；所列路径与行号仅对应记录时源码，不是当前仍存在的文件清单。 | `2026-09-26 对应历史文件`；`docs/archive/README.md`；`src/shared/firefly-environment.ts`；`src/main/channels/inbound-server.ts` |
| `docs/migration/firefly-contract-unification-2026-09-25.md` | 仅增历史标记 | 契约统一阶段记录；旧公开桥、协议及环境变量兼容已有后续收敛，不作为当前兼容承诺。 | `2026-09-26 对应历史文件`；`docs/archive/README.md`；`src/shared/firefly-environment.ts`；`src/main/channels/inbound-server.ts` |
| `docs/migration/firefly-cumulative-precommit-inventory-2026-09-26.md` | 仅增历史标记 | 该阶段累计差异快照；原比较基线和提交路径原样保留，不代表当前工作树或该阶段提交授权。 | `2026-09-26 对应历史文件`；`docs/archive/README.md` |
| `docs/migration/firefly-final-gap-closeout-2026-09-25.md` | 仅增历史标记 | 该阶段缺口收口记录；当时数据读取回退描述已有后续可靠性修正，首次空列表根因结论不改写。 | `2026-09-26 对应历史文件`；`docs/archive/README.md` |
| `docs/migration/firefly-final-handoff-2026-09-25.md` | 仅增历史标记 | 该阶段本地包记录；旧截图助手名、六张角色卡及产物路径不作为当前打包输入。 | `2026-09-26 对应历史文件`；`docs/archive/README.md` |
| `docs/migration/firefly-migration-audit-2026-09-22.md` | 仅增历史标记 | 迁移前只读审计；当时缺失项、静态预测及无 Git 状态不代表当前迁移目录状态。 | `2026-09-26 对应历史文件`；`docs/archive/README.md` |
| `docs/migration/firefly-migration-import-inventory-2026-09-25.txt` | 核对保留 | 原始路径/状态快照不改写；历史属性在归档索引和本登记说明，不按当前目录重造清单。 | `同文件原始内容`；`docs/archive/README.md` |
| `docs/migration/firefly-precommit-inventory-2026-09-25.md` | 仅增历史标记 | 该阶段提交准备快照；保留准确旧路径和状态，执行任何提交操作前必须重新核对当时工作树。 | `2026-09-26 对应历史文件`；`docs/archive/README.md` |
| `docs/migration/firefly-reliability-and-submission-2026-09-25.md` | 仅增历史标记 | 该阶段可靠性与提交方案；旧分支、远程快照和建议步骤不构成当前操作指令或提交授权。 | `2026-09-26 对应历史文件`；`docs/archive/README.md` |
| `docs/migration/firefly-source-diff-review-2026-09-25.md` | 仅增历史标记 | 该阶段源码对照；旧标识和下一轮验收清单保留供追溯，不直接套用到当前接口。 | `2026-09-26 对应历史文件`；`docs/archive/README.md` |
| `docs/migration/firefly-uncommitted-files-2026-09-25.md` | 仅增历史标记 | 该阶段未提交清单；保留原始统计和已删除路径，不是当前应提交、恢复或删除的清单。 | `2026-09-26 对应历史文件`；`docs/archive/README.md` |
| `docs/migration/firefly-unification-startup-2026-09-25.md` | 仅增历史标记 | 该阶段启动与迁移验收；旧环境及插件兼容说明已有后续收敛，本地实机与测试数字不代表该阶段复测。 | `2026-09-26 对应历史文件`；`docs/archive/README.md`；`src/shared/firefly-environment.ts`；`src/main/channels/inbound-server.ts` |
| `docs/refactor/2026-09-09-channels-dispatcher-refactor-plan.md` | 仅增历史标记 | 2026-09-09 设计与实施计划；复选框、示例和提交命令不是当前待执行任务，现行实现见 src/main/channels/。 | `2026-09-26 对应历史文件`；`docs/archive/README.md`；`src/main/channels/dispatcher.ts`；`src/main/channels/delivery-service.ts`；`src/main/channels/keyed-queue.ts` |
| `docs/refactor/2026-09-14-dependency-audit-baseline.md` | 仅增历史标记 | 2026-09-14 依赖快照；版本、漏洞数量、唯一调用点及处置期限不代表当前状态。当前 ZIP 已接入 yauzl 与项目落盘适配，最终验证见集中汇总；不改写原审计结论。 | `2026-09-26 对应历史文件`；`docs/archive/README.md`；`package-lock.json` |
| `docs/refactor/2026-09-26-npm-audit-remediation.md` | 仅增历史标记 | 该日依赖修补阶段；保留原 1 high、漏洞链、命令和测试结论。当前 ZIP 进展单列，不改写当时结果。 | `2026-09-26 对应历史文件`；`package-lock.json` |
| `docs/reference/persona/README.md` | 核对保留 | 源资料不是运行时配置或分发输入；继续保持参考资料边界。 | `electron-builder.yml`；`src/main/orchestrator/mode-prompt-profile.ts` |
| `docs/reference/persona/firefly.yaml` | 核对保留 | 保留原人物资料和语气设定；不是当前提示词契约，不改写来源。 | `docs/reference/persona/README.md`；`src/main/orchestrator/mode-prompt-profile.ts` |
| `docs/user-guide/feishu.md` | 修改 | 移除限时完成、零风险、每次送达等保证；补充本地私聊、凭据回退和外部操作未核验边界。 | `src/main/channels/adapters/feishu/`；`src/main/channels/settings-store.ts`；`src/main/channels/proactive-delivery.ts` |
| `docs/user-guide/learn-mode.md` | 修改 | 纠正每轮保存、独立轻量模型、materials 强制只读、状态推断与清理保证；补全模板和工具约束。 | `src/main/learn/progress/learn-post-turn.ts`；`src/main/learn/progress/learn-progress-service.ts`；`src/main/learn/obsidian/obsidian-workspace-service.ts`；`src/main/learn/obsidian/vault-templates.ts` |
| `docs/user-guide/napcat-onebot.md` | 修改 | 去除完成时长、无官方方案及封号风险保证；区分外部安装步骤与本地 WebSocket/群聊配置。 | `src/main/channels/adapters/qq/napcat-adapter.ts`；`src/main/channels/settings-store.ts`；`src/main/channels/adapters/qq/onebot-reverse-ws.ts` |
| `docs/user-guide/qqbot-official.md` | 修改 | 回复窗口/条数作为本地适配限制，删除零风险、无限或未来功能承诺，注明外部平台未核验。 | `src/main/channels/adapters/qqbot/qqbot-adapter.ts`；`src/main/channels/settings-store.ts`；`src/main/channels/agent-policy.ts` |
| `resources/README.md` | 修改 | 区分实际打包输入与 mpv 可选检测，不宣称 mpv 默认打包；ZIP 接入待最终验证。 | `electron-builder.yml`；`src/main/audio/mpv-binary.ts`；`scripts/packaging/prepare-mpv.mjs`；`scripts/packaging/prepare-mingit.mjs` |
| `scripts/README.md` | 修改 | 纠正失效目录，说明 prepare:skills 写入、副作用、node:test 独立范围和音乐 smoke 退出 0 的有限含义。 | `package.json`；`scripts/verify/music-smoke.mjs`；`src/main/music/music-smoke-entry.ts`；`scripts/packaging/build-skills-snapshot.mjs` |

## 其余范围与报告入口

下列项目不计入本表 57 项覆盖；其审查范围及结果见对应报告和集中汇总。

| 文件/范围 | 处理与原因 |
| --- | --- |
| `docs/plugins/plugin-authoring.md` | 插件文档范围，见 Skills 与 SDK 文档审查及集中汇总。 |
| `docs/plugins/plugin-dev-guide.md` | 插件文档范围，见 Skills 与 SDK 文档审查及集中汇总。 |
| `docs/refactor/2026-09-26-current-audit-branch-review.md` | 依赖与安全审查范围；本登记不改写其结果。 |
| `docs/refactor/2026-09-26-skills-sdk-document-review.md` | Skills 与 SDK 文档审查记录。 |
| `docs/refactor/2026-09-26-documentation-dependency-closeout.md` | 整体交付范围、验证结果与未覆盖项的集中汇总。 |
| 新 dependency/security review 报告 | 依赖与安全审查范围，见集中汇总。 |
| `docs/refactor/2026-09-26-document-review-register.md` | 当时新增的审查登记；不构成新的依赖安全认证。 |

## 主要问题与未覆盖

1. 历史“当前”、旧兼容接口、旧资源数、旧路径和提交步骤容易混入操作指南：以逐文件历史标记和导航分区分离，不全局替换旧身份或删除证据。
2. `npm test` 仅覆盖 `vitest.config.ts` 声明范围，不自动运行 scripts 下的 `.test.mjs`；构建不代替 renderer 类型检查；Bash 环境与实机检查需单独记录。
3. Learn 的异步进度、文件工具保护与模型配置原说明过强；渠道连接、发送回执、权限与外部服务验收并不等价。已按本地实现收窄。
4. 文档子范围未实测外部平台控制台、审核规则、NapCat 安装器、真实飞书/QQ 收发、模型、截图、音乐控制、安装器、帧率，未联网复核外部链接；不据此宣称平台现状得到验证。整体交付的实测范围见集中汇总。
5. 完整许可和第三方来源不改写；没有取得新的模型/素材再分发授权，没有进行法律合规认证。MIT 源码许可不替代素材权利。
6. 保留历史文件关系和技术结论；原始执行环境、日志及路径快照由仓库外资料保存，不作为现行操作说明。
7. 当前 ZIP 最终验证与整体交付状态以集中汇总明确记录为准，本登记不代替该验证报告。

## 该阶段静态检查结果

- 上表覆盖 57 项；其余范围见 Skills 与 SDK 文档审查和集中汇总，本登记另行新增。
- 当时对 33 份历史 Markdown 的正文一致性检查通过（仅统一换行用于比较）；该结论仅对应 2026-09-26 的整理阶段，不承诺其后文档仍逐字相同。
- `AGENTS.md`、`LICENSE`、`MODEL_LICENSE.md`、源人设 YAML、原始迁移 TXT 与读取时 SHA-256 一致。
- 初次文档子范围 `git diff --check` 退出 0；当时相对 Markdown 链接目标检查仅剩约定新建的主汇总文件。该文件现已存在；接续已检查外部 Markdown 链接和本地标题锚点，结果见集中报告，不继续把“汇总待新建”列为最终缺口。
- 以上是只读文本、路径与差异检查，不是测试、构建或安全验证。

## 后续来源许可核查结论

此前接续阶段（历史）：初次“未联网”仅描述当时的文档子范围。当时检查 139 个 Markdown / 327 个链接，本地失败 0；136 个外部目标及第三方归档另 15 个目标均 HTTP 200，四个 HEAD 404 站点 GET 200。这个统计不含 ZIP 内 Markdown，且不作为新适配后的总数。彼时归档七处链接和三个脚本缺失的事实保留。

已通过的 Firefly 缺件、PPTX 锚点和有界续读技术验证维持原时间与范围。后续来源许可专项已为原 28 项中的 27 项补齐可核实来源链和分发材料，另复核现有 docx、skill-creator、九项 SP 的许可；`self-improving-agent` 仍有十个文件缺改写版本许可证据。具体文件、核查渠道和新的隔离旧版兼容结果见[集中报告](2026-09-26-documentation-dependency-closeout.md)的来源许可专项节。不能把链接通过升级成全部实机或法律验收，也不以许可缺口否定已通过的技术修复。
