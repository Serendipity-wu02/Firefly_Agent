# Firefly runtime Skills 只读审计
审计日期：2026-09-27。对象：E:/Codex/Firefly_Agent。报告及审计临时资料仅写仓库外。

## 0. 结论与验证边界
本报告完成47项逐项静态审计，不等于47项真实模型/外部程序实机通过。
当前分发基线：39项继承内容 + 8项项目内置 = 47个规范 runtime ID；默认 UI 可见46，隐藏1（firefly-original-voice）。
这是从分发输入与扫描/注册源码证明的默认注册集合；未读取真实用户 Skills、开关、availability 或用户覆盖，不能把47认定为用户当前实机数量。
39项分类：VERIFIED_UPSTREAM=19；FIREFLY_ADAPTED_UPSTREAM=16；CYRENE_DERIVED_REWRITE=2；CANDIDATE_REPLACEMENT_REVIEW=2；OBSOLETE_DELETE=0。
8项内置：FIREFLY_OWNED=8。LEGACY_ALIAS_ONLY=8，非额外注册。
正式ZIP产品级Cyrene文字残留=0；内置正文产品级残留=0。来源上的Cyrene派生并没有因此消失。
“39个已全部换成独立 upstream”：NO。office-design和write-expense-report仍是可追溯Cyrene派生；pdf/xlsx新版替代未证明能力等价。
需要后续明确处理的审计问题：P-01 effectKind执行语义/注释不一致；P-02治理材料中间态归档哈希；P-03旧ID用途并非仅设置解析。
本轮没有修改、删除、替换任何仓库文件；没有运行prepare:skills；没有操作真实用户数据、模型、服务、原项目工作树或开发插件。

## 1. 实际基线与审计方法
- 分支：chore/project-structure-finalize。
- HEAD：349753da78a49d9a9fb0e62e17c2c2c76e5296a3。
- origin fetch/push：https://github.com/Serendipity-wu02/Firefly_Agent.git。
- 已有20项工作树状态；before记录见同目录git-status-before.txt、head-before.txt、branch-before.txt。
- 使用Codex开发技能：source-driven-development、constraint-driven-development、code-review-and-quality、superpowers:verification-before-completion，以及superpowers:using-superpowers。未将Firefly运行时Skills当开发插件调用。
- ZIP通过JSZip在内存解包/逐文件读取，未落地到仓库或os.tmpdir。
- 源码、manifest、ZIP、来源索引、许可溯源、当前治理附件、注册/模式/托管更新源码相互核对。未根据README数字直接推断。
- 官方固定commit页面已只读核对；没有重新下载整个上游包。页面存在不代替文件哈希、许可范围与当前改编差异核对。

## 2. 运行清单、资源与入口
正式文件：vendor/firefly-skills/skills-snapshot.zip。
当前SHA-256：667740966cf7f06139ab4cf65bb41489b207e3ab54627c1e2d0cfc297b9a5e72；819507字节。
253个非目录文件；109个Markdown；其余也逐项读取，全部为有效UTF-8且无NUL。不是仅扫描SKILL.md。
manifest.skills是39个ID字符串，selfSkills是8个ID字符串，摘要字段为sha256。
ZIP顶层39 ID与manifest一一对应；无漏项/额外项。skills/的8个SKILL.md目录与selfSkills一一对应。
当前默认集合无“声明但不分发”或“分发但无扫描入口”项；真实用户同名覆盖可能改变加载内容，未访问真实用户目录。
src/main/skills/index.ts：initSkills → snapshot install → migrateInstalledSkillSnapshot → source scan → registry → UI过滤。
src/main/skills/skill-scanner.ts：读取frontmatter、enabled默认值、hiddenFromUi和附件元数据。
src/main/skills/skill-registry.ts：规范ID注册/getById；getEnabledForMode按enabled/availability/用户覆盖/声明模式过滤。
src/main/external-content-paths.ts：builtin/user来源发现；用户来源后加载、同名覆盖保留。
SkillMode当前为work/code/learn；Chat不在此SkillMode集合，不将Code技能臆写为Chat技能。
初始enabled默认true，真实用户配置可覆盖。hidden只过滤UI，非删除注册。
sources.json：expected_count=39；实际35 ready / 2 unresolved / 2 candidate。该状态是获取/替换路线，不是“许可完全核清”或“新版本已经启用”的同义词。

## 3. 上游与许可依据
下表固定点为来源索引中的获取版本，不默认其等于当前正文的唯一原始版本。
| Source | Repository / fixed commit | Scope / license file | License / copyright | License Git blob |
|---|---|---|---|---|
| agent-skills | [addyosmani/agent-skills@2686b620fc1fed2e8f60c704839c766b8594c6b6](https://github.com/addyosmani/agent-skills/commit/2686b620fc1fed2e8f60c704839c766b8594c6b6) | 仓库 / LICENSE | MIT；Addy Osmani ©2025 | d67778ada6b9cda6227e9130da182c13e73c8b2e |
| ecc | [affaan-m/ECC@e482e579415fde18357cafce70f177ae19fd7f03](https://github.com/affaan-m/ECC/commit/e482e579415fde18357cafce70f177ae19fd7f03) | 仓库 / LICENSE | MIT；Affaan Mustafa ©2026 | b832b6f642312312367c07688dc7426db40a82ed |
| superpowers | [obra/superpowers@8ca22dba9a94f28898bbce59f2537ff4d87c747d](https://github.com/obra/superpowers/commit/8ca22dba9a94f28898bbce59f2537ff4d87c747d) | 仓库 / LICENSE | MIT；Jesse Vincent ©2025 | abf0390320aa14406af7a520b9b0739fdda9bf08 |
| minimax | [MiniMax-AI/skills@60aaae52bb2af8162732751a4332f62a5fef518b](https://github.com/MiniMax-AI/skills/commit/60aaae52bb2af8162732751a4332f62a5fef518b) | 仓库 / LICENSE | MIT；MiniMaxAI ©2026 | 132dd20ee3294d09a1c613a6bd4c8094c496fbf9 |
| skill-creator | [anthropics/skills@33375500bcea98d610eb30ce10ac4e59b89c390d](https://github.com/anthropics/skills/commit/33375500bcea98d610eb30ce10ac4e59b89c390d) | skills/skill-creator / skills/skill-creator/LICENSE.txt | Apache-2.0；Anthropic，保留原NOTICE/许可全文 | 4f881c52d1f72f4cfb720e339e2d35c3058d01a9 |
| self-improvement | [pskoett/pskoett-ai-skills@8a71d7098d7c39494dcaa46254885225ddb5d259](https://github.com/pskoett/pskoett-ai-skills/commit/8a71d7098d7c39494dcaa46254885225ddb5d259) | plugin / plugin/LICENSE | MIT；Peter Skøtt Pedersen ©2025 | 8298e90caf0a7e77e905cf87a88e1871dbacd560 |

其他内容对应点：
- Cyrene派生两项：Playa-0v0/Cyrene-Agent@734bfeeab97b0cdaf5a29ee8fd8f0d61efb88948。office-design引入edca2be98b1899769d18faa7239ba7b398ef13c6；expense引入be1c6824f4add5efc85eca377eadf7b010301477，后续734bfee许可覆盖与文件内容核对。没有独立上游不等于没有取得任何许可依据。
- SP当前适配NOTICE的前改编正文对应点为ebdd4ec61f2f560bada4f6ded7b0806e62bf33f7，不把来源索引8ca22d…谎称成全部当前正文的来源版本。
- skill-creator根README/.gitignore另有anthropics/claude-plugins-official@13a0208f3882f3e7c266bf0e8d7243fc0e481105匹配材料，不能忽略混合来源。
- docx内LICENSE的Git blob为53218a2ed6d176e4c189e0c2925aeea64996e348。完整MIT/Apache文本与版权内容检查，不只是检查文件存在。
- AS/ECC中央许可与22项正文来源记录；3项升级带各自LICENSE/NOTICE。匹配方法为剥离frontmatter并去外层空白，不把规范化正文一致写成目录字节一致。
- SP九项均有完整LICENSE/NOTICE；skill-creator的LICENSE、LICENSE.txt、plugins/skill-creator/LICENSE均保留完整Apache文本及原附录。
- pdf/docx/xlsx/pptx当前有MiniMax来源、翻译及宿主改编历史；新固定点可用不等于当前目录已是那个版本。
- license-provenance.json的additionalLicenseSources.sha256是来源材料哈希；distributionSha256是随项目分发材料哈希。AS/ECC增加作者说明后两者不一致是记录语义不同，不是自动认定归档损坏。
- 历史otherReviewedGroups中的self-improving-agent=15文件，以及unresolved旧OpenClaw10文件，非当前正式9文件。当前replacement使用Peter同版8a71…的plugin/LICENSE；不把历史d01217a5264d16521933fdf8340d5d74d1130b22中仅5文件许可对应关系套给全部旧15文件。
- 不把Cyrene根MIT或9项SP的MIT推广给所有Skills。第三方资产公开再分发总体审查不在本轮静态结论中。

## 4. 47项独立审计矩阵
表中Display为当前正文首级标题；运行时frontmatter.name均与Runtime ID一致。
“PASS静态”只说明当前ID/路径/映射检查，非模型执行、外部程序、逐Skill脚本实机或审批强制语义的全覆盖。
VERIFIED_UPSTREAM指已追溯的第三方正文与必要元数据/局部ID适配，不保证等于最新固定获取点。
继承39项effectKind均未声明，统一参见P-01。FIREFLY_OWNED表示当前项目维护，不宣称所有历史内容从零原创。

| Runtime ID | Display / title | Category | Distribution | Current source / body relation | True upstream / pin | Upstream path | License / author | Provenance | Firefly adaptations | Cyrene dependency | Legacy alias | Runtime tools referenced | Modes / effectKind | External requirements | Host compatibility | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| as-api-and-interface-design | API and Interface Design | FIREFLY_ADAPTED_UPSTREAM | 正式 vendor ZIP/as-api-and-interface-design/ | upgraded-adapted | addyosmani/agent-skills @ 2686b620fc1fed2e8f60c704839c766b8594c6b6（固定获取点；现正文关系见说明） | skills/api-and-interface-design | MIT / Addy Osmani (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 吸收幂等性/API质量规则；保持 Code 与既有工具约束 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| as-code-review-and-quality | Code Review and Quality | VERIFIED_UPSTREAM | 正式 vendor ZIP/as-code-review-and-quality/ | equivalent-body-retained；剥离 frontmatter 后比较 | addyosmani/agent-skills @ 2686b620fc1fed2e8f60c704839c766b8594c6b6（固定获取点；现正文关系见说明） | skills/code-review-and-quality | MIT / Addy Osmani (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 当前 ID/模式元数据；显式跨调用见下表 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| as-code-simplification | Code Simplification | VERIFIED_UPSTREAM | 正式 vendor ZIP/as-code-simplification/ | equivalent-body-retained；剥离 frontmatter 后比较 | addyosmani/agent-skills @ 2686b620fc1fed2e8f60c704839c766b8594c6b6（固定获取点；现正文关系见说明） | skills/code-simplification | MIT / Addy Osmani (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 当前 ID/模式元数据；显式跨调用见下表 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| as-context-engineering | Context Engineering | FIREFLY_ADAPTED_UPSTREAM | 正式 vendor ZIP/as-context-engineering/ | upgraded-adapted | addyosmani/agent-skills @ 2686b620fc1fed2e8f60c704839c766b8594c6b6（固定获取点；现正文关系见说明） | skills/context-engineering | MIT / Addy Osmani (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 吸收上下文交接规则；不引入第二套上下文系统 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| as-debugging-and-error-recovery | Debugging and Error Recovery | VERIFIED_UPSTREAM | 正式 vendor ZIP/as-debugging-and-error-recovery/ | equivalent-body-retained；剥离 frontmatter 后比较 | addyosmani/agent-skills @ 2686b620fc1fed2e8f60c704839c766b8594c6b6（固定获取点；现正文关系见说明） | skills/debugging-and-error-recovery | MIT / Addy Osmani (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 当前 ID/模式元数据；显式跨调用见下表 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| as-doubt-driven-development | Doubt-Driven Development | VERIFIED_UPSTREAM | 正式 vendor ZIP/as-doubt-driven-development/ | equivalent-body-retained；剥离 frontmatter 后比较 | addyosmani/agent-skills @ 2686b620fc1fed2e8f60c704839c766b8594c6b6（固定获取点；现正文关系见说明） | skills/doubt-driven-development | MIT / Addy Osmani (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 当前 ID/模式元数据；显式跨调用见下表 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| as-frontend-ui-engineering | Frontend UI Engineering | VERIFIED_UPSTREAM | 正式 vendor ZIP/as-frontend-ui-engineering/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | addyosmani/agent-skills @ 2686b620fc1fed2e8f60c704839c766b8594c6b6（固定获取点；现正文关系见说明） | skills/frontend-ui-engineering | MIT / Addy Osmani (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 保留内联完整规则；新固定版本依赖独立 accessibility-checklist，未证明可整版替换 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| as-git-workflow-and-versioning | Git Workflow and Versioning | VERIFIED_UPSTREAM | 正式 vendor ZIP/as-git-workflow-and-versioning/ | equivalent-body-retained；剥离 frontmatter 后比较 | addyosmani/agent-skills @ 2686b620fc1fed2e8f60c704839c766b8594c6b6（固定获取点；现正文关系见说明） | skills/git-workflow-and-versioning | MIT / Addy Osmani (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 当前 ID/模式元数据；显式跨调用见下表 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| as-incremental-implementation | Incremental Implementation | VERIFIED_UPSTREAM | 正式 vendor ZIP/as-incremental-implementation/ | equivalent-body-retained；剥离 frontmatter 后比较 | addyosmani/agent-skills @ 2686b620fc1fed2e8f60c704839c766b8594c6b6（固定获取点；现正文关系见说明） | skills/incremental-implementation | MIT / Addy Osmani (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 当前 ID/模式元数据；显式跨调用见下表 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| as-planning-and-task-breakdown | Planning and Task Breakdown | VERIFIED_UPSTREAM | 正式 vendor ZIP/as-planning-and-task-breakdown/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | addyosmani/agent-skills @ 2686b620fc1fed2e8f60c704839c766b8594c6b6（固定获取点；现正文关系见说明） | skills/planning-and-task-breakdown | MIT / Addy Osmani (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 保留当前流程；新版本 tracker、/build 与目录外 definition-of-done 不直接移入 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| as-security-and-hardening | Security and Hardening | VERIFIED_UPSTREAM | 正式 vendor ZIP/as-security-and-hardening/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | addyosmani/agent-skills @ 2686b620fc1fed2e8f60c704839c766b8594c6b6（固定获取点；现正文关系见说明） | skills/security-and-hardening | MIT / Addy Osmani (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 保留内联规则；新 hardening-patterns/security-checklist 与观测宿主要求未整版采用 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| as-source-driven-development | Source-Driven Development | VERIFIED_UPSTREAM | 正式 vendor ZIP/as-source-driven-development/ | equivalent-body-retained；剥离 frontmatter 后比较 | addyosmani/agent-skills @ 2686b620fc1fed2e8f60c704839c766b8594c6b6（固定获取点；现正文关系见说明） | skills/source-driven-development | MIT / Addy Osmani (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 当前 ID/模式元数据；显式跨调用见下表 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| as-spec-driven-development | Spec-Driven Development | VERIFIED_UPSTREAM | 正式 vendor ZIP/as-spec-driven-development/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | addyosmani/agent-skills @ 2686b620fc1fed2e8f60c704839c766b8594c6b6（固定获取点；现正文关系见说明） | skills/spec-driven-development | MIT / Addy Osmani (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 不导入未经宿主验证的 OpenSpec 路由 | historical attribution；none运行依赖 | — | translate（示例中的字面标识） | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| as-using-agent-skills | Using Skills in Firefly | FIREFLY_ADAPTED_UPSTREAM | 正式 vendor ZIP/as-using-agent-skills/ | upgraded-adapted | addyosmani/agent-skills @ 2686b620fc1fed2e8f60c704839c766b8594c6b6（固定获取点；现正文关系见说明） | skills/using-agent-skills | MIT / Addy Osmani (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 当前 ID 显式发现与加载；不递归调用自身 | historical attribution；none运行依赖 | — | invoke_skill, read_skill_reference | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| docx | minimax-docx | FIREFLY_ADAPTED_UPSTREAM | 正式 vendor ZIP/docx/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | MiniMax-AI/skills @ 60aaae52bb2af8162732751a4332f62a5fef518b（固定获取点；现正文关系见说明） | skills/minimax-docx | MIT / MiniMaxAI (2026) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | write_word 路由；Windows .NET/OpenXML/Python 与现有文件保护；未整版替换缺 PowerShell/helpers/styles 的新版本 | historical attribution；none运行依赖 | — | write_word, invoke_skill | work/code/learn; 未声明→unknown | Python/.NET/OpenXML，外部排版流程未实测 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| ecc-agent-introspection-debugging | Agent Introspection Debugging | VERIFIED_UPSTREAM | 正式 vendor ZIP/ecc-agent-introspection-debugging/ | equivalent-body-retained；剥离 frontmatter 后比较 | affaan-m/ECC @ e482e579415fde18357cafce70f177ae19fd7f03（固定获取点；现正文关系见说明） | skills/agent-introspection-debugging | MIT / Affaan Mustafa (2026) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 当前 ID/模式元数据；显式跨调用见下表 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| ecc-ai-regression-testing | AI Regression Testing | VERIFIED_UPSTREAM | 正式 vendor ZIP/ecc-ai-regression-testing/ | equivalent-body-retained；剥离 frontmatter 后比较 | affaan-m/ECC @ e482e579415fde18357cafce70f177ae19fd7f03（固定获取点；现正文关系见说明） | skills/ai-regression-testing | MIT / Affaan Mustafa (2026) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 当前 ID/模式元数据；显式跨调用见下表 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| ecc-code-tour | Code Tour | VERIFIED_UPSTREAM | 正式 vendor ZIP/ecc-code-tour/ | equivalent-body-retained；剥离 frontmatter 后比较 | affaan-m/ECC @ e482e579415fde18357cafce70f177ae19fd7f03（固定获取点；现正文关系见说明） | skills/code-tour | MIT / Affaan Mustafa (2026) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 当前 ID/模式元数据；显式跨调用见下表 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| ecc-codebase-onboarding | Codebase Onboarding | VERIFIED_UPSTREAM | 正式 vendor ZIP/ecc-codebase-onboarding/ | equivalent-body-retained；剥离 frontmatter 后比较 | affaan-m/ECC @ e482e579415fde18357cafce70f177ae19fd7f03（固定获取点；现正文关系见说明） | skills/codebase-onboarding | MIT / Affaan Mustafa (2026) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 当前 ID/模式元数据；显式跨调用见下表 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| ecc-coding-standards | Coding Standards & Best Practices | VERIFIED_UPSTREAM | 正式 vendor ZIP/ecc-coding-standards/ | equivalent-body-retained；剥离 frontmatter 后比较 | affaan-m/ECC @ e482e579415fde18357cafce70f177ae19fd7f03（固定获取点；现正文关系见说明） | skills/coding-standards | MIT / Affaan Mustafa (2026) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 当前 ID/模式元数据；显式跨调用见下表 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| ecc-plan-canvas | Plan Canvas | VERIFIED_UPSTREAM | 正式 vendor ZIP/ecc-plan-canvas/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | affaan-m/ECC @ e482e579415fde18357cafce70f177ae19fd7f03（固定获取点；现正文关系见说明） | skills/plan-canvas | MIT / Affaan Mustafa (2026) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 保留当前交付/评审说明；不自动启动新上游 loopback server、hooks 或后台 CLI | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| ecc-security-review | Security Review Skill | VERIFIED_UPSTREAM | 正式 vendor ZIP/ecc-security-review/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | affaan-m/ECC @ e482e579415fde18357cafce70f177ae19fd7f03（固定获取点；现正文关系见说明） | skills/security-review | MIT / Affaan Mustafa (2026) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 保留安全规则；SQL 占位符示例不能跨数据库机械替换 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| ecc-tdd-workflow | Test-Driven Development Workflow | VERIFIED_UPSTREAM | 正式 vendor ZIP/ecc-tdd-workflow/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | affaan-m/ECC @ e482e579415fde18357cafce70f177ae19fd7f03（固定获取点；现正文关系见说明） | skills/tdd-workflow | MIT / Affaan Mustafa (2026) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 保留 docs/testing/<plan-or-task>.tdd.md 与当前测试约束，不改成新上游发布目录 | historical attribution；none运行依赖 | — | translate（示例中的字面标识） | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| office-design | Office 设计主题 | CYRENE_DERIVED_REWRITE | 正式 vendor ZIP/office-design/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | Playa-0v0/Cyrene-Agent @ 734bfeeab97b0cdaf5a29ee8fd8f0d61efb88948（来源历史） | skills/office-design | MIT / Cyrene 原作者（历史许可） | 来源历史/许可核实；独立上游未取得 | 四主题、token schema、校验器保留；Cyrene 来源，Firefly 校验器说明适配 | derived | — | invoke_skill | work/code/learn; 未声明→unknown | Python 校验器；跨格式 Office 应用未实测 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP 当前能力；REWRITE 后续单独设计 |
| pdf | Windows-native PDF workflow | CANDIDATE_REPLACEMENT_REVIEW | 正式 vendor ZIP/pdf/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | MiniMax-AI/skills @ 60aaae52bb2af8162732751a4332f62a5fef518b（固定获取点；现正文关系见说明） | skills/minimax-pdf | MIT / MiniMaxAI (2026) | 历史 MiniMax/改编依据核实；新版本等价未验证 | MiniMax 来源/Windows 本地改编；保留 make.py、render_preview.py、填写/合并流程 | historical attribution；none运行依赖 | — | write_pdf, translate, invoke_skill | work/code/learn; 未声明→unknown | Python/PDF 渲染库，视觉输出未实测 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP；REVIEW 等价替代 |
| pptx-generator | PPTX 生成器与编辑器 | FIREFLY_ADAPTED_UPSTREAM | 正式 vendor ZIP/pptx-generator/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | MiniMax-AI/skills @ 60aaae52bb2af8162732751a4332f62a5fef518b（固定获取点；现正文关系见说明） | skills/pptx-generator | MIT / MiniMaxAI (2026) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | PptxGenJS/XML/markitdown；通过已有命令工具，不宣称存在 write_pptx | historical attribution；none运行依赖 | — | invoke_skill | work/code/learn; 未声明→unknown | Node/PptxGenJS/Python markitdown，外部生成未实测 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| self-improving-agent | Self-Improvement - Firefly-maintained adaptation | FIREFLY_ADAPTED_UPSTREAM | 正式 vendor ZIP/self-improving-agent/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | pskoett/pskoett-ai-skills @ 8a71d7098d7c39494dcaa46254885225ddb5d259（固定获取点；现正文关系见说明） | plugin/skills/self-improvement | MIT / Peter Skøtt Pedersen (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | Peter 同作者多宿主来源；被动 LRN/ERR/FEAT 记录、手动 helper，无 OpenClaw 自动 hooks/上传 | historical attribution；none运行依赖 | — | read_file, write_file | work/code/learn; 未声明→unknown | 按需 Bash helper；本轮不执行 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| skill-creator | Skill Creator | FIREFLY_ADAPTED_UPSTREAM | 正式 vendor ZIP/skill-creator/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | anthropics/skills @ 33375500bcea98d610eb30ce10ac4e59b89c390d（固定获取点；现正文关系见说明） | skills/skill-creator | Apache-2.0 / Anthropic；Apache-2.0 通知原文 | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 用户 Skills 安装/refresh/mode 适配；条件性 Claude 能力不是 Firefly API | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | work/code/learn; 未声明→unknown | Python/按正文条件的外部 CLI；无收费评估 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| sp-brainstorming | Brainstorming Ideas Into Designs | FIREFLY_ADAPTED_UPSTREAM | 正式 vendor ZIP/sp-brainstorming/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | obra/superpowers @ 8ca22dba9a94f28898bbce59f2537ff4d87c747d（固定获取点；现正文关系见说明） | skills/brainstorming | MIT / Jesse Vincent (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 映射到 sp-writing-plans；不要求自动建 worktree 或服务器 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| sp-dispatching-parallel-agents | Dispatching Parallel Agents | FIREFLY_ADAPTED_UPSTREAM | 正式 vendor ZIP/sp-dispatching-parallel-agents/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | obra/superpowers @ 8ca22dba9a94f28898bbce59f2537ff4d87c747d（固定获取点；现正文关系见说明） | skills/dispatching-parallel-agents | MIT / Jesse Vincent (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 使用 Firefly task 合同；不新增模型选择字段 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| sp-requesting-code-review | Requesting code review in Firefly | FIREFLY_ADAPTED_UPSTREAM | 正式 vendor ZIP/sp-requesting-code-review/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | obra/superpowers @ 8ca22dba9a94f28898bbce59f2537ff4d87c747d（固定获取点；现正文关系见说明） | skills/requesting-code-review | MIT / Jesse Vincent (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | Firefly review brief，read_skill_reference，现有 task | historical attribution；none运行依赖 | — | read_skill_reference | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| sp-subagent-driven-development | Plan execution with Firefly task agents | FIREFLY_ADAPTED_UPSTREAM | 正式 vendor ZIP/sp-subagent-driven-development/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | obra/superpowers @ 8ca22dba9a94f28898bbce59f2537ff4d87c747d（固定获取点；现正文关系见说明） | skills/subagent-driven-development | MIT / Jesse Vincent (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 保留 Firefly brief 和 Node helpers；task(description,prompt,subagent_type=general) | historical attribution；none运行依赖 | — | invoke_skill, read_skill_reference | code; 未声明→unknown | Node helper；真实 task/模型未调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| sp-systematic-debugging | Systematic Debugging | FIREFLY_ADAPTED_UPSTREAM | 正式 vendor ZIP/sp-systematic-debugging/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | obra/superpowers @ 8ca22dba9a94f28898bbce59f2537ff4d87c747d（固定获取点；现正文关系见说明） | skills/systematic-debugging | MIT / Jesse Vincent (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | TDD 映射 ecc-tdd-workflow；验证映射 sp-verification-before-completion | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| sp-using-git-worktrees | Using Git Worktrees | FIREFLY_ADAPTED_UPSTREAM | 正式 vendor ZIP/sp-using-git-worktrees/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | obra/superpowers @ 8ca22dba9a94f28898bbce59f2537ff4d87c747d（固定获取点；现正文关系见说明） | skills/using-git-worktrees | MIT / Jesse Vincent (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 仅明确要求时使用既有 Git/命令能力，不自动创建 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| sp-using-superpowers | frontmatter.name=sp-using-superpowers | FIREFLY_ADAPTED_UPSTREAM | 正式 vendor ZIP/sp-using-superpowers/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | obra/superpowers @ 8ca22dba9a94f28898bbce59f2537ff4d87c747d（固定获取点；现正文关系见说明） | skills/using-superpowers | MIT / Jesse Vincent (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | Firefly 宿主映射与5篇参考；无未绑定 superpowers:* 必需调用 | historical attribution；none运行依赖 | — | read_file, write_file, invoke_skill, read_skill_reference | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| sp-verification-before-completion | Verification Before Completion | FIREFLY_ADAPTED_UPSTREAM | 正式 vendor ZIP/sp-verification-before-completion/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | obra/superpowers @ 8ca22dba9a94f28898bbce59f2537ff4d87c747d（固定获取点；现正文关系见说明） | skills/verification-before-completion | MIT / Jesse Vincent (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 证据先于结论；不把构建/静态验证扩为实机 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| sp-writing-plans | Writing Plans | FIREFLY_ADAPTED_UPSTREAM | 正式 vendor ZIP/sp-writing-plans/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | obra/superpowers @ 8ca22dba9a94f28898bbce59f2537ff4d87c747d（固定获取点；现正文关系见说明） | skills/writing-plans | MIT / Jesse Vincent (2025) | 来源/许可材料核实；不宣称固定 pin 全目录一致 | 现有计划、task/TDD/review 流程替代独立 executing-plans 要求 | historical attribution；none运行依赖 | — | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| write-expense-report | 写支出报告 | CYRENE_DERIVED_REWRITE | 正式 vendor ZIP/write-expense-report/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | Playa-0v0/Cyrene-Agent @ 734bfeeab97b0cdaf5a29ee8fd8f0d61efb88948（来源历史） | skills/write-expense-report | MIT / Cyrene 原作者（历史许可） | 来源历史/许可核实；独立上游未取得 | query_expense + write_excel；按时间/类目/column-spec 汇总，非通用 XLSX 的完全重复 | derived | — | write_excel, query_expense | work; 未声明→unknown | 支出存储与 Excel 生成，未读真实数据 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP 当前能力；REWRITE 后续单独设计 |
| xlsx | Windows-native XLSX workflow | CANDIDATE_REPLACEMENT_REVIEW | 正式 vendor ZIP/xlsx/ | current-version-retained；来源+当前适配，非同目录整版字节一致 | MiniMax-AI/skills @ 60aaae52bb2af8162732751a4332f62a5fef518b（固定获取点；现正文关系见说明） | skills/minimax-xlsx | MIT / MiniMaxAI (2026) | 历史 MiniMax/改编依据核实；新版本等价未验证 | MiniMax 来源+Firefly Windows/公式/已有文件保护与 OPC worksheet relationship 修复 | historical attribution；none运行依赖 | — | write_excel, invoke_skill | work/code/learn; 未声明→unknown | Python；需要时 LibreOffice 重算未实测 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP；REVIEW 等价替代 |
| firefly-diagram | Firefly Diagram（SVG 学习卡片） | FIREFLY_OWNED | skills/firefly-diagram/ | Firefly 当前维护（不等于所有历史代码原创） | 项目本地；无独立上游版本声明 | skills/firefly-diagram | 项目 MIT / 当前维护者，上游版权保留 | 本地维护归属核实 | 当前正文/工具路由，保留模式和权限；未重新生成 | historical（非运行目录依赖） | cyrene-diagram（仅解析） | 无注册 tool ID 字面引用；不等于无通用工具要求 | work/code/learn; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| firefly-exam-paper | Firefly Exam Paper（试卷能力） | FIREFLY_OWNED | skills/firefly-exam-paper/ | Firefly 当前维护（不等于所有历史代码原创） | 项目本地；无独立上游版本声明 | skills/firefly-exam-paper | 项目 MIT / 当前维护者，上游版权保留 | 本地维护归属核实 | 当前正文/工具路由，保留模式和权限；未重新生成 | historical（非运行目录依赖） | cyrene-exam-paper（仅解析） | read_skill_reference | learn; external_side_effect | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| firefly-learn-tutor | Firefly Learn Tutor | FIREFLY_OWNED | skills/firefly-learn-tutor/ | Firefly 当前维护（不等于所有历史代码原创） | 项目本地；无独立上游版本声明 | skills/firefly-learn-tutor | 项目 MIT / 当前维护者，上游版权保留 | 本地维护归属核实 | 当前正文/工具路由，保留模式和权限；未重新生成 | historical（非运行目录依赖） | cyrene-learn-tutor（仅解析） | 无注册 tool ID 字面引用；不等于无通用工具要求 | learn; external_side_effect | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| firefly-obsidian-workspace | Firefly Obsidian Workspace | FIREFLY_OWNED | skills/firefly-obsidian-workspace/ | Firefly 当前维护（不等于所有历史代码原创） | 项目本地；无独立上游版本声明 | skills/firefly-obsidian-workspace | 项目 MIT / 当前维护者，上游版权保留 | 本地维护归属核实 | 当前正文/工具路由，保留模式和权限；未重新生成 | historical（非运行目录依赖） | cyrene-obsidian-workspace（仅解析） | 无注册 tool ID 字面引用；不等于无通用工具要求 | learn; mutation | 用户 Vault 未访问 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| firefly-original-voice | 流萤 · 表达参考 | FIREFLY_OWNED | skills/firefly-original-voice/ | Firefly 当前维护（不等于所有历史代码原创） | 项目本地；无独立上游版本声明 | skills/firefly-original-voice | 项目 MIT / 当前维护者，上游版权保留 | 本地维护归属核实 | 当前正文/工具路由，保留模式和权限；未重新生成 | historical（非运行目录依赖） | cyrene-original-voice（仅解析） | 无注册 tool ID 字面引用；不等于无通用工具要求 | work/code/learn; 未声明→unknown | 角色表达/模型未调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| firefly-plan-mode | Firefly Plan Mode（计划模式） | FIREFLY_OWNED | skills/firefly-plan-mode/ | Firefly 当前维护（不等于所有历史代码原创） | 项目本地；无独立上游版本声明 | skills/firefly-plan-mode | 项目 MIT / 当前维护者，上游版权保留 | 本地维护归属核实 | 当前正文/工具路由，保留模式和权限；未重新生成 | historical（非运行目录依赖） | cyrene-plan-mode（仅解析） | 无注册 tool ID 字面引用；不等于无通用工具要求 | code; 未声明→unknown | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| firefly-plugin-dev | Firefly 插件开发 | FIREFLY_OWNED | skills/firefly-plugin-dev/ | Firefly 当前维护（不等于所有历史代码原创） | 项目本地；无独立上游版本声明 | skills/firefly-plugin-dev | 项目 MIT / 当前维护者，上游版权保留 | 本地维护归属核实 | 当前正文/工具路由，保留模式和权限；未重新生成 | historical（非运行目录依赖） | cyrene-plugin-dev（仅解析） | weather（插件示例） | code/work; mutation | Node/SDK；本轮未编译插件 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |
| firefly-work-hygiene | Firefly Work Hygiene | FIREFLY_OWNED | skills/firefly-work-hygiene/ | Firefly 当前维护（不等于所有历史代码原创） | 项目本地；无独立上游版本声明 | skills/firefly-work-hygiene | 项目 MIT / 当前维护者，上游版权保留 | 本地维护归属核实 | 当前正文/工具路由，保留模式和权限；未重新生成 | historical（非运行目录依赖） | cyrene-work-hygiene（仅解析） | 无注册 tool ID 字面引用；不等于无通用工具要求 | work; mutation | 当前命令/浏览器/Git 等按需能力；未做真实 Agent 调用 | PASS 静态路径/ID；effectKind 强制执行见问题 P-01 | KEEP |

## 5. 四项重点结论

### office-design：CYRENE_DERIVED_REWRITE，KEEP能力；后续独立重写
正式8文件如下：
- office-design/assets/themes/academic.json
- office-design/assets/themes/business.json
- office-design/assets/themes/financial.json
- office-design/assets/themes/formal-cn.json
- office-design/references/token-schema.md
- office-design/scripts/validate_theme.py
- office-design/SKILL.md
- office-design/tests/test_validate_theme.py
原主题/schema/test与历史Cyrene对应；多数内容仅行尾差异，validate_theme.py存在Firefly说明适配。
独立上游未取得，不能用同名第三方Skill替代。实际工具invoke_skill存在；无旧Cyrene工具、人格或运行路径。
能力仍用于DOCX/PDF/PPTX/XLSX跨格式主题，因此不建议删除。未来重写契约应保留四主题、token schema、主题校验及跨格式一致性，不能只换姓名。

### write-expense-report：CYRENE_DERIVED_REWRITE，KEEP能力；后续独立重写
两文件：write-expense-report/SKILL.md、write-expense-report/references/column-spec.md。
历史源为Cyrene宿主记账报表流程；未取得独立第三方上游。
真实工具query_expense（src/main/orchestrator/tools/life-tools.ts）和write_excel（document-tools.ts）注册存在。
读支出与写Excel的不同effect/risk依照真实工具，不因Skill路由扩权。
column-spec、时间范围和类目汇总契约不是通用xlsx正文的完全替代。静态绑定可用，本轮未读真实支出或生成真实报告，不能声称实机可运行已通过。
无旧工具名、旧人格、旧路径。后续重写保留报表列、汇总、读写边界和已有文件保护。

### pdf：CANDIDATE_REPLACEMENT_REVIEW，KEEP当前Windows实现
当前17文件（11脚本），MiniMax来源和本地Windows改编，非纯Firefly原创。
当前make.py/render_preview.py/Python创建、检查、填写、重排、合并与视觉检查；新固定版本含render_cover.js/浏览器路线，运行时与输出契约不同。
write_pdf/translate/invoke_skill均为真实工具；命令执行须遵循宿主工具审批。
并非“没有上游”；sources.json的candidate说明尚未证明新版本替代等价，历史来源证据已补充。
未运行外部PDF渲染器/视觉结果/真实用户文件，不能直接整目录替换。

### xlsx：CANDIDATE_REPLACEMENT_REVIEW，KEEP当前Windows实现
当前33文件，7references/11scripts/7template部件；MiniMax所有权+Firefly具体适配分开。
正式xlsx/scripts/xlsx_workspace.py SHA-256：
7743ec3e6cb37a0d632b3133ca068b4ddff70288a5f493fbd8d35867dc413320。
来源层在scripts/packaging/skill-adaptations/xlsx/scripts/xlsx_workspace.py；worksheet relationship规范化是Firefly维护修复，不代表整个Skill原创。
当前公式、已有结构保护、Windows工作区、重算契约；新获取实现未证明覆盖现有helper/styles/tests。
write_excel/invoke_skill真实注册；必要时Python/LibreOffice外部步骤仍未本轮实机。
不以新包可下载或持有MIT证明功能等价，不直接替换。

## 6. 全39项跨Skill引用与附件
全部39项当前正式正文的静态目标：39节点/69边；missingTargets=0；modeConflicts=0；cycleCount=0。
as-using-agent-skills不调用自身；不要求预热其发现流程才能解释其他Skill的明确ID。
当前无独立executing-plans ID；SP正文已改为当前writing-plans/subagent/TDD流程，不伪装新增Skill。
下表“—”代表没有静态跨Skill调用，不能推断该Skill无通用工具要求。
附件数量按正式ZIP路径分类，不把NOTICE/LICENSE当reference。
| 调用方 | 实际规范目标 | references / scripts / templates | 正式文件总数 |
|---|---|---|---|
| as-api-and-interface-design | — | 0 / 0 / 0 | 3 |
| as-code-review-and-quality | as-security-and-hardening | 0 / 0 / 0 | 1 |
| as-code-simplification | — | 0 / 0 / 0 | 1 |
| as-context-engineering | — | 0 / 0 / 0 | 3 |
| as-debugging-and-error-recovery | ecc-tdd-workflow | 0 / 0 / 0 | 1 |
| as-doubt-driven-development | as-code-review-and-quality, as-debugging-and-error-recovery, as-source-driven-development | 0 / 0 / 0 | 1 |
| as-frontend-ui-engineering | — | 0 / 0 / 0 | 1 |
| as-git-workflow-and-versioning | as-api-and-interface-design, as-code-review-and-quality | 0 / 0 / 0 | 1 |
| as-incremental-implementation | as-git-workflow-and-versioning, ecc-tdd-workflow, sp-verification-before-completion | 0 / 0 / 0 | 1 |
| as-planning-and-task-breakdown | sp-verification-before-completion | 0 / 0 / 0 | 1 |
| as-security-and-hardening | — | 0 / 0 / 0 | 1 |
| as-source-driven-development | as-security-and-hardening | 0 / 0 / 0 | 1 |
| as-spec-driven-development | as-context-engineering, as-incremental-implementation, as-planning-and-task-breakdown, ecc-tdd-workflow | 0 / 0 / 0 | 1 |
| as-using-agent-skills | as-api-and-interface-design, as-code-review-and-quality, as-code-simplification, as-context-engineering, as-debugging-and-error-recovery, as-doubt-driven-development, as-frontend-ui-engineering, as-git-workflow-and-versioning, as-incremental-implementation, as-planning-and-task-breakdown, as-security-and-hardening, as-source-driven-development, as-spec-driven-development, docx, ecc-agent-introspection-debugging, ecc-ai-regression-testing, ecc-code-tour, ecc-codebase-onboarding, ecc-coding-standards, ecc-plan-canvas, ecc-security-review, ecc-tdd-workflow, pdf, self-improving-agent, sp-brainstorming, sp-dispatching-parallel-agents, sp-requesting-code-review, sp-subagent-driven-development, sp-systematic-debugging, sp-using-git-worktrees, sp-using-superpowers, sp-verification-before-completion, sp-writing-plans, xlsx | 0 / 0 / 0 | 3 |
| docx | — | 18 / 50 / 0 | 85 |
| ecc-agent-introspection-debugging | self-improving-agent, sp-verification-before-completion | 0 / 0 / 0 | 1 |
| ecc-ai-regression-testing | — | 0 / 0 / 0 | 1 |
| ecc-code-tour | ecc-codebase-onboarding, ecc-coding-standards | 0 / 0 / 0 | 1 |
| ecc-codebase-onboarding | — | 0 / 0 / 0 | 1 |
| ecc-coding-standards | as-api-and-interface-design, as-frontend-ui-engineering | 0 / 0 / 0 | 1 |
| ecc-plan-canvas | — | 0 / 0 / 0 | 1 |
| ecc-security-review | — | 0 / 0 / 0 | 1 |
| ecc-tdd-workflow | — | 0 / 0 / 0 | 1 |
| office-design | — | 1 / 1 / 0 | 8 |
| pdf | office-design | 0 / 11 / 0 | 17 |
| pptx-generator | office-design | 5 / 1 / 0 | 9 |
| self-improving-agent | — | 1 / 1 / 0 | 9 |
| skill-creator | docx, xlsx | 1 / 9 / 0 | 23 |
| sp-brainstorming | sp-writing-plans | 0 / 0 / 0 | 3 |
| sp-dispatching-parallel-agents | — | 0 / 0 / 0 | 3 |
| sp-requesting-code-review | — | 1 / 0 / 0 | 4 |
| sp-subagent-driven-development | — | 3 / 3 / 0 | 9 |
| sp-systematic-debugging | ecc-tdd-workflow, sp-verification-before-completion | 0 / 0 / 0 | 3 |
| sp-using-git-worktrees | — | 0 / 0 / 0 | 3 |
| sp-using-superpowers | sp-brainstorming, sp-systematic-debugging | 5 / 0 / 0 | 8 |
| sp-verification-before-completion | — | 0 / 0 / 0 | 3 |
| sp-writing-plans | ecc-tdd-workflow, sp-subagent-driven-development, sp-using-git-worktrees | 0 / 0 / 0 | 3 |
| write-expense-report | — | 1 / 0 / 0 | 2 |
| xlsx | office-design | 7 / 11 / 7 | 33 |

所有200项当前host review附件记录的路径、大小、SHA与归档对应。本轮重新运行对应检查，未只依赖旧报告。
逐文件名与当前正文工具字面引用核对；SP Firefly Node helper/brief保留。没有自动把Claude/Codex/Hermes等条件参考当Firefly工具。
skill-creator正文条件性CLI依赖与self-improving手动Bash脚本仍是外部运行边界；注册/安装不执行它们。
没有registered write_pptx或ask_user_choice；正式Skill未将它们当真实Firefly调用，本轮不新增工具。
命令、Git、浏览器与Task使用现有工具合同；不自动选择模型/建worktree/启动后台服务或扩大审批。
这些静态结论不能证明模型每次遵守正文，不是针对每条示例命令的执行安全证明。

## 7. 内置与8条legacy alias
内置8项均在矩阵逐项列出，firefly-original-voice隐藏，diagram的6个--cy-*主题token仍由当前Renderer CSS真实声明和使用：
--cy-bg-workspace、--cy-bg-hover、--cy-accent、--cy-text、--cy-text-muted、--cy-border。
它们是当前共享样式接口，不是旧角色人格/路径；本轮不更名破坏接口。
| 旧ID（非注册） | 规范注册ID |
|---|---|
| cyrene-diagram | firefly-diagram |
| cyrene-exam-paper | firefly-exam-paper |
| cyrene-learn-tutor | firefly-learn-tutor |
| cyrene-obsidian-workspace | firefly-obsidian-workspace |
| cyrene-original-voice | firefly-original-voice |
| cyrene-plan-mode | firefly-plan-mode |
| cyrene-plugin-dev | firefly-plugin-dev |
| cyrene-work-hygiene | firefly-work-hygiene |

依据src/main/skills/skill-id-aliases.ts：旧输入映射新ID；resolveSkillSettings删除旧键、新键优先，同为对象时旧后新合并。
registry.register/getById、scanner、settings、slashcommands、allowedSkillIds、findSkillPath均有规范化消费者；不双注册/双发。
因此“旧ID仅用于旧设置/用户覆盖”这个绝对要求不完全符合实际：当前还接受旧命令和路径查询输入。此为P-03，不能假报settings-only。
没有为新用户增加8项别名UI，默认规范ID不含cyrene-*。本轮没有移除外部兼容入口。
用户同名覆盖优先来自现有扫描/注册来源顺序与回归源码；本轮不测试真实用户安装。

## 8. 残留与内容安全
ZIP全253文件按Cyrene、cyrene、昔涟、cyrene-、.cyrene、Cyrene-Agent、Playa-Cyrene、Playa-0v0扫描：0命中。
内置SKILL正文无当前品牌/角色残留。上游版权、历史provenance与中央许可里真实Cyrene来源应该保留，不算产品运行指令污染。
派生office-design/expense的历史来源属于分类E，不因改文案归零变成Firefly全原创。
当前Skills业务代码旧ID集中在alias及对应回归；未因普通文本零命中推断第三方原始所有权。
扫描/注册只读元数据，不执行脚本；snapshot-install使用安全extractZip及rejectZipSymlink，不下载installer、不执行hooks。
shell/script须由Agent明确发工具请求，实际工具权限仍适用。Skill读取不是授权执行任意脚本。
ZIP恶意条目/预算/链接拒绝来自当前src/shared/zip-extraction.ts与zip-entry-policy.ts；本轮没重新跑所有恶意ZIP，不以三项静态测试替代完整安全证明。

## 9. Managed update：current与legacy hash
当前安装源以manifest.sha256=667740…的正式ZIP为准；当前39正文实际哈希见本节表。
legacy recognition：
- src/main/migration/skill-snapshot.ts MANAGED_BUNDLES的33个ID/34个正文摘要（pptx两种）用于识别旧托管正文，不是当前下载版本。
- ORIGINAL_FILES的14项旧文件摘要用于精确旧文件替换。
- managed-skill-files.json的14项旧附件摘要来自890bc616…时的98005b…归档，只用于确认附件未被用户修改。
- 历史sourceSha256=9b5b115c81c1629013603ca5b8c5f03145e4fecbe1587f0e55f54e0cd20ac336表示源归档，不是当前产物。
updateManagedSkillBundle：正文先比expectedHash；附件已存在且与新内容不同必须命中recognizedFiles，否则单项返回false；备份冲突拒绝；不覆盖用户同名修改。
migrateInstalledSkillSnapshot按项处理，bundle catch记录安全reason继续其他项；路径逃逸拒绝是全局安全停止，不应当描述为任意失败均保证继续。
备份.pre-firefly.bak，临时文件独占创建、写前再次内容比较；重复内容不更新；并非全部文件同一事务回滚，失败可产生部分附件更新并保留恢复依据。
首次install跳过已有Skill目录；既有托管更新依靠识别规则；非自动覆盖userData/skills。
本轮不执行该写数据链：其实现使用os.tmpdir且写入目标；用户限制临时资料仅审计目录，故只读源码与既有回归，未把历史测试当新测试通过。
| ID | 当前正式SKILL.md SHA-256 |
|---|---|
| as-api-and-interface-design | 6875fda71f0149b583ca20c55bfe5200f8da9bffd019b726113a7322f71ca9b4 |
| as-code-review-and-quality | c3355ced51cadc1dc529a7675afa0d7b1eab45c0ba20409973d7c31c52f43f2c |
| as-code-simplification | f331201180d72daa40c740496546085ca03f6e1e9e0a4c9a2250bbaddf029ffd |
| as-context-engineering | 47301b247a96dddf6e6cb201b04d0bbe989d95bb9ced89d4fef8e1411062847a |
| as-debugging-and-error-recovery | 41f757c5d2cf1bba1f0c8dd48d27b4553bfb3a10c03c939ea7828ea8cf0195c6 |
| as-doubt-driven-development | 2153510f2f06d572e1ca08f15d7c922afcc8cfa3ef93f93b3e53f29ae418ebac |
| as-frontend-ui-engineering | 32d8c8df5be335a8a0571afe75398378c1a6c88122d7fafab7b6c9fc8f6f46c9 |
| as-git-workflow-and-versioning | e7978afe08ef1714eefd20693e373d394d8cca07b102d1b11d5e8805f3d707c7 |
| as-incremental-implementation | 8b6fc4f6e98c03aac336ebe87645568f37dce7864eb1770499d46e18f5f2c461 |
| as-planning-and-task-breakdown | d0b6b9922ea8cf8804898d8ae19ebfb7a2f0ccc9daedfb44437fc060d1b9ac10 |
| as-security-and-hardening | 6c842bdefbcd69ccf060dce92b46c7aa1f8abecdb4781110a261d5e385c1e5b6 |
| as-source-driven-development | 844592fbbf646683b4f2ba2dff1aeb7e063b8cf1a2daec18c8d35a736c7a2e8f |
| as-spec-driven-development | ee67891236351f7f833515732ec0cf7664f24ac0639c7ea1498652f45fb0422c |
| as-using-agent-skills | cdb2821e0f18c0915905e84019198622e4b19d817e5c9267ee4bb0b0e91ce7c6 |
| docx | 838ad7d14da25d097c1b196fa23486de6d4a881cd090a72bd127fb34d05dc1bf |
| ecc-agent-introspection-debugging | 8a248ae16a08300730ecef23ec86caba85c6b8bd9d236cbec3896978cf3bb3ce |
| ecc-ai-regression-testing | 711f995f7fd5e9cc7f8802637aa1230d97bf2e2d6de68396e626d7befe9e5652 |
| ecc-code-tour | 3e29cd330bf61e3ecd61c913e95407834f2815098d73f6f56fbe947efed647bf |
| ecc-codebase-onboarding | 09a7bed5876bb9800020ed7b71e139b473701facee22e6ea74f6d83176e0bdd8 |
| ecc-coding-standards | bc13a965e524e2f8888b8fbc305c3c196c708fe8851b9f4d948092a1d17e74d9 |
| ecc-plan-canvas | b2ee13b7c994e05514da31933c46b12c8dfad9b3e2205e5e07ac1d666ea5ac92 |
| ecc-security-review | 2114d75e870c9f892a433e4a17244b55bd6d9b66a9d1fce27bebb0e03ffca1a8 |
| ecc-tdd-workflow | 36d3d6400b665cb86075aed272cf6bb4c91eb1e2d2b8df13bf60ee95d3400923 |
| office-design | 235e0f84d967af606de67203c297d74534cb21a7019856c73142b04f08e3ff95 |
| pdf | e5be24b52474ada2cb59b6e403afdb21ff965feb506741a9bb8fddd471a718ca |
| pptx-generator | b8e7e5838aceb286330a7b95ec34d7d096ea8215722a401b3e7d00cf514bddef |
| self-improving-agent | a561da7fa54b6d071bd6c9dc2bedcc23998193d0b4d85ad39fe56e279e7d05bb |
| skill-creator | 5b740547dd593025cdee25e385f07dcd44e2be7d01dceefd33f4f73fbdcad394 |
| sp-brainstorming | 2060da1697c99c538650b064c146ffd272ef434a114386185fcc217dafc3825e |
| sp-dispatching-parallel-agents | 272e72e3066bd9934bdce894731b46c8df19240379eee8e937f2b6b3e0a8d493 |
| sp-requesting-code-review | cdec01b0123430a61c6cf889785fb76264c8ac6e9b7a4b4afbe48e44e8a6fca6 |
| sp-subagent-driven-development | ddd0156b7d23fd8d2d6ea65789a32c8e4238f87e9f088bc25170f427c46af149 |
| sp-systematic-debugging | 266f3086a6341cdae45da109d5398d5d445af24b9e2cb711bdd907aaa498616a |
| sp-using-git-worktrees | 682b6a70c01d85592ca4dfe643a19fa5efd5e462221258572e84e601e0dbcd56 |
| sp-using-superpowers | 0f75e405ceeac3a4fd75dc736cb60efdf7752cb43bb50942a0b9b1f9decfd4a8 |
| sp-verification-before-completion | d7964c951960ade343d61bd9f858d5e235b94d9e2c9026f32e7aea4ab05d4697 |
| sp-writing-plans | 89fb1b6eccec626bf58c6715993a152cd4f7d45703c4e2b766c571862afa2cf7 |
| write-expense-report | b28980a05566486ab17e3fa872920de1bc9a064af770d8da8782817f2bc510bc |
| xlsx | d19fb39a4f4ee85230c1316b945e011cb2f4368c6f840eb0e5123cb34a8f4096 |

完整legacy识别摘要（原始定义只读摘录，不作为current哈希）：

~~~typescript
const MANAGED_BUNDLES: Readonly<Record<string, string | readonly string[]>> = {
  "as-source-driven-development": "9af3c84ecee8ccf9ea56acd67897ccdcd4ce0ed960cbedb053633bc15b3256c0",
  "xlsx": "69fe57de5c506d8e7385777cca8cd14f72ba67429f5330fc0e29299b5291dc1a",
  "pdf": "f3afddf970f1c977ffe175fcae6b401794339a3876fd8e0b6a45a6c30e34aad4",
  "docx": "e6470c392870b2d7c34881abc2d60538b0ddafd088dcb85b79f28a5171337d18",
  "ecc-plan-canvas": "d8314738efdae8b1f8b304f819cfd0cb999c69ad0decf4ea3d9805c84567815d",
  "ecc-tdd-workflow": "22d64df7fed2c0c7e4725b859b11d8a77f62823222c8d8839b929dd830cdaac4",
  "skill-creator": "8a420fe93c5a89f6b1929f778c931f0524b11bc071ee8d17971bb1623e534774",
  "as-code-review-and-quality": "831528a372488919bd233da2ed9c65f318ba2174ea251497242fb5c4f392e1a5",
  "as-security-and-hardening": "dd198e6e26b33384c7737a5c26158bfad137ca3cf090114dec6cd78786c1b2fe",
  "as-frontend-ui-engineering": "51c9a8efd4f7016de08773a3393cdc6ead1eec7a06863de8ca039ccb78a09a4d",
  "as-incremental-implementation": "e36b8449378b93063d1fb487e9f2c58efc6c9d7dd2f34ced3b359676085f5c6e",
  "as-planning-and-task-breakdown": "2c1b385f31456dcccdf81332ec00903ced047f9cfa8332aeaaaba6cb919f549d",
  "as-debugging-and-error-recovery": "a22de82f81e0e1c5e62e29b7623a5cf05ba9c2161a85b690cacf604156ddee7a",
  "as-git-workflow-and-versioning": "c1fa44f39680fc8e35779023040a6e31e4b915722dcf8294e63356fc68dfb78b",
  "as-doubt-driven-development": "b9ff3cb8680cd91aefffadbd7fe4f9c9ec3f1d8cb6a1e778a15f5989530a0b49",
  "ecc-code-tour": "bf5d2c2bec39f6b451c1f7a03c32390a93050a1bafd21baba8b0368fd4cd98c8",
  "ecc-agent-introspection-debugging": "5ae2ac774811919c9ed09394e6e5d953c14a34dc60b2ef5722e40c89c96e3711",
  "ecc-coding-standards": "0d2c67550a07a8fa9945f5804325f52d89d55ddc4481633cfdda44825edcd347",
  "as-using-agent-skills": "8251f28c4680ddfc96e38713f0816cc82938f6fa754b25458a5bd859798c94f4",
  "as-api-and-interface-design": "c92860e9b743d169cb5ed762a8ebd09082f24663ca7c6f626716fb534daf9f54",
  "as-context-engineering": "e26b0ebe0a73a6b0f7cb104c694181d2937138d0fceba4f8773f12b744919246",
  "as-spec-driven-development": "d68571f75119e011cbfa7087dafda0743aef13f4efbfc98bd6f08732878dd8bb",
  "self-improving-agent": "8477a270061ce850c3e580e613dd18f87ccfcdb556348687fce66b5ec77a9158",
  "pptx-generator": ["a0d9d1b839e84492f33d28bfcc1d0526bcc9aefab4e7e53c05ff092f401982d7", "2eb6a4d3fccb07033a7c7446affca663975625e89c15d493c27fb40826d6142d"],
  "sp-brainstorming": "db2bb75deb783905af28d61e7387be800a82a2c4c9900ad92af43d67eb77c418",
  "sp-dispatching-parallel-agents": "077bc5897cb508852aace4975d90dd084764d7c733750045650bd12d8b0b779e",
  "sp-requesting-code-review": "2cc48ff3871fc360aee904a050de1e37c229d2aa7801b3ef75a4ea6ed341dd12",
  "sp-subagent-driven-development": "b0370f154a403766568ad13c303b969132b176130a5ce676c01caa7cb20c794b",
  "sp-systematic-debugging": "4853333b393b3a8d9404178ca58a0e8c1ad998a485233aac0dbfb2ef9ac94ef9",
  "sp-using-git-worktrees": "846b9d8966715ea5a4c373590dc0c0af28a129230f1498eab6771e877eb35406",
  "sp-using-superpowers": "d42105760d85e0391d9fae5cee6463166a4f378575053dbd3483df794a314225",
  "sp-verification-before-completion": "d7964c951960ade343d61bd9f858d5e235b94d9e2c9026f32e7aea4ab05d4697",
  "sp-writing-plans": "1a19a48cd7128565266a9a0b80f1568a26e3b7280d3138beb4763113b7c6f58d",
};

const ORIGINAL_FILES: Readonly<Record<string, string>> = {
  "sp-brainstorming/NOTICE.md": "15b4fef55149f06896edbfd6dd8e8aeee3f4ab15e1179e073bf46653e3622eb3",
  "sp-dispatching-parallel-agents/NOTICE.md": "15b4fef55149f06896edbfd6dd8e8aeee3f4ab15e1179e073bf46653e3622eb3",
  "sp-systematic-debugging/NOTICE.md": "15b4fef55149f06896edbfd6dd8e8aeee3f4ab15e1179e073bf46653e3622eb3",
  "sp-using-git-worktrees/NOTICE.md": "15b4fef55149f06896edbfd6dd8e8aeee3f4ab15e1179e073bf46653e3622eb3",
  "sp-using-superpowers/NOTICE.md": "15b4fef55149f06896edbfd6dd8e8aeee3f4ab15e1179e073bf46653e3622eb3",
  "sp-writing-plans/NOTICE.md": "15b4fef55149f06896edbfd6dd8e8aeee3f4ab15e1179e073bf46653e3622eb3",
  "office-design/scripts/validate_theme.py": "d5e061a300f0fce1480ba5e6399600bf3d30936f08683b00fb0e717233e62e95",
  "pdf/README.md": "9afc9773201fb318e1c81707cc6a187f742f7b34d07f5b390103e02c1e8247f5",
  "pdf/scripts/make.py": "8f8cab930a2fde8f5e0d4f4284cee265c1ad88dd27e7e1248f4060e76b5a6b01",
  "pdf/scripts/pdf_cover.py": "9ffd65961df07ec599aaec0215704d156cc09b6d90feaa439e1913fa3dd39c17",
  "pdf/tests/test_make.py": "54092c8418004ae90a2221118081faa05c58de95388e51090a0ef6e534540030",
  "skill-creator/SKILL.md": "d69fc33633db25cbc1cf91e8a9d3a0e5f2029042c475966fdc4b40817c457520",
  "xlsx/SKILL.md": "eb0f5e1066e2babc1f54307b0046612985d901c5dbda8c6009855b00de95e391",
  "xlsx/scripts/xlsx_workspace.py": "8bb2759728474590455887754ba0a1dad364fb9336f0a7fcde65c799e71929b3",
};
~~~

## 10. 具体审计发现与建议

### P-01：effectKind声明与实际调度语义不一致（ADAPTATION_REQUIRED）
位置：src/main/skills/skill-tools.ts:75-80、128-131；src/main/orchestrator/harness/side-effect-resolver.ts:17-29；
src/main/orchestrator/shell-execution-policy.ts:183；harness/tool-call-scheduler.ts:50-52；harness/adapter/tool-runtime.ts:36-61。
39项继承均没有effectKind；内置3项未声明，5项声明。
meta-tool动态解析返回unknown；注释称ExecutionPolicyGuard会拒绝，实际checkExecutionPolicy只发现定义、未找到生产调用方。
scheduler把unknown串行独占处理，但side-effect-resolver将unknown映射read_only。
不能据此声称所有未声明Skill都已被拒绝，也不能据此认定底层写入工具绕过审批——真正工具仍经过工具runtime权限检查。
建议下一轮明确读取指令与执行工具的effect契约、同步注释与实际守卫，并以回归验证；本轮只报告，不改策略或权限。

### P-02：治理附件存在中间态归档哈希（资料一致性问题）
docs/archive/refactor/2026-09-26-dependency-governance.distribution.json：
upstreamCompatibilityReview.currentArchiveSha256=07b2d86b6e7757051f44f1caab6799527ede2e7daddbe8a0104c3d2a613b444a；
upstreamManagementExecution.archiveSha256=20c165e83b4b167fc48efc67aef31ea871364865a8e1bd23ba19a475e66bff91。
license-provenance.json currentDeliveryReplacement.archiveSha256仍为20c165…。
实际ZIP/manifest.sha256/当前hostSemanticReview对应667740…；39正文与200附件逐项哈希匹配。
这些历史/中间态字段不应被用作最终当前归档的完整性断言。建议保持历史真实性同时明确字段时间范围；本轮不改文件。
同理历史crossCallAcceptance旧“pending”说明已由当前正式host review/源码替代，不能当新的运行缺陷。

### P-03：legacy alias不局限于设置（需求与现状差异）
8条alias也应用于命令、allow-list和资源查询。它们不增加注册/新UI，但“只用于旧配置”绝对结论不成立。
建议维护兼容边界文档，不在只读审计中删除入口。

### 分类与后续处理
可直接保留：19项可追溯上游、16项明确宿主改编、8项内置；保留当前模式/工具安全要求。
建议重写：office-design与write-expense-report，只在下一轮明确功能契约后开展，不本轮删减。
替代需继续评估：pdf/xlsx，必须验证Windows文件保护、公式、重算/视觉输出，不以同名/许可/下载证明等价。
建议删除：0。未证明任何正式Skill无运行价值。
Cyrene仅历史归属：AS/ECC/SP/MiniMax/Anthropic/Peter内容在基座被分发的历史记录；不能把这些目录全归为Cyrene原创。

## 11. 本轮验证证据
重新实际运行：
node --test --test-name-pattern='every distributed Markdown file target and heading anchor resolves|distributed host instructions use registered Skill IDs and installed resource paths|the 39-item host review and attachment hashes describe the distributed archive' scripts/packaging/adapt-skills-snapshot.test.mjs
退出0；3项通过、0失败、0跳过；运行输出总耗时432.1862ms。
非致命MODULE_TYPELESS_PACKAGE_JSON警告：zip-extraction.ts解析为ES module，未修改package元数据迎合警告。
109 Markdown共110链接：85本地、25外部；55本地标题锚点；本地断链/锚点0。25外部URL不是本轮全HTTP可达性证明。
当前39正文摘要与200附件摘要核对通过；清单/ZIP/模式/图静态比较。
未运行会写os.tmpdir/user-root的managed update和host-semantic-closure Vitest；读取测试源码，不声称本轮全部注册/迁移实机通过。
未运行build/typecheck/npm ci/audit/全量Vitest，不为只读审计重复改造。未请求真实模型、外部Office/GUI/收费服务。
既有host-semantic-closure.test.ts涵盖directinvoke、模式/effect、用户覆盖等；源码检查不是本轮实际执行该测试的结果。
当前静态来源/内容/宿主审计可交付；effect强制语义、外部运行能力、用户实机数量与公开发布全部许可不在已通过结论中。

## 12. 仓库保护与停止
只新增本仓库外SKILLS_AUDIT.md。实际Compare-Object比较before与当前porcelain v2（移除before的分支头）无差异：StatusEqual=True，20项记录。HEAD=349753da78a49d9a9fb0e62e17c2c2c76e5296a3，分支chore/project-structure-finalize均未变化；没有暂存、提交、推送。
审计结束后停止，不实施rewrite/delete/replace。

