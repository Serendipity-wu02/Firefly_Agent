# 项目结构收尾记录（2026-09-27）

## 基线与边界

起始 HEAD：`aaf34066dde99ea4a179f2380789e18090008876`，起始工作树干净；工作分支 `chore/project-structure-finalize`。正式仓库 Firefly_Agent。两个原项目、用户数据、现有服务未操作。

当前入口：[运行结构](../../architecture/firefly-runtime.md)、[安全维护](../../security/dependency-management.md)、[脚本说明](../../../scripts/README.md)。本记录为历史阶段证据，不是长期执行计划。

## 删除清单

逐项核对源码、HTML/CSS、动态模型 manifest、测试、目录扫描、Vite public 复制与 builder。以下资源当前生效引用数为 0；无条件复制或历史清单记录不是功能使用。16 张旧角色图片已查看联系表，不替换成虚构新素材。

| 删除路径 | 原 Git blob |
| --- | --- |
| `build/installer/installer-sidebar.bmp` | `b649b7a3e7ee1341eeb1a9e3c4d7eceeb4ee0cc8` |
| `src/renderer/public/context-usage/alert.png` | `a6a00bfe3bae582cc9b2946494d2082b27840a46` |
| `src/renderer/public/context-usage/compact.png` | `0b9bcd7314ba0bd7473264ea611d94da4606e95e` |
| `src/renderer/public/context-usage/normal.png` | `2eba0116459c292bf4dcee590ee60145535f8022` |
| `src/renderer/public/context-usage/warm.png` | `f158b072c8e99505385e61e543213eea1b45be2c` |
| `src/renderer/public/feeling/害羞.png` | `f386d2444dccf7de9b60ba5f77c5789c280d14af` |
| `src/renderer/public/feeling/平静.png` | `5a746fee697a24816c83174929109bb7aa34a5a6` |
| `src/renderer/public/feeling/开心.png` | `78ea7be5dec262bd257481b4a95c821a302d9503` |
| `src/renderer/public/feeling/感动.png` | `8e09a59462f984a706e2b7d5325c03748275e490` |
| `src/renderer/public/feeling/担心.png` | `a772f56fafe8942f6e1a319d6d541887cc12b53f` |
| `src/renderer/public/feeling/撒娇.png` | `400235c31fafa23d7f56f6aa9a66e8d084c70c50` |
| `src/renderer/public/feeling/温柔.png` | `04b24e655cfa548837923936eae8f983970c0829` |
| `src/renderer/public/feeling/激动.png` | `c4598a152c96ac20709ace7609c32915ba986949` |
| `src/renderer/public/feeling/难过.png` | `61e0f459b6cec69a31f5a7d72838832736078bbf` |
| `src/renderer/public/icons/mimi.png` | `7e9da4c5d7734855b230fd1bfa20f5f816d15c74` |
| `src/renderer/public/icons/sticker-picker.png` | `8bfdc2856721edc671fc0a8f190f2e49c216bb3e` |
| `src/renderer/public/loading.png` | `0281596849399efdedc24369b3f5589ccccf5a43` |

保留 installer.nsh：electron-builder 的 nsis.include 和 7 项配置回归仍使用；侧栏图无接线，已删除。保留全部许可、模型、21 张贴图与 12 张头像。

本地已删除空 scripts/diagnostics、docs/specs、docs/design 及空子目录、resources/components/music 及空父目录、移动后空 poc/srt 和 tools/firefly-upstream-fetch，以及旧工具唯一 Python pyc 缓存。仅逐项核实绝对路径后非递归删除；不执行 clean/reset，不清理 node_modules/target 或用户目录。生成 dist 由正式 build 入口重建。

## git mv 映射

39 份历史记录归档、1 份未复验 MiniMax 外部反馈进入 known-issues、8 个维护工具文件迁入 scripts；保留历史事实，仅修复实际相对链接。

| 原路径 | 当前路径 |
| --- | --- |
| `docs/refactor/2026-09-26-dependency-governance.transitive.json` | `docs/archive/refactor/2026-09-26-dependency-governance.transitive.json` |
| `docs/migration/firefly-cumulative-precommit-inventory-2026-09-26.md` | `docs/archive/migration/firefly-cumulative-precommit-inventory-2026-09-26.md` |
| `docs/migration/firefly-migration-audit-2026-09-22.md` | `docs/archive/migration/firefly-migration-audit-2026-09-22.md` |
| `tools/firefly-upstream-fetch/README.md` | `scripts/packaging/upstream-skills/README.md` |
| `tools/firefly-upstream-fetch/tests/test_fetch_skills.py` | `scripts/packaging/upstream-skills/tests/test_fetch_skills.py` |
| `poc/srt/run-cmd.mjs` | `scripts/verify/sandbox-runtime/run-cmd.mjs` |
| `docs/migration/firefly-brand-skills-2026-09-25.md` | `docs/archive/migration/firefly-brand-skills-2026-09-25.md` |
| `docs/refactor/2026-09-26-npm-audit-remediation.md` | `docs/archive/refactor/2026-09-26-npm-audit-remediation.md` |
| `docs/architecture/structure-cleanup-2026-09-26.md` | `docs/archive/reviews/structure-cleanup-2026-09-26.md` |
| `docs/refactor/2026-09-26-documentation-dependency-closeout.md` | `docs/archive/refactor/2026-09-26-documentation-dependency-closeout.md` |
| `docs/refactor/2026-09-26-dependency-governance.distribution.json` | `docs/archive/refactor/2026-09-26-dependency-governance.distribution.json` |
| `docs/migration/firefly-unification-startup-2026-09-25.md` | `docs/archive/migration/firefly-unification-startup-2026-09-25.md` |
| `docs/migration/firefly-migration-import-inventory-2026-09-25.txt` | `docs/archive/migration/firefly-migration-import-inventory-2026-09-25.txt` |
| `docs/migration/firefly-reliability-and-submission-2026-09-25.md` | `docs/archive/migration/firefly-reliability-and-submission-2026-09-25.md` |
| `tools/firefly-upstream-fetch/sources.json` | `scripts/packaging/upstream-skills/sources.json` |
| `docs/internal-issue/2026-08-26-maxtoken-model-switch-glm53-known-issues.md` | `docs/archive/issues/2026-08-26-maxtoken-model-switch-glm53-known-issues.md` |
| `docs/refactor/2026-09-26-document-review-register.md` | `docs/archive/refactor/2026-09-26-document-review-register.md` |
| `docs/refactor/2026-09-14-dependency-audit-baseline.md` | `docs/archive/refactor/2026-09-14-dependency-audit-baseline.md` |
| `docs/migration/firefly-contract-unification-2026-09-25.md` | `docs/archive/migration/firefly-contract-unification-2026-09-25.md` |
| `docs/internal-issue/2026-09-20-cross-run-context-discontinuity-report.md` | `docs/archive/issues/2026-09-20-cross-run-context-discontinuity-report.md` |
| `docs/migration/firefly-final-gap-closeout-2026-09-25.md` | `docs/archive/migration/firefly-final-gap-closeout-2026-09-25.md` |
| `docs/migration/firefly-batch6-implementation-2026-09-25.md` | `docs/archive/migration/firefly-batch6-implementation-2026-09-25.md` |
| `docs/migration/firefly-precommit-inventory-2026-09-25.md` | `docs/archive/migration/firefly-precommit-inventory-2026-09-25.md` |
| `poc/srt/boundary-test.mjs` | `scripts/verify/sandbox-runtime/boundary-test.mjs` |
| `docs/migration/firefly-source-diff-review-2026-09-25.md` | `docs/archive/migration/firefly-source-diff-review-2026-09-25.md` |
| `poc/srt/install.mjs` | `scripts/verify/sandbox-runtime/install.mjs` |
| `docs/refactor/2026-09-26-dependency-governance.md` | `docs/archive/refactor/2026-09-26-dependency-governance.md` |
| `tools/firefly-upstream-fetch/fetch_skills.py` | `scripts/packaging/upstream-skills/fetch_skills.py` |
| `docs/architecture/resource-refresh-2026-09-26.md` | `docs/archive/reviews/resource-refresh-2026-09-26.md` |
| `docs/refactor/2026-09-09-channels-dispatcher-refactor-plan.md` | `docs/archive/refactor/2026-09-09-channels-dispatcher-refactor-plan.md` |
| `docs/refactor/2026-09-26-skills-sdk-document-review.md` | `docs/archive/refactor/2026-09-26-skills-sdk-document-review.md` |
| `docs/refactor/2026-09-26-dependency-governance.direct.json` | `docs/archive/refactor/2026-09-26-dependency-governance.direct.json` |
| `docs/ci/watcher-skill-timeouts-2026-09-26.md` | `docs/archive/ci/watcher-skill-timeouts-2026-09-26.md` |
| `docs/ci/vitest-worker-exit-2026-09-26.md` | `docs/archive/ci/vitest-worker-exit-2026-09-26.md` |
| `Firefly_DIFFERENTIAL_REVIEW_2026-09-26.md` | `docs/archive/reviews/Firefly_DIFFERENTIAL_REVIEW_2026-09-26.md` |
| `poc/srt/check-status.mjs` | `scripts/verify/sandbox-runtime/check-status.mjs` |
| `docs/migration/firefly-uncommitted-files-2026-09-25.md` | `docs/archive/migration/firefly-uncommitted-files-2026-09-25.md` |
| `docs/migration/firefly-brand-skills-files-2026-09-25.md` | `docs/archive/migration/firefly-brand-skills-files-2026-09-25.md` |
| `docs/migration/firefly-batch5-implementation-2026-09-25.md` | `docs/archive/migration/firefly-batch5-implementation-2026-09-25.md` |
| `docs/migration/firefly-batch2-implementation-2026-09-24.md` | `docs/archive/migration/firefly-batch2-implementation-2026-09-24.md` |
| `docs/migration/firefly-batch3-implementation-2026-09-24.md` | `docs/archive/migration/firefly-batch3-implementation-2026-09-24.md` |
| `docs/migration/firefly-final-handoff-2026-09-25.md` | `docs/archive/migration/firefly-final-handoff-2026-09-25.md` |
| `docs/internal-issue/2026-09-05-minimax-m3-write-markdown-param-loss-report.md` | `docs/known-issues/2026-09-05-minimax-m3-write-markdown-param-loss-report.md` |
| `docs/refactor/2026-09-26-current-audit-branch-review.md` | `docs/archive/refactor/2026-09-26-current-audit-branch-review.md` |
| `docs/migration/firefly-batch1-implementation-2026-09-23.md` | `docs/archive/migration/firefly-batch1-implementation-2026-09-23.md` |
| `docs/migration/firefly-contract-residuals-2026-09-25.md` | `docs/archive/migration/firefly-contract-residuals-2026-09-25.md` |
| `docs/migration/firefly-batch4-implementation-2026-09-25.md` | `docs/archive/migration/firefly-batch4-implementation-2026-09-25.md` |
| `docs/ci/bash-test-timeout-2026-09-26.md` | `docs/archive/ci/bash-test-timeout-2026-09-26.md` |

活跃入口移除 10 处日期化 refactor 引用；治理 JSON 的归档读取只用于原有快照回归。性能默认报告迁至已忽略 output/perf，测量行为不变。

## scripts 逐文件依据

| 路径 | 保留用途 |
| --- | --- |
| `scripts/README.md` | 脚本入口说明 |
| `scripts/build/cli.mjs` | package.json 正式 CLI / 原生助手构建 |
| `scripts/build/screenshot-helper.mjs` | package.json 正式 CLI / 原生助手构建 |
| `scripts/ci/run-vitest.ps1` | CI runner / worker 诊断，保留真实失败码 |
| `scripts/ci/trace-vitest-workers.mjs` | CI runner / worker 诊断，保留真实失败码 |
| `scripts/ci/trace-worker-process.cjs` | CI runner / worker 诊断，保留真实失败码 |
| `scripts/install-bge-reranker.ps1` | 显式模型安装人工入口，本轮不执行 |
| `scripts/packaging/adapt-skills-snapshot.mjs` | MinGit/mpv/Skills 包装入口、元数据或 Node 回归 |
| `scripts/packaging/adapt-skills-snapshot.test.mjs` | MinGit/mpv/Skills 包装入口、元数据或 Node 回归 |
| `scripts/packaging/build-skills-snapshot.mjs` | MinGit/mpv/Skills 包装入口、元数据或 Node 回归 |
| `scripts/packaging/electron-builder-config.test.mjs` | MinGit/mpv/Skills 包装入口、元数据或 Node 回归 |
| `scripts/packaging/prepare-mingit.mjs` | MinGit/mpv/Skills 包装入口、元数据或 Node 回归 |
| `scripts/packaging/prepare-mingit.test.mjs` | MinGit/mpv/Skills 包装入口、元数据或 Node 回归 |
| `scripts/packaging/prepare-mpv.mjs` | MinGit/mpv/Skills 包装入口、元数据或 Node 回归 |
| `scripts/packaging/prepare-mpv.test.mjs` | MinGit/mpv/Skills 包装入口、元数据或 Node 回归 |
| `scripts/packaging/skill-adaptations/as-api-and-interface-design/LICENSE` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/as-api-and-interface-design/NOTICE.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/as-api-and-interface-design/SKILL.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/as-context-engineering/LICENSE` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/as-context-engineering/NOTICE.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/as-context-engineering/SKILL.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/as-using-agent-skills/LICENSE` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/as-using-agent-skills/NOTICE.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/as-using-agent-skills/SKILL.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/pptx-generator/NOTICE.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/self-improving-agent/LICENSE` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/self-improving-agent/NOTICE.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/self-improving-agent/SKILL.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/self-improving-agent/firefly-templates/ERRORS.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/self-improving-agent/firefly-templates/FEATURE_REQUESTS.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/self-improving-agent/firefly-templates/LEARNINGS.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/self-improving-agent/firefly-templates/SKILL-TEMPLATE.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/self-improving-agent/references/firefly-examples.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/self-improving-agent/scripts/upstream-extract-skill.sh` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-brainstorming/LICENSE` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-brainstorming/NOTICE.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-dispatching-parallel-agents/LICENSE` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-dispatching-parallel-agents/NOTICE.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-requesting-code-review/LICENSE` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-requesting-code-review/NOTICE.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-requesting-code-review/SKILL.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-requesting-code-review/references/code-reviewer.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-subagent-driven-development/LICENSE` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-subagent-driven-development/NOTICE.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-subagent-driven-development/SKILL.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-subagent-driven-development/references/implementer-prompt.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-subagent-driven-development/references/re-review-prompt.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-subagent-driven-development/references/task-reviewer-prompt.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-subagent-driven-development/scripts/review-package` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-subagent-driven-development/scripts/sdd-workspace` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-subagent-driven-development/scripts/task-brief` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-systematic-debugging/LICENSE` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-systematic-debugging/NOTICE.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-using-git-worktrees/LICENSE` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-using-git-worktrees/NOTICE.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-using-superpowers/LICENSE` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-using-superpowers/NOTICE.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-using-superpowers/references/firefly-tools.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-verification-before-completion/LICENSE` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-verification-before-completion/NOTICE.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-writing-plans/LICENSE` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/sp-writing-plans/NOTICE.md` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-adaptations/xlsx/scripts/xlsx_workspace.py` | 正式快照 readTree / 受控哈希 / 来源及许可输入 |
| `scripts/packaging/skill-repairs.json` | MinGit/mpv/Skills 包装入口、元数据或 Node 回归 |
| `scripts/packaging/skill-replacement.test.mjs` | MinGit/mpv/Skills 包装入口、元数据或 Node 回归 |
| `scripts/packaging/skill-replacements.json` | MinGit/mpv/Skills 包装入口、元数据或 Node 回归 |
| `scripts/packaging/upstream-skills/README.md` | 固定来源人工获取、配置或回归；不扫描/打包暂存 |
| `scripts/packaging/upstream-skills/fetch_skills.py` | 固定来源人工获取、配置或回归；不扫描/打包暂存 |
| `scripts/packaging/upstream-skills/sources.json` | 固定来源人工获取、配置或回归；不扫描/打包暂存 |
| `scripts/packaging/upstream-skills/tests/test_fetch_skills.py` | 固定来源人工获取、配置或回归；不扫描/打包暂存 |
| `scripts/packaging/xlsx-workspace.test.mjs` | MinGit/mpv/Skills 包装入口、元数据或 Node 回归 |
| `scripts/perf/chat-renderer-baseline.mjs` | 性能 runner / 录像 helper / Node 回归 |
| `scripts/perf/chat-renderer-recording.mjs` | 性能 runner / 录像 helper / Node 回归 |
| `scripts/perf/chat-renderer-recording.test.mjs` | 性能 runner / 录像 helper / Node 回归 |
| `scripts/plugin-sdk/build-sdk.mjs` | SDK/schema/示例构建及验证调用链 |
| `scripts/plugin-sdk/generate-schema.mjs` | SDK/schema/示例构建及验证调用链 |
| `scripts/plugin-sdk/smoke-examples.mjs` | SDK/schema/示例构建及验证调用链 |
| `scripts/plugin-sdk/test-examples.mjs` | SDK/schema/示例构建及验证调用链 |
| `scripts/plugin-sdk/verify-package.mjs` | SDK/schema/示例构建及验证调用链 |
| `scripts/verify/installer-artifacts.mjs` | package.json 或脚本 README 显式产物/音频验证 |
| `scripts/verify/mpv-helper.mjs` | package.json 或脚本 README 显式产物/音频验证 |
| `scripts/verify/music-smoke.mjs` | package.json 或脚本 README 显式产物/音频验证 |
| `scripts/verify/sandbox-runtime/boundary-test.mjs` | 人工沙箱状态、安装或边界验证；本轮不执行系统操作 |
| `scripts/verify/sandbox-runtime/check-status.mjs` | 人工沙箱状态、安装或边界验证；本轮不执行系统操作 |
| `scripts/verify/sandbox-runtime/install.mjs` | 人工沙箱状态、安装或边界验证；本轮不执行系统操作 |
| `scripts/verify/sandbox-runtime/run-cmd.mjs` | 人工沙箱状态、安装或边界验证；本轮不执行系统操作 |
| `scripts/verify/screenshot-helper.mjs` | package.json 或脚本 README 显式产物/音频验证 |

## Cyrene 分类

在 src/assets/build/scripts/skills/prompts/packages/native/resources 排除 LICENSE/NOTICE/target/dist/ZIP 后，130 行命中：125 行兼容读取、历史格式回归或旧品牌拒绝断言；5 行真实来源/模型说明；当前生效品牌残留 0。archive 历史叙述不计入上述范围，按历史保留；许可另行完整保留。兼容实现包括 shared/legacy-firefly-contracts、main/migration、skills/skill-id-aliases，保留历史与凭据恢复。

## 包装输入修正

首次 Node 回归 20 通过、3 失败，REPLACEMENT_SOURCE_MISMATCH。比对 HEAD、ZIP、工作树证明受控适配源仅被 CRLF 检出改变。仅对 48 个已核实无内容修改的适配源恢复原字节，添加 skill-adaptations/** text eol=lf；不全仓 renormalize，不改 ZIP/manifest/哈希或放宽拒绝条件。修正后 23 通过，0 失败/跳过。SDK 构建生成的 LICENSE 差异精确恢复，不提交生成副作用；snapshot stat/EOL 噪声不作为内容修改。

## 验证记录

- Node 包装与录像回归：23 通过、0 失败/跳过（包含 builder 7 项、恶意 ZIP、快照确定性、附件/锚点与 XLSX）。
- 上游获取工具 unittest：25 项，24 通过、1 跳过；Windows 符号链接权限不可用，未放宽断言。
- check:plugin-sdk、check:plugin-schema、test:plugin-examples：通过，四个本地示例编译/Mock，不代表外部服务实测。
- `FIREFLY_TEST_BASH=E:\Git\usr\bin\bash.exe npm test`：521 个测试文件通过；4495 项通过、1 项跳过、0 失败，耗时 224.15 秒。跳过为插件面板真实符号链接夹具的平台权限限制，不是新增跳过。
- `npm run check:renderer` 与最终 `npm run build`：退出码 0，Main/Preload/CLI/Renderer 均完成；保留既有大 chunk 提示，不降低阈值。
- 仓库 177 份 Markdown 的 194 个本地链接与 6 个标题锚点检查通过；正式 ZIP 内链接与标题锚点由 Node 包装回归验证，不把两种扫描混为一谈。外部 URL 未重新联网全量验收。
- 最终 dist/renderer 中 feeling、context-usage、loading.png、icons/mimi.png、icons/sticker-picker.png 均不存在；NSIS 配置仅保留 installer.nsh。安装器没有制作或安装。
- `git diff --check`、暂存区 `git diff --cached --check` 均通过；提交范围不含构建产物、日志、用户数据、取证联系表或缓存。
- 最终暂存为 88 项：48 项移动、20 项修改、17 项删除、3 项新增；逐路径与仓库外核准范围比较，无额外或遗漏。所有 stat/EOL 噪声经过内容哈希核验后刷新，未作为修改提交。

## 目录职责

```text
assets/ 产品视觉；resources/ 构建下载准备
build/installer/installer.nsh
scripts/{build,ci,packaging,perf,plugin-sdk,verify}/
  packaging/upstream-skills/ 固定来源人工维护
  verify/sandbox-runtime/ 人工沙箱验证
docs/{architecture,security,user-guide,plugins,known-issues}/
docs/archive/{migration,refactor,ci,issues,reviews,design}/
```

不发布、不合并 main；真实模型、GUI、TTS、QQ Music 审批、持续帧率、安装器/跨平台及公开再分发许可沿用原未验收边界。

## 当前署名与文档最终审计（2026-09-27 追加）

本追加起点 HEAD 为 `349753da78a49d9a9fb0e62e17c2c2c76e5296a3`，分支 `chore/project-structure-finalize`，起始工作树干净。此前章节是已提交阶段的历史事实；其中 88 项提交、130 行源码命中、177 份 Markdown 等数字不是本追加结果。当前追加不暂存、提交、推送或合并，不改原项目、用户数据或现有服务。

### 实际处理

- CONTRIBUTORS 重建为 Firefly_Agent Contributors，只列确认的当前维护者 Serendipity-wu02；移除 9 位上游贡献者、旧 PR/功能表和 1 项旧模型鸣谢，不修改 Git 历史。
- 根 LICENSE 完整字节未变，保留 Playa 与 Serendipity-wu02 (Firefly) 两行版权及完整 MIT。根第三方说明缩为必要上游来源；两份 README 保留简短独立维护和 MIT 来源说明，不声称全部从零原创。
- MODEL_LICENSE 仅说明当前 models/firefly/ 的授权事实与待归档边界；移除旧模型的大段授权、旧作者与角色条款。用户确认已获原作者授权，但作者署名、授权原文、覆盖文件、再分发范围和相关头像材料仍未归档，不能宣称公开资产许可全部完成。当前模型 README 同步，不套用其他模型许可。
- 根第三方声明修正已过时的 Skills 状态：旧 OpenClaw 十个未核清文件已退出当前快照，不再写成仍在分发；保留各实际作者、独立许可、Firefly 适配与历史安装边界。未改动 39 项 Skills、正式 ZIP 或许可原文。
- 删除下列 5 份重复路径/未提交状态清单：仅重复当时文件分类和导入状态；实际批次、数据迁移、安全、许可、架构及不能由提交说明恢复的验收记录继续保留。保留记录中的历史路径文本不是现行链接或再次执行指令；当前索引已移除对 TXT 清单保留的要求。
- MiniMax 旧厂商反馈移到 archive/issues，保留原报文、原作者及当时结论，仅修相对导航；known-issues 不把旧反馈当当前问题结论。
- 三个测试中的 8 行无意义作者/临时目录命中中性化：临时目录 firefly-fallback-test、记忆测试昵称、插件卡片合成作者 Test Author。旧 live2d-cyrene mock appName 保留，因为它与 cyrene-bot-secret 一起实际参与旧 obf 夹具派生；不是单纯展示名称。
- 在 structure-cleanup.test.ts 增加当前贡献者、模型范围、来源与 MIT 保留回归。生产业务、授权、数据恢复、模型资源、事件和插件接口均未修改。

| 已删除清单 | HEAD blob | 保留依据 |
| --- | --- | --- |
| `docs/archive/migration/firefly-brand-skills-files-2026-09-25.md` | `d259d2af3f626177d3b634bc0f98da606eea1781` | Git 保留原清单；批次及可靠性记录保留实质证据，不需要重复文件状态表。 |
| `docs/archive/migration/firefly-cumulative-precommit-inventory-2026-09-26.md` | `894e789672273be3b964d2adc7829cceb6d0a8e6` | Git 保留原清单；批次及可靠性记录保留实质证据，不需要重复文件状态表。 |
| `docs/archive/migration/firefly-migration-import-inventory-2026-09-25.txt` | `5779e92ddcd0b7ec90a2a8fe1e5ce6fec69163d9` | Git 保留原清单；批次及可靠性记录保留实质证据，不需要重复文件状态表。 |
| `docs/archive/migration/firefly-precommit-inventory-2026-09-25.md` | `07497897b4b89514c527e33d0c24a64cc71f0a3c` | Git 保留原清单；批次及可靠性记录保留实质证据，不需要重复文件状态表。 |
| `docs/archive/migration/firefly-uncommitted-files-2026-09-25.md` | `a526a9eb1d6dc1e921545d9ddd99a9352121b8b9` | Git 保留原清单；批次及可靠性记录保留实质证据，不需要重复文件状态表。 |

### 检查范围与计数口径

使用 git ls-files --cached --others --exclude-standard 的实际路径，检查根目录与全部嵌套跟踪/新增文本，不依赖普通 rg 的忽略规则。文档范围为 MD/MDX/TXT 与 README*/LICENSE*/NOTICE*（含 license-provenance.json）；排除本审计报告自身，防止重复引用命中增加计数。扫描 194 份这些对象；本报告自身单独作为历史审计说明审阅。其他文本包含源码、测试、配置、真实示例和历史治理 JSON。忽略生成目录与二进制，不把 playAudio 等包含 playa 的函数名误作作者；匹配 Cyrene 大小写、昔涟、独立 Playa 单词，Cyrene-Agent/Playa-0v0/CyreneHarness/cyrene.log 等包含关系一并覆盖。

正式分发 ZIP 另行解包检查：126 份 Markdown/MDX/TXT/README/LICENSE/NOTICE 内部对象，相关旧名称命中 0；没有因此删改原通知。仓库展开文档与 ZIP 内部结果分别统计。根 LICENSE 与 ZIP/manifest 均无内容差异；当前 src/renderer/public/models 和 dist/renderer/models 只有 firefly，未发现旧角色模型目录。实际构建路径验证不等于安装器或 GUI 验收。

以下 n 是剩余匹配文本行数（同一行多个词只计一次），不是漏洞数量、文件数或人物数。删除和改名另列已处理对象，不与剩余行相加。

| 分类 | 剩余匹配行数 | 处理 |
| --- | ---: | --- |
| 法律许可 | 3 | 保留，具体位置和理由见下表。 |
| 第三方来源 | 217 | 保留，具体位置和理由见下表。 |
| 旧数据兼容 | 139 | 保留，具体位置和理由见下表。 |
| 历史必要证据 | 374 | archive：阶段验收、数据格式、安全、来源治理证据；不作当前操作入口。 |
| 旧贡献者/旧 PR/旧产品叙事（当前入口） | 0 | 当前贡献名单 9 人及旧模型鸣谢已移除；历史实质证据与版权来源不伪改。 |
| 无意义测试 fixture/注释 | 0 | 8 行命中已中性化；有实际密钥派生意义的旧 appName 不属于此类。 |
| 真正产品残留（本扫描范围） | 0 | 当前模型许可和 README 已修正；不把必要 provenance 判作产品身份。 |

### 文档命中逐项分类

同一文件同一类别的行号合并展示；各行都归入对应类别。历史治理 JSON 的旧路径是当时的文件级许可/检查记录，不能机械改成不存在的新历史。当前示例中的 Playa 是实际 manifest 作者，而非 Firefly 贡献名单。

| 文件 | 命中行号 | 分类 | 保留理由 |
| --- | --- | --- | --- |
| `docs/archive/issues/2026-09-05-minimax-m3-write-markdown-param-loss-report.md` | 3, 136 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `LICENSE` | 3 | 法律许可 | 保留完整原始版权与许可；删除会丢失第三方分发通知。 |
| `README.en.md` | 119 | 第三方来源 | 保留最小源码来源说明；不作为当前产品身份或贡献名单。 |
| `README.md` | 119 | 第三方来源 | 保留最小源码来源说明；不作为当前产品身份或贡献名单。 |
| `THIRD_PARTY_NOTICES.md` | 5 | 第三方来源 | 保留实际源码来源及 MIT 作者；不展示上游 PR、功能贡献或旧模型。 |
| `docs/archive/migration/firefly-batch1-implementation-2026-09-23.md` | 1, 7, 18, 19, 21, 22, 23, 33, 35, 37, 39, 44, 52, 54, 56, 57, 58, 59, 61, 77, 81 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `docs/archive/migration/firefly-batch2-implementation-2026-09-24.md` | 7 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `docs/archive/migration/firefly-batch3-implementation-2026-09-24.md` | 14, 89 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `docs/archive/migration/firefly-batch4-implementation-2026-09-25.md` | 18 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `docs/archive/migration/firefly-batch5-implementation-2026-09-25.md` | 8 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `docs/archive/migration/firefly-batch6-implementation-2026-09-25.md` | 27, 28, 31, 35, 37, 45, 53 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `docs/archive/migration/firefly-brand-skills-2026-09-25.md` | 9, 10, 25, 28, 35, 36, 37, 38, 39, 40, 41, 42, 47, 48, 49, 50, 51, 52, 53, 126, 127 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `docs/archive/migration/firefly-contract-residuals-2026-09-25.md` | 14, 15, 16, 17, 18 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `docs/archive/migration/firefly-final-gap-closeout-2026-09-25.md` | 24 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `docs/archive/migration/firefly-final-handoff-2026-09-25.md` | 11, 12, 20, 22, 27 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `docs/archive/migration/firefly-migration-audit-2026-09-22.md` | 1, 6, 31, 62, 75, 84, 87, 108, 112, 113, 114, 121, 130, 131, 132, 133, 137, 138, 140, 143, 144, 148, 150, 154, 155, 156, 166, 168, 169, 170, 171, 172, 173, 174, 179, 187, 191, 193, 194, 195, 196, 199, 201, 207, 232, 242, 259, 287, 296, 297, 305, 307, 310, 315, 316, 317, 319, 320, 335, 344, 346, 348, 350, 391, 395, 416, 419, 428, 464, 467, 481, 525 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `docs/archive/migration/firefly-reliability-and-submission-2026-09-25.md` | 54, 63, 64 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `docs/archive/migration/firefly-source-diff-review-2026-09-25.md` | 8, 9, 14, 16, 17, 20, 21, 23, 27, 33, 39, 40, 42, 46 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `docs/archive/migration/firefly-unification-startup-2026-09-25.md` | 57 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `docs/archive/refactor/2026-09-26-dependency-governance.md` | 80, 94, 341, 343 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `docs/archive/refactor/2026-09-26-document-review-register.md` | 32, 50 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `docs/archive/refactor/2026-09-26-documentation-dependency-closeout.md` | 199, 231, 232, 410, 523 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `docs/archive/refactor/2026-09-26-npm-audit-remediation.md` | 226 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `docs/archive/refactor/2026-09-26-skills-sdk-document-review.md` | 115, 128 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `docs/archive/reviews/resource-refresh-2026-09-26.md` | 57, 65, 69 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `docs/archive/reviews/structure-cleanup-2026-09-26.md` | 16, 31, 33, 39 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `examples/README.md` | 7 | 第三方来源 | 保留已分发 Skill 或真实示例的来源、版权、固定版本与作者；删改会伪造归属。 |
| `packages/plugin-sdk/LICENSE` | 3 | 法律许可 | 保留完整原始版权与许可；删除会丢失第三方分发通知。 |
| `skills/firefly-plugin-dev/references/example-walkthrough.md` | 27 | 第三方来源 | 保留已分发 Skill 或真实示例的来源、版权、固定版本与作者；删改会伪造归属。 |
| `vendor/firefly-skills/LICENSE-NOTICES.md` | 17 | 第三方来源 | 保留已分发 Skill 或真实示例的来源、版权、固定版本与作者；删改会伪造归属。 |
| `vendor/firefly-skills/license-provenance.json` | 859, 860, 866, 919, 929, 939, 949, 959, 969, 979, 989, 1007, 1017, 1037, 1048, 1060, 1070, 1080, 1090, 1102, 1113, 1124, 1134, 1145, 1156, 1166, 1176, 1192, 1202, 1213, 1383, 1393, 1403, 1413, 1423, 1433, 1443, 1457, 1584, 1594, 1604, 1614, 1624, 1634, 1644, 1654, 1664, 1675, 1685, 1695, 1705, 1715, 1725, 1735, 1745, 1755, 1765, 1781, 1791, 1801, 1811, 1821, 1831, 1841, 1851, 1861, 1871, 1881, 1891, 1901, 1911, 2305, 2315, 2325, 2335, 2345, 2355, 2365, 2375, 2385, 2395, 2405, 2415, 2425, 2435, 2445, 2455, 2465, 2475, 2485, 2495, 2505, 2515, 2525, 2535, 2545, 2555, 2565, 2575, 2585, 2595, 2605, 2615, 2625, 2635, 2645, 2655, 2665, 2675, 2685, 2695, 2705, 2715, 2725, 2735, 2745, 2755, 2765, 2775, 2785, 2795, 2805, 2815, 2825, 2835, 2845, 2855, 2865, 2875, 2885, 2895, 2905, 2915, 2925, 2935, 2945, 2955, 2965, 2975, 2985, 2995, 3005, 3015, 3025, 3035, 3045, 3055, 3065, 3075, 3091, 3101, 3111, 3121, 3131, 3141, 3151, 4296, 4306, 4316, 4326, 4336, 4346, 4356, 4366, 4376, 4386, 4396, 4406, 4416, 4426, 4436, 4446, 4456, 4466, 4476, 4486, 4496, 4506, 4516, 4520, 5213, 5223, 5233, 5243, 5253, 5263, 5273, 5283, 5293, 5303, 5313, 5323, 5333, 5343, 5353, 5891, 5901, 5911, 5921, 5931, 5941, 5951, 5961, 5971, 5981, 6004 | 第三方来源 | 保留已分发 Skill 或真实示例的来源、版权、固定版本与作者；删改会伪造归属。 |
| `vendor/firefly-skills/licenses/upstream-contributions-MIT.txt` | 3 | 法律许可 | 保留完整原始版权与许可；删除会丢失第三方分发通知。 |

### 源码、测试与配置命中逐项依据

下表穷尽扫描中的非文档命中；历史 JSON 单独标识，不冒充运行代码。相同路径和理由的行号合并；旧事件只在读取/回放规范化，不双发。负例与兼容测试保留可读旧值，不编码隐藏。调用方继续通过已存在的集中常量/迁移接口消费规范化数据，本轮未修改这些接口。

| 文件 | 命中行号 | 分类 | 所依赖旧契约及删除影响 |
| --- | --- | --- | --- |
| `.gitignore` | 208 | 旧数据兼容 | 旧内部工作区目录不进入 Git；删除忽略项会使历史状态或私人内容误入提交。 |
| `docs/archive/refactor/2026-09-26-dependency-governance.distribution.json` | 3484, 4231, 6642, 6648, 6654, 6660, 6666, 6672, 6678, 6684, 6697, 6703, 6716, 6722, 6728, 6734, 6740, 6746, 6752, 6758, 6764, 6770, 6776, 6782, 6788, 6794, 6800, 6806, 6812, 6829, 6835, 6841, 6847, 6853, 6859, 6865, 6871, 6884, 6890, 6896, 6902, 6908, 6914, 6920, 6926, 6932, 6938, 6944, 6950, 6956, 6962, 6968, 6974, 6980, 6986, 6992, 6998, 7004, 7010, 7016, 7022, 7028, 7034, 7040, 7046, 7052, 7058, 7064, 7070, 7076, 7089, 7095, 7101, 7107, 7113, 7119, 7125, 7131, 7137, 7143, 7149, 7155, 7161, 7167, 7173, 7179, 7185, 7191, 7197, 7203, 7209, 7215, 7221, 7227, 7233, 7239, 7245, 7251, 7257, 7263, 7269, 7275, 7281, 7287, 7293, 7299, 7305, 7311, 7317, 7323, 7329, 7335, 7341, 7347, 7353, 7359, 7365, 7371, 7377, 7383, 7389, 7395, 7401, 7407, 7413, 7419, 7425, 7431, 7437, 7443, 7449, 7455, 7461, 7467, 7473, 7479, 7485, 7491, 7497, 7503, 7509, 7515, 7521, 7527, 7533, 7539, 7545, 7551, 7557, 7563, 7569, 7575, 7581, 7587, 7593, 7606, 7612, 7618, 7624, 7630, 7636, 7642, 7648, 7654, 7660, 7666, 7672, 7678, 7684, 7690, 7696, 7702, 7708, 7714, 7720, 7726, 7732, 7738, 7751, 7757, 7763, 7769, 7775, 7781, 7787, 7793, 7799, 7805, 7811, 7817, 7823, 7829, 7835, 18631, 18709, 22100 | 历史必要证据 | 保留：安全、迁移、来源或阶段验收记录；不是当前功能、作者名单或执行规范。 |
| `examples/system-status/manifest.json` | 7 | 第三方来源 | 保留已分发 Skill 或真实示例的来源、版权、固定版本与作者；删改会伪造归属。 |
| `scripts/packaging/electron-builder-config.test.mjs` | 76 | 旧数据兼容 | 已退役 NSIS 用户目录保留宏的否定断言；删除会失去防止旧安装器逻辑重新生效的覆盖。 |
| `scripts/packaging/upstream-skills/sources.json` | 228, 321, 322, 481 | 第三方来源 | 保留已分发 Skill 或真实示例的来源、版权、固定版本与作者；删改会伪造归属。 |
| `src/cli/state/state.test.ts` | 51 | 旧数据兼容 | 旧 CLI .cyrene/state.json 读取；删除会失去历史 CLI 状态恢复覆盖。 |
| `src/main/channels/inbound-server.test.ts` | 10, 13 | 旧数据兼容 | 旧渠道请求头拒绝用例；删除会失去防止恢复旧鉴权入口的覆盖。 |
| `src/main/channels/settings-store-fallback.test.ts` | 23, 46 | 旧数据兼容 | 真实旧 obf 派生测试：旧 appName 与 cyrene-bot-secret 同时参与密钥；改名会取消旧凭据恢复覆盖。临时目录已改名。 |
| `src/main/character-migration.test.ts` | 67, 79, 81, 87, 95, 121 | 旧数据兼容 | 旧品牌/角色/资源的否定断言（或真实许可归属断言）；删除会失去防止污染回归的覆盖，不是当前产品值。 |
| `src/main/external-content-paths.test.ts` | 53, 55, 57, 59, 60 | 旧数据兼容 | 旧用户 Skill/提示词/开关/slash 名称兼容；删除会失去用户覆盖优先级与授权不扩大的回归。 |
| `src/main/learn/obsidian/obsidian-workspace-service.test.ts` | 5, 174, 176, 182, 204, 206, 207, 211, 221, 228, 229, 230 | 旧数据兼容 | 旧内部目录读写拒绝、枚举隐藏及空工作区识别；删除会失去旧工作区安全与初始化覆盖。 |
| `src/main/migration/channel-credentials.test.ts` | 8 | 旧数据兼容 | 旧数据、字段、事件或凭据的迁移/拒绝夹具；验证新值优先、原文件不变、失败不丢数据及一次回放，删除会失去相应恢复回归。 |
| `src/main/migration/firefly-contract-integration.test.ts` | 13, 21, 35, 43 | 旧数据兼容 | 旧数据、字段、事件或凭据的迁移/拒绝夹具；验证新值优先、原文件不变、失败不丢数据及一次回放，删除会失去相应恢复回归。 |
| `src/main/migration/firefly-data.test.ts` | 23, 24, 30, 35, 36, 37, 40, 44, 45, 46, 51, 59, 63, 67, 70, 72, 74, 83, 96, 97, 104, 108, 116, 127, 128, 131, 135, 139 | 旧数据兼容 | 旧数据、字段、事件或凭据的迁移/拒绝夹具；验证新值优先、原文件不变、失败不丢数据及一次回放，删除会失去相应恢复回归。 |
| `src/main/migration/firefly-data.test.ts` | 78, 79 | 旧数据兼容 | 旧插件协议/路径拒绝回归；删除会失去协议隔离与旧桥不再生效的覆盖。 |
| `src/main/migration/firefly-data.ts` | 6, 7, 8, 70 | 旧数据兼容 | 旧 chats/runs/tasks/export-manifest 迁移并保留原数据；删除会漏读会话、工具结果、reviews、任务或导出清单。 |
| `src/main/moments/character-personas-firefly.test.ts` | 33, 36 | 旧数据兼容 | 旧品牌/角色/资源的否定断言（或真实许可归属断言）；删除会失去防止污染回归的覆盖，不是当前产品值。 |
| `src/main/moments/character-personas.test.ts` | 259, 267, 268 | 旧数据兼容 | 旧品牌/角色/资源的否定断言（或真实许可归属断言）；删除会失去防止污染回归的覆盖，不是当前产品值。 |
| `src/main/orchestrator/harness/compaction.test.ts` | 16, 18 | 旧数据兼容 | 旧检查点识别而新摘要只写 Firefly；删除会失去历史摘要恢复覆盖。 |
| `src/main/orchestrator/harness/plan-tools.test.ts` | 205, 206, 213, 270, 273 | 旧数据兼容 | 旧工作区 gitignore 与历史 planPath 保留；删除会失去已有文件保护与历史卡片路径覆盖。 |
| `src/main/plugin-panel-protocol.test.ts` | 50, 51, 71, 72, 73, 74, 77 | 旧数据兼容 | 旧 scheme 和旧保留桥路径的拒绝测试；删除会失去插件隔离与防路径绕过覆盖。 |
| `src/main/skills/firefly-skills.test.ts` | 28, 29, 32, 36, 37, 38, 42, 43, 50, 52 | 旧数据兼容 | 旧用户 Skill/提示词/开关/slash 名称兼容；删除会失去用户覆盖优先级与授权不扩大的回归。 |
| `src/main/skills/skill-id-aliases.ts` | 2, 3, 4, 5, 6, 7, 8, 9 | 旧数据兼容 | 旧 Skill ID 对应已有用户目录、设置、slash 调用及授权集合；删除会忽略用户覆盖或开关，不新增双注册。 |
| `src/main/structure-cleanup.test.ts` | 29, 36, 38, 39, 41 | 旧数据兼容 | 旧品牌/角色/资源的否定断言（或真实许可归属断言）；删除会失去防止污染回归的覆盖，不是当前产品值。 |
| `src/main/ui-icon.test.ts` | 7, 8 | 旧数据兼容 | 旧已保存图标 ID 映射到当前 Firefly 视觉；删除会失去用户设置兼容覆盖。 |
| `src/plugins/installer.test.ts` | 241 | 旧数据兼容 | 退役市场元数据剔除或旧安装器路径拒绝回归；删除会失去打包/导入保护覆盖。 |
| `src/renderer/react-perf/react-perf-cleanup.test.ts` | 21 | 旧数据兼容 | 旧品牌/角色/资源的否定断言（或真实许可归属断言）；删除会失去防止污染回归的覆盖，不是当前产品值。 |
| `src/renderer/react/character-avatars.test.ts` | 19 | 旧数据兼容 | 旧品牌/角色/资源的否定断言（或真实许可归属断言）；删除会失去防止污染回归的覆盖，不是当前产品值。 |
| `src/renderer/react/features/chat/components/ChatMessageList.test.ts` | 207 | 旧数据兼容 | 旧品牌/角色/资源的否定断言（或真实许可归属断言）；删除会失去防止污染回归的覆盖，不是当前产品值。 |
| `src/renderer/react/features/chat/components/streamdown-file-link.test.ts` | 15, 23 | 旧数据兼容 | 旧历史文件引用解码及非法编码拒绝；删除会失去历史链接兼容安全覆盖。 |
| `src/renderer/react/features/chat/components/streamdown-message-content-state.test.ts` | 75 | 旧数据兼容 | 旧品牌/角色/资源的否定断言（或真实许可归属断言）；删除会失去防止污染回归的覆盖，不是当前产品值。 |
| `src/renderer/settings/appearance-settings-markup.test.ts` | 39, 40, 67 | 旧数据兼容 | 旧品牌/角色/资源的否定断言（或真实许可归属断言）；删除会失去防止污染回归的覆盖，不是当前产品值。 |
| `src/shared/legacy-firefly-contracts.ts` | 1 | 旧数据兼容 | 历史 cyrene.* 事件规范化一次；删除会破坏旧运行、任务和审批回放。 |
| `src/shared/legacy-firefly-contracts.ts` | 6 | 旧数据兼容 | 旧 .cyrene 工作区目录的读取与保护；删除会使历史状态无法恢复或泄漏内部文件。 |
| `src/shared/legacy-firefly-contracts.ts` | 7 | 旧数据兼容 | 旧 .cyrene-user-data 路径兼容；删除会使旧 CLI 数据定位失效。 |
| `src/shared/legacy-firefly-contracts.ts` | 8 | 旧数据兼容 | 已有用户 cyrene_harness.md 覆盖兼容；删除会忽略用户规则。 |
| `src/shared/legacy-firefly-contracts.ts` | 9 | 旧数据兼容 | 旧本地模型无密钥占位符；删除会误判已有本地模型档案。 |
| `src/shared/legacy-firefly-contracts.ts` | 10 | 旧数据兼容 | 旧会话模式 localStorage 键读取；删除会丢失界面模式选择。 |
| `src/shared/legacy-firefly-contracts.ts` | 11 | 旧数据兼容 | 旧历史文件引用 URL 解码；删除会使历史文件链接失效。 |
| `src/shared/legacy-firefly-contracts.ts` | 12 | 旧数据兼容 | 识别并剔除旧市场安装元数据；删除会遗留退役来源记录。 |
| `src/shared/legacy-firefly-contracts.ts` | 14 | 旧数据兼容 | 已有向量模型选择键迁移；删除会丢失原配置。 |
| `src/shared/legacy-firefly-contracts.ts` | 15 | 旧数据兼容 | 已有重排选择键迁移；删除会丢失原配置。 |
| `src/shared/legacy-firefly-contracts.ts` | 37 | 旧数据兼容 | 旧朋友圈发帖设置迁移，新字段优先；删除会改变用户已保存开关。 |
| `src/shared/legacy-firefly-contracts.ts` | 38 | 旧数据兼容 | 旧朋友圈互动设置迁移，新字段优先；删除会改变用户已保存开关。 |
| `src/shared/legacy-firefly-contracts.ts` | 39 | 旧数据兼容 | 旧心情字段规范化；删除会丢失历史状态。 |
| `src/shared/legacy-firefly-contracts.ts` | 48 | 旧数据兼容 | 旧朋友圈 author/actor/mentions 身份转换；删除会造成历史头像与身份错位。 |
| `src/shared/legacy-firefly-contracts.ts` | 60 | 旧数据兼容 | 旧压缩摘要检查点识别；删除会把旧摘要误当普通系统消息。 |
| `src/shared/legacy-firefly-contracts.ts` | 61 | 旧数据兼容 | 旧 obf 凭据密钥派生常量；删除会无法解密已有渠道凭据。 |

### 本追加验证与边界

- `FIREFLY_TEST_BASH=E:\Git\usr\bin\bash.exe npm test`：退出码 0；521 个文件通过，4496 项通过、1 项既有跳过、0 失败，237.60 秒。跳过仍为 Windows 真实符号链接权限限制，不是新增跳过。这里是本次完整运行，不累加历史测试数字。
- `npm run check:renderer`：退出码 0。
- `npm run build`：退出码 0，正式入口清理 dist 后生成 Main/Preload/CLI/Renderer；既有大 chunk 警告保留，不修改门槛。
- `node --test scripts/packaging/adapt-skills-snapshot.test.mjs`：6 项通过、0 失败/跳过，涵盖最终 ZIP 全 Markdown 本地文件/锚点、确定性与受控 XLSX 源，不重做 Skills 治理。
- marked AST 检查仓库 173 份 Markdown：183 个本地链接、6 个标题锚点，0 断链；含迁移后的反馈报告与当前导航。外部 URL 未进行新的联网验收，不宣称所有外链可访问。
- `git diff --check`：退出码 0。源码差异审查确认仅测试 fixture/断言与文档变化，没有生产代码、依赖、权限、事件、存储或模型资产变更。
- 本轮未启动应用、请求模型或操作用户数据；真实模型、深度 GUI、外部办公/TTS/QQ Music、持续帧率、安装器、跨平台及公开资产再分发继续保留既有未验收边界。
- 仓库外诊断：firefly-attribution-audit.json / firefly-attribution-links.json 和本次 tests/renderer/build/zip 日志位于 E:\Codex，不进入仓库。根 LICENSE 和 manifest 未作写入，Git 内容比较无差异；Windows 检出行尾与 HEAD 原始字节不同，不表述为与 HEAD 字节一致。正式 ZIP 与 HEAD 字节一致，SHA-256 为 `667740966cf7f06139ab4cf65bb41489b207e3ab54627c1e2d0cfc297b9a5e72`。不改写作者或 Git 历史。
