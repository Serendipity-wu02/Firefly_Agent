# 浏览器与已批准 UI 的本地候选验收

2026-10-04，现有隔离工作树 `E:\Codex\2026-10-04\task-4\audit-r3-r4`，分支 `qa/browser-ui-offline-20261004`。

合并基准 `206889393e2c14dc368df702e95ed476b4b746cc` 的两个 parent 为浏览器 `7a965436075e955c92922dc5a74aeddf4b78f821` 和已批准 UI `a3b060b6d8f10f0fe5ef39107c2d68c9ecfbda45`。仅两份 add/add 文档冲突保留较新的浏览器 Session/epoch 契约；产品源码自动合并。H 未提交 presence probe 和原生 backend `dce1db08dce74131375b0cde21ba360d4a4157f3` 未纳入。

## 可查看的产品行为

已有消息的 Chat/Work/Code 会话右上角有浏览器入口。它在既有单一 Inspector 中打开可关闭标签，和文件树、文件预览、Diff、计划共用布局。地址可编辑；前往、后退、前进、刷新和 Enter 导航不可用。明确显示“浏览器暂不可用：网络安全验证尚未完成。”关闭、收起面板或切换会话会释放该标签的本地地址草稿；聊天草稿沿用既有行为。

Main 通过既有 IpcScope 注册只读 `browser:availability`，preload 仅暴露 `manualBrowser.getAvailability()`，返回固定无权限信息 DTO `{available:false, reason:"network_unavailable"}`。没有开启 gate、URL 导航、创建 guest、布局控制、代理凭据或模型 browser API。此候选未装配真实 BrowserService/navigation/login/shutdown 消费者，因此不能宣称产品可以浏览网页；既有网络 gate 保持关闭。

## 自动验证

新行为保留两轮 RED→GREEN：共享 DTO/关闭面板初始 5 failed/15 passed，随后 20 passed；实际 Inspector 接线初始 1 failed/1 passed，随后联合 22 passed。补充真实 preload import 回归纳入最终定向和全量测试。

- 产品 Main/preload/renderer `tsc -p tsconfig.<part>.json --noEmit` 均 exit 0。
- `npm run build` exit 0；仅既有 Vite 大 chunk 提示，未改变阈值或 CI。
- 额外测试严格类型配置最初位于 worktree 外，`vite/client` 相对解析失败；修正脚本普通 `require.resolve` 又无法命中 Vite 的 types-only export。按两次失败约定由 Astra-medium 只读诊断，实际绝对 `vite/client.d.ts` 加已安装 `@types` 后检查五个测试文件。失败日志保留，未复制依赖或改变项目配置。
- 最终定向/测试类型/全量结果见下方完成记录及原始日志。

独立审查 `session_epoch_security_review` 对 merge HEAD 之上所有接线和新增测试只读复审：未发现 Critical / Required / Important；自行 `git diff --check` 通过，并检查宽/最小窗口截图。此前 domain 模块审查结论未重复当作新 GUI 通过项。

## 本轮新 GUI 证据

Windows Electron 使用本轮全新 smoke profile：`E:\Codex\2026-10-04\task-4\browser-ui-gui\profile`。QA wrapper 在产品入口前验证实际 appData/userData/sessionData/logs 均在该目录；使用现有已安装 Playwright/Electron，构建输出 junction 指向当前候选自己的 dist，没有新 worktree 或依赖副本。全部 QA 窗口隐藏、不可聚焦；外部网络、系统对话框、原生菜单、快捷键和前台激活均被守护阻止。只读取自己的 renderer，不访问真实 userData/模型/API/登录或用户窗口。

11 项限定范围通过、0 失败、1 受阻；renderer errors 0；6 张新截图均来自带序号/尺寸/3px freshness marker 验证的实际 Electron offscreen paint，并由主代理逐张 view_image 检查。前后 GetForegroundWindow 采样句柄相同；这仅是采样证据，不证明整个运行过程中 OS 前台输入通过。

| 范围 | 本轮结果 |
| --- | --- |
| 全新隔离路径和非聚焦窗口 | PASS |
| 现有历史、头像、侧栏和会话内聊天草稿 | PASS |
| 实际 Main→preload 不可用 DTO、单一 Inspector | PASS |
| 地址 Enter、4 个禁用命令、零网络尝试、Tab/ShiftTab | PASS |
| 关闭重开不复活地址，保留聊天草稿 | PASS |
| 会话 A→B→A 不复活标签或地址 | PASS |
| pending Main 查询关闭后迟到回复不复活标签 | PASS（只临时替换 QA availability handler 的响应时序，随后恢复原 handler） |
| 真实绑定 fixture 文件树/预览，与浏览器共存及关闭回退 | PASS |
| 960×540 下关闭/入口可命中、输入框可见、无文档横向溢出 | PASS |
| 未验证 API 状态打开真实设置，无自动 transport | PASS |
| 单独匿名 about:blank 本地 fixture 绘制 | PASS（QA-only 守护 BrowserWindow；不是产品 browser guest 或网络验收） |
| 真实网络/native guest 和 OS 前台/tray | BLOCKED |

本地证据根 `E:\Codex\2026-10-04\task-4\browser-ui-gui`：`result-reviewed.json`、原始 `result.json`/`progress.json`/`driver.log`、`actual-paths.json`、`initial process/paint metadata`（含于 JSON）、`bootstrap.cjs`/`run.cjs` 和 6 张 PNG。原始 settings 记录的 `status` 曾被 lamp 值 `unverified` 覆盖，reviewed JSON 仅将该值改名 `lampState` 并记录修正，原始日志保留，没有重跑或改变检查结果。脚本已修正字段以避免后续报告歧义。

截图：`01-current-ui-wide.png`、`02-browser-unavailable-wide.png`、`03-current-file-preview.png`、`04-browser-minimum.png`、`05-current-api-settings.png`、`06-anonymous-local-fixture.png`。全部仅在本地保存，没有上传、推送、PR、部署或远程合并。

## 未验证和保留的限制

真实网页导航、登录、下载、证书/公共 DNS 及实际 BrowserService/native guest 生命周期未验收，production gate 继续 HOLD。Computer Use 技能及 guidance/confirmations 已读取，但当前无 node_repl，故按用户授权使用现有 Playwright/Electron 守护 QA；原生前台鼠标/键盘、tray、原生 tooltip 未运行。真实模型/API 未运行。英文/深色、外部 Main 配置更新缓存和未知 provider 风险、跨进程未发送草稿持久化是既有范围限制，本轮没有补持久化或扩大设计。未涉及 R1 目录边界、原生 H backend、朋友圈、目录迁移、新记忆或 CI 门禁。

## 完成记录

最终定向 5 files / 25 tests passed，exit 0；全量 631 files passed / 6327 tests passed / 2 skipped（6329 total），404.23s，exit 0。五个新增/相关测试严格类型检查 exit 0。三组产品类型、build、独立审查、GUI 结果如上。运行全量使用已核验 `FIREFLY_TEST_BASH=E:\Git\bin\bash.exe` 和 task-4 TEMP/TMP/RUNNER_TEMP；正式沙箱升级仅使既有 Windows 测试可清理自身进程，没有修改测试或 CI。

可追溯原始文本记录、GUI driver/守护 wrapper/JSON、严格测试配置和 SHA256 manifest 位于 `docs/testing/fixtures/browser-ui-candidate`。截图仍只在本地证据根。生产源码自最终测试/build/GUI 起未再变更；提交仅附加验收记录。候选完整提交 SHA 由最终交付与 `git rev-parse HEAD` 读取，避免文档自引用。
