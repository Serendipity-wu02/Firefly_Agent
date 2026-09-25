# Firefly 迁移总表与 Batch 6 收口（2026-09-25）

本记录基于当前工作树、Batch 1–5 实施记录及本批实际构建与本地包检查。新底座仍是唯一运行架构；未引入第二套 Agent Loop、授权所有者、Memory 服务或 Jev/DecisionProvider。旧 `Firefly-Pet` 仓库及其用户数据未修改。本轮未提交、推送、发布或安装覆盖旧应用。

## Batch 1–6 迁移状态

| 批次 | 复用的新底座能力 | 已实施的 Firefly 适配 | 验证边界 |
| --- | --- | --- | --- |
| 1：角色与 Chat | Electron 入口、Agent Loop、工具、审批、设置、状态与导航 | 流萤模型及头像、结构化人设、各模式提示词、用户称呼、Chat 单次发送与终态；朋友圈默认关闭 | 构建、测试及真实 Chat 证据见 Batch 1 记录；不以角色自称代替整条提示词链验证 |
| 2：桌宠交互 | Live2D 加载、动作工具与权限链 | 真实模型的点击、动作、表情、复位与心情映射 | Chat 工具触发 `Tap/1`、完成并返回 `Idle/0` 有实机回执；连续点击及真实心情事件仅有自动测试覆盖 |
| 3：Work 与任务展示 | Work 队列、文件读取、权限、取消、历史及子任务执行链 | 本次文件读取证据、部分读取确认、Markdown 导出、自动派发；12 位任务角色头像映射 | 公开样本的完整／部分读取、预检失败、导出／取消及自动派发有实机记录；执行中失败和覆盖保存仅有测试；12 位未逐一实机展示 |
| 4：语音与音乐 | TTS 配置／播放／取消、工具注册和授权、通用设置 UI | 通用 GPT-SoVITS 接入流萤语音配置；QQ Music 状态与控制；移除网易云运行入口；绿色主题与称呼细节 | QQ 桥经许可观察到 `Playing → Paused → Playing`；Firefly 界面内音乐工具审批链未实机验收；语音服务未配置，真实合成／播放／停止未验收；视觉状态未全覆盖 |
| 5：知识与拖动 | worldbook 按需触发／预算、原窗口与 Pixi 渲染循环 | 流萤关系知识去重接入、当前用户经历边界、桌宠拖动二次延迟移除 | 实际知识文件加载／触发由确定性测试覆盖；用户确认拖动、松手和点击正常；目标 60 FPS 尚无持续帧率测量 |
| 6：身份、资源与本地包 | 现有 Electron 打包、单实例与持久化机制 | Firefly 身份、用户数据目录迁移、旧资源和停用网易云代码清理、发布规则与许可说明收口 | 完整测试和构建通过；本地解包产物可启动，但缺少截图助手，故**本地包尚不完整，也不具备发布条件** |

各批次的具体源码和实机证据分别见相邻 `firefly-batch1-implementation-2026-09-23.md` 至 `firefly-batch5-implementation-2026-09-25.md`。此前记录中“Batch 4 未删除的网易云源码”已由本批真实引用核对后删除；本批未重做音乐授权链。

## Batch 6 源码与资源

| 位置 | 本批处理及原因 |
| --- | --- |
| `package.json`、`package-lock.json`、`electron-builder.yml` | npm 包名为用户确认的 `firefly-agent`，Windows appId 为 `com.serendipitywu02.firefly`，显示名 `Firefly`；主页和反馈指向用户仓库；`publish: []` 保留，自动更新不启用。`build:main` 在编译前清除旧 Main 输出，防止已删除的网易云模块留在产物中。 |
| `src/main/app-identity.ts`、`src/main/index.ts`、`build/installer/installer.nsh`、`src/main/external-content-migration.ts` | 启动时在单实例锁和设置初始化前将 userData 设为 `%APPDATA%\Firefly`；安装器选项也写入同一目录，不随包名写回旧 Firefly 目录；外部内容暂存名与 Firefly 身份一致。原存储键／IPC 未机械改名，保留兼容。 |
| `src/main/music/`、`src/main/windows/`、`src/renderer/music/`、`src/renderer/settings/music/`、`vendor/cloud-music-mcp/`、相关打包脚本 | 删除已停用的网易云专用 Main、窗口、设置和 vendor 路径；保留真实生效的 QQ Music 服务与桥脚本，以及飞书转码依赖的通用 `mpv-controller.ts`。通用 `MUSIC_OPEN_PLAYER` 仍打开 QQ Music 设置，没有双 Provider 回退。 |
| `prompts/moments_personas/`、`src/renderer/public/models/cyrene/`、`assets/models/cyrene/`、旧头像／图标／贴纸及状态图片 | 按实际加载和引用清理未使用的旧角色资料与模型图片；朋友圈仍默认关闭。仍被 Moments 组件引用的 `src/renderer/react/avatars/` 历史画像没有误删，其再分发权利仍待核实。 |
| `MODEL_LICENSE.md`、`THIRD_PARTY_NOTICES.md`、`README.md`、`README.en.md` | 上游 MIT 版权、第三方来源及历史昔涟模型授权声明保留；明确该授权不适用于流萤素材。记录外部语音服务和用户数据目录，不将用户确认“已获授权”扩写为未提供的再分发条款。 |
| `src/main/app-identity.test.ts`、`src/main/external-content-migration.test.ts`、`scripts/packaging/electron-builder-config.test.mjs`、`src/main/orchestrator/harness/tool-dispatcher.test.ts` | 同步精确身份、安装规则及当前角色名单的有效断言，未删除测试来获得通过。 |

`cyrene` CLI 命令、部分 `cyrene-*` 存储键／IPC／资源标识、`cyrene-skills` 和仍在使用的上游来源模块属于兼容或运行标识，不能按产品改名批量替换。历史审计报告仍保留原始记录。产品界面不因此继续展示昔涟品牌。旧模型文件与网易云生效路径已从当前打包输入移除；仍生效的历史画像不能宣称已清除。

## 用户数据迁移

- 迁移前核对：`%APPDATA%\Firefly-Cyrene-Base` 存在，`%APPDATA%\Firefly` 不存在；新 Firefly 已由用户从托盘正常退出，进程数为零。其他目录未修改。
- 在目标不存在时只复制所需数据；排除 `Cache`、`Code Cache`、`DawnGraphiteCache`、`DawnWebGPUCache`、`GPUCache`、`Shared Dictionary`、`LOCK`、`lockfile` 及可重建日志。旧目录完整保留作备份，未覆盖或自动混合目标。
- 复制时核对 327 个文件的数量和大小；`app-settings.json`、`model-settings.json`、`cyrene-chats/index.json` 在源／目标的 SHA-256 一致。包含任务与运行历史的持久化目录也在目标中。未输出密钥、对话正文或文件哈希。
- 本地包启动后，仅新 `%APPDATA%\Firefly` 中出现运行生成的 `gpu-acl-ok` 标记，证明运行使用新路径。主窗口和 Chat 窗口实际打开；**设置字段、历史列表和其他持久化内容尚未逐项在 UI 验收**，不能把文件校验等同于完整功能验收。
- 本批没有测试“目标目录预先存在且与旧目录冲突”的真实迁移，因为迁移时目标不存在；以后遇到两边均有数据时不得自动覆盖或混合。

## 集中验证与本地包

- 完整 `npm test -- --silent`：491 个测试文件通过；4330 个用例通过、1 个跳过。测试进程仅临时将已安装的 `E:\Git\bin` 加入 PATH，以便既有 Bash 测试找到 `bash.exe`；未修改全局 Git 配置。`npm run check:renderer`、`npm run build`、打包配置定向测试 6 项均通过。`git diff --check` 无空白错误。
- `npm run prepare:mingit` 完成，实际解包资源有 MinGit 与 QQ Music 脚本。`npx electron-builder --win --dir --publish never` 输出 `release/win-unpacked`，未生成安装器或发布元数据。实际产物含 Firefly.exe、Main／Preload／Renderer、Firefly Live2D 与头像、提示词、许可证；不含已清理的旧模型、网易云运行模块或用户配置。产物根目录当前无 `debug.log`；本地包启动后用户已正常退出，未再重启。
- **打包阻塞**：`npm run build:screenshot-helper` 因 `spawnSync cargo ENOENT` 失败；本机缺少可调用的 Cargo。虽然直接执行的 electron-builder 解包命令返回成功，但警告缺失 `resources/bin/cyrene-screenshot.exe`，实际 `release/win-unpacked/resources/bin/cyrene-screenshot.exe` 不存在。正式 `package:win:dir` 脚本必须先构建该助手，本次没有完成；截图相关功能也未验证。不能把此目录当作完整安装包或公开发布产物。需要在可用 Rust/Cargo 环境下依现有脚本构建助手，再进行本地打包与完整性复核。
- 产物路径检查没有用户设置、聊天、私人记忆、日志、桌面公开验收输出、本机 GPT-SoVITS 环境／权重／参考音频或机器专属路径的打包引用。此项是本地产物检查，不代替发布前的素材授权和安装器验证。

## 待验收与发布阻塞

**代码迁移**：Batch 1–6 的已确认缺口按当前源码完成；未替换新底座核心。**本地包**：可启动但缺截图助手，不能称完整可用。**公开发布**：不具备条件。

1. 完整打包：提供可调用 Cargo，构建并核对截图助手；再跑正式本地打包及安装器产物检查，仍不得覆盖安装旧应用。自动更新维持关闭，直到用户仓库有相容发布产物和更新元数据。
2. 素材授权：归档流萤 Live2D 原作者授权原文、署名、覆盖文件和再分发范围；单独核对头像、12 张 task 肖像、仍引用的历史画像、图标等素材。上游源码 MIT 与历史昔涟模型授权不能代替这些权利。
3. 实机边界：Firefly UI 内 QQ Music 工具审批链、真实语音合成／播放／停止、完整视觉状态、12 位任务角色逐一展示、持续帧率与实际 60 FPS、迁移后设置及历史逐项 UI 展示仍未完整验收。之前的自动测试和局部实机记录不扩写为这些项目通过。

## Git 状态

当前 `main`、HEAD `46610b9df82eecbfea03dffe7de1f340bf42080c`；`origin` 为 `https://github.com/Serendipity-wu02/Firefly_Agent.git`。该 HEAD 是本地基线，**Batch 1–6 实施均在工作树中，尚未提交**，不能视为用户远程仓库已获得这些改动；也未合并旧 Firefly 的历史。本记录写入前，完整 `git status --porcelain=v1 -uall` 为 275 个修改、217 个删除、64 个未跟踪项；加入本记录后未跟踪项增加 1。保留全部累计差异，未暂存、提交、推送或发布。
