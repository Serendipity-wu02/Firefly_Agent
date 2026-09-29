<h1 align="center">Firefly_Agent</h1>

<p align="center">
  <strong>中文</strong> | <a href="./README.en.md">English</a>
</p>

**Firefly_Agent 1.1.0** 是以《崩坏：星穹铁道》流萤为角色的 Windows Live2D AI 桌面伴侣与多模式 Agent 工作台。项目使用 Electron、TypeScript 和 React，将角色化桌面交互、对话、任务执行与开发工具放在同一应用中。

[项目仓库](https://github.com/Serendipity-wu02/Firefly_Agent) · [问题反馈](https://github.com/Serendipity-wu02/Firefly_Agent/issues) · [文档导航](./docs/README.md) · [架构说明](./docs/architecture/firefly-runtime.md)

## 功能速览

| 能力 | 当前实现 |
| --- | --- |
| 桌面角色 | 流萤 Live2D 模型、点击与双击表情、拖动、动作播放与复位；Chat 动作沿用工具与事件链。12 位任务角色保留独立头像和展示身份；专业角色映射已明确配置，朋友圈默认关闭。 |
| Chat | 角色化对话、模型档案、流式回复与历史。称呼采用明确偏好，其次已有昵称，默认“开拓者”；原作经历不会自动成为与当前用户的共同经历。 |
| Work | 工具调用、文件和文档处理、Skills、Task/Subagent、审批与取消。明确要求读取的文件使用本次运行证据；预算不足时确认部分范围，任务完成与完整读取分别展示；已结束任务通过原生保存对话框导出 Markdown。 |
| Work 知识工作区 | 学习、测验、笔记与进度能力保留在 Work。先绑定工作区，再明确确认“添加学习结构”，或绑定已初始化的 Vault；普通 Work 不自动创建 Vault 或维护进度。详见[使用说明](docs/user-guide/knowledge-workspace.md)。 |
| Code | Git、LSP、AST、文件与命令工具，以及 Code Skills；执行沿用现有 Agent、工具权限与审批。外部语言服务器需要相应环境。 |
| Skills | 39 项第三方 Skills 与 `diagram`、`assessment`、`tutoring`、`knowledge-workspace`、`plugin-development` 五项项目 Skills，共 44 项；角色表达及计划/文件协议移至 `prompts/persona-support/`、`prompts/workflow-support/`，不再占用 Skill ID。保留扫描注册、模式过滤、按需正文及附件读取、用户覆盖，以及带哈希识别、备份和用户修改保护的托管更新。 |
| Plugins | 本地安装、生命周期和隔离面板；本地可构建的 SDK、manifest/schema 契约与四个示例。尚无本项目在线市场或已发布 SDK 包的承诺。 |
| Memory / RAG | 原始对话与向量索引分别保存，提供现有记忆与历史检索链。向量模型不可用时明确反馈，原始 Chat 仍保存，不把索引失败记成成功。 |
| Voice / Channels | GPT-SoVITS、ASR、QQ Music 及飞书、微信、QQ 等已有接入链；服务、客户端、渠道凭据和资源由用户配置。Call 独立通话窗口、循环和接口已退役；共享 ASR/TTS、Chat 播放与渠道语音保留。接入代码存在不代表完整外部服务实测通过。 |

模型、工具、Skills 和插件共享当前运行与权限机制。Skill 说明和头像不会自动扩大工具权限；启用状态和可用模式由现有配置决定。

## 当前状态

当前源码是 Firefly 独立维护的产品基线。原项目保留来源和历史兼容用途，运行和构建无需读取原项目工作树。

**历史已验证范围（vNext 调整前，不代表当前版本验收）**：独立源码构建，Main/Preload/Renderer 类型与构建检查，Main 和 Renderer 隔离基础启动，Chat / Work / Learn / Code 入口，39+8 Skills 注册，ZIP 恶意及正常归档回归，真实旧 Skills 归档的托管升级与用户保护，定向自动测试，XLSX `find-label` 基础 Smoke，以及本地插件 SDK/示例编译与 Mock。

**当前 vNext 验证**：冻结源码后的完整测试为 538 个文件通过，4766 项通过、1 项因 Windows 符号链接权限跳过；Main/Preload/Renderer 类型检查、完整构建、插件 SDK 与四个示例验证通过。隔离用户目录中确认 Main/Renderer 启动、Chat / Work / Code 切换、44 项 Skills 注册及正常退出。旧 Learn 会话备份后迁移为 Work，新 Learn 请求拒绝；真实用户迁移未执行。

**当前 vNext 边界**：Main 使用12个持久专业 Agent 和显式模型档案路由；Chat不委派，Work/Code按模式提供角色。设置页可绑定已保存档案，未配置时明确失败。旧 public task 工具已退出当前运行链，旧 schema1 历史保持可读。离线自动验证不代替真实模型、完整 GUI 或外部服务验收。

**仍未完整验收**：真实模型端到端、深度 GUI、外部 Office/LibreOffice/.NET 完整流程、真实用户环境、安装器升级、跨平台、TTS / QQ Music 完整审批链、持续帧率及公开发布所需的全部资产再分发许可。

已登记的维护事项包括附件分页去重仍使用进程级状态，后续需验证跨会话读取。首次历史列表为空事件的原始根因仍未确定；已修复读取失败伪装为空列表与失败后覆盖文件的问题，成功重开不改变原始根因结论。

当前验证边界见[可靠性说明](docs/architecture/firefly-reliability-boundaries.md)，历史命令、输入哈希与阶段结果从[归档索引](docs/archive/README.md)查阅。定向结果不表示全量测试或全部功能完成。当前不承诺公开安装包或自动更新，自动更新保持关闭。

## 开发环境与启动

需要 Windows、Node.js `>=24 <25` 和 npm `>=10`；项目声明包管理器版本为 npm `11.17.0`。在仓库根目录执行：

```powershell
npm ci
npm run dev
```

从构建产物启动：

```powershell
npm run build
npm start
```

`npm start` 加载当前仓库的 `dist`，源码变化后先构建。开发与构建实例使用同一正式数据身份，请在开启另一实例前正常退出当前实例。

在应用设置中创建模型档案，填写服务实际支持的协议、地址、模型和自己的凭据，再选择档案。仓库不附带密钥或可直接使用的模型配置。发送给模型的对话、所选资料和工具结果可能离开本机，取决于你选择的服务与操作。

## 检查与本地打包

以下命令来自当前 [package.json](./package.json)：

```powershell
npm run check:renderer
npm test
npm run build
npm run check:plugin-sdk
npm run test:plugin-examples
```

Main 和 Preload 的 TypeScript 检查包含在 `build:main` / `build:preload` 中。`npm test` 运行 `vitest.config.ts` 定义的套件，不包含脚本 Node 测试、Rust 测试、安装器或真实外部服务验收；脚本入口见 [scripts/README.md](./scripts/README.md)。Windows Bash 集成测试需将 `FIREFLY_TEST_BASH` 设置为本机实际存在的 Git Bash `bash.exe` 绝对路径。

正式 Skills 目录变化时先核对 `vendor/firefly-skills/skills-manifest.json` 与来源通知，并运行 `npm run validate:skills`。构建直接打包已核验的目录，不生成 Skills ZIP。截图助手使用 Rust/Cargo Windows MSVC 工具链与 C++ 构建依赖。本地解包准备为：

```powershell
npm run validate:skills
npm run package:win:dir
```

该脚本构建应用和截图助手、准备经校验的 MinGit，并生成 Windows 解包目录；不等于安装器验收或公开发布。本轮不发布 Release、SDK 或安装器。用户数据、模型权重、语音资源和测试日志不得进入源码或产物。

## 外部服务前提

- **GPT-SoVITS**：自行准备并启动服务，在 TTS 设置中填写地址、参考音频和对应文本。缺配置时明确失败，文字回复继续可用；项目不附带本地语音环境、权重、音频或缓存。真实合成、播放和停止仍待验收。
- **QQ Music**：需要运行且可访问的桌面会话。状态与控制走现有工具权限链，分别报告命令提交和观察到的状态变化。控制会影响当前播放，应用内完整审批链仍待验收，没有网易云自动回退。
- **BGE-M3**：需要用户配置完整向量模型资源。未配置时向量检索/写入明确不可用，原始历史保留；不自动下载模型，不借用主 Chat 档案充当向量配置。既往历史向量补建仍待办。
- **办公与渠道**：按实际工作流准备 Python 模块、LibreOffice、.NET、语言服务器，以及渠道服务和授权。静态说明或一次基础 Smoke 不能证明所有外部程序可用。

## 架构与目录

应用从 `src/main/index.ts` 启动，编译入口为 `dist/main/main/index.js`；Preload 提供受控 IPC，React 与 Live2D 负责窗口和桌面展示。Chat / Work / Code 三模式使用现有 Firefly Agent 执行链，工具、Task、审批与取消保持各自所有者。

| 路径 | 职责 |
| --- | --- |
| `src/main/`、`src/preload/`、`src/renderer/` | 应用服务、受控桥接、React 界面与 Live2D |
| `src/main/orchestrator/` | Firefly Agent 编排、工具执行、Task/Subagent 与权限集成 |
| `src/main/skills/`、`skills/` | Skills 扫描注册、读取及项目内置内容 |
| `vendor/firefly-skills/`、`scripts/packaging/` | 正式继承 Skills 目录、来源/许可、历史适配依据与打包校验 |
| `src/plugins/`、`packages/plugin-sdk/`、`examples/` | 插件宿主、本地 SDK、schema 与开发示例 |
| `src/shared/` | IPC、数据/事件契约和 ZIP 安全边界 |
| `prompts/`、`assets/` | 分层角色提示词、世界观及产品资源 |
| `native/`、`electron-builder.yml` | 原生助手源码与应用打包配置 |
| `docs/architecture/` | 当前模块职责、主入口与维护边界；历史记录从文档导航分开访问 |

完整调用方向见[运行架构](./docs/architecture/firefly-runtime.md)和[维护边界](./docs/architecture/firefly-maintenance.md)。

## 数据与升级保护

默认用户数据目录为 `%APPDATA%\Firefly`。技术包名 `firefly-agent`、展示名 `Firefly_Agent`、运行数据身份 `Firefly` 和 appId `com.serendipitywu02.firefly` 各有用途；改展示名不重建数据目录。

设置、模型档案、Chat / Work 历史、运行记录及用户 Skills 不属于 Git 或安装包。手工处理前正常退出并备份，保留旧目录，不覆盖已有目标或直接混合目录。集中迁移处理旧格式和凭据解密，新数据优先，冲突保留并诊断，读取失败不写回空数据。Skills 更新只处理可识别的托管内容，保留用户修改和同名自定义文件。

## 开发流程

后续开发在 `firefly-mini-v1.1.x` 完成提交与验证，再通过 PR 合入 `main`。按修改范围执行实际检查并说明未覆盖项。请阅读[贡献指南](./.github/CONTRIBUTING.md)和 [AGENTS.md](./AGENTS.md)；Issue 与 PR 不要附密钥、私人对话或用户数据。

## 上游与许可

Firefly_Agent 独立维护；部分源码源自 Cyrene-Agent，并遵循保留的原 MIT 版权声明。这不表示全部代码从零原创。

源码见完整 [MIT License](./LICENSE)。第三方 Skills、依赖、Live2D 模型、头像、角色 IP 和其他资产分别遵循自己的许可或授权；MIT 源码许可不自动授予素材再分发权。来源与边界见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)、[MODEL_LICENSE.md](./MODEL_LICENSE.md)及[贡献者记录](./docs/CONTRIBUTORS.md)。公开资产再分发检查继续保留。

流萤及《崩坏：星穹铁道》相关知识产权归其权利人，本项目为非官方项目。
