# Firefly 迁移最终收尾（2026-09-25）

本记录是 [Batch 6 总表](./firefly-batch6-implementation-2026-09-25.md) 的增量收口，不改写该报告当时“截图助手缺失”的历史事实。Batch 1–5 的已验证能力沿用原记录；本轮没有开始新功能、替换 Harness 或接入 Jev/DecisionProvider。未修改旧 `Firefly-Pet` 仓库及其用户数据，未暂存、提交、推送或发布。

## Cargo 与本地打包

- `scripts/build/screenshot-helper.mjs` 原样使用 `spawnSync("cargo", ["build", "--release", "--locked", ...])`。起初当前进程 PATH 找不到 `cargo`／`rustc`，用户目录没有 Cargo 可执行文件，Rustup 安装记录及可用 MSVC 构建组件也不存在。因此此前的 `ENOENT` 在本机是**工具链确实缺失**，而非仅 PATH 漏配。
- 经用户明确授权，通过 WinGet 安装 `Rustlang.Rustup` 1.29.1 与 Visual Studio Build Tools 2022 的 C++ 工作负荷及推荐组件；实际获得 Cargo 1.98.1、rustc 1.98.1、`stable-x86_64-pc-windows-msvc` 与可被 `vswhere` 检测的 MSVC x64/x86 工具。构建命令只在本次 PowerShell 进程把用户 Cargo 目录加到 PATH；没有手工修改系统级 PATH 或仓库构建脚本。Rustup 安装器将 Cargo 目录加入用户级 PATH。
- `npm run build:screenshot-helper` 成功，暂存二进制为 `resources/bin/cyrene-screenshot.exe`，647,168 字节。随后运行仓库正式 `npm run package:win:dir -- --publish never`：Main／Preload／CLI／Renderer 构建、原助手构建、MinGit 准备及 `electron-builder --win --dir --publish never` 均返回成功。产物是 `release/win-unpacked`；**没有生成 NSIS 安装器、`latest.yml` 或远程发布**，没有覆盖安装旧应用。
- 实际 `release/win-unpacked/resources/bin/cyrene-screenshot.exe` 存在，SHA-256 与构建暂存件一致。直接启动**包内二进制**收到 `ready`、协议版本 1，并以 `shutdown` 正常退出。Rust 现有 Windows 集成测试调用同哈希的 release 二进制，在最大化的空白 Paint 测试窗口上实际执行截取、剪贴板写入、文件编码及再次开始：`capture-released`／`completed` 成功，生成 112×72、1,049 字节的有效 PNG；临时 PNG 已核验并删除，未上传截图。当前桌面会话使用 GDI 回退，测试日志未显示 DXGI 成功，不能据此声称 DXGI 路径通过。此测试会把公开截图写入系统剪贴板。
- 本地包的 `prompts/moments_personas/` 有 7 份现用文档；asar 路径检查没有用户设置／历史、旧模型、已停用网易云运行模块或旧角色头像资源。`release/win-unpacked/Firefly.exe` 启动后有主窗口及 Chat 窗口；该包未做安装器行为或全部功能验收。启动会在产物根目录生成 `debug.log`，须在应用正常退出后移除该本地日志再交付产物，不能在进程占用时误报已清理。

Rust 对 Windows MSVC 目标的工具链要求见 [Rust 官方安装说明](https://rust-lang.org/tools/install/)；所安装 C++ 工作负荷的组件清单见 [Microsoft Build Tools 文档](https://learn.microsoft.com/en-us/visualstudio/install/workload-component-id-vs-build-tools?view=vs-2022)。

## 数据迁移核对

- 沿用前次“目标不存在时复制、旧目录保留备份”的已完成迁移，**本轮没有再次复制或覆盖**。`src/main/app-identity.ts` 在启动及单实例锁前把 userData 指向 `%APPDATA%\Firefly`，`src/main/settings-store.ts` 与 `src/main/chats/chats-store.ts` 都从该目录解析持久化文件。本地包的运行进程路径确认为当前 `release/win-unpacked/Firefly.exe`，不是旧 Firefly。
- 新旧目录的 `app-settings.json`、`model-settings.json`、`cyrene-chats/index.json` 均存在且哈希仍一致；新目录有 10 个会话文件，索引中 Chat 6 条、Work 4 条；模型设置 schema 为 2，持久化模型档案 1 项，默认档案及当前 Provider 均存在。只记录结构与数量，没有输出模型名、地址、密钥、会话标题、正文或记忆。
- 完整产物初次重开后，用户截图显示模型档案、Chat 与 Work 列表均为空。针对这一反馈，已核对进程确为当前 `release/win-unpacked/Firefly.exe`，运行账户为 `w1558`，子进程的 `--user-data-dir` 指向 `%APPDATA%\Firefly`；包内编译入口先调用 `configureFireflyApplicationIdentity`。目标目录当时仍有 1 项已配置模型档案且默认档案匹配，会话索引中 10 项元数据格式有效、10 个对应会话文件均存在；本轮没有重新复制或覆盖数据。用户随后从托盘正常退出，重新启动同一本地包，并确认**模型档案与 Chat／Work 历史已恢复显示**。首次空列表的原因未确定，不能据一次恢复就声称此瞬态不会再发生。自动桌面窗口控制始终返回 `foreground window did not report a process id`，因此界面结论来自用户实机确认，不是自动控制验收。
- `%APPDATA%\Firefly-Cyrene-Base` 继续保留为备份；原 `Firefly-Pet` 用户数据未动。朋友圈默认开关仍为 `false`，本轮未修改用户当前的任何开关或历史。

## 朋友圈角色资料与画像

- 实际 `loadCharacterPersonas` 的入驻名单为现有 `TASK_CHARACTERS` 与 `prompts/moments_personas/<姓名>.md` 的交集；它仍按原格式解析档位、按需读取角色卡，并经原服务／IPC／权限闸门执行。本批不改变子任务角色池、任务职责、工具权限、朋友圈存储键、世界书或用户记忆。
- 旧目录在 Batch 6 删除的是黄金裔／昔涟角色卡，不能直接作为新角色资料恢复。现有 `prompts/worldbook/firefly-relations.md` 和 `world.md` 明确支持**卡芙卡、银狼、刃、艾利欧、知更鸟、帕姆**六位。已补这六张克制的朋友圈卡和共享 `_header.md`，只写来源已有的身份／原作关系与当前用户经历边界；未虚构社交亲密度、口头禅、专属工具能力或活跃档位。未设档位时沿用原加载器的默认值。
- `src/renderer/react/character-avatars.ts` 现在从同一份 `src/shared/task-characters.ts` 名单取得姓名与文件名，经 `character-portraits.ts` 复用 12 张已接入的 `src/renderer/tast/` 项目图片；`卡芙卡` 仍使用实际素材文件 `卡夫卡.png`，显示名不再误写。旧历史角色未被重写，也不回退到错误头像。删除已无引用的 `src/renderer/react/avatars/` 13 张历史小头像和 `src/renderer/tast/` 11 张旧 task 图；现用 task 资源恰为 12 张，旧图不在 Renderer 构建资源中。
- **仍缺朋友圈卡**：大黑塔、丹恒、姬子、三月七、瓦尔特、星期日。现有 Firefly 世界书没有足够的该六位独立角色资料与社交表达依据；任务展示素材不是角色人设，不自动为他们开启朋友圈发言。若要补齐，需用户提供每人的可靠身份／表达来源及希望的朋友圈互动边界。六张现有卡的专属语气和互动频率也未由来源给出；目前只使用共享场景约束及原加载器默认档位。朋友圈保持默认关闭。

## 验证与发布边界

- 本轮受影响测试：角色卡真实目录加载、旧角色排除、12 头像映射、任务角色资源、任务展示等定向测试先后 42 项与 14 项通过；Renderer 类型检查通过。完整本地打包流程包含一次 Main／Preload／CLI／Renderer 构建；删除未被引用且不在包内的 11 张旧 task 源图后，仅复测受影响角色与资源测试，没有重复打包。此前 491 个测试文件、4330 通过／1 跳过的完整测试记录继续有效，本轮未重跑。
- **迁移代码**：上述新增角色资料、头像映射及截图助手构建收口。**本地包**：可启动，截图助手在包内且真实调用验证通过；用户实机确认再次重开后模型档案与 Chat／Work 历史已显示。首次重开曾短暂呈现空列表，原因未确定，列为后续观察项，不把一次恢复写成已证明长期稳定。**公开发布**：仍未满足素材再分发授权归档、安装器产物及更新元数据检查；自动更新继续关闭。
- 已知未覆盖项继续保持：真实 GPT-SoVITS 合成／播放／停止，Firefly 内 QQ Music 工具审批链，全视觉状态，12 位任务角色逐一实机展示，持续 60 FPS 实测。模型原作者授权的具体文字、覆盖文件及头像／任务画像再分发范围仍需发布前确认。

## Git

工作树保留所有 Batch 1–6 与本轮累计修改；`main` 的 HEAD 仍为本地基线 `46610b9df82eecbfea03dffe7de1f340bf42080c`，`origin` 仍指向 `https://github.com/Serendipity-wu02/Firefly_Agent.git`。没有暂存、提交、推送、拉取合并或发布；remote 不代表旧仓库历史已合并。最终数量以交付时 `git status --porcelain=v1 -uall` 为准。
