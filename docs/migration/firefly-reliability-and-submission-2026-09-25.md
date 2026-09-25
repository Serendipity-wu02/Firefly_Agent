# Firefly 最终可靠性修正与提交准备

## 结论与事实边界

本轮修正的是已确认的错误处理缺口：Main 曾将历史索引读取／解析失败回退成空数组，将模型设置读取失败回退成默认配置，导致 IPC 调用成功、Renderer 无法区分失败与真实空数据。应用设置存在相同的默认值回退和写回风险。本轮不改变存储所有者、Agent Loop、权限、审批或用户数据目录。

首次重开时列表为空的原始事件仍没有直接运行证据证明走过上述路径。后来重启恢复不构成根因证明；**该历史事件仍记为未复现、根因未确定**。本轮是可靠性修正，不宣称已证明解决该事件。

## 本轮文件与原因

| 文件 | 修改原因 |
| --- | --- |
| `src/main/chats/chats-store.ts` | 仅 ENOENT 作为不存在；无效索引、读取异常和损坏会话不再对外表现为空。初始化失败锁定写入，list 经现有 IPC 抛出 `CHAT_HISTORY_READ_FAILED`；会话读取抛出 `CHAT_SESSION_READ_FAILED`。写入与删除保护保留原文件，损坏索引不再触发旧会话迁移。 |
| `src/main/settings/model-settings.ts` | 区分首次无文件与读失败；检查配置根结构、档案与 provider 容器；失败标记与 `assertModelSettingsReadable` 阻止默认值覆盖。 |
| `src/main/settings/settings-facade.ts` | 对应用设置采用相同读取失败保护；失败不消费安装器选项或保存默认配置。 |
| `src/main/settings/settings-ipc.ts` | 配置、模型档案、公共模型配置、应用设置的现有 IPC 返回可识别拒绝；不增设数据服务。 |
| `src/renderer/settings/settings.ts` | 初始配置调用拒绝时保持档案错误态，不应用默认预设掩盖失败。 |
| `src/renderer/react/features/chat/components/ModelModePanel.tsx` | 模型页面区分加载中、失败、真实空列表；桥接缺失也是失败。 |
| `src/renderer/react/features/chat/components/ModelSelector.tsx` | Chat／Work 共用模型选择菜单显示加载与失败状态，不把失败当作尚未配置模型。 |
| `src/renderer/react/i18n/zh-CN.json`、`src/renderer/react/i18n/en.json`、`src/renderer/settings/i18n/zh-CN.json` | 对应错误文案；移除无法保证奏效的“重开窗口重试”提示。 |
| `src/main/chats/chats-read-failure.test.ts`、`src/main/chats/chats-ipc.test.ts` | 缺失／空索引、读异常、损坏索引／会话、IPC 拒绝和原文件不变。 |
| `src/main/settings/settings-read-failure.test.ts`、`src/main/settings/settings-read-ipc.test.ts` | 正常档案、首次使用、空配置、解析／结构／读取失败、阻止写回及 IPC 失败。 |
| `src/renderer/react/features/chat/components/model-catalog-load-state.test.ts`、`src/renderer/react/features/chat/components/ConversationSidebar.load-state.test.ts` | 实际组件渲染验证等待、拒绝、成功空数据与成功非空数据；Chat／Work 使用已实现的错误态。 |
| 本记录与 `firefly-uncommitted-files-2026-09-25.md` | 更新验证边界、累计分类清单及保留远程历史的方案。 |

加载器仍允许内部取得默认值以维持安全启动，但失败标记不会被成功响应或保存操作绕过。保护持续到本进程结束；没有固定延时、自动重启、清空、覆盖或重新迁移数据。新增诊断仅含失败标记和数量，不记录凭据、配置值、名称、会话正文或隐藏思考。

## 自动验证

- 8 个受影响测试文件共 75 项通过（按最终通过结果去重计数）：`chats-store`、`chats-ipc`、`chats-read-failure`、`settings-facade`、`settings-read-failure`、`settings-read-ipc`、`model-catalog-load-state`、`ConversationSidebar.load-state`。
- IPC 测试最初缺少测试替身的 `on` 方法，补齐后该文件 1 项通过；没有修改生产逻辑来迁就测试。
- `npm run check:renderer`、`npm run build`、`git diff --check` 通过。Vite 仍有大 chunk 警告，不影响本次构建；未重复全量测试。
- 使用 `npx electron-builder --win --dir --publish never` 更新 `release/win-unpacked`，退出码 0；没有制作安装器、发布或重新安装工具链。
- 实际 `app.asar` 56,648 项；包内 Main 确有历史与模型失败保护，应用身份代码使用 `Firefly` 用户数据目录。对本轮排除的用户配置／历史／debug.log／GPT-SoVITS／公开验收目录进行路径检查，匹配 0。路径检查不是对所有依赖内容的安全保证。

## 本次启动

- 只正常启动一次 `release/win-unpacked/Firefly.exe`。运行进程路径核对一致，子进程 user-data-dir 参数指向 `%APPDATA%\Firefly`。
- 2026-09-25 03:16 的当前启动日志：模型档案 1；会话共 10（Chat 6、Work 4），`readFailed=false`。仅记录数量，不输出模型参数、密钥或历史内容。
- 桌面控制第一次读取失败：`foreground window did not report a process id`；按规范重新绑定一次仍失败：窗口 ID 未找到。因此当前仅确认 Main 实际加载成功，**Renderer 列表展示等待用户确认**，不以日志代替 UI 验收。
- 用户回复“已退出”，未明确确认三类列表展示，因此 UI 展示确认仍留档，不把退出回复当作验收通过。
- 已核实该解包程序进程数为 0，确认清理对象在 `release/win-unpacked` 内后删除本次生成的根目录 `debug.log`；没有读取或删除用户日志。退出后的包外文件检查仅发现该运行日志，无上述私人配置或临时验收目录。

## 累计提交范围与排除

完整相对路径、状态和分类见 `firefly-uncommitted-files-2026-09-25.md`。该清单涵盖全部累计差异，不只本轮；不是暂存清单。

最终状态共 **610 项**：修改 283、删除 239、未跟踪 88。分类为源码／配置 274、测试 102、文档／许可 19、源资源／角色资料 165、已跟踪旧生成副本删除 26、排除的现存生成副本 24。剔除这 24 个复制产物后，586 项进入提交范围审核（仍含删除项及待许可归档资源），不等于全部已获准公开。

- `dist/renderer` 本次 24 个现存差异文件与 `src/renderer/public` 对应文件 SHA-256 完全相同（含 splash）；它们是构建复制结果。旧 `.gitignore` 中“splash 是真源”等注释与当前 Vite 清空／复制机制不符，不能据此重复提交构建资源。
- 另有 26 个已跟踪 `dist/renderer` 旧资源删除项，应作为移除旧生成副本的删除记录审核，而不是把它们误恢复或追加新二进制产物。未来在批准的提交工作区可停止跟踪对应生成输出；本轮不操作索引。
- 其余删除涉及网易云专属实现与打包脚本、旧音乐页面／工具、昔涟模型／品牌图、旧黄金裔朋友圈卡／头像及旧世界书。每个删除路径保留在分类清单中；适用上游许可证与来源说明仍由当前许可文档保留。未删除用户历史。
- 351 个现存变更文本文件做常见私钥／服务 token 模式检查，匹配 0；差异路径未出现用户配置、聊天目录、日志、临时包或可执行生成物。此为定向检查，不等于完整密钥审计。`release/`、本地截图助手二进制、依赖与构建缓存不提交。
- Live2D 等必要源素材虽列在资源范围中，公开推送仍须完成授权原文及再分发范围归档；不能把用户确认授权等同于全部素材可公开分发。

## Git 与建议方案（尚未执行）

- 本地分支 `main`；完整 HEAD `46610b9df82eecbfea03dffe7de1f340bf42080c`，无父提交，是本地提取基线。作者 `Serendipity-wu02 <hotarufirefly0217@gmail.com>`。累计实施修改在工作树，暂存区为空。
- `origin` 拉取／推送地址均为 `https://github.com/Serendipity-wu02/Firefly_Agent.git`。
- 只读 `git ls-remote --heads origin`：远程 `main=f42f89bb911eb429a5a703758a8a861d3a7f9fff`，`firefly-v1.1.0=f6f20f962568432f782abe0bdff5b2f9e2686498`。远程 main 对象不在本地，不能在此给出 ahead/behind 或共同祖先结论；remote 配置不代表历史已经迁移。
- 核准后的方案：另建隔离工作区，以届时核实的远程 `main` 为基点建立新 `codex/firefly-migration` 分支（名称仅为待核准方案）；将**当前完整有效源码树**按清单导入，不直接应用相对 Cyrene 根基线的 diff 到旧 Firefly，也不复制 `.git`、用户数据或生成物。对比新分支与远程 main 的全部增删，保留原历史与许可后再暂存提交。
- 建议提交说明：`feat: migrate Firefly onto Cyrene runtime`，正文列明 Batch 1–6、人设与资源、Work 证据／导出、外部语音／QQ Music、世界书、身份／打包及读取失败保护，附验证边界。可在隔离分支按上述主题拆分可运行提交，禁止为了拆分丢失累计修改。
- 只有用户核准范围与资源公开权限后，推送该新分支并发 PR 到远程 main；不直接推 main、不合并无关根历史、不强推。本轮未创建分支、暂存、提交、推送或发布。

## 继续留档

本地解包应用可启动不等于安装器已验证或可以公开发布。安装器、素材授权归档和兼容更新元数据仍待核实，自动更新保持关闭。真实语音、QQ Music 应用内审批链、DXGI、持续帧率、全部视觉状态及 12 位角色逐一实机展示沿用未覆盖记录。本轮没有重复截图助手或角色验收，没有接入 Jev 或重构 Harness。
