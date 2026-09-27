# 当前依赖治理记录（2026-09-26）

## 39 项宿主语义闭环（2026-09-27）

正式快照保留既定版本决策：3 项升级适配、12 项正文等价保留、24 项现版保留。下表 ID、模式、正文中出现的真实跨 Skill ID 及附件数均取自当前 ZIP；正文中的示例性提及不等于自动调用。每项均可不经发现页预热直接 `invoke_skill`；长正文通过 `read_skill_reference` 续读。附件路径/锚点另由归档回归检查；外部办公程序与 GUI 未实测。具体逐文件哈希和宿主字面证据见同名 distribution.json 的 `hostSemanticReview`。

| 正式 ID | 模式 | 正文提及的其他正式 ID | references / scripts / templates | 宿主处理与边界 |
| --- | --- | --- | --- | --- |
| `as-api-and-interface-design` | code | 无 | 0/0/0 | 当前 Code 指引；无新增宿主工具或权限 |
| `as-code-review-and-quality` | code | `as-security-and-hardening` | 0/0/0 | 当前 Code 指引；无新增宿主工具或权限 |
| `as-code-simplification` | code | 无 | 0/0/0 | 当前 Code 指引；无新增宿主工具或权限 |
| `as-context-engineering` | code | 无 | 0/0/0 | 外部进程监督不作为 Firefly 重启命令 |
| `as-debugging-and-error-recovery` | code | `ecc-tdd-workflow` | 0/0/0 | 当前 Code 指引；无新增宿主工具或权限 |
| `as-doubt-driven-development` | code | `as-code-review-and-quality`、`as-debugging-and-error-recovery`、`as-source-driven-development` | 0/0/0 | task 只用现有 general、父级委派 |
| `as-frontend-ui-engineering` | code | 无 | 0/0/0 | 浏览器可视化仅在实际工具可用时执行 |
| `as-git-workflow-and-versioning` | code | `as-api-and-interface-design`、`as-code-review-and-quality` | 0/0/0 | Git 写操作须另获授权 |
| `as-incremental-implementation` | code | `as-git-workflow-and-versioning`、`ecc-tdd-workflow`、`sp-verification-before-completion` | 0/0/0 | 示例 commit 不自动执行 |
| `as-planning-and-task-breakdown` | code | `sp-verification-before-completion` | 0/0/0 | 按已有计划与实际任务状态执行 |
| `as-security-and-hardening` | code | 无 | 0/0/0 | 当前 Code 指引；无新增宿主工具或权限 |
| `as-source-driven-development` | code | `as-security-and-hardening` | 0/0/0 | 官方资料访问受现有网络工具约束 |
| `as-spec-driven-development` | code | `as-context-engineering`、`as-incremental-implementation`、`as-planning-and-task-breakdown`、`ecc-tdd-workflow` | 0/0/0 | 外部 OpenSpec 只作可选流程 |
| `as-using-agent-skills` | code | 34 项（完整 ID 清单见 JSON） | 0/0/0 | 34 个明确注册 ID；无全局别名 |
| `docx` | work/code/learn | 无 | 18/50/0 | Work write_word；.NET/PowerShell/预览外部执行未实测 |
| `ecc-agent-introspection-debugging` | code | `self-improving-agent`、`sp-verification-before-completion` | 0/0/0 | 当前 Code 指引；无新增宿主工具或权限 |
| `ecc-ai-regression-testing` | code | 无 | 0/0/0 | 当前 Code 指引；无新增宿主工具或权限 |
| `ecc-code-tour` | code | `ecc-codebase-onboarding`、`ecc-coding-standards` | 0/0/0 | 当前 Code 指引；无新增宿主工具或权限 |
| `ecc-codebase-onboarding` | code | 无 | 0/0/0 | 当前 Code 指引；无新增宿主工具或权限 |
| `ecc-coding-standards` | code | `as-api-and-interface-design`、`as-frontend-ui-engineering` | 0/0/0 | 当前 Code 指引；无新增宿主工具或权限 |
| `ecc-plan-canvas` | code | 无 | 0/0/0 | 外部 CLI、hooks 与后台服务均非 Firefly 默认能力 |
| `ecc-security-review` | code | 无 | 0/0/0 | 当前 Code 指引；无新增宿主工具或权限 |
| `ecc-tdd-workflow` | code | 无 | 0/0/0 | 未分发的检测脚本已改为实际 package.json/lock 检查 |
| `office-design` | work/code/learn | 无 | 1/1/0 | 主题校验脚本需已授权 Python；路径取 invoke 返回目录 |
| `pdf` | work/code/learn | `office-design` | 0/11/0 | Work write_pdf；Python/渲染外部程序未实测 |
| `pptx-generator` | work/code/learn | `office-design` | 5/1/0 | 无 write_pptx；PptxGenJS/markitdown 外部程序未实测 |
| `self-improving-agent` | work/code/learn | 无 | 1/1/0 | 沿用既有 Firefly 适配；未变更版本 |
| `skill-creator` | work/code/learn | `docx`、`xlsx` | 1/9/0 | Claude/Cowork 评测与服务是外部可选流程 |
| `sp-brainstorming` | code | `sp-writing-plans` | 0/0/0 | 浏览器辅助可选；设计不授予 Git 权限 |
| `sp-dispatching-parallel-agents` | code | 无 | 0/0/0 | 现有 task 字段与审批；子任务不再委派 |
| `sp-requesting-code-review` | code | 无 | 1/0/0 | 现有 task + read_skill_reference，未增权限 |
| `sp-subagent-driven-development` | code | 无 | 3/3/0 | 3份 brief + 3个 Node helper；Git/Node 非自动执行 |
| `sp-systematic-debugging` | code | `ecc-tdd-workflow`、`sp-verification-before-completion` | 0/0/0 | TDD→ecc-tdd-workflow；完成核验→sp-verification-before-completion |
| `sp-using-git-worktrees` | code | 无 | 0/0/0 | worktree/分支/ignore 修改需单独授权 |
| `sp-using-superpowers` | code | `sp-brainstorming`、`sp-systematic-debugging` | 5/0/0 | Firefly ref 生效；其他四个宿主 ref 仅作外部说明 |
| `sp-verification-before-completion` | code | 无 | 0/0/0 | 实际测试与检查证据，不代替验收 |
| `sp-writing-plans` | code | `ecc-tdd-workflow`、`sp-subagent-driven-development`、`sp-using-git-worktrees` | 0/0/0 | inline 或获准 task；无 executing-plans Skill |
| `write-expense-report` | work | 无 | 1/0/0 | Work query_expense(read) + write_excel(mutation) |
| `xlsx` | work/code/learn | `office-design` | 7/11/7 | Work write_excel；公式/重算/LibreOffice 外部执行未实测 |

已核对：9 项 SP 的 Firefly 调用链、TDD 与计划执行替代、review brief/Node helper、四份外部宿主 reference；7 项办公 Skills 的实际文档工具、脚本定位、公式/重算/预览/主题与用户目录边界。外部程序、真实模型、GUI 和真实用户覆盖未在本轮调用；“静态语义适配”不等于它们的实机通过。

## 39项版本兼容决策（2026-09-27）

最新状态：3项升级并适配、12项as/ecc正文等价保留、24项其他现版保留；此前37项源码取得记录不作为新验证。本轮的跨 Skill ID、SP 流程和办公附件静态宿主语义检查见上节；外部程序、真实模型及 GUI 仍未实测。下表 Current body 为正式 ZIP 正文原字节 SHA，Body equal 仅比较升级前正文去 frontmatter/外层空白及 CRLF，不代表整目录一致。附件完整清单与验证边界见同名 distribution.json 的 upstreamCompatibilityReview 与 hostSemanticReview。

| Skill | Current body SHA-256 | Fixed input | Body equal | Decision | Reason |
| --- | --- | --- | --- | --- | --- |
| `as-api-and-interface-design` | 6875fda71f0149b583ca20c55bfe5200f8da9bffd019b726113a7322f71ca9b4 | 2686b620fc1fed2e8f60c704839c766b8594c6b6 | false | upgraded-adapted | Adopt intent-stable idempotency keys, atomic claim, payload binding, in-flight handling and explicit unknown outcomes; preserve Firefly metadata and require existing authorization. Replace the unavailable standalone deprecation workflow with equivalent in-body compatibility guidance. |
| `as-code-review-and-quality` | c3355ced51cadc1dc529a7675afa0d7b1eab45c0ba20409973d7c31c52f43f2c | 2686b620fc1fed2e8f60c704839c766b8594c6b6 | true | equivalent-body-retained | Body matches the pinned input; both subtrees contain only SKILL.md. Retain current Firefly ID/frontmatter rather than rewriting for a version label. Common cross-call review remains separate from body equivalence. |
| `as-code-simplification` | f331201180d72daa40c740496546085ca03f6e1e9e0a4c9a2250bbaddf029ffd | 2686b620fc1fed2e8f60c704839c766b8594c6b6 | true | equivalent-body-retained | Body matches the pinned input; both subtrees contain only SKILL.md. Retain current Firefly ID/frontmatter rather than rewriting for a version label. Common cross-call review remains separate from body equivalence. |
| `as-context-engineering` | 47301b247a96dddf6e6cb201b04d0bbe989d95bb9ced89d4fef8e1411062847a | 2686b620fc1fed2e8f60c704839c766b8594c6b6 | false | upgraded-adapted | Adopt completed-task handoff artifacts, proactive context trimming and explicitly authorized commits. Process supervision remains external; no Firefly restart command or second loop is introduced. |
| `as-debugging-and-error-recovery` | 41f757c5d2cf1bba1f0c8dd48d27b4553bfb3a10c03c939ea7828ea8cf0195c6 | 2686b620fc1fed2e8f60c704839c766b8594c6b6 | true | equivalent-body-retained | Body matches the pinned input; both subtrees contain only SKILL.md. Retain current Firefly ID/frontmatter rather than rewriting for a version label. Common cross-call review remains separate from body equivalence. |
| `as-doubt-driven-development` | 2153510f2f06d572e1ca08f15d7c922afcc8cfa3ef93f93b3e53f29ae418ebac | 2686b620fc1fed2e8f60c704839c766b8594c6b6 | true | equivalent-body-retained | Body matches the pinned input; both subtrees contain only SKILL.md. Retain current Firefly ID/frontmatter rather than rewriting for a version label. Common cross-call review remains separate from body equivalence. |
| `as-frontend-ui-engineering` | 32d8c8df5be335a8a0571afe75398378c1a6c88122d7fafab7b6c9fc8f6f46c9 | 2686b620fc1fed2e8f60c704839c766b8594c6b6 | false | current-version-retained | Retain current UI guidance. New reference-led quality and finish gates are valuable, but the body also points outside the fetched subtree to accessibility-checklist.md. Do not promote a body with an unbound external attachment or assume browser tools. |
| `as-git-workflow-and-versioning` | e7978afe08ef1714eefd20693e373d394d8cca07b102d1b11d5e8805f3d707c7 | 2686b620fc1fed2e8f60c704839c766b8594c6b6 | true | equivalent-body-retained | Body matches the pinned input; both subtrees contain only SKILL.md. Retain current Firefly ID/frontmatter rather than rewriting for a version label. Common cross-call review remains separate from body equivalence. |
| `as-incremental-implementation` | 8b6fc4f6e98c03aac336ebe87645568f37dce7864eb1770499d46e18f5f2c461 | 2686b620fc1fed2e8f60c704839c766b8594c6b6 | true | equivalent-body-retained | Body matches the pinned input; both subtrees contain only SKILL.md. Retain current Firefly ID/frontmatter rather than rewriting for a version label. Common cross-call review remains separate from body equivalence. |
| `as-planning-and-task-breakdown` | d0b6b9922ea8cf8804898d8ae19ebfb7a2f0ccc9daedfb44437fc060d1b9ac10 | 2686b620fc1fed2e8f60c704839c766b8594c6b6 | false | current-version-retained | Retain current planning workflow. New incomplete-plan protection is valuable, but the new tracker routing and /build convention need Firefly bindings; definition-of-done.md lies outside the fetched subtree. No tracker or command is fabricated. |
| `as-security-and-hardening` | 6c842bdefbcd69ccf060dce92b46c7aa1f8abecdb4781110a261d5e385c1e5b6 | 2686b620fc1fed2e8f60c704839c766b8594c6b6 | false | current-version-retained | Retain current inline security patterns. New body moves patterns into hardening-patterns.md and still relies on an outside security-checklist.md plus an unavailable observability Skill. No partial body-only upgrade that loses existing patterns. |
| `as-source-driven-development` | 844592fbbf646683b4f2ba2dff1aeb7e063b8cf1a2daec18c8d35a736c7a2e8f | 2686b620fc1fed2e8f60c704839c766b8594c6b6 | true | equivalent-body-retained | Body matches the pinned input; both subtrees contain only SKILL.md. Retain current Firefly ID/frontmatter rather than rewriting for a version label. Common cross-call review remains separate from body equivalence. |
| `as-spec-driven-development` | ee67891236351f7f833515732ec0cf7664f24ac0639c7ea1498652f45fb0422c | 2686b620fc1fed2e8f60c704839c766b8594c6b6 | false | current-version-retained | Retain current four-phase specification workflow. Conditional Phase 0 and capability IDs are valuable; the optional OpenSpec and command/cross-Skill assumptions are not proven against Firefly. Do not enable an external tracker. |
| `as-using-agent-skills` | cdb2821e0f18c0915905e84019198622e4b19d817e5c9267ee4bb0b0e91ce7c6 | 2686b620fc1fed2e8f60c704839c766b8594c6b6 | false | upgraded-adapted | Replace unavailable mandatory lifecycle calls with Firefly-maintained explicit registered-ID mapping, existing TDD workflow, approved inline execution, bounded meta-tool reads and optional task delegation. No new alias registration, loader, tool, default activation or permission is introduced; recursive discovery is forbidden. |
| `docx` | 838ad7d14da25d097c1b196fa23486de6d4a881cd090a72bd127fb34d05dc1bf | 60aaae52bb2af8162732751a4332f62a5fef518b | false | current-version-retained | Retain Firefly Windows env_check/doc conversion/preview, write_word routing, style selection and original-document edit/validation paths. Fixed input lacks the three PowerShell helpers and style catalog; most shared implementation scripts match with CRLF-only normalization, but references/body differ. No Office runtime equivalence claim. |
| `ecc-agent-introspection-debugging` | 8a248ae16a08300730ecef23ec86caba85c6b8bd9d236cbec3896978cf3bb3ce | e482e579415fde18357cafce70f177ae19fd7f03 | true | equivalent-body-retained | Body matches the pinned input; both subtrees contain only SKILL.md. Retain current Firefly ID/frontmatter rather than rewriting for a version label. Common cross-call review remains separate from body equivalence. |
| `ecc-ai-regression-testing` | 711f995f7fd5e9cc7f8802637aa1230d97bf2e2d6de68396e626d7befe9e5652 | e482e579415fde18357cafce70f177ae19fd7f03 | true | equivalent-body-retained | Body matches the pinned input; both subtrees contain only SKILL.md. Retain current Firefly ID/frontmatter rather than rewriting for a version label. Common cross-call review remains separate from body equivalence. |
| `ecc-code-tour` | 3e29cd330bf61e3ecd61c913e95407834f2815098d73f6f56fbe947efed647bf | e482e579415fde18357cafce70f177ae19fd7f03 | true | equivalent-body-retained | Body matches the pinned input; both subtrees contain only SKILL.md. Retain current Firefly ID/frontmatter rather than rewriting for a version label. Common cross-call review remains separate from body equivalence. |
| `ecc-codebase-onboarding` | 09a7bed5876bb9800020ed7b71e139b473701facee22e6ea74f6d83176e0bdd8 | e482e579415fde18357cafce70f177ae19fd7f03 | true | equivalent-body-retained | Body matches the pinned input; both subtrees contain only SKILL.md. Retain current Firefly ID/frontmatter rather than rewriting for a version label. Common cross-call review remains separate from body equivalence. |
| `ecc-coding-standards` | bc13a965e524e2f8888b8fbc305c3c196c708fe8851b9f4d948092a1d17e74d9 | e482e579415fde18357cafce70f177ae19fd7f03 | true | equivalent-body-retained | Body matches the pinned input; both subtrees contain only SKILL.md. Retain current Firefly ID/frontmatter rather than rewriting for a version label. Common cross-call review remains separate from body equivalence. |
| `ecc-plan-canvas` | b2ee13b7c994e05514da31933c46b12c8dfad9b3e2205e5e07ac1d666ea5ac92 | e482e579415fde18357cafce70f177ae19fd7f03 | false | current-version-retained | Do not promote the new outside docs/design/plan-canvas.md link. The body assumes an external ecc-plan-canvas CLI, loopback server, background-await and hook behavior; those are not Firefly built-ins. Current asset is retained without claiming the external UI was verified. |
| `ecc-security-review` | 2114d75e870c9f892a433e4a17244b55bd6d9b66a9d1fce27bebb0e03ffca1a8 | e482e579415fde18357cafce70f177ae19fd7f03 | false | current-version-retained | Retain the existing PostgreSQL placeholder example. Upstream changes $1 to ? for Claude argument substitution and adds security-checklist.md. Firefly reads literal body text, so that host workaround is not a demonstrated Firefly fix; no universal SQL dialect replacement. |
| `ecc-tdd-workflow` | 36d3d6400b665cb86075aed272cf6bb4c91eb1e2d2b8df13bf60ee95d3400923 | e482e579415fde18357cafce70f177ae19fd7f03 | false | current-version-retained | Retain docs/testing/<plan-or-task-name>.tdd.md. Upstream only redirects the artifact to docs/releases/<version>; that is not a demonstrated functional improvement and does not justify changing the current default location. |
| `office-design` | 235e0f84d967af606de67203c297d74534cb21a7019856c73142b04f08e3ff95 | recorded maintained source | null | current-version-retained | Retain the four-theme token schema and validator as Firefly-maintained content with recorded Playa source history and MIT scope. No independent download route is required; document tools retain their own format-specific layout behavior. |
| `pdf` | e5be24b52474ada2cb59b6e403afdb21ff965feb506741a9bb8fddd471a718ca | 60aaae52bb2af8162732751a4332f62a5fef518b | false | current-version-retained | Retain local Python Windows creation, form filling, visual review and shared themes. Fixed input routes covers through render_cover.js/browser rather than the current render_preview.py/make.py path and changes palette/body/merge scripts. No external rendering equivalence was verified. |
| `pptx-generator` | b8e7e5838aceb286330a7b95ec34d7d096ea8215722a401b3e7d00cf514bddef | 60aaae52bb2af8162732751a4332f62a5fef518b | false | current-version-retained | Retain current translated body, write_pptx routing, shared themes and repaired anchors. Five shared references match after CRLF-only normalization; body differs. The raw six-file input cannot replace the nine-file Firefly delivery without losing notices and host routing. |
| `self-improving-agent` | a561da7fa54b6d071bd6c9dc2bedcc23998193d0b4d85ad39fe56e279e7d05bb | 8a71d7098d7c39494dcaa46254885225ddb5d259 | false | current-version-retained | Keep the already completed Firefly adaptation at the recorded pskoett commit. Preserve LRN/ERR/FEAT templates, passive logging and authorized manual extraction; no rework or foreign automatic hooks. |
| `skill-creator` | 5b740547dd593025cdee25e385f07dcd44e2be7d01dceefd33f4f73fbdcad394 | 33375500bcea98d610eb30ce10ac4e59b89c390d | false | current-version-retained | Retain Firefly user-directory installation and refresh/mode instructions. Shared implementation files match after CRLF-only normalization except body and license text. Removing the Firefly installation section is a regression, not an upgrade. |
| `sp-brainstorming` | 2060da1697c99c538650b064c146ffd272ef434a114386185fcc217dafc3825e | 8ca22dba9a94f28898bbce59f2537ff4d87c747d | false | current-version-retained | Retain current design gate. New spike/bounded/architectural paths and stage approvals change workflow; new visual companion adds server and shell helpers not verified in Firefly. Do not introduce service startup or change approval behavior through a version refresh. |
| `sp-dispatching-parallel-agents` | 272e72e3066bd9934bdce894731b46c8df19240379eee8e937f2b6b3e0a8d493 | 8ca22dba9a94f28898bbce59f2537ff4d87c747d | true | current-version-retained | Retain current body, which matches the fixed input after frontmatter/outer whitespace normalization. No new attachment exists. Delegation continues through existing Firefly task permissions, not a new agent API. |
| `sp-requesting-code-review` | cdec01b0123430a61c6cf889785fb76264c8ac6e9b7a4b4afbe48e44e8a6fca6 | 8ca22dba9a94f28898bbce59f2537ff4d87c747d | false | current-version-retained | Retain Firefly review brief and task(description,prompt,subagent_type=general) adaptation. New upstream general-purpose dispatch differs from the actual task schema; retain parent-owned context, approvals and verification. |
| `sp-subagent-driven-development` | ddd0156b7d23fd8d2d6ea65789a32c8e4238f87e9f088bc25170f427c46af149 | 8ca22dba9a94f28898bbce59f2537ff4d87c747d | false | current-version-retained | Retain Firefly briefs and Node helpers. New upstream requires Bash helpers, model selection and autonomous rulings on ambiguous plans; Firefly has no model field in task, and user restrictions must not be overruled. Existing helpers and user gates stay intact. |
| `sp-systematic-debugging` | 266f3086a6341cdae45da109d5398d5d445af24b9e2cb711bdd907aaa498616a | 8ca22dba9a94f28898bbce59f2537ff4d87c747d | true | current-version-retained | Retain matching body and current test workflow. New upstream carries root-cause, condition-waiting and polluter attachments; they are not automatically delivered or executed. Missing prose references and the TDD cross-call still require the common binding pass. |
| `sp-using-git-worktrees` | 682b6a70c01d85592ca4dfe643a19fa5efd5e462221258572e84e601e0dbcd56 | 8ca22dba9a94f28898bbce59f2537ff4d87c747d | true | current-version-retained | Retain matching body and consent-first behavior. No new attachment exists. Native worktree names are platform examples, not Firefly capabilities; the current user prohibition on creating worktrees is unaffected. |
| `sp-using-superpowers` | 0f75e405ceeac3a4fd75dc736cb60efdf7752cb43bb50942a0b9b1f9decfd4a8 | 8ca22dba9a94f28898bbce59f2537ff4d87c747d | false | current-version-retained | Retain current host references. New body adds Claude/Hermes/Muse mappings; those hosts are not Firefly. The Firefly-specific invoke/read mapping still requires a common binding pass, not inclusion of unrelated host interfaces. |
| `sp-verification-before-completion` | d7964c951960ade343d61bd9f858d5e235b94d9e2c9026f32e7aea4ab05d4697 | 8ca22dba9a94f28898bbce59f2537ff4d87c747d | true | current-version-retained | Retain matching body. No new attachment exists; existing command receipts, original failure status and explicit unverified boundaries remain required. |
| `sp-writing-plans` | 89fb1b6eccec626bf58c6715993a152cd4f7d45703c4e2b766c571862afa2cf7 | 8ca22dba9a94f28898bbce59f2537ff4d87c747d | false | current-version-retained | Retain current plan format. New interfaces/test-ownership/Review Focus guidance is useful, but execution handoff assumes a native fresh reviewer and an executing-plans Skill not distributed by Firefly. Do not silently alter execution choices. |
| `write-expense-report` | b28980a05566486ab17e3fa872920de1bc9a064af770d8da8782817f2bc510bc | recorded maintained source | null | current-version-retained | Retain query_expense and write_excel workflow, time-range confirmation and column schema; real tools are registered in life-tools.ts and document-tools.ts. Recorded Playa source and MIT scope remain; no independent download route is claimed. |
| `xlsx` | d19fb39a4f4ee85230c1316b945e011cb2f4368c6f840eb0e5123cb34a8f4096 | 60aaae52bb2af8162732751a4332f62a5fef518b | false | current-version-retained | Retain temporary-workspace isolation, label lookup, explicit output protection, XML edits and Windows LibreOffice detection. Fixed input lacks xlsx_workspace.py/styles/Windows tests and changes recalculation script; do not replace protection and formula-preservation behavior without equivalent fixtures. |


## 范围与可审核基线

### 当前上游管理与优先替换（2026-09-27）

当前结果见分发附件 `upstreamManagementExecution`：两份真实收据去重后37项源码取得、2项保留既有有据来源的项目维护内容；仅self-improving-agent的新上游适配已进入正式快照，其余38项保留现版。MiniMax docx独立MIT按固定Git blob核查后严格补充获取配置，不绕过嵌套许可检查。新ZIP为246文件/105 Markdown；整体新版本适配部分完成，不把下载等同于功能可用。

self-improvement已使用明确许可的多宿主来源及Firefly适配；旧15文件不在新分发中。此前十文件授权不明是历史记录，不改写为已获授权，也不继续作为新快照的许可缺件。`license-provenance.json.currentDeliveryReplacement`和包内完整MIT/NOTICE记录新来源。此前28项材料结论继续按其版本/文件范围使用，不能套到新上游未适配正文。

本轮七文件50项定向测试、四项归档回归、类型检查、构建和audit通过；工具24通过、1项符号链接权限跳过。真实旧ZIP到新产物、用户修改/同名附件保护及重复安装重新验证；模型/办公外部工具/GUI不在此证据范围。详细命令及边界见现有集中报告最新节。

### 此前继承 Skills 修订（历史验证范围）

最新技术缺件已使用明确的 Firefly 维护适配补齐；不是同版原包复原。39 项保留，九项 SP 补齐公开来源 MIT，审查/子任务两篇正文适配，PPTX 六处锚点修复，28 篇长正文及大型附件可通过原 meta-tool 有界续读。默认、ID、模式、权限和用户覆盖不变。

当前 ZIP 的 252 个文件、188 项选定文本、108 MD 与 79 本地引用已检查；29 个适配条目、来源/前一产品/新产物 SHA 分开记录。JSON 的 `zip` / `inheritedSkillsRevision` 是技术适配值，`historicalZipEvidence` / `closeoutRevision` 是此前证据，不混用。后续来源许可专项的当前结论位于 `licenseSpecialistReview`：原 28 项中 27 项已补可核实来源链及许可材料，`self-improving-agent` 的十个文件仍缺改写版本授权证据。不能把有来源但非唯一版本、无独立 LICENSE、覆盖范围待证三种情况统称无许可。仍不宣布完整公开分发许可核查通过。

许可专项未改变 ZIP、manifest、依赖或生产代码；六份完整许可与限定范围 NOTICE/逐文件来源随既有 `vendor/firefly-skills` 整目录资源规则分发。docx、skill-creator 和九项 SP 的现有许可内容也已复核。真实旧 ZIP→生产哈希识别→更新→39 项注册及完整读取、用户改写/同名附件/重复安装保护在隔离副本通过 1 文件 2 测试；该次验证不是 GUI、真实模型或办公外部工具验收。材料检查为 2026-09-27，兼容测试为 2026-09-26；详情与十个未解决路径见集中报告的来源许可专项节。

本次 package/lock 未变化；沿用先前冻结安装，不重复安装原运行环境。新的自动结果与边界见[当前集中验收](2026-09-26-documentation-dependency-closeout.md#firefly-继承-skills-适配验收本次状态)。以下原始治理数字保留初次时点。

本记录最初盘点当时工作树证据；初次快照与验证时间保留如下。接续已按授权修正依赖元数据、提示词资料和测试，使用包含当前未提交修改的隔离副本重新安装并验证，不修改原运行环境或用户数据，不提交/推送。当前最终状态见本文末节和集中报告。已读取根 `AGENTS.md`；未发现 docs/refactor 下更深层 AGENTS。

- 仓库：`E:\Codex\Firefly-Agent-migration`；分支：`firefly-mini-v1.1.x`；HEAD：`890bc6165d7b3a476d6069c436145c181bd8a16b`。HEAD 不是依赖修改的完成提交；本记录包含工作树中的依赖更新。
- 初次依赖快照：2026-09-26T11:06:01.224Z（UTC）。安装完成后的依赖快照：2026-09-26T11:09:04.837Z；再次核对 package/lock：2026-09-26T11:13:40.153Z。
- 初次新锁共有 **61 个直接 prod、27 个直接 dev、1327 个锁包路径**；这组数字是初次快照，不是接续后的最终声明。
- package.json SHA-256：`cf06e873522be1074b17e7d332815b2b36c16236491006523d53fb5761bfe654`。
- package-lock.json SHA-256：`4f0e1ba479651b20c75f50f8c408268a75575fdc97f5b52880795b34d05d0e58`；lockfileVersion=3。
- Node：`v24.19.0`；npm 实测 / packageManager：`11.17.0` / `npm@11.17.0`。声明、锁版本、安装 metadata 分开保留，不自动归一化。
- 源码/维护文档证据最终刷新：2026-09-26T11:24:18.057Z；锁文件哈希未变。 helper 哈希及引用复核：2026-09-26T11:30:21.623Z。
- 本记录由本 Markdown 与以下三个 JSON 组成。采集时间与哈希不是文件系统原子快照。

### 附件与证据口径

1. [直接依赖、全部引用、许可证据与 audit 原文](2026-09-26-dependency-governance.direct.json)：88 个包的声明、锁记录、安装 metadata、许可文件哈希/头部、**925 条确认引用**、文本命中分栏、1466 个扫描文件哈希、类型纳入清单、初始 extract-zip 基线和两份 audit JSON。
2. [完整锁包与 overrides 传递图](2026-09-26-dependency-governance.transitive.json)：1327 个锁路径，含 resolved/integrity/dependencies/安装版本及许可字段；npm explain 节点、边、spec/rawSpec、祖先链和退出码。installed=null 表示该锁路径未找到本地 package.json，不能直接判作漏装。
3. [第三方代码、资源与说明索引](2026-09-26-dependency-governance.distribution.json)：初次 194 个资源路径、60 个已安装 KaTeX 字体、55 个 Cargo 锁记录、81 个仓库文档，以及初次 ZIP 231 个条目；旧 ZIP 位于 historicalZipEvidence，当前 ZIP 全清单位于 zip。

表格只给引用入口；**每个包全部真实引用路径/行号均在 direct[].verifiedReferences**。静态 import/export、require、require.resolve、动态 import、import type 由 TypeScript AST 提取；CSS、importEsm、npm script 经实际文件确认。literalMentions 只是注释/字段/同名变量文本，不作调用证明。源码扫描来自 `git ls-files --cached --others --exclude-standard`；扩展名和排除项见 method。docs/models/vendor 不参与源码引用判断，分发资料另列；不读取被忽略用户目录。动态计算模块名、生成 dist 和最终安装器尚无完整可达性证明。

## extract-zip 替换与 audit 来源

### 原始与最终依赖基线

- 旧基线：直接 prod `extract-zip: ^2.0.1`，锁与安装版本均为 2.0.1，BSD-2-Clause。旧锁哈希及原调用路径保存在 direct.json / previousBaseline，保留风险来源，不覆盖历史。
- 最终：**删除直接 extract-zip；prod yauzl 精确 3.4.0；dev @types/yauzl 精确 3.4.0**。manifest、lock、安装 metadata 三方相符。本次 `npm ls extract-zip --all --json --offline --ignore-scripts` 无 dependencies；`npm ls yauzl --all --json --offline --ignore-scripts` 只列根 yauzl@3.4.0。
- 历史风险来源为 `docs/refactor/2026-09-26-npm-audit-remediation.md`，记录 [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) 与 [GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3) 的符号链接/路径写出风险。该文档中的旧“1 high”不代表本记录新锁状态。
- 项目使用维护中的 yauzl 解析器与小型安全落盘适配层，不维护 extract-zip fork。`src/shared/zip-extraction.ts:6` 明确导入 yauzl，**不是自主实现 ZIP parser**。适配层未复制第三方源码；本记录核对导入及结构，未做独立代码来源相似性鉴定。
- `@electron-internal/extract-zip@1.0.4` 仍在 Electron 工具链中，完整链见附件。其已安装 README 明示只支持 Electron 内部用例，index.d.ts 的 ExtractOptions 只有 dir，没有 onEntry；不作为项目替代。名字不同，不能与旧 extract-zip 混算。

### 新落盘入口与边界

已读 `src/shared/zip-extraction.ts`：onEntry 在 entryPath 校验与落盘前执行（元数据预算检查先于回调）；有归档字节、条目数、单条目字节、总展开量、压缩比、路径长度/深度及元数据预算；拒绝链接/特殊文件/加密/危险及重复路径。使用相邻临时目录、独占写入、完成后移动；非空或不安全目标会拒绝，以保留已有文件；失败清理。源码哈希在 latestInputs。本次不以源码阅读代替恶意 ZIP 回归、并发目录替换和跨平台文件系统验收。

五个项目入口：
- `scripts/packaging/build-skills-snapshot.mjs:66`
- `scripts/packaging/prepare-mingit.mjs:10`
- `src/main/migration/skill-snapshot.ts:60`
- `src/main/skills/snapshot-install.ts:59`
- `src/plugins/installer.ts:5`

测试/替身引用位于 `src/shared/zip-extraction.test.ts`、`src/main/migration/skill-snapshot.test.ts`，精确行号见 latestInputs.evidence。业务测试结果不纳入本记录的文档一致性验证结论。

### 本轮已执行的两份 audit JSON

| 原始文件 | mtime（UTC） | JSON total | 本轮执行退出码 |
|---|---|---:|---|
| `E:/Codex/Firefly-doc-security-review-20260926/audit-prod.json` | 2026-09-26T11:11:46.238Z | 0 | exit 0 |
| `E:/Codex/Firefly-doc-security-review-20260926/audit-all.json` | 2026-09-26T11:11:49.658Z | 0 | exit 0 |

两份 SHA-256 均为 `d8f91d339fa33b1b2e620ba1737423c4fcf0d7ee7a256bc08c329b15a77f547f`；auditReportVersion=2、vulnerabilities={}，info/low/moderate/high/critical/total 全为 0。原文已嵌入 direct.json。本轮已对新锁执行 prod/all 两次 audit，均 exit 0；本次刷新复用原始 JSON，不重跑。JSON 不含执行命令或锁哈希，不从相同 metadata.dependencies 反推运行参数。

**0 告警只是此次 npm 已知公告匹配结果，不是完整安全审计、安全认证、无未知漏洞证明或许可合规结论。** 本次文档刷新未重跑 audit、历史签名验证、历史测试或安装器验收。

## 直接依赖逐包清单（初次快照）

每行均适用列出的风险/验证缺口：

- **G**：本轮 prod/all 两次 npm audit 均已执行，exit 0，原始 JSON total=0。0 告警不证明无漏洞、授权完整或分发合规；许可正文与最终产物通知保留仍需逐项验收。
- **U**：未找到直接 import，且源码/构建脚本未确认调用用途；不能据此判定无用或擅自删除。
- **N**：含原生/平台运行时或 WASM 路径；实际目标平台加载、二进制来源、附带许可及打包结果未验证。
- **E**：外部服务/进程/通道能力；真实凭据、网络、权限、失败清理和运行时可达性未实测。
- **P**：解析/渲染/文档处理入口；恶意输入、资源预算及隔离边界未做完整专项验证。
- **B**：构建/测试依赖仍可执行代码；安装脚本执行历史及制品重现性未验证。
- **T**：metadata 为类型定义，编译器源文件清单确认纳入；本轮 Main、Preload、Renderer 类型检查均通过，见[集中验证](2026-09-26-documentation-dependency-closeout.md#最终检查补记)。类型检查通过不等于每个类型包均为业务必需。
- **L**：许可字段/正文或通知分发存在本节说明的缺口，不能由项目 MIT 声明覆盖。
- **Z**：yauzl 为第三方解析器，项目维护落盘适配层；前置校验/预算/暂存路径源码已读，恶意 ZIP 回归和跨平台验收不由本记录的静态核对替代。
- **V**：锁文件与已安装 package.json 版本字符串不同，保留原值、不自动格式归一化。

许可优先原样记录安装 metadata；无字段时以实际 LICENSE 补证，不由项目根 MIT 推导。每包全部许可文件路径、哈希和头部见 direct[].licenseEvidence；metadata 声明不等于最终包已保留通知。

### 直接生产依赖（61）

| 包 | manifest 声明 | 锁版本 / 安装 metadata | 许可摘要 | 用途 / 未知 | 引用入口（完整集见附件） | 风险/缺口 |
|---|---|---|---|---|---|---|
| `@ag-ui/client` | `^0.0.57` | `0.0.57` / `0.0.57` | 字段缺失；本地 LICENSE 为 MIT | FireflyAgent 继承 AbstractAgent，并导入 RunAgentInput；封装本地 Agent 事件流 | `src/main/orchestrator/firefly-agent.ts:13`；全 1 条见附件 | G、L |
| `@ag-ui/core` | `^0.0.57` | `0.0.57` / `0.0.57` | 字段缺失；本地 LICENSE 为 MIT | AG-UI 事件、Agent 与适配器契约 | `src/main/orchestrator/firefly-agent-runtime.test.ts:5`；`src/main/orchestrator/firefly-agent.test.ts:10`；全 9 条见附件 | G、L |
| `@ant-design/cssinjs` | `^2.1.2` | `2.1.2` / `2.1.2` | MIT | 未找到直接 import；已查源码、构建脚本和配置，未确认调用用途。 | `package.json`；未找到直接 import | G、U |
| `@ant-design/icons` | `^6.3.4` | `6.3.4` / `6.3.4` | MIT | React 聊天、反馈和动态面板图标 | `src/renderer/react/components/feedback/FeedbackProvider.tsx:5`；`src/renderer/react/features/chat/components/ConversationSidebar.tsx:2`；全 8 条见附件 | G |
| `@ant-design/x` | `^2.9.0` | `2.9.0` / `2.9.0` | MIT | 聊天输入、消息和会话组件 | `src/renderer/react/features/chat/components/ChatComposer.tsx:1`；`src/renderer/react/features/chat/components/ChatMessageList.tsx:4`；全 4 条见附件 | G |
| `@anthropic-ai/sandbox-runtime` | `^0.0.71` | `0.0.71` / `0.0.71` | Apache-2.0 | sandbox-exec 动态加载沙箱；另有 poc/srt 验证脚本 | `poc/srt/boundary-test.mjs:12`；`poc/srt/check-status.mjs:5`；全 5 条见附件 | G、N |
| `@anthropic-ai/sdk` | `^0.126.0` | `0.126.0` / `0.126.0` | MIT | sdk-stream 供应商运行时 | `src/main/orchestrator/vendors/sdk-stream/runtime.ts:1`；全 1 条见附件 | G、E |
| `@ast-grep/napi` | `^0.45.1` | `0.45.1` / `0.45.1` | MIT | AST 搜索工具 | `src/main/orchestrator/tools/ast-grep-tools.ts:15`；全 1 条见附件 | G、N |
| `@lancedb/lancedb` | `^0.30.0` | `0.30.0` / `0.30.0` | Apache-2.0 | 未找到直接 import；已查源码、构建脚本和配置，未确认调用用途。 | `package.json`；未找到直接 import | G、U、N、L |
| `@larksuiteoapi/node-sdk` | `1.71.1` | `1.71.1` / `1.71.1` | MIT | 飞书通道适配器 | `src/main/channels/adapters/feishu/index.ts:34`；全 1 条见附件 | G、E |
| `@modelcontextprotocol/sdk` | `^1.29.0` | `1.29.0` / `1.29.0` | MIT | MCP 客户端及 stdio/SSE 传输 | `src/main/orchestrator/mcp-adapter-sse.test.ts:38`；`src/main/orchestrator/mcp-adapter-sse.test.ts:39`；全 9 条见附件 | G、E |
| `@node-rs/jieba` | `^2.0.3` | `2.0.3` / `2.0.3` | MIT | RAG 和社交上下文分词 | `src/main/rag/retriever.ts:6`；`src/main/social-context/retrieval.ts:1`；全 2 条见附件 | G、N |
| `@playwright/mcp` | `0.0.79` | `0.0.79` / `0.0.79` | Apache-2.0 | 通过 require.resolve 定位内置 MCP CLI | `src/main/sync-mcp-builtin.ts:28`；全 1 条见附件 | G、E |
| `@streamdown/math` | `^1.0.2` | `1.0.2` / `1.0.2` | Apache-2.0 | Streamdown 数学插件 | `src/renderer/react/features/chat/components/StreamdownMessageContent.tsx:2`；全 1 条见附件 | G |
| `@xenova/transformers` | `^2.17.2` | `2.17.2` / `2.17.2` | Apache-2.0 | embedding/reranker 经 importEsm 加载 pipeline/env | `src/main/rag/embedding.ts:98`；`src/main/rag/reranker.ts:20`；全 2 条见附件 | G、N |
| `ajv` | `^8.20.0` | `8.20.0` / `8.20.0` | MIT | 插件及 SDK manifest 校验 | `packages/plugin-sdk/src/validate-manifest.ts:10`；`src/plugins/manifest-validation.ts:10`；全 2 条见附件 | G |
| `antd` | `^6.6.4` | `6.6.5` / `6.6.5` | MIT | React 聊天与面板 UI | `src/renderer/react/components/feedback/FeedbackProvider.tsx:6`；`src/renderer/react/features/chat/components/ChatComposer.tsx:2`；全 15 条见附件 | G |
| `beautiful-mermaid` | `^1.1.3` | `1.1.3` / `1.1.3` | MIT | MermaidBlock 图表 SVG 渲染 | `src/renderer/react/features/chat/components/MermaidBlock.tsx:11`；全 1 条见附件 | G、P |
| `chart.js` | `^4.5.1` | `4.5.1` / `4.5.1` | MIT | 设置页 tokens 图表 | `src/renderer/settings/tokens/panel.ts:5`；`src/renderer/settings/tokens/state.ts:4`；全 2 条见附件 | G |
| `chokidar` | `^4.0.3` | `4.0.3` / `4.0.3` | MIT | Git 工作区文件监视 | `src/main/code-git/git-workspace-watcher.ts:3`；全 1 条见附件 | G |
| `cross-spawn` | `^7.0.6` | `7.0.6` / `7.0.6` | MIT | verification-runner 启动验证进程 | `src/main/orchestrator/verification-runner.ts:18`；全 1 条见附件 | G、E |
| `diff` | `^9.0.0` | `9.0.0` / `9.0.0` | BSD-3-Clause | run-review-tracker 文件差异 | `src/main/orchestrator/review/run-review-tracker.ts:25`；全 1 条见附件 | G |
| `docx` | `^9.7.1` | `9.7.1` / `9.7.1` | MIT | document-tools Word 文档生成 | `src/main/orchestrator/tools/document-tools.ts:440`；全 1 条见附件 | G、P |
| `dompurify` | `3.4.13` | `3.4.13` / `3.4.13` | (MPL-2.0 OR Apache-2.0) | svg-sanitize 净化 SVG | `src/renderer/react/features/chat/components/svg-sanitize.ts:11`；全 1 条见附件 | G、P |
| `electron-updater` | `^6.8.9` | `6.8.9` / `6.8.9` | MIT | GitHub 应用更新器 | `src/main/application/default-dependencies.ts:11`；`src/main/updater/github-app-updater.ts:3`；全 2 条见附件 | G、E |
| `exceljs` | `^4.4.0` | `4.4.0` / `4.4.0` | MIT | document-tools 工作簿生成 | `src/main/dependency-security.test.ts:4`；`src/main/orchestrator/tools/document-tools.ts:113`；全 4 条见附件 | G、P |
| `gray-matter` | `^4.0.3` | `4.0.3` / `4.0.3` | MIT | skill-scanner frontmatter 解析 | `src/main/skills/skill-scanner.ts:7`；全 1 条见附件 | G、P |
| `i18next` | `^26.4.0` | `26.4.0` / `26.4.0` | MIT | 两套 renderer i18n 运行时 | `src/renderer/i18n-runtime/index.ts:12`；`src/renderer/react/i18n/index.ts:10`；全 2 条见附件 | G |
| `katex` | `^0.16.47` | `0.16.47` / `0.16.47` | MIT | StreamdownMessageContent.css 导入数学 CSS；含字体资产 | `src/renderer/react/features/chat/components/StreamdownMessageContent.css:4`；全 1 条见附件 | G、P |
| `llamaindex` | `^0.12.1` | `0.12.1` / `0.12.1` | MIT | 未找到直接 import；已查源码、构建脚本和配置，未确认调用用途。 | `package.json`；未找到直接 import | G、U |
| `lucide-react` | `^1.32.0` | `1.32.0` / `1.32.0` | ISC | 更新入口和文件树图标 | `src/renderer/react/features/chat/components/AppUpdateEntry.tsx:1`；`src/renderer/react/features/chat/components/FileTreePanel.tsx:12`；全 2 条见附件 | G |
| `marked` | `^16.4.2` | `16.4.2` / `16.4.2` | MIT | markdown-to-speech-text Markdown 转语音文本 | `src/renderer/react/features/chat/tts/markdown-to-speech-text.ts:1`；全 1 条见附件 | G、P |
| `mdast-util-to-string` | `^4.0.0` | `4.0.0` / `4.0.0` | MIT | 未找到直接 import；已查源码、构建脚本和配置，未确认调用用途。 | `package.json`；未找到直接 import | G、U |
| `music-metadata` | `^11.15.0` | `11.15.0` / `11.15.0` | MIT | 未找到直接 import；已查源码、构建脚本和配置，未确认调用用途。 feishu/audio-duration.ts 仅有避免引入本包的注释。 | `package.json`；未找到直接 import | G、U、P |
| `nodemailer` | `9.1.1` | `9.1.1` / `9.1.1` | MIT-0 | email-tools 发信 | `src/main/orchestrator/tools/email-tools.ts:12`；全 1 条见附件 | G、E |
| `openai` | `7.5.0` | `7.5.0` / `7.5.0` | Apache-2.0 | Responses 与 sdk-stream 供应商适配 | `src/main/orchestrator/vendors/responses-adapter.ts:20`；`src/main/orchestrator/vendors/sdk-stream/runtime.ts:2`；全 2 条见附件 | G、E |
| `package-manager-detector` | `^1.8.0` | `1.8.0` / `1.8.0` | MIT | workspace-build-command 检测包管理器 | `src/main/orchestrator/workspace-build-command.ts:3`；全 1 条见附件 | G |
| `pdfkit` | `^0.19.1` | `0.19.1` / `0.19.1` | MIT | document-tools PDF 生成 | `src/main/orchestrator/tools/document-tools.ts:512`；全 1 条见附件 | G、P |
| `pixi-live2d-display` | `0.5.0-beta` | `0.5.0-beta` / `v0.5.0-beta` | MIT | Live2D 角色管理、动作及表情类型/运行时 | `src/renderer/live2d/action-controller.ts:1`；`src/renderer/live2d/blink.ts:1`；全 12 条见附件 | G、N、V |
| `pixi.js` | `^7.3.0` | `7.4.3` / `7.4.3` | MIT | Live2D manager 的 Pixi 渲染 | `src/renderer/live2d/manager.ts:1`；全 1 条见附件 | G |
| `playwright` | `^1.63.0` | `1.63.0` / `1.63.0` | Apache-2.0 | scripts/perf/chat-renderer-baseline.mjs 性能基线浏览器控制；未找到业务源码直接 import | `scripts/perf/chat-renderer-baseline.mjs:20`；全 1 条见附件 | G、E |
| `qr-image` | `^3.2.0` | `3.2.0` / `3.2.0` | MIT | 微信 qr.ts 生成二维码 | `src/main/channels/adapters/wechat/qr.ts:7`；全 1 条见附件 | G |
| `qrcode` | `^1.5.4` | `1.5.4` / `1.5.4` | MIT | 未找到直接 import；已查源码、构建脚本和配置，未确认调用用途。 qrcode 命中为接口字段/变量；二维码实际使用 qr-image，不能把字段命中当包引用。 | `package.json`；未找到直接 import | G、U |
| `react` | `^19.2.8` | `19.3.0` / `19.3.0` | MIT | renderer React 组件与 hooks | `src/renderer/i18n-runtime/index.ts:13`；`src/renderer/react-perf/main.tsx:8`；全 96 条见附件 | G |
| `react-dom` | `^19.3.0` | `19.3.0` / `19.3.0` | MIT | renderer 与 react-perf 的 client 入口 | `src/renderer/react-perf/main.tsx:9`；`src/renderer/react/components/feedback/FeedbackProvider.test.ts:5`；全 28 条见附件 | G |
| `react-resizable-panels` | `^4.12.4` | `4.12.4` / `4.12.4` | MIT | ChatPage 可调整布局 | `src/renderer/react/features/chat/pages/ChatPage.tsx:4`；全 1 条见附件 | G |
| `remark-parse` | `^11.0.0` | `11.0.0` / `11.0.0` | MIT | 未找到直接 import；已查源码、构建脚本和配置，未确认调用用途。 | `package.json`；未找到直接 import | G、U |
| `rxjs` | `^7.8.1` | `7.8.1` / `7.8.1` | Apache-2.0 | AG-UI bridge 和 Agent 可观察流 | `src/main/agui-bridge.test.ts:5`；`src/main/agui-bridge.ts:15`；全 5 条见附件 | G |
| `shiki` | `^4.3.1` | `4.3.1` / `4.3.1` | MIT | FileTreePanel 语法高亮 | `src/renderer/react/features/chat/components/FileTreePanel.tsx:13`；全 1 条见附件 | G、P |
| `silk-wasm` | `^3.7.1` | `3.7.1` / `3.7.1` | MIT | 微信语音编码/适配 | `src/main/channels/adapters/wechat/ilink-bot-adapter.ts:14`；`src/main/channels/adapters/wechat/wechat-voice-encoding.test.ts:1`；全 3 条见附件 | G、N |
| `simple-git` | `^3.36.0` | `3.36.0` / `3.36.0` | MIT | git-service 操作 Git | `src/main/code-git/git-service.ts:2`；全 1 条见附件 | G、E、L |
| `streamdown` | `^2.6.0` | `2.6.0` / `2.6.0` | Apache-2.0 | 聊天 Markdown 渲染及 CSS | `src/renderer/react/features/chat/components/StreamdownMessageContent.tsx:8`；全 1 条见附件 | G、P |
| `turndown` | `^7.2.4` | `7.2.4` / `7.2.4` | MIT | fetch-url-tool HTML 转 Markdown | `src/main/orchestrator/tools/builtin-tools/fetch-url-tool.ts:13`；全 1 条见附件 | G、P |
| `unified` | `^11.0.5` | `11.0.5` / `11.0.5` | MIT | Streamdown 文件链接插件及处理器类型 | `src/renderer/react/features/chat/components/StreamdownMessageContent.tsx:9`；`src/renderer/react/features/chat/components/streamdown-file-link.ts:1`；全 2 条见附件 | G、P |
| `vscode-icons-js` | `^11.6.1` | `11.6.1` / `11.6.1` | MIT | 未找到直接 import；已查源码、构建脚本和配置，未确认调用用途。 文件图标源码直接引用 assets/icons/vscode/ 下 SVG，不能视作调用本包。 | `package.json`；未找到直接 import | G、U |
| `vscode-jsonrpc` | `^9.0.1` | `9.0.1` / `9.0.1` | MIT | LSP 客户端 JSON-RPC | `src/main/lsp/client.test.ts:6`；`src/main/lsp/client.ts:8`；全 2 条见附件 | G |
| `vscode-languageserver-types` | `^3.18.0` | `3.18.0` / `3.18.0` | MIT | LSP 客户端和类型契约 | `src/main/lsp/client.ts:9`；`src/main/lsp/types.ts:1`；全 2 条见附件 | G |
| `wink-bm25-text-search` | `^3.1.2` | `3.1.2` / `3.1.2` | MIT | 未找到直接 import；已查源码、构建脚本和配置，未确认调用用途。 | `package.json`；未找到直接 import | G、U |
| `ws` | `^8.21.0` | `8.21.0` / `8.21.0` | MIT | ASR 与 QQ/QQBot WebSocket | `src/main/asr/aliyun-asr-engine.ts:9`；`src/main/channels/adapters/qq/napcat-adapter.integration.test.ts:2`；全 8 条见附件 | G、E |
| `yaml` | `^2.9.0` | `2.9.0` / `2.9.0` | ISC | 学习进度 frontmatter 和安装器元数据解析 | `scripts/verify/installer-artifacts.mjs:15`；`src/main/learn/progress/learn-progress-service.ts:15`；全 2 条见附件 | G、P |
| `yauzl` | `3.4.0` | `3.4.0` / `3.4.0` | MIT | zip-extraction.ts fromRandomAccessReaderPromise / RandomAccessReader / Entry / ZipFile；第三方解析器供项目落盘适配层调用 | `src/shared/zip-extraction.ts:6`；全 1 条见附件 | G、Z |

### 直接开发依赖（27）

| 包 | manifest 声明 | 锁版本 / 安装 metadata | 许可摘要 | 用途 / 未知 | 引用入口（完整集见附件） | 风险/缺口 |
|---|---|---|---|---|---|---|
| `@tailwindcss/vite` | `^4.3.3` | `4.3.3` / `4.3.3` | MIT | vite.config.ts 构建插件 | `vite.config.ts:7`；全 1 条见附件 | G、B |
| `@types/cross-spawn` | `^6.0.6` | `6.0.6` / `6.0.6` | MIT | 已安装 metadata：TypeScript definitions for cross-spawn。未找到直接 import；编译器只读枚举确认纳入，见 typeInclusion。 | `node_modules/@types/cross-spawn/package.json`；typeInclusion | G、T、B |
| `@types/diff` | `^7.0.2` | `7.0.2` / `7.0.2` | MIT | 已安装 metadata：TypeScript definitions for diff。未找到直接 import；编译器只读枚举确认纳入，见 typeInclusion。 | `node_modules/@types/diff/package.json`；typeInclusion | G、T、B |
| `@types/dompurify` | `^3.0.5` | `3.0.5` / `3.0.5` | MIT | 已安装 metadata：TypeScript definitions for dompurify。未找到直接 import；编译器只读枚举确认纳入，见 typeInclusion。 | `node_modules/@types/dompurify/package.json`；typeInclusion | G、T、B |
| `@types/js-yaml` | `^4.0.9` | `4.0.9` / `4.0.9` | MIT | 已安装 metadata：TypeScript definitions for js-yaml。未找到直接 import；编译器只读枚举确认纳入，见 typeInclusion。 | `node_modules/@types/js-yaml/package.json`；typeInclusion | G、T、B |
| `@types/nodemailer` | `^8.0.1` | `8.0.1` / `8.0.1` | MIT | 已安装 metadata：TypeScript definitions for nodemailer。未找到直接 import；编译器只读枚举确认纳入，见 typeInclusion。 | `node_modules/@types/nodemailer/package.json`；typeInclusion | G、T、B |
| `@types/pdfkit` | `^0.17.6` | `0.17.6` / `0.17.6` | MIT | 已安装 metadata：TypeScript definitions for pdfkit。未找到直接 import；编译器只读枚举确认纳入，见 typeInclusion。 | `node_modules/@types/pdfkit/package.json`；typeInclusion | G、T、B |
| `@types/qr-image` | `^3.2.11` | `3.2.11` / `3.2.11` | MIT | 已安装 metadata：TypeScript definitions for qr-image。未找到直接 import；编译器只读枚举确认纳入，见 typeInclusion。 | `node_modules/@types/qr-image/package.json`；typeInclusion | G、T、B |
| `@types/react` | `^19.2.17` | `19.3.0` / `19.3.0` | MIT | 已安装 metadata：TypeScript definitions for react。未找到直接 import；编译器只读枚举确认纳入，见 typeInclusion。 | `node_modules/@types/react/package.json`；typeInclusion | G、T、B |
| `@types/react-dom` | `^19.3.0` | `19.3.0` / `19.3.0` | MIT | 已安装 metadata：TypeScript definitions for react-dom。未找到直接 import；编译器只读枚举确认纳入，见 typeInclusion。 | `node_modules/@types/react-dom/package.json`；typeInclusion | G、T、B |
| `@types/turndown` | `^5.0.6` | `5.0.6` / `5.0.6` | MIT | 已安装 metadata：TypeScript definitions for turndown。未找到直接 import；编译器只读枚举确认纳入，见 typeInclusion。 | `node_modules/@types/turndown/package.json`；typeInclusion | G、T、B |
| `@types/ws` | `^8.18.1` | `8.18.1` / `8.18.1` | MIT | 已安装 metadata：TypeScript definitions for ws。未找到直接 import；编译器只读枚举确认纳入，见 typeInclusion。 | `node_modules/@types/ws/package.json`；typeInclusion | G、T、B |
| `@types/yauzl` | `3.4.0` | `3.4.0` / `3.4.0` | MIT | 已安装 metadata：TypeScript definitions for yauzl。未找到直接 import；编译器只读枚举确认纳入，见 typeInclusion。 | `node_modules/@types/yauzl/package.json`；typeInclusion | G、T、B |
| `@vitejs/plugin-react` | `^4.7.0` | `4.7.0` / `4.7.0` | MIT | vite.config.ts React 插件 | `vite.config.ts:4`；全 1 条见附件 | G、B |
| `@vitest/coverage-v8` | `^4.1.11` | `4.1.11` / `4.1.11` | MIT | 未找到直接 import；已查源码、构建脚本和配置，未确认调用用途。 | `package.json`；未找到直接 import | G、U、B |
| `concurrently` | `9.2.3` | `9.2.3` / `9.2.3` | MIT | package.json scripts.dev 并行启动 Vite / Electron | `package.json scripts.dev`；全 1 条见附件 | G、B |
| `cross-env` | `^7.0.3` | `7.0.3` / `7.0.3` | MIT | scripts.dev 设置 VITE_DEV=1 | `package.json scripts.dev`；全 1 条见附件 | G、B |
| `electron` | `^43.0.0` | `43.1.0` / `43.1.0` | MIT | 主进程、preload、示例与开发启动；声明为 dev 不代表产品不使用 Electron | `examples/system-status/index.cjs:288`；`scripts/verify/music-smoke.mjs:12`；全 113 条见附件 | G、B、N |
| `electron-builder` | `^26.15.3` | `26.15.3` / `26.15.3` | MIT | package:win:dir 与 Windows CI 打包 | `package.json scripts.package:win:dir`；全 1 条见附件 | G、B |
| `esbuild` | `^0.28.2` | `0.28.2` / `0.28.2` | MIT | CLI 与 plugin-sdk 打包 | `scripts/build/cli.mjs:9`；`scripts/plugin-sdk/build-sdk.mjs:9`；全 2 条见附件 | G、B |
| `jsdom` | `^30.1.0` | `30.1.0` / `30.1.0` | MIT | renderer 测试 import 和 @vitest-environment 指令 | `src/renderer/react/features/chat/components/ChatMessageList.last-turn.test.ts:7`；`src/renderer/react/features/chat/components/RightInspector.visual.test.ts:3`；全 5 条见附件 | G、B |
| `js-yaml` | `5.2.2` | `5.2.2` / `5.2.2` | MIT | update-packaging-config.test.ts 解析打包配置 | `src/main/updater/update-packaging-config.test.ts:3`；全 1 条见附件 | G、B、P |
| `tailwindcss` | `^4.3.3` | `4.3.3` / `4.3.3` | MIT | 聊天 CSS 导入 theme.css / utilities.css | `src/renderer/react/features/chat/components/StreamdownMessageContent.css:1`；`src/renderer/react/features/chat/components/StreamdownMessageContent.css:2`；全 2 条见附件 | G、B |
| `ts-json-schema-generator` | `^1.5.1` | `1.5.1` / `1.5.1` | MIT | generate-schema.mjs 生成插件 schema | `scripts/plugin-sdk/generate-schema.mjs:6`；全 1 条见附件 | G、B |
| `typescript` | `^5.6.0` | `5.9.3` / `5.9.3` | Apache-2.0 | tsc 构建/检查、IPC/对话扫描器及 verification-runner；扫描器调用者为测试 | `src/main/application/ipc-contract-scanner.ts:3`；`src/main/logger-commonjs.test.ts:4`；全 14 条见附件 | G、B |
| `vite` | `7.3.6` | `7.3.6` / `7.3.6` | MIT | renderer 构建/dev 与性能基线构建 | `vite.config.ts:1`；`package.json scripts.build:renderer`；全 3 条见附件 | G、B |
| `vitest` | `^4.1.9` | `4.1.11` / `4.1.11` | MIT | 测试文件、CI runner 和 verification-runner | `src/shared/zip-extraction.test.ts:6`；`packages/plugin-sdk/src/testing/index.test.ts:1`；全 522 条见附件 | G、B |

### 不能抹平的差异

- @ag-ui/client、@ag-ui/core：lock/metadata 无 license 字段，各自实际 LICENSE 为 MIT、Copyright (c) 2025。字段缺失不等于无许可。
- simple-git：metadata=MIT；自身安装目录递归文件名检索（不进入嵌套 node_modules）未发现独立 LICENSE/COPYING/NOTICE/COPYRIGHT 文件。完整许可文本及通知保留待补证，不据此断言侵权。
- @lancedb/lancedb：Apache-2.0；实际有 license_header.txt、NODEJS_THIRD_PARTY_LICENSES.md、RUST_THIRD_PARTY_LICENSES.html；不能漏记内嵌 Rust/Node 通知，也不能把 SPDX header 当 Apache 全文。
- pixi-live2d-display：锁 `0.5.0-beta`，安装 metadata `v0.5.0-beta`，原值保留；不自行归一化或断言篡改。本次 npm ls --depth=0 exit 0。
- 未确认直接调用用途完整集合：`@ant-design/cssinjs`、`@lancedb/lancedb`、`llamaindex`、`mdast-util-to-string`、`music-metadata`、`qrcode`、`remark-parse`、`vscode-icons-js`、`wink-bm25-text-search`、`@vitest/coverage-v8`。已查源码/构建脚本，不能凭包名编用途，也不能据此直接删除。传递/peer 关联在 npm explain 附件。
- qrcode 命中为字段/变量，微信二维码实际 import qr-image；vscode-icons-js 没有直接 import，本地图标通过 assets/icons/vscode SVG 导入；music-metadata 只有避免引入它的注释。这些文本命中不构成包用途。
- playwright 直接 import 在性能脚本；@playwright/mcp 定位自己 CLI。不能自动把性能脚本的直接声明当成生产 MCP 依赖要求。
- @types/* 的 metadata 和 createProgram/getSourceFiles 只读枚举证明其类型文件被纳入；本轮 Main、Preload、Renderer 类型检查均已通过，见[集中验证](2026-09-26-documentation-dependency-closeout.md#最终检查补记)。类型包是否冗余或业务必需不能仅由纳入清单或类型检查通过推导。
- allowScripts 只保存现值，没有验证其强制执行；其 esbuild@0.21.5 与直接锁 esbuild@0.28.2 不同，不能据白名单存在称全部安装脚本受控。

以上差异描述初次快照。接续已修正 allowScripts 的精确版本并验证冻结安装；原工作目录的 node_modules 保持不变。最终版本、安装位置与脚本约束见本文末节，不将初次 installed 字段冒充最终隔离安装。

## 安全 overrides 与完整传递链

package.json 共 21 个顶层规则，包含父包限定 sharp/uuid。以下是本地覆盖结果，不重新作公告安全版本裁定。transitive.json 保存所有安装位置、直接父边、root prod/dev 祖先及 rawSpec，链方向为目标包 → 祖先，peer 循环/缺 location 如实终止。

| 精确选择器 | 值 | 当前直接父包（包括共享/peer） | 位置及完整链 |
|---|---|---|---|
| `@hono/node-server` | `1.19.15` | `@modelcontextprotocol/sdk@1.29.0` | 1 个安装路径；完整祖先链见 transitive.json / @hono/node-server |
| `@xmldom/xmldom` | `0.8.15` | `plist@3.1.0` | 1 个安装路径；完整祖先链见 transitive.json / @xmldom/xmldom |
| `axios` | `1.18.0` | `@larksuiteoapi/node-sdk@1.71.1` | 1 个安装路径；完整祖先链见 transitive.json / axios |
| `brace-expansion@^1` | `1.1.18` | `minimatch@3.1.5` | 1 个安装路径；完整祖先链见 transitive.json / brace-expansion |
| `brace-expansion@^2` | `2.1.4` | `minimatch@9.0.9`；`minimatch@5.1.9` | 4 个安装路径；完整祖先链见 transitive.json / brace-expansion |
| `brace-expansion@^5` | `5.0.9` | `minimatch@10.2.5` | 1 个安装路径；完整祖先链见 transitive.json / brace-expansion |
| `fast-uri` | `3.1.6` | `ajv@8.20.0` | 1 个安装路径；完整祖先链见 transitive.json / fast-uri |
| `hono` | `4.13.5` | `@hono/node-server@1.19.15`；`@llamaindex/workflow-core@1.3.3`；`@modelcontextprotocol/sdk@1.29.0` | 1 个安装路径；完整祖先链见 transitive.json / hono |
| `ip-address` | `10.3.1` | `express-rate-limit@8.5.2` | 1 个安装路径；完整祖先链见 transitive.json / ip-address |
| `js-yaml@^3` | `3.15.2` | `gray-matter@4.0.3` | 1 个安装路径；完整祖先链见 transitive.json / js-yaml |
| `js-yaml@^4` | `4.3.2` | `app-builder-lib@26.15.3`；`builder-util@26.15.3`；`dmg-builder@26.15.3`；`electron-updater@6.8.9` | 4 个安装路径；完整祖先链见 transitive.json / js-yaml |
| `mermaid` | `11.16.1` | `@ant-design/x@2.9.0` | 1 个安装路径；完整祖先链见 transitive.json / mermaid |
| `nanoid@^3` | `3.3.18` | `postcss@8.5.23` | 1 个安装路径；完整祖先链见 transitive.json / nanoid |
| `nanoid@^5` | `5.1.16` | `docx@9.7.1` | 1 个安装路径；完整祖先链见 transitive.json / nanoid |
| `postcss` | `8.5.23` | `vite@7.3.6` | 1 个安装路径；完整祖先链见 transitive.json / postcss |
| `protobufjs` | `7.6.5` | `@larksuiteoapi/node-sdk@1.71.1`；`onnx-proto@4.0.4` | 1 个安装路径；完整祖先链见 transitive.json / protobufjs |
| `qs` | `6.16.0` | `@larksuiteoapi/node-sdk@1.71.1`；`body-parser@2.3.0`；`express@5.2.1`；`url@0.11.4` | 1 个安装路径；完整祖先链见 transitive.json / qs |
| `shell-quote` | `1.9.0` | `concurrently@9.2.3` | 1 个安装路径；完整祖先链见 transitive.json / shell-quote |
| `undici` | `7.29.0` | `@electron/get@5.0.0`；`node-gyp@12.4.0` | 1 个安装路径；完整祖先链见 transitive.json / undici |
| `@xenova/transformers → sharp` | `0.35.4` | `@xenova/transformers@2.17.2` | 1 个安装路径；完整祖先链见 transitive.json / sharp |
| `exceljs → uuid` | `11.1.1` | `@ag-ui/client@0.0.57`；`exceljs@4.4.0`；`mermaid@11.16.1` | 1 个安装路径；完整祖先链见 transitive.json / uuid |

- @modelcontextprotocol/sdk → @hono/node-server/hono 等运行时链与 electron-builder → app-builder-lib 等构建链不同，不把所有链归为同一业务攻击路径。
- @xenova/transformers → sharp 从父请求 ^0.32.0 覆盖至 0.35.4；exceljs → uuid 从 ^8.3.0 至 11.1.1；onnx-proto → protobufjs 从 ^6.8.8 至 7.6.5；node-gyp → undici 从 ^6.25.0 至 7.29.0。树中存在不等于 API/原生加载兼容已验收。
- js-yaml 同时有直接 dev 5.2.2、gray-matter 下 3.15.2、打包/更新链 4.3.2，不能只看根版本。
- undici 根 7.29.0 标为 overridden；`node_modules/jsdom/node_modules/undici` 锁与安装均为 **8.10.2**，npm explain 标 overridden=false，未给该位置 dependents。jsdom metadata 实际请求 ^8.10.2。不能宣称全树统一 7.29.0，也不臆测 npm 形成该布局的原因；冻结安装及全树 override 一致性待验证。
- uuid@11.1.1 也被 @ag-ui/client、mermaid 共用，不是每个父边均由 exceljs 定向 override 产生。
- 附件中的 `<root>` 只是“npm 原输出省略 location”的标记，**不等于项目根**。真正项目根用绝对路径；完整 edges 保留，不补造缺失边。

## 仓库及随包第三方代码/资源

distribution.json 逐文件列路径、字节数、SHA-256、Git 跟踪状态。资源清单是检查范围，不表示每个文件均为第三方或均进入最终制品；分发选择由 electron-builder.yml 等实际规则说明。

| 类别 | 实际证据与分发 | 许可/未知/验证缺口 |
|---|---|---|
| 上游 Cyrene 代码 | 根 LICENSE / THIRD_PARTY_NOTICES.md；packages/plugin-sdk/LICENSE；extraFiles | MIT 保留 Playa 与 Firefly 署名；改编维护不能泛称原生自主实现。SDK 的独立 package.json 声明 ajv ^8.17.1，见附件，不增加根直接依赖计数；SDK 发布产物未验证。 |
| Live2D Cubism Core | src/renderer/public/live2dcubismcore.min.js:1；src/renderer/index.html:25；public 复制路径 | 文件头为 Live2D Inc. / Redistributable Code / 专有许可 URL。独立于 pixi-live2d-display MIT；本次未核验协议适用范围和随包通知。 |
| Firefly 模型与人物资源 | public/models/firefly/、public/avatars/、src/renderer/assets/ | MODEL_LICENSE.md 的 Cyrene 授权不覆盖 Firefly；书面条款、署名、范围及相关肖像权利缺口按本地通知记录。 |
| 图标/历史图像 | assets/icons/vscode/ 42 个 SVG；assets/icon-presets/firefly.png、assets/tray-icon.ico、build/installer/installer-sidebar.bmp；public/icons/feeling/status/context-usage 等 | vscodeFileIcon.ts 注释称来源 vscode-icons/vscode-icons、MIT，并直接 import SVG；注释不等于独立许可正文，assets 未见配套 LICENSE。其他图片/品牌标志不能套用源码 MIT。历史 sidebar 当前未被打包配置选为 sidebar，但仍在仓库。 |
| 21 张贴纸 | public/stickers/ 全路径；THIRD_PARTY_NOTICES.md 来源记录 | 所有者提供是来源说明，不证明原创或再分发许可。 |
| KaTeX 字体 | StreamdownMessageContent.css:4；安装目录 fonts 下 60 文件；extraFiles 复制 LICENSE 至 licenses/KaTeX-LICENSE | 本地 MIT / Khan Academy 等署名已查；未检查最终安装包。 |
| Electron / Chromium | node_modules/electron/dist 的 LICENSE、LICENSES.chromium.html 等见直接依赖许可索引；electronDist | package MIT 不能覆盖内嵌第三方全部通知；制品验收缺失。 |
| MinGit | vendor/mingit-manifest.json 的 2.55.0.3、URL/hash；prepare-mingit.mjs；resources/mingit 被 extraResources 选择 | THIRD_PARTY_NOTICES.md 记 GPL-2.0；本地 resources/mingit 不存在，归档内许可/源码提供信息未验证；未下载。 |
| mpv | vendor/mpv-manifest.json 的 20260813、URL/镜像/hash；prepare-mpv.mjs | 当前配置未选择 resources/bin/mpv，本地无该二进制；manifest 无 license，不能猜该构建许可。 |
| srt-win | asarUnpack 与 sandbox-exec.ts 引用 vendor/srt-win | vendor 实物只有两 manifest 与 skills ZIP/manifest，没有该目录文件；配置不是二进制存在证明。 |
| Rust 截图 helper | resources/bin/firefly-screenshot.exe 存在且未跟踪；native/firefly-screenshot/Cargo.toml、Cargo.lock | 附件 55 个锁记录。serde/serde_json/thiserror/uuid/windows/windows-numerics、dev serial_test 声明已读；未读外部 Cargo 缓存/未编译，许可及最终二进制成分未完整核验，不能称全为自主实现。 |
| 本地模型 | models/ 只列 Git 跟踪 .gitignore/.gitkeep，打包排除 models/**/* | 不读取用户下载模型/权重，不能声称其许可已审。 |
| 第三方 skills 快照 | vendor/firefly-skills/skills-snapshot.zip / manifest，经 extraResources 分发 | 归档内文档、代码、脚本、模板与许可都是分发对象，逐项见下一节。 |

**文档/实物不一致：** public/models/firefly/README.md 声称模型二进制不在公共仓库分发，但当前 git ls-files 和文件系统实际包含 Moc_0.moc3、Textures_0_0.png、模型/表情/动作 JSON 等 **22 文件**。moc3=363,712 字节，纹理=5,201,550 字节。README 不能抵消实物及 public 构建复制路径。这里只描述本地工作树，不断言远端发布状态；授权和文档一致性仍需核对。

### 维护文档与随包文档

- docs/、README、DEVELOPMENT、scripts/README、resources/README 是仓库维护说明；显式 electron-builder 选择未把 docs 整目录打包。附件 repositoryDocumentIndex 保留路径与哈希。
- 根 LICENSE、MODEL_LICENSE.md、THIRD_PARTY_NOTICES.md 是显式随包通知。
- skills/ 由项目维护并经 extraFiles 复制；维护位置不能推导独立原创。
- ZIP 内 SKILL.md、references、README、LICENSE、脚本和模板属于 **随包第三方技能内容**，即使是文档也不能当仓库内部说明忽略。build-skills-snapshot.mjs 明确它们是定制裁剪第三方技能；snapshot-install.ts 是安装入口。
- 本次只读归档流，不解压到用户目录、不执行归档代码。不能以“原生自主实现”概括仓库及其分发内容。

## skills-snapshot.zip 全清单与许可索引（初次快照）

- 实际 SHA-256：`98005bbb2126c231679d60373f1b50f9219b562c5f33fa98de0a130477c32b27`；813602 字节。
- 初次 manifest skills 数=39；实际 39 顶层目录 / 231 条目。初次每条目路径、未压缩/压缩大小、哈希和说明标题/来源/许可记录见 historicalZipEvidence.entries/documentIndex/skillGroups。当前值见上方修订。
- 独立许可文件只有四路径：`docx/LICENSE`、`skill-creator/LICENSE`、`skill-creator/LICENSE.txt`、`skill-creator/plugins/skill-creator/LICENSE`。docx/LICENSE 为 MIT、Copyright (c) 2026 MiniMaxAI；另三份为 Apache-2.0 文本。正文已嵌入附件，不能跨技能扩张适用范围。
- office-design/pdf/pptx-generator/xlsx 的顶层 SKILL.md 声明 MIT，但各目录未发现独立 LICENSE 正文；声明与授权链分开记录。无字段或正文者记未知，不从 as-/ecc-/sp- 前缀猜作者、来源版本或许可证。
- manifest 的 sourceSha256 是来源记录，本次未取得对应源归档核验；upstream commit、作者、裁剪说明及授权范围仍需补证。ZIP 完整/哈希一致不等于许可完整。

| ZIP 实际顶层目录 | 条目数 | 说明入口（归档内） | 许可现状 |
|---|---:|---|---|
| `as-api-and-interface-design` | 1 | `as-api-and-interface-design/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `as-code-review-and-quality` | 1 | `as-code-review-and-quality/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `as-code-simplification` | 1 | `as-code-simplification/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `as-context-engineering` | 1 | `as-context-engineering/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `as-debugging-and-error-recovery` | 1 | `as-debugging-and-error-recovery/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `as-doubt-driven-development` | 1 | `as-doubt-driven-development/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `as-frontend-ui-engineering` | 1 | `as-frontend-ui-engineering/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `as-git-workflow-and-versioning` | 1 | `as-git-workflow-and-versioning/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `as-incremental-implementation` | 1 | `as-incremental-implementation/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `as-planning-and-task-breakdown` | 1 | `as-planning-and-task-breakdown/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `as-security-and-hardening` | 1 | `as-security-and-hardening/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `as-source-driven-development` | 1 | `as-source-driven-development/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `as-spec-driven-development` | 1 | `as-spec-driven-development/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `as-using-agent-skills` | 1 | `as-using-agent-skills/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `docx` | 86 | `docx/SKILL.md`（完整 frontmatter 见附件） | license: MIT；`docx/LICENSE` |
| `ecc-agent-introspection-debugging` | 1 | `ecc-agent-introspection-debugging/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `ecc-ai-regression-testing` | 1 | `ecc-ai-regression-testing/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `ecc-code-tour` | 1 | `ecc-code-tour/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `ecc-codebase-onboarding` | 1 | `ecc-codebase-onboarding/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `ecc-coding-standards` | 1 | `ecc-coding-standards/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `ecc-plan-canvas` | 1 | `ecc-plan-canvas/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `ecc-security-review` | 1 | `ecc-security-review/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `ecc-tdd-workflow` | 1 | `ecc-tdd-workflow/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `office-design` | 9 | `office-design/SKILL.md`（完整 frontmatter 见附件） | license: MIT；只有 frontmatter 声明；未发现该目录独立 LICENSE 正文 |
| `pdf` | 17 | `pdf/SKILL.md`（完整 frontmatter 见附件） | license: MIT；只有 frontmatter 声明；未发现该目录独立 LICENSE 正文 |
| `pptx-generator` | 8 | `pptx-generator/SKILL.md`（完整 frontmatter 见附件） | license: MIT；只有 frontmatter 声明；未发现该目录独立 LICENSE 正文 |
| `self-improving-agent` | 16 | `self-improving-agent/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `skill-creator` | 24 | `skill-creator/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；`skill-creator/LICENSE`、`skill-creator/LICENSE.txt`、`skill-creator/plugins/skill-creator/LICENSE` |
| `sp-brainstorming` | 1 | `sp-brainstorming/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `sp-dispatching-parallel-agents` | 1 | `sp-dispatching-parallel-agents/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `sp-requesting-code-review` | 1 | `sp-requesting-code-review/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `sp-subagent-driven-development` | 1 | `sp-subagent-driven-development/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `sp-systematic-debugging` | 1 | `sp-systematic-debugging/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `sp-using-git-worktrees` | 1 | `sp-using-git-worktrees/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `sp-using-superpowers` | 5 | `sp-using-superpowers/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `sp-verification-before-completion` | 1 | `sp-verification-before-completion/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `sp-writing-plans` | 1 | `sp-writing-plans/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `write-expense-report` | 2 | `write-expense-report/SKILL.md`（完整 frontmatter 见附件） | 无顶层 license 字段；未发现独立许可正文或顶层 license 声明；授权未知 |
| `xlsx` | 34 | `xlsx/SKILL.md`（完整 frontmatter 见附件） | license: MIT；只有 frontmatter 声明；未发现该目录独立 LICENSE 正文 |

## 本次验证与更新位置

本次已执行/读取：声明/lock/安装 metadata 全清单；npm ls --depth=0 exit 0；npm explain（旧 extract-zip 不存在为 exit 1，单独记录）；新 ZIP 包全树；TypeScript 源文件只读枚举；归档流 231 条及哈希；本轮 audit 原文。本轮依赖安装与 prod/all audit 已完成，audit 均 exit 0；本次记录刷新未重跑 install/audit、构建、业务测试、应用、下载器、技能安装或迁移。

交付检查范围为 JSON 解析、完整 prod/dev 键集、锁版本与输入哈希、ZIP manifest/顶层集合、真实引用路径/行号、附件链接、输出范围。本轮 Main、Preload、Renderer 类型检查均通过；7 文件 71 项测试（含 33 项解压测试）通过、0 跳过，MinGit node:test 3 项通过；一次完整构建及最终 Main 构建通过，编译后 CJS 解压真实快照取得 39 个顶层条目。详见[主汇总与集中验证](2026-09-26-documentation-dependency-closeout.md#最终检查补记)。未运行完整测试套件；实际平台 native 加载、制品许可保留、素材授权及未确认用途仍是缺口。其余快照保留各自采集时间。

后续在 **本文件基线、逐包表、overrides 表、ZIP 替换段** 更新，同时刷新：
- direct.json：package/lock 哈希、direct、verifiedReferences、licenseEvidence、auditEvidence；保留 previousBaseline。
- transitive.json：锁路径和 npm explain 图，尤其 yauzl、Electron 内部解压器、sharp、uuid、undici 多版本。
- distribution.json：资源实物、打包选择、ZIP 条目/许可/说明与 manifest。

当前按安装完成的新锁记录 yauzl 3.4.0，不预填 extract-zip 后续版本。后续修改源码/授权文档后，应刷新对应哈希和行号，不能让旧索引代表新内容。

交付校验（2026-09-26T11:25:19.437Z）：直接清单 61 prod / 27 dev、1327 个完整锁记录、925 条确认引用、194 个资源记录、39 组 / 231 个 ZIP 条目均通过上述一致性检查；无失效引用、哈希漂移、缺失附件或行尾空白。该结果只覆盖治理记录完整性。

## 接续后的实际依赖与安装验证

- 最终声明为 61 prod / 28 dev（89 个直接依赖）、1327 个锁记录（含根）、23 个顶层 override。三个 JSON 的 `closeoutRevision` 保存当前声明、输入哈希、变更包的锁记录及隔离安装证据；此前顶层字段保留原采集时间，不冒充最新事实。
- package.json SHA-256：`bc848e7f2ed00b6e1a098b087a0acb634c204e9c08303ebbac8ed9e714130d7e`；package-lock.json SHA-256：`ee0b9282f8275972fceb25d5d01d32b229150888037504e754e900105947fb50`。
- 明确声明开发依赖 `jszip@3.10.1`，用于 `src/shared/zip-extraction.test.ts:5`、`src/main/skills/snapshot-zip-security.test.ts:4`、`scripts/packaging/prepare-mingit.test.mjs:4` 生成真实测试归档。此前能加载是 docx/exceljs 传递依赖提升到根，不是测试声明完整。许可 `(MIT OR GPL-3.0-or-later)`，实际 `LICENSE.markdown` 提供 MIT 全文及原作者署名；未修改其源码或许可。
- 首次隔离 `npm ci` 退出 0，但 `npm ls --all` 退出 1：workflow-core 的 RxJS peer `^7.8.2` 得到了根 7.8.1；jsdom 请求 `undici ^8.10.2`，与全局 override 7.29.0 的计算结果冲突。未把安装成功当作依赖图有效。
- 根 RxJS 从 7.8.1 更新到 7.8.2（同一补丁系列）。单独升级会让 AG-UI 固定 7.8.1 产生第二份 Observable/Subscriber 类型，隔离 Main 编译实际报 TS2416；因此为 `@ag-ui/client` 设置 `rxjs: "$rxjs"`，共用根版本。最终锁只保留根 `node_modules/rxjs@7.8.2`，AG-UI 路径及类对象相等的回归通过，没有类型断言绕过或 Agent 改造。变更依据为已安装 CHANGELOG.md 所列的 [RxJS 7.8.1 → 7.8.2 官方差异](https://github.com/reactivex/rxjs/compare/7.8.1...7.8.2) 及真实编译错误。
- 父包限定 `jsdom → undici 8.10.2` 保留其原锁版本，其他构建链仍为 7.29.0；不是降级 jsdom 或全树大版本升级。最终冻结安装后 `npm ls --all --offline --ignore-scripts` 退出 0。
- 已读取 `esbuild@0.28.2/install.js`（平台二进制定位、版本检查及下载后哈希校验）和 `electron-winstaller@5.4.0/script/select-7z-arch.js`（包内宿主架构 7-Zip 文件复制）。将过时 esbuild 许可项修正到 0.28.2，明确记录 electron-winstaller 5.4.0；不修改第三方脚本。最终 `npm approve-scripts --allow-scripts-pending --json` 为空。npm 11.17.0 该字段实际只警告未记录项；本轮没有改 CI 或启用新的强制策略，不能把它称为强隔离沙箱，见 [npm 官方说明](https://docs.npmjs.com/cli/v11/commands/npm-approve-scripts/)。
- 最终 prod/all audit 原始 JSON 均退出 0、各级漏洞数 0。只是公告数据库结果，不覆盖第三方归档脚本、许可、跨平台原生运行或完整应用安全。
- 归档文本为 94 篇 Markdown、41 个源码/测试文本、14 个 JSON 与 4 份许可证，共 153 项，而非此前宽泛描述的“95 篇文档”。全文流式读取、声明/链接/资源核验与各路径状态已附在 distribution.json 的 `closeoutRevision.documents`。已只读找到哈希匹配的原始 ZIP，七处缺失链接和三个正文脚本目标原包也未包含；缺少完整同版辅助输入及部分独立许可依据。未执行第三方脚本，不能称全部资料已收口，见集中报告。
- 最终隔离安装、204 项相关 Vitest、MinGit 三项 node:test、类型检查、构建、SDK 包和四个示例 Mock 验证见[集中报告](2026-09-26-documentation-dependency-closeout.md#接续逐项验收)。此前验证保留为既有证据，不拼成全量通过。

初次静态发现（历史状态，已处理）：`src/shared/zip-extraction.test.ts:5` 直接导入 jszip，当时未在根 prod/dev 声明。接续已声明精确开发依赖 3.10.1，并完成冻结安装及真实 ZIP 测试；不能继续把初次的“仅登记、未改 manifest”当作最终状态。
