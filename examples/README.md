# 插件示例说明

本目录的五个插件用于阅读 API 与集成方式。源码、manifest 和署名保持原样；不把注册冒烟等同于真实宿主验证。

| 目录 | 入口与依赖 | 展示内容 |
| --- | --- | --- |
| `system-status/` | `index.cjs`；无 `deps` | 状态与磁盘工具、独立窗口 `ui.html`、设置面板 `panel.html`、`snapshot` IPC；manifest 作者为 `Playa`，版本 `0.2.0` |
| `weather-tool/` | `index.ts`；`secrets` | 读取 `openweathermap_key`、OpenWeather 请求失败或未配密钥时改用 Open-Meteo、城市缓存 |
| `long-term-memory/` | `index.ts`；`llm`、`conversations` | 监听 `host:turn:finished`、读取消息、摘要、动态 Provider |
| `scheduled-automation/` | `index.ts`；`scheduler` | 自有任务创建、列出、更新、删除；创建即停用，用户在宿主启用 |
| `local-asr-contract/` | `index.ts`；`speech-input` | `active-chat` 租约与模拟文本提交；不含 ASR 模型、麦克风采集或推理运行时 |

## 构建与安装

在仓库根目录，现有命令为：

```bash
npm run build:plugin-sdk
npm pack ./packages/plugin-sdk
npm run test:plugin-examples
```

前两条生成本地 SDK tarball；在插件项目通过 `npm install /path/to/firefly-plugin-sdk-0.2.0.tgz` 安装。包名不代表已发布到 npm。

`test:plugin-examples` 自行构建 SDK，在临时项目安装 tarball，编译四个 TypeScript 示例，将各自 `dist/index.js` 复制为 manifest 要求的 `index.cjs`，然后运行 `scripts/plugin-sdk/smoke-examples.mjs`。结束会删除临时项目与该脚本生成的 tarball，不会留下可安装 ZIP，也不启动 Electron。

手工分发 TypeScript 示例时，把编译后的 `index.js` 作为 `index.cjs` 与原 `manifest.json` 放在同一插件目录再压缩。四个入口仅导入 SDK 类型；实际导入 SDK 函数的其他插件须一并打包运行时代码和依赖。`system-status` 的 JS 入口、两个 HTML 文件及图标直接随目录打包。

导入位置：聊天窗口插件面板添加 ZIP，首次导入保持停用，用户明确启用后加载。完整规则见 [插件开发指南](../docs/plugins/plugin-dev-guide.md) 与 [接口规范](../docs/plugins/plugin-authoring.md)。

## 当前源码限制

示例验证入口为 `npm run test:plugin-examples`。Mock 验证不代表真实外部服务或 GUI 通过；当前边界见 [可靠性说明](../docs/architecture/firefly-reliability-boundaries.md)。

- `system-status`：CPU/网络差分首次没有基准；GPU 依赖本机命令，Windows 采集依赖 PowerShell。`diskUsage()` 未传盘符时固定查询 `C`，不是枚举全部磁盘，也不是动态发现系统盘。
- `weather-tool`：`secrets.get()` 抛错会使注册失败；只有缺少密钥或 OpenWeather 请求失败才进入免密钥路径。`unregister()` 先清空 `lastCity`，宿主随后执行的 `onDispose` 再尝试保存该值，不能宣称停止后城市缓存可靠保存。
- `long-term-memory`：直接向 JSON 存储写 `Map`，恢复所得值不具备 `Map` 方法；`unregister()` 还会在保存回调之前清空记忆。消息读取只取一页，未循环消费游标；事件没有 `finalMessageId` 时也未跳过，不能宣称已实现严格冻结的全量归档。
- `scheduled-automation`：`unregister()` 先清空 `ownTaskIds`，保存回调随后写入空数组；停止后本地所有权清单不能可靠恢复。宿主仍通过插件所有权校验限制任务访问，示例没有启用任务的接口。
- `local-asr-contract`：识别延时期间租约中止会清除计时器，但等待识别结果的 Promise 没有同步结束；该取消路径需要实现修正与真实宿主验证。

停止顺序依据 `src/plugins/manager.ts`：`beginStop()` → 插件 `unregister()` → context `dispose()`。真实存储依据 `src/plugins/storage.ts` 的 `JSON.stringify` / `JSON.parse`；Mock 以进程内 Map 保存原值，且 `dispose()` 不代调 `unregister()`，因此注册冒烟无法发现上述所有问题。上述实现缺陷已登记，留待后续处理。
