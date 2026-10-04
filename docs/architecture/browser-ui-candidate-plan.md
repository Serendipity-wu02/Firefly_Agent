# 浏览器/UI 本地候选整合与QA

任务基准：浏览器7a965436075e955c92922dc5a74aeddf4b78f821，已批准UI a3b060b6d8f10f0fe5ef39107c2d68c9ecfbda45。使用现有E盘worktree和依赖，不包含H integrator未提交presence probe或dce1db原生backend，不新增大型worktree/依赖副本。

- [x] 核对关系并在qa/browser-ui-offline-20261004本地整合；merge提交206889393e2c14dc368df702e95ed476b4b746cc。
- [x] TDD最小共享接线：Main只读browser availability、受限preload DTO、ChatPage单一Inspector浏览器入口。gate关闭，不创建真实guest/代理或导航；表单/历史/刷新不可用，明确真实状态，关闭/会话切换清空展示。
- [x] 联合定向/全量测试、Main/preload/renderer types及build；独立安全/质量审查。
- [x] 当前候选隔离profile实际Windows Electron GUI：现有布局、模型状态/设置、右侧文件树/真实fixture预览、浏览器不可用入口及安全匿名fixture交互。新截图本地保存，分别记录pass/fail/未运行/阻塞，不继承旧UI QA数字。
- [x] 本地提交并报告候选SHA、查看范围、限制；不push/远端merge/发布。

Ruling: merge仅两处文档add/add；保留浏览器分支更新的right-agent-workspace与browser-public-page-gate，产品源码自动合并。UI候选祖先中的已批准音乐Chat声明/头像/设置/model状态变更保留；不引入H后续或未提交改动。

Ruling: 真实网页服务仍缺可信TLS/公网DNS与全协议安全证据，因此本轮产品仅整合离线模块、可见浏览器入口及默认关闭状态；不安装真实BrowserService/login/navigation/shutdown消费者，避免在尚未验收的权限契约上开放真实guest。必要共享接线是Main只读状态→preload→现有单一Inspector，不新增模型/agent browser API。

Ruling: Computer Use SKILL及本地guidance/confirmations已读；当前工具无node_repl，无法运行@oai/sky。不调用自制Windows helper/PowerShell UIAutomation。使用用户明确提供的既有Playwright/Electron QA方案，对本候选真实渲染和Windows窗口作隔离验收；不宣称前台鼠标/键盘、系统tray原生验收。副作用守卫与隔离路径核验先于产品入口，不改用户窗口。

约束：无真实userData/模型/API/登录档案/外部服务，production gate始终关闭。匿名fixture仅QA入口与单独非persist Session；不为fixture扩大产品URL/证书/网络策略。已知重启未发送草稿为空、英文深色未实现、设置外部更新缓存及未知provider风险记录为既有缺口，不擅加持久化或扩大新功能。同一技术问题两次失败按用户约定Astra-medium诊断。原始日志/截图/QA记录留E盘。

完成记录：631files/6327passed/2skipped；联合25passed；四组types（含5测试文件）及build exit0；独立review无C/R/I；fresh GUI 11passed/1blocked/errors0，6逐张检查截图。详细证据见 docs/testing/browser-ui-candidate.md。最终SHA以交付结果为准。
