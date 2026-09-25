# Firefly 品牌与 Skills 本轮工作树清单

本清单来自迁移目录 Git 实际状态，未暂存、未提交。D 与 ?? 中含文件移动（Git 未暂存时按删除/新增显示），不按路径条数推断功能变化。

下方原清单是 255 项状态快照（修改 153、删除 48、未跟踪 54），包含本清单自身。最终状态及其后续 23 项增量见文末“最终差异核对”。

继承起点：`src/renderer/settings/music-view-state.test.ts` 与 `src/shared/music-view-state.ts` 删除，以及 `docs/migration/firefly-source-diff-review-2026-09-25.md`。其余原因按实施记录分组说明。

移动说明：八个 cyrene-* Skill 目录→firefly-*；cyrene-agent/harness→firefly-agent/harness；cyrene_harness.md→firefly_harness.md；桥类型 cyrene.d.ts→firefly.d.ts；装饰 SVG→firefly-surface-pattern.svg。额外删除旧 expression-reset.ts 是经全仓引用搜索确认无调用，当前表情机制未删除。

## 源码及接线（119）

| Git 状态 | 路径 |
| --- | --- |
| ` M` | `src/renderer/react/features/chat/pages/chat-page-normalizers.ts` |
| ` M` | `src/cli/commands/handlers.ts` |
| ` M` | `src/cli/commands/run.ts` |
| ` M` | `src/cli/index.ts` |
| ` M` | `src/main/agui-bridge.ts` |
| ` M` | `src/main/application/default-dependencies.ts` |
| ` M` | `src/main/channels/adapters/feishu/index.ts` |
| ` M` | `src/main/channels/agent-policy.ts` |
| ` M` | `src/main/channels/bootstrap.ts` |
| ` M` | `src/main/chats/chat-ui-ipc.ts` |
| ` M` | `src/main/external-content-paths.ts` |
| ` M` | `src/main/learn/obsidian/obsidian-tools.ts` |
| ` M` | `src/main/learn/obsidian/vault-init.ts` |
| ` M` | `src/main/memory/entity-graph.ts` |
| ` M` | `src/main/memory/obsidian-exporter.ts` |
| ` M` | `src/main/memory/obsidian-importer.ts` |
| ` M` | `src/main/memory/obsidian-vault-config.ts` |
| ` M` | `src/main/moments/character-personas.ts` |
| ` M` | `src/main/moments/moments-agent.ts` |
| ` M` | `src/main/moments/moments-context.ts` |
| ` M` | `src/main/moments/moments-ipc.ts` |
| ` M` | `src/main/moments/moments-policy.ts` |
| ` M` | `src/main/moments/moments-service.ts` |
| ` M` | `src/main/moments/moments-store.ts` |
| ` M` | `src/main/moments/reaction-queue.ts` |
| ` M` | `src/main/orchestrator/agent-runtime.ts` |
| ` M` | `src/main/orchestrator/build-options.ts` |
| ` M` | `src/main/orchestrator/chat-loop.ts` |
| ` M` | `src/main/orchestrator/context-manager.ts` |
| ` D` | `src/main/orchestrator/cyrene-agent.ts` |
| ` M` | `src/main/orchestrator/harness-adapter.ts` |
| ` M` | `src/main/orchestrator/harness/adapter/prompt-builder.ts` |
| ` M` | `src/main/orchestrator/harness/adapter/run-preparation.ts` |
| ` M` | `src/main/orchestrator/harness/adapter/terminal-mapper.ts` |
| ` M` | `src/main/orchestrator/harness/adapter/tool-runtime.ts` |
| ` M` | `src/main/orchestrator/harness/compaction.ts` |
| ` D` | `src/main/orchestrator/harness/cyrene-harness.ts` |
| ` M` | `src/main/orchestrator/harness/harness-llm.ts` |
| ` M` | `src/main/orchestrator/harness/harness-observability.ts` |
| ` M` | `src/main/orchestrator/harness/index.ts` |
| ` M` | `src/main/orchestrator/harness/plan-tools.ts` |
| ` M` | `src/main/orchestrator/harness/tool-round.ts` |
| ` M` | `src/main/orchestrator/harness/types.ts` |
| ` M` | `src/main/orchestrator/index.ts` |
| ` M` | `src/main/orchestrator/run-execution-status.ts` |
| ` M` | `src/main/orchestrator/run-settlement.ts` |
| ` M` | `src/main/orchestrator/task-runtime.ts` |
| ` M` | `src/main/orchestrator/tone-injector.ts` |
| ` M` | `src/main/orchestrator/tools/builtin-tools/download-file-tool.ts` |
| ` M` | `src/main/orchestrator/tools/builtin-tools/fetch-url-tool.ts` |
| ` M` | `src/main/orchestrator/tools/moments-tools.ts` |
| ` M` | `src/main/orchestrator/vendors/index.ts` |
| ` M` | `src/main/orchestrator/vendors/sdk-stream/accumulator.ts` |
| ` M` | `src/main/orchestrator/vendors/sdk-stream/runtime.ts` |
| ` M` | `src/main/orchestrator/vendors/test-connection.ts` |
| ` M` | `src/main/orchestrator/vendors/types.ts` |
| ` M` | `src/main/permission/bootstrap.ts` |
| ` M` | `src/main/pet-window-movement.ts` |
| ` M` | `src/main/plugin-agent.ts` |
| ` M` | `src/main/plugin-host/speech-input-commit-bridge.ts` |
| ` M` | `src/main/rag/index.ts` |
| ` M` | `src/main/rag/retriever.ts` |
| ` M` | `src/main/scheduler/scheduler-runner.ts` |
| ` M` | `src/main/settings/general-settings-lifecycle.ts` |
| ` M` | `src/main/settings/general-settings.ts` |
| ` M` | `src/main/settings/model-settings.ts` |
| ` M` | `src/main/settings/settings-facade.ts` |
| ` M` | `src/main/settings/settings-ipc.ts` |
| ` M` | `src/main/skills/index.ts` |
| ` M` | `src/main/skills/skill-commands.ts` |
| ` M` | `src/main/skills/skill-registry.ts` |
| ` M` | `src/main/skills/skill-scanner.ts` |
| ` M` | `src/main/skills/skill-tools.ts` |
| ` M` | `src/main/skills/slash-activation.ts` |
| ` M` | `src/main/startup/create-pet-window.ts` |
| ` M` | `src/main/sync-mcp-builtin.ts` |
| ` M` | `src/main/timeout-manager.ts` |
| ` M` | `src/main/toast/toast-window.ts` |
| ` M` | `src/main/tts/minimax-engine.ts` |
| ` M` | `src/main/tts/minimax-vocal-enhancer.ts` |
| ` M` | `src/main/tts/mossland-engine.ts` |
| ` M` | `src/main/windows/primary-window.ts` |
| ` M` | `src/renderer/call/call.css` |
| ` D` | `src/renderer/live2d/expression-reset.ts` |
| ` M` | `src/renderer/live2d/mouth-sync.ts` |
| ` M` | `src/renderer/react/features/chat/components/ChatMessageList.css` |
| ` M` | `src/renderer/react/features/chat/components/ChatMessageList.tsx` |
| ` M` | `src/renderer/react/features/chat/components/InteractionPanel.tsx` |
| ` M` | `src/renderer/react/features/chat/components/MermaidBlock.tsx` |
| ` M` | `src/renderer/react/features/chat/components/PluginModePanel.tsx` |
| ` M` | `src/renderer/react/features/chat/components/ReasoningControl.css` |
| ` M` | `src/renderer/react/features/chat/components/RightInspector.css` |
| ` M` | `src/renderer/react/features/chat/hooks/useComposerAttachments.ts` |
| ` M` | `src/renderer/react/features/chat/pages/ChatPage.tsx` |
| ` M` | `src/renderer/react/features/moments/MomentComposer.tsx` |
| ` M` | `src/renderer/react/features/moments/MomentPostCard.tsx` |
| ` M` | `src/renderer/react/features/moments/MomentsPanel.css` |
| ` M` | `src/renderer/react/features/moments/MomentsPanel.tsx` |
| ` M` | `src/renderer/react/features/moments/moments-utils.ts` |
| ` M` | `src/renderer/react/i18n/en.json` |
| ` M` | `src/renderer/react/i18n/zh-CN.json` |
| ` M` | `src/renderer/react/styles/react-root.css` |
| ` M` | `src/renderer/settings/settings.ts` |
| ` M` | `src/renderer/settings/shared/save-status.ts` |
| ` M` | `src/renderer/settings/shared/shell.ts` |
| ` M` | `src/renderer/sidebar/sidebar.css` |
| ` M` | `src/renderer/tasks/tasks.css` |
| ` D` | `src/renderer/types/cyrene.d.ts` |
| ` M` | `src/shared/ipc-channels.ts` |
| ` M` | `src/shared/logger-tags.ts` |
| ` M` | `src/shared/moments-types.ts` |
| ` D` | `src/shared/music-view-state.ts` |
| ` M` | `src/shared/reasoning.ts` |
| ` M` | `src/shared/run-terminal.ts` |
| ` M` | `src/shared/tts-types.ts` |
| `??` | `src/main/orchestrator/firefly-agent.ts` |
| `??` | `src/main/orchestrator/harness/firefly-harness.ts` |
| `??` | `src/main/skills/skill-id-aliases.ts` |
| `??` | `src/renderer/types/firefly.d.ts` |

## 定向测试（36）

追加：` M` `src/renderer/react/features/chat/pages/chat-page-normalizers.test.ts`，覆盖子任务头像历史恢复及原数据不变。

| Git 状态 | 路径 |
| --- | --- |
| ` M` | `src/cli/app.test.ts` |
| ` M` | `src/main/agui-bridge.test.ts` |
| ` M` | `src/main/channels/agent-policy.test.ts` |
| ` M` | `src/main/channels/bootstrap.test.ts` |
| ` M` | `src/main/character-migration.test.ts` |
| ` M` | `src/main/external-content-paths.test.ts` |
| ` M` | `src/main/moments/moments-agent.test.ts` |
| ` M` | `src/main/moments/moments-context.test.ts` |
| ` M` | `src/main/moments/moments-service.test.ts` |
| ` M` | `src/main/moments/moments-store.test.ts` |
| ` M` | `src/main/moments/reaction-queue.test.ts` |
| ` M` | `src/main/orchestrator/agent-runtime.test.ts` |
| ` M` | `src/main/orchestrator/chat-loop.test.ts` |
| ` M` | `src/main/orchestrator/cyrene-agent-runtime.test.ts` |
| ` D` | `src/main/orchestrator/cyrene-agent.test.ts` |
| ` M` | `src/main/orchestrator/harness-adapter-cancel.test.ts` |
| ` M` | `src/main/orchestrator/harness-adapter-characterization.test.ts` |
| ` M` | `src/main/orchestrator/harness/cyrene-harness-cancel.test.ts` |
| ` D` | `src/main/orchestrator/harness/cyrene-harness.test.ts` |
| ` M` | `src/main/orchestrator/harness/run-store.test.ts` |
| ` M` | `src/main/orchestrator/mode-prompt-profile.test.ts` |
| ` M` | `src/main/orchestrator/run-settlement.test.ts` |
| ` M` | `src/main/orchestrator/vendors/sdk-stream/accumulator.test.ts` |
| ` M` | `src/main/scheduler/bootstrap.test.ts` |
| ` M` | `src/main/scheduler/scheduler-runner.test.ts` |
| ` M` | `src/renderer/react/features/chat/components/RightInspector.visual.test.ts` |
| ` M` | `src/renderer/react/features/chat/components/file-link.test.ts` |
| ` M` | `src/renderer/react/features/chat/components/mermaid-block.test.ts` |
| ` M` | `src/renderer/react/styles/react-root.visual.test.ts` |
| ` D` | `src/renderer/settings/music-view-state.test.ts` |
| ` M` | `src/shared/logger.test.ts` |
| `??` | `src/main/orchestrator/firefly-agent.test.ts` |
| `??` | `src/main/orchestrator/harness/firefly-harness.test.ts` |
| `??` | `src/main/orchestrator/tone-injector.test.ts` |
| `??` | `src/main/skills/firefly-skills.test.ts` |

## Skills、提示词与资源（83）

| Git 状态 | 路径 |
| --- | --- |
| ` D` | `assets/ui/cyrene-surface-pattern.svg` |
| ` M` | `prompts/canon_quotes.md` |
| ` D` | `prompts/cyrene_harness.md` |
| ` M` | `prompts/learn_system.md` |
| ` D` | `skills/cyrene-diagram/SKILL.md` |
| ` D` | `skills/cyrene-exam-paper/SKILL.md` |
| ` D` | `skills/cyrene-exam-paper/contracts.ts` |
| ` D` | `skills/cyrene-exam-paper/index.ts` |
| ` D` | `skills/cyrene-exam-paper/manifest.json` |
| ` D` | `skills/cyrene-exam-paper/references/concept.md` |
| ` D` | `skills/cyrene-exam-paper/references/language.md` |
| ` D` | `skills/cyrene-exam-paper/references/mathematics.md` |
| ` D` | `skills/cyrene-exam-paper/references/physics.md` |
| ` D` | `skills/cyrene-exam-paper/references/programming.md` |
| ` D` | `skills/cyrene-learn-tutor/SKILL.md` |
| ` D` | `skills/cyrene-learn-tutor/contracts.ts` |
| ` D` | `skills/cyrene-learn-tutor/index.ts` |
| ` D` | `skills/cyrene-learn-tutor/manifest.json` |
| ` D` | `skills/cyrene-obsidian-workspace/SKILL.md` |
| ` D` | `skills/cyrene-obsidian-workspace/contracts.ts` |
| ` D` | `skills/cyrene-obsidian-workspace/index.ts` |
| ` D` | `skills/cyrene-obsidian-workspace/manifest.json` |
| ` D` | `skills/cyrene-original-voice/SKILL.md` |
| ` D` | `skills/cyrene-original-voice/references/boundary.md` |
| ` D` | `skills/cyrene-original-voice/references/comfort.md` |
| ` D` | `skills/cyrene-original-voice/references/concern.md` |
| ` D` | `skills/cyrene-original-voice/references/encourage.md` |
| ` D` | `skills/cyrene-original-voice/references/farewell.md` |
| ` D` | `skills/cyrene-original-voice/references/gratitude.md` |
| ` D` | `skills/cyrene-original-voice/references/greeting.md` |
| ` D` | `skills/cyrene-original-voice/references/playful.md` |
| ` D` | `skills/cyrene-original-voice/references/praised.md` |
| ` D` | `skills/cyrene-plan-mode/SKILL.md` |
| ` D` | `skills/cyrene-plan-mode/manifest.json` |
| ` D` | `skills/cyrene-plan-mode/references/coverage-check.md` |
| ` D` | `skills/cyrene-plan-mode/references/execution-handoff.md` |
| ` D` | `skills/cyrene-plan-mode/references/plan-templates.md` |
| ` D` | `skills/cyrene-plugin-dev/SKILL.md` |
| ` D` | `skills/cyrene-plugin-dev/references/api-spec.md` |
| ` D` | `skills/cyrene-plugin-dev/references/example-walkthrough.md` |
| ` D` | `skills/cyrene-plugin-dev/references/getting-started.md` |
| ` D` | `skills/cyrene-work-hygiene/SKILL.md` |
| `??` | `assets/ui/firefly-surface-pattern.svg` |
| `??` | `prompts/firefly_harness.md` |
| `??` | `prompts/tone-rules.md` |
| `??` | `skills/firefly-diagram/SKILL.md` |
| `??` | `skills/firefly-exam-paper/SKILL.md` |
| `??` | `skills/firefly-exam-paper/contracts.ts` |
| `??` | `skills/firefly-exam-paper/index.ts` |
| `??` | `skills/firefly-exam-paper/manifest.json` |
| `??` | `skills/firefly-exam-paper/references/concept.md` |
| `??` | `skills/firefly-exam-paper/references/language.md` |
| `??` | `skills/firefly-exam-paper/references/mathematics.md` |
| `??` | `skills/firefly-exam-paper/references/physics.md` |
| `??` | `skills/firefly-exam-paper/references/programming.md` |
| `??` | `skills/firefly-learn-tutor/SKILL.md` |
| `??` | `skills/firefly-learn-tutor/contracts.ts` |
| `??` | `skills/firefly-learn-tutor/index.ts` |
| `??` | `skills/firefly-learn-tutor/manifest.json` |
| `??` | `skills/firefly-obsidian-workspace/SKILL.md` |
| `??` | `skills/firefly-obsidian-workspace/contracts.ts` |
| `??` | `skills/firefly-obsidian-workspace/index.ts` |
| `??` | `skills/firefly-obsidian-workspace/manifest.json` |
| `??` | `skills/firefly-original-voice/SKILL.md` |
| `??` | `skills/firefly-original-voice/references/boundary.md` |
| `??` | `skills/firefly-original-voice/references/comfort.md` |
| `??` | `skills/firefly-original-voice/references/concern.md` |
| `??` | `skills/firefly-original-voice/references/encourage.md` |
| `??` | `skills/firefly-original-voice/references/farewell.md` |
| `??` | `skills/firefly-original-voice/references/gratitude.md` |
| `??` | `skills/firefly-original-voice/references/greeting.md` |
| `??` | `skills/firefly-original-voice/references/playful.md` |
| `??` | `skills/firefly-original-voice/references/praised.md` |
| `??` | `skills/firefly-plan-mode/SKILL.md` |
| `??` | `skills/firefly-plan-mode/manifest.json` |
| `??` | `skills/firefly-plan-mode/references/coverage-check.md` |
| `??` | `skills/firefly-plan-mode/references/execution-handoff.md` |
| `??` | `skills/firefly-plan-mode/references/plan-templates.md` |
| `??` | `skills/firefly-plugin-dev/SKILL.md` |
| `??` | `skills/firefly-plugin-dev/references/api-spec.md` |
| `??` | `skills/firefly-plugin-dev/references/example-walkthrough.md` |
| `??` | `skills/firefly-plugin-dev/references/getting-started.md` |
| `??` | `skills/firefly-work-hygiene/SKILL.md` |

## 构建配置及脚本（3）

| Git 状态 | 路径 |
| --- | --- |
| ` M` | `package-lock.json` |
| ` M` | `package.json` |
| ` M` | `scripts/packaging/build-skills-snapshot.mjs` |

## 文档与维护记录（14）

| Git 状态 | 路径 |
| --- | --- |
| ` M` | `.github/ISSUE_TEMPLATE/rfc.yml` |
| ` M` | `.github/ISSUE_TEMPLATE/runtime-bug.yml` |
| ` M` | `DEVELOPMENT.md` |
| ` M` | `README.en.md` |
| ` M` | `README.md` |
| ` M` | `docs/user-guide/feishu.md` |
| ` M` | `docs/user-guide/learn-mode.md` |
| ` M` | `docs/user-guide/napcat-onebot.md` |
| ` M` | `docs/user-guide/qqbot-official.md` |
| `??` | `docs/architecture/firefly-runtime.md` |
| `??` | `docs/archive/README.md` |
| `??` | `docs/migration/firefly-brand-skills-2026-09-25.md` |
| `??` | `docs/migration/firefly-source-diff-review-2026-09-25.md` |
| `??` | `docs/migration/firefly-brand-skills-files-2026-09-25.md` |

## 排除及保持不动

`dist`、`release`、`node_modules`、编译助手、日志、缓存、用户数据和公开验收输出不在清单内。`E:\Codex\Batch3-Public-Fixtures\work-task.md` 是用户授权的公开验收导出，不进入仓库。MIT、第三方与素材授权原文保留。当前未重打包或发布。

## 最终差异核对

核对基线为 `8775af95008c9f5b8922ec94cef6491d145df0a6`，分支 `codex/firefly-migration`。当前 porcelain 状态共 278 行：176 修改、48 删除、54 未跟踪，全部未暂存；相对基线没有 staged 差异。原清单 255 行快照加本节列出的 23 个新增修改路径，即为当前完整状态清单。

Git 尚未暂存时，45 组重命名按删除加未跟踪显示：38 个 Skills 文件、2 个 Agent/Harness 源码文件、2 个对应测试、1 个 Harness 提示词、1 个表面 SVG、1 个 Renderer 类型声明。比较基线 blob 与新路径文件哈希后，其中 10 组只改路径且内容相同，35 组同时更改了内容。另有 3 个真实删除：无引用的 `src/renderer/live2d/expression-reset.ts`，以及已停用的网易云状态模块及测试 `src/shared/music-view-state.ts`、`src/renderer/settings/music-view-state.test.ts`。9 个纯新增路径为 5 份文档、`prompts/tone-rules.md`、2 个定向测试和 `src/main/skills/skill-id-aliases.ts`。

按 Git 后续识别重命名后的逻辑提交记录，共 233 项：源码与配置 108、核心源码重命名 3、角色/Skills/提示词 43、主题 CSS 13、头像 PNG 12、测试 34、文档 16、SVG 资源重命名 1、真实删除 3。以上分类互斥且合计 233；45 个重命名只计作 45 项，不将其删除端和新增端重复计数。

相对 255 项快照的 23 个增量均为已跟踪文件修改：

| 分类 | 路径 |
| --- | --- |
| 角色头像（12） | `src/renderer/tast/三月七.png`、`src/renderer/tast/丹恒.png`、`src/renderer/tast/刃.png`、`src/renderer/tast/卡夫卡.png`、`src/renderer/tast/大黑塔.png`、`src/renderer/tast/姬子.png`、`src/renderer/tast/帕姆.png`、`src/renderer/tast/星期日.png`、`src/renderer/tast/瓦尔特.png`、`src/renderer/tast/知更鸟.png`、`src/renderer/tast/艾利欧.png`、`src/renderer/tast/银狼.png` |
| 样式（5） | `src/renderer/react/features/chat/components/ConversationSidebar.css`、`src/renderer/react/features/chat/components/PluginModePanel.css`、`src/renderer/react/features/chat/components/ReviewInspector.css`、`src/renderer/react/features/chat/components/ReviewPanel.css`、`src/renderer/react/features/chat/components/RunExperience.css` |
| 插件文档（2） | `docs/plugins/plugin-authoring.md`、`docs/plugins/plugin-dev-guide.md` |
| CLI/Main 品牌（4） | `src/cli/banner/ascii.ts`、`src/cli/banner/render.ts`、`src/cli/banner/render.test.ts`、`src/shared/banner.ts` |

本次完整构建及记录中的定向测试沿用：5 个测试文件 26 项通过，`npm run build`、`npm run check:renderer`、`git diff --check` 通过；无须为清单核对重复测试。状态清单中没有构建目录、日志、原头像备份、用户数据或验收临时文件路径；原头像备份位于仓库外。

建议提交说明：`feat: migrate Firefly onto Cyrene runtime`。本轮未暂存，尚未生成 Git 暂存区清单或提交对象；提交前以该工作树状态重新读取清单即可。
