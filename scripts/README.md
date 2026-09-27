# 项目脚本

这些脚本是项目的构建、打包与验证入口；脚本源码需要提交到 Git。

| 目录 | 用途 | 常用入口 |
| --- | --- | --- |
| `build/` | 构建 CLI 与原生截图辅助程序 | `npm run build:cli`、`npm run build:screenshot-helper` |
| `packaging/` | 准备 MinGit、Skills 快照及可选本地 mpv | `npm run prepare:mingit`、`npm run prepare:skills`；后者重建快照，非日常验证命令 |
| `verify/` | 手动或自动验证构建产物及运行链路 | `npm run verify:screenshot-helper`、`npm run smoke:music` |
| `ci/` | Vitest runner 与 worker 退出取证 | `./scripts/ci/run-vitest.ps1`；会运行测试 |
| `perf/` | Chat Renderer 性能基线与记录处理 | `npm run perf:chat-baseline` |
| `plugin-sdk/` | 本地 SDK、清单 schema 与示例验证 | `npm run check:plugin-sdk`、`npm run check:plugin-schema`、`npm run test:plugin-examples` |

`packaging/prepare-mingit.mjs` 会根据 `vendor/mingit-manifest.json` 下载、校验并解压 MinGit 到 `resources/mingit/`。该目录是本地打包输入，已被 `.gitignore` 忽略。

`npm run smoke:music` 只读取 Windows QQ Music 桌面会话状态，不改变播放。发布包通过 `electron-builder.yml` 携带 `qqmusic_gsmtc.ps1`；旧网易云组件与 mpv 不再进入有效打包链。

该命令先运行 `build:main`，然后启动 Electron 中的 `src/main/music/music-smoke-entry.ts`。没有 QQ Music 会话时 `QQ_MUSIC_SESSION_NOT_FOUND` 也返回退出码 0，因此成功退出不证明播放器控制或应用内审批通过。

`npm test` 不扫描 `scripts/**/*.test.mjs`。这些文件使用 Node 测试入口，例如 `node --test scripts/packaging/electron-builder-config.test.mjs`；SDK 示例由上表的专用命令执行。`scripts/install-bge-reranker.ps1` 是显式模型安装入口，不属于普通构建步骤。执行前阅读脚本，核对下载、写入和运行前提。

MinGit 与 Skills 快照脚本调用 `src/shared/zip-extraction.ts`，底层 ZIP 解析使用 `yauzl@3.4.0`。验证记录见 [文档与依赖汇总](../docs/refactor/2026-09-26-documentation-dependency-closeout.md)，脚本说明不代表整体安全或发布验收通过。

`npm run prepare:skills` 现在也会对既有 ZIP 应用 `packaging/skill-adaptations/` 中经过核查的 Firefly 适配。`packaging/adapt-skills-snapshot.mjs` 用已声明的开发依赖 JSZip 生成固定顺序、时间戳和压缩设置的归档；输入和输出均经现有安全解压校验。manifest 区分原来源、此前产品归档和本次产物 SHA，记录每个适配文件的哈希。不会下载或执行第三方安装脚本；本地备份与取证目录不进入产物。

`node --test scripts/packaging/adapt-skills-snapshot.test.mjs` 验证可重复构建、未适配条目的字节保持和最终 ZIP 内的文件链接及标题锚点；这里只验证本地引用，不替代远程 URL 或全部脚本功能验证。
