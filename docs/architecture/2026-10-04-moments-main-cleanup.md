# Moments Main/preload/shared 清理验收

日期：2026-10-04。工作分支：`refactor/remove-moments-main`。
基线：`origin/firefly-mini-v1.1.x` = `9660c584c0c191def41906a62802a4ca932bd809`。
隔离工作树：`E:\Codex\2026-10-04\task-3\moments-cleanup`。

## 范围与保留边界

删除 38 个朋友圈专属源文件、测试和角色提示词文件：`src/main/moments/`、`prompts/moments_personas/`、`src/main/orchestrator/tools/moments-tools.ts` 及其测试、`src/shared/moments-types.ts`。
移除 Main 装配、后台扫描/退出 disposer、回合完成触发、Chat 背景块、工具注册、媒体协议、IPC 与 preload bridge；同步更新当前架构和插件 SDK 文档。

旧 Learn/Call 运行入口在指定基线已经退役。再次核验 IPC、preload 和 Main 装配，未发现可继续删除的旧模式运行入口；只更新了误称 Learn 模式的 Work 注释。
`learn/progress.md` 属于现有 Work 知识工作区，`active-call` 拒绝逻辑属于插件输入边界，均保留。

共享 social context、ASR/TTS、渠道、贴图与 embedding、Work 学习/progress/pop_quiz、RAG/Worldbook、`search_text`、调度和 AG-UI 的 `threadId` 保留。
`useSchedulerEvents.ts` 仍按 `schedulerRunId ?? runId ?? threadId` 解析事件归属，未做关键词式清空。
第三方许可、来源记录、模型授权文本以及 vendor 技能均未修改。
未修改 renderer、权限 R1/R2、shell 实现、MCP 事务、Memory 存储、顶层目录名称或 CI 策略；未访问真实 userData 或原产品工作树，未迁移/删除真实用户数据。

## 联动接口

| 接口 | 删除内容 |
|---|---|
| preload | `window.moments` 及其 list/getPost/createPost/deletePost/createComment/toggleLike/listCharacters/onChanged |
| IPC | `MOMENTS_LIST`、`MOMENTS_GET_POST`、`MOMENTS_CREATE_POST`、`MOMENTS_DELETE_POST`、`MOMENTS_CREATE_COMMENT`、`MOMENTS_TOGGLE_LIKE`、`MOMENTS_CHANGED`、`MOMENTS_LIST_CHARACTERS` |
| shared | `moments-types.ts` 全部领域导出，包括 `MomentsApi`、`MomentFeedItem`、`MomentPost`、`MomentComment`、`MomentMedia`、`buildMomentMediaUrl` |
| Settings | `momentsEnabled`、`chatMomentsContextEnabled`、`fireflyMomentsPostingEnabled`、`fireflyMomentsReactionsEnabled`、`momentsCharacterReactionsEnabled`、`momentsLiveliness` |
| 装配 | `registerMomentsIpc`、`registerMomentsTools`、`registerMomentsMediaMatcher`、`startMomentsReactionScanner`、`buildMomentsContext`、`scheduleMomentsTurn`；`onAgentRunFinished` 的专属 `finishedContext` 参数 |
| 图片 | `ImageSource` 的 `moments` 分支；`moment-media` scheme/handler |
| 插件 SDK | `MomentsPostPromptBuildInput`、`PluginPromptSource` 的 `moments-post`；运行时注册旧来源会明确拒绝，旧插件需移除声明并重建 |

应用配置的实际文件名是 `app-settings.json`。归一化读取忽略废弃字段，不新增迁移或清理写回。
审查发现既有安装器选项消费会归一化写盘，导致旧键在升级场景消失；已按 RED→GREEN 修正为仅保存原始配置与显式 `launchAtLogin` 选择的合并结果，其余磁盘字段保留，运行时仍白名单归一化。
用户显式保存设置的既有流程保留。历史 `moments.json`、媒体和旧会话不被清理或自动写入记忆。

## 引用与审查证据

- 删除前保留整仓引用清单；删除后追踪 153 个导出符号。非 renderer 生产专属引用为 0。36 处 `initialize` 同名命中属于其他模块，不是已退役模块导入。
- renderer 仍有 47 处领域符号引用，由独立 UI 任务负责；本分支没有添加空实现、类型壳或条件构建绕过。
- 独立代码/安全审查检查业务入口、协议边界、设置兼容、共享能力和关键删除路径的 Git 历史。P2 安装选项问题和一项注释问题均已修正，无剩余阻断级代码发现。
- 独立审查额外执行 64 项共享能力测试及 24 项设置测试，均通过。
- 具体审查见 [独立报告](./2026-10-04-moments-main-independent-review.md)。整仓引用原始证据位于任务目录 `baseline-moments-refs.txt` 与 `reference-audit.json`。

项目锁定 Electron 43.1.0、TypeScript 5.9.3、Vitest 4.1.11、Vite 7.3.6；测试运行 Node 24.19.0。未更改依赖。
preload API 和协议注册边界核对了 [Electron contextBridge 官方文档](https://www.electronjs.org/docs/latest/api/context-bridge) 与 [protocol 官方文档](https://www.electronjs.org/docs/latest/api/protocol)。此次删除整个专属 bridge 和 scheme/handler，不改变共享 API 的安全包装或协议路径校验。

## 验证记录

日志位于 `E:\Codex\2026-10-04\task-3\`。依赖复制到隔离目录；TEMP/TMP 和 npm 缓存仅在检查进程中指向任务目录，避免改写主工作区和全局缓存。

| 检查 | 结果 |
|---|---|
| 首轮退役契约测试 | IPC/协议/设置/Chat 注入/插件来源的 RED 均观察到预期断言失败 |
| 相关测试 | 10 文件、148 项通过；安装选项修正后设置与启动选项 29 项通过 |
| 共享能力正向回归 | 99 文件、839 项通过 |
| `npm run check:storage-boundary` | 通过，96 个现有访问、50 文件；只移除已删除模块的白名单记录 |
| `npm run build:main` / `build:preload` | 通过 |
| `npm run test:plugin-examples` | 通过；本地 SDK 打包，四个示例编译及冒烟契约全部通过 |
| `npm run check:plugin-schema` / `check:plugin-sdk` | 通过；schema 无漂移，SDK 双入口与包校验通过 |
| `npm run build` | storage、Main、preload、CLI 通过；renderer 因待 UI 删除的 `MomentComposer.tsx` 引用已移除 shared 模块失败 |
| `npm run check:renderer` | 16 错误，均来自待删除朋友圈 UI 的类型引用及其派生错误 |
| 首轮完整 `npm test` | 599 文件中 596 通过，5841 项中 5828 通过、11 失败、2 跳过；失败原因和后续重跑见下 |

首轮 8 个 `shell-job.test.ts` 失败为执行沙箱的子进程存活/终止探测限制。未修改 shell；同文件退出执行沙箱重跑后 13 项全部通过。
另 3 个失败来自 `built-in-tools-shell.test.ts`（2 项）和 `self-improvement-source.test.ts`（1 项）缺少 `FIREFLY_TEST_BASH`。
从实际 `E:\Git\cmd\git.exe` 安装位置核验 `E:\Git\bin\bash.exe`，以 `FIREFLY_TEST_BASH` 指向该夹具并在批准的执行环境重跑，最终全套通过：退出码 0，599 文件全部通过，5840 项通过、2 个既有跳过项，共 5842 项；用时 360.56 秒。日志为 `full-tests-verified.log`。未修改 shell 实现或测试约束。
插件示例首次下载其已声明的 `ajv` 依赖被网络沙箱 `connect EACCES` 阻止；在批准的执行环境重跑通过，日志为 `plugin-examples-verified.log`。未修改依赖或 npm 脚本。

## 发布和合并约束

必须与 UI 分支同步清理 renderer 类型、入口、面板、设置绑定和功能目录，再重新执行 renderer 类型检查及完整构建。
本分支只做本地提交，不推送、不创建 PR、不合并、不部署。未验证真实 GUI、真实网络模型/ASR/TTS 服务或安装包；此报告不宣称整机产品验收通过。
