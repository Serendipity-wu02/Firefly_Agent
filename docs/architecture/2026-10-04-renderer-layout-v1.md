# Renderer 布局设计与阶段验收

- 记录日期：2026-10-04
- 状态：首版布局已有自动化与 Windows 隔离 smoke 证据；后续设置和连接指示器另行记录
- 范围：Renderer 导航、上下文侧栏、聊天列、Inspector、设置布局及 Moments 界面退役
- 关联：[导航与设置](2026-10-04-ui-settings-followup.md)、[连接指示器](2026-10-04-api-status-indicator.md)、[Moments Main 退役](2026-10-04-moments-main-cleanup.md)

## 1. 背景

布局改造统一导航与工作区入口，减少浮动控件遮挡，并保留既有会话、模型和任务执行行为。本文描述首版规格及其历史验证，不把后续版本的界面变化计入本阶段验收。

## 2. 布局与实现事实

| 区域 | 记录阶段的布局和行为 |
| --- | --- |
| 导航栏 | 48px，包含工作台、现有插件、更多和底部设置；更多包含工具、Skills、模型；设置默认打开常规页 |
| 上下文侧栏 | 240px，可折叠且保持挂载；包含流萤、Chat/Work/Code、新建、置顶/最近聊天和原 Work/Code 项目分组；长标题保留 Tooltip，项目分组包含置顶会话 |
| 聊天与输入 | 770px 居中列，保留附件、模型配置、真实推理、计划、权限、停止、队列和会话逻辑 |
| Inspector | 单一可调整面板承载 Files、Preview、Diff、Plan；可用 dock 宽度小于 720px 时纵向堆叠，不覆盖桌面保存宽度；应用实际最小宽度仍为 960px |
| Git 与 Todo | 折叠行内展示；状态、watch、branch、commit、push、plan 操作保留；折叠内容 inert，低高度展开内容可滚动 |
| 独立设置 | 左侧分类和右侧有界分组表单，保留真实保存/错误行为；未知分类回到常规，已有音乐嵌套路由仍选择插件 |

Moments 按钮、面板引用、功能目录、Renderer bridge 声明、翻译、设置绑定和六个废弃字段已移除，专属测试随功能退役。共享头像、社交上下文、渠道、TTS/ASR、贴图、Work 学习、RAG、Worldbook、`search_text`、调度 `threadId` 兼容和真实历史保留。

## 3. 变更边界

布局实现不修改 Main、Preload、共享后端、构建配置、依赖、CI、权限实现或历史存储。Main 的 Moments 退役有独立验收记录，完整产品判断需要相应的 Renderer 与 Main 整合证据。

首版支持 `pearl-white`，未覆盖深色主题视觉验收。Renderer 保留中英文资源及新增翻译；独立设置保留当时仅中文的语言选择。该设计没有启用实验记忆、浏览器、账户计费、云电脑、家长控制、密码管理、Call 或 PR 收件箱。

设计参考当时的 [ChatGPT 应用指南](https://learn.chatgpt.com/docs/app) 与[设置指南](https://learn.chatgpt.com/docs/reference/settings)，规格以 Firefly 已批准布局及仓库行为为准。外部产品能力不构成 Firefly 的实现承诺。

## 4. 后续变更与验收要求

1. 布局调整继续覆盖窄窗口、低高度、长草稿、Inspector 最后标签关闭以及 Git/Todo 展开等组合。
2. 不因折叠或切换会话丢失草稿、焦点、队列和停止能力。
3. 后续设置和连接指示器采用各自的验收记录，首版原生截图不能证明后续改动。
4. 实际模型调用、Git push、外部 TTS/ASR 和安装器应单独验证。

## 5. 自动化与构建验收

以下结果发生于记录阶段，各集合互相重叠，不相加为唯一总数。

| 检查 | 记录结果 |
| --- | --- |
| `npm run build` | 通过；存储边界 99 访问 / 53 文件，Main、Preload、CLI、Renderer 构建完成；既有 Vite 大于 500kB chunk 警告保留 |
| `npm run check:renderer` | 通过 |
| Renderer/UI/设置相关集合 | 91 文件 / 649 测试通过 |
| Sender 状态切换与共享头像 | 2 文件 / 19 测试通过，含 Work 长草稿/焦点/Stop；既有 busy-stop/队列测试保留 |
| 最终布局与 Stop 回归 | 4 suites / 22 测试通过；最终 CSS 后 Renderer 构建通过 |
| 独立审查 | 8 suites / 22 测试通过；置顶项目回归和常规设置路由问题已修复复验，无剩余阻断项 |
| Moments 符号检查 | `window.moments`、`IPC.MOMENTS_*`、`shared/moments-types`、`buildMomentMediaUrl` 及六个移除字段在 Renderer 中零命中 |
| `git diff --check` | 通过 |
| Windows Electron smoke | `node scripts/verify/renderer-layout-smoke.cjs` 通过 |

导航、紧凑 dock、置顶分组、默认常规页和 dock 控件均有失败先行记录。原生低高度检查复现过输入/页脚裁切及浮动 Git 拦截，随后完成布局修正。649 项集合之后新增了一个测试，表格记录的是各自运行结果。

## 6. 原生界面证据与限制

smoke 使用 `--firefly-profile=smoke --firefly-isolation-root=<QA output>/profile`。记录中的 userData/appData/sessionData 均位于该隔离目录，没有打开真实用户数据。仅 QA BrowserWindow 临时降低最小尺寸以检查 600px 行为，生产 Main 最小尺寸不变。

已进行实际像素检查的场景包括宽屏聊天、折叠侧栏、更多菜单、960×540 Inspector/长草稿、文件预览、窄聊天/设置、常规/偏好/外观、保存错误、展开 Git/Todo 和新建 Work。原生检查还覆盖旧夹具、折叠后的草稿保留、键盘焦点、常规设置真实保存/回读、注入 IPC 错误、项目 A/B 切换、Inspector 最后标签关闭及展开卡片后的长草稿。

`chat-streaming-stop.png` 使用合成 AGUI 夹具，经原生 IPC 驱动真实聊天窗口。点击 Stop 恰好调用一次隔离取消处理器，夹具终态使 UI 回到 idle。这证明 Renderer 停止交互，不证明真实外部模型或供应商运行。

八份外部参考图像的 Windows 导入未能完成，记录中仅取得文本，没有原生图像像素；因此不宣称参考图逐像素对齐。已生成的 14 张 Windows 截图完成本地像素检查，但其外部上传未成功。图像传输和参考对齐属于证据缺口，不能据此推定已完成最终视觉验收。
