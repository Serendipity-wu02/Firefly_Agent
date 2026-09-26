# 文件结构与接口收敛（2026-09-26）

后续资源接入与下架结果见 [流萤资源更新](./resource-refresh-2026-09-26.md)。下文保留本阶段完成时的真实状态。

基线 `35457af3279fccaf0ab462f8744f47183fce79f1`，开发分支 `firefly-mini-v1.1.x`。本轮不提交、不推送、不改两个原目录或用户数据。

## 删除与引用依据

| 路径 | 处理及依据 |
|---|---|
| `src/renderer/react/assets/思考组件.png`、`compressing.png`、`model.png`、`moments.png`、`new.png`、`plugin.png`、`sidebar-bg.png`、`tools.png` | 删除。逐图查看为旧角色插画；当前组件没有 import、URL 或文件名引用。Vite 无此目录的动态 glob，也没有目录复制规则；这些文件不在 public 下。 |
| 同目录 `ask/审批.png`、`ask/ask.png`、`ask/planmode批准.png`、`todo/codetodo.png`、`todo/learntodo.png`、`todo/worktodo.png` | 删除。相同引用与构建核查；已沿用当前文字/图标展示，不补造新图片。 |
| `docs/image/code.png`、`harness.png`、`music.png`、`preview.png`、`work.png` | 删除。逐图确认是旧产品截图/宣传图；当前 README 与文档没有这些图片链接，不伪造 Firefly 截图。 |
| `examples/system-status-0.1.0.zip` | 删除过时分发包。检查 ZIP 内 `avatar.png`、`index.cjs`、`manifest.json`、`ui.html`；manifest 为 0.1.0，作者 Playa。保留实际当前 0.2.0 示例源码与同一真实作者。 |
| `src/main/music/mpv-controller.ts` 及对应测试 | 删除无生产调用的旧 JSON IPC 播放器类。全项目只有该类自身测试引用；QQ Music 不使用它。有效二进制探测已提取至 `src/main/audio/mpv-binary.ts`，飞书转码直接依赖它，保留下载准备与校验脚本。新增探测测试，不用删除测试掩盖失败。 |
| `src/renderer/types/legacy-firefly.d.ts`、`packages/plugin-sdk/src/legacy.ts` | 删除旧 Window/SDK 公开别名。仓库内消费者、开发示例均使用 Firefly；原始 SDK 作者及 LICENSE 不变。 |
| Vitest `scripts/cline-poc/**/*.test.ts` | 删除不存在目录的扫描项；其余实际扫描范围不变。 |

## 移动与导航

- `src/renderer/tast/*.png` → `src/renderer/assets/task-portraits/*.png`，12 张：艾利欧、大黑塔、丹恒、姬子、卡夫卡、帕姆、刃、三月七、瓦尔特、星期日、银狼、知更鸟。每张 SHA-256 移动前后相同；没有重新处理透明通道。文件名 `卡夫卡.png` 保持现有资源契约，显示名仍为卡芙卡。
- 同步唯一头像 import 表 `character-portraits.ts`、任务池与朋友圈角色资源测试。`TASK_CHARACTERS`、角色卡、权限与任务路由未改。
- `prompts/source-persona/firefly.yaml` → `docs/reference/persona/firefly.yaml`。实际提示词装配只加载 Markdown；打包仅复制 prompts/skills，不复制 docs，所以源 YAML 不再默认分发。
- `docs/design/2026-08-30-main-process-composition-root-redesign.md`、`2026-09-15-right-panel-ide-layout-design.md` → `docs/archive/design/`。保持历史正文与来源，修正移动后的当前维护链接。
- 新增 `docs/README.md` 作为导航；`docs/architecture/` 保留当前技术说明，`docs/archive/README.md` 管理历史。移除不存在的 v1/v2 索引链接；模型许可中失效的 README 锚点改为真实 README 入口，不修改许可条款。

## 当前公开契约变化

不再公开 `window.cyrene`、`cyreneTheme`、`cyreneWindowAppearance`、`cyreneFont`、`cyreneAppearance`、`cyreneScheduler`；其当前 Firefly API 不变。

不再注册 `cyrene-plugin` scheme、不接受 `cyrene-panel/1` 消息、不提供 `.cyrene/panel-bridge.js` 宿主桥别名，也不导出 `CyrenePlugin` 类型。当前接口为 `firefly-plugin`、`firefly-panel/1`、`.firefly/panel-bridge.js`、`FireflyPanel`、`FireflyPlugin`。来源窗口、origin、启用状态、消息类型及真实路径边界仍按原逻辑验证。旧第三方插件若仍调用上述旧接口，需要按当前指南更新；本轮未检查或改写用户安装的插件，不能承诺这些外部旧接口继续可用。

## 保留的读取兼容与媒体

- `src/main/migration/firefly-data.ts`：旧 chats/runs/tasks 及导出清单读取、备份与无冲突补齐。
- `src/shared/legacy-firefly-contracts.ts`：历史事件、朋友圈身份/设置字段、旧 localStorage、提示词/目录、环境配置、渠道头与旧插件来源元数据的集中规范化。无旧事件双发或旧格式新写入。
- `src/main/migration/channel-credentials.ts`：隔离旧 `obf:` 解混淆，保持原用户目录、应用名与 `cyrene-bot-secret` 的密钥派生。当前写入仍为原 `obf2:`/safeStorage 流程，不触碰真实凭据。
- `sticker-descriptions.ts`：没有可确认的流萤内置贴图，生效描述表为空，不再把旧角色口吻送入语义索引；用户贴图机制不变。文件映射与 `public/stickers/` 的 52 张历史贴图仍被 Moments 媒体解析、渠道媒体解析及已有 ID 规则引用，故没有按“搜不到组件 import”误删，也没有宣称它们已从包中移除。
- 完整 MIT、第三方作者、模型许可与历史施工事实保留。

## 待用户统一提供的图片

1. 流萤贴图及对应语义说明（当前未启用内置流萤贴图）；不能仅给旧图换人物名称。
2. 如需恢复角色装饰：思考/压缩、侧栏、模型/动态/工具/插件、新建、审批/询问/计划，以及 Work/Code/Learn 待办插画。现在使用已有文字/通用图标，不拿其他角色占位。
3. 若要 README 展示截图，提供当前 Firefly 界面的真实截图；本轮不重绘或伪造。

12 张任务头像无需重做。本轮只移动目录；其他图片保留项不自动推断为已获再分发授权。

## 验证边界

定向测试覆盖当前面板拒绝旧协议、头像文件映射、历史数据恢复、旧凭据派生、飞书音频路径及 SDK 示例。类型检查和 clean build 检查更名后的产物。自动验证不代表真实飞书服务、QQ Music、TTS 或所有界面重新实测；不声称已删除的旧公开接口行为不变。

### 本轮实际结果

- 定向 Vitest：15 个文件通过，92 项通过、1 项跳过；跳过为 Windows 符号链接权限探测，未新增跳过。修正文档导航后另跑结构测试，4 项通过（包含于前述范围，不累加）。
- Main、Preload 类型检查与 `check:renderer` 通过；`npm run build` 完成，保留 Renderer 大块体积警告。
- `check:plugin-sdk`、`test:plugin-examples` 通过，4 个当前插件示例通过；SDK 构建复制产生的 LICENSE 文本差异已恢复，原许可证不变。
- `build:sim` 及 coffee（30 轮）、rescue（10 轮）公共仿真退出码为 0；只替换话题文字，轮数、奖励及调度参数未改。仿真输出位于系统临时目录，不纳入提交。
- 构建资源核对：12 张头像与移动前内容逐一 SHA-256 相同，且均在 Renderer 产物中找到相同字节；19 张删除图片的内容不在 Renderer 产物中。旧 mpv-controller 与 SDK legacy 输出不存在。52 张历史贴图仍在产物中，不能宣称已完成这些资源替换。
- `git diff --check` 通过，暂存区为空。HEAD 保持 `35457af3279fccaf0ab462f8744f47183fce79f1`，未提交、推送或合并。
- 历史读取与凭据兼容使用临时测试数据验证，未读取或修改真实用户数据；未重启应用、请求模型或进行新的界面验收。独立仿真编译产生的 `dist/sim` 是本地生成物，不作为源码交付。
