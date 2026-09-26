# Firefly 全部累计修改提交清单

## 范围与统计

- 工作目录：`E:\Codex\Firefly-Agent-migration`。
- 分支：`firefly-mini-v1.1.x`；比较基线 HEAD：`35457af3279fccaf0ab462f8744f47183fce79f1`。
- 此清单覆盖相对 HEAD 的全部已跟踪内容差异及未跟踪源码、资源、文档，不只覆盖最近的资源替换。
- 整理前：62 项修改、91 项删除路径、54 项新增路径，共 207 项内容差异；展开未跟踪文件的 Git 状态为 208 项。
- 增加本清单后：62 项修改、91 项删除路径、55 项新增路径，共 **208 项提交路径**；预期 Git 状态 209 项。
- 其中 15 组移动占用 30 个路径：12 张头像、1 份参考 YAML、2 份设计文档。合并移动计数为 **193 项逻辑变更：62 修改、15 移动、40 新增、76 实际删除**。Git 暂存后的相似度识别不会改变路径范围。
- `packages/plugin-sdk/LICENSE` 在工作树状态中显示修改，但 `git diff HEAD` 无内容差异，**不列入提交路径**；不为消除状态标记改写许可证或刷新暂存区。
- 暂存区为空。本轮仅新增清单，未运行测试或构建，未暂存、提交、推送、重启应用或修改两个原目录。

## 累计变更内容

1. 结构整理：头像职责目录、参考 YAML 移出运行 prompts、历史设计归档、文档导航与扫描路径修正。
2. 通用音频探测从旧 mpv 播放控制器拆出，保留飞书转码依赖；清除无调用的播放器实现及对应旧测试，新增探测测试。
3. 项目内 Window、插件桥和 SDK 当前接口统一；移除旧公开接口，保留集中历史数据与凭据解密恢复。保留插件来源、路径与协议安全校验。
4. 21 张流萤贴图、新 ID 和语义目录接入既有机制；52 张旧内置贴图下架。历史缺失图片明确不可用，正文、自定义贴图及其 ID 冲突优先级保留；缓存沿既有版本/描述机制失效。
5. 托盘 ICO 来源为 assets/icon-presets/firefly.png，九尺寸帧与当前开发/打包加载路径统一。
6. 停止旧环境变量及旧渠道请求头入口；正常业务读取 FIREFLY_* 与 x-firefly-channel-secret，不移除已有凭据解密路径。
7. 修正记忆称呼示例、贴图描述、中性仿真样例和失效注释；未改变任务权限、角色职责或用户设置。

详细实现及来源：
- [结构整理记录](../architecture/structure-cleanup-2026-09-26.md)
- [资源替换记录与完整21项语义映射](../architecture/resource-refresh-2026-09-26.md)

前份记录中的“52 张历史贴图仍在产物”是该阶段事实，已由后份记录的 52/52 移除证据接续，不改写历史记录。

## 移动与更名对应

| 原路径 | 当前路径 | 内容关系 |
|---|---|---|
| `src/renderer/tast/三月七.png` | `src/renderer/assets/task-portraits/三月七.png` | 已有逐张 SHA-256 一致证据；卡芙卡仅纠正文件名，角色 ID 不变 |
| `src/renderer/tast/丹恒.png` | `src/renderer/assets/task-portraits/丹恒.png` | 已有逐张 SHA-256 一致证据；卡芙卡仅纠正文件名，角色 ID 不变 |
| `src/renderer/tast/刃.png` | `src/renderer/assets/task-portraits/刃.png` | 已有逐张 SHA-256 一致证据；卡芙卡仅纠正文件名，角色 ID 不变 |
| `src/renderer/tast/卡夫卡.png` | `src/renderer/assets/task-portraits/卡芙卡.png` | 已有逐张 SHA-256 一致证据；卡芙卡仅纠正文件名，角色 ID 不变 |
| `src/renderer/tast/大黑塔.png` | `src/renderer/assets/task-portraits/大黑塔.png` | 已有逐张 SHA-256 一致证据；卡芙卡仅纠正文件名，角色 ID 不变 |
| `src/renderer/tast/姬子.png` | `src/renderer/assets/task-portraits/姬子.png` | 已有逐张 SHA-256 一致证据；卡芙卡仅纠正文件名，角色 ID 不变 |
| `src/renderer/tast/帕姆.png` | `src/renderer/assets/task-portraits/帕姆.png` | 已有逐张 SHA-256 一致证据；卡芙卡仅纠正文件名，角色 ID 不变 |
| `src/renderer/tast/星期日.png` | `src/renderer/assets/task-portraits/星期日.png` | 已有逐张 SHA-256 一致证据；卡芙卡仅纠正文件名，角色 ID 不变 |
| `src/renderer/tast/瓦尔特.png` | `src/renderer/assets/task-portraits/瓦尔特.png` | 已有逐张 SHA-256 一致证据；卡芙卡仅纠正文件名，角色 ID 不变 |
| `src/renderer/tast/知更鸟.png` | `src/renderer/assets/task-portraits/知更鸟.png` | 已有逐张 SHA-256 一致证据；卡芙卡仅纠正文件名，角色 ID 不变 |
| `src/renderer/tast/艾利欧.png` | `src/renderer/assets/task-portraits/艾利欧.png` | 已有逐张 SHA-256 一致证据；卡芙卡仅纠正文件名，角色 ID 不变 |
| `src/renderer/tast/银狼.png` | `src/renderer/assets/task-portraits/银狼.png` | 已有逐张 SHA-256 一致证据；卡芙卡仅纠正文件名，角色 ID 不变 |
| `prompts/source-persona/firefly.yaml` | `docs/reference/persona/firefly.yaml` | 参考资料移出默认 prompts 分发范围 |
| `docs/design/2026-08-30-main-process-composition-root-redesign.md` | `docs/archive/design/2026-08-30-main-process-composition-root-redesign.md` | 历史设计归档；IDE 文档同步相对链接 |
| `docs/design/2026-09-15-right-panel-ide-layout-design.md` | `docs/archive/design/2026-09-15-right-panel-ide-layout-design.md` | 历史设计归档；IDE 文档同步相对链接 |

## 实际删除归类

- 52 张旧内置贴图：新内置目录替代，旧 ID 不映射成不同含义的新图片，历史不可用展示保留。
- 19 张无运行引用旧图片：Renderer 14 张、文档 5 张；沿用已完成引用、动态加载及产物检查。
- 1 个过时示例 ZIP：保留当前 system-status 示例源码与真实作者。
- 2 个旧 mpv 文件：旧控制器及其测试；通用探测与新测试另列新增，不冒充纯更名。
- 2 个旧公开接口文件：SDK legacy 与 Renderer legacy 声明；当前接口和必要数据恢复分别保留。
- 上述共 76 项，不包含移动的 15 个旧路径。准确路径见下表 D 项及移动表。

## 全部提交路径

M=修改；D=删除旧路径（含移动源）；A=新增路径（含移动目标）。本清单逐项列出，不执行 git add。

### 文档与来源声明（20 项路径）

| 状态 | 路径 |
|---|---|
| M | `docs/architecture/firefly-runtime.md` |
| A | `docs/architecture/resource-refresh-2026-09-26.md` |
| A | `docs/architecture/structure-cleanup-2026-09-26.md` |
| A | `docs/archive/design/2026-08-30-main-process-composition-root-redesign.md` |
| A | `docs/archive/design/2026-09-15-right-panel-ide-layout-design.md` |
| M | `docs/archive/README.md` |
| D | `docs/design/2026-08-30-main-process-composition-root-redesign.md` |
| D | `docs/design/2026-09-15-right-panel-ide-layout-design.md` |
| D | `docs/image/code.png` |
| D | `docs/image/harness.png` |
| D | `docs/image/music.png` |
| D | `docs/image/preview.png` |
| D | `docs/image/work.png` |
| A | `docs/migration/firefly-cumulative-precommit-inventory-2026-09-26.md` |
| A | `docs/README.md` |
| A | `docs/reference/persona/firefly.yaml` |
| A | `docs/reference/persona/README.md` |
| M | `MODEL_LICENSE.md` |
| M | `README.md` |
| M | `THIRD_PARTY_NOTICES.md` |

### 图片资源（112 项路径）

| 状态 | 路径 |
|---|---|
| M | `assets/tray-icon.ico` |
| A | `src/renderer/assets/task-portraits/艾利欧.png` |
| A | `src/renderer/assets/task-portraits/大黑塔.png` |
| A | `src/renderer/assets/task-portraits/丹恒.png` |
| A | `src/renderer/assets/task-portraits/姬子.png` |
| A | `src/renderer/assets/task-portraits/卡芙卡.png` |
| A | `src/renderer/assets/task-portraits/帕姆.png` |
| A | `src/renderer/assets/task-portraits/刃.png` |
| A | `src/renderer/assets/task-portraits/三月七.png` |
| A | `src/renderer/assets/task-portraits/瓦尔特.png` |
| A | `src/renderer/assets/task-portraits/星期日.png` |
| A | `src/renderer/assets/task-portraits/银狼.png` |
| A | `src/renderer/assets/task-portraits/知更鸟.png` |
| D | `src/renderer/public/stickers/Airkiss.jpg` |
| D | `src/renderer/public/stickers/Allset.jpg` |
| A | `src/renderer/public/stickers/angry.png` |
| D | `src/renderer/public/stickers/awesome.jpg` |
| D | `src/renderer/public/stickers/awkward.jpg` |
| D | `src/renderer/public/stickers/blushhard.jpg` |
| D | `src/renderer/public/stickers/calm.png` |
| A | `src/renderer/public/stickers/cheer.png` |
| D | `src/renderer/public/stickers/clingy-confused.gif` |
| D | `src/renderer/public/stickers/confident.png` |
| D | `src/renderer/public/stickers/copythat.jpg` |
| A | `src/renderer/public/stickers/cry.png` |
| D | `src/renderer/public/stickers/deadtired.jpg` |
| D | `src/renderer/public/stickers/Dreak.jpg` |
| D | `src/renderer/public/stickers/eating.jpg` |
| D | `src/renderer/public/stickers/fighting.jpg` |
| D | `src/renderer/public/stickers/foryou.jpg` |
| D | `src/renderer/public/stickers/Free.jpg` |
| D | `src/renderer/public/stickers/Gigglelots.jpg` |
| D | `src/renderer/public/stickers/giveup.jpg` |
| A | `src/renderer/public/stickers/good-morning.png` |
| A | `src/renderer/public/stickers/good-night.png` |
| D | `src/renderer/public/stickers/goodmoring1.jpg` |
| D | `src/renderer/public/stickers/goodnight.jpg` |
| A | `src/renderer/public/stickers/happy.png` |
| D | `src/renderer/public/stickers/hello.jpg` |
| A | `src/renderer/public/stickers/hello.png` |
| D | `src/renderer/public/stickers/hellyeah.jpg` |
| D | `src/renderer/public/stickers/HI.jpg` |
| D | `src/renderer/public/stickers/hmph.jpg` |
| A | `src/renderer/public/stickers/holiday.png` |
| A | `src/renderer/public/stickers/hug.png` |
| D | `src/renderer/public/stickers/hugtight.jpg` |
| D | `src/renderer/public/stickers/Hurtcry.jpg` |
| A | `src/renderer/public/stickers/kiss.png` |
| D | `src/renderer/public/stickers/love-calm.png` |
| D | `src/renderer/public/stickers/love-happy.png` |
| D | `src/renderer/public/stickers/Madnow.jpg` |
| A | `src/renderer/public/stickers/meal.png` |
| D | `src/renderer/public/stickers/midmeh.jpg` |
| A | `src/renderer/public/stickers/miss-me.png` |
| D | `src/renderer/public/stickers/missme.jpg` |
| D | `src/renderer/public/stickers/OK.jpg` |
| A | `src/renderer/public/stickers/okay.png` |
| D | `src/renderer/public/stickers/outfast.jpg` |
| D | `src/renderer/public/stickers/PanincCrying.jpg` |
| D | `src/renderer/public/stickers/peek.gif` |
| D | `src/renderer/public/stickers/playful.png` |
| D | `src/renderer/public/stickers/please.jpg` |
| D | `src/renderer/public/stickers/poorwallet.jpg` |
| D | `src/renderer/public/stickers/putmd.jpg` |
| A | `src/renderer/public/stickers/received.png` |
| D | `src/renderer/public/stickers/serious.png` |
| A | `src/renderer/public/stickers/shy.png` |
| D | `src/renderer/public/stickers/shyshort.jpg` |
| A | `src/renderer/public/stickers/sleepy.png` |
| D | `src/renderer/public/stickers/sleepynow.jpg` |
| D | `src/renderer/public/stickers/Sobbinghard.jpg` |
| D | `src/renderer/public/stickers/sogood.jpg` |
| D | `src/renderer/public/stickers/sonice.jpg` |
| D | `src/renderer/public/stickers/sotired.jpg` |
| A | `src/renderer/public/stickers/tea.png` |
| D | `src/renderer/public/stickers/teatime.jpg` |
| D | `src/renderer/public/stickers/Thanks.jpg` |
| A | `src/renderer/public/stickers/thanks.png` |
| D | `src/renderer/public/stickers/thinking.jpg` |
| A | `src/renderer/public/stickers/thumbs-up.png` |
| D | `src/renderer/public/stickers/Thumbsup.jpg` |
| A | `src/renderer/public/stickers/tired.png` |
| A | `src/renderer/public/stickers/upset.png` |
| D | `src/renderer/public/stickers/Vcayover.jpg` |
| D | `src/renderer/public/stickers/weeploud.jpg` |
| D | `src/renderer/public/stickers/Whatswrong.jpg` |
| D | `src/renderer/react/assets/思考组件.png` |
| D | `src/renderer/react/assets/ask/审批.png` |
| D | `src/renderer/react/assets/ask/ask.png` |
| D | `src/renderer/react/assets/ask/planmode批准.png` |
| D | `src/renderer/react/assets/compressing.png` |
| D | `src/renderer/react/assets/model.png` |
| D | `src/renderer/react/assets/moments.png` |
| D | `src/renderer/react/assets/new.png` |
| D | `src/renderer/react/assets/plugin.png` |
| D | `src/renderer/react/assets/sidebar-bg.png` |
| D | `src/renderer/react/assets/todo/codetodo.png` |
| D | `src/renderer/react/assets/todo/learntodo.png` |
| D | `src/renderer/react/assets/todo/worktodo.png` |
| D | `src/renderer/react/assets/tools.png` |
| D | `src/renderer/tast/艾利欧.png` |
| D | `src/renderer/tast/大黑塔.png` |
| D | `src/renderer/tast/丹恒.png` |
| D | `src/renderer/tast/姬子.png` |
| D | `src/renderer/tast/卡夫卡.png` |
| D | `src/renderer/tast/帕姆.png` |
| D | `src/renderer/tast/刃.png` |
| D | `src/renderer/tast/三月七.png` |
| D | `src/renderer/tast/瓦尔特.png` |
| D | `src/renderer/tast/星期日.png` |
| D | `src/renderer/tast/银狼.png` |
| D | `src/renderer/tast/知更鸟.png` |

### 过时示例归档（1 项路径）

| 状态 | 路径 |
|---|---|
| D | `examples/system-status-0.1.0.zip` |

### 源码、类型与构建配置（49 项路径）

| 状态 | 路径 |
|---|---|
| M | `packages/plugin-sdk/src/index.ts` |
| D | `packages/plugin-sdk/src/legacy.ts` |
| M | `src/cli/state/state.ts` |
| M | `src/cli/util/resolve-electron.ts` |
| M | `src/main/agent-log.ts` |
| M | `src/main/agui-bridge.ts` |
| A | `src/main/audio/mpv-binary.ts` |
| M | `src/main/channels/adapters/feishu/audio-duration.ts` |
| M | `src/main/channels/adapters/feishu/audio-transcode.ts` |
| M | `src/main/channels/inbound-server.ts` |
| M | `src/main/channels/outgoing-composer.ts` |
| M | `src/main/channels/settings-store.ts` |
| M | `src/main/logger.ts` |
| M | `src/main/memory/memory-types.ts` |
| A | `src/main/migration/channel-credentials.ts` |
| M | `src/main/moments/moment-media-matcher.ts` |
| D | `src/main/music/mpv-controller.ts` |
| M | `src/main/orchestrator/sandbox/sandbox-exec.ts` |
| M | `src/main/orchestrator/vendors/prompt-dump.ts` |
| M | `src/main/plugin-panel-protocol.ts` |
| M | `src/main/rag/model-status.ts` |
| M | `src/main/screenshot/screenshot-lifecycle.ts` |
| M | `src/main/settings/general-settings-lifecycle.ts` |
| M | `src/main/sim/scenarios/coffee-lifecycle.ts` |
| M | `src/main/sim/scenarios/dormant-rescue.ts` |
| M | `src/main/sticker-descriptions.ts` |
| M | `src/main/sticker-embedder.ts` |
| M | `src/main/sticker-storage.ts` |
| A | `src/main/tray-icon.ts` |
| M | `src/main/tray.ts` |
| M | `src/preload/index.ts` |
| M | `src/renderer/global.d.ts` |
| M | `src/renderer/react/character-portraits.ts` |
| M | `src/renderer/react/features/chat/components/ChatMessageList.tsx` |
| A | `src/renderer/react/features/chat/components/StickerImage.tsx` |
| M | `src/renderer/react/features/moments/MomentPostCard.tsx` |
| M | `src/renderer/settings/panel-bridge-protocol.ts` |
| M | `src/renderer/settings/settings.ts` |
| M | `src/renderer/sticker-manager/main.ts` |
| D | `src/renderer/types/legacy-firefly.d.ts` |
| A | `src/shared/firefly-environment.ts` |
| A | `src/shared/firefly-stickers.ts` |
| M | `src/shared/legacy-firefly-contracts.ts` |
| M | `src/shared/logger.ts` |
| A | `src/shared/retired-stickers.ts` |
| M | `src/shared/sticker-types.ts` |
| M | `src/shared/task-characters.ts` |
| M | `vite.config.ts` |
| M | `vitest.config.ts` |

### 参考人设源文件（1 项路径）

| 状态 | 路径 |
|---|---|
| D | `prompts/source-persona/firefly.yaml` |

### 测试（25 项路径）

| 状态 | 路径 |
|---|---|
| M | `src/cli/state/state.test.ts` |
| M | `src/main/agui-bridge.test.ts` |
| A | `src/main/audio/mpv-binary.test.ts` |
| M | `src/main/channels/adapters/feishu/audio-duration.test.ts` |
| A | `src/main/channels/inbound-server.test.ts` |
| M | `src/main/cita/cita-service.test.ts` |
| A | `src/main/firefly-sticker-resources.test.ts` |
| A | `src/main/migration/channel-credentials.test.ts` |
| M | `src/main/migration/firefly-data.test.ts` |
| M | `src/main/moments/character-personas-firefly.test.ts` |
| M | `src/main/moments/moment-media-matcher.test.ts` |
| M | `src/main/moments/moments-service.test.ts` |
| D | `src/main/music/mpv-controller.test.ts` |
| M | `src/main/orchestrator/sandbox/sandbox-exec.test.ts` |
| M | `src/main/perf-trace.test.ts` |
| M | `src/main/plugin-panel-protocol.test.ts` |
| M | `src/main/rag/model-status.test.ts` |
| M | `src/main/sticker-embedding-cache.test.ts` |
| A | `src/main/structure-cleanup.test.ts` |
| M | `src/main/tasks/task-character-pool.test.ts` |
| A | `src/main/tray-icon.test.ts` |
| M | `src/main/tray.test.ts` |
| M | `src/renderer/react/character-avatars.test.ts` |
| M | `src/renderer/react/features/chat/components/ChatMessageList.test.ts` |
| A | `src/renderer/react/features/chat/components/StickerImage.test.ts` |

## 排除范围

- 不纳入 node_modules、dist、release、SDK dist、原生助手 EXE、缓存、测试输出、运行日志、源图备份、仓库外审查包。
- 不纳入用户设置、历史、渠道凭据、私人音频、模型权重、桌面素材原件；本轮未读取这些内容来生成清单。
- 已读取 .gitignore 并核对上述 208 个具体提交路径，无构建目录、日志、用户数据或备份路径。必要 PNG/ICO 是产品源资源，不应按生成产物排除。
- 删除过时 ZIP 是已跟踪文件的删除操作，必须保留在提交范围；不恢复旧产物。
- 不使用 git add . 或 git add -A 作为本轮操作；后续获准提交时须重新核对范围，新增清单外差异不自动纳入。

## 沿用的验证证据

| 范围 | 已有结果 | 边界 |
|---|---|---|
| 结构整理 | 15 个文件，92 通过、1 跳过；后续结构 4 项通过为重复范围 | 跳过是 Windows 符号链接权限探测，不计入通过 |
| SDK/示例 | check:plugin-sdk、test:plugin-examples 通过，4 个示例 | 不等于外部旧插件仍支持已移除接口 |
| 仿真 | build:sim、coffee 30 轮与 rescue 10 轮退出成功 | 不扩大为真实模型实测 |
| 资源替换 | 32 文件 351 项通过；后续 7 文件 54 项通过 | 存在重叠，不相加为 405 个独立测试；无跳过 |
| 类型 | Main、Preload、Renderer 类型检查通过 | 沿用报告，不重跑 |
| 构建 | 完整尝试中 Main/Preload/CLI 成功；修正 Vite 旧引用后 Renderer 单独成功 | 保留大 chunk 警告，未宣称首次全构建无错误 |
| 资源完整性 | 21 张新贴图原件/产物字节一致；52 张旧贴图产物移除；12 张头像移动哈希一致；ICO 九帧及路径测试通过 | 贴图均为单帧 PNG，未声称新素材包含动画 |
| 差异检查 | 已有 git diff --check 通过，暂存为空 | 本轮不重复测试 |
| 实机 | 最新迁移 Renderer 的贴图选择器显示21张；既有公开 Work 历史卡芙卡头像显示正常 | 未新增模型请求；系统通知区图标视觉未确认；实际外部渠道发送、向量服务及自定义 GIF 动画未实测 |

## 建议提交说明（未执行）

```text
refactor: organize Firefly assets and retire legacy entry points

- organize portrait assets and reference documentation;
- replace retired built-in stickers while preserving history and custom stickers;
- refresh tray icon assets and loading paths;
- remove obsolete public aliases, environment fallbacks and channel header;
- isolate legacy credential recovery and retain shared audio probing;
- update focused regression tests and record validation boundaries.
```

不包含新的功能开发、依赖升级或 Agent 核心重构。此清单只准备提交范围，不代表提交或推送授权。
