# Firefly_Agent

**Firefly_Agent 1.1.0** 是以流萤为角色的 Windows 桌面助手，也是保留 Chat、Work、Learn、Code 模式的 Agent 工作台。应用基于 Electron、TypeScript 和 React；现有 Agent 执行循环、工具、审批、记忆及任务机制继续由同一底座负责。仓库目前不提供已验证的公开安装包或自动更新。

- 仓库：[Serendipity-wu02/Firefly_Agent](https://github.com/Serendipity-wu02/Firefly_Agent)
- 问题反馈：[GitHub Issues](https://github.com/Serendipity-wu02/Firefly_Agent/issues)
- npm 技术包名：`firefly-agent`；Windows appId：`com.serendipitywu02.firefly`；用户数据目录：`%APPDATA%\Firefly`。展示名称的调整不迁移或重置用户数据。

## 当前能力与验证边界

| 范围 | 当前实现与证据 |
| --- | --- |
| 界面与桌面角色 | 保留现有导航、设置、Chat、Work、Learn、Code 和审批界面。加载流萤 Live2D 模型与头像；点击、拖动、动作和复位已有局部实机记录，持续 60 FPS 未测量。 |
| Chat | 流萤身份按模式组装，称呼优先采用用户设置，其次已有昵称，默认“开拓者”。公开测试对话的单次运行、正常结束和历史保存已有实机记录；原作经历不自动成为与当前用户的共同经历。 |
| Work | 沿用现有任务队列、文件分段读取、权限、取消、历史与子任务机制。必读文件的本次读取证据、部分范围确认及已结束任务的 Markdown 导出已有定向测试和公开文件的局部实机记录。 |
| 子代理与 Skills | 12 位任务角色的名称和头像按现有映射展示，执行职责与权限不因头像更换而扩展。项目 Skills 沿用原扫描、注册和按需加载机制；12 位角色尚未逐一实机展示。 |
| 朋友圈与记忆 | 朋友圈默认关闭。历史原文与向量索引分别保存；BGE-M3 未配置时检索和索引明确显示不可用，不把历史读取失败当成空列表。 |
| 音乐与语音 | QQ Music 的状态读取及基础控制接入现有工具权限链；播放器桥有局部实机记录，应用内工具审批链仍待验收。GPT-SoVITS 使用外部服务，真实语音合成、播放和停止尚未验收。 |

这些条目不代表所有模式、工具或视觉状态均已实机验证。源码、自动测试和实机证据的区别见 [本地包增量收口](./docs/migration/firefly-final-handoff-2026-09-25.md) 与 [最新集中验收](./docs/migration/firefly-unification-startup-2026-09-25.md)。首次历史空列表事件的原始根因仍未确定；当前读取失败与空列表已分开处理。

## 开发环境与运行

在 Windows 上使用 Node.js `>=24 <25` 和 npm `>=10`。`npm ci` 安装依赖；不要把旧应用的密钥、聊天、授权文件或本机模型复制到仓库。开发运行和从构建产物启动分别使用：

```powershell
npm ci
npm run dev
```

```powershell
npm run build
npm start
```

`npm start` 读取当前仓库的 `dist`，因此源码更新后须先运行 `npm run build`。常用验证命令来自 [package.json](./package.json)：

```powershell
npm run check:renderer
npm test
npm run build
```

Windows 上运行真实 Bash 集成测试前，设置 `FIREFLY_TEST_BASH` 为本机实际存在的 Git Bash `bash.exe` 绝对路径。它仅用于测试夹具，不是应用配置；CI 从当前 Git Bash 进程取得此路径。测试仍实际探测并执行 Bash，不会因未配置而跳过。

原生截图助手源码位于 `native/firefly-screenshot/`，通过 `npm run build:screenshot-helper` 构建；这一步另需可用的 Rust/Cargo Windows MSVC 工具链和 Windows C++ 构建依赖。正式本地解包脚本为 `npm run package:win:dir`，但安装器、自动更新和公开发布仍需单独验收，本项目当前不提供下载承诺。

## 配置外部服务

在应用的**模型设置**中创建并选择服务档案，按所用服务的实际协议填写地址、模型和凭据。仓库不附带真实 API Key；不要把用户配置写入源码或提交。一次可见回复并不等于后台观察、工具或向量索引均成功，需分别查看运行状态。

- **GPT-SoVITS**：自行准备并启动外部服务，在现有 TTS 设置中配置服务地址、本机参考音频及与音频对应的文本。未配置时文字 Chat 仍可用；仓库和本地包不附带语音环境、权重、参考音频或缓存。
- **QQ Music**：须有可用的 QQ Music 桌面会话。状态读取和播放控制走现有授权与工具链；控制操作会影响实际播放，应用内审批链仍待集中实机验收。没有网易云回退。
- **BGE-M3**：本地向量检索需要完整模型资源；当前环境未配置时，历史向量检索与写入显示不可用，原始 Chat 仍保存。既往对话向量补建尚未完成；应用不会从 Chat 模型档案推断 embedding 服务，也不会自动下载模型。

## 数据、升级与备份

当前用户数据位于 `%APPDATA%\Firefly`。应用运行名仍为 `Firefly`，以保持现有渠道凭据派生契约；仓库及打包展示名为 `Firefly_Agent`。模型设置、Chat／Work 历史、任务运行和其他持久化状态不属于 Git 或安装包。升级或手工处理数据前先正常退出应用、备份数据；保留旧目录，不覆盖已有目标目录，也不要把两个目录直接混合。旧格式由集中迁移代码读取，新写入使用 Firefly 格式；新旧数据同时存在且记录 ID 冲突时须先核对，不应静默覆盖。读取失败不会自动以空数据写回。

## 技术结构

| 目录 | 用途 |
| --- | --- |
| `src/main/` | Electron Main、Agent 编排、工具、审批、设置、历史和迁移 |
| `src/preload/` | Main 与界面之间的受控桥接 |
| `src/renderer/` | 桌面界面、设置、Live2D 展示与交互 |
| `prompts/`、`skills/` | 按模式组装的角色提示词与按需加载的 Skills |
| `packages/plugin-sdk/`、`examples/` | 本地可构建的插件 SDK 与示例；不表示已发布 npm 包或插件市场 |
| `native/firefly-screenshot/`、`scripts/` | 原生截图助手源码及构建、验证脚本 |
| `docs/architecture/`、`docs/migration/` | 当前运行结构与迁移验证记录 |

当前分层与兼容边界见 [架构说明](./docs/architecture/firefly-runtime.md)。不接入尚未开发的 Jev/DecisionProvider，也不加入第二套 Agent Loop。

## 贡献与分支

后续开发先进入 `firefly-mini-v1.1.x`，验证通过后再合并 `main`；不直接在稳定主线开发。提交前按改动范围运行测试和构建，描述自动验证与实机验证的边界。请阅读[贡献指南](./.github/CONTRIBUTING.md)，提交 Issue 时不要包含密钥、对话正文或其他私人数据。

## 许可与来源

源码使用完整 [MIT License](./LICENSE)，其中保留上游版权和本项目新增代码的归属。第三方依赖、素材与上游来源见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)、[MODEL_LICENSE.md](./MODEL_LICENSE.md) 和 [贡献者记录](./docs/CONTRIBUTORS.md)。MIT 源码许可不自动覆盖 Live2D 模型、头像、字体、图标或其他第三方素材；公开再分发范围仍须另行核对。流萤及《崩坏：星穹铁道》相关知识产权归其权利人，本项目不是官方产品。
