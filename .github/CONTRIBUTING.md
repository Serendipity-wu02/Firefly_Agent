# 为 Firefly 贡献

项目主页与反馈入口：[Serendipity-wu02/Firefly_Agent](https://github.com/Serendipity-wu02/Firefly_Agent) · [Issues](https://github.com/Serendipity-wu02/Firefly_Agent/issues)

当前项目正在把流萤角色与旧 Firefly 的实际能力分批适配到现有 Cyrene 底座。提议前请阅读 [README](../README.md) 的当前状态，不要根据旧版产品说明推定新底座已实现同等能力。

## 修改边界

- 保留现有 Agent 循环、审批、权限、设置和任务状态所有者；不要迁入第二套旧 Firefly 核心。
- UI 与导航以当前底座为主。角色内容可迁移，安全与工具约束不能因人设替换而放宽。
- 涉及持久化键、单实例、打包身份、自动更新、资源路径或用户数据的改动，先在 Issue 中说明兼容方案。
- 不提交密钥、真实聊天记录、授权文件，或来源与再分发权限不明的角色素材。
- 只声称已由源码和测试证实的功能；涉及模型或界面行为时说明是否经过实机验证。

## 本地检查

使用 Node.js 24、npm 10 以上版本。修改后先运行受影响的测试，再按需运行 `npm run check:renderer` 和 `npm run build`。提交 PR 时写明改动原因、验证范围、未验证项和所涉素材来源。现阶段不要发布安装包：兼容 Release、安装器验收和流萤素材再分发范围尚未确认；Windows appId 已在 `electron-builder.yml` 配置。

源码使用 [MIT License](../LICENSE)；上游版权声明和 [第三方来源](../THIRD_PARTY_NOTICES.md)必须保留。既有上游贡献者记录见 [docs/CONTRIBUTORS.md](../docs/CONTRIBUTORS.md)。
