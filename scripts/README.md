# 项目脚本

这些脚本是项目的构建、打包与验证入口；脚本源码需要提交到 Git。

| 目录 | 用途 | 常用入口 |
| --- | --- | --- |
| `build/` | 构建 CLI 与原生截图辅助程序 | `npm run build:cli`、`npm run build:screenshot-helper` |
| `packaging/` | 准备 MinGit、校验 Skills 目录及可选本地 mpv | `npm run prepare:mingit`、`npm run validate:skills`；后者只校验，不生成归档 |
| `verify/` | 手动或自动验证构建产物及运行链路 | `npm run verify:screenshot-helper`、`npm run smoke:music` |
| `ci/` | Vitest runner 与 worker 退出取证 | `./scripts/ci/run-vitest.ps1`；会运行测试 |
| `perf/` | Chat Renderer 性能基线与记录处理 | `npm run perf:chat-baseline` |
| `plugin-sdk/` | 本地 SDK、清单 schema 与示例验证 | `npm run check:plugin-sdk`、`npm run check:plugin-schema`、`npm run test:plugin-examples` |

`packaging/prepare-mingit.mjs` 会根据 `vendor/mingit-manifest.json` 下载、校验并解压 MinGit 到 `resources/mingit/`。该目录是本地打包输入，已被 `.gitignore` 忽略。

`npm run smoke:music` 只读取 Windows QQ Music 桌面会话状态，不改变播放。发布包通过 `electron-builder.yml` 携带 `qqmusic_gsmtc.ps1`；旧网易云组件与 mpv 不再进入有效打包链。

该命令先运行 `build:main`，然后启动 Electron 中的 `src/main/music/music-smoke-entry.ts`。没有 QQ Music 会话时 `QQ_MUSIC_SESSION_NOT_FOUND` 也返回退出码 0，因此成功退出不证明播放器控制或应用内审批通过。

`npm test` 不扫描 `scripts/**/*.test.mjs`。这些文件使用 Node 测试入口，例如 `node --test scripts/packaging/electron-builder-config.test.mjs`；SDK 示例由上表的专用命令执行。`scripts/install-bge-reranker.ps1` 是显式模型安装入口，不属于普通构建步骤。执行前阅读脚本，核对下载、写入和运行前提。

MinGit 和插件归档仍使用共享的 `src/shared/zip-extraction.ts` 安全解压层；Skills 直接从受校验的目录分发，不经 ZIP。安全维护入口见 [依赖与归档说明](../docs/security/dependency-management.md)，脚本说明不代表整体安全或发布验收通过。

`npm run validate:skills` 检查正式 `vendor/firefly-skills/skills/` 的 41 项、项目 `skills/` 的四项、目录安全及 `skills-manifest.json` 固定的文件哈希。`packaging/skill-adaptations/` 和旧归档元数据仅保留来源与迁移识别依据，不在构建时重写正式目录。不会下载或执行第三方安装脚本；本地备份与取证目录不进入产物。

`node --test scripts/packaging/validate-skills.test.mjs scripts/packaging/electron-builder-config.test.mjs` 验证目录、哈希和打包资源规则；这些检查不替代实际运行或外部服务验收。

## 显式人工维护入口

- `packaging/upstream-skills/fetch_skills.py`：固定来源获取，先阅读同目录 README 并运行 `--plan`；不参与普通构建或应用 Skills 扫描，不自动执行第三方脚本。
- `verify/sandbox-runtime/check-status.mjs`：独立沙箱状态检查；同目录 `install.mjs` 会触发 UAC 和系统配置，`run-cmd.mjs`、`boundary-test.mjs` 会执行隔离命令，均非普通验证入口，本轮不执行。
- `packaging/prepare-mpv.mjs`、`verify/mpv-helper.mjs`：可选音频辅助准备与人工检查，不恢复网易云播放器，也不进入默认打包。
- `perf/recording.mjs`：性能录像处理 helper，由性能 runner 和对应 Node 回归使用；默认指标写入已忽略的 `output/perf/`。
- `install-bge-reranker.ps1`：需显式决定的模型下载，不自动安装或修改用户配置。
