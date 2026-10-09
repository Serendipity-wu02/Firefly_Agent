# Moments 后端退役代码与安全审查

- 记录日期：2026-10-04
- 审查方式：独立只读代码审查与定向测试
- 结论：一项 P2 兼容问题和一项 P3 注释问题已修正，无剩余阻断级发现
- 范围：[Moments 后端退役](2026-10-04-moments-main-cleanup.md)；不扩展为全仓安全认证

## 1. 审查背景与结论

审查检查朋友圈专属功能退役是否误删共享入口或放宽安全校验，并重点验证安装升级时旧配置字段的保留。未发现权限、MCP、Memory、共享语音、渠道或 Work 学习功能因该退役被误删；这不证明这些独立系统没有其他缺口。

| 级别 | 数量 | 最终状态 |
| --- | ---: | --- |
| P0 / Critical | 0 | 未发现 |
| P1 / High | 0 | 未发现 |
| P2 / Medium | 1 | 安装选项写回兼容已修正并验证 |
| P3 / Nit | 1 | 模式注释已修正 |

审查结论支持该 Main 范围改造。审查时 Renderer 联动尚未完成，不能把后端独立状态作为完整产品发布依据；后续界面验收见[Renderer 布局记录](2026-10-04-renderer-layout-v1.md)。

## 2. 发现与修正

### 2.1 安装选项写回会剔除旧设置字段

涉及 `src/main/settings/settings-facade.ts` 的 `loadGeneralSettings0`，回归位于 `src/main/settings/settings-facade.test.ts`。历史定位分别为 379–389 行和 162 行，行号只适用于审查快照。

当已有 `app-settings.json` 含旧 Moments 字段，同时存在有效 `installer-options.json` 开机启动选择时，原逻辑将 `normalizeGeneralSettings(withInstallerSelection)` 写回磁盘。归一化删除旧字段后，合法安装/升级就会清除这些磁盘值，违背“读取忽略、升级保留”的兼容约束。仅测试普通读取不写盘不能覆盖此路径。

影响为旧配置数据丢失；未证明权限升级或敏感信息外泄。修正后保存原始合并对象 `withInstallerSelection`，运行时返回值仍归一化。安装选择仍只更新用户明确选择的 `launchAtLogin`，消费生命周期不变。新增回归先观察到失败，修正后独立设置集合 24 项通过，验证旧磁盘值保留且运行时旧字段不可见。

### 2.2 Skill 模式注释不准确

`src/shared/ipc-channels.ts` 的历史 308 行注释 `work/code/Work` 已改为 `work/code`；工具覆盖仍为 `chat/work/code`。该问题不影响运行行为。

## 3. 实现边界与共享能力

| 范围 | 审查事实 |
| --- | --- |
| 装配与后台消费者 | `src/main/application/default-dependencies.ts` 移除服务、媒体匹配、IPC 和扫描器；`src/main/application/background.ts` 移除扫描器生命周期；Agent runtime/build-options 移除朋友圈背景及成功收尾发帖调度，没有留下专属后台消费者 |
| 工具、协议和桥 | `src/main/orchestrator/tools/registry/tool-registration.ts`、`src/main/protocols/bootstrap.ts`、`src/preload/index.ts`、`src/shared/ipc-channels.ts` 移除专属链路；旧媒体文件不再由 `moment-media` 提供，但没有新增文件删除/迁移 |
| 社交与记忆收尾 | `buildChatSocialContext`、社交抽取调度、关系记录、既有记忆写入和贴图返回保留；删除的 `finishedContext` 仅用于 Moments 发帖快照，不是共享 `threadId` |
| RAG、Worldbook、搜索与贴图 | 关键词查找、`search_text`、贴图匹配/embedding 创建刷新、渠道 outgoing-composer 保留；贴图测试仅移除专属 matcher 断言，渠道、ID 冲突、用户 GIF 元数据和不写回配置断言保留 |
| Work、Call 与 Learn | `knowledge_workflow.md`、pop_quiz、knowledge workspace、progress 保留；`learn-post-turn` 与 `learn/progress.md` 不属于旧模式入口；Call 桥退役检查和获取资源前拒绝 `active-call` 保留 |
| 调度归属 | Agent `threadId` 及 `RUN_ERROR` 的 threadId/runId/schedulerRunId/schedulerTaskId 保留 |
| 独立敏感边界 | 权限、shell、MCP 事务、Memory 存储、Renderer、许可/来源/模型声明及顶层目录不属于该退役差异 |

审查和定向测试使用隔离代码与合成夹具，没有访问真实用户文件。

## 4. 插件与协议安全契约

`src/plugins/prompts.ts` 在写入 registry 之前检查非空数组及允许来源。`sources: ["moments-post"]` 明确拒绝，混合活动与退役来源同样完整拒绝，不静默映射到 conversation。`src/plugins/api.ts` 与 `packages/plugin-sdk/src/api.ts` 保持一致的活动来源联合，旧插件需移除声明后重新构建。

显式来源过滤、未声明来源仅允许 conversation/scheduler、取消信号和模式过滤保留。移除的是 Moments 专属模式例外。活动来源、plugin-agent opt-in、多来源模式过滤、非法声明后正常注册，以及 provider 失败/超时/长度限制的正向测试保留。

协议 bootstrap 的 pre-ready 与 shell-bootstrap 两个注册路径均纳入审查。sticker URL 及目录内解析、字体解码、文件名白名单、父目录和存在性检查保留。`sticker-protocol.ts` 与 `ui-font-protocol.ts` 的有效资源和路径穿越拒绝测试独立通过。

旧 Moments IPC 和 `moment-media` 已无暴露入口/handler，不回落到通用文件访问。未发现删除校验却保留受保护访问入口的情况。

## 5. 影响范围与证据边界

采取定向差异审查：完整检查共享生产文件差异与修改测试，优先跟踪协议、插件、设置安全路径；对 38 个专属删除文件按归属、153 个导出及反向调用审查，没有逐行重新审计约一万行删除实现。

引用检查记录非 Renderer 生产专属引用为 0、Renderer 47 个文本命中、通用同名符号 36 个命中。`initialize` 等命中按实际导入鉴别，没有误删存储、调度或 Live2D。Main/Preload/shared/plugins/SDK 非测试 TypeScript 检查没有残余 Moments 链。

插件生产注册入口为 `src/plugins/context.ts`，`onAgentRunFinished` 唯一生产调用属于 Agent runtime。关键媒体协议/handler、来源过滤例外与保留安全校验追溯到 2026-09-25 的初始桌面运行实现；历史检查限于这些删除路径及一跳调用。

## 6. 验收证据

历史记录区分独立执行与其他检查产生的日志，不把二者相加为独立覆盖量。

| 检查 | 证据性质与结果 |
| --- | --- |
| 专属契约与共享入口 | 已读取 10 文件 / 148 测试通过的证据；不是独立重跑 |
| 独立共享正向回归 | 8 文件 / 64 测试通过，退出码 0，2.20 秒；覆盖 sticker protocol、ui font、embedding cache、learn-post-turn、speech-input-service、scheduler-runner、search-code-tools、launch-at-login |
| 独立安装选项回归 | 设置测试 1 文件 / 24 测试通过，350ms；另读取修复前失败与修复后 29 项通过日志 |
| Main/Preload/schema | 已读取构建及 schema 成功证据；没有独立重建 |
| 差异空白检查 | 退出码 0 |
| 审查时 Renderer | 16 个类型错误，来自尚未联动的 UI 退役；未用 stub 绕过 |
| 后续共享回归 | 99 文件 / 839 测试通过；属于读取的补充证据 |
| 最终全仓复验 | 599 文件全部通过；5840 项通过 / 2 跳过，共 5842 项，退出码 0，360.56 秒；属于审查结束后补充证据 |

独立测试使用隔离临时目录；Windows shell 检查要求已核验的 `FIREFLY_TEST_BASH`，进程回归要求允许相应子进程操作。网络受限会阻止插件示例获取已声明依赖。最终复验没有修改产品配置、shell、测试约束或 CI。原始测试时间使用 UTC+08，不能解释为 UTC。

插件示例的最终补充证据覆盖本地 SDK 打包、四个示例编译和冒烟契约。快照文件的字节一致性检查未发现语义变化。

## 7. 后续验收要求与限制

后续变更继续验证安装选择合并保留、旧来源拒绝、共享协议路径约束与共享能力回归。真实 GUI、模型、外部 ASR/TTS、安装器及打包未由该审查执行；没有浏览器或真实用户数据检查。完整发布需当前整合版本的 Renderer 和原生验收，本文不宣称当前工作树已重新通过全仓检查。
