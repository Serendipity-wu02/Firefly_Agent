# Firefly 当前运行结构

本文描述当前源码，不是上游历史设计。项目地址为 https://github.com/Serendipity-wu02/Firefly_Agent 。上游贡献与 MIT 许可见根目录 LICENSE 和 THIRD_PARTY_NOTICES.md，不把沿用实现标为原创。

各技术主题的现行维护入口见 [Firefly 维护与回归边界](./firefly-maintenance.md)。

## 独立维护基线与结构地图

### 持久专业 Agent 与模型路由

| Agent ID | 角色 | 默认抽象模型路由 |
|---|---|---|
| strategy-planning | 艾利欧 | reasoning |
| architecture | 姬子 | reasoning |
| implementation | 刃 | coding |
| research | 大黑塔 | research |
| knowledge | 丹恒 | research |
| review | 瓦尔特 | reasoning |
| security-governance | 星期日 | reasoning |
| ui-visual | 三月七 | vision |
| documents-data | 知更鸟 | document |
| tooling-skills | 银狼 | coding |
| ops-release | 帕姆 | fast |
| coordination-debug | 卡芙卡 | reasoning |

真实定义为 `src/shared/specialist-agents.ts`。42项逐 Skill 的 primary/shared/global 归属由 `src/main/orchestrator/specialist-profiles.ts::buildSkillOwnership` 返回，modes、effectKind、tools 和说明从实际注册条目读取，不另建注册表。每项只有一个 primary；共享与 global 不授予工具权限。Work提供全部十二个，Code不提供documents-data，Chat不提供委派。

Main通过现有Harness调用 `delegate_agent({ agent_id, prompt })`，持久化沿用TaskSessionStore schema2。`AgentSessionRegistry`以会话、规范化工作区和准确Agent ID定位会话；复用保留消息、Todo、不确定副作用和模型档案身份。子Agent能力取父运行授权交集，不能再次委派、询问用户或确认父级副作用；输出按ownerSessionId隔离。

Agent Routing保存 `agentModelProfiles`（抽象路由）和 `specialistModelProfiles`（角色覆盖）中的已保存档案ID，不复制密钥/URL。角色覆盖优先；缺失或失效档案明确报错，不自动选第一个模型。改变绑定不静默改绑既有会话；编辑同一档案的服务配置会影响后续请求。Agent 会话仅接受当前 schema2 身份；持久化读取失败保留原文件，不把其他任务记录当作命名 Agent 会话。

Firefly 当前工作树是唯一产品实现基线。后续修改从本文件列出的 Firefly 入口开始，不以原项目的实现作为默认答案。原项目只用于来源、版权追溯；不作为构建输入，也不作为缺失文件的运行回退。工程独立不改变第三方归属。


下表的“运/构/包/测”分别表示运行使用、构建输入、正式包输入、验证用途；“编译”表示通过 dist 间接分发。功能启停仍由现有配置决定，“运”不表示默认启用或已实机通过。

| 目录 | 运/构/包/测 | 职责、入口与依赖方向 | 来源及边界 |
|---|---|---|---|
| `src/main` | 运/构/编译/测 | `index.ts` → `application/` → 业务服务；Electron、IPC、模型和持久化的宿主 | Firefly 维护的既有运行架构，不另设启动链 |
| `src/preload` | 运/构/编译/测 | `index.ts` 使用 `contextBridge` 暴露受限 API → `shared/ipc-channels.ts` → Main handlers；`music.ts` 是其中的音乐桥 | 不是 Renderer 的 Node 文件访问入口 |
| `src/renderer/react` | 运/构/编译/测 | `main.tsx` → `App.tsx`、`app/providers`、`features/chat`、`features/settings`；通过 preload 调用 Main | Chat / Work / Code 三模式共用工作台 |
| `src/renderer/live2d`、`assets`、`public` | 运/构/包/测 | 桌宠控制与动作解析；`assets/task-portraits` 由角色映射 import；public 由 Vite 复制模型、贴图及浏览器运行资源 | 图像/模型和 Cubism 等保留各自许可；不是应用用户数据 |
| `src/renderer/settings`、`sidebar`、`sticker-manager`、`tasks`、`toast` | 运/构/编译/测 | `vite.config.ts` 的各 HTML entry → 对应窗口；共用 `ui`、`shared`、`lib`、`types`、`i18n-runtime` | 多窗口视图，不以名称相近判定为可删除的重复实现 |
| `src/renderer/react-perf` | 专用构/测 | `scripts/perf/chat-renderer-baseline.mjs` 和 `FIREFLY_PERF_HARNESS` 选择专用入口 | 性能夹具，不是普通 build 的页面入口 |
| `src/shared` | 运/构/编译/测 | IPC、事件、数据类型、路径/ZIP安全契约被 Main/preload/Renderer 按需引用 | 当前 Firefly IPC、类型与安全契约；不双发事件 |
| `src/plugins` | 运/构/编译/测 | `loader.ts`/`manager.ts` 由 Main plugin runtime 调用；manifest/schema、资源/存储/IPC约束 → 宿主端口 | 通用插件机制，不能以 SDK 重名认为存在第二套插件执行器 |
| `src/cli` | 构/编译/测 | `index.ts` → `app.ts` → `commands`；`scripts/build/cli.mjs` 生成 `dist/cli/index.js` | `firefly run` 从调用者当前项目启动 Electron，不读取原项目 |
| `packages/plugin-sdk` | 构/测；插件使用 | `scripts/plugin-sdk/build-sdk.mjs` 构建本地 `@firefly/plugin-sdk`；示例用本地产物编译 | 未发布 npm；许可保留；不伪造线上下载服务 |
| `skills` | 运/包/测 | `diagram`、`knowledge-workspace`、`plugin-development` 三项能力正文/附件，经 `external-content-paths.ts` → scanner/registry | 产品内置；不是 Codex 开发插件 |
| `prompts` | 运/包/测 | `prompts/prompt-loader.ts` 解析根提示词；`styles`、`worldbook` 分别供风格、触发知识 | 静态角色资料不改变子任务权限或制造用户共同经历 |
| `scripts/build` | 构/测 | CLI esbuild、Rust 截图助手 Cargo 构建 | 产物去 dist/resources，不从原项目复制 |
| `scripts/packaging` | 构/包准备/测 | Skills 目录校验、MinGit 和可选 mpv 准备；读取当前 vendor 清单，共享 ZIP 层仅用于其他归档 | 历史适配源码不进入正式 Skill 分发；不运行下载的上游安装脚本 |
| `scripts/plugin-sdk` | 构/测 | SDK/schema生成、包验证、示例编译/Mock | 不执行 npm publish |
| `scripts/ci`、`verify`、`diagnostics`、`perf` | 测 | CI退出证据、产物检查、显式诊断及性能测试 | 不是普通启动链；有副作用的验收不能由文档自动执行 |
| `scripts/packaging/upstream-skills` | 显式维护/测 | 固定来源获取工具、配置及其测试 | 不参与启动、普通build或打包；获取暂存不进入正式扫描 |
| `vendor/firefly-skills` | 运/包/测 | 正式 Skills 目录、manifest、LICENSE-NOTICES、licenses/provenance → 安装器 extraResources → Skills 初始化 | 39 项固定来源 Skills，与三项项目 Skills 合计 42 项 |
| `vendor/mingit-manifest.json`、`mpv-manifest.json` | 包准备/测 | 对应准备脚本读取版本、地址、校验和 | 真实第三方二进制来源，不是当前应用更新源 |
| `resources` | 包准备/包/测 | `bin/firefly-screenshot.exe`、`mingit` 是本机构建/下载暂存；`bin/mpv` 只供显式转码准备 | `electron-builder.yml` 只复制明确列出的输入；components不属于当前音乐包 |
| `native` | 构/包/测 | `Cargo.toml`、`src/main.rs`、`src/win` → 截图exe；Main screenshot客户端按协议调用 | Windows原生助手，依赖Rust/MSVC/SDK，不依赖原项目二进制 |
| `assets` | 运/包/测 | app/tray图标、编辑器文件类型图标、UI纹理；由app-icon/tray、Renderer和builder引用 | 资源许可独立于代码许可；不同尺寸图标不是重复模块 |
| `examples` | 显式构/测 | system-status、weather-tool、scheduled-automation、long-term-memory、local-asr-contract → SDK及manifest协议 | 开发示例，不会自动安装到真实用户plugins |
| `build` | 包准备/包验证 | `installer.nsh` 由 NSIS include 引用 | 是安装器源码；不同于可再生 dist，不删除整个 build |
| `scripts/verify/sandbox-runtime` | 显式研究 | 独立脚本核对 sandbox runtime；普通package脚本不调用 | 保留研究用途，不宣称生产沙箱的替代实现 |
| `models` | 外部可选运行时 | 仓库只跟踪占位/忽略规则；RAG从明确配置定位用户模型 | 不含权重的源码分发；不自动安装BGE-M3 |
| `docs` | 文档/核对 | architecture为当前入口，plugins/user-guide为使用契约；archive记录证据与历史 | 不从历史施工计划重新生成产品功能；许可和追溯不抹除 |
| `.github` | CI/维护 | Test/plugin-sdk等工作流调用当前package/scripts | 不改变检查阈值、发布或分支策略 |
| `dist`、`node_modules`、`release` | 可再生输出/依赖 | build、npm ci、electron-builder输出 | 不复制用户环境作为产品源码；不用于归属判断 |

### Main 重要二级目录

以下源码由 Main 配置编译，各自同目录测试由 Vitest 扫描。`sim` 也会被当前 Main include 编译，但没有应用启动调用；它的实际运行命令另由 `tsconfig.sim.json` 输出到 `dist/sim`。这是待按模块整理的包体冗余，不把它写成第二套运行核心。业务依赖由 `application/default-dependencies.ts` 装配，表内“入口”表示模块主调用面，不宣称每个目录只能有一个文件。

| 模块 | 实际调用面与下游 | 重叠/兼容判断 |
|---|---|---|
| `application`、`startup`、`windows` | `createApplication` → pre-ready/shell/core/background；startup提供窗口/配置准备，windows/window-manager管理窗口 | lifecycle所有者是application；startup不是第二个bootstrap |
| `orchestrator` | `agent-runtime.ts`装配选项 → `firefly-agent.ts` → 无工具Chat或`harness-adapter.ts` | 输入/提示词适配与执行循环分层，不合并成一个巨型入口 |
| `orchestrator/harness` | `firefly-harness.ts` → tool-round/scheduler/dispatcher、adapter、run-store、tool-output | 唯一工具执行循环，task复用它；副作用与终态分别记账 |
| `orchestrator/tools` | `registry/tool-registration.ts` → 文件/文档/Git/LSP/生活等工具注册；registry提供模式及开关过滤 | built-in-tools/fs-tools仍有导入注册副作用，属维护边界，不在本轮重写 |
| `orchestrator/vendors`、`model-config`、`structured-output`、`config` | 模型协议、配置、结构化输出能力；由build-options/harness等消费 | 第三方协议名不进行品牌更名 |
| `orchestrator/review`、`sandbox` | 执行审查与恢复；sandbox-exec提供现有沙箱运行约束 | 不以结构整理放宽权限或删除恢复数据 |
| `chat`、`chats` | chat/image-caption与think-filter处理内容；chats/chats-ipc、store管理会话，workspace-files-ipc及work-read-scope/evidence/export管理Work文件契约 | 单复数分别是内容处理与持久化/UI IPC，不是两套历史库 |
| `tasks` | task-session-store和task-character-pool被orchestrator/persistent-agent-runtime调用 | 展示角色池不拥有审批或模型权限 |
| `permission` | bootstrap → 根级`permission.ts`/`permission-policy.ts`与`user-choice.ts` → Harness permissionCheck | 文件与目录同名是实现/装配拆分，需保留明确import解析 |
| `skills` | index → 目录校验/托管同步 → scanner/registry → catalog/tools | 三项项目能力与 39 项 vendor Skills 进入同一注册表；用户覆盖优先，角色/流程协议不占 Skill ID |
| `settings` | settings-facade、model-settings、settings-ipc；根级settings-store管理用户资料 | 模型档案与用户称呼职责不同，不合并存储格式 |
| `memory`、`rag` | memory-store/工作记忆；rag/index与embedding、document-index队列 | 原始记忆与可重建索引分离；未配置向量服务不等于原始历史不存在 |
| `knowledge` | 绑定 Work Vault 的 Obsidian 工具与进度；`knowledge-workspace.ts` 判定资格，build-options/AGUI 消费 | 显式初始化，保存原 `learn/progress.md` 数据路径；每个运行捕获自己的工作区 |
| `code-git`、`lsp` | GitService、工作区watcher、Git IPC；LspManager供工具调用 | 外部Git/LSP运行时明确，watcher生命周期按工作区关闭 |
| `services` | llm、tts、embedding、cita、social-context的宿主服务适配 | services/cita包装cita领域实现，不是重复语义引擎 |
| `cita`、`runtime-policy` | cita上下文结构/语义引擎；统一token/timeout政策供运行层消费 | 领域逻辑与服务配置分开 |
| `channels`、`scheduler` | 各自bootstrap构造适配器/定时任务 → 同一AgentRuntime；由background显式start | 不自动启用渠道、发消息或补跑任务 |
| `plugin-host`、`plugin-panel` | 宿主服务/生命周期；面板桥脚本；根级plugin-runtime衔接src/plugins | 同一插件运行时的宿主侧与嵌入页，不建立第二套加载器 |
| `proactive`、`social-context`、`relationship` | proactive-lifecycle、上下文提取/检索、relationship-log | 各类上下文来源；默认开关和用户偏好不在结构整理中变更 |
| `tts`、`asr`、`mossland` | TTS session、ASR dispatcher、Mossland api-client；Call 专用窗口与循环已退役 | 外部服务适配保留真实协议/供应者名，不伪造服务配置 |
| `music`、`audio` | music/bootstrap与QQ GSMTC；audio/mpv-binary供飞书audio-transcode探测 | mpv是通用转码依赖，不是被删除的网易云播放器 |
| `screenshot`、`protocols`、`toast` | 截图lifecycle/原生helper，协议bootstrap，toast-service/window | 各自资源按application受控退出，不新增全局循环 |
| `prompts` | prompt-loader读取有效外部内容路径 | 不恢复旧YAML人设解析链 |
| `updater` | github-app-updater → app-update-service → IPC | 当前updatesEnabled=false且publish=[]；与Skills托管更新完全不同 |
| `sim` | dmae-sim/run-l2-sim由npm sim脚本调用 | 合成记忆仿真，不是用户Agent或第二套生产运行时 |

### 唯一主线与具体入口

1. **启动**：package `main=dist/main/main/index.js`，源码 `src/main/index.ts`；先应用身份和日志、scheme/导航保护，再创建application、单实例预配置；ready后shell → core → background。退出由`application/shutdown.ts`协调。preload由窗口工厂选择`dist/preload/preload/index.js`；主工作台为Vite的`react/index.html` → `react/main.tsx`，桌宠及辅助窗口使用上表入口。
2. **三模式**：Renderer Chat工作台的mode → preload AGUI_RUN → `agui-bridge.ts`会话/运行登记 → `AgentRuntime.buildOptions` → `build-options.ts`/`mode-prompt-profile.ts` → `FireflyAgent.runWithEvents`。Chat可走无工具路径，Work/Code使用同一Harness和各自模式过滤；仅接受当前三模式记录。AGUI_CANCEL把AbortSignal传到同次run，终态经原订阅回送Renderer。
3. **任务/工具/审批**：`harness/adapter/tool-runtime.ts`建立同次运行上下文，`persistent-agent-runtime.ts`/`specialist-profiles.ts`限制子任务工具，`tasks/task-session-store.ts`保存状态。`tool-registration.ts`注册工具；`skill-tools.ts`、插件和专项工具在各自初始化点注册到同一registry。`permission.ts`/`permission-policy.ts`和Harness dispatcher共同决定许可、effectKind、审批与取消，不由角色名称决定。
4. **Skills**：`skills/index.ts::initSkills` → `external-content-paths.ts`确定正式目录与用户位置 → `directory-install.ts`校验并同步托管目录 → `skill-scanner.ts` → `skill-registry.ts`。只扫描项目三项和用户目录，不把打包的 vendor 目录作为第二扫描源。`skill-tools.ts`提供`invoke_skill`和`read_skill_reference`；`skill-catalog.ts`是提示词目录/按规则注入入口。当前池为 39 项 vendor 加三项项目 Skills；旧 39+8 数量仅是历史基线。
5. **数据**：`app-identity.ts`固定appName/userData名为Firefly，根目录来自Electron appData；settings-facade/model-settings、chats-store、task-session-store、memory-store、Harness run-store各自拥有对应数据。`plugin-runtime.ts`使用userData/plugins及plugin-data；Skills用userData/skills。读取失败阻止写回，渠道密钥仅按当前格式解密。读失败与空列表区分沿现有存储契约。
6. **插件**：application core → `plugin-runtime.ts::startPluginRuntime` → `src/plugins/manager.ts`/`loader.ts`；`installer.ts`使用共享安全ZIP落盘层。`packages/plugin-sdk`从当前types构建，`manifest.schema.json`由专用脚本生成校验；examples只做本地编译/Mock。`firefly-plugin`、`firefly-panel/1`与来源、路径、版本限制保持。
7. **分发**：`npm run build`清理dist后编译Main/Preload/CLI/Renderer；`validate:skills`只读校验 39+3 个 Skills 及固定文件哈希；`prepare:mingit`从vendor清单准备已校验第三方包；`build:screenshot-helper`从本仓库Cargo源码构建。`electron-builder.yml`直接复制 `vendor/firefly-skills/skills/`、目录 manifest、许可通知及项目 `skills/`，不打包旧 Skills ZIP 或开发适配输入。`package:win:dir`不等于安装器验收或 Release 发布；修改正式目录后须先运行 `validate:skills`。
8. **更新**：应用更新service当前关闭；Skills托管同步通过当前 manifest 与管理状态保护用户修改；安装器的 external-content-migration 保留用户可编辑内容。四者目的不同，不以“统一更新”合成一个破坏性覆盖入口。

### 结构决策与不变契约

- 运行模块不为整齐而重命名：`startup`/`application`、`chat`/`chats`、`services/cita`/`cita`已确认职责不同。为了整齐移动会增加调用和历史测试维护成本，没有消除实际重复所有者的收益。
- `scripts/build`、`packaging`、`verify`、`ci`等已按职责分开；正式 vendor Skills 目录、历史适配输入、resources 二进制暂存与 dist 输出各有不同用途。
- 测试沿现有同目录布局保留：Vitest扫描src、skills/tests、packages/src；Node测试扫描scripts须显式执行；Rust测试由Cargo执行。Main/preload正式编译不应将`*.test.ts`列为根输入；测试代码不应通过`dist/**/*`进入正式包。对应修正与验证见集中报告。
- 身份不能混用：仓库展示`Firefly_Agent`，npm包`firefly-agent`，Electron appName及userData子目录`Firefly`，appId `com.serendipitywu02.firefly`，CLI `firefly`，SDK `@firefly/plugin-sdk`。这些是不同协议职责，本轮不更改其值。
- 隔离启动验证可显式设置 `FIREFLY_ISOLATED_SMOKE_APPDATA` 为已存在、位于常规 appData 之外的绝对目录；Main 在读取设置前重定向 Electron appData，再按原有身份规则生成该目录下的 `Firefly` userData。未设置时不改变正式路径；无效或重叠路径在启动前拒绝。此入口仅供本地测试，不应写入用户配置或正式启动脚本。
- `docs/architecture` 是长期入口；迁移、CI 事故和 refactor 报告保留历史证据。版权署名、第三方包名和来源 URL 按实际许可与来源保留，不作为当前运行入口。
- 没有把未知模型/办公服务、真实用户环境、深度GUI、TTS、QQ Music审批、持续帧率、安装器或跨平台状态写成通过。完整证据及独立性验证边界见[集中记录](firefly-reliability-boundaries.md)。

## 执行与身份

- `src/main/orchestrator/firefly-agent.ts` 是统一运行入口；无工具 Chat 与 Harness 按执行模式分工。
- `src/main/orchestrator/harness/firefly-harness.ts` 拥有执行循环、工具调度、取消和终态推进，调用既有权限、审批、任务存储与恢复机制。
- `mode-prompt-profile.ts` 按 Chat、Work、Code 选择各自 system、identity、Markdown soul 与台词参考。Work/Code 继续按现有位置加入任务角色展示说明。
- `harness/adapter/prompt-builder.ts` 在非 Chat 模式加载 `prompts/firefly_harness.md`；工具和运行规则仍按原层次组装。
- `build-options.ts` 将环境中的称呼、当前上下文、风格、Skills、语气和工具约束放在原注入位置。`tone-injector.ts` 读取 `prompts/tone-rules.md`，缺失或不可读时使用同一流萤兜底。
- 不加载旧 Firefly YAML 架构。世界书按现有触发、优先级和预算使用；原作经历不等于与当前用户共同经历。

## Work 知识工作区与语音

Work 会话显式绑定目录，通过“添加学习结构”确认后调用 `initKnowledgeWorkspace`，只补缺失文件。已绑定的目录含 `.obsidian` 或 `learn/progress.md` 时，`build-options.ts` 注入 `prompts/knowledge_workflow.md` 并按用户工具开关开放六个 Obsidian 工具；普通 Work 不自动初始化或更新进度。`obsidian_edit` 继续走 fs-write 审批；只读和逐次审批不会静默更新进度。入口及数据结构见 [知识工作区指南](../user-guide/knowledge-workspace.md)。

Call 独立窗口、循环及 IPC 已退役；共享 ASR/TTS、Chat 语音播放/取消和渠道语音保留。插件语音输入只支持 `active-chat`；`active-call` 在取得租约前明确拒绝，不建立替代通话循环。

## 持久 Agent 基础与接线状态

`tasks/agent-session-registry.ts`、`tasks/task-session-store.ts`、`orchestrator/persistent-agent-runtime.ts`、`settings/agent-model-routing.ts` 与 Harness `delegate_agent` 边界构成持久会话基础：按父会话、工作区和 Agent 身份恢复，继承权限与取消，保存路由身份而非凭据。Main已接入上述持久委派与十二个确认映射，设置页提供模型路由绑定；旧 public task 入口及 generic profiles 已删除。

## Skills

当前三项项目 Skill 发现入口为 `skills/diagram/`、`skills/knowledge-workspace/`、`skills/plugin-development/`。已移除内置 assessment 和 tutoring 正文及附件；知识工作区、图示和插件开发保留，现有用户文件、配置及历史不清理。角色表达转入 `prompts/persona-support/`；计划与文件操作协议转入 `prompts/workflow-support/`，由提示词层明确组合，不另注册 Skill。保留来源、许可和附件，不冒充原作引文。39 项 vendor 加三项项目 Skills 已通过确定性生成、迁移保护回归及隔离启动注册检查；场景样例仅为维护资料，不自动注入。

扫描、注册、模式过滤、按需正文与附件读取、autoInject 规则保持原机制。设置仅使用当前 Skill ID 与模式，用户关闭和修改受保护；名称不扩大工具权限。正式目录的验收范围以实际验证记录为准。

`invoke_skill` 仍最多返回正文前 6000 字符。需要后续正文时，用现有 `read_skill_reference` 的 `skill_id`、`source: "body"`、`ref: "SKILL.md"` 和提示给出的 `offset` 续读；默认 `source: "reference"` 保持附件读取方式，每页最多 8000 字符。按来源、文件和偏移去重，模式白名单、enabled、路径限制不变；正文续读沿用 invoke_skill 的动态效果分类，未声明仍 unknown，附件默认 read 不变。没有永久注入全部 Skills。

继承 Skills 保留原 ID；审查和子任务开发两项现为 Firefly 维护适配，通过真实 `task` 参数及 `references/` 读取，不使用 Codex 开发插件的独立代理接口。九项 Superpowers 附完整 MIT 与来源通知；PPTX 六处锚点修正，不改生成能力。历史适配输入保存在 `scripts/packaging/skill-adaptations/`，正式分发直接复制已核验的 vendor 目录，不从该输入重新生成 ZIP。首次安装与后续托管同步均经目录校验、用户修改保护及备份。

项目 SDK 为本地构建的 `@firefly/plugin-sdk`，通过本地 tarball 验证和安装，尚未发布到 npm。插件市场未配置；保留本地 ZIP 安装，默认不请求第三方市场。

### 托管升级保护与已登记维护问题



P2 后续事项：`skills/skill-tools.ts` 的 `readRefs` 是进程级 Set，当前生产调用链没有调用 `resetReadRefs()`；不同运行读取同一分页会受到此前读取记录影响。此项是已有实现缺陷，不属于本轮结构更名或已解决的静态 Skill ID 绑定；后续应限定运行作用域并验证跨会话读取，不以全局 alias 或扩大权限处理。本轮没有扩大修改该链路。Main 编译仍带入未由启动入口引用的 `sim` 源码，以及工具注册的副作用 import，亦保留为按模块整理事项，不把它们误判为第二套生产 Agent Loop。

## 兼容与数据

`%APPDATA%\Firefly`、历史列表和配置读取保护不变。当前事件、角色身份、配置字段、插件协议和数据目录使用 Firefly；不读取或迁移其他产品的安装数据。原生截图助手使用 `firefly-screenshot`，CLI 使用 `firefly`。

打包版用户 prompts 仍优先于内置文件；不覆盖用户自定义内容。

环境配置仅读取 `src/shared/firefly-environment.ts` 中明确列出的 `FIREFLY_*` 字段；渠道入站服务只接受 `x-firefly-channel-secret`。旧环境变量和旧请求头不在兼容范围内。历史记录中的旧公开桥与协议承诺已被当前实现取代，不据旧报告配置运行环境。

## 生命周期与数据完整性

运行入口、适配器与工具分发器仍分别承担模型调用、事件转换、执行和权限控制；不恢复旧施工稿中的第二套规划或强制完成工作流。`src/main/agui-bridge.ts`、`orchestrator/harness-adapter.ts` 与 `harness/firefly-harness.ts` 使用同一次运行身份，正常完成、失败和取消必须结算原运行，迟到事件不得覆盖下一次运行。临时流式文字不代表工具执行或文件完整读取成功。

历史列表由 `chats/chats-store.ts` 管理，运行和子任务分别由 `harness/run-store.ts`、`tasks/task-session-store.ts` 管理。读取失败不是首次使用或空列表；失败状态不得触发空数据写回。当前数据路径由 `firefly-data-paths.ts` 决定；本次清理不访问真实用户目录。

## 插件与已退役入口边界

当前插件开发入口为 [插件开发指南](../plugins/plugin-dev-guide.md) 和 [接口规范](../plugins/plugin-authoring.md)，不再使用旧市场施工方案。SDK 为本地构建产物，不宣称存在已发布的新 npm 包或官方市场。插件注册、停用和资源清理由现有 `src/plugins/`、`src/main/plugin-host/` 与 `src/main/plugin-runtime.ts` 负责；更名不开放权限决策或替换运行循环。

面板使用 `firefly-plugin`、`firefly-panel/1` 与 `FireflyPanel`。来源窗口、origin、版本、启用状态和资源真实路径校验继续有效；已移除旧面板协议、scheme 与桥别名；不双发事件。

朋友圈的 Main/preload/shared、媒体协议、后台反应扫描和提示词来源已退役。读取应用设置时忽略废弃键，不因升级改写已有配置；历史动态、媒体和会话数据不删除、不迁移。共享 social context、贴图与 embedding、RAG/Worldbook、渠道、ASR/TTS、Work 学习进度及调度事件 threadId 继续保留。Renderer 的入口与面板由独立 UI 批次清理，联动前不得发布。

## 文档替代范围

旧 Harness 初建、评审、施工进度、运行边界计划，旧插件系统草案、发布与市场计划，以及旧角色朋友圈设计稿已退出当前工作树。其技术边界由本文及当前插件规范承接；原始方案和当时的验证结论可在 Git 历史查阅。删除文档不删除功能，也不把旧文档中的待办宣称为已完成。

## 验证边界

源码核对说明接线；测试结果只适用于其实际运行版本与范围，不能证明真实模型、音频、播放器或全部视觉状态通过。阶段实机记录从归档索引查阅；历史记录统一从 `docs/archive/README.md` 查阅。项目 ZIP 入口使用 `yauzl@3.4.0` 与 `src/shared/zip-extraction.ts`；验证记录见 [文档与依赖汇总](firefly-reliability-boundaries.md)。
