# Firefly 开发说明

本分支以 Cyrene 的 Electron、TypeScript、React 和既有 Agent 运行架构为基础。功能与验证边界以 [README](./README.md) 和 [迁移记录](./docs/migration/firefly-reliability-and-submission-2026-09-25.md) 为准；远程旧版 Firefly 的 Python 入口和测试脚本不再属于当前运行链。

## 环境与构建

需要 Windows、Node.js 24、npm 10 及项目锁文件对应的依赖。

```powershell
npm ci
npm run check:renderer
npm run build
```

`npm run build` 生成 Main、Preload、CLI 和 Renderer，不制作安装器。开发模式使用 `npm run dev`。单元测试使用 `npm test`，局部测试使用 `npx vitest run <实际测试文件>`。

原生截图助手源码位于 `native/cyrene-screenshot/`，构建入口是 `npm run build:screenshot-helper`。此步骤还需要 Rust/Cargo 的 Windows MSVC 工具链；编译出的 `resources/bin/cyrene-screenshot.exe` 是本地产物，不进入 Git。Windows 本地打包脚本见 `package.json` 和 `electron-builder.yml`。

## 数据与发布

应用用户数据在 `%APPDATA%\Firefly`，包括设置、会话和日志。不要将用户数据、私有语音资源或构建产物复制进源码树。GPT-SoVITS 是用户自行配置的外部服务；自动更新保持关闭。流萤模型与其他素材的公开再分发范围、安装器和更新元数据仍需在发布前核实。

保留现有 Agent Loop、工具权限、审批和任务状态所有者。修改提示词、角色卡或资源时，保留安全与任务执行约束。贡献流程和许可证见 [贡献指南](./.github/CONTRIBUTING.md)、[LICENSE](./LICENSE) 与 [第三方来源说明](./THIRD_PARTY_NOTICES.md)。
