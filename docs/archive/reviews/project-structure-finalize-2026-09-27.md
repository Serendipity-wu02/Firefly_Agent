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
