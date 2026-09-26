# 流萤贴图、头像与托盘资源接入（2026-09-26）

## 范围与基线

分支 `firefly-mini-v1.1.x`，HEAD `35457af3279fccaf0ab462f8744f47183fce79f1`。保留此前84项工作树状态所代表的改动，在其上继续实施；没有暂存、提交、推送或合并。未修改两个原目录的源码、桌面原图或用户设置/历史文件。开发依赖沿用现有 node_modules junction，Electron 二进制位于其目标目录；应用源码与 Renderer 则从本迁移目录加载。

本报告接续 structure-cleanup-2026-09-26.md。该报告中的“52张保留”“无内置描述”“卡夫卡.png”是上一阶段事实，本轮按新授权下架/替换/更名，不改写此前报告正文。

## 21项准确映射

来源：用户指定桌面目录 `流萤_desktop/firefly`。逐张看图并核对图中文字；全部实际为 PNG，1254×1254，RGBA，alpha范围0–255，单帧，无动图。复制后与原图逐张SHA-256相同，未重绘、压缩或用静态首帧替换动画。

| 原文件名 | 英文文件名 | 新ID | 中文含义 |
|---|---|---|---|
| 抱抱.png | hug.png | firefly-hug | 张开双臂，抱抱 |
| 吃饭.png | meal.png | firefly-meal | 端着饭碗，吃饭 |
| 大哭.png | cry.png | firefly-cry | 流着眼泪，大哭 |
| 点赞.png | thumbs-up.png | firefly-thumbs-up | 竖起拇指，点赞 |
| 放假.png | holiday.png | firefly-holiday | 躺着休息，放假 |
| 害羞.png | shy.png | firefly-shy | 捂着嘴，害羞 |
| 喝茶.png | tea.png | firefly-tea | 捧着茶杯，喝茶 |
| 加油.png | cheer.png | firefly-cheer | 握拳鼓励，加油 |
| 开心.png | happy.png | firefly-happy | 双手捧脸，开心 |
| 困了.png | sleepy.png | firefly-sleepy | 揉眼睛，困了 |
| 累了.png | tired.png | firefly-tired | 趴着休息，累了 |
| 你好.png | hello.png | firefly-hello | 张开手打招呼，你好 |
| 亲亲.png | kiss.png | firefly-kiss | 闭眼送吻，亲亲 |
| 生气.png | angry.png | firefly-angry | 鼓起脸，生气 |
| 收到.png | received.png | firefly-received | 抬手回应，收到 |
| 晚安.png | good-night.png | firefly-good-night | 抱着枕头，晚安 |
| 委屈.png | upset.png | firefly-upset | 眼含泪水，委屈 |
| 想我没.png | miss-me.png | firefly-miss-me | 指着脸询问，想我没 |
| 谢谢.png | thanks.png | firefly-thanks | 抱着花束，谢谢 |
| 早安.png | good-morning.png | firefly-good-morning | 挥手问候，早安 |
| OK.png | okay.png | firefly-okay | 做出OK手势 |

每项图片实际路径为 `src/renderer/public/stickers/<英文文件名>`，构建路径为 `dist/renderer/stickers/<英文文件名>`。唯一目录配置是 `src/shared/firefly-stickers.ts`（含原文件名、英文名、新ID、描述、短语），不创建第二套贴图服务。

实际引用链：`sticker-types.ts` 的内置ID → `sticker-descriptions.ts` 文件/描述表 → `sticker-storage.ts:getAllStickerConfig` → 已有 STICKERS_GET_ENABLED/GET_CONFIG → ChatComposer选择、ChatMessageList显示、贴图管理页。渠道使用 `outgoing-composer.ts:resolveStickerImagePath`；朋友圈使用 `moment-media-matcher.ts:resolveMomentStickerMedia`；语义索引使用既有 `embedding-index-service` → `sticker-embedding-cache` → `sticker-embedder`。

52张旧图文件和当前内置映射已移除，源目录及清理后 Renderer 产物都只有21张新图。`src/shared/retired-stickers.ts` 中的旧ID/文件名只用于历史下架提示与防止复用旧ID，不会把旧ID映射到新图。Chat旧记录显示“表情包已下架”，普通资源加载失败显示“表情包不可用”；朋友圈旧角色媒体同样提示下架。消息正文和存储文件不改写。

保留自定义贴图、开关及GIF路径。已有自定义ID与新内置ID重合时，自定义记录在列表、渠道、朋友圈及向量描述中优先，不覆盖用户文件。历史显示读取已有完整配置，不因禁用选择开关就丢失历史用户图片。已有缓存键包含描述与provider身份，新目录改变键后只重建贴图索引；测试确认用户条目和无关向量文件保留，未清空用户缓存，本轮未主动发起真实embedding验收请求。

## 卡芙卡头像

`src/renderer/assets/task-portraits/卡夫卡.png` → `src/renderer/assets/task-portraits/卡芙卡.png`。

移动前后 SHA-256 均为 `e2458eef3817245c076084df800257ffaa63a50bd3be342dc37627c480b43538`。

当前角色池、import和资源测试同步；显示名、职责、权限与角色身份不变。旧历史记录仍可能保存旧文件名，`legacy-firefly-contracts.ts:normalizeStoredPortraitFileName` 只在读取头像路径时规范化，未改写历史。12位映射测试通过，且新实例已有公开Work历史中卡芙卡头像实际显示。

## 托盘

旧 `assets/tray-icon.ico` 确认为昔涟图像。新图仅由已核实的 `assets/icon-presets/firefly.png` 编码，所有尺寸帧来自同一图，不生成其他人物。ICO帧：16、20、24、32、40、48、64、128、256，各帧已解码并查看。SHA-256：`3b13bace628c87c66ea95349cedeab141d70e697aebd6380e25e9a9668e4529d`。

`src/main/tray-icon.ts:loadTrayIcon` 从 `app.getAppPath()/assets/tray-icon.ico` 加载，失败只回退到 `assets/icon-presets/firefly.png`。`tray.ts` 创建托盘及 `general-settings-lifecycle.ts` 更新托盘均走此函数；窗口图标仍走原窗口机制，不改应用身份。`electron-builder.yml` 原有 `assets/**/*` 规则覆盖两项资源，无需新增打包规则。

实现依据：[Electron nativeImage格式与尺寸](https://www.electronjs.org/docs/latest/api/native-image)、[React DOM图片事件](https://react.dev/reference/react-dom/components/common)。本轮没有打包安装器。

## 旧入口停用

`src/shared/firefly-environment.ts` 仅读取已定义的FIREFLY_*字段；Main、CLI、共享日志、音频探测、截图、沙箱、prompt dump及Vite调用方同步。旧CYRENE_*不再回退。迁移测试保留负例；历史存储与旧凭据解密仍集中保留。

`inbound-server.ts` 仅接受 `x-firefly-channel-secret`，共享密钥生成和定长/恒定时间校验不变。HTTP定向测试证明仅旧头为401、错误新头为401、正确新头通过鉴权进入后续路由。

剩余 `__CYRENE_LOCAL_NO_AUTH__` 是 `settings.ts` 对旧已存本地模型档案的无密钥占位符识别，不是环境变量入口；旧 `obf:` 凭据派生保持不变。两者不因本轮停用环境/请求头回退而删除。

修正 settings.ts 旧网易云注释；sticker-storage.ts注释对应当前流萤内置与用户列表。MIT及原版权原样保留，新素材来源仅记录用户提供，不补写未提供的再分发授权条款。

## 验证

- 首轮新回归先观察失败：新资源目录/列表、旧头仍被接受、历史缺图无提示；另验证旧环境回退与自定义同名ID问题，再实施修正。
- 定向组合32个文件、351项通过；随后自定义冲突修正及日志相关补跑7个文件、54项通过，包含前述重复用例，不相加声称405个独立测试。没有跳过项，也没有执行无关全量套件。
- Main、Preload、Renderer类型检查通过。
- 一次完整构建尝试中Main/Preload/CLI完成，Renderer因Vite仍引用旧环境模块失败；修正该真实引用后只补跑Renderer构建，成功。保留既有大chunk警告，未降低检查标准。
- 产物检查：21/21与原图字节相同；52/52旧贴图不在 `dist/renderer/stickers`；卡芙卡哈希相同。ICO九帧校验及正常/回退路径测试通过。
- `git diff --check` 通过，暂存区为空。此处为源码与自动验证，不等于外部渠道发送或实际向量服务成功。

## 集中实机

启动前没有运行的Firefly/Electron实例，故无需退出旧实例；从迁移目录执行一次 `npm start`，没有重复启动。聊天窗口实际URL是 `file:///E:/Codex/Firefly-Agent-migration/dist/renderer/react/index.html`；Main返回的新21项目录也已在选择面板展现。

- 已实机确认：21张贴图在面板上下滚动查看，图片与描述对应；已有公开Work任务展开后，卡芙卡历史头像正常显示。
- 未实机确认：系统通知区托盘图标（控制通道未提供可直接检查的通知区窗口）；其源文件九帧及加载调用链已验证，不能写成通知区视觉验收通过。
- 未执行：发送真实模型消息、真实渠道发送、真实embedding服务；用户GIF动画显示由原路径及组件测试覆盖，本次21张本身无动画。
- 历史下架、缺图、用户GIF及缓存更新使用公开临时测试数据验证，不造真实用户历史记录。

## 本轮实际增量文件

相对仓库外上一轮审查包快照核对，而不是把全部累计差异归为本轮。下列包含资源移动的旧/新路径；此前删除项、报告与头像整理仍保留。

| 文件 | 本轮变化 |
|---|---|
| `assets/tray-icon.ico` | 修改 |
| `src/cli/state/state.test.ts` | 修改 |
| `src/cli/state/state.ts` | 修改 |
| `src/cli/util/resolve-electron.ts` | 修改 |
| `src/main/agent-log.ts` | 修改 |
| `src/main/agui-bridge.test.ts` | 修改 |
| `src/main/agui-bridge.ts` | 修改 |
| `src/main/channels/adapters/feishu/audio-duration.test.ts` | 修改 |
| `src/main/channels/adapters/feishu/audio-duration.ts` | 修改 |
| `src/main/channels/inbound-server.test.ts` | 新增 |
| `src/main/channels/inbound-server.ts` | 修改 |
| `src/main/channels/outgoing-composer.ts` | 修改 |
| `src/main/cita/cita-service.test.ts` | 修改 |
| `src/main/firefly-sticker-resources.test.ts` | 新增 |
| `src/main/logger.ts` | 修改 |
| `src/main/migration/firefly-data.test.ts` | 修改 |
| `src/main/moments/character-personas-firefly.test.ts` | 修改 |
| `src/main/moments/moment-media-matcher.test.ts` | 修改 |
| `src/main/moments/moment-media-matcher.ts` | 修改 |
| `src/main/moments/moments-service.test.ts` | 修改 |
| `src/main/orchestrator/sandbox/sandbox-exec.test.ts` | 修改 |
| `src/main/orchestrator/sandbox/sandbox-exec.ts` | 修改 |
| `src/main/orchestrator/vendors/prompt-dump.ts` | 修改 |
| `src/main/perf-trace.test.ts` | 修改 |
| `src/main/rag/model-status.test.ts` | 修改 |
| `src/main/rag/model-status.ts` | 修改 |
| `src/main/screenshot/screenshot-lifecycle.ts` | 修改 |
| `src/main/settings/general-settings-lifecycle.ts` | 修改 |
| `src/main/sticker-descriptions.ts` | 修改 |
| `src/main/sticker-embedder.ts` | 修改 |
| `src/main/sticker-embedding-cache.test.ts` | 修改 |
| `src/main/sticker-storage.ts` | 修改 |
| `src/main/structure-cleanup.test.ts` | 修改 |
| `src/main/tasks/task-character-pool.test.ts` | 修改 |
| `src/main/tray-icon.test.ts` | 新增 |
| `src/main/tray-icon.ts` | 新增 |
| `src/main/tray.test.ts` | 修改 |
| `src/main/tray.ts` | 修改 |
| `src/renderer/assets/task-portraits/卡芙卡.png` | 新增 |
| `src/renderer/global.d.ts` | 修改 |
| `src/renderer/public/stickers/Airkiss.jpg` | 删除 |
| `src/renderer/public/stickers/Allset.jpg` | 删除 |
| `src/renderer/public/stickers/Dreak.jpg` | 删除 |
| `src/renderer/public/stickers/Free.jpg` | 删除 |
| `src/renderer/public/stickers/Gigglelots.jpg` | 删除 |
| `src/renderer/public/stickers/HI.jpg` | 删除 |
| `src/renderer/public/stickers/Hurtcry.jpg` | 删除 |
| `src/renderer/public/stickers/Madnow.jpg` | 删除 |
| `src/renderer/public/stickers/OK.jpg` | 删除 |
| `src/renderer/public/stickers/PanincCrying.jpg` | 删除 |
| `src/renderer/public/stickers/Sobbinghard.jpg` | 删除 |
| `src/renderer/public/stickers/Thanks.jpg` | 删除 |
| `src/renderer/public/stickers/Thumbsup.jpg` | 删除 |
| `src/renderer/public/stickers/Vcayover.jpg` | 删除 |
| `src/renderer/public/stickers/Whatswrong.jpg` | 删除 |
| `src/renderer/public/stickers/angry.png` | 新增 |
| `src/renderer/public/stickers/awesome.jpg` | 删除 |
| `src/renderer/public/stickers/awkward.jpg` | 删除 |
| `src/renderer/public/stickers/blushhard.jpg` | 删除 |
| `src/renderer/public/stickers/calm.png` | 删除 |
| `src/renderer/public/stickers/cheer.png` | 新增 |
| `src/renderer/public/stickers/clingy-confused.gif` | 删除 |
| `src/renderer/public/stickers/confident.png` | 删除 |
| `src/renderer/public/stickers/copythat.jpg` | 删除 |
| `src/renderer/public/stickers/cry.png` | 新增 |
| `src/renderer/public/stickers/deadtired.jpg` | 删除 |
| `src/renderer/public/stickers/eating.jpg` | 删除 |
| `src/renderer/public/stickers/fighting.jpg` | 删除 |
| `src/renderer/public/stickers/foryou.jpg` | 删除 |
| `src/renderer/public/stickers/giveup.jpg` | 删除 |
| `src/renderer/public/stickers/good-morning.png` | 新增 |
| `src/renderer/public/stickers/good-night.png` | 新增 |
| `src/renderer/public/stickers/goodmoring1.jpg` | 删除 |
| `src/renderer/public/stickers/goodnight.jpg` | 删除 |
| `src/renderer/public/stickers/happy.png` | 新增 |
| `src/renderer/public/stickers/hello.jpg` | 删除 |
| `src/renderer/public/stickers/hello.png` | 新增 |
| `src/renderer/public/stickers/hellyeah.jpg` | 删除 |
| `src/renderer/public/stickers/hmph.jpg` | 删除 |
| `src/renderer/public/stickers/holiday.png` | 新增 |
| `src/renderer/public/stickers/hug.png` | 新增 |
| `src/renderer/public/stickers/hugtight.jpg` | 删除 |
| `src/renderer/public/stickers/kiss.png` | 新增 |
| `src/renderer/public/stickers/love-calm.png` | 删除 |
| `src/renderer/public/stickers/love-happy.png` | 删除 |
| `src/renderer/public/stickers/meal.png` | 新增 |
| `src/renderer/public/stickers/midmeh.jpg` | 删除 |
| `src/renderer/public/stickers/miss-me.png` | 新增 |
| `src/renderer/public/stickers/missme.jpg` | 删除 |
| `src/renderer/public/stickers/okay.png` | 新增 |
| `src/renderer/public/stickers/outfast.jpg` | 删除 |
| `src/renderer/public/stickers/peek.gif` | 删除 |
| `src/renderer/public/stickers/playful.png` | 删除 |
| `src/renderer/public/stickers/please.jpg` | 删除 |
| `src/renderer/public/stickers/poorwallet.jpg` | 删除 |
| `src/renderer/public/stickers/putmd.jpg` | 删除 |
| `src/renderer/public/stickers/received.png` | 新增 |
| `src/renderer/public/stickers/serious.png` | 删除 |
| `src/renderer/public/stickers/shy.png` | 新增 |
| `src/renderer/public/stickers/shyshort.jpg` | 删除 |
| `src/renderer/public/stickers/sleepy.png` | 新增 |
| `src/renderer/public/stickers/sleepynow.jpg` | 删除 |
| `src/renderer/public/stickers/sogood.jpg` | 删除 |
| `src/renderer/public/stickers/sonice.jpg` | 删除 |
| `src/renderer/public/stickers/sotired.jpg` | 删除 |
| `src/renderer/public/stickers/tea.png` | 新增 |
| `src/renderer/public/stickers/teatime.jpg` | 删除 |
| `src/renderer/public/stickers/thanks.png` | 新增 |
| `src/renderer/public/stickers/thinking.jpg` | 删除 |
| `src/renderer/public/stickers/thumbs-up.png` | 新增 |
| `src/renderer/public/stickers/tired.png` | 新增 |
| `src/renderer/public/stickers/upset.png` | 新增 |
| `src/renderer/public/stickers/weeploud.jpg` | 删除 |
| `src/renderer/react/character-avatars.test.ts` | 修改 |
| `src/renderer/react/character-portraits.ts` | 修改 |
| `src/renderer/react/features/chat/components/ChatMessageList.test.ts` | 修改 |
| `src/renderer/react/features/chat/components/ChatMessageList.tsx` | 修改 |
| `src/renderer/react/features/chat/components/StickerImage.test.ts` | 新增 |
| `src/renderer/react/features/chat/components/StickerImage.tsx` | 新增 |
| `src/renderer/react/features/moments/MomentPostCard.tsx` | 修改 |
| `src/renderer/settings/settings.ts` | 修改 |
| `src/renderer/sticker-manager/main.ts` | 修改 |
| `src/shared/firefly-environment.ts` | 新增 |
| `src/shared/firefly-stickers.ts` | 新增 |
| `src/shared/legacy-firefly-contracts.ts` | 修改 |
| `src/shared/logger.ts` | 修改 |
| `src/shared/retired-stickers.ts` | 新增 |
| `src/shared/sticker-types.ts` | 修改 |
| `src/shared/task-characters.ts` | 修改 |
| `vite.config.ts` | 修改 |

本报告自身为新增文档。

此外，上一阶段 `structure-cleanup-2026-09-26.md` 只增加本报告的接续链接；`THIRD_PARTY_NOTICES.md` 增加用户提供贴图的来源记录，不改变原许可归属。
