# 运行档案与存储边界阶段验收

- 记录范围：运行身份预检、集中存储路径、安全 JSON 写入及 Windows 解包 smoke
- 状态：该阶段自动化检查与两次解包 smoke 通过；历史实现边界和未覆盖项如下
- 当前规范：[运行档案与存储](runtime-profile-storage.md)、[运行架构](firefly-runtime.md)

## 1. 背景

开发、测试与 smoke 实例必须在服务初始化前建立明确身份和隔离目录，防止普通启动或验证流程误写正式用户数据。存储收口还需保留安装器已有的内容迁移消费者，并提供失败时保留旧配置的写入语义。

本记录是初次交付阶段的技术验收摘要。2026-09-29 的配置事件仅作为设计背景，不推定事件根因或可靠历史备份存在。历史只读取证未修改生产文件；检查范围内未找到可靠的事前 MCP 配置副本，这不能证明其他位置不存在备份。真实用户目录、取证文件路径、逐次执行记录和原始文件元数据不属于长期技术规范。

## 2. 运行身份契约

Main 的首个副作用导入为 identity-preflight，顺序为：解析、规范化、校验身份 → 设置 Electron appData/userData/sessionData/logs → 安装 StorageContext → 导入并初始化服务。预检不导入 logger、settings、MCP、plugin、Skills 或 Memory 写入者。

生产身份保持 appData 下的 `Firefly`，生产 sessionData 等于 userData，日志位于 `userData/logs`。命令行契约为：

- `--firefly-profile=production|development|test|smoke`
- `--firefly-isolation-root=absolute-existing-directory`
- 环境变量 `FIREFLY_RUNTIME_PROFILE`、`FIREFLY_ISOLATION_ROOT`
- 兼容显式 `FIREFLY_ISOLATED_SMOKE_APPDATA`，命令行优先

格式错误、重复、未知、缺失、相对或不存在的根，以及与生产目录相等、嵌套或互为祖先的根均拒绝。开发工具必须传身份与显式根，不依赖 `NODE_OPTIONS`。Windows realpath、junction、大小写、`..` 和 `path.relative` 包含关系在设置路径前检查，随后验证 Electron 实际路径。

## 3. 存储职责与兼容边界

### 3.1 集中路径与静态门禁

StorageContext 的 config/data/state 对应 userData，cache 为 `userData/cache`，logs/session 分别使用 profile 的对应目录。集中管理 `mcp-servers.json`、`token-usage.json`、`content-manifest.json` 和 `logs/firefly.log`。

该阶段清单包含 99 处访问、53 个文件、62 个所有权记录，其中 `BOOTSTRAP_ALLOWED` 15 处、`MIGRATE_LATER` 84 处。MCP、Token、logger 和 manifest 四个所有者完成集中路径接入，移除两个字面直接 userData 查询。AST/build gate 拒绝未批准的新源码文件、访问预算增加和动态路径查询；它是源码回归约束，不抵御任意 JavaScript 或恶意并发本地进程。

Memory 的 `memory/data`、`memory/index`、`memory/temp` 在当时属于未来目录契约，要求规范根互不包含且识别 junction 祖先关系；没有迁移既有 Memory 布局。后续记忆实现应查阅当前规范，不能把这份历史目录测试当作完整迁移证据。

### 3.2 安装内容清单保留

`build/installer.nsh` 使用 `.Firefly.content-preserve` 原生暂存；`default-dependencies` 将所有者传给 core-bootstrap，`startCore` 在 Skills 初始化前调用 `migrateStagedExternalContent`。迁移读取既有分发哈希并合并用户内容，打包启动刷新 manifest。未发现退出阶段消费者。

因为这些原生安装器消费者仍存在，content manifest 退役暂停。五项既有迁移测试保留，并增加四项所有者、失败和非生产回归。非生产实例不消费或删除安装暂存，旧用户文件保留。

### 3.3 安全 JSON 写入

AtomicJsonStore 同时校验输入、序列化形状与已有 JSON。`ENOENT` 的默认值仅留在内存。写入使用同目录独占临时文件、Node flush/fsync、单份有界 `.bak` 和不先删除主文件的 rename。

- 备份写入/替换失败阻止主文件替换。
- 主文件替换失败保留原有效内容，仅清理自身临时文件。
- 已有 JSON 损坏时保留原字节并阻止覆盖。
- MCP 保存失败会断开刚建立的服务器连接，Token 用量也使用该存储。
- 不承诺目录级掉电耐久性或多进程并发事务。

MCP 的 safeStorage/OS 保护及 scoped `secretRef` 当时仅完成设计审计，没有迁移真实密钥。这份存储验收不证明 MCP Main 的全部授权或输入验证边界已完成。

## 4. 测试覆盖与最终阶段结果

失败先行与回归覆盖运行档案、路径应用、StorageContext、预检、Atomic JSON、MCP 保存失败、Token、logger/manifest、Memory 包含关系、CLI 及 AST 访问分类。审查补充序列化形状、连接清理、Windows junction 包含关系与 transport 类型测试，原断言和超时约束保留。

| 检查 | 最终阶段记录 |
| --- | --- |
| 定向回归 | 审查修正后 9 文件 / 56 项通过 |
| 完整单元测试 | 540 文件通过；4737 项通过 / 1 项既有跳过，共 4738 项 |
| Main、Preload no-emit 与 Renderer 类型检查 | 通过 |
| 应用构建 | 通过；1159 个运行文件与最终解包产物字节一致 |
| 插件 SDK 与 schema | 双入口、包检查和 schema 检查通过 |
| 插件示例 | 四个示例编译与契约 smoke 通过 |
| 打包与 AST 回归 | 25 项通过 |
| Windows 解包准备 | `npm run package:win:dir` 通过，产物 `release/win-unpacked/Firefly_Agent.exe` |
| 存储静态门禁 | 99 访问 / 53 文件通过 |
| 代码差异空白检查 | 通过；仅既有 CRLF 规范化提示 |
| 两次连续解包 smoke | 均自然退出，code 0 / signal null |

独立审查关闭一项 Important 和两项 Minor，没有剩余代码阻断。Windows junction 的失败先行/修正后检查验证 Memory 包含约束；transport 强制转换已修正；备份、替换和持久写故障注入保留。Node 内部 fsync 无法通过导出的 fsyncSync spy 拦截，因此在写入边界注入 flush 失败并断言 `flush: true`。

上述数字是历史阶段结果，不是当前工作树的新测试报告，也不与其他日期或平台结果合并。

## 5. Windows smoke 的事实与边界

实际编译 Main 入口对七类丢失/无效/生产重叠根拒绝，写入者调用和服务导入均为 0，StorageContext 未安装。最终 asar 中入口、预检、profile、storage、atomic 模块与编译内容一致。

Windows 原生目录查询依赖正确继承的 `USERPROFILE`。诊断曾定位到测试夹具覆盖该变量后 `app.getPath('appData')` 无法返回；保留继承值即可完成路径设置和正常退出。该结论定位夹具触发条件，不宣称已追踪 Windows 内部实现，也没有采用产品代码绕过、超时放宽或弱化隔离。

最终 smoke 用 RuntimeProfile 标志重定向所有 Electron 持久、会话和日志根，测试临时目录与缓存使用隔离位置。没有修改全局环境，未启用 `NODE_OPTIONS` 或复用生产根。启动审计中没有已安装的项目/HF embedding 模型，两个运行均未激活该旧缓存写入者；这不证明所有延后迁移的写入路径均已收口。

两次解包运行实际身份为 `Firefly-smoke`、`packaged=true`、appData 为隔离根、userData 为其 `Firefly-smoke` 子目录、sessionData 为 `userData/session`、logs 为 `userData/logs`，StorageContext 为 smoke。Renderer bridge 加载，Chat/Work/Code 可切换；设置 IPC 返回 44 项唯一 Skills，来自 39 个 vendor 目录与五个当时随附目录。第二次 SKILL.md 哈希及 mtime 与第一次一致，没有重复安装或正文重写。

隔离夹具仅重建/删除 index，data sentinel 哈希在两次运行保持不变；这验证目录契约，不验证既有 Memory 数据迁移。四个生产配置/日志文件的哈希、大小及 mtime 在 smoke 前后保持一致，没有遗留该次验证的应用进程。截图只包含新建隔离界面。

## 6. 后续维护与验收要求

1. 修改启动链时，重新验证服务导入前的身份拒绝和实际 Electron 路径。
2. 修改持久写入时，覆盖损坏原文件、备份失败、主文件替换失败和保存失败后的连接清理。
3. 安装器消费者退役前，保留 content manifest 与原生内容暂存兼容。
4. 对后续 Memory、MCP 权限及遗留直接路径分别维护当前实现和验收，不能继承本记录的完成状态。
5. 真实模型/聊天深度、完整 GUI、外部服务、安装升级和发布验收另行执行。恶意并发 junction 交换、多进程事务和目录级掉电耐久性不在本阶段承诺内。
