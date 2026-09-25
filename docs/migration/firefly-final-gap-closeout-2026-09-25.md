# Firefly 最后一轮缺口收口（2026-09-25）

本记录接续 [Batch 6 后的收尾记录](./firefly-final-handoff-2026-09-25.md)，不改写当时的事实。本轮未触碰旧 Firefly 数据、未重新迁移或覆盖 `%APPDATA%\Firefly`，未暂存、提交、推送或发布。

## 曾出现的空列表

- 用户提供的首次重开截图里，Work／Chat 列表及模型档案列表为空；用户后来从托盘正常退出并启动同一本地包后确认三类数据恢复。此前已核实启动的是 `release/win-unpacked/Firefly.exe`，Electron 用户数据目录为 `%APPDATA%\Firefly`，磁盘结构仍有 1 项模型档案及 10 个会话（Chat 6、Work 4）。没有可证明首次空列表由哪一步造成的运行事件记录，因此**事件根因仍未确定，复现未完成**。
- 静态加载链：`src/main/index.ts` 在进程启动时设定应用身份；`src/main/application/core-bootstrap.ts` 注册 IPC 后才加载 Chat 页面；`src/main/chats/chats-ipc.ts` 注册时初始化 `chats-store` 缓存；Renderer 的 `ChatPage` 再从 IPC 取列表。模型设置由 `model-settings.ts` 缓存，设置页通过 `listModelProfiles` 获取。存在明确的展示缺口：Chat 会把尚未获取的列表显示成空列表；模型档案在桥接缺失时直接返回，也显示“没有档案”。
- 本轮让 Chat／Work 的“读取中／IPC 读取失败／真实为空”和模型档案的对应状态分别显示；桥接缺失不再显示“没有档案”。修正主进程文件日志初始化顺序：先设置 Firefly 用户数据目录，再安装日志接收器。新增启动诊断仅写文件是否存在及档案／会话数量，不记录名称、正文、路径、地址或凭据。诊断用于下次复现定位，**不是对首次事件根因的证明**。旧数据及备份均未改动。
- 仍须注意：`chats-store.readIndexFromDisk` 遇无效索引会回退空数组，`loadModelSettings0` 读取失败会回退默认值；这两种 Main 内部回退不会触发 Renderer 的 IPC 错误态。现有事件没有证据证明曾走过这两条路径，本轮没有为推测根因改写持久化容错语义。若再次出现空列表，先用新的启动数量诊断和磁盘结构定位，不新建档案或会话来覆盖现场。

## 朋友圈角色资料

- 保持 `loadCharacterPersonas` 原有“任务角色池与同名角色卡交集”加载机制、头像映射和默认关闭开关；未改子任务权限、职责、工具或用户记忆。原有六张卡：艾利欧、卡芙卡、帕姆、刃、银狼、知更鸟。本轮新增：大黑塔、丹恒、姬子、三月七、瓦尔特、星期日。12 张卡均以 `TASK_CHARACTERS` 的姓名及实际项目素材文件名通过加载测试；`卡芙卡` 的已确认素材文件仍名为 `卡夫卡.png`。
- 新卡只概括可核实的原作身份与表达方向；共享 `_header.md` 继续约束不得虚构与当前用户共同经历。未恢复黄金裔旧角色卡，未设未经确认的专属活跃档位，也未启用朋友圈。六位更细的口癖、互动频率及彼此专属关系未由本轮来源确定，保持原加载器默认档位。
- 角色事实来源：[《崩坏：星穹铁道》官方网站角色介绍](https://sr.mihoyo.com/main?nav=world)（姬子、瓦尔特、丹恒、三月七、大黑塔及星期日）；[大黑塔角色 PV 官方发布页](https://sr.mihoyo.com/news/127971?nav=home)（大黑塔形象与研究主题）；[星期日官方角色 PV](https://www.youtube.com/watch?v=ud0jXAK5Uls)（理想与各自前路）。新卡是简短改写，不复制官方长文或台词。

## 验证与交付边界

- 本轮 6 个定向测试文件、43 项测试通过；`npm run check:renderer`、`npm run build:main`、`npm run build:renderer` 通过。改动影响最终产物，使用 `npx electron-builder --win --dir --publish never` 更新本地解包包；此前正式打包流程与截图助手真实调用结果沿用原记录，**此次更新后的包未再次启动**，不能把旧启动证据当作新版本实机验收。
- 最终 `release/win-unpacked` 有 `Firefly.exe`、Main／Preload／Renderer、截图助手及 12 张朋友圈卡；角色卡名称与已确认的 12 名单完全一致。包内 Main 含新的日志初始化调用，Renderer 资源含新的历史读取及档案失败提示。应用正常退出后，先前根目录的 `debug.log` 已移除；最终包根目录不再有该日志。`app.asar` 共 56,648 项，未发现用户设置／历史文件和本机语音／公开验收目录；包外 1,854 个文件中未发现本轮核对的私人配置、日志、截图目录或临时测试输出。此为本地产物路径及文件名检查，不是安装器或所有运行路径的完整审计。
- 最终检查时 `%APPDATA%\Firefly` 的模型设置和会话索引仍存在，`%APPDATA%\Firefly-Cyrene-Base` 备份也仍存在；本轮没有重新打开应用或读取私人内容。用户先前确认重开后设置及历史恢复，首次空列表事件仍记为未复现、根因未定。
- 更新后的 `release/win-unpacked` 仅为本地解包应用；NSIS 安装器仍未验证。自动更新保持关闭，素材再分发授权原文／范围仍需发布前归档。真实语音、Firefly 内 QQ Music 审批、DXGI、持续 60 FPS、全部视觉状态及 12 位角色逐一实机展示未在本轮补测。
- 累计工作树文件清单见同目录的 `firefly-uncommitted-files-2026-09-25.md`。该清单只是状态记录，不代表已暂存或获准提交；生成包在被忽略的 `release/`，不进入 Git。
- Git：`main` 的 HEAD 为 `46610b9df82eecbfea03dffe7de1f340bf42080c`，`origin` 为 `https://github.com/Serendipity-wu02/Firefly_Agent.git`。累计 602 个工作树状态项（源码与配置 399、资源与角色卡 136、文档与许可 17、生成物 50），暂存区 0；生成物类别含仓库已有跟踪的 `dist/renderer` 差异，不代表应不经检查直接提交。未合并旧仓库历史。
