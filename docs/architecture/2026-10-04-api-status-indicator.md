# API 连接状态指示器设计与验收

- 记录日期：2026-10-04
- 状态：Main 公共连接契约与 Renderer 指示器已集成，相关自动化验证通过；新增原生界面验收未执行
- 范围：当前模型配置的手动连接测试结果展示
- 关联：[导航与设置设计](2026-10-04-ui-settings-followup.md)

## 1. 背景

已保存模型或密钥只证明配置存在。导航栏需要展示明确连接测试的结果，并区分未验证、测试中、成功和失败。该实现承接导航与设置文档中的连接状态契约。

## 2. 实现事实

- 流萤头像区域提供原生状态按钮。`unverified` 与 `checking` 为灰色，最近一次显式测试成功为绿色、失败为红色。含义限于当前 Main 进程中的最近手动测试，不代表供应商持续可用。
- `window.modelConfig.getConnectionSnapshot()` 与 `onConnectionChanged()` 提供状态。Composer 与指示器接收同一选中配置 ID；默认配置/首个配置回退与 ModelSelector 一致。缺失或未知状态保持未验证，已保存密钥不会单独触发绿色。
- 先订阅再读取初始快照。迟到的初始响应不能覆盖已收到事件；卸载时注销对应订阅并阻止后续更新。
- Tooltip 仅公开翻译后的状态、时间戳和两个有界失败原因 `test_failed` / `test_error`。除颜色外保留可访问状态文本及既有可见焦点样式。点击打开 API 设置，不改变常规设置入口。
- 没有增加自动测试、网络请求、新 IPC 接口或第二个连接状态服务；单模型配置结构和实际模型选择保留。

## 3. 职责边界

| 层 | 职责 | 入口 |
| --- | --- | --- |
| Main | 配置变化失效、版本管理、测试结果归属及过期结果隔离 | `src/main/settings/model-settings.ts`、`src/main/settings/settings-ipc.ts` |
| Preload 与共享类型 | 暴露快照读取、变化订阅及公共状态 | `src/preload/index.ts`、`src/shared/model-connection-types.ts` |
| Renderer | 配置选择、状态展示、订阅生命周期和设置入口 | `src/renderer/react/features/chat/components/ModelConnectionIndicator.tsx` |

实现没有修改音乐或构建配置，不通过普通模型调用推断连续连接健康。

## 4. 后续验收要求

1. 在隔离 smoke profile 下验证 Windows 像素、键盘焦点和系统 Tooltip。
2. 覆盖配置切换、配置变化失效、初始读取迟到、失败原因脱敏及组件卸载后的事件。
3. 使用当前实现的 `.cy-model-connection` 选择器；旧截图只证明其记录阶段的界面。

## 5. 历史验收结果与限制

| 检查 | 记录结果 |
| --- | --- |
| 指示器失败先行与相关导航测试 | 5 个新增测试先失败；实现后 4 文件 / 22 测试通过 |
| Renderer 与 Main/Preload 连接契约集合 | 114 文件 / 766 测试通过，退出码 0 |
| 独立 Renderer 审查回归 | 4 文件 / 26 测试通过；未发现阻断项 |
| Main、Preload、Renderer TypeScript no-emit | 通过 |
| 隔离 Renderer 构建 | 通过；既有 Vite chunk-size 警告保留 |

测试集合重叠，不相加为唯一总数。独立 Renderer 回归覆盖指示器、导航、导航布局与模型目录加载状态；Main/Preload 契约由 114 文件集合覆盖。全仓测试不是该阶段重新运行的范围。

构建采用独立输出目录并保留原 `dist`。原生验收使用实际 `.cy-model-connection` 选择器和公共连接契约，不能将旧截图作为新界面的证据。

该阶段没有启动、关闭、重启或聚焦原生 Electron 窗口，没有使用真实用户数据或外部供应商。原生交互与最终整合界面仍需独立验收，历史自动化结果不代表当前工作树已复测。
