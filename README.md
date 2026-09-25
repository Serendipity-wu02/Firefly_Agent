# Firefly · 流萤桌面智能体

Firefly 是基于 Cyrene 桌面运行架构的 Windows Live2D AI 应用。迁移源码已汇入本分支，沿用现有会话界面、Agent 循环、工具、审批与任务状态机制；**这不是已完成的正式发布版**。

- 项目主页：[Serendipity-wu02/Firefly_Agent](https://github.com/Serendipity-wu02/Firefly_Agent)
- 问题反馈：[GitHub Issues](https://github.com/Serendipity-wu02/Firefly_Agent/issues)
- 下载与更新：目前**没有兼容新底座的 Release**。应用自动更新已关闭，不要安装旧 Firefly 或上游 Cyrene 的发布包来升级本工作树。

## 当前状态

| 范围 | 当前事实 |
| --- | --- |
| 流萤角色层 | Chat、Work、Learn、Code 接入统一流萤人格；提示词测试通过，Batch 1 实机 Chat 已验收。首次空列表事件的根因仍未知。 |
| 桌面形象 | 源码加载 `models/firefly/Firefly.model3.json`，主要界面使用流萤头像；点击和拖动已实机验收，持续 60 FPS 尚未实测。 |
| Chat | 沿用新底座会话链；回复终态与发送修复已有定向测试和 Batch 1 实机记录。 |
| Work / Learn / Code | 保留现有模式与权限机制；Work 文件读取证据、部分读取确认和 Markdown 导出已接入。 |
| 朋友圈与表情 | 朋友圈默认关闭；无流萤对应素材的旧角色图片不作为产品占位。 |
| 音乐与语音 | QQ Music 桌面会话状态和基础控制已接入现有工具权限链；网易云入口不再生效。GPT-SoVITS 请求协议已适配；语音服务、参考音频及其对应文本须由用户自行配置。真实服务验收见 Batch 4 记录。 |

迁移的源码依据和验证边界见 [Batch 1 实施记录](./docs/migration/firefly-batch1-implementation-2026-09-23.md)。历史审计文档保留原状，不作为当前功能承诺。

## 本地运行

需要 Windows、Node.js 24 和 npm 10 以上版本。**不要复制旧项目的密钥、聊天记录或授权文件**。

```powershell
npm ci
npm run build
npm start
```

请在本迁移分支根目录执行。公开安装器、自动更新和素材再分发仍待单独验证。

在应用的正常设置入口配置你自己的模型服务，然后检查流萤模型和头像、各主要页面，以及一轮真实 Chat 的身份、称呼、表达和结束状态。构建或主窗口启动成功不等于模型已实际回复。`npm run check:renderer` 与 `npm test` 可用于本地静态与单元验证。

应用使用 `%APPDATA%\Firefly` 用户数据目录，与原 Firefly 包名目录 `%APPDATA%\firefly-agent` 隔离。从此前的 `Firefly-Cyrene-Base` 目录迁移时，须先完全退出应用；仅在目标目录不存在时复制持久化数据，保留原目录备份，跳过运行锁和可重建缓存。目标目录已有数据时不要自动覆盖或混合。现存 `cyrene` CLI 命令、存储键和部分源码名是兼容标识，不表示产品仍归属上游。

## 外部语音服务

GPT-SoVITS 是独立运行的外部语音服务。用户须自行准备和启动服务，并在应用的语音设置中填写服务地址、选择本机参考音频、输入与该音频逐字对应的文本，再启用 GPT-SoVITS。缺少这些配置时语音明确失败，文字回复不依赖语音服务。Firefly 仓库与安装包不附带用户本地的 GPT-SoVITS 环境、模型权重、参考音频或缓存；不要把它们提交进仓库。语音模型及素材的使用与再分发需另行遵守原作者授权。

## 开发与贡献

请阅读[贡献指南](./.github/CONTRIBUTING.md)。迁移阶段只围绕已核实的缺口修改；不要引入第二套 Agent Loop，不扩大权限，也不要把旧 Firefly UI 覆盖新底座。提交问题时不要包含 API 密钥、聊天记录或其他私人内容。

## 许可与素材

源码使用 [MIT License](./LICENSE)。上游 Cyrene 源码的 `Copyright (c) 2026 Playa` 保留；Firefly 新增与修改内容的署名为 `Serendipity-wu02`。上游贡献与第三方依赖记录见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) 和 [docs/CONTRIBUTORS.md](./docs/CONTRIBUTORS.md)。

**MIT 源码许可不覆盖角色形象、Live2D 模型、头像、字体、图标或其他第三方素材。**旧 Cyrene 模型的既有来源说明保留在 [MODEL_LICENSE.md](./MODEL_LICENSE.md)。项目所有者确认已取得流萤模型原作者授权；仓库尚无可核对的授权范围与再分发条款，头像及其他素材也需要单独核对，因此目前不发布安装包或资源包。流萤与《崩坏：星穹铁道》相关知识产权归 HoYoverse / miHoYo；本项目不是官方产品。
# 当前源码说明

Firefly 的当前运行分层、身份注入与 Skills 组织见 [架构说明](./docs/architecture/firefly-runtime.md)。本轮品牌与 Skills 的定向验证、兼容标识和集中实机记录见 [实施记录](./docs/migration/firefly-brand-skills-2026-09-25.md)。历史报告由 [归档索引](./docs/archive/README.md) 集中查阅，不作为当前已验证功能的承诺。
