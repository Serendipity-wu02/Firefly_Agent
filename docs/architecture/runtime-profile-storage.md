# 运行档案与存储所有权

本文定义运行档案的启动顺序、隔离目录、持久化所有权和安全写入边界。Main 首先执行 `identity-preflight`：解析参数与环境变量，规范化并验证现有目录及其别名，设置 Electron 路径，安装 StorageContext，最后才导入和初始化业务服务。预检不导入 logger、settings、MCP、plugin、Skills 或 Memory；失败时在这些模块加载前抛出错误。隔离不依赖 `NODE_OPTIONS`。

## 1. 运行入口与档案选择

Electron 接受以下显式参数：

- `--firefly-profile=production|development|test|smoke`
- `--firefly-isolation-root=<absolute existing directory>`

对应环境变量为 `FIREFLY_RUNTIME_PROFILE` 和 `FIREFLY_ISOLATION_ROOT`。既有 `FIREFLY_ISOLATED_SMOKE_APPDATA` 可选择 smoke 并提供隔离根；显式参数优先。缺少值、重复参数、未知档案、相对或不存在的根目录、与生产目录重叠以及规范路径越界均拒绝启动。

production 不接受隔离参数；打包应用默认使用 production。未打包实例默认使用 development，并要求显式隔离根。`npm run dev` 和 `firefly run` 传递 development 身份，运行前须配置 `FIREFLY_ISOLATION_ROOT`；工具不会自动创建隔离根。

### 路径所有权

| 档案 | appData | userData | sessionData | logs | 应用名称 |
| --- | --- | --- | --- | --- | --- |
| production | Electron appData | `<appData>/Firefly` | userData | `userData/logs` | Firefly |
| 隔离档案 | isolationRoot | `isolationRoot/Firefly-<kind>` | `userData/session` | `userData/logs` | `Firefly-<kind>` |

路径校验使用 realpath/junction 解析和 `path.relative` 包含关系，处理 Windows 大小写、别名及 `..`，不使用字符串前缀判断。路径应用阶段在 mkdir 前再次检查所有权，并在安装 StorageContext 前验证 Electron 保留了所有指定路径。

### Windows 启动脚本

`start.bat "<absolute existing isolation directory>"` 只在该批处理调用中设置 `FIREFLY_ISOLATION_ROOT`，并启动当前仓库附带的 CLI。未提供参数时继承 `FIREFLY_ISOLATION_ROOT` 或既有显式 smoke 根；两者均缺失则说明要求并在启动前以状态码 1 退出。

CLI 仍选择 development；Main 仍验证目录存在性、绝对路径、生产重叠和规范路径越界。批处理显示子进程失败后返回其退出码。`setup.bat` 只构建项目，不创建或持久保存隔离根；新 shell 中双击启动仍需要继承明确的根目录。该流程不提供自动根目录或新的 production 启动模式。

## 2. StorageContext 与模块职责

config/data/state 根仍为 userData，只明确逻辑所有权，不迁移数据。cache 为 `userData/cache`，logs 为 `profile.logs`，session 为 `profile.sessionData`。文件归属如下：

- MCP 配置：`mcp-servers.json`
- token 状态：`token-usage.json`
- 安装内容保留清单：`content-manifest.json`
- Main 日志：`logs/firefly.log`

文件路径 getter 检查隔离所有权。该档案设计为 Memory 预留 `userData/memory/data`、`memory/index`、`memory/temp` 契约，并拒绝规范路径相同或互为祖先/后代的目录别名。此项设计本身不搬移既有 Memory 数据文件；默认 S/M/H 的运行边界另见[默认 S/M/H 验收记录](default-smh-acceptance.md)。

`storage-direct-access.json` 记录测试之外对 appData/userData/sessionData/logs 的字面量路径调用及未解析的动态 getPath 调用：

- `BOOTSTRAP_ALLOWED`：Electron 路径赋值和验证
- `MIGRATE_LATER`：仍使用既有调用方式的消费者
- `MIGRATE_NOW`：已调整的 MCP/token 直接 userData 查询，以及显式 logger/manifest 所有权；后两者使用注入或派生的根，而非直接 getPath

`npm run check:storage-boundary` 拒绝清单外新文件、调用预算增长和未批准的动态查询；build 在输出产物前执行此检查。该检查约束源码调用点，不构成对抗任意 JavaScript 行为的安全证明。

## 3. JSON 写入与安装内容保留

AtomicJsonStore 在写入前分别验证输入和序列化后的 JSON 结构，在替换前验证已有文档。ENOENT 读取仅返回内存默认值，不写回文件；无效 JSON 或结构保持原状，不自动恢复。

写入在同目录创建唯一、独占的临时文件，执行 flush/fsync 后通过 rename 替换主文件，不预先删除主文件。仅保留一个 `.bak`，内容为上一份有效字节。备份失败阻止主文件替换；主文件替换失败保留旧文档并清理自己创建的临时文件。不承诺断电时目录级持久性或多进程并发写入安全。Windows ACL 继承档案目录；支持的平台使用 mode 0600。

manifest 仍承担原生安装器的内容保留职责：`installer.nsh` 暂存 prompts/skills，core-bootstrap 在 Skills 启动前调用迁移，readManifest 比较分发哈希，writeManifest 更新当前所有者的文件。已有测试覆盖自定义和原生内容；不存在 shutdown 消费者。非生产档案不消费或删除安装器暂存数据，存储所有权调整不删除既有真实 manifest 文件。

## 4. MCP 密钥设计与未实施范围

MCP 当前持久保存 command/args/env 字符串，其中可能包含秘密。后续 secretRef 设计应绑定 profile、server、field，将受保护字节独立存储，仅在内存解析。优先使用 app ready 后的 Electron safeStorage，并依赖 Windows DPAPI、macOS Keychain 或 Linux 支持的秘密存储；不受保护、basic_text 或加密能力不可用时应拒绝，而非采用混淆。

DPAPI 不能隔离同一 Windows 用户下的其他应用。秘密记录及备份应使用用户 ACL，验证所有权和引用范围，对诊断脱敏，并禁止将 production 引用复制到 test/smoke。

本节为密钥存储设计审查，未执行真实秘密迁移、重加密或恢复。存储路径隔离及界面确认不等于 MCP Main 授权和输入验证完备；其缺口须在独立安全变更中处理，不能据本文宣称外部 MCP 已完成安全验收。

## 5. 变更与验收要求

运行档案变更应验证参数拒绝、目录规范化、生产重叠、Electron 路径保留及启动前失败；存储变更应验证 ENOENT 零写回、损坏文件保留、备份失败、替换失败与临时文件清理。对安装器内容保留和 MCP 秘密处理的验证分别记录，不以通用存储检查代替平台或外部服务验收。

原记录核对的运行版本为 Electron 43.1.0、Node 24.19.0；该版本信息不是新增验证结果。官方 API 依据：

- [Electron app.setPath](https://www.electronjs.org/docs/latest/api/app#appsetpathname-path)
- [Node.js 24 fs.writeFileSync](https://nodejs.org/docs/latest-v24.x/api/fs.html#fswritefilesyncfile-data-options)
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
