# @firefly/plugin-sdk

Firefly 插件开发工具包。公开契约、校验与测试工具均由本仓库构建。

## 安装

```bash
npm run build:plugin-sdk
npm pack ./packages/plugin-sdk
```

## 用途

- **类型**：`import type { PluginContext, PluginTool, ... } from "@firefly/plugin-sdk"` —— 全部公开契约类型。
- **常量**：`CURRENT_PLUGIN_API_VERSION`、`PLUGIN_CAPABILITIES`、`PLUGIN_HOST_ERROR_CODES`。
- **Manifest 校验**：`validateManifestData(data)` —— 用与宿主同一份 JSON Schema 校验结构、类型、枚举与必填字段；API 版本兼容、ID/SemVer 格式及入口文件检查由宿主加载器完成，纯数据校验通过不代表可安装。
- **测试工具**：`import { createMockPluginContext, assertPluginTool, assertValidManifest } from "@firefly/plugin-sdk/testing"` —— 脱离宿主的 Mock Context 与契约断言。

在插件项目使用 `npm install /path/to/firefly-plugin-sdk-0.2.0.tgz` 安装上述本地产物；这是本地包名，不表示已发布到 npm。

SDK 包含公开类型、常量、Manifest 校验及测试工具，不包含 Electron、React 或 Firefly 宿主运行时。仅使用 `import type` 的插件编译后不依赖 SDK；如果入口实际导入 `isPluginHostError`、常量或校验函数，必须随插件打包这些运行时代码及所需依赖，不能只复制编译入口后省略它们。

Mock Context 的 `dispose()` 触发取消与登记的清理回调，不会代替插件调用 `unregister()`，也不模拟真实文件存储、Electron 窗口或渠道注册。

完整开发指南见本仓库 `docs/plugins/plugin-dev-guide.md`。

## 当前 0.2.0 源码契约

提示词 Provider 新增 `sources` 场景声明，并支持 `moments-post`：

- `sources` 可选值为 `conversation`、`scheduler`、`moments-post`、`plugin-agent`。
- 未声明 `sources` 的现有 Provider 仍只参与会话与定时任务，无需迁移。
- 参与动态发帖必须显式声明 `sources: ["moments-post"]`。
- 参与插件无头目标循环必须显式声明 `plugin-agent`；该来源带 `mode`，仍按 `modes` 过滤。
- `moments-post` 不提供会话 `mode`；Provider 应按 `source` 收窄输入类型后再读取场景专属字段。
- 动态发帖输入包含可用的 `conversationId`、`channel`，`userText` 为发帖决策所依据的最近对话摘录快照。

```ts
ctx.registerPromptProvider({
  id: "memory-context",
  sources: ["conversation", "moments-post"],
  provide({ source, mode, userText }) {
    if (source === "moments-post") {
      return `动态发帖参考：${userText}`;
    }
    return `当前会话模式：${mode}`;
  },
});
```
