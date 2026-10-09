# Moments 后端退役设计与验收

- 记录日期：2026-10-04
- 状态：Main、Preload、共享类型及插件契约退役已完成阶段验证；Renderer 有独立布局验收记录
- 范围：朋友圈专属功能退役、共享能力保留、旧设置数据兼容
- 关联：[独立代码与安全审查](2026-10-04-moments-main-independent-review.md)、[Renderer 布局与退役验收](2026-10-04-renderer-layout-v1.md)

## 1. 背景

Moments 退役需要同时移除专属执行入口与暴露接口，并保留共享社交、语音、渠道、学习和历史数据。读取时忽略旧配置字段，不应在安装升级路径中意外删除旧值。

本文记录该阶段后端改造及其测试证据。同期 Renderer 联动的阶段差异明确保留，历史失败不等于当前源码仍处于该状态。

## 2. 实现事实与联动接口

共删除 38 个朋友圈专属源文件、测试和角色提示词文件，涉及 `src/main/moments/`、`prompts/moments_personas/`、`src/main/orchestrator/tools/moments-tools.ts` 及其测试、`src/shared/moments-types.ts`。上述路径用于标识退役对象，不是当前源码入口。

Main 装配、后台扫描/退出 disposer、回合完成触发、Chat 背景块、工具注册、媒体协议、IPC 和 Preload bridge 的专属链路已移除，并同步架构与插件 SDK 说明。

| 接口 | 退役内容 |
| --- | --- |
| Preload | `window.moments` 及 list/getPost/createPost/deletePost/createComment/toggleLike/listCharacters/onChanged |
| IPC | `MOMENTS_LIST`、`MOMENTS_GET_POST`、`MOMENTS_CREATE_POST`、`MOMENTS_DELETE_POST`、`MOMENTS_CREATE_COMMENT`、`MOMENTS_TOGGLE_LIKE`、`MOMENTS_CHANGED`、`MOMENTS_LIST_CHARACTERS` |
| 共享类型 | `MomentsApi`、`MomentFeedItem`、`MomentPost`、`MomentComment`、`MomentMedia`、`buildMomentMediaUrl` |
| 设置 | `momentsEnabled`、`chatMomentsContextEnabled`、`fireflyMomentsPostingEnabled`、`fireflyMomentsReactionsEnabled`、`momentsCharacterReactionsEnabled`、`momentsLiveliness` |
| 装配 | `registerMomentsIpc`、`registerMomentsTools`、`registerMomentsMediaMatcher`、`startMomentsReactionScanner`、`buildMomentsContext`、`scheduleMomentsTurn`；`onAgentRunFinished` 专属 `finishedContext` 参数 |
| 图片 | `ImageSource` 的 `moments` 分支、`moment-media` scheme/handler |
| 插件 SDK | `MomentsPostPromptBuildInput`、`PluginPromptSource` 的 `moments-post`；旧声明在注册时明确拒绝，旧插件需移除声明并重建 |

## 3. 数据与共享能力边界

旧 Learn/Call 运行入口在该阶段之前已退役；IPC、Preload 和 Main 装配复核没有发现其他可删除的旧模式入口。`learn/progress.md` 属于 Work 知识工作区，`active-call` 拒绝逻辑属于插件输入边界，均保留。

保留能力包括共享 social context、ASR/TTS、渠道、贴图与 embedding、Work 学习/progress/pop_quiz、RAG/Worldbook、`search_text`、调度和 AG-UI 的 `threadId`。`useSchedulerEvents.ts` 仍按 `schedulerRunId ?? runId ?? threadId` 解析事件归属，不按关键词删除共享路径。

设置文件为 `app-settings.json`。普通归一化读取忽略废弃字段，不新增迁移或清理写回。安装选项消费已修正为保存原始配置与显式 `launchAtLogin` 选择的合并结果，运行时仍白名单归一化；用户显式保存设置的既有流程保留。历史 `moments.json`、媒体和旧会话不被清理，也不自动写入记忆。

此阶段未修改 Renderer、权限 R1/R2、shell、MCP 事务、Memory 存储、顶层目录或 CI 策略，没有访问真实用户数据或迁移/删除真实用户文件。第三方许可、来源、模型授权及 vendor Skills 保留。该局部退役结论不构成其他权限系统的完整安全认证。

## 4. 引用检查与后续要求

- 删除前记录引用清单，删除后追踪 153 个导出符号；非 Renderer 生产专属引用为 0。36 处 `initialize` 同名命中属于其他模块。
- 后端检查时 Renderer 尚有 47 个领域符号命中；未添加兼容空壳或条件构建绕过。随后 Renderer 清理及验证见[布局验收](2026-10-04-renderer-layout-v1.md)。
- 独立审查覆盖业务入口、协议、设置兼容、共享能力和关键删除来源；安装选项 P2 与注释问题已关闭，无剩余阻断级代码发现。

后续功能退役应同时检查入口、消费者、类型、设置写回和文件协议，并分别验证共享能力。完成发布验收仍需当前整合版本的类型检查、构建和原生交互证据。

## 5. 历史验收结果

记录环境为 Electron 43.1.0、TypeScript 5.9.3、Vitest 4.1.11、Vite 7.3.6 和 Node 24.19.0，没有更改依赖。协议边界核对了 [Electron contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge) 与 [protocol](https://www.electronjs.org/docs/latest/api/protocol) 文档；退役整个专属 bridge/scheme 不改变共享安全包装和路径校验。

| 检查 | 记录结果 |
| --- | --- |
| 退役契约失败先行 | IPC、协议、设置、Chat 注入、插件来源均出现预期失败 |
| 相关测试 | 10 文件 / 148 项通过；安装选项修正后设置与启动选项 29 项通过 |
| 共享能力正向回归 | 99 文件 / 839 项通过 |
| 独立审查补充回归 | 64 项共享能力测试、24 项设置测试通过 |
| `npm run check:storage-boundary` | 通过，96 访问 / 50 文件；仅移除退役模块白名单 |
| `npm run build:main`、`build:preload` | 通过 |
| `npm run test:plugin-examples` | SDK 打包、四个示例编译及冒烟契约通过 |
| `npm run check:plugin-schema`、`check:plugin-sdk` | schema 无漂移，SDK 双入口和包校验通过 |
| 后端独立阶段 `npm run build` | storage、Main、Preload、CLI 通过；Renderer 的 `MomentComposer.tsx` 仍引用已移除共享模块，构建失败 |
| 后端独立阶段 `npm run check:renderer` | 16 个错误，来自待退役 UI 的类型引用和派生错误 |
| 相同源码最终全仓复验 | 599 文件全部通过；5840 通过 / 2 跳过，共 5842 项，退出码 0，360.56 秒 |

Windows shell 回归需要显式的 `FIREFLY_TEST_BASH` 及已核验的 Git Bash，进程测试需要允许相应子进程操作。插件示例准备还需访问已声明依赖。执行环境无法满足这些前提时，检查失败不能直接证明产品缺陷，也不能被忽略为通过。最终复验没有修改 shell、测试约束、CI、依赖或 npm 脚本。

## 6. 验收限制

所有结果均为 2026-10-04 阶段记录，不代表当前工作树复测。真实 GUI、外部模型、ASR/TTS 服务和安装包不在该后端验收范围内。历史全仓测试通过不等于整机产品或发布验收完成。
