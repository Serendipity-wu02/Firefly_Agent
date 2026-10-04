# 2026-10-04 第一批目录扁平化验证

基线：`64a712e00e1814efc67ab1914e0738c43aa9445e`。
隔离分支：`refactor/flatten-native-installer`。
工作树：`E:\Codex\2026-10-04\task-6\structure-flatten`。

## 授权范围与移动表

沿用委派任务中已批准的 §16 第一批机械目录清理；没有重新开展迁移设计。

| 原路径（本批历史记录） | 当前路径 | 文件数 |
| --- | --- | ---: |
| `native/firefly-screenshot/Cargo.toml` | `native/Cargo.toml` | 1 |
| `native/firefly-screenshot/Cargo.lock` | `native/Cargo.lock` | 1 |
| `native/firefly-screenshot/.gitignore` | `native/.gitignore` | 1 |
| `native/firefly-screenshot/src/` | `native/src/` | 19 |
| `native/firefly-screenshot/tests/` | `native/tests/` | 6 |
| `build/installer/installer.nsh` | `build/installer.nsh` | 1 |

共 29 个文件通过 `git mv` 移动，Git 识别为 `R100`；移动文件的 Git blob 与基线一致。
`core.autocrlf=true` 的工作树换行转换不构成源码内容变更。旧空目录已移除。

路径消费者修正：截图 helper 构建脚本、开发态 helper 解析函数和测试、
electron-builder NSIS include、打包配置测试、现有结构测试和 `.gitignore` 白名单。
更新 DEVELOPMENT、运行结构与 task-a 当前验证文档的实际路径；历史归档保持原记录。

Rust crate 与二进制仍为 `firefly-screenshot`，发布资源仍由
`resources/bin/firefly-screenshot.exe` 复制到 `bin/firefly-screenshot.exe`。
SDK、依赖与许可文件、模型素材、Main/Preload/Renderer 边界、B1 start/setup/CLI 文件、
权限 backend 与 `workspace-boundary.ts` 未修改。没有读取或修改真实 userData。

## 验证证据

日志保存在 `E:\Codex\2026-10-04\task-6`；本批未安装或下载依赖。

| 命令或检查 | 结果 | 证据 |
| --- | --- | --- |
| 新开发路径预期，解析函数尚未修改 | RED：1 失败、8 通过；失败为旧开发路径 | `paths-red-approved.log` |
| `node node_modules/vitest/vitest.mjs run src/main/screenshot src/main/structure-cleanup.test.ts` | GREEN：5 文件、32 测试通过 | `paths-green.log` |
| `node --test scripts/packaging/electron-builder-config.test.mjs` | 9 测试通过 | `packaging-config-tests.log` |
| `cargo test --locked --offline --manifest-path native/Cargo.toml --lib --test display_contract --test geometry_contract --test protocol_contract --test request_lifecycle` | 63 测试通过；同组基线也通过 | `rust-contract-tests.log`、Temp 下 `rust-baseline-approved.log` |
| `cargo test --locked --offline --manifest-path native/Cargo.toml --no-run` | 全部 8 个测试目标编译通过 | `rust-all-tests-compile.log` |
| `cargo metadata --locked --offline --no-deps --manifest-path native/Cargo.toml --format-version 1` | 新 manifest、crate 与 binary 身份核对通过 | `cargo-metadata.json` |
| `npm run build:screenshot-helper`，`CARGO_NET_OFFLINE=true` | 通过；新 manifest 构建并暂存 647168 bytes Windows EXE | `build-screenshot-helper.log` |
| `npm run verify:screenshot-helper` | 通过；MZ 与大小检查 | 本次命令输出、资源复制记录 |
| `npm run build` | exit 0；storage boundary、Main、Preload、CLI、Renderer 均完成 | `build.log` |
| `npm run check:renderer` | exit 0 | `renderer-types.log` |
| `FIREFLY_TEST_BASH=E:\Git\bin\bash.exe; ./scripts/ci/run-vitest.ps1` | exit 0；608 文件通过，5971 测试通过、2 个既有跳过；334.40s | `full-suite.log` |
| `node ../check-packaging-resources.mjs`（本次临时验收脚本） | 实际 electron-builder FileMatcher/copyFiles 复制 EXE，SHA-256 一致；include 存在；crate/binary 保持 | `packaging-resource-check.log` |
| 完整实际引用搜索（含拆分 path.join 与转义路径） | 现行源码/配置/文档无遗漏；旧路径仅在归档与本报告移动表 | `reference-search.log`、独立审查 |
| Git 移动/忽略/差异检查 | 29 个 R100；新 NSIS 源文件可跟踪；native target、exe、build 输出继续忽略；diff check 通过 | `rename-evidence.log`、独立审查 |

资源副本 SHA-256：`bbe40f69bb232c520015d7bed164ac30f67bdc63ec1e5a6689289e54b77befca`。

全量测试重写了既有工具快照的换行/文件状态，Git 内容 diff 为空；本批恢复该文件，
不把无关测试产物纳入提交。既有 2 个跳过没有新增或修改。

## 独立审查与环境限制

独立只读审查确认 29 个移动文件的 Git blob 与基线一致，完整路径、转义路径与拆分路径
消费者同步，没有 Critical / Required 发现。没有执行安装、推送、PR、合并或部署。

E 盘初始可用空间不足；仅移除本任务不完整依赖副本后恢复空间，其他任务文件未清理。
已安装依赖复制到 `C:\Users\w1558\AppData\Local\Temp\firefly-task6\node_modules`，
Rust 产物放在同目录的 `rust-target`，经本任务本地 junction 接入；这些产物不提交。
受限运行出现 MSVC 临时文件和 Vitest/资源检查 Temp 写权限错误，随后同一检查在
获准 `require_escalated` 环境通过；没有审批拒绝，也没有修改权限逻辑或测试门槛。

没有真实 NSIS 打包：本机未发现 NSIS 可执行文件或完整缓存，资源输入
`resources/mingit` 缺失；未下载工具、准备未知依赖或更改系统设置。
没有运行会改变桌面/剪贴板的 `capture_gdi_smoke` 与 `windows_smoke` 交互测试；
它们已编译通过。没有安装器安装/升级验收或跨平台验证。
Vite 保留既有 large-chunk warning，质量门槛未调整。
全量测试输出包含既有 React act/Notification、mpv 不可用 fixture、日志与存储边界告警，
测试退出码为 0，不将告警解释为桌面运行验收。
