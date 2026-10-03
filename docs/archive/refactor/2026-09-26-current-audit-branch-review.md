# 当前依赖审计与开发分支安全差异（2026-09-26）

> 历史审查快照：以下结论对应 `890bc61` 与当时的依赖锁文件，保留原始审计退出码和范围。本轮后续替换与文档修正的最新结果见 [集中收口记录](2026-09-26-documentation-dependency-closeout.md)，不得将本文当作当前依赖状态。

## 基准与范围

- 仓库：`Serendipity-wu02/Firefly_Agent`；审查时没有开放 PR。
- 差异基准：`origin/main` 与开发分支的共同祖先 `35457af3279fccaf0ab462f8744f47183fce79f1`；目标：`firefly-mini-v1.1.x` 的 `890bc6165d7b3a476d6069c436145c181bd8a16b`。
- 分支相对基准改变 206 个文件。本次审查聚焦依赖提交 `890bc61` 的 13 个文件，以及分支内鉴权、插件面板、用户表情包路径和沙箱环境读取相关差异；其他素材和 UI 变动未做安全逐行审查。
- `origin/main` 与上一提交 `d875796` 的 `package-lock.json` blob 同为 `b1a0fe2627053d088855c53a3387c30c277051cf`，故本轮依赖变动来自 `890bc61`，而不是之前的资源整理提交。
- 原有逐包处置与本轮依赖提交审查见 `docs/refactor/2026-09-26-npm-audit-remediation.md`、`Firefly_DIFFERENTIAL_REVIEW_2026-09-26.md`；本报告记录当前重跑结果及对 `origin/main` 的区别，不替代两份逐包资料。

## 当前 npm audit 现场

CI `Test` 工作流在仓库根目录使用 Node 24、`npm ci --foreground-scripts`，审计命令是 `npm audit --omit=dev --json > npm-audit-prod.json`。工作流已有 `continue-on-error: true`，本轮没有修改。当前本机为 Node `v24.19.0`、npm `11.17.0`，锁文件为 v3。审计 JSON 与 stderr 保存在仓库外 `E:\Codex\Firefly-npm-audit-20260926\`。

| 实际命令 | 原始退出码 | critical | high | moderate | low | 解析及错误情况 |
|---|---:|---:|---:|---:|---:|---|
| `npm audit --omit=dev --json` | 1 | 0 | 1 | 0 | 0 | JSON 正常解析，无错误字段，stderr 为空 |
| `npm audit --json` | 1 | 0 | 1 | 0 | 0 | JSON 正常解析，无错误字段，stderr 为空 |

唯一告警包是直接生产依赖 `extract-zip@2.0.1`（`package.json` 与锁文件；`npm explain extract-zip` 为根项目直依赖），同一包对应两份 high 公告，不是两个受影响包：

| 公告 | 漏洞与受影响版本 | 当前修复版本 | 依赖链与运行路径 |
|---|---|---|---|
| [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) | 未验证的符号链接目标可导致路径穿越；`<=2.0.1` | 公告与 npm audit 均未给出修复版，`fixAvailable: false` | `firefly-agent` → `extract-zip@2.0.1`；用户插件/Skills ZIP、旧 Skills 迁移及打包脚本均调用该包 |
| [GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3) | 先创建符号链接再写同名文件可写出解压目标；`<=2.0.1` | 公告与 npm audit 均未给出修复版，`fixAvailable: false` | 同上 |

真实调用点与边界：`src/plugins/installer.ts` 的用户插件安装已检查路径、重复条目、链接、大小预算、加密条目和暂存目录；`src/main/skills/snapshot-install.ts:60`、`src/main/migration/skill-snapshot.ts:61`、`scripts/packaging/prepare-mingit.mjs:22`、`scripts/packaging/build-skills-snapshot.mjs:67` 在 `onEntry` 调用 `src/shared/zip-entry-policy.ts:1`，拒绝 UNIX symlink 条目。迁移入口仍作哈希校验和失败清理；MinGit 归档仍作哈希验证。相关恶意 ZIP 测试已记录于前述修复报告。没有证据证明上述拒绝器覆盖已有本地符号链接、并发替换和其他归档攻击形态；也没有在当前机器执行跨平台真实安装攻击验证。不得将包告警或剩余利用风险标记为已消除。

审计退出码 1 是漏洞告警，而不是网络、权限或 JSON 配置错误。CI 的现有 `continue-on-error: true` 会使审计步骤原始失败而 `Test` 工作流仍可成功；这是基准分支既有策略，不是本分支引入的安全回归，也不代表审计通过。当前任务不调整 CI 策略。

## 分支安全差异核对

| 位置 | 相对 `origin/main` 的变化与证据 | 结论与覆盖限制 |
|---|---|---|
| `package.json`、`package-lock.json` | `890bc61` 更新前述报告中的受影响依赖，移除无调用的 `nut-js`；当前完整与生产审计均只剩 `extract-zip` | 其他已列问题未在当前锁文件复现；真实第三方服务和全部平台未实测 |
| `src/shared/zip-entry-policy.ts` 及四个解压入口 | 新增 `rejectZipSymlink`，在提取条目前按 UNIX mode 拒绝链接；测试检查拒绝原因和外部文件不变 | 缩小已知攻击路径；不等于底层包得到修复 |
| `src/main/channels/inbound-server.ts:37` | 停止接受旧品牌请求头，仍用 `timingSafeEqual` 校验当前头；`src/main/channels/inbound-server.test.ts` 覆盖旧头和错误值被拒 | 已检查的身份校验没有放宽；没有真实外部渠道联调 |
| `src/main/plugin-panel-protocol.ts`、`src/renderer/settings/panel-bridge-protocol.ts` | 移除旧品牌 scheme/协议；面板文件仍用 `realpath` 加相对路径限制，桥接仍校验来源和版本 | 已核对相关契约测试；第三方插件实际运行未实测 |
| `src/main/channels/outgoing-composer.ts:135` | 用户贴图清单先于内置贴图解析；本地文件仍走 `src/main/sticker-protocol.ts:32` 的目录解析限制 | 用户贴图与内置 ID 冲突时行为改变；该路径未新增任意文件名拼接，符号链接目标真实性未由该函数核验 |
| `src/main/orchestrator/sandbox/sandbox-exec.ts:432` | 改用 `src/shared/firefly-environment.ts:17`，函数仍直接读取传入环境的指定 `FIREFLY_*` 键 | 本差异未更改沙箱策略；未做完整沙箱渗透测试 |

本轮差异审查未找到已证实的新鉴权绕过或路径逃逸；这不是对全部 206 个文件或全部依赖节点的完整安全认证。仓库没有开放 PR，因此审查对象是上述明确基准的分支差异。

## 最小后续处置顺序

1. **当前无兼容修复版：**继续保留各入口的链接拒绝、路径约束、暂存/清理和归档哈希校验，不把审计 exit 1 解释为成功；对不受信任归档保留风险提示。插件 ZIP 和 Skills 归档可由用户提供，因此生产调用路径实际存在；当前保护下是否仍可利用上述两种具体攻击未验证。
2. **上游发布同主版本修复时：**核对公告、版本与锁文件后进行最小更新，跑恶意归档定向测试、构建和 `npm audit`；现时不能指定一个不存在的修复版本。
3. **若长期无修复版：**评估受维护的 ZIP 提取实现替换，先核对其条目事件、链接/路径语义及迁移兼容性，再修改调用方并验证多平台；这不是本轮获授权的依赖升级。
4. **CI 门禁：**现有报告型审计策略需要单独的产品决策。不能为制造绿色结果而 ignore、降低阈值或吞掉退出码；本轮未修改策略。

本次只新增项目工作规则与此报告，未升级依赖、改业务代码或改 CI。未重复运行全量测试/构建；上次开发分支 CI 的完整测试成功记录不能代替本次审计退出码 1。
