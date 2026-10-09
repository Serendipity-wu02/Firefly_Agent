# 原生截图模块与安装器目录扁平化验证

> 证据阶段：2026-10-04
> 文档整理：2026-10-07；仅整理既有证据，未重跑测试。
> 适用边界：下述实现、通过项与 HOLD 均指记录阶段，不代表当前产品状态。

## 1. 背景与变更边界

本阶段为机械目录整理，不重新设计迁移，不改变 Rust crate/binary、模块职责或运行边界。

| 原路径 | 整理后路径 | 文件数 |
| --- | --- | ---: |
| `native/firefly-screenshot/Cargo.toml` | `native/Cargo.toml` | 1 |
| `native/firefly-screenshot/Cargo.lock` | `native/Cargo.lock` | 1 |
| `native/firefly-screenshot/.gitignore` | `native/.gitignore` | 1 |
| `native/firefly-screenshot/src/` | `native/src/` | 19 |
| `native/firefly-screenshot/tests/` | `native/tests/` | 6 |
| `build/installer/installer.nsh` | `build/installer.nsh` | 1 |

29 个文件的内容保持一致，Git 移动识别均为 R100。工作树换行转换不计为源码内容变更。同步更新截图 helper 构建脚本、开发路径解析及测试、electron-builder NSIS include、打包配置/结构测试和 `.gitignore` 白名单；文档路径同步，历史材料按历史语义解释。

crate/binary 仍为 `firefly-screenshot`，资源仍从 `resources/bin/firefly-screenshot.exe` 复制到 `bin/firefly-screenshot.exe`。SDK、依赖许可、模型素材、Main/Preload/Renderer 边界、B1 start/setup/CLI、权限 backend、`workspace-boundary.ts` 和真实 userData 不在变更范围。

## 2. 技术反例与最终验证

路径回归先证明旧开发路径不满足新位置（1 failed / 8 passed）；随后仅修正路径消费者。最终验证如下，均为该阶段实测。

| 检查 | 结果 |
| --- | --- |
| screenshot 与 structure-cleanup Vitest | 5 files / 32 passed |
| `node --test scripts/packaging/electron-builder-config.test.mjs` | 9 passed |
| Rust lib/display/geometry/protocol/request_lifecycle，locked/offline | 63 passed；移动前同组也通过 |
| `cargo test --locked --offline --manifest-path native/Cargo.toml --no-run` | 全部 8 个测试目标编译通过 |
| cargo metadata，locked/offline/no-deps | manifest/crate/binary 身份正确 |
| `npm run build:screenshot-helper`，`CARGO_NET_OFFLINE=true` | 构建并暂存 647168 bytes Windows EXE |
| `npm run verify:screenshot-helper` | MZ 与大小检查通过 |
| `npm run build`、`npm run check:renderer` | exit 0；storage boundary、Main/preload/CLI/renderer 完成 |
| 既有完整 Vitest runner | 608 files / 5971 passed / 2 existing skipped；exit 0，334.40s |
| electron-builder 实际 FileMatcher/copyFiles 临时验收 | EXE 复制 SHA-256 一致、include 存在、crate/binary 身份保持 |
| 引用与版本控制检查 | 完整/转义/拆分路径消费者一致；29 个 R100；NSIS 可跟踪，target/EXE/build 继续忽略；diff check 通过 |

资源副本 SHA-256：`bbe40f69bb232c520015d7bed164ac30f67bdc63ec1e5a6689289e54b77befca`。独立只读审查无 Critical/Required，核对移动内容及全部路径消费者。

## 3. 验收限制与后续要求

依赖来自已安装副本，Rust 产物使用独立临时目标目录；未安装或下载依赖。受限执行曾出现 MSVC/Vitest/资源检查临时写权限错误，同一检查在正常执行权限下通过，未改权限逻辑或测试门槛。完整测试产生的既有快照没有内容变化，未纳入变更。

未执行真实 NSIS 打包：缺 NSIS 可执行文件/完整缓存与 `resources/mingit` 输入。`capture_gdi_smoke`、`windows_smoke` 只编译，未执行会改变桌面/剪贴板的交互测试。未做安装/升级或跨平台验收。Vite large-chunk、React act/Notification、mpv fixture、日志/存储边界等既有警告保留；exit 0 不等于桌面运行验收。

后续验收应在具备合法安装器输入和隔离桌面的环境中补齐，不能从机械移动与编译通过推导安装器可交付。原始日志保存于当时仓库外的专用证据目录，正文不将其表示为仓库内文件。
